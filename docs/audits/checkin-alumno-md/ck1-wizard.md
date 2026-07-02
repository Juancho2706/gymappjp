# 1. Pantalla de check-in y wizard de 3 pasos

> Auditoría del check-in del alumno para rediseño con feature parity. Énfasis en backend (qué datos llegan, qué se valida, cómo se guarda en `check_ins` y en Storage `checkins`, compresión y validación de imágenes). Frontend solo a nivel funcional.

---

## 1.1 Qué es el check-in y cuándo se invita

El check-in es el **seguimiento mensual de progreso** que el alumno auto-registra y que su coach revisa. Captura cuatro tipos de datos:

- **Peso corporal** (kg)
- **Nivel de energía** subjetivo (escala 1–10)
- **Fotos de progreso** (frontal y espalda/perfil, ambas opcionales)
- **Notas** opcionales para el coach (máx. 1000 caracteres)

Ruta: `/c/[coach_slug]/check-in` (white-label del alumno). El header de la página (`page.tsx`) muestra título "Check-in Mensual", subtítulo "Registra tu progreso para que tu coach pueda ajustar tu plan.", un `InfoTooltip` explicativo y un **disclaimer legal fijo**: "EVA no es un dispositivo medico ni sustituye el consejo de profesionales de la salud." Incluye un link "Volver" hacia `${base}/dashboard`.

### Cómo se invita (recordatorio del dashboard)

La invitación vive en el dashboard del alumno vía el componente server `CheckInBanner` (`dashboard/_components/checkin/CheckInBanner.tsx`). Su lógica de cadencia, basada en `getLastCheckIn(userId)`:

- **Sin check-in previo** (`!last?.created_at`): banner neutro "Registra tu primer check-in" / "Peso y energía en segundos", con botón "Ir" → `${base}/check-in`.
- Calcula `daysSince` = días calendario entre hoy (zona Santiago, `getTodayInSantiago`) y el día del último check-in (`last.created_at.split('T')[0]`), anclando ambos a las 12:00 para evitar saltos por TZ.
- **`daysSince < 3`**: el banner **no se renderiza** (`return null`) — no molesta recién hecho el check-in.
- **`daysSince` entre 3 y 7** → variante `warning`: mensaje "Check-in próximo" (si es exactamente 3) o "Check-in próximo — hace N días".
- **`daysSince > 7`** → variante `overdue`: mensaje "¡Check-in pendiente!".
- Muestra "Último: {fecha relativa}" con `formatRelativeDate(lastDay, todayIso)` y botón "Check-in" → `${base}/check-in`.

> El check-in es nominalmente "mensual" pero el recordatorio se vuelve visible a los 3 días y "pendiente" a los 7+. No hay bloqueo de frecuencia: el alumno puede enviar tantos check-ins como quiera; cada `submit` inserta una fila nueva.

---

## 1.2 Qué datos llegan (server) — `getCheckInPageData`

`page.tsx` (RSC) llama `getCheckInPageData(coach_slug)` de `_data/check-in.queries.ts` (envuelto en `React.cache`). Devuelve `{ user, coachPrimaryColor, lastCheckIn }`:

1. **Autenticación local del JWT** vía `supabase.auth.getClaims()` (verificación ES256 sin round-trip a `/user`; el proxy ya validó/refrescó la sesión). `user = { id: claims.sub }` o `null`.
   - Si no hay user → `{ user: null, coachPrimaryColor: null, lastCheckIn: null }`.
2. **Color de marca del coach**: select sobre `clients` con join `coaches!inner ( slug, primary_color )`, filtrando `clients.id = user.id` **y** `coaches.slug = coachSlug`. Confirma la pertenencia alumno↔coach. Si no hay `client` → `coachPrimaryColor: null`.
   - `coachPrimaryColor` final = `coachInfo?.primary_color ?? '#8B5CF6'` (fallback violeta). Maneja el caso en que `coaches` venga como objeto o como array.
3. **Último check-in** (`lastCheckIn`): select `weight, energy_level, created_at` de `check_ins` donde `client_id = user.id`, `order created_at desc`, `limit 1`, `maybeSingle()`. Tipo `LastCheckInRow = { weight: number | null; energy_level: number | null; created_at: string } | null`.

### Guards de la página

- `if (!user) redirect(`${base}/login`)`
- `if (!coachPrimaryColor) redirect(`${base}/dashboard`)` — si el alumno no pertenece a este coach o el coach no tiene color, lo rebota al dashboard.

`base` se resuelve con `getClientBasePath(coach_slug)`: lee el header `x-client-base-path` que pone el proxy cuando el árbol del alumno se sirve bajo `/e/[org_slug]` (rewrite → `/c/[coach_slug]`), con fallback a `/c/${coachSlug}`. Así el componente sirve idéntico en standalone y enterprise.

> El `lastCheckIn` que llega a la page-data se ordena por `created_at`, mientras que el `getLastCheckIn` del dashboard (`dashboard.queries.ts`) ordena por `date` (día de medición) y luego `created_at`. Son dos queries distintas con criterio de orden distinto.

---

## 1.3 El wizard — `CheckInForm` (3 pasos)

Componente `'use client'` (`CheckInForm.tsx`). Props: `coachSlug`, `coachPrimaryColor`, `lastCheckIn`. Usa `useActionState(submitCheckinAction, initialState)`.

### Estado local

- `currentStep: 1 | 2 | 3` (paso actual), `direction: 1 | -1` (sentido de la transición animada).
- Campos: `weight: string`, `energyLevel: number` (default `7`), `notes: string`.
- Fotos: `frontFile`/`backFile` (`File | null`), `frontPreview`/`backPreview` (object URLs), `fileErrors: { front?; back? }`.
- Flags: `isSubmitting`, `showCelebration`.

### Paso 1 — Peso + nivel de energía

- **Tarjeta "último check-in"**: si `lastCheckIn` existe, muestra `{weight} kg · Energía {energy_level}/10` y la fecha relativa (`formatRelativeDate(created_at.slice(0,10))`). Si no, muestra estado "Tu primer check-in" con instrucción.
- **Peso actual (kg)**: input `type="text"` `inputMode="decimal"`; en `onChange` normaliza coma a punto (`e.target.value.replace(',', '.')`). Placeholder `75.5`.
- **Nivel de energía (1–10)**: `input type="range"` `min=1 max=10`, valor numérico al lado. `accentColor` = color de marca.
- **Navegación**: botón "Continuar" **deshabilitado si `currentStep === 1 && !weight`** (el peso es obligatorio para avanzar del paso 1). No hay botón "Atrás" en el paso 1.

### Paso 2 — Fotos (opcionales)

- Dos `input type="file" accept="image/*"` ocultos (`sr-only`) con refs `frontInputRef`/`backInputRef`, disparados por botones "Seleccionar foto frontal" / "Seleccionar foto".
- Cada selección pasa por `validateAndSetFile(file, side, setPreview, setFile)`:
  - Limpia el error previo de ese lado.
  - **Tipo permitido**: `ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']`. Si no → error "Formato no permitido. Solo JPG, PNG o WEBP." y **no** setea el archivo.
  - **Tamaño**: `MAX_SIZE = 5 * 1024 * 1024` (5 MB). Si excede → error "La imagen pesa más de 5MB."
  - Si pasa: `setFile(file)` y `setPreview(URL.createObjectURL(file))`.
- **Preview**: `<Image fill>` con botón "X" (rojo) que limpia preview, archivo y resetea `input.value`.
- Labels: "Foto frontal — Opcional" y "Foto de espalda o perfil — Opcional". Texto guía: "Las fotos son opcionales pero ayudan a tu coach a ver tu evolución."
- Botón "Continuar" **sin condición** (las fotos no bloquean). Aparece botón "Atrás".

### Paso 3 — Notas + resumen final

- **Notas**: `<textarea rows=4 maxLength=1000>` — "Opcional (máx. 1000)". Placeholder "Cómo te sentiste, sueño, comentarios para tu coach…".
- **Resumen final** antes de enviar:
  - Peso: `{weight || '—'} kg`
  - Energía: `{energyLevel}/10`
  - Fotos: `{[frontFile, backFile].filter(Boolean).length} adjuntas`
- Si `state.error`, muestra el bloque de error inline.
- Botón "Enviar Check-in" → `handleAction()`; **deshabilitado mientras `isSubmitting`** (muestra `Loader2` spinner).

### Navegación entre pasos

- `goNext()`: `direction=1`, sube hasta 3. `goPrev()`: `direction=-1`, baja hasta 1.
- Indicador de progreso: 3 píldoras animadas; las `<= currentStep` se pintan con el color de marca.
- Transiciones con `framer-motion` (`AnimatePresence mode="wait"`, `stepVariants`), respetando `useReducedMotion` (sin desplazamiento ni fade si está activo).
- Inputs con `handleInputFocus` hacen `scrollIntoView({ block: 'center' })` tras 300 ms (UX teclado móvil).

---

## 1.4 Envío — `handleAction()` (cliente) → compresión → server action

### En el cliente (`handleAction`)

1. `setIsSubmitting(true)`.
2. Arma un `FormData`:
   - `weight` = `weight` (string)
   - `energy_level` = `String(energyLevel)`
   - `notes` = `notes`
   - Si hay `frontFile`: **comprime en el navegador** con `browser-image-compression` (`imageCompression`): `maxSizeMB: 2`, `maxWidthOrHeight: 1920`, `useWebWorker: true`; lo agrega como `photo` con `frontFile.name`.
   - Si hay `backFile`: misma compresión, lo agrega como `back_photo`.
3. `startTransition(() => formAction(formData))`.
4. `catch` → `setIsSubmitting(false)` (si la compresión falla, no envía).

> **Doble compresión de imagen**: primero en el cliente (`browser-image-compression` a ≤2 MB / 1920 px) para reducir egress de subida, y luego en el servidor a WebP 1080px (ver abajo). El nombre original del archivo se preserva en el `FormData`.

### Server action — `submitCheckinAction(_prev, formData)`

Archivo `_actions/check-in.actions.ts` (`'use server'`). Devuelve `CheckinState = { error?; success? }`.

1. **Lectura del FormData** a `raw`:
   - `weight`: `String(formData.get('weight') ?? '').replace(',', '.')` (re-normaliza coma→punto del lado servidor).
   - `energy_level`, `notes`, `photo`, `back_photo`.
2. **Validación con `CheckInSchema`** (Zod v4, de `@eva/schemas`, definido en `packages/schemas/client.ts`):
   - `weight`: `z.coerce.number().min(20).max(400)` — **obligatorio**, entre 20 y 400 kg.
   - `energy_level`: `z.coerce.number().min(1).max(10)` — obligatorio.
   - `notes`: `z.string().max(1000).optional()`.
   - `photo` / `back_photo`: `fileField` opcional, que revalida **en servidor**: tamaño ≤ `5 MB` ("El tamaño máximo de imagen es 5MB.") y tipo en `['image/jpeg','image/jpg','image/png','image/webp']` ("Solo se aceptan formatos .jpg, .jpeg, .png y .webp."). Acepta `file.size === 0` (sin foto).
   - Si `!parsed.success` → `{ error: parsed.error.issues[0].message }` (solo el primer mensaje).
3. **Reautenticación**: `supabase.auth.getUser()` (aquí sí `getUser`, no `getClaims`). Si no hay user → `{ error: 'No autenticado.' }`. El `client_id` que se guarda viene de `user.id` (auth), **nunca** del body.
4. **Subida de fotos** (cada una, si `file.size > 0`) con `uploadToCheckinsBucket(adminDb, user.id, file, variant)` usando un **service-role client** (`createServiceRoleClient()`):
   - Si falla la subida → corta el check-in con `{ error: up.message }` ("Error al subir la imagen de progreso.").
5. **Insert en `check_ins`** (service-role) — ver §1.5.
6. `revalidatePath('/c', 'layout')` y `revalidatePath(`/coach/clients/${user.id}`)` para refrescar dashboard del alumno **y** la ficha del coach.
7. Retorna `{ success: true }`.

---

## 1.5 Cómo se guarda (Storage + tabla `check_ins`)

### Subida a Storage — `uploadToCheckinsBucket`

Bucket: **`checkins`** (privado; ver migraciones `_POST_DEPLOY_..._checkins_bucket_private.sql`). Para cada foto:

1. Genera `timestamp = Date.now()` y `rand = Math.random().toString(36).substring(7)`.
2. **Compresión server best-effort a WebP** con `compressImageToWebp(file)` (`lib/storage/image-compress.ts`, `server-only`, usa `sharp`):
   - `sharp(input, { limitInputPixels: 50_000_000, failOn: 'none' })` → `.rotate()` (auto-orienta desde EXIF) → `.resize(1080, 1080, { fit: 'inside', withoutEnlargement: true })` → `.webp({ quality: 80 })`.
   - **NUNCA tira**: si `sharp` falla (HEIC sin libheif, corrupto, OOM, no-imagen, buffer vacío) devuelve `null` y se sube el **archivo original**. La UX del alumno es one-shot, no se aborta el check-in.
   - Extensión = `webp` si comprimió, si no la extensión original (`file.name.split('.').pop() || 'jpg'`).
3. **Ruta del objeto** (scoping por usuario):
   - front: `${userId}/${timestamp}-${rand}.${ext}`
   - back: `${userId}/${timestamp}-back-${rand}.${ext}`
4. `adminDb.storage.from('checkins').upload(filePath, body, { cacheControl: '3600', upsert: false, contentType? })`:
   - `upsert: false` — fotos únicas por alumno+timestamp, jamás pisar.
   - `contentType` se setea **obligatoriamente** a `image/webp` cuando hay buffer (sin él Storage guardaría como `application/json` y rompería el render).
   - En error → `{ ok: false, message: 'Error al subir la imagen de progreso.' }`.
5. **Se guarda el PATH, no la URL pública** (`uploadData.path`). Las capas de display resuelven un signed URL en runtime, así el bucket puede ser privado sin romper imágenes.

### Insert en la tabla `check_ins`

```
adminDb.from('check_ins').insert({
  client_id: user.id,
  weight: parsed.data.weight,
  energy_level: parsed.data.energy_level,
  notes: parsed.data.notes || null,
  front_photo_url: photoPath,     // PATH del Storage, no URL
  back_photo_url: backPhotoPath,  // PATH del Storage, no URL
})
```

Columnas de `check_ins` (de `database.types.ts`): `id`, `client_id`, `created_at`, `date`, `weight`, `energy_level`, `notes`, `front_photo_url`, `back_photo_url`, `reviewed_at`, `reviewed_by`.

> El insert **no setea `date`** explícitamente: queda en el default de la columna (insertable como `date?`). El dashboard ordena por `date`; este formulario lo deja al default de DB.
> Existe una tercera columna de foto, `side_photo_url`, que el resolver reconoce (`PHOTO_FIELDS`) pero que este formulario **no escribe** (solo front/back).
> `reviewed_at`/`reviewed_by` quedan `null` al insertar — son la marca de "revisado" que pone el coach.
> Si el insert falla → `{ error: 'Error al guardar el reporte: ' + insertError.message }`. Si una foto ya se subió antes de un insert fallido, queda huérfana en Storage (no hay rollback de Storage).

---

## 1.6 Celebración al enviar y a dónde vuelve

Cuando `state.success` se vuelve `true`:

- `useEffect` dispara `toast.success('Check-in enviado')`, activa `setShowCelebration(true)` y, si no hay reduced-motion, lanza **confeti** vía import dinámico de `canvas-confetti` (`fireConfetti({ particleCount: 90, spread: 70, startVelocity: 45, origin: { x: 0.5, y: 0.7 } })`).
- El render cambia a la pantalla de éxito:
  - **`SuccessWaveOverlay`** (`components/ui/SuccessWaveOverlay.tsx`): overlay full-screen brand-themed que sube una "ola" del color del coach (`accentColor={coachPrimaryColor}`), muestra un check + headline "¡Check-in enviado!" y se retira. Es reduced-motion aware (en ese caso, backdrop estático con fade, hold ~1.4 s). `onComplete` → `setShowCelebration(false)`.
  - Tarjeta con `CheckCircle2`, "¡Check-in Enviado!", "Tu coach ha recibido tu actualización mensual." y botón **"Volver al Inicio"** → `router.push(`${base}/dashboard`)`.
- Si `state.error`: `toast.error(state.error)` y, en el paso 3, bloque de error inline. `isSubmitting` se resetea cuando llega `state.error || state.success`.

**Destino tras enviar**: el dashboard del alumno (`${base}/dashboard`), manualmente vía el botón "Volver al Inicio" (no hay redirect automático del servidor; el `revalidatePath` solo invalida cachés).

---

## 1.7 Relación con dashboard y ficha del coach (qué ve el coach)

### Efecto en el dashboard del alumno

- `revalidatePath('/c', 'layout')` refresca el árbol del alumno → `CheckInBanner` recalcula `daysSince` (vuelve a ocultarse al estar `< 3` días), y los widgets de peso/compliance reflejan la nueva fila.

### Qué ve el coach (ficha del alumno)

`revalidatePath(`/coach/clients/${user.id}`)` invalida la ficha del coach. El servicio `services/client/client-detail.service.ts`:

- Trae **todas** las filas de `check_ins` del alumno: `.select('*').eq('client_id', clientId).order('created_at', desc)`.
- **Firma las fotos** vía `resolveCheckinPhotoUrls(createServiceRoleClient(), checkIns)` (los coaches **no** tienen policy de SELECT en Storage; solo el service-role firma).
  - El resolver (`lib/storage/checkin-photos.ts`) normaliza cada `front_photo_url`/`back_photo_url`/`side_photo_url` a un path (`toCheckinPath`, dual-read: acepta paths nuevos y URLs públicas legacy) y genera **signed URLs** con TTL 600 s vía `createSignedUrls`, con cache in-memory (~540 s) para ahorrar egress en re-renders.
- En otra query trae los **últimos 4 check-ins** (`energy_level, weight, created_at`) para vistas resumidas.
- **Marca de revisión**: existe una acción que hace `update({ reviewed_at: now, reviewed_by: user.id })` sobre el check-in (filtrando `id`, `client_id` y `reviewed_at IS NULL`), es decir el coach puede marcar un check-in como revisado.

> Resumen de "qué ve el coach": peso, nivel de energía, notas, y las fotos frontal/back (firmadas, no públicas) de cada check-in, ordenadas por fecha, con capacidad de marcarlos revisados. La ficha del coach es el destino real de seguimiento de la evolución del alumno.

---

## 1.8 Constantes y límites clave (parity)

| Concepto | Valor | Dónde |
| --- | --- | --- |
| Peso válido | 20–400 kg (obligatorio) | `CheckInSchema` |
| Energía | 1–10 (obligatorio), default UI `7` | `CheckInSchema` / `CheckInForm` |
| Notas | máx. 1000 chars, opcional | `CheckInSchema` / textarea `maxLength` |
| Tipos imagen | jpeg, jpg, png, webp | `ALLOWED_TYPES` / `ACCEPTED_IMAGE_TYPES` |
| Tamaño máx. imagen | 5 MB | `MAX_SIZE` / `MAX_FILE_SIZE` |
| Compresión cliente | ≤2 MB, ≤1920 px, WebWorker | `imageCompression` |
| Compresión servidor | WebP q80, ≤1080 px, `failOn:none`, best-effort | `compressImageToWebp` |
| Bucket | `checkins` (privado) | `uploadToCheckinsBucket` |
| Path foto front | `{userId}/{ts}-{rand}.{ext}` | `uploadToCheckinsBucket` |
| Path foto back | `{userId}/{ts}-back-{rand}.{ext}` | `uploadToCheckinsBucket` |
| Signed URL TTL (coach) | 600 s, cache ~540 s | `checkin-photos.ts` |
| Color fallback | `#8B5CF6` | `getCheckInPageData` |
| Confeti | 90 partículas, spread 70 | `fireConfetti` |
| Recordatorio dashboard | oculto <3d, warning 3–7d, overdue >7d | `CheckInBanner` |
