# 2. Backend: persistencia, fotos (compresion, validacion, almacenamiento)

> Auditoria del flujo de guardado del check-in del alumno en `/c/[coach_slug]/check-in`. Enfasis backend: que datos llegan, que se valida, como se persiste en `check_ins`, como se suben/firman/protegen las fotos en Supabase Storage, y la compresion/validacion de imagenes. Todo verificado contra el codigo y contra el estado LIVE en prod (buckets, RLS de `check_ins` y de `storage.objects`).

---

## 2.0 Mapa de archivos y responsabilidades

- `apps/web/src/app/c/[coach_slug]/check-in/_actions/check-in.actions.ts` — server action `submitCheckinAction` (parseo, validacion Zod, subida de fotos, INSERT en `check_ins`, revalidate).
- `apps/web/src/app/c/[coach_slug]/check-in/CheckInForm.tsx` — `'use client'`, arma el `FormData`, comprime en cliente con `browser-image-compression`, dispara la action.
- `apps/web/src/app/c/[coach_slug]/check-in/_data/check-in.queries.ts` — `getCheckInPageData` (RSC, lee `lastCheckIn` y color del coach).
- `packages/schemas/client.ts` — `CheckInSchema` (Zod, validacion compartida cliente+servidor), reexportado por `@eva/schemas`.
- `apps/web/src/lib/storage/image-compress.ts` — `compressImageToWebp` (compresion server-side best-effort con `sharp`).
- `apps/web/src/lib/storage/checkin-photos.ts` — `resolveCheckinPhotoUrls` / `toCheckinPath` (firma de URLs para que el coach vea las fotos del bucket privado).
- `apps/web/src/services/client/client-detail.service.ts` — lado coach: lee `check_ins`, firma fotos, y `markCheckInReviewed` (setea `reviewed_at`/`reviewed_by`).
- Migraciones: `00000000000001_baseline.sql` (tabla `check_ins`), `20260601000600_check_ins_reviewed_at.sql`, `20260530170000_fix_checkins_rls_leak.sql`, `20260521000004_storage_buckets.sql`, `20260525181500_storage_workspace_policies.sql`, `20260608120200_tighten_checkins_bucket.sql`, `_POST_DEPLOY_20260608200000_checkins_backfill_paths.sql`, `_POST_DEPLOY_20260608200100_checkins_bucket_private.sql`.

> **Hallazgo transversal (ojo para el rediseño):** `apps/web/src/lib/uploads/image-validation.ts` y `image-validation.server.ts` (validacion de magic bytes + dimensiones via `sharp`) **NO se usan en el flujo de check-in del alumno**. Verificado: sus unicos consumidores son `apps/web/src/app/coach/exercises/_actions/exercise-media.actions.ts` (subida de media de ejercicios por el coach) y su test. El check-in **no valida magic bytes ni dimensiones reales** — solo confia en Zod (`file.type` + `file.size`) y en el limite de MIME/tamano del bucket. Detalle en §2.6.

---

## 2.1 `submitCheckinAction` — la server action que guarda el check-in

Firma: `submitCheckinAction(_prev: CheckinState, formData: FormData): Promise<CheckinState>`. Es una server action (`'use server'`) consumida via `useActionState` desde `CheckInForm`. `CheckinState = { error?: string; success?: boolean }`.

### Datos que recibe (FormData -> objeto `raw`)

Extrae del `FormData` y normaliza:

```
weight        = String(formData.get('weight') ?? '').replace(',', '.')   // coma decimal -> punto
energy_level  = formData.get('energy_level')
notes         = formData.get('notes')
photo         = formData.get('photo')        // File | null  (foto frontal)
back_photo    = formData.get('back_photo')   // File | null  (foto espalda/perfil)
```

- El `weight` se sanea **dos veces** contra coma decimal: en el cliente (`onChange` del input hace `value.replace(',', '.')`) y de nuevo aqui en el server (`String(...).replace(',', '.')`). Esto importa para Chile/latam donde se escribe "75,5". Tras el replace, Zod hace `z.coerce.number()`.
- Solo hay **2 fotos** en el flujo de escritura: `photo` (front) y `back_photo`. La tabla y el resolver tambien contemplan `side_photo_url` (ver §2.5/§2.7) pero **este formulario nunca escribe `side`** — queda como campo legacy/futuro.

### Validacion (Zod — `CheckInSchema` de `packages/schemas/client.ts`)

```
weight:       z.coerce.number().min(20).max(400)         // OBLIGATORIO. kg, rango 20–400
energy_level: z.coerce.number().min(1).max(10)            // OBLIGATORIO. 1–10
notes:        z.string().max(1000).optional()             // opcional, tope 1000 chars
photo:        fileField (opcional)
back_photo:   fileField (opcional)
```

`fileField` (compartido) valida cada archivo con dos `.refine`:
- Tamano: `!file || file.size === 0 || file.size <= 5MB` (`MAX_FILE_SIZE = 5 * 1024 * 1024`). Mensaje: "El tamaño máximo de imagen es 5MB."
- Tipo declarado: `ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']`, comparado contra **`file.type`** (el MIME que reporta el browser, no el contenido). Mensaje: "Solo se aceptan formatos .jpg, .jpeg, .png y .webp."
- `.optional()` y los guards `!file || file.size === 0` hacen que **ambas fotos sean opcionales** (un check-in solo de peso+energia es valido).

Si `safeParse` falla, la action retorna `{ error: parsed.error.issues[0].message }` (solo el primer mensaje) y **no toca DB ni Storage**.

> **Gotcha de validacion (rediseño):** el `weight` ya viene `.replace(',', '.')` desde el server **antes** del schema, pero `notes`, `photo`, `back_photo` se pasan crudos del `FormData`. `z.coerce.number()` sobre `weight: ''` (vacio) da `NaN` -> falla `min(20)` -> error "Number must be greater than or equal to 20" (peso es de-facto obligatorio; el UI ademas bloquea "Continuar" sin peso). No hay validacion de NaN explicito ni mensaje custom en español para el rango.

### Identidad (auth.uid) — NO viene del body

```
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return { error: 'No autenticado.' }
```

- La identidad sale **siempre de la sesion** (`auth.getUser()`), nunca del `FormData`. El `client_id` que se persiste es `user.id`. Esto respeta la regla del proyecto (NUNCA leer identidad del body).
- Nota: la action usa `getUser()` (round-trip a GoTrue), no `getClaims()`. La query RSC del mismo modulo (`getCheckInPageData`) si usa `getClaims()` (verificacion local del JWT). En el rediseño se podria homogeneizar a `getClaims()` en la action para ahorrar el round-trip, pero `getUser()` es la opcion conservadora/segura.

### Como persiste (cliente Supabase usado para escribir)

- Para **escribir las fotos y el INSERT** usa `createServiceRoleClient()` (`adminDb`), que **bypasea RLS**. Es decir: el guardado NO depende de las policies `check_ins_client` ni `checkins_client_insert` del usuario; el aislamiento lo garantiza el codigo (siempre escribe `client_id = user.id` y sube a la carpeta `user.id/`).
- Hay un cliente con sesion (`createClient()`) que se usa **solo** para resolver la identidad (`getUser`). Toda la escritura va por service-role.

### INSERT en `check_ins`

```
await adminDb.from('check_ins').insert({
    client_id:        user.id,        // identidad de la sesion
    weight:           parsed.data.weight,
    energy_level:     parsed.data.energy_level,
    notes:            parsed.data.notes || null,   // '' -> null
    front_photo_url:  photoPath,       // PATH del storage (no URL), o null
    back_photo_url:   backPhotoPath,   // PATH del storage (no URL), o null
})
```

- **Siempre INSERT, nunca UPSERT**: cada check-in es una fila nueva e inmutable (historial mensual). No hay deduplicacion por fecha; el alumno podria mandar dos en el mismo dia y quedan dos filas.
- `notes || null`: string vacio se guarda como `NULL` (limpieza de datos).
- `front_photo_url`/`back_photo_url` guardan el **PATH del objeto en Storage** (ej. `<uid>/<ts>-<rand>.webp`), **no** la URL publica ni firmada. Decision P2 (ver §2.5): el path es estable y se firma en lectura, lo que permitio flipear el bucket a privado sin romper imagenes.
- Columnas que el INSERT **no** setea y toman default/NULL: `id` (uuid v4), `date` (`now()`), `created_at` (`now()`), `side_photo_url` (NULL), `reviewed_at` (NULL = sin revisar), `reviewed_by` (NULL).

### Manejo de errores

- Error al subir foto front o back -> retorna `{ error: 'Error al subir la imagen de progreso.' }` y **aborta antes del INSERT** (no queda fila huerfana sin la foto que el usuario adjunto).
- Error en el INSERT -> `{ error: 'Error al guardar el reporte: ' + insertError.message }`. **Expone el mensaje crudo de Postgres** al cliente (info leak menor; en el rediseño conviene loguear server-side y devolver mensaje generico).
- Orden de operaciones: **primero suben las fotos, despues el INSERT**. Si las fotos suben OK pero el INSERT falla, quedan **objetos huerfanos en Storage** sin fila que los referencie (no hay rollback ni cleanup). Punto a considerar en el rediseño (subir despues del INSERT, o limpiar en catch).

### Revalidacion (Next cache)

```
revalidatePath('/c', 'layout')                 // refresca toda la zona del alumno (dashboard muestra ultimo check-in)
revalidatePath(`/coach/clients/${user.id}`)    // refresca la ficha del alumno en el panel del coach
```

- Retorna `{ success: true }`. No redirige; el `CheckInForm` muestra pantalla de exito + confetti al ver `state.success`.
- El path del coach se construye con `user.id` (que es el `client_id`); coincide con la ruta `/coach/clients/[clientId]`.

---

## 2.2 `uploadToCheckinsBucket` — subida de una foto al bucket

Helper interno de la action. Firma: `(adminDb, userId, file, variant: 'front' | 'back')` -> `{ ok: true; path } | { ok: false; message }`.

### Naming / path de los objetos

```
timestamp = Date.now()
rand      = Math.random().toString(36).substring(7)
filePath  = variant === 'back'
              ? `${userId}/${timestamp}-back-${rand}.${extension}`
              : `${userId}/${timestamp}-${rand}.${extension}`
```

- **Scoping por carpeta = `userId`** (el `auth.uid`). Esto es lo que hace cumplir las RLS de `storage.objects` (`(storage.foldername(name))[1] = auth.uid()::text`): cada alumno solo puede tocar `su-uid/...`. (Aunque el upload va por service-role, el path respeta la convencion para que las policies del propio alumno tambien apliquen al leer/borrar.)
- Front vs back se distinguen por el infijo `-back-` en el nombre. **No hay variante `side`** en la escritura.
- `timestamp + rand` -> nombres unicos. `upsert: false` -> **jamas pisa** un objeto existente (fotos inmutables; una nueva subida nunca sobreescribe).
- `extension`: si la compresion funciono = `'webp'`; si fallo = la extension original derivada de `file.name.split('.').pop() || 'jpg'`.

### Upload a Storage

```
adminDb.storage.from('checkins').upload(filePath, body, {
    cacheControl: '3600',
    upsert: false,
    ...(compressed ? { contentType: compressed.contentType } : {}),  // 'image/webp'
})
```

- `body` = `compressed.buffer` (Buffer WebP) si comprimio, o el `File` original si no.
- **`contentType` OBLIGATORIO con Buffer**: el comentario del codigo lo marca explicito — sin `contentType`, un `Buffer` se sube como `application/json` y **rompe el render** (el browser no lo trata como imagen). Solo se setea cuando hay `compressed` (Buffer); con el `File` original, el SDK infiere el tipo del propio `File`.
- Retorna el **path** (`uploadData.path`), no la URL publica. Comentario en codigo (P2): se guarda el path para poder flipear el bucket a privado sin romper imagenes.
- Cualquier `uploadError` -> `{ ok: false, message: 'Error al subir la imagen de progreso.' }` (mensaje generico, no expone el error de Storage).

---

## 2.3 Compresion: doble compresion (cliente + servidor)

Hay **dos** etapas de compresion, una en cliente y otra en server. Importante para el rediseño porque se solapan.

### Compresion en cliente — `browser-image-compression` (en `CheckInForm.tsx`)

Antes de armar el `FormData`, por cada foto seleccionada:

```
const compressed = await imageCompression(frontFile, {
    maxSizeMB: 2,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
})
formData.set('photo', compressed, frontFile.name)   // conserva el nombre original
```

- Objetivo: <= 2 MB, lado mayor <= 1920 px, en web worker (no bloquea UI). Mantiene el **formato original** (no fuerza WebP en cliente) y el nombre original del archivo.
- Si la compresion cliente lanza (`catch`), `handleAction` solo hace `setIsSubmitting(false)` y **no envia nada** — el check-in no se manda si la compresion cliente falla (a diferencia del server, que es best-effort).

### Compresion en servidor — `compressImageToWebp` (`lib/storage/image-compress.ts`)

Se ejecuta dentro de `uploadToCheckinsBucket` sobre lo que llego (que ya viene comprimido por el cliente). Usa `sharp` (carga dinamica `await import('sharp')`):

```
sharp(input, { limitInputPixels: 50_000_000, failOn: 'none' })
    .rotate()                                              // auto-orienta segun EXIF
    .resize(1080, 1080, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer()
```

Parametros (defaults de la firma `compressImageToWebp(file, maxDim = 1080, quality = 80)`):
- **Formato salida: WebP** (`contentType: 'image/webp'`, `ext: 'webp'`).
- **Dimension max: 1080 px** lado mayor, `fit: 'inside'` (no deforma) + `withoutEnlargement: true` (no agranda imagenes ya chicas).
- **Calidad: 80**.
- `.rotate()` sin args = auto-orienta desde EXIF (clave: fotos de celular salen rotadas si no se aplica).
- `limitInputPixels: 50_000_000` = defensa image-bomb ligera a nivel de decode.
- `failOn: 'none'` = sharp **no aborta** ante warnings/errores recuperables del input.

**Filosofia best-effort (NUNCA tira):** si sharp falla (HEIC sin libheif, archivo corrupto, OOM en compute Micro, input no-imagen) o devuelve buffer vacio, `compressImageToWebp` **devuelve `null`** (envuelto en try/catch con `console.warn`). El caller entonces sube el **archivo original**. Razon documentada: la UX del alumno es one-shot (no reintenta), asi que jamas se aborta el check-in por un fallo de compresion. Las filas viejas (.jpg/.png) no se tocan.

> **Consecuencia (rediseño):** el doble paso comprime dos veces (cliente a ~2MB/1920px manteniendo formato, server a WebP/1080px/q80). El resultado tipico en Storage es **WebP <= 1080px**, salvo cuando sharp falla -> se sube el original ya pre-comprimido por el cliente (formato original, hasta ~2MB/1920px). Es redundante pero deliberado (defensa en profundidad + menos egress porque se guarda chico una sola vez, sin transforms por-request).

---

## 2.4 Validacion de imagenes — que SI y que NO se valida

Capas reales en el flujo de check-in del alumno:

1. **Cliente (`CheckInForm.validateAndSetFile`)** antes de previsualizar: chequea `file.type` contra `ALLOWED_TYPES` (jpeg/jpg/png/webp) y `file.size > 5MB`. Mensajes en español ("Formato no permitido. Solo JPG, PNG o WEBP." / "La imagen pesa más de 5MB."). Es UX, trivialmente evitable.
2. **Zod (`CheckInSchema.fileField`)** en server: re-valida `file.size <= 5MB` y `file.type ∈ {jpeg,jpg,png,webp}`. Sigue siendo **MIME declarado por el browser** (`file.type`), spoofeable cambiando la extension/Content-Type.
3. **Limite del bucket (Storage, LIVE)**: `file_size_limit = 5242880` (5MB) y `allowed_mime_types = ['image/jpeg','image/jpg','image/png','image/webp']`. Esta es la unica capa que el cliente **no** controla — Storage rechaza el `upload` si el `contentType` no esta en la lista o si excede 5MB. Pero valida el `contentType` declarado en el upload, no el contenido binario.
4. **`sharp` en compresion**: al decodificar para comprimir, un input que no es imagen real hace fallar sharp -> `null` -> se sube el original. O sea sharp **no rechaza**: degrada a "subir el original". No es una barrera de seguridad aqui.

**Lo que NO se valida en el check-in (a diferencia del flujo de exercise-media del coach):**
- **NO** hay verificacion de **magic bytes** (`validateImageMagicBytes`) — no se inspeccionan los primeros 12 bytes para confirmar el tipo real anti-spoofing de extension.
- **NO** hay validacion de **dimensiones** reales via `validateImageDimensions` (min/max width/height, maxPixels image-bomb estricto).
- Esos helpers existen y son robustos (ver §2.6) pero **solo los usa `coach/exercises`**, no el alumno.

> **Recomendacion fuerte para el rediseño:** las fotos de check-in son dato de salud sensible (Ley 19.628 / 21.719, citado en las migraciones). Hoy el alumno sube imagenes con validacion solo por MIME-declarado. Conviene portar `validateImageMagicBytes` + `validateImageDimensions` (server-side, fail-closed) al flujo de check-in para tener paridad de hardening con exercise-media (anti-spoofing real + defensa image-bomb por dimensiones, no solo `limitInputPixels`).

---

## 2.5 Storage: bucket, scoping, paths y URLs firmadas

### El bucket `checkins` (estado LIVE verificado en prod)

```
id/name:            checkins
public:             false        ← PRIVADO (flip P2.4 ya aplicado en prod)
file_size_limit:    5242880      (5 MB)
allowed_mime_types: image/jpeg, image/jpg, image/png, image/webp
type:               STANDARD
```

Evolucion (migraciones):
- `20260521000004_storage_buckets.sql` lo creo originalmente **publico** (`public: true`) con limite 5MB y MIME-lock.
- `20260608120200_tighten_checkins_bucket.sql` elimino la policy `"Public checkin images are viewable by everyone"` (que permitia a cualquiera **enumerar/listar** todas las fotos via storage API) — superficie de enumeracion cerrada.
- `_POST_DEPLOY_20260608200100_checkins_bucket_private.sql` flipeo `public = false`. **Confirmado LIVE: el bucket es privado hoy.** Con bucket privado, `getPublicUrl` ya no sirve — las fotos solo se ven via **signed URLs**.

### RLS del bucket sobre `storage.objects` (LIVE verificado)

Policies activas para `checkins`, todas `TO authenticated` y scoped a la carpeta propia `(storage.foldername(name))[1] = auth.uid()::text`:
- `checkins_client_select` (SELECT) — el alumno solo lista/lee objetos de **su** carpeta.
- `checkins_client_insert` (INSERT, WITH CHECK).
- `checkins_client_update` (UPDATE).
- `checkins_client_delete` (DELETE).
- (Duplicados legacy presentes en prod con la misma semantica: `Authenticated users can upload checkin images`, `Users can update/delete their own checkin images`.)

Consecuencias clave de scoping:
- **El coach NO tiene policy de SELECT sobre `storage.objects` del bucket** (su `auth.uid` no coincide con la carpeta del alumno). Por eso el coach **no puede** leer ni firmar fotos con su sesion; las firma **via service-role** (ver §2.5 signing y §2.7).
- Org admin / otros usuarios autenticados: sin acceso al objeto.

### Path -> URL firmada (`lib/storage/checkin-photos.ts`)

Como las columnas guardan el **path**, hay un chokepoint unico para convertir path -> URL firmada en lectura:

- `BUCKET = 'checkins'`, `SIGNED_TTL_SECONDS = 600` (URL firmada valida 10 min).
- **Cache en proceso** (`Map<path, {url, expiresAt}>`) con `CACHE_TTL_MS = (600 - 60) * 1000` (9 min): reusa firmas entre re-renders para no regenerar (amigable con egress/CDN). El cache es por instancia de servidor (no compartido, no persistente).
- `toCheckinPath(stored)`: normaliza un valor guardado a un path de bucket. **Dual-read** — maneja tanto paths nuevos como URLs publicas/firmadas legacy:
  - Regex `\/object\/(?:public|sign|authenticated)\/checkins\/([^?]+)` extrae el path de una URL completa legacy (y `decodeURIComponent`).
  - Si es una URL `http(s)` externa desconocida -> `null` (la UI no muestra img rota).
  - Si es un path crudo -> limpia slashes iniciales (`replace(/^\/+/, '')`).
- `signPaths(admin, paths)`: revisa cache, junta los que faltan, y llama **`admin.storage.from('checkins').createSignedUrls(need, 600)`** (batch). El `admin` debe ser service-role (puede firmar cualquier path; los coaches no tienen storage SELECT). Cachea cada firma.
- `resolveCheckinPhotoUrls(admin, rows)`: por cada fila reemplaza los campos foto por la URL firmada lista para render. Campos que toca: `PHOTO_FIELDS = ['front_photo_url', 'back_photo_url', 'side_photo_url']` (incluye `side_photo_url` aunque la escritura nunca lo llene). Devuelve copia shallow; filas sin foto pasan intactas.
- `resolveCheckinPhotoUrl(admin, value)`: variante single-value (ej. una sola foto del ultimo check-in).

### Migracion de datos (paths) — backfill

`_POST_DEPLOY_20260608200000_checkins_backfill_paths.sql`:
- Crea backup `public.check_ins_photo_url_backup` (id, front, back) de las filas con URLs `http%` (reversible).
- `regexp_replace` convierte las URLs publicas completas legacy en `check_ins.front_photo_url`/`back_photo_url` a **paths** (quita `https://.../storage/v1/object/(public|sign|authenticated)/checkins/`).
- Orden documentado: (1) deploy del signing en web+mobile, (2) verificar render, (3) backfill, (4) verificar, (5) flip privado. Es POST-DEPLOY para no romper apps viejas que renderizaban el valor crudo como `<img src>`.

---

## 2.6 `image-validation.ts` / `image-validation.server.ts` (NO en check-in, pero relevante para el rediseño)

Estos archivos implementan el hardening "bueno" que el check-in **no** usa hoy (solo `coach/exercises`). Vale documentarlos porque el rediseño deberia adoptarlos para las fotos del alumno.

### `image-validation.ts` (limites + magic bytes)

- `EXERCISE_MEDIA_LIMITS`: `maxBytes = 2MB` (estaticas), `gifPreCompressMaxBytes = 8MB`, `maxWidth/maxHeight = 4096`, `maxPixels = 8_000_000` (defensa image-bomb), `minWidth/minHeight = 100`, `coachQuotaBytes = 50MB` (cuota por coach).
- `EXERCISE_MEDIA_MIME`: gif, jpeg, png, webp.
- `validateImageMagicBytes(file)`: inspecciona los **primeros 12 bytes** y compara contra magic numbers reales (GIF `47 49 46 38`, JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF....WEBP`). Comentario explicito: **NO confia en `file.type` ni en la extension — solo el contenido binario decide.** Esto es exactamente el anti-spoofing que al check-in le falta.
- `extToKind` / `KIND_TO_EXT`: mapeos MIME<->extension.

### `image-validation.server.ts` (dimensiones via sharp)

- `validateImageDimensions(buffer)`: decodifica metadata con `sharp` (`limitInputPixels: maxPixels = 8M`). Valida min/max width-height y `w*h <= maxPixels`.
- **FAIL-CLOSED**: si `sharp` no carga, **rechaza** la imagen (no la deja pasar sin validar) — opuesto al best-effort del compresor de check-in (que ante fallo de sharp sube el original). Diferencia de filosofia importante: el check-in prioriza "no perder el check-in del alumno"; exercise-media prioriza "no aceptar nada inseguro".

> **Tension de diseño a resolver en el rediseño:** check-in usa sharp en modo best-effort/fail-open (no rechaza), exercise-media en modo fail-closed (rechaza). Si se porta la validacion estricta al check-in, hay que decidir conscientemente el comportamiento ante fallo de sharp para fotos de salud (recomendado: validar magic bytes -- que NO depende de sharp -- siempre, y mantener la compresion best-effort solo para el resize/webp).

---

## 2.7 Modelo de la tabla `check_ins` e invariantes

### Esquema (LIVE, baseline + migracion `reviewed_at`)

```
id              uuid        PK   default uuid_generate_v4()
client_id       uuid        NOT NULL   FK -> clients(id) ON DELETE CASCADE
date            timestamptz NOT NULL   default now()
weight          numeric(5,2)           -- nullable a nivel DB (Zod lo exige en escritura)
energy_level    integer                -- CHECK (1..10)
front_photo_url text                   -- guarda PATH del storage, no URL
notes           text
created_at      timestamptz NOT NULL   default now()
back_photo_url  text                   -- guarda PATH
reviewed_at     timestamptz            -- NULL = no revisado por el coach
reviewed_by     uuid        FK -> coaches(id) ON DELETE SET NULL
```

- `side_photo_url` aparece en `PHOTO_FIELDS` del resolver pero **NO existe como columna en el baseline ni en migracion** que haya encontrado (la escritura nunca la setea y el resolver la lee defensivamente). Es campo fantasma/futuro a nivel codigo; el rediseño deberia decidir si lo materializa (3 fotos: front/back/side) o lo elimina del resolver.
- Constraint `check_ins_energy_level_check`: `energy_level BETWEEN 1 AND 10` (defensa a nivel DB, redundante con Zod).
- `weight numeric(5,2)`: hasta 999.99 a nivel DB; Zod lo acota a 20–400.
- Indices: `idx_check_ins_client_id`, `idx_check_ins_client_id_created_at` (`client_id, created_at DESC` — sirve al `lastCheckIn` y a los listados del coach), `idx_check_ins_date`, `idx_check_ins_reviewed_at`.
- FK `client_id ... ON DELETE CASCADE`: borrar el alumno borra sus check-ins (las fotos en Storage **no** se borran en cascada — quedarian huerfanas; punto de retencion/GDPR a considerar).

### RLS de la tabla (LIVE verificado)

Tres policies activas:
- `check_ins_client` (ALL, `authenticated`): `client_id = auth.uid()` en USING y WITH CHECK -> el alumno gestiona solo los suyos.
- `check_ins_coach` (ALL, `authenticated`): existe via `clients c WHERE c.id = check_ins.client_id AND c.coach_id = auth.uid()` -> el coach dueño del alumno lee/gestiona los check-ins de sus alumnos.
- `team_check_ins_member_all` (ALL, `public`): policy del modo team (pool plano de coaches) — acceso de miembros del team.

Historia de seguridad (`20260530170000_fix_checkins_rls_leak.sql`): habia una policy `"Enable read access for authenticated users"` con `qual = true` que dejaba a **cualquier usuario logueado leer TODOS los check-ins de la plataforma** (fotos, peso, notas — dato de salud sensible). Como las policies PERMISSIVE se evaluan con OR, anulaba el aislamiento. Esa migracion la elimino y borro duplicados redundantes. Org admin (member sin `coach_id`) **no** ve check-ins individuales por diseño de privacidad.

> Nota: el GRANT de tabla en baseline es amplio (`GRANT ALL ... TO anon/authenticated/service_role`), pero el acceso real lo gobierna RLS (las policies arriba). El INSERT de la action no depende de esto porque va por service-role.

### Marcar como revisado — `markCheckInReviewed` (lado coach)

`services/client/client-detail.service.ts`:
```
supabase.from('check_ins')
  .update({ reviewed_at: now, reviewed_by: user.id })
  .eq('id', checkInId).eq('client_id', clientId)
  .is('reviewed_at', null)         // idempotente: solo el primer review setea el timestamp
```
Valida que el coach es dueño del alumno bajo el workspace activo. Alimenta la metrica de "tiempo de respuesta" del coach/org. Usa el cliente con sesion (sujeto a la policy `check_ins_coach`), no service-role.

### Invariantes a preservar en el rediseño

1. **Bucket privado**: las fotos NUNCA se sirven por URL publica; siempre signed URL (TTL 600s) via service-role en el chokepoint `resolveCheckinPhotoUrls`. No re-introducir `getPublicUrl`.
2. **Scoping por carpeta `auth.uid`**: el path SIEMPRE empieza con `userId/` para que las RLS de `storage.objects` apliquen. Mantenerlo aunque el upload sea service-role.
3. **Path, no URL, en DB**: persistir el path del objeto (permite firmar y flipear visibilidad). El dual-read de `toCheckinPath` cubre filas legacy con URL completa.
4. **`client_id` desde la sesion**, jamas del body. Idem `reviewed_by` (del coach autenticado).
5. **No exposicion de PII a roles ajenos**: org admin y otros authenticated no leen check-ins; el coach solo los de sus alumnos (policy `check_ins_coach`). El coach no tiene SELECT sobre `storage.objects` -> firma por service-role.
6. **One-shot best-effort en fotos**: el fallo de compresion NO debe abortar el check-in (sube original). El fallo de upload SI aborta antes del INSERT (no fila sin foto adjuntada).
7. **Inmutabilidad de objetos**: `upsert: false` + nombres con timestamp+rand. Una foto subida nunca se pisa.
8. **`energy_level` 1–10 y `weight` 20–400** validados en Zod + CHECK DB (energy). Mantener doble barrera.

---

## 2.8 Resumen de gaps / riesgos backend para el rediseño

- **Validacion debil de imagenes en el alumno**: solo MIME declarado (`file.type`) + tamano; sin magic bytes ni dimensiones reales. Los helpers robustos (`validateImageMagicBytes`, `validateImageDimensions`) existen pero solo los usa el coach. Portarlos (con decision explicita fail-open/fail-closed). Dato de salud sensible.
- **Objetos huerfanos en Storage**: si el INSERT falla tras subir fotos, los objetos quedan sin referencia y sin cleanup. Y al borrar un alumno (CASCADE en DB) las fotos no se borran de Storage.
- **`insertError.message` crudo al cliente**: info leak menor; loguear server-side y devolver mensaje generico.
- **Doble compresion** (cliente browser-image-compression + server sharp): redundante; evaluar quedarse solo con la server-side WebP (mas consistente, controlada) o documentar el porque del doble paso.
- **`side_photo_url` fantasma**: leida por el resolver, nunca escrita, no existe como columna. Materializar (3ra foto) o limpiar.
- **`getUser()` en la action vs `getClaims()` en la query**: inconsistencia menor; `getClaims()` ahorraria un round-trip.
- **Sin dedup por fecha**: el alumno puede mandar multiples check-ins el mismo dia (filas duplicadas). Decidir si el rediseño impone un check-in por periodo.
