# 1. Login del alumno, primer acceso y acceso pausado

> Embudo de activación del alumno. Cubre el login branded (`/c/[coach_slug]/login` y su espejo de pool `/t/[team_slug]/login`), el primer acceso forzado (`change-password`) y el estado pausado (`suspended`). Énfasis backend: qué datos llegan, qué se valida, cómo se autentica, qué persiste, qué redirige.

---

## 1.1. Mapa de archivos

| Capa | Archivo |
|------|---------|
| RSC página login | `apps/web/src/app/c/[coach_slug]/login/page.tsx` |
| Form (client) | `apps/web/src/app/c/[coach_slug]/login/ClientLoginForm.tsx` |
| Animación de entrada | `apps/web/src/app/c/[coach_slug]/login/_components/LoginEntrance.tsx` |
| Server actions | `apps/web/src/app/c/[coach_slug]/login/_actions/login.actions.ts` |
| Queries de branding | `apps/web/src/app/c/[coach_slug]/login/_data/login.queries.ts` |
| Primer acceso (RSC) | `apps/web/src/app/c/[coach_slug]/change-password/page.tsx` |
| Pausado (RSC) | `apps/web/src/app/c/[coach_slug]/suspended/page.tsx` |
| Login de pool (espejo) | `apps/web/src/app/t/[team_slug]/login/_actions/login.actions.ts` |
| Schemas Zod | `packages/schemas/auth.ts` |
| Base path del alumno | `apps/web/src/lib/client/base-path.ts` |
| Resolución de identificador del coach | `apps/web/src/lib/coach/invite-code.ts` |
| Workspace service | `apps/web/src/services/auth/workspace.service.ts` |
| Datos del estado pausado | `apps/web/src/app/c/[coach_slug]/_data/client-root.queries.ts` |

---

## 1.2. Login branded del alumno — `page.tsx` (RSC)

Es la **primera impresión de la marca del coach**, renderizada server-side sin sesión (pre-auth).

### Resolución del `coach_slug` (identificador dual)

El segmento `[coach_slug]` de la URL puede ser **dos cosas distintas**, resueltas por `coachIdentifierColumn(coachSlug)` (`lib/coach/invite-code.ts`):

- Si matchea el patrón `INVITE_CODE_PATTERN = /^[A-Z2-9]{5}$/` (5 chars, alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — sin caracteres ambiguos `0/O/1/I`) → se busca por columna `invite_code` (identificador primario actual).
- En cualquier otro caso → se busca por columna `slug` (legacy, editable).

> Consecuencia: un coach **code-only** (sin slug legacy) nunca 404ea, porque la URL `/c/AB3KP/login` resuelve por `invite_code`.

### Datos de branding que llegan — `getClientLoginCoach` (`login.queries.ts`)

`React.cache` query sobre `coaches`, **sin sesión** (RLS: `coaches` tiene SELECT público/anon para estas columnas — ver memoria del incidente de anon-grant 2026-06-21). Columnas pedidas (`SELECT` específico, no `*`):

```
brand_name, primary_color, logo_url, welcome_message, subscription_tier,
brand_secondary_color, accent_light, accent_dark, logo_url_dark, brand_font_key
```

Si no hay fila → `null` → `page.tsx` llama `notFound()`.

### Gate de branding (white-label v2)

`isBrandingAllowed(coach.subscription_tier ?? 'free')` (de `@eva/tiers`) decide si el branding del coach se muestra **pre-auth**:

- **Pro+** → branding completo: `primary_color`, `accent_light/dark`, `brand_secondary_color`, `logo_url`, `brand_font_key`.
- **free/starter** → degrada a visual EVA: color `BRAND_PRIMARY_COLOR = '#10B981'`, logo EVA (no del coach), fuente vacía (Inter), accents nulos. **Pero conserva el `brand_name`** (identidad del coach) y el `welcome_message`.

Esto cierra el "gate-leak": la query antes no miraba tier y filtraba branding de pago a planes gratuitos.

### Resolución de tema y fuente

- `resolveBrandTheme({ brandColor, accentLight, accentDark, secondaryLight, secondaryDark })` (de `@eva/brand-kit`) → `theme.light.accent` / `theme.dark.accent`.
- `generateBrandPalette(theme.light.accent).primaryRgb` → triplete RGB para glows.
- `resolveBrandFontStack(brandFontStack)` (de `lib/brand-fonts`) — solo aplica al wordmark/título `h1`; inputs/cuerpo quedan en Inter (primera pantalla sin cache de fuentes).
- El acento por-modo se inyecta vía `<style>` scoped a `.login-brand` (variables CSS `--login-accent`, `--login-accent-rgb`, `--login-font`).

### Qué se renderiza (funcional)

- **Header de marca**: logo del coach (`logoUrl`, solo si `brandingAllowed`) o ícono `Dumbbell` de fallback; `h1` con `coach.brand_name`; subtítulo con `coach.welcome_message?.trim()` o fallback `'Tu plataforma de entrenamiento personalizado'`.
- **`ClientLoginForm`** (recibe `coachSlug`, `primaryColor=theme.light.accent`, `brandName`, `logoUrl`).
- Pie "Impulsado por **EVA**" (powered-by discreto, no removible).
- `<InstallPrompt brandName={coach.brand_name} />` (prompt PWA).

### Metadata — `generateMetadata` + `getClientLoginMetadataCoach`

Query separada (más liviana: solo `brand_name, logo_url`). Genera:
- `title: 'Ingresar | {brandName}'` (fallback `'Mi Coach'`).
- `manifest: '/api/manifest/{coach_slug}'` (manifest PWA por-coach).
- `appleWebApp` con `title: brandName`.
- `icons`: si hay `logo_url` usa ese; si no, `BRAND_APP_ICON`.

> Nota: la metadata **no aplica el gate de tier** — un coach free podría exponer su `logo_url` en los íconos/manifest aunque el body lo degrade. Es una asimetría a considerar en el rediseño.

---

## 1.3. Form de login — `ClientLoginForm.tsx` (`'use client'`)

### Estructura

- `useActionState(clientLoginAction, initialState)` → maneja `state` y `formAction`.
- Form con `action={formAction}` y un **hidden input** `coach_slug` (el segmento de URL viaja como dato del form).
- Campos:
  - `email` (`type=email`, `autoComplete=email`, `required`).
  - `password` (`type=password`, `autoComplete=current-password`, `required`).
- Link "¿Olvidaste tu contraseña?" → `/forgot-password?coach_slug={coachSlug}`.
- Botón submit (`SubmitButton` usa `useFormStatus().pending` → muestra spinner "Ingresando...").
- Bloque de error si `state.error`.

### Redirect en éxito (client-side) — efecto "Intelligent Redirect"

`useEffect` que dispara cuando `state.success && state.redirectUrl`:

1. Persiste **sticky branding** en `localStorage`:
   - `last_coach_slug = coachSlug`
   - `coach_brand_name = brandName`
   - `coach_logo_url = logoUrl` (o `removeItem` si null)
2. `router.push(state.redirectUrl)`.

> El redirect es client-side (no `redirect()` del server action). El server action retorna `{ success, redirectUrl }` y el cliente navega — esto permite escribir el `localStorage` antes de salir.

---

## 1.4. Animación de entrada — `LoginEntrance.tsx`

- `LoginEntrance`: contenedor con `framer-motion` `staggerContainer(0.1, 0.05)` (`initial="hidden" animate="show"`).
- `LoginEntranceItem`: hijo con `fadeSlideUp` + spring (`stiffness 260, damping 26`).
- **Reduced-motion aware**: si `useReducedMotion()` → renderiza `<div>` plano sin transform (totalmente visible).
- Nota arquitectónica del código: `LoginEntranceItem` es **export nombrado independiente**, NO un static prop `LoginEntrance.Item` — porque la página es RSC y las static props de client components se pierden cruzando el límite server/client (quedarían `undefined`).

---

## 1.5. `clientLoginAction` — autenticación (backend, el corazón)

`'use server'` en `login.actions.ts`. Firma `(_prev, formData) → ClientLoginState`.

### Paso 1 — validación de entrada (`ClientLoginSchema`)

De `packages/schemas/auth.ts`:

```
ClientLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),  // ← min(1), NO 8
  coach_slug: z.string(),
})
```

> El **login** solo exige password no vacío (`min(1)`); el mínimo de 8 es del `ChangePasswordSchema`/reset, no del login. Si falla el parse → `{ error: parsed.error.issues[0].message }`.

### Paso 2 — autenticación Supabase

`supabase.auth.signInWithPassword({ email, password })` (cliente SSR user-scoped, `createClient()`).

- Si `error` → `{ error: 'Email o contraseña incorrectos.' }` (mensaje genérico, no distingue email-no-existe de password-mala → no es oráculo de cuentas).
- `supabase.auth.getUser()` para obtener el `user`; si falla → `{ error: 'Error al obtener sesión.' }`.

> **NO hay rate-limit explícito en este action.** El throttle es el de GoTrue/Supabase a nivel de IP (ver memoria límites Micro: auth ~1800/h por IP, burst 30). No se ve `rate-limit.ts` (Upstash) invocado aquí. A diferencia del login de coach/org, este action no pasa captcha (`captchaToken` no se usa).

### Paso 3 — resolución del coach por el slug del form

Lecturas **user-scoped** (pasan RLS del alumno recién logueado, sin service key — anotación R3 auditoría 2026-06-11):

- `INVITE_CODE_RE = /^[A-Z2-9]{5}$/` (replicado inline, no importado del helper).
- Busca en `coaches` por `invite_code` (si matchea patrón) o `slug`, selecciona solo `id`, `.maybeSingle()`.
- Si no hay coach → `supabase.auth.signOut()` + `{ error: 'Coach no encontrado.' }`.

### Paso 4 — verificación de pertenencia del alumno

Lee la fila `clients` del propio usuario:

```
clients.select('id, force_password_change, is_active, coach_id, org_id').eq('id', user.id).maybeSingle()
```

(RLS: `clients` permite self → `clients.id = auth.uid()`).

Tres ramas de matcheo:

1. **`rawClient.coach_id === coach.id`** (caso directo standalone/enterprise): `client = rawClient`. `matchedWorkspace` = `student_enterprise` si tiene `org_id`, si no `student_standalone`.

2. **`rawClient.coach_id !== coach.id` PERO `rawClient.org_id` existe** (entrar por el slug de OTRO coach de su misma org — enterprise): usa **service role REAL** (`createServiceRoleClient()`) acotado a verificar `organization_members` por `org_id + coach_id + status='active' + deleted_at IS NULL`. Si existe el `orgMember` → `client = rawClient` y `matchedWorkspace = student_enterprise` con label `Entrenar con {org.name}`.
   > R2 (auditoría 2026-06-11): el alumno NO tiene RLS sobre `organization_members`; con la sesión del alumno esta rama daba siempre null. Por eso aquí (y SOLO aquí) se usa service role.

3. **Ningún match** → `client` queda null.

### Paso 5 — guards de estado

- Si `!client` → `signOut()` + `{ error: 'No tienes acceso a esta plataforma.' }`.
- Si `client.is_active === false` → `signOut()` + `{ error: 'Tu cuenta ha sido pausada. Contacta a tu coach para más información.' }`.
  > **El pausado se detecta y se cierra sesión EN el login** (no hay redirect a `/suspended` desde aquí). La página `/suspended` aplica para el caso de un alumno con sesión viva que es pausado y golpea un guard de layout — ver §1.8.

### Paso 6 — persistir workspace activo

Si hay `matchedWorkspace` → `setLastWorkspace(supabase, matchedWorkspace)` (`workspace.service.ts`):
- `upsertWorkspacePreference` en la tabla de preferencias (`last_workspace_type`, `last_org_id`, `last_coach_id`, `last_client_id`, `updated_at`).
- Si el workspace tiene `orgId` y cambió respecto al previo → escribe `org_audit_logs` (`workspace.switched`/`workspace.activated`).

> El workspace **standalone** también escribe preferencia (sin auditoría, porque no tiene `orgId`). Esto soporta cuentas multi-mundo (un mismo account puede ser alumno de varios coaches/orgs).

### Paso 7 — redirect

```
redirectUrl = client.force_password_change
  ? `/c/${coach_slug}/change-password`
  : `/c/${coach_slug}/dashboard`
```

Retorna `{ success: true, redirectUrl }` → el cliente (form) navega.

> **Gotcha de base-path**: este action **hardcodea `/c/...`** en el redirect del login. El alumno de **pool/team** que entra por `/t/[team_slug]/login` usa un **action distinto** (`teamClientLoginAction`, §1.7) que sí rutea a `/t/...`. El `clientLoginAction` es solo para el árbol `/c`.

### Estados de retorno (`ClientLoginState`)

| Situación | Retorno |
|-----------|---------|
| Validación falla | `{ error: <mensaje Zod> }` |
| Credenciales malas | `{ error: 'Email o contraseña incorrectos.' }` |
| Sin sesión post-login | `{ error: 'Error al obtener sesión.' }` |
| Coach no existe | `signOut` + `{ error: 'Coach no encontrado.' }` |
| No es alumno de este coach | `signOut` + `{ error: 'No tienes acceso a esta plataforma.' }` |
| Cuenta pausada | `signOut` + `{ error: 'Tu cuenta ha sido pausada...' }` |
| Éxito (primer acceso) | `{ success, redirectUrl: '/c/{slug}/change-password' }` |
| Éxito (normal) | `{ success, redirectUrl: '/c/{slug}/dashboard' }` |

---

## 1.6. Primer acceso — `change-password` (forzar clave propia)

### Cuándo se fuerza

Se dispara cuando la fila `clients` tiene **`force_password_change = true`**. Esa flag la setea el alta del alumno (el coach crea la cuenta con una clave temporal — ver memoria del helper `generateStudentTempPassword` → `Eva${n}!`). El `clientLoginAction` ya redirige a `change-password` cuando la detecta (§1.5 Paso 7).

> El campo en `clients` se llama `force_password_change` en la query del login. (El layout/proxy del árbol `/c` también lo gatea para evitar bypass directo del dashboard sin cambiar clave.)

### Página — `change-password/page.tsx` (`'use client'`)

- `use(params)` para obtener `coach_slug`.
- `useActionState(changePasswordAction, initialState)`.
- Campos: `password` (`type=password`, `required`, `minLength={8}`, placeholder "Mínimo 8 caracteres") + `confirm_password` (`required`). Hidden `coach_slug`.
- Botón "Guardar nueva contraseña" (spinner "Guardando..." vía `useFormStatus`).
- Ícono `ShieldCheck`, copy: "Es tu primer acceso. Por seguridad, debes crear una contraseña propia."

### `changePasswordAction` (backend)

En el mismo `login.actions.ts`:

1. **Validación** `ChangePasswordSchema`:
   ```
   password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
   confirm_password: z.string(),
   coach_slug: z.string(),
   .refine(password === confirm_password, 'Las contraseñas no coinciden', path: confirm_password)
   ```
2. `supabase.auth.getUser()` — si no hay user → `{ error: 'Sesión expirada. Por favor inicia sesión de nuevo.' }`.
3. `supabase.auth.updateUser({ password })` — si `authError` → retorna `authError.message` **crudo** (sin traducir).
4. `clients.update({ force_password_change: false }).eq('id', user.id)` (RLS self: policy "Client can update their own profile" — user-scoped, sin service role).
5. `redirect(`${await getClientBasePath(coach_slug)}/dashboard`)`.

> **`getClientBasePath` respeta el base path REAL** (header `x-client-base-path` que setea el proxy para `/e/[org_slug]` y `/t/[team_slug]`). Por eso el change-password **sí** rutea correctamente a `/t/.../dashboard` para alumnos de pool, a diferencia del redirect hardcoded `/c` del login. Fallback: `/c/${coachSlug}`.

### Gotcha HIBP (clave débil rechazada) — CRÍTICO para el rediseño

Supabase tiene **leaked-password protection ON** (HaveIBeenPwned). Esto rechaza con **422** cualquier clave que aparezca en brechas conocidas — incluido un **PIN numérico de 6 dígitos puro** (memoria `project_hibp_numeric_pin_gotcha`). Consecuencias:

- En el `change-password` actual, el error de HIBP llega como `authError.message` **crudo** (no se traduce ni se da guía al alumno → UX confusa: "el alumno no entiende por qué su clave no sirve").
- El **reset de clave de coach→alumno** estuvo roto por esto (web+mobile); fix = `generateStudentTempPassword` genera `Eva${n}!` (no un PIN puro) para no chocar con HIBP.
- El `minLength={8}` del input + `min(8)` de Zod **no** garantizan pasar HIBP (una clave de 8 chars común igual puede estar filtrada). El filtro corre en la capa API de GoTrue, no en validación cliente/server.

> En el rediseño: capturar el 422 de HIBP y mostrar un mensaje accionable en español ("Esa contraseña es demasiado común, elige otra"), no el `authError.message` crudo.

---

## 1.7. Login de pool / team — `/t/[team_slug]/login` (espejo)

`teamClientLoginAction` en `apps/web/src/app/t/[team_slug]/login/_actions/login.actions.ts`. Ruta nueva, zero-regresión (standalone sigue `/c`, enterprise `/e`).

### Schema

`TeamClientLoginSchema = ClientLoginSchema.omit({ coach_slug }).extend({ team_slug: z.string().trim().min(1) })` — mismas reglas email+password, pero `team_slug` en vez de `coach_slug`.

### Flujo backend

1. Parse; si falla → `{ error: 'Completa tu email y contraseña.' }`.
2. `signInWithPassword`; si falla → `{ error: 'Email o contraseña incorrectos.' }`.
3. `getUser`; si falla → `{ error: 'Error al obtener sesión.' }`.
4. **Service role** (`createServiceRoleClient()`) para todo lo siguiente:
   - Buscar `teams` por `slug` + `deleted_at IS NULL` → si no existe `{ error: 'Equipo no encontrado.' }`.
   - **Fuente de verdad**: `client_memberships` con `account_id=user.id, team_id, scope='team', status='active', deleted_at IS NULL` → `client_id`.
   - **Fallback compat**: si no hay membership, deriva de `clients` por `team_id` (`client.team_id === team.id`); si no matchea → `signOut` + `{ error: 'No tienes acceso a este equipo.' }`.
5. **Guard de estado**: `clients.select('is_active, is_archived')`; si `is_active === false` o `is_archived === true` → `signOut` + `{ error: 'Tu cuenta está pausada. Contacta a tu equipo.' }`.
6. Éxito → `{ success: true, redirectUrl: '/t/${teamSlug}/dashboard' }`.

### Diferencias clave vs `/c`

| Aspecto | `/c` (`clientLoginAction`) | `/t` (`teamClientLoginAction`) |
|---------|---------------------------|-------------------------------|
| Identificador | `coach_slug` (slug o invite_code) | `team_slug` |
| Resolución de pertenencia | RLS user-scoped + service role solo para org peers | Todo service role (`teams`, `client_memberships`, `clients`) |
| Fuente de verdad | fila `clients.coach_id`/`org_id` | `client_memberships` scope='team' (fallback `clients.team_id`) |
| Guard de pausa | `is_active === false` | `is_active === false` **OR** `is_archived === true` |
| `force_password_change` | **SÍ** → redirige a change-password | **NO se chequea** (rutea directo a dashboard) |
| Workspace | `setLastWorkspace` | **No setea** (el proxy `/t` resuelve por RPC) |
| Redirect | `/c/{slug}/dashboard` (hardcoded) | `/t/{teamSlug}/dashboard` |

> **Inconsistencia funcional a unificar en el rediseño**: el login de pool **no fuerza el cambio de clave en primer acceso** (no lee `force_password_change`) y **no considera `is_archived`** en el de `/c`. El primer acceso del alumno de pool podría quedar con la clave temporal del coach. (El layout `/t` podría re-gatearlo, pero el action no lo hace.)

---

## 1.8. Acceso pausado — `suspended/page.tsx` (RSC)

### Cuándo aparece

El `clientLoginAction` cierra sesión al detectar pausa, así que esta página es para el caso de **sesión viva que cae en un guard de layout** (el alumno fue pausado mientras navegaba, o golpea una ruta protegida y el guard del árbol `/c` lo manda a `/suspended`). Es una pantalla de **callejón sin salida controlado**.

### Datos — `getSuspendedCoachData(coachSlug)` (`client-root.queries.ts`)

`React.cache`:

1. `getClientRootUser()` (raíz de auth de lectura — usa `supabase.auth.getClaims()`, verificación **local** del JWT ES256 + JWKS cacheado, sin round-trip a GoTrue `/user`). Si no hay user → `{ user: null, coach: null, isTeam: false }`.
2. **Detección de contexto team** vía `getTeamBrandContext()` (headers del proxy):
   - `x-client-base-path` empieza con `/t`, **o** `x-workspace-brand-source === 'organization'` → `isTeam = true`.
   - Si `isTeam` → retorna `coach: { brand_name: teamBrandName || 'tu equipo', whatsapp: null }`. **Nunca expone el WhatsApp/marca PERSONAL del coach al alumno de pool** (la suspensión la gestiona el dueño del team; los teams no tienen canal de soporte por columna → `whatsapp: null`).
3. Standalone (no team): `coaches.select('brand_name, whatsapp').eq(coachIdentifierColumn(coachSlug), coachSlug)`.

### Página

- Si `!user` → `redirect(`${base}/login`)` (`base = getClientBasePath(coach_slug)`).
- `brandName = coachData?.brand_name || (isTeam ? 'tu equipo' : 'tu Coach')`.
- Copy: "Tu acceso a la plataforma está temporalmente suspendido... contacta a **{brandName}**... Todos tus progresos y datos están a salvo." (tranquiliza: no se perdió data).
- **Acciones ofrecidas**:
  - Si `coachData?.whatsapp` existe → botón "Contactar a mi Coach" / "Contactar a mi equipo" (link `https://wa.me/{whatsapp sin no-dígitos}`, `target=_blank`). En contexto team `whatsapp` es null → **el botón de contacto no aparece** (solo queda cerrar sesión).
  - Form `POST /auth/signout` con botón "Cerrar Sesión" (ícono `LogOut`).

> Limitación funcional: el alumno de **pool pausado no tiene canal de contacto** en esta pantalla (whatsapp forzado a null y no hay columna de soporte del team). Solo puede cerrar sesión. Punto a resolver en el rediseño (ej. mostrar el nombre del team + un CTA genérico).

---

## 1.9. Resumen de redirects y persistencia

| Origen | Condición | Destino |
|--------|-----------|---------|
| `/c/.../login` éxito | `force_password_change=true` | `/c/{slug}/change-password` |
| `/c/.../login` éxito | normal | `/c/{slug}/dashboard` |
| `/t/.../login` éxito | siempre | `/t/{teamSlug}/dashboard` |
| `change-password` éxito | — | `{getClientBasePath}/dashboard` (respeta `/c` o `/t`) |
| `/suspended` sin user | — | `{base}/login` |
| `/suspended` "Cerrar sesión" | — | `POST /auth/signout` |

**Persistencia que ocurre en el login (backend):**
- `clients.force_password_change → false` (al guardar clave nueva).
- Auth: nueva contraseña vía `auth.updateUser`.
- Tabla de preferencias de workspace (`setLastWorkspace`) — solo en `/c`, no en `/t`.
- `org_audit_logs` (`workspace.activated`/`workspace.switched`) — solo workspaces con `orgId`.

**Persistencia client-side (localStorage, sticky branding para "Intelligent Redirect"):** `last_coach_slug`, `coach_brand_name`, `coach_logo_url`.

---

## 1.10. Hallazgos / riesgos para el rediseño con parity

1. **HIBP sin traducir** (§1.6): `change-password` muestra `authError.message` crudo; PIN numérico o clave común → 422 confuso. Capturar y mostrar mensaje accionable.
2. **Redirect `/c` hardcoded** en `clientLoginAction` (§1.5): el login de `/c` no usa `getClientBasePath`; funciona solo porque pool usa otro action. Frágil si se unifican rutas.
3. **Login de pool no fuerza primer acceso** (§1.7): `teamClientLoginAction` ignora `force_password_change` → alumno de pool puede quedar con clave temporal del coach.
4. **Asimetría de guard de pausa**: `/c` usa solo `is_active`; `/t` usa `is_active OR is_archived`. Unificar la definición de "cuenta accesible".
5. **Pausado de pool sin contacto** (§1.8): whatsapp null, sin canal alternativo → solo cerrar sesión.
6. **Metadata vs gate de tier** (§1.2): `generateMetadata` expone `logo_url` del coach en íconos/manifest sin aplicar `isBrandingAllowed` (el body sí lo aplica).
7. **Sin rate-limit a nivel de action** (§1.5): se depende del throttle de GoTrue por IP; sin captcha en login de alumno. Considerar Upstash si el abuso escala.
8. **`INVITE_CODE_RE` duplicado inline** en `clientLoginAction` en vez de importar `INVITE_CODE_PATTERN`/`coachIdentifierColumn` — riesgo de drift si cambia el patrón.
9. **Mensajes de error genéricos** ("Email o contraseña incorrectos") son buenos por seguridad (no-oráculo), pero "No tienes acceso a esta plataforma" puede confundir a un alumno que entró por el slug equivocado del coach.
