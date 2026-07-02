# 4. Selector de workspace y backend de cuentas del coach

> Esta sección documenta dos cosas entrelazadas: (1) el **selector de workspace** (`/workspace/select`) que aparece cuando un mismo email tiene varios contextos, y (2) el **backend consolidado de cuentas del coach** (cómo se crea, autentica y enruta una cuenta de coach en EVA). El énfasis es backend: qué se valida, cómo se persiste el contexto activo, qué columnas son compra-only y qué claims emite el JWT. Frontend solo a nivel funcional.

---

## 4.1. Modelo de "workspace": por qué existe el selector

EVA es B2B2C white-label con varias formas: coach standalone, coach dentro de una organización enterprise, coach dentro de un team (pool plano), staff enterprise (admin de org), y alumno (standalone / enterprise / team). **Un mismo `auth.uid()` puede pertenecer a varios de estos contextos a la vez** (ej. un coach que también es alumno de otro coach, o un coach standalone que además es co-gestor de un team). EVA separa datos, marca y permisos **por workspace**, no por usuario.

El tipo canónico es `WorkspaceType` en `apps/web/src/domain/auth/types.ts`:

- `coach_standalone`
- `enterprise_coach`
- `enterprise_staff`
- `coach_team`
- `student_standalone`
- `student_enterprise`
- `student_team`

`ActiveWorkspace` es una unión discriminada por `type`, cada variante con su set de identificadores (`userId` siempre; luego `coachId`, `orgId`, `memberId`, `teamId`, `clientId`, `role` según corresponda). `WorkspaceSummary = ActiveWorkspace & { label, brandName?, slug?, isLastUsed? }` es lo que se renderiza/persiste.

---

## 4.2. Cómo se listan los workspaces de un email

`listUserWorkspaces(db, userId)` en `apps/web/src/services/auth/workspace.service.ts` es la fuente única. Llama a `findWorkspaceIdentityRows(db, userId)` (repository `apps/web/src/infrastructure/db/workspace.repository.ts`), que en **paralelo** (`Promise.all`) consulta cuatro tablas de identidad por el mismo `userId`:

1. `coaches` (where `id = userId`) — selecciona `id, full_name, brand_name, slug, logo_url, primary_color, subscription_status, active_org_id`.
2. `clients` (where `id = userId`) — `id, full_name, coach_id, org_id, team_id`.
3. `organization_members` (where `user_id = userId AND status = 'active' AND deleted_at IS NULL`) — `id, org_id, coach_id, role, status`.
4. `team_members` (where `coach_id = userId AND status = 'active' AND deleted_at IS NULL`) — join a `teams`.

Luego un segundo `Promise.all` resuelve los nombres/marcas (`organizations`, `coaches` referenciados por members/client, y el `teams` del alumno por `client.team_id`).

Reglas de armado (`listUserWorkspaces`):

- **`coach_standalone`**: se agrega solo si existe fila `coaches` **y** su `subscription_status` NO es `'org_managed'` ni `'team_managed'`. Un coach `org_managed`/`team_managed` no tiene identidad standalone — su workspace es el enterprise/team respectivo, no un standalone fantasma. `label = brand_name || full_name || 'Mi negocio EVA'`.
- **`enterprise_coach`**: por cada `organization_members` con `role === 'coach' && coach_id`. `label = "${org.name} - Coach"`.
- **`enterprise_staff`**: por cada member cuyo `role` esté en `ENTERPRISE_STAFF_ROLES` (`org_owner`, `org_admin`, `ops`, `analyst`, `brand_manager`). `label = "${org.name} - Admin"`, lleva `role`.
- **`coach_team`**: por cada `team_members` activo. El repositorio aplica un **kill-switch**: si el team tiene `deleted_at` o `suspended_at`, el workspace es invisible (el coach cae a su otro contexto). `coachId = coach?.id ?? userId`. `label = "${team.name} - Equipo"`.
- **Alumno** (mutuamente excluyente por prioridad): si `client.org_id` → `student_enterprise`; si `client.team_id` (+ team vivo) → `student_team`; si `client.coach_id` → `student_standalone`.

El resultado pasa por `dedupeWorkspaces` (dedup por `workspaceKey`).

> Existe además `listClientWorkspaces` (split de identidad vía tabla `client_memberships`), pero ese es el camino del **alumno**, no del coach, y con fallback a la lógica legacy de `clients`. No afecta el selector que ve el coach.

### `workspaceKey` — identidad estable de cada opción

`workspaceKey(workspace)` produce una clave determinista por tipo (lo que viaja como `<input name="workspace_key">`):

| Tipo | Clave |
|---|---|
| `coach_standalone` | `coach_standalone:<coachId>` |
| `enterprise_coach` | `enterprise_coach:<orgId>:<coachId>` |
| `enterprise_staff` | `enterprise_staff:<orgId>:<memberId>` |
| `coach_team` | `coach_team:<teamId>` |
| `student_team` | `student_team:<clientId>:<teamId>` |
| `student_standalone` | `student_standalone:<clientId>:<coachId>` |
| `student_enterprise` (default) | `student_enterprise:<clientId>:<orgId>` |

---

## 4.3. La página `/workspace/select`

Archivo: `apps/web/src/app/workspace/select/page.tsx` (RSC).

1. `createClient()` (Supabase SSR) + `supabase.auth.getClaims()` — **verificación local del JWT (ES256), sin round-trip a GoTrue `/user`**. El proxy ya validó la sesión. El usuario sale de `__cl.claims.sub`. Si no hay `sub` → `redirect('/login')`.
2. `listUserWorkspaces(supabase, user.id)`.
3. **Auto-salto si hay 0 o 1**:
   - `workspaces.length === 0` → `redirect('/login')`.
   - `workspaces.length === 1` → `await setLastWorkspace(supabase, workspaces[0])` y `redirect(workspaceHome(workspaces[0]))`. Es decir, con un solo contexto el selector **nunca se muestra**: persiste la preferencia y salta directo.
4. Con ≥2 workspaces renderiza la lista. Cada opción es un `<form action={selectWorkspaceAction}>` con un `<input type="hidden" name="workspace_key">`. Un ícono por tipo (`iconFor`: `UserCog` staff, `Building2` enterprise_coach, `Dumbbell` standalone, `GraduationCap` alumno). Cada item muestra `workspace.label` y el `type` legible.

> Nota de seguridad: la página usa `getClaims()` (barato, local), pero la **acción** de selección revalida con `getUser()` (ver abajo) antes de escribir nada.

---

## 4.4. La acción `selectWorkspaceAction` — elegir y persistir

Archivo: `apps/web/src/app/workspace/select/select.actions.ts` (`'use server'`).

Flujo:

1. Lee `workspace_key` del `FormData`.
2. `getUser()` (verificación fuerte de sesión) — si no hay user → `redirect('/login')`.
3. **Re-deriva** `listUserWorkspaces(supabase, user.id)` y busca el workspace cuyo `workspaceKey(item) === selectedKey`. Si no matchea ninguno → `redirect('/workspace/select')`. **El servidor nunca confía en el `workspace_key` del body como autoridad**: solo lo usa para seleccionar entre los workspaces que el propio usuario realmente posee (derivados de su `auth.uid()`).
4. `setLastWorkspace(supabase, workspace)` persiste la elección. **Si la escritura falla (RLS / constraint / transitorio), NO redirige como si hubiera funcionado**: redirige a `/workspace/select?error=persist_failed`. El comentario explica el porqué: una preferencia stale (ej. `enterprise_coach`) ganaría en la próxima resolución de `/coach/dashboard` y el usuario "revertiría" silenciosamente.
5. **Sincronización F10 con `active_org_id`** (solo para tipos coach: `coach_standalone`, `enterprise_coach`, `coach_team`):
   - `nextOrgId = workspace.type === 'enterprise_coach' ? workspace.orgId : null` (team y standalone limpian `active_org_id`).
   - `createServiceRoleClient().from('coaches').update({ active_org_id: nextOrgId }).eq('id', user.id)` — **se hace con service-role** porque `active_org_id` es columna compra-only/service-role (no editable por `authenticated`).
   - `await supabase.auth.refreshSession()` — refresca la sesión para que el **auth hook** (que lee `active_org_id`, ver §4.11) re-emita los claims con la org correcta de inmediato, evitando una ventana donde la preferencia en DB y el JWT discrepan.
6. `redirect(workspaceHome(workspace))`.

### Persistencia: `setLastWorkspace` y la tabla `workspace_preferences`

`setLastWorkspace(db, workspace)` en `workspace.service.ts`:

- Lee la preferencia previa (`findWorkspacePreference`).
- `upsertWorkspacePreference` → `db.from('workspace_preferences').upsert(..., { onConflict: 'user_id' })`. La fila guarda: `user_id`, `last_workspace_type`, `last_org_id`, `last_coach_id`, `last_client_id`, `updated_at` (los ids se extraen condicionalmente: `'orgId' in workspace ? ... : null`, etc.).
- Si el upsert da error, devuelve `{ error }` (la acción lo intercepta y muestra `persist_failed`).
- En éxito, escribe un evento de auditoría de org (`writeWorkspaceAuditEvent`) **solo si el workspace tiene `orgId`** y la preferencia cambió (`workspace.switched` / `workspace.activated`).

> El contexto activo persiste en una **fila de DB** (`workspace_preferences`), NO en una cookie ni en un claim dedicado de "workspace activo". El JWT solo refleja indirectamente la org vía `active_org_id` (sincronizado en el paso 5). La resolución del workspace activo se recomputa server-side en cada request a partir de `(workspaces poseídos × preferencia)`.

---

## 4.5. A qué home redirige cada tipo — `workspaceHome` y `defaultWorkspaceHome`

Hay **dos** resolvers de "home", casi idénticos:

`workspaceHome(workspace)` — `apps/web/src/app/workspace/select/workspace-home.ts` (usado por la página y la acción del selector):

| Tipo | Destino |
|---|---|
| `enterprise_staff` | `/org/${slug}` (o `/org/login` sin slug) |
| `coach_standalone` / `enterprise_coach` / `coach_team` | `/coach/dashboard` |
| `student_team` | `/t/${slug}/dashboard` (o `/login`) |
| resto de alumnos (con slug) | `/c/${slug}/dashboard` |
| sin slug | `/login` |

`defaultWorkspaceHome(workspace)` — `apps/web/src/services/auth/workspace-route-guard.service.ts` — es el **mismo mapeo** y es el que usa el resolver post-login (`resolvePostLoginRedirect`). Los tres tipos de coach colapsan a **`/coach/dashboard`** sin importar si es standalone, enterprise o team: la zona `/coach/*` es compartida y el contexto se resuelve dentro.

### Guard de rutas por workspace

`canAccessWorkspacePath(workspace, pathname)` (mismo archivo) decide si el workspace activo puede ver un path:

- `/org/*` → solo `enterprise_staff`.
- `/coach/subscription` → solo `coach_standalone` (billing es del negocio personal; enterprise/team no pagan self-service).
- `/coach/settings/preview` → solo `coach_standalone` (preview de la marca personal).
- `/coach/settings` (hub) → `coach_standalone` o `coach_team` (context-aware).
- resto de `/coach/*` → cualquiera de los 3 tipos coach.
- `/c/*` → los 3 tipos de alumno.

En desacuerdo, devuelve `{ allowed: false, redirectTo: defaultWorkspaceHome(workspace) }`.

---

## 4.6. Resolución post-login (sin pasar siempre por el selector)

`resolvePostLoginRedirect(supabase, userId)` en `apps/web/src/lib/auth/post-login-redirect.server.ts` es lo que ejecuta `loginAction` tras autenticar:

1. `resolvePreferredWorkspace` = `pickPreferredWorkspace(workspaces, preference)`. Reglas **puras** (testeables sin DB):
   - 0 workspaces → `null`.
   - 1 workspace → ese (marcado `isLastUsed`).
   - N **sin** preferencia → `null` (muestra el selector).
   - N **con** preferencia que matchea (`workspaceMatchesPreference`) → ese; si no matchea ninguno → `null`.
   Si hay preferido → `defaultWorkspaceHome(preferido)`.
2. Si no hay preferido: `listUserWorkspaces` de nuevo → `>1` ⇒ `/workspace/select`; `===1` ⇒ su home directo.
3. **Fallback legacy** (cuando `listUserWorkspaces` devolvió 0, edge sin backfill): consulta `coaches` + `clients`, resuelve org activa vía `organization_members`/`organizations`, y arma `getPostLoginRedirect({ isCoach, isOrgUser, activeOrgSlug, activeOrgRole, clientCoachSlug })`.

`getPostLoginRedirect` (`apps/web/src/lib/auth/post-login-redirect.ts`, puro): staff de org con slug → `/org/${slug}`; coach → `/coach/dashboard`; alumno con `clientCoachSlug` → `/c/${slug}/dashboard`; sino `/login`.

---

## 4.7. Backend de cuentas del coach — creación por email/contraseña (`registerAction`)

Archivo: `apps/web/src/app/(auth)/register/_actions/register.actions.ts` (`'use server'`). Firma `useActionState`: `(prev, formData) => Promise<RegisterState>`.

Campos del `FormData`: `full_name`, `email`, `password`, `brand_name`, `accept_legal`, `accept_health_data`, `accept_marketing`, `subscription_tier` (default `'starter'`), `billing_cycle` (default `'monthly'`), `addons` (CSV opcional de `MODULE_KEYS`), `coupon_code` (opcional), más `website` (honeypot) y `cf-turnstile-response`.

### Defensas anti-abuso (en orden)

1. **Honeypot**: si `website` viene relleno → error genérico ("Algo salió mal…"). Los bots llenan campos ocultos; los humanos no.
2. **Cloudflare Turnstile** (CAPTCHA), **solo si `process.env.TURNSTILE_SECRET_KEY` está configurado**: requiere `cf-turnstile-response`; verifica server-side contra `https://challenges.cloudflare.com/turnstile/v0/siteverify`. Sin token o `success !== true` → error. (Este es un check **directo** en el registro, distinto del `verifyTurnstile` con fail-open del login.)

### Validaciones

- `VALID_TIERS = SALE_TIERS` (`free|starter|pro|elite`; growth/scale fuera de venta). `VALID_CYCLES = ['monthly','quarterly','annual']`.
- Campos obligatorios: `full_name`, `email`, `password`, `brand_name`.
- `password.length >= 8` (nota: el `CoachLoginSchema` del **login** exige min 6; el **registro** exige min 8 directo en la acción).
- `accept_legal` y `accept_health_data` obligatorios (este último cita **Ley 21.719 Art. 16** — datos de salud). `accept_marketing` opcional.
- Tier y ciclo válidos; y si **no** es free, `isBillingCycleAllowedForTier(tier, cycle)` (de `@eva/tiers`).
- **Slug** derivado de `brand_name`: lowercase, `normalize('NFD')`, quita diacríticos, `[^a-z0-9]+ → '-'`, trim de guiones. Si el slug base está en `RESERVED_SLUGS` (`admin`, `api`, `coach`, `login`, `eva`, `nike`, `gym`, etc.) → error.

### Anti-abuso de free por IP

Si `isFreeTier`, antes de crear nada: `clientIpFromRequest` (de los headers) y cuenta filas `coaches` con `registration_ip = ip AND subscription_tier='free' AND created_at >= hace 7 días`. **Máx 3 cuentas free por IP cada 7 días** → si `>=3`, error genérico. La IP se captura luego en `registration_ip` al insertar.

### Unicidad de slug e invite_code

- Loop hasta 8 intentos: `coaches.select('id').eq('slug', slug)`; si choca, `slug = ${baseSlug}-${random 6 chars}`. Al intento 8 sin éxito → error.
- `inviteCode = await generateUniqueInviteCode(adminDb)` (ver §4.10).

### Disponibilidad de email (dedup de plataforma)

`assertPlatformEmailAvailable(adminDb, email)` (`apps/web/src/lib/auth/platform-email.ts`):
- Normaliza con `normalizePlatformEmail` (lowercase + strip de `+alias` para gmail/outlook/hotmail/live, y para gmail ignora puntos y unifica googlemail→gmail). **Solo para dedup** — el almacenamiento usa `sanitizePlatformEmail` (trim+lowercase, preserva puntos/alias).
- Rechaza `BLOCKED_EMAIL_DOMAINS` (`eva-app.cl`) y dominios desechables (`DISPOSABLE_EMAIL_DOMAINS`, set hardcodeado de ~temp-mail providers).
- Llama al RPC `check_platform_email_availability(p_email)` (requiere service-role). Si la fila indica `exists_in_auth` u `orphan_client_email` → email tomado (`PLATFORM_EMAIL_TAKEN_ES`).

### Creación de la cuenta auth + fila coaches

`adminDb.auth.admin.createUser({ email: emailSan, password, email_confirm: !isFreeTier })`:
- **Paid tier**: `email_confirm: true` → auto-confirmado (el **pago es prueba de identidad**, no se exige verificar email).
- **Free tier**: `email_confirm: false` → requiere verificación por email.
- Si falla y el mensaje es de duplicado (`isAuthDuplicateEmailMessage`) → "Este correo ya está registrado…".

Luego inserta en `coaches` (service-role) con `id = authData.user.id` y:

| Campo | Valor |
|---|---|
| `full_name`, `brand_name`, `slug`, `invite_code` | de la entrada / generados |
| `primary_color` | `'#10B981'` (verde EVA por defecto) |
| `subscription_status` | free → `'pending_email'`; pago → `'pending_payment'` |
| `subscription_tier` | `selectedTier` |
| `billing_cycle` | free → `'monthly'`; pago → `selectedBillingCycle` |
| `payment_provider` | free → `'admin'`; pago → `process.env.PAYMENT_PROVIDER ?? 'mercadopago'` |
| `max_clients` | `getTierMaxClients(tier)` (free 3, starter 10, pro 30, elite 100) |
| `health_data_consent_at` | `now` |
| `marketing_consent` | `acceptMarketing` |
| `onboarding_guide` | `{ invite_code_confirmed: true, invite_code_confirmed_at: now }` (salta el modal de migración legacy `PublicCodeRequiredModal`, ya que el coach nuevo conoce su código) |
| `trial_used_email` | solo free: `emailNorm` (clave anti-reuso de free) |
| `registration_ip` | solo free, si hay IP |

Si el insert de `coaches` falla → **rollback**: `adminDb.auth.admin.deleteUser(authData.user.id)` y devuelve error.

> Detalle importante de `subscription_status` free = `'pending_email'` (NO `'active'`): refleja el path mobile (`api/mobile/auth/register-coach-free`). El flip a `'active'` + el welcome + el drip ocurren al confirmar el email (`/auth/confirm`, §4.9). Insertar `'active'` aquí saltaría silenciosamente el welcome/drip.

### Bifurcación final free vs pago

- **Free**: como `admin.createUser` NO dispara los emails nativos de Supabase, se envía manualmente vía Resend `sendCoachSignupConfirmationEmail({ email, password, coachName })`. Si el envío falla → rollback (borra `coaches` + auth user) y error. En éxito → `redirect('/verify-email?email=...')`. El welcome/drip se difieren a la confirmación.
- **Pago**: el email ya está auto-confirmado → `supabase.auth.signInWithPassword({ email, password })` (inicia sesión inmediata) y luego:
  - **Sanitiza add-ons**: parsea el CSV, filtra a `MODULE_KEYS` válidos, dedup con `Set`, y aplica coherencia **D8** (`nutrition_exchanges` solo si el tier tiene nutrición, vía `getTierCapabilities(tier).canUseNutrition`). El **monto se calcula SOLO server-side** después en `create-preference`; aquí solo se decide **qué** módulos viajan.
  - **Cupón**: `normalizeCouponCode(coupon_code)` — solo se **sanea y threadea** a `/processing`; el canje + disclosure SERNAC + consentimiento ocurren en `/processing`, antes del primer cobro. (REGISTER-CODE.)
  - `redirect('/coach/subscription/processing?from=register&tier=...&cycle=...&plan=...&addons=...&coupon=...')` → ahí arranca el flujo MercadoPago.

---

## 4.8. Backend de cuentas del coach — creación por Google OAuth (`completeOAuthOnboarding`)

### Entrada OAuth (cliente)

`apps/web/src/lib/auth/client-oauth.ts`:
- `startCoachGoogleLogin()` → `signInWithOAuth({ provider: 'google', options: { redirectTo: '${origin}/auth/callback?next=/coach/dashboard' } })`.
- `startCoachGoogleRegistration()` → `redirectTo: '${origin}/auth/register-callback'`.

### Callbacks → exchange

- `apps/web/src/app/auth/callback/route.ts` (login): toma `?code`, reescribe a `/auth/exchange?oauth_code=<code>&intent=login[&next=...]` (renombra `code`→`oauth_code` para que el `detectSessionInUrl` de Supabase no auto-dispare). Sin code → `/login?error=auth_callback_failed`. Propaga `next` (usado por recovery → `/reset-password`).
- `apps/web/src/app/auth/register-callback/route.ts` (registro): igual pero `intent=register`. Sin code → `/register?error=auth_callback_failed`.

### `/auth/exchange` (cliente)

`apps/web/src/app/auth/exchange/AuthExchangeClient.tsx` (`'use client'`):
1. `supabase.auth.exchangeCodeForSession(code)`. Error/sin user → `/login?error=auth_callback_failed`.
2. Si hay `next` interno seguro (`startsWith('/') && !startsWith('//')`, guard anti open-redirect) → va ahí (caso recovery → `/reset-password`).
3. Consulta `coaches` por `data.user.id`:
   - **Existe** → resuelve org activa (si `active_org_id`, lee `organization_members` + `organizations(slug)`) y `getPostLoginRedirect({ isCoach: true, activeOrgSlug, activeOrgRole })`.
   - **No existe** y `intent=login` → `/login?error=no_google_account` (no hay cuenta coach con ese Google).
   - **No existe** y `intent=register` → `/register?from=google` (arranca el onboarding OAuth).

### Formulario `/coach/onboarding/complete`

`page.tsx` (RSC) usa `getCompleteOnboardingUser()` (`getUser()` cacheado — necesita `email` + `user_metadata` del provider, baja frecuencia, no usa `getClaims`). Sin user → `/login`. Pre-llena el nombre desde `user_metadata.full_name || name`. Renderiza `CompleteOnboardingForm`.

### `completeOAuthOnboarding` (server action)

Archivo: `apps/web/src/app/coach/onboarding/complete/_actions/complete.actions.ts` (`'use server'`).

1. `getUser()`. Sin user → "Sesión expirada. Volvé a iniciar sesión con Google."
2. Campos: `brand_name`, `full_name`, `subscription_tier` (default **`'free'`**, distinto del registro email que default `'starter'`), `billing_cycle` (default `'monthly'`), consentimientos, `coupon_code`.
3. Validaciones: `brand_name` ≥2, `full_name` ≥2, `accept_legal`, `accept_health_data` (Ley 21.719 Art. 16), tier ∈ `SALE_TIERS`, ciclo válido, y si no free `isBillingCycleAllowedForTier`.
4. **Email del proveedor**: `email = user.email`. Sin email → error. Rechaza desechables (`isDisposableEmail(emailNorm)`). (Nota: aquí no se llama al RPC `check_platform_email_availability`; la cuenta auth ya existe por OAuth.)
5. **Anti-abuso de free trial**: consulta `coaches.eq('trial_used_email', emailNorm)`; si existe → "Ya existe una cuenta gratuita con este correo…".
6. Slug (mismo algoritmo + `RESERVED_SLUGS` + loop de 8) e `inviteCode = generateUniqueInviteCode`.
7. Insert en `coaches` (service-role), análogo a `registerAction` con dos diferencias:
   - `subscription_status`: free → **`'active'`** de inmediato (las cuentas Google ya vienen email-confirmadas — no hay paso `pending_email`); pago → `'pending_payment'`.
   - No setea `registration_ip` (ese path de abuso por IP es solo del registro email/free).
   - Si insert falla → error (no hace falta rollback del auth user: la cuenta OAuth es legítima y reutilizable).
8. Bifurcación:
   - **Free** → `redirect('/coach/dashboard?welcome=free')` (activo de una; el welcome/drip de OAuth no se disparan en esta acción).
   - **Pago** → cupón saneado/threadeado + `redirect('/coach/subscription/processing?from=register&tier=...&cycle=...&plan=...&coupon=...')`.

---

## 4.9. Verificación de email (solo free email/contraseña) — `/auth/confirm`

Archivo: `apps/web/src/app/auth/confirm/route.ts`. Maneja el link de confirmación (`token_hash` + `type`):
- Sin `token_hash`/`type` → `/login?error=invalid_confirmation_link`. `verifyOtp` falla → `/login?error=confirmation_expired`.
- `type === 'recovery'` → va al `next` interno o `/reset-password` (la sesión de recuperación queda activa).
- `type === 'email'`: si `coaches.subscription_status === 'pending_email' && subscription_tier === 'free'` → **flip a `'active'` (service-role)** + dispara `buildFreeCoachWelcomeEmail` (Resend) y `scheduleFreeCoachDripSequence` (best-effort, `.catch`) → `redirect('/coach/dashboard?welcome=free')`. Default → `/coach/dashboard`.

Este route es **el único lugar** donde un coach free email/pass pasa de `pending_email` a `active` y recibe welcome+drip.

---

## 4.10. `invite_code` — identificador primario, set-once a nivel DB

El **código de invitación** (`coaches.invite_code`) es el identificador público PRIMARIO del coach (memoria project-coach-code-identity); el slug es legacy.

Generación: `generateInviteCode()` (`apps/web/src/lib/coach/invite-code.ts`) — 5 chars del alfabeto sin ambiguos `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sin `0/O/1/I`), patrón `^[A-Z2-9]{5}$`. `generateUniqueInviteCode(admin)` (`invite-code.server.ts`) reintenta hasta 20 veces chequeando colisión contra `coaches.invite_code`; sin éxito lanza error. `coachIdentifierColumn(identifier)` decide si una URL `/c/[identifier]` resuelve por `invite_code` (si matchea el patrón) o por `slug`.

**Set-once a nivel DB** (migración `supabase/migrations/20260612140000_modules_compra_only_grants.sql`): el trigger `coaches_invite_code_set_once` (BEFORE UPDATE OF `invite_code`, SECURITY DEFINER) impide que un `authenticated` cambie un código ya válido:
- `service_role` o `auth.uid() IS NULL` → permitido (admin/operador puede corregir).
- Sin cambio efectivo (`NEW IS NOT DISTINCT FROM OLD`) → no-op (permite editar otras columnas).
- `OLD` inválido (NULL o vacío/whitespace) → permite el set inicial / backfill legacy.
- `OLD` ya válido y `NEW` distinto → `RAISE EXCEPTION` ("invite_code es set-once…").

`invite_code` SÍ está en el `GRANT UPDATE` de columnas de `coaches` para `authenticated`, pero solo para que el backfill legacy (NULL→valor) funcione; el set-once lo impone el trigger, no el grant.

---

## 4.11. Custom access token hook — claims del JWT

Migración vigente: `supabase/migrations/20260522000000_auth_hook_mfa_check.sql`. La función `public.custom_access_token_hook(event jsonb)` (SECURITY DEFINER, `GRANT EXECUTE` solo a `supabase_auth_admin`; `REVOKE` de `authenticated/anon/public`) corre al emitir cada access token y enriquece `event->'claims'`:

- `is_coach = EXISTS(SELECT 1 FROM coaches WHERE id = uid)`.
- **Si es coach**: agrega `coach_id = uid`. Busca org en `organization_members` cuyo `org_id = COALESCE(coaches.active_org_id, <org activa más reciente>)`, status active, no borrada. Si hay → agrega `org_id` y `org_role`. **Aquí entra la sincronización del §4.4**: como `selectWorkspaceAction` setea `coaches.active_org_id` + `refreshSession()`, el hook re-emite el `org_id`/`org_role` correctos para el workspace elegido.
- **Si NO es coach** (staff puro): busca member con `coach_id IS NULL`, role en `('org_owner','org_admin')`. Si hay → `org_id`, `org_role`, `is_org_user=true`, y `requires_mfa_setup=true` si no tiene TOTP verificado (consumido por el middleware de `/org`).

> Claims que el coach lleva en el JWT: `sub` (uid), `coach_id`, y opcionalmente `org_id`/`org_role`. **NO** lleva tier ni billing — esos se leen siempre de la fila `coaches` server-side.

---

## 4.12. Login email/contraseña (`loginAction`) — CAPTCHA y rate-limit

Archivo: `apps/web/src/app/(auth)/login/_actions/login.actions.ts` (`'use server'`).

1. Parsea con `CoachLoginSchema` (`@eva/schemas`): `email` (trim+lowercase+email), `password` (min **6**), `captchaToken` opcional. Falla → `jitter()` + error genérico `GENERIC_ERROR` ("No pudimos verificar tus credenciales…").
2. **Rate-limit / CAPTCHA escalado por cookie** (`apps/web/src/lib/auth/fail-counter.ts`): `readFailCount('coach')` lee la cookie httpOnly `eva_auth_fails` (path `/login`, maxAge 15 min). Si `failCount >= CAPTCHA_THRESHOLD (3)`, exige Turnstile: `verifyTurnstile(captchaToken, ip)` con IP de `x-forwarded-for`/`x-real-ip`. `verifyTurnstile` (`turnstile.ts`) **fail-open** hasta `failOpenMax=5` (sin secret o outage de Cloudflare deja pasar para no bloquear legítimos), **fail-closed** sobre el cap; token vacío siempre false. Captcha inválido → `jitter()` + `incrementFailCount('coach')` + error.
3. `signInWithPassword`. Error → `jitter()` + `incrementFailCount` + error genérico.
4. `getUser()`; sin user → error. Verifica que exista fila `coaches` por `user.id`; **si no es coach → `signOut()` + error genérico** (no se filtra que el email existe pero no es coach; mensaje siempre genérico).
5. `clearFailCount('coach')` (resetea el contador). `redirectPath = resolvePostLoginRedirect(supabase, user.id)` (§4.6). `revalidatePath(redirectPath)` + `redirect(redirectPath)`.

`jitter()` (`lib/auth/timing`) añade demora aleatoria para mitigar timing oracles. Todos los errores son el **mismo mensaje genérico** (no revela si el email existe).

---

## 4.13. Invariantes de seguridad (consolidado)

- **Identidad SIEMPRE de `auth.uid()` / JWT**, nunca del body. El selector verifica el `workspace_key` re-derivando `listUserWorkspaces(user.id)`; el hook lee `uid` de `event->>'user_id'`.
- **Nunca leer `org_id` ni `tier` del request body.** `org_id`/`org_role` salen del JWT (hook) o de `auth.uid()` (memoria CLAUDE: "NUNCA leer org_id del body").
- **Columnas compra-only / service-role en `coaches`** (migración `20260612140000_modules_compra_only_grants.sql` + `20260611120000`): `authenticated` tiene `REVOKE UPDATE` a nivel tabla + `GRANT UPDATE` solo sobre una allowlist (branding + `invite_code` set-once + `onboarding_guide`, etc.). **Quedan service-role-only**: `enabled_modules`, `subscription_tier`, `subscription_status`, `max_clients`, `billing_cycle`, `current_period_end`, `subscription_mp_id`, `trial_*`, `payment_provider`, `admin_notes`, `active_org_id`, `slug`, scoping de `clients`. Por eso `registerAction`/`completeOAuthOnboarding`/`selectWorkspaceAction`/`/auth/confirm` escriben tier/status/`active_org_id` con `createServiceRoleClient()`. INSERT/DELETE de `coaches` para `authenticated` están revocados (todos los inserts reales son service-role: signup/admin).
- **El custom_access_token_hook** es la única vía de claims org en el token; `GRANT EXECUTE` solo a `supabase_auth_admin`.
- **CAPTCHA**: directo y obligatorio en `registerAction` (si `TURNSTILE_SECRET_KEY` está seteado); escalado por fallos (≥3) y fail-open en `loginAction`.
- **Rate-limit de free por IP**: 3 cuentas free / IP / 7 días en el registro.
- **Dedup de email**: `check_platform_email_availability` RPC + normalización agresiva + bloqueo de desechables/`eva-app.cl`.
- **Rollback transaccional manual**: si el insert de `coaches` (o el envío de email free) falla, se borra el auth user creado.

---

## 4.14. Resumen del modelo de datos — tabla `coaches`

`coaches.id` = `auth.users.id` (1:1; la fila se crea con `id = authData.user.id`). Campos relevantes a esta sección (de `WorkspaceCoachRow` + inserts):

- **Identidad / marca**: `full_name`, `brand_name`, `slug` (legacy, único), `invite_code` (PRIMARIO, set-once DB), `logo_url`, `primary_color` (default `#10B981`).
- **Billing / plan (compra-only, service-role)**: `subscription_tier` (`free|starter|pro|elite` + legacy `growth|scale`), `subscription_status` (`pending_email`/`pending_payment`/`active`/`org_managed`/`team_managed`/`canceled`/`paused`/…), `billing_cycle` (`monthly|quarterly|annual`), `payment_provider` (`admin` free / `mercadopago` pago / `internal` comp), `max_clients`, `current_period_end`, `subscription_mp_id`, `enabled_modules` (jsonb sincronizado por trigger desde `coach_addons`), `trial_used_email` (anti-reuso free, = `normalizePlatformEmail`).
- **Org / contexto**: `active_org_id` (service-role; lo lee el auth hook para decidir `org_id`/`org_role` del JWT).
- **Consentimiento / onboarding**: `health_data_consent_at`, `marketing_consent`, `onboarding_guide` (jsonb), `registration_ip` (solo free).

**Relación con `clients`**: un alumno es una fila `clients` con `coach_id` (standalone), `org_id` (enterprise) o `team_id` (pool). El límite `max_clients` (derivado del tier) acota cuántos `clients` puede tener el coach. Un mismo `auth.uid()` puede tener fila en `coaches` Y en `clients` (de ahí el selector de workspace). El scoping de `clients` (`coach_id`/`org_id`/`team_id`) es **service-role-only** — ningún `authenticated` mueve un alumno de scope vía PATCH.
