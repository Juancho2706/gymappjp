# 3. Modales y acciones de lista + backend

Esta sección documenta los modales y acciones a **nivel de lista** del War Room (`/coach/clients`): alta, edición, archivado, eliminación, pausa/reactivación y reset de contraseña. El énfasis está en el backend: qué recibe cada server action, qué valida (Zod), qué persiste y bajo qué scope (service-role vs user-scoped), y qué `revalidatePath` dispara. Las tarjetas (`ClientCardV2`) y la ficha (`/coach/clients/[clientId]`) tienen su propio documento — aquí solo se referencian.

> Todas las acciones viven en `apps/web/src/app/coach/clients/_actions/clients.actions.ts` (archivo `'use server'`). El alta tiene además una variante interna reutilizable en `apps/web/src/app/coach/clients/_lib/create-client-internal.ts` que usa el importador.

---

## 3.0 Invariantes y scoping transversal (aplican a TODAS las acciones)

Antes del detalle por acción, las reglas que comparten las 8 server actions:

- **Autenticación.** Cada acción abre un cliente user-scoped con `createClient()` (cookies de la sesión del coach) y lee `supabase.auth.getUser()`. Si no hay usuario → `{ error: 'No autenticado.' }`. (Nota: usan `getUser`, no `getClaims`, porque necesitan el `email` del coach para correos transaccionales / mensajes.)
- **Scope canónico.** Cada acción resuelve el contexto con `resolveCoachScope(supabase, coachUser.id)` (alias `getCoachClientScope`) de `src/services/auth/coach-scope.service.ts`. El scope se deriva **solo del workspace activo** (`resolvePreferredWorkspace`), nunca del body del request. Devuelve:
  - `coach_standalone` → `{ orgId: null, activeTeamId: null, isEnterprise: false }`
  - `coach_team` → `{ orgId: null, activeTeamId: <teamId>, isEnterprise: false }`
  - `enterprise_coach` → `{ orgId: <orgId>, activeTeamId: null, isEnterprise: true }`
  - cualquier otro tipo → `{ ok: false, error: 'Workspace invalido para gestionar alumnos.' }`
- **Filtro de org en cada query.** Toda query a `clients` se acota con `applyOrgScope(query, scope.orgId)`: si `orgId` presente → `.eq('org_id', orgId)`; si `null` → `.is('org_id', null)`. Esto evita que un coach standalone toque alumnos enterprise y viceversa.
- **Doble llave de pertenencia.** Casi todas las acciones filtran además por `.eq('coach_id', coachUser.id)` (alumno propio) **más** `applyOrgScope`. Es decir: el coach solo puede operar sobre alumnos cuyo `coach_id` sea el suyo dentro de su scope. (Excepción de lectura: el pool team se gobierna por RLS colaborativo, no por `coach_id` en la query.)
- **User-scoped vs service-role (regla R3, auditoría 2026-06-11).** Las operaciones PostgREST (SELECT/INSERT/UPDATE/DELETE sobre `clients`, `client_intake`, etc.) corren con el cliente **user-scoped** `supabase`: el RLS de la sesión del coach es el techo real de seguridad. El **service-role** (`createServiceRoleClient()`) se reserva **exclusivamente** para la GoTrue Admin API (`auth.admin.createUser/updateUserById/deleteUser`) y para un único INSERT en `coach_client_assignments` que el RLS bloquea a coaches a propósito.
- **Column-level grants (gotcha plac.).** `clients` tiene `REVOKE UPDATE` a nivel de tabla + `GRANT UPDATE` por allowlist de columnas para `authenticated`. Las columnas de scoping (`org_id`/`team_id`/`coach_id`) son **service-role-only**: ningún `authenticated` puede mover un alumno de scope vía PATCH. Cualquier columna nueva que el coach deba editar requiere su `GRANT UPDATE(col)` en la misma migración, o PostgREST devuelve `42501` en runtime.

---

## 3.1 Alta de alumno — `CreateClientModal` + `createClientAction`

### Cómo se abre (frontend funcional)

- El contenedor `CoachWarRoom.tsx` mantiene el estado `open` y renderiza `<CreateClientModal open={open} onClose={() => setOpen(false)} />` (línea ~440). El botón "Agregar alumno" de la barra de acción / encabezado dispara `setOpen(true)`.
- El modal usa `useActionState(createClientAction, initialState)`. El `<form action={formAction}>` envía un `FormData` con los campos: `full_name`, `email`, `phone`, `subscription_start_date`, `temp_password`, `age_confirmed`.
- El botón de submit usa `useFormStatus()` para el estado `pending` ("Creando alumno...").
- El modal tiene **tres vistas** según el `state` devuelto:
  1. **Formulario** (inicial / con `fieldErrors` o `error`).
  2. **CTA de WhatsApp** (`state.success && state.newClientPhone`): muestra "¡Alumno creado!" y un botón que arma `https://wa.me/<digits>?text=<mensaje>` donde el mensaje es `Hola <clientName>! 👋 Soy tu coach. Aquí está tu link para acceder a tu plan: <loginUrl>`. `<digits>` es `newClientPhone.replace(/\D/g, '')`. Hay opción "Omitir por ahora".
  3. **Upgrade requerido** (`state.upgradeRequired`): muestra "Límite de `<currentLimit>` alumnos alcanzado", CTA a `/coach/subscription` y captura PostHog (`upgrade_modal_dismissed` / `upgrade_initiated`, gate `client_limit`).
- Auto-cierre: si `state.success` pero **sin** `newClientPhone`, el modal se resetea y cierra (no hay CTA de WhatsApp que mostrar).

### Datos del formulario

| Campo | Input | Notas |
|---|---|---|
| `full_name` | text, `required` | Nombre completo |
| `email` | email, `required` | Email del alumno |
| `phone` | tel, opcional | WhatsApp, placeholder `+56xxxxxxxxx` |
| `subscription_start_date` | date, opcional | "Inicio de mensualidad" |
| `temp_password` | text (visible), `required`, `minLength=8`, `font-mono` | Clave temporal manual que el coach define y comparte |
| `age_confirmed` | checkbox, `required` | Cumplimiento Ley 21.719 (alumno ≥14 o consentimiento de tutor) |

> La clave temporal del **alta manual** la **escribe el coach** (campo de texto visible, mín. 8). NO se autogenera aquí. La autogeneración (`generateStudentTempPassword`) solo ocurre en el **reset** (§3.6) y la generación aleatoria de 12 chars (`generateTempPassword` en el importador, §3.8) en el alta masiva.

### Validación (Zod) — `CreateClientSchema` (`packages/schemas/client.ts`)

```
full_name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100)
email:     z.string().email('Email inválido')
phone:     z.string().optional()
subscription_start_date: z.string().optional()
temp_password: z.string().min(8, 'La contraseña temporal debe tener al menos 8 caracteres')
age_confirmed: z.literal('on', { message: 'Debes confirmar que el alumno tiene 14 años o más...' })
```

Si `safeParse` falla → `{ fieldErrors: parsed.error.flatten().fieldErrors }` (sin tocar DB). El `age_confirmed` debe ser literal `'on'` (valor que envía un checkbox HTML marcado), su ausencia es error de campo.

### Backend — flujo de `createClientAction` (paso a paso)

1. Parse `FormData` → `CreateClientSchema.safeParse`. Falla → `fieldErrors`.
2. `getUser()` → si no hay coach, `{ error: 'No autenticado.' }`.
3. `resolveCoachScope`. Falla → `{ error }`.
4. SELECT del coach (columnas específicas, no `SELECT *`): `id, slug, invite_code, full_name, brand_name, welcome_message, subscription_tier, max_clients, active_org_id`. Sin fila → `{ error: 'Coach no encontrado.' }`.
5. **Límite por tier.** Calcula `tier = subscription_tier ?? 'starter'` y `maxClients = coach.max_clients ?? getTierMaxClients(tier)`. Cuenta alumnos activos: `clients` `count: 'exact', head: true`, `coach_id = coach.id`, `is_archived = false`, más `applyOrgScope`. Si la cuenta falla → `{ error: 'No pudimos validar el límite de alumnos de tu plan.' }`.
   - **Cap solo aplica a standalone.** Si `!scope.isEnterprise && !scope.activeTeamId && count >= maxClients`: se dispara el correo `buildUpgradeRequiredEmail` al coach (best-effort, `.catch(()=>null)`) y se devuelve `{ error: 'Alcanzaste el límite de <maxClients> alumnos...', upgradeRequired: true, currentLimit: maxClients }` → el modal muestra la vista de upgrade. **Enterprise y team NO tienen cap por coach** (pagan centralizado).
6. **Disponibilidad de email.** `sanitizePlatformEmail` (trim+lowercase) sobre el email; `assertPlatformEmailAvailable(supabase, email)` — RPC `check_platform_email_availability` (SECURITY DEFINER + GRANT a `authenticated`, por eso alcanza el cliente user-scoped). Este helper además rechaza:
   - dominio bloqueado `eva-app.cl` (`BLOCKED_EMAIL_DOMAINS`),
   - correos desechables (`DISPOSABLE_EMAIL_DOMAINS`, ~lista de 10minutemail/mailinator/etc.),
   - emails ya existentes en auth o `clients` huérfanos (`exists_in_auth || orphan_client_email`).
   - La dedup usa `normalizePlatformEmail` (quita +alias en gmail/outlook/etc. y puntos en gmail) pero el almacenamiento usa `sanitizePlatformEmail`. Falla → `{ error: <mensaje del helper> }`.
7. **Crear usuario auth (service-role).** `authAdmin = createServiceRoleClient()`; `authAdmin.auth.admin.createUser({ email: emailSan, password: temp_password, email_confirm: true })`. (`email_confirm: true` = cuenta confirmada de entrada, sin doble opt-in.) Error duplicado (`isAuthDuplicateEmailMessage`) → mensaje "Este correo ya está registrado...". Otro error → `Error al crear el usuario: <msg>`.
8. **INSERT en `clients` (user-scoped).** El `WITH CHECK` de RLS es el techo real. Campos insertados:
   - `id = newAuthUser.user.id` (el client comparte PK con el usuario auth),
   - `coach_id = coach.id`, `full_name`, `email = emailSan`, `phone || null`, `subscription_start_date || null`,
   - `force_password_change: true` (fuerza cambio en primer ingreso),
   - `age_confirmed_at: new Date().toISOString()` (sello de cumplimiento Ley 21.719),
   - `org_id: scope.orgId`, `team_id: scope.activeTeamId` (en contexto team el alumno nace EN el pool).
   - **Rollback transaccional manual:** si el INSERT falla, se borra el usuario auth recién creado (`authAdmin.auth.admin.deleteUser`). `23505` (unique violation) → mensaje de email duplicado; otro → `Error al guardar el alumno en la base de datos.`
9. **Materializar identidad (no-fatal).** `createClientIdentity({ accountId, clientId, coachId, orgId, teamId })` (F1, tabla account+membership). Si falla solo loguea (`console.error`); las lecturas hacen fallback a la fila `clients`.
10. **Enterprise: asignación coach↔cliente (service-role, FATAL).** Si `scope.orgId`: como NO existe policy de INSERT en `coach_client_assignments` para coaches (sería escalada horizontal), se usa **service-role real** (`createServiceRoleClient()`) para insertar `{ org_id, coach_id, client_id, assigned_by: coachUser.id }`. Si ese insert falla → **rollback completo**: borra la fila `clients` (service-role) **y** el usuario auth, devuelve `{ error: 'No se pudo asignar el alumno a tu cuenta...' }`. Un alumno enterprise sin asignación es huérfano, por eso es fatal.
11. **Login URL + correo de bienvenida.** Construye `loginPath`:
    - team → busca `teams(slug, name)` y arma `/t/<slug>/login`; el `brandName` del correo pasa a ser el nombre del team.
    - standalone → `/c/<getCoachPublicIdentifier(coach)>/login` (identificador público = `invite_code` con fallback a `slug`).
    - `loginUrl = (NEXT_PUBLIC_APP_URL || NEXT_PUBLIC_SITE_URL) + loginPath` (fallback `https://app.tu-dominio.com`).
    - Envía `buildClientWelcomeEmail({ brandName, coachName, clientName, loginUrl, tempPassword, welcomeMessage })` con `sendTransactionalEmail` (Resend). Si falla solo loguea (no bloquea el alta).
12. `revalidatePath('/coach/clients')` y retorna `{ success: true, newClientPhone: phone || undefined, loginUrl, clientName: full_name }`.

### Reglas / límites clave del alta

- **Límite de alumnos** = `coach.max_clients` o, si null, `getTierMaxClients(tier)` (constantes en `src/lib/constants.ts`). Solo standalone. Al alcanzarlo: no se crea nada, se manda correo de upgrade y el modal ofrece `/coach/subscription`.
- **PIN/HIBP (gotcha):** no aplica al alta manual (el coach elige la clave). Aplica a reset (§3.6) e import (§3.8). Un PIN puramente numérico lo rechaza la protección de contraseñas filtradas de Supabase (422).
- **Idempotencia de email**: triple defensa — RPC de disponibilidad + error de GoTrue + `23505` del INSERT (todas terminan en el mismo mensaje al usuario).
- El `temp_password` viaja en el correo y se muestra al coach para compartir manualmente; el alumno SIEMPRE cambia (`force_password_change: true`).

---

## 3.2 Lectura de onboarding — `getClientIntakeAction`

Acción de soporte que **alimenta** el modal de edición (§3.3). No es un modal en sí.

- **Firma:** `getClientIntakeAction(clientId: string): { data?: ClientIntakeData; error? }`.
- **Backend:** `getUser` → `resolveCoachScope`. SELECT sobre `clients` con join embebido a `client_intake`: `full_name, phone, coach_id, client_intake(weight_kg, height_cm, goals, experience_level, availability, injuries, medical_conditions)`, filtrado por `.eq('id', clientId).eq('coach_id', coachUser.id)` + `applyOrgScope`. Sin fila → `{ error: 'Alumno no encontrado.' }`.
- Normaliza `client_intake` (puede venir array o objeto) y devuelve `ClientIntakeData` con `null` para campos faltantes.
- Solo lectura, no persiste nada, no revalida.

---

## 3.3 Editar datos — `EditClientDataModal` + `updateClientDataAction`

### Cómo se abre

- La **tabla** (`ClientsDirectoryTable.tsx`) tiene un botón lápiz por fila que hace `setEditingClient({ id, name })`; cuando hay `editingClient` renderiza `<EditClientDataModal clientId clientName open onClose />` (líneas ~288-295 y ~414-421). Las tarjetas tienen su propio gancho (ver doc de cards).
- Al abrir (`open`), el modal llama `getClientIntakeAction(clientId)` (§3.2) para precargar; muestra spinner mientras `loading`, o un error de fetch si lo hubo.
- El `<form action={formAction}>` (con `useActionState(updateClientDataAction, ...)`) lleva un hidden `client_id`. Al `state.success` se cierra solo.

### Campos editables (qué persiste y dónde)

Dos destinos: la fila `clients` (nombre/teléfono) y la tabla `client_intake` (biometría/onboarding).

| Campo | Destino | Tabla |
|---|---|---|
| `full_name` | nombre | `clients.full_name` |
| `phone` | WhatsApp | `clients.phone` (`|| null`) |
| `weight_kg` | peso | `client_intake.weight_kg` |
| `height_cm` | estatura | `client_intake.height_cm` |
| `goals` | objetivo (select fijo) | `client_intake.goals` |
| `experience_level` | experiencia (select) | `client_intake.experience_level` |
| `availability` | días/semana (select) | `client_intake.availability` |
| `injuries` | lesiones (textarea) | `client_intake.injuries` |
| `medical_conditions` | condiciones médicas (textarea) | `client_intake.medical_conditions` |

### Validación (Zod) — `UpdateClientDataSchema`

```
client_id: z.string().uuid()
full_name: z.string().min(2, 'Nombre muy corto').max(100)
phone:     z.string().optional()
weight_kg: z.coerce.number().positive().optional().or(z.literal(''))
height_cm: z.coerce.number().positive().optional().or(z.literal(''))
goals / experience_level / availability / injuries / medical_conditions: z.string().optional()
```

Falla → `{ fieldErrors }`. `weight_kg`/`height_cm` aceptan número positivo o string vacío.

### Backend — `updateClientDataAction`

1. Parse + Zod. `getUser` → `resolveCoachScope`.
2. **UPDATE `clients`** (user-scoped): `{ full_name, phone: phone||null }`, filtrado por `.eq('id', client_id).eq('coach_id', coachUser.id)` + `applyOrgScope`. Error → `{ error: 'Error al actualizar datos del alumno.' }`.
   - **GRANT de columnas:** `full_name` y `phone` están en la allowlist `GRANT UPDATE` de `clients` para `authenticated`; por eso el PATCH user-scoped pasa. (Scoping `org_id/team_id/coach_id` quedan fuera de la allowlist → no editables aquí.)
3. **UPSERT `client_intake`** (`onConflict: 'client_id'`): payload con coerción —
   - `weight_kg`/`height_cm`: `Number(valor)` si no es `''`, si no `0`,
   - `goals/experience_level/availability`: valor o `''`,
   - `injuries/medical_conditions`: valor o `null`.
   - Error → `{ error: 'Error al actualizar datos de onboarding.' }`.
4. `revalidatePath('/coach/clients')` **y** `revalidatePath('/coach/clients/<client_id>')` (refresca también la ficha). Retorna `{ success: true }`.

> Nota de modelo: peso/estatura vacíos se persisten como `0` (no `null`) en `client_intake` — comportamiento intencional del upsert.

---

## 3.4 Archivar / Reactivar — `ArchiveClientButton` + `archiveClientAction` / `unarchiveClientAction`

Archivar es un **soft-archive** (no borra nada): pone `is_archived = true`. Reactivar lo revierte. El botón es un `AlertDialog` de confirmación; el ícono y los textos cambian según `isArchived`.

### Cómo se abre

- En la tabla, `<ArchiveClientButton clientId clientName isArchived={client.is_archived === true} />` por fila (línea ~296). También en cards.
- `handleAction()` corre dentro de `useTransition`: si `isArchived` llama `unarchiveClientAction`, si no `archiveClientAction`. Error inline.
- Copys: archivar → "Perderá acceso a la plataforma temporalmente. Sus datos se conservan. Recibirá un correo de notificación." Reactivar → "Recuperará acceso a la plataforma y recibirá un correo de notificación."

### `archiveClientAction(clientId)` — backend

1. `getUser` → `resolveCoachScope`.
2. SELECT `clients` (`id, full_name, email, coach_id`) con `.eq('id', clientId).eq('coach_id', coachUser.id)` + `applyOrgScope`. Sin fila → `{ error: 'Alumno no encontrado.' }`.
3. **UPDATE `clients` `{ is_archived: true }`** (user-scoped, mismas llaves). Error → `{ error: error.message }`.
4. **Correo (best-effort).** Si el alumno tiene email: SELECT coach (`full_name, brand_name, slug, invite_code`) y envía `buildClientArchivedEmail({ clientName, coachBrandName, coachName, coachEmail, coachPublicUrl })` (URL pública vía `buildCoachStudentUrl`). `.catch(()=>null)`.
5. `revalidatePath('/coach/clients')`. Retorna `{}`.

### `unarchiveClientAction(clientId)` — backend

1. `getUser` → `resolveCoachScope`. SELECT alumno (igual). Sin fila → `'Alumno no encontrado.'`.
2. SELECT coach (`id, max_clients, subscription_tier`). Sin fila → `'Coach no encontrado.'`.
3. **Re-chequeo de límite (clave).** `maxClients = max_clients ?? getTierMaxClients(tier)`. Cuenta activos (`is_archived = false` + scope). Si `!scope.isEnterprise && activeCount >= maxClients` → `{ error: 'Alcanzaste el límite de <maxClients> alumnos activos. Archiva otro alumno antes de reactivar este.' }`. **Reactivar consume cupo del plan**; enterprise no chequea. (Team no se exime explícitamente aquí — solo enterprise; un coach team con cap se vería bloqueado, a diferencia del alta y del cap de §3.1 que sí exime team.)
4. **UPDATE `clients` `{ is_archived: false }`** (user-scoped). Error → `error.message`.
5. **Correo (best-effort):** `buildClientUnarchivedEmail({ clientName, coachBrandName, coachName, loginUrl })` (loginUrl vía `buildCoachStudentUrl(appUrl, coachInfo, '/login')`).
6. `revalidatePath('/coach/clients')`. Retorna `{}`.

> Invariante: archivar conserva TODOS los datos (workout/nutrición/check-ins). Solo bloquea el acceso del alumno. Es reversible, sujeto a cupo de plan al reactivar.

---

## 3.5 Eliminar — `DeleteClientButton` + `deleteClientAction`

Eliminación **dura** (hard delete) con cascade — NO anonimiza. El `AlertDialog` advierte: "Esta acción eliminará su cuenta y todos sus datos asociados. No se puede deshacer."

### Cómo se abre

- En la tabla, `<DeleteClientButton clientId clientName />` por fila (línea ~301). `handleDelete()` corre en `useTransition` → `deleteClientAction(clientId)`, error inline, texto "Eliminando...".

### `deleteClientAction(clientId)` — backend

1. `getUser` → `resolveCoachScope`.
2. SELECT `clients (id)` con `.eq('id', clientId).eq('coach_id', coachUser.id)` + `applyOrgScope`. Sin fila → `{ error: 'Alumno no encontrado.' }`.
3. **Edge case "coach-como-cliente".** SELECT `coaches (id)` por `eq('id', clientId)` (el SELECT a `coaches` es público). Esto detecta si el `clientId` corresponde también a una cuenta coach (caso de cuentas de prueba donde una persona es coach y cliente):
   - **Si es coach** (`coachProfile` existe): **NO** se borra el usuario auth (rompería la cuenta coach). Solo se hace **DELETE de la fila `clients`** (user-scoped: `.eq('id', clientId).eq('coach_id', coachUser.id)` + `applyOrgScope`). Error → `error.message`.
   - **Si NO es coach** (alumno puro): se borra el **usuario auth** con `authAdmin.auth.admin.deleteUser(clientId)` (service-role). Por la FK `clients.id → auth.users(id) ON DELETE CASCADE`, borrar el usuario auth elimina la fila `clients` y, por las cascadas de `clients`, sus datos asociados (logs, check-ins, etc.). Error → `error.message`.
4. `revalidatePath('/coach/clients')`. Retorna `{}` (sin `success` explícito).

### Reglas / invariantes de eliminar

- **Hard delete, irreversible.** No hay anonimización; el data del alumno se va por cascade vía el `deleteUser` de GoTrue (alumno puro) o, en el caso coach-cliente, solo se desvincula la fila `clients` sin tocar la cuenta auth.
- **Scope-protegido:** el coach solo puede eliminar alumnos propios dentro de su scope (`coach_id` + `applyOrgScope`); el SELECT previo es la guarda.
- El `deleteUser` es la **única** parte que necesita service-role real (Admin API).

---

## 3.6 Restablecer contraseña — `ResetPasswordButton` + `resetClientPasswordAction`

Genera una **clave temporal autogenerada** y la muestra al coach para que la comparta. Fuerza cambio en el próximo ingreso del alumno. (Este botón vive en cards / acciones de fila según scope; no aparece en las columnas de la tabla, que solo expone Ver/WA/Editar/Archivar/Eliminar.)

### Cómo se abre (frontend)

- `AlertDialog` con dos vistas:
  1. **Confirmación:** "¿Generar una nueva contraseña temporal para `<clientName>`? El alumno será forzado a cambiarla al ingresar." Botón "Generar contraseña temporal" (`handleReset`, `useTransition`).
  2. **Resultado:** al recibir `result.tempPassword`, muestra la clave en grande (`font-mono tracking-widest`) con botón de **copiar al portapapeles** (`navigator.clipboard.writeText`, feedback "copiado" 2s). Texto: "El alumno deberá cambiar esta contraseña la próxima vez que inicie sesión." Botón "Entendido" resetea el estado local.
- Errores se muestran inline.

### `resetClientPasswordAction(clientId)` — backend

1. `getUser` → `resolveCoachScope`.
2. SELECT `clients (id)` con `.eq('id', clientId).eq('coach_id', coachUser.id)` + `applyOrgScope`. Sin fila → `{ error: 'Alumno no encontrado.' }`.
3. **Generar clave (gotcha PIN/HIBP).** `tempPassword = generateStudentTempPassword()` (`src/lib/auth/temp-credentials.ts`): patrón `Eva${pin}!` donde `pin = Math.floor(100000 + Math.random()*900000)` (6 dígitos). El prefijo `Eva` + sufijo `!` evita que la protección de contraseñas filtradas (HIBP / leaked password protection) de Supabase rechace un PIN puramente numérico con `422 "Password is known to be weak"`. Mismo patrón que usa el alta en mobile → credencial consistente y dictable.
4. **UPDATE auth (service-role).** `authAdmin.auth.admin.updateUserById(clientId, { password: tempPassword })`. Error → `{ error: 'Error al actualizar: <msg>' }`.
5. **Forzar cambio (user-scoped).** UPDATE `clients` `{ force_password_change: true }` con `.eq('id', clientId)` + `applyOrgScope`. (Nota: este UPDATE **no** filtra por `coach_id` — solo `id` + org scope; la guarda real fue el SELECT del paso 2.) Error → `{ error: 'Error al actualizar base de datos.' }`.
6. `revalidatePath('/coach/clients')`. Retorna `{ tempPassword }`.

### Reglas / invariantes del reset

- La clave **se muestra una vez** al coach (no se persiste en claro en DB; queda solo en el hash de auth). Si el coach la pierde, debe regenerar.
- `force_password_change: true` garantiza que el alumno cambie la clave temporal en su próximo login.
- No se envía correo en el reset (a diferencia del alta) — el coach comparte la clave manualmente (copiar/WhatsApp).

---

## 3.7 Pausar / Reactivar acceso — `ToggleStatusButton` + `toggleClientStatusAction`

Diferente de archivar: controla `is_active` (acceso operativo) sin cambiar `is_archived`. Pausado = el alumno no ve rutinas ni registra datos, pero el historial queda intacto. (Este botón vive en cards / acciones de fila según scope; no está en las columnas de la tabla.)

### Cómo se abre

- `AlertDialog`. Ícono `PauseCircle` si activo, `PlayCircle` si pausado. `handleToggle()` (`useTransition`) llama `toggleClientStatusAction(clientId, !isActive)`.
- Copys: pausar → "No podrá ver sus rutinas ni registrar datos, pero su historial se mantendrá intacto." Reactivar → "Volverá a tener acceso completo a la plataforma."

### `toggleClientStatusAction(clientId, isActive)` — backend

1. `getUser` → `resolveCoachScope`.
2. **UPDATE directo `clients` `{ is_active: isActive }`** (user-scoped) con `.eq('id', clientId).eq('coach_id', coachUser.id)` + `applyOrgScope`. (No hay SELECT previo de validación: el filtro por `coach_id` + scope es la guarda; si no matchea, el UPDATE afecta 0 filas sin error.) Error → `{ error: 'Error al actualizar el estado: <msg>' }`.
3. `revalidatePath('/coach/clients')`. Retorna `{}`.

### Reglas / invariantes

- `is_active = false` **no** consume/libera cupo del plan (a diferencia de `is_archived`, que sí — el cap cuenta `is_archived = false`). Pausar es un gate de acceso, no de billing.
- Reversible, sin correo, sin cambio de credenciales.
- `is_active` requiere su `GRANT UPDATE(is_active)` en la allowlist de columnas de `clients`.

---

## 3.8 Importador (alta masiva) — `importClientsAction` + `createClientInternal`

El importador vive en `apps/web/src/app/coach/clients/import/` (subruta `/coach/clients/import`, con su propio `page.tsx` y `_components/`). La acción de servidor es `importClientsAction` (`import/_actions/import.actions.ts`), que reutiliza `createClientInternal` (`_lib/create-client-internal.ts`) por fila.

### Firma y entrada

`importClientsAction(rows: ImportRow[], filename: string, consentConfirmed: boolean): ImportClientsState`

- `ImportRow = { full_name, email, phone?, subscription_start_date? }` (el cliente parsea el CSV/Excel a este array antes de llamar).
- `ImportClientsState` devuelve `{ success, importId, summary: { total, succeeded, failed, skipped }, rowErrors[] }`.

### Validaciones y límites (gates de entrada)

1. **Consentimiento obligatorio:** si `!consentConfirmed` → `'Debes confirmar el consentimiento de protección de datos (Ley 19.628) para continuar.'`
2. `getUser` → si no, `'No autenticado.'`.
3. **Permiso por rol enterprise:** `getCoachOrgContext()`; si es org user pero NO org admin (`isOrgUser && !isOrgAdmin`) → `'Tu rol no permite importar alumnos.'` (un coach enterprise plano no importa). `orgId = isOrgAdmin ? ctx.orgId : null`.
4. **Contexto team:** si no hay `orgId`, resuelve `resolveCoachScope`; si hay `activeTeamId`, las filas entran al **pool del team** (`team_id`), no a la cartera personal; busca `teams(slug, name)` para el login path y el brand del correo.
5. SELECT coach (`id, slug, full_name, brand_name, welcome_message, subscription_tier, max_clients`). Sin fila → `'Coach no encontrado.'`.
6. **Capacidad de tier:** `caps = getTierCapabilities(tier)` (tier default `'free'` aquí). Si `!orgId && !activeTeamId && !caps.canImportClients` → `'upgrade_required'` (la importación CSV es feature de tier, no de free).
7. **Filas:** `rows.length === 0` → `'No hay filas para importar.'`; `> 1000` → `'El archivo supera el límite de 1.000 filas. Dividilo en partes.'`
8. **Cap de alumnos (solo standalone):** `maxClients = max_clients ?? getTierMaxClients(tier)`; cuenta activos (`is_archived = false`, `coach_id`). Si `activeCount + rows.length > maxClients` → error con el desglose ("Tu plan permite X, tenés Y, querés importar Z..."). Org/team no chequean cap.

### Auditoría + ejecución

- **Registro de import:** INSERT en `client_imports` (`{ coach_id|org_id, filename, total_rows, status: 'processing', consent_confirmed_at }`), devuelve `id`. Fallo → `'Error al registrar el import.'`.
- **Dedup previo:** SELECT de emails existentes (`.in('email', emailsToCheck)` acotado por org/team/coach) → set `existingEmails`.
- **Procesamiento por chunks de 10** (`Promise.allSettled`), por fila:
  1. **CSV-injection sanitization:** `sanitizeCell(...)` sobre `full_name`, `email`, `phone` (neutraliza fórmulas `=`/`+`/`-`/`@`).
  2. **Zod por fila** (`importRowSchema`: `full_name` 2-100, `email` válido, `phone`/`fecha` opcionales). Falla → push a `rowErrors`.
  3. **Skip duplicados:** si el email ya existe (`existingEmails`) o ya apareció en el batch (`seenInBatch`) → `skipped++`.
  4. **Normaliza fecha** (`normalizeImportDate`: soporta `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, o `new Date()` como fallback; inválida → `null`).
  5. **Crea** vía `createClientInternal(supabase, authAdmin, coachCtx, data, { sendEmail })` con `temp_password = generateTempPassword()` (12 chars alfanuméricos sin ambiguos — distinto del patrón `Eva${pin}!` del reset). El brand del correo en contexto team es `team.name`.
  6. `result.ok` → `succeeded++`; si no → push a `rowErrors`.
  - Tras cada chunk, UPDATE parcial de `client_imports` (`success_count`, `error_count`) para progreso.
- **Cierre:** UPDATE final de `client_imports` con `status` (`'failed'` si todas fallaron, si no `'completed'`), counts, `errors` (jsonb con los `rowErrors`) y `completed_at`. `revalidatePath('/coach/clients')`.

### `createClientInternal` — diferencias con `createClientAction`

Misma médula (disponibilidad de email → `createUser` service-role → INSERT `clients` user-scoped con rollback de auth si falla → `createClientIdentity` no-fatal → correo de bienvenida opcional), pero:
- Recibe un `CoachContext` explícito (`{ id, slug, full_name, brand_name, welcome_message, orgId?, teamId?, loginPath? }`) en vez de leer el coach adentro.
- En enterprise (`orgId` presente) inserta con `coach_id: null` (pool de org); en team con `coach_id = creador` + `team_id`.
- **No** chequea cap de tier ni inserta `coach_client_assignments` (eso lo gobierna el caller / RLS).
- **No** estampa `age_confirmed_at` (el consentimiento del import es a nivel de lote en `client_imports.consent_confirmed_at`, Ley 19.628, no por alumno).
- `sendEmail` configurable (default `true`); el correo es fire-and-forget (`.catch`).
- Devuelve `CreateClientResult` discriminado (`{ ok: true, clientId, loginUrl }` | `{ ok: false, error, code }` con `code ∈ duplicate_email | db_error | auth_error`).

---

## 3.9 Resumen de las 8 server actions (`clients.actions.ts`)

| Acción | Entrada | Valida (Zod) | Persiste / efecto | service-role | revalidate |
|---|---|---|---|---|---|
| `createClientAction` | `FormData` (full_name, email, phone, fecha, temp_password, age_confirmed) | `CreateClientSchema` | `auth.createUser` + INSERT `clients` (+ `coach_client_assignments` en org) + identity + correo bienvenida | createUser/deleteUser + assignment (org) | `/coach/clients` |
| `getClientIntakeAction` | `clientId` | — | solo lectura (clients + client_intake) | no | — |
| `updateClientDataAction` | `FormData` (client_id + datos) | `UpdateClientDataSchema` | UPDATE `clients` (name/phone) + UPSERT `client_intake` | no | `/coach/clients` + `/coach/clients/<id>` |
| `deleteClientAction` | `clientId` | — | DELETE fila `clients` (coach-cliente) **o** `auth.deleteUser` cascade (alumno puro) | deleteUser | `/coach/clients` |
| `resetClientPasswordAction` | `clientId` | — | `auth.updateUserById(password)` + `clients.force_password_change=true`; devuelve clave | updateUserById | `/coach/clients` |
| `archiveClientAction` | `clientId` | — | UPDATE `clients.is_archived=true` + correo | no | `/coach/clients` |
| `unarchiveClientAction` | `clientId` | — | re-chequeo cap + UPDATE `clients.is_archived=false` + correo | no | `/coach/clients` |
| `toggleClientStatusAction` | `clientId, isActive` | — | UPDATE `clients.is_active` | no | `/coach/clients` |

> Notas transversales finales:
> - Todas (salvo `getClientIntakeAction`) terminan en `revalidatePath('/coach/clients')` para refrescar el War Room; solo `updateClientDataAction` además revalida la ficha.
> - El **cap de plan** se evalúa al **crear** (alta + import) y al **reactivar** (`unarchive`), no al pausar/reactivar acceso (`toggleStatus`). Enterprise siempre exento; team exento en alta/import pero NO en `unarchive`.
> - El **service-role** aparece solo en operaciones GoTrue Admin (create/update/delete user) y en el INSERT de `coach_client_assignments` (org). Todo lo demás es user-scoped + RLS.
> - **Anonimización:** no existe — eliminar es hard delete por cascade; archivar es el camino reversible que conserva data.
