# 4. Importador de alumnos (wizard 4 pasos)

> Alcance: este documento cubre SOLO el flujo de importar cartera (`/coach/clients/import`). Las tarjetas (`ClientCardV2`) y la ficha del alumno (`/coach/clients/[clientId]`) tienen su propio documento.

Permite al coach (o admin de org / coach con team activo) crear alumnos en lote desde un archivo Excel/CSV. Es un wizard de 4 pasos enteramente client-side hasta el Paso 4, donde la persistencia ocurre vía un único server action: `importClientsAction` en `apps/web/src/app/coach/clients/import/_actions/import.actions.ts`.

---

## 4.0. Estructura y flujo general

Archivos:

- `import/page.tsx` — RSC. Resuelve sesión, contexto org, gate de tier, cuenta alumnos activos. Renderiza `ImportWizard` o `UpsellGate`.
- `import/_components/ImportWizard.tsx` — `'use client'`. Orquesta los 4 pasos, mantiene el estado del wizard.
- `import/_components/Step1Upload.tsx` — subir + parsear archivo (cliente).
- `import/_components/Step2MapColumns.tsx` — mapear columnas a campos EVA (cliente).
- `import/_components/Step3Preview.tsx` — validar filas, marcar errores/duplicados (cliente).
- `import/_components/Step4Confirm.tsx` — consentimiento legal + disparar el server action.
- `import/_actions/import.actions.ts` — server action `importClientsAction` (única persistencia).

Libs de soporte:

- `@/lib/import/header-matcher` — detección automática de columnas (sinónimos + Levenshtein).
- `@/lib/import/csv-injection` — `sanitizeCell` / `isDangerousCell` (anti CSV injection).
- `../../_lib/create-client-internal` (`createClientInternal`) — crea cada alumno (GoTrue + fila `clients` + identidad).
- `@/lib/constants` → `getTierCapabilities`, `getTierMaxClients`, `getCoachOrgContext`, `resolveCoachScope`.

### Estado del wizard (`ImportWizard`)

```
step: number (1..4)
sheet: ParsedSheet | null          // { headers: string[], rows: (string|number|null)[][], filename: string }
mapping: ColumnMapping             // Record<colIndex, ImportField | null>
mappedRows: MappedRow[]            // ImportRow & { _rowIndex: number }
```

El stepper permite volver atrás haciendo click en pasos ya completados (`isDone`), no avanzar saltando. El estado se mantiene en memoria del componente (no hay persistencia intermedia en DB; si se recarga la página se pierde todo hasta el Paso 4).

Props que recibe `ImportWizard` desde la page: `coachId`, `orgId` (no usado en el componente, se prefija `_orgId`), `maxClients`, `activeCount`. El gate real de tier vive en la page y en el server action; el componente solo usa `maxClients`/`activeCount` para el aviso de límite del Paso 4.

---

## 4.1. Gate de tier y acceso (page.tsx + server action)

### En `page.tsx` (render gate)

1. Sesión: `supabase.auth.getClaims()` (verificación local del JWT ES256, sin round-trip a `/user`). Si no hay `sub` → `redirect('/login')`.
2. Contexto org vía `getCoachOrgContext()`:
   - Coach enterprise con rol `coach` (es decir `ctx.isOrgUser && !ctx.isOrgAdmin`) → `redirect('/coach/clients')`. **No puede importar.**
   - Org admin (`ctx.isOrgAdmin`) → siempre tiene acceso (la org maneja el billing).
3. Coach standalone: lee `coaches.subscription_tier` (default `'free'`), calcula `caps = getTierCapabilities(tier)`. Si **no** es org admin y `!caps.canImportClients` → renderiza `<UpsellGate variant="client_import" currentTier={tier} />` en vez del wizard.
4. `orgId = ctx?.isOrgAdmin ? ctx.orgId : null`.
5. Cuenta alumnos activos (`is_archived=false`), scoped: por `org_id` si org admin, si no por `coach_id`. Pasa `activeCount` y `maxClients` (`coach.max_clients ?? 10`) al wizard.

### Capacidad por tier (`packages/tiers/index.ts`, `canImportClients`)

| Tier | `canImportClients` |
|------|--------------------|
| free | **false** |
| starter | true |
| pro | true |
| elite | true |
| growth (legacy) | true |
| scale (legacy) | true |

> El free tier NO puede importar (ve el `UpsellGate`). De starter en adelante, sí.

`getTierMaxClients`: free=3, starter=10, pro=30, elite=100, growth=120 (legacy). El cap efectivo usado es `coaches.max_clients` si está seteado, si no el del tier.

### En el server action (gate de defensa, redundante)

`importClientsAction` re-valida TODO server-side (no confía en el cliente):

1. `consentConfirmed` debe ser `true`, si no devuelve error de consentimiento Ley 19.628.
2. `auth.getUser()` — si no hay user → `'No autenticado.'`
3. `getCoachOrgContext()` — coach enterprise (`isOrgUser && !isOrgAdmin`) → `'Tu rol no permite importar alumnos.'`
4. `orgId = isOrgAdmin ? ctx.orgId : null`.
5. **Workspace activo (team):** si NO es org, llama `resolveCoachScope(supabase, user.id)`. Si hay `activeTeamId`, las filas entran al POOL del team (`team_id`), no a la cartera personal. Carga `teams.slug` y `teams.name` para el branding del email y el `loginPath`.
6. Lee `coaches` (id, slug, full_name, brand_name, welcome_message, subscription_tier, max_clients).
7. **Gate de tier:** si NO hay `orgId` y NO hay `activeTeamId` y `!caps.canImportClients` → devuelve `{ error: 'upgrade_required' }`. (Org y team saltan el gate de tier de capacidad.)

> Implicancia clave: org admins y coaches con team activo NO están limitados por `canImportClients` del tier — el gate de tier solo aplica al coach standalone sin team.

---

## 4.2. Paso 1 — Subir archivo (`Step1Upload`)

### Formatos y límites (validación cliente)

- Extensiones aceptadas: `.xlsx`, `.xls`, `.csv` (constante `ACCEPTED_EXTS`).
- MIME aceptados: hojas OpenXML, ms-excel, `text/csv`, `application/csv` (`ACCEPTED_MIME`). Se acepta si coincide la extensión **o** el MIME.
- Tamaño máximo: `MAX_BYTES = 5 MB`. Excede → `'El archivo supera el límite de 5 MB.'`
- Filas máximas: `MAX_ROWS = 1000` (de datos, sin contar encabezado).

### Parseo (cliente, librería `xlsx` / SheetJS)

- La librería se importa de forma dinámica (`await import('xlsx')`) — code-splitting, no entra al bundle inicial.
- `file.arrayBuffer()` → `XLSX.read(buffer, { type: 'array', cellDates: true, raw: false })`.
  - `cellDates: true` → las celdas de fecha se devuelven como objetos `Date` JS (no serial Excel). Esto importa para `subscription_start_date` en el Paso 2.
  - `raw: false` → valores formateados como string.
- Se toma SIEMPRE la **primera hoja** (`wb.Sheets[wb.SheetNames[0]]`). Hojas adicionales se ignoran.
- `XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: null })` → matriz array-of-arrays (AoA). `blankrows: false` descarta filas vacías; `defval: null` rellena celdas vacías con `null`.

### Validaciones de contenido

- `aoa.length < 2` → `'El archivo está vacío o solo tiene encabezados.'`
- Primera fila = encabezados (`headers`, cada uno `String(h ?? '')`); resto = `dataRows`.
- Si `dataRows.length > MAX_ROWS` → error indicando dividir en partes de hasta 1.000. (Nota: el slice a `MAX_ROWS` se hace antes, pero igual corta con error si excede.)
- Si todo OK: `onComplete({ headers, rows, filename })` → avanza al Paso 2.
- Cualquier excepción de parseo → `'No se pudo leer el archivo. Verificá que sea un Excel o CSV válido.'`

### UI funcional

- Zona drag-and-drop + click para abrir selector (`<input type="file" accept=".xlsx,.xls,.csv">`).
- Estado `parsing` muestra "Procesando archivo...".
- Tarjeta informativa "¿Qué columnas necesito?" con link de descarga del template (`/templates/import-alumnos.xlsx`) y la lista de campos: Nombre completo (requerido), Email (requerido), Teléfono (opcional), Fecha de inicio (opcional, DD/MM/AAAA). Aviso de que detecta columnas en español o inglés automáticamente.

---

## 4.3. Paso 2 — Mapear columnas (`Step2MapColumns`)

### Detección automática (`matchHeaders` en `header-matcher.ts`)

Campos destino (`ImportField`): `full_name`, `email`, `phone`, `subscription_start_date`.

Algoritmo por encabezado (`matchHeader`):

1. **Normalización** (`normalizeHeader`): NFD + quita diacríticos + lowercase + trim + elimina todo lo no `[a-z0-9]`. Ej: "Teléfono " → "telefono".
2. **Match exacto** contra listas de sinónimos normalizados (`HEADER_SYNONYMS`):
   - `full_name`: nombre, nombre completo, name, full name, fullname, alumno, cliente, apellido y nombre, nombre y apellido, nombres, nombre del alumno, paciente.
   - `email`: email, correo, e-mail, mail, correo electronico/electrónico, e mail, direccion/dirección email.
   - `phone`: telefono/teléfono, celular, whatsapp, phone, movil/móvil, tel, fono, numero/número, numero de contacto, contacto.
   - `subscription_start_date`: fecha inicio, inicio, start date, fecha alta, desde, fecha de inicio, comienzo, fecha registro, fecha de alta, alta.
   - Match exacto → `confidence: 'exact'`, similarity 1.
3. **Match fuzzy** (Levenshtein): calcula similitud `1 - distancia/maxLen` contra todos los sinónimos; si la mejor `>= FUZZY_THRESHOLD (0.8)` → `confidence: 'fuzzy'`. Si no → `confidence: 'none'`, sin campo.
4. **Resolución de conflictos** (`matchHeaders` a nivel de set): si dos columnas matchean el mismo campo, gana la de mayor score (exact=2, si no la similarity); la perdedora se degrada a `none` para que el coach la resuelva a mano.

### UI funcional

- Tabla: por cada encabezado del archivo muestra el nombre de columna, hasta 2 ejemplos (primeras 3 filas no vacías → slice 2), y un `<select>` para asignar campo EVA.
- Opciones del select (`FIELD_OPTIONS`): "-- No importar --" (`ignore` → `null`), Nombre completo, Email, Teléfono, Fecha de inicio.
- El mapeo inicial se siembra desde `autoMatches`; si ya había mapping previo (volver atrás) se reusa.
- Badges: "Auto" si `confidence==='exact'`; "Sugerido" si `confidence==='fuzzy'` (solo si el campo no es ignore).

### Validación para continuar

- `REQUIRED = ['full_name', 'email']`. `canContinue` solo si ambos están mapeados. Si faltan, muestra "Debés mapear: …".
- Al continuar (`handleContinue`): construye `MappedRow[]` recorriendo cada fila y aplicando el mapping. Para `subscription_start_date` aplica `normalizeImportDate` (maneja `Date` JS de SheetJS extrayendo partes LOCALES para evitar shift UTC→local — comentario BUG-02; además DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD; cualquier otro → `null`). El resto de campos: `String(val).trim()` o `null`.

---

## 4.4. Paso 3 — Revisar datos (`Step3Preview`)

Validación cliente sobre `mappedRows` (memoizada). Esquema Zod `rowSchema`:

```
full_name: string min 2 ('Nombre muy corto') max 100
email:     string email ('Email inválido')
phone:     string optional nullable
subscription_start_date: string optional nullable
```

Anotación por fila (`AnnotatedRow`):

- **Errores** (`_errors`): los de Zod (nombre corto/largo, email inválido).
- **Advertencias** (`_warnings`):
  - Email duplicado dentro del MISMO archivo (`seenEmails` set): "Email duplicado en este archivo (se omitirá)". Marca `_isDuplicate`.
  - Celda peligrosa (`isDangerousCell` sobre `full_name` o `email`): "Celda con carácter especial — se sanitizará automáticamente".
- **Estado** (`_status`): `error` si hay errores; si no `warning` si hay advertencias; si no `valid`.

> Nota: el Paso 3 NO detecta duplicados contra alumnos ya existentes en DB — eso solo ocurre server-side en el Paso 4. Aquí solo se detectan duplicados intra-archivo.

### UI funcional

- Resumen con contadores: `validCount` (válidas), `warnCount` (con advertencia), `errorCount` (con error).
- Tabla de hasta 50 filas (#, Nombre, Email, Teléfono, Estado con tooltip del error/advertencia). Si hay más, "Mostrando 50 de N filas.".

### Filtrado al continuar

- `handleContinue`: filtra `_status !== 'error' && !_isDuplicate` → solo filas válidas o con advertencia no-duplicado pasan. Botón deshabilitado si `validCount === 0` (cuenta solo `valid`, no warnings, pero el filtro de paso sí incluye warnings no duplicados). Texto: "Continuar con {validCount} alumnos →".

---

## 4.5. Paso 4 — Confirmar y persistir (`Step4Confirm` + `importClientsAction`)

### UI / pre-condiciones (cliente)

- Tarjeta resumen: "{rows.length} alumnos serán creados", desglose `activeCount + nuevos = total / maxClients`, "{n} emails de bienvenida se enviarán", tiempo estimado `~Math.ceil(n/10)*2` segundos.
- `wouldExceedLimit = activeCount + rows.length > maxClients` → muestra aviso destructivo con link a `/coach/subscription?upgrade=true`.
- **Consentimiento legal obligatorio** (checkbox `consent`): confirma tener consentimiento expreso conforme Ley 19.628 (modificada por Ley 21.719). Link a `/privacy` (Política de privacidad y DPA).
- `canImport = consent && !wouldExceedLimit && !isPending`. El import corre dentro de `useTransition` (`startTransition`).
- Llama `importClientsAction(rows, filename, true)` (consent siempre `true` aquí porque el botón está gateado por el checkbox).

### Persistencia server-side (`importClientsAction`)

Tras los gates (sección 4.1):

1. **Validaciones de volumen:** `!rows.length` → 'No hay filas para importar.'; `rows.length > 1000` → error de límite (segunda barrera además de la del Paso 1).
2. **Client cap (solo standalone sin team):** si no hay orgId ni activeTeamId, cuenta `clients` activos (`is_archived=false`, `coach_id`). Si `activeCount + rows.length > maxClients` → error con números concretos. Org/team NO tienen cap per-coach.
3. **Registro de auditoría** en tabla `client_imports`:
   - Inserta `{ coach_id | org_id, filename, total_rows, status: 'processing', consent_confirmed_at }`. Org admin → `org_id` set y `coach_id: null`; standalone/team → `coach_id` set y `org_id: null`.
   - Si falla el insert → 'Error al registrar el import.'
   - Devuelve `importRecord.id` (= `importId` del resultado).
4. **Detección de duplicados contra DB:** consulta `clients.email IN (emailsToCheck)` scoped (por `org_id` / `team_id` / `coach_id`). Arma set `existingEmails`. Estos se **omiten** (skipped), no fallan.
5. **Procesamiento en lotes (idempotencia/orden):**
   - `authAdmin = createServiceRoleClient()` SOLO para GoTrue Admin (createUser/deleteUser). Los INSERT a `clients` pasan con el cliente USER-scoped (RLS del coach/org admin/team pool). Ver comentario R3 auditoría 2026-06-11.
   - `CHUNK_SIZE = 10`. Recorre en chunks con `Promise.allSettled` (paralelo dentro del chunk, secuencial entre chunks).
   - Por fila:
     - Sanitiza `full_name`, `email`, `phone` con `sanitizeCell` (anti CSV-injection: prefija `'` si empieza con `= + - @ \t \r`).
     - Re-valida con `importRowSchema` (mismo esquema que el Paso 3, server-side). Falla → push a `rowErrors` con `{ row, email, full_name, error }`.
     - Si `existingEmails.has(emailKey)` → `skipped++`, no crea.
     - Si ya se vio en este batch (`seenInBatch`) → `skipped++` (dedup intra-archivo server-side).
     - Crea vía `createClientInternal(supabase, authAdmin, coachCtx, data)`:
       - `brand_name`: nombre del team, si no `brand_name` del coach, si no `full_name`.
       - `loginPath`: `/t/{team.slug}/login` si hay team, si no default `/c/{slug}/login`.
       - `subscription_start_date`: pasa por `normalizeImportDate` server-side (ISO / DD-MM o DD/MM / `new Date()` fallback → null si no parsea).
       - `temp_password`: `generateTempPassword()` — 12 chars de alfabeto sin ambigüedades (`ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789`, sin 0/O/1/I/l).
     - `result.ok` → `succeeded++`; si no → push a `rowErrors` con el error de `createClientInternal`.
   - Tras cada chunk: `UPDATE client_imports SET success_count, error_count` (progreso parcial persistido).
6. **Cierre:** `UPDATE client_imports` con `status` (`'failed'` solo si TODAS fallaron, si no `'completed'`), counts, `errors` (jsonb con `rowErrors`), `completed_at`.
7. `revalidatePath('/coach/clients')`.
8. Devuelve `ImportClientsState`:
   ```
   { success: true, importId, summary: { total, succeeded, failed, skipped }, rowErrors }
   ```

### Qué crea `createClientInternal` por alumno

1. `sanitizePlatformEmail` + `assertPlatformEmailAvailable(db, email)` — RPC de disponibilidad (SECURITY DEFINER, GRANT a authenticated). Si no disponible → `{ ok:false, code:'duplicate_email' }`.
2. `authAdmin.auth.admin.createUser({ email, password: temp_password, email_confirm: true })` — usuario GoTrue confirmado. Si duplicado → error; otros errores → `auth_error`.
3. INSERT en `clients` (user-scoped):
   - Org: `{ id, org_id, coach_id: null, full_name, email, phone, subscription_start_date, force_password_change: true }`.
   - Team/standalone: `{ id, coach_id, team_id (o null), …, force_password_change: true }`.
   - Si falla el INSERT → **rollback**: `authAdmin.auth.admin.deleteUser(user.id)` (compensación; evita usuario huérfano en Auth). Código `23505` → `duplicate_email`; otros → `db_error`.
4. `createClientIdentity` (account + membership) — **no fatal** (lecturas caen al fallback de la fila `clients`).
5. **Email de bienvenida** (no bloqueante, `.catch`): `buildClientWelcomeEmail` con brand, coach, nombre, `loginUrl` (`appUrl + loginPath`), `tempPassword`, `welcomeMessage`. Se envía con `sendTransactionalEmail`. El password temporal viaja en el email — el alumno entra y `force_password_change: true` lo obliga a cambiarlo.
6. Retorna `{ ok:true, clientId, loginUrl }`.

> Manejo de errores parciales: el import NUNCA aborta entero por una fila mala. Cada fila es independiente (`Promise.allSettled`); fallidas van a `rowErrors`, duplicadas/ya-existentes a `skipped`, exitosas a `succeeded`. La idempotencia frente a re-ejecución se apoya en la deduplicación por email (existingEmails contra DB + seenInBatch intra-archivo): re-correr el mismo archivo omite los ya creados como `skipped`, pero NO hay token de idempotencia formal por archivo (un email distinto sí se re-crearía).

### Resultado final mostrado al coach (`Step4Confirm`, rama `result.success`)

- Tarjeta verde: "✅ {succeeded} alumnos importados". Si `failed > 0`: "{failed} fallaron · {skipped} omitidos".
- Lista de "Filas con error (N)": por cada una `#row`, nombre (email), mensaje de error. Scrollable.
- Botón "Ir a mi cartera →" → `router.push('/coach/clients')`.

> No se devuelven links de acceso individuales en la UI final: cada alumno recibe su `loginUrl` + password temporal por email de bienvenida (no se exponen en pantalla al coach).

### Errores de nivel acción mostrados (rama no-success)

`result.error` se muestra como banner. Valores posibles: consentimiento faltante, no autenticado, rol no permite importar, `'upgrade_required'`, sin filas, límite 1.000, cap de plan excedido, error al registrar el import.

---

## 4.6. Resumen de validaciones y límites (referencia rápida)

| Capa | Validación | Dónde |
|------|-----------|-------|
| Formato archivo | .xlsx/.xls/.csv, MIME | Step1 (cliente) |
| Tamaño | ≤ 5 MB | Step1 |
| Filas | ≤ 1.000 | Step1 + server action (doble) |
| Archivo vacío | ≥ 2 filas | Step1 |
| Columnas requeridas | full_name + email mapeados | Step2 |
| Validez fila | Zod (nombre 2-100, email válido) | Step3 (cliente) + server (re-valida) |
| Duplicado intra-archivo | email repetido | Step3 (warn) + server (`seenInBatch`, skipped) |
| Duplicado contra DB | email ya existe | Solo server (`existingEmails`, skipped) |
| CSV injection | `= + - @ \t \r` | Step3 (warn) + server (`sanitizeCell`, fix) |
| Gate de tier | `canImportClients` (free=false) | page (UpsellGate) + server (`upgrade_required`) |
| Cap de alumnos | activeCount + nuevos ≤ maxClients | Step4 (aviso) + server (bloquea) — solo standalone sin team |
| Consentimiento | Ley 19.628 checkbox | Step4 + server (obligatorio) |
| Rol enterprise coach | sin acceso | page (redirect) + server (error) |

### Tablas DB tocadas

- `client_imports` — registro de auditoría del import (status, counts, errors jsonb, consent_confirmed_at, completed_at).
- `clients` — un INSERT por alumno (user-scoped, RLS del coach/org admin/team pool).
- Auth (GoTrue) — `createUser` por alumno (service-role); `deleteUser` como compensación si falla el INSERT.
- Identidad (`createClientIdentity`) — account + membership, no fatal.
