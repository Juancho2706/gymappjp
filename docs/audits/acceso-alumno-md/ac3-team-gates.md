# 3. Gates de equipo (/t): login, consentimiento, holding y perfil

Esta sección cubre las pantallas nativas del alumno de **pool plano** (modo `team`, la 3ra forma de EVA, aislada de enterprise). Un único link de entrada por pool (`/t/[team_slug]/login`), branding del **TEAM** (no de un coach individual), gate de consentimiento Ley 21.719 antes del acceso multidisciplinario, holding de espera para huérfanos sin coach, y gestión/revocación del consentimiento en perfil. Todo el árbol `/t/[team_slug]/*` vive same-domain (NO subdominio) y la URL nunca se escapa a `/c` — el proxy reescribe internamente.

> Contexto: el modo `team` se construyó para Movida (300+ alumnos) y quedó como feature **permanente** de EVA aunque el deal no cerró. Código vivo en prod.

---

## 3.0. Arquitectura del flujo: team vs standalone

| Dimensión | Standalone (`/c/[coach_slug]`) | Team / pool (`/t/[team_slug]`) |
|---|---|---|
| Identificador de entrada | slug del **coach** | slug del **team** (pool entero) |
| Branding | marca personal del coach | marca del **TEAM** (la marca personal del coach nunca llega al alumno) |
| Consentimiento Ley 21.719 | no obligatorio (coach único) | **obligatorio** (acceso multidisciplinario: entrenadores + nutrición + kine) |
| App que ejecuta | `/c/[coach_slug]/*` real | reescribe a `/c/[coach_slug]/*` manteniendo URL `/t/...` |
| Sin coach asignado | n/a | **holding** "te estamos asignando un coach" |
| Resolución de pertenencia | `clients.coach_id` | RPC `get_team_alumno_context` (membership scope='team' o fallback `clients.team_id`) |

**Mecánica central (proxy `apps/web/src/proxy.ts`, branch §1.6 "TEAM ALUMNO AREA", `pathname.startsWith('/t/')`):**

1. El alumno de pool entra por `/t/[team_slug]/*`.
2. El proxy llama una sola RPC gated, `get_team_alumno_context(p_team_slug)` (SECURITY DEFINER), que resuelve **todo** el contexto: pertenencia, coach asignado, coach activo, estado de cuenta, force-password, onboarding y `has_pool_consent`.
3. Según ese contexto el proxy aplica una **cadena de guards de estado** (suspended → change-password → consent → onboarding → holding) que viven en ESTE branch porque el rewrite a `/c` NO re-ejecuta los guards del branch `/c`.
4. Si el alumno tiene coach activo y pasa todos los gates → **rewrite** a `/c/[coach_slug]/*` con headers de branding del TEAM (`x-coach-*`, `x-client-base-path=/t/[slug]`). La URL del navegador queda en `/t/...`.
5. Las páginas propias de `/t` (login, consent, perfil, dashboard/holding) se sirven **sin rewrite** (no existen en `/c`).

Las **páginas RSC nativas de `/t`** (login/consent/dashboard/perfil) hacen su propia auth a nivel de página, pero confían en que el proxy ya gateó la pertenencia y el consentimiento. La RPC clave (`get_team_alumno_context`) **aún no está en `database.types.ts`**, por eso el proxy hace un cast localizado de `supabase.rpc`.

---

## 3.1. LOGIN del equipo (`/t/[team_slug]/login`)

Archivos: `login/page.tsx`, `login/TeamLoginForm.tsx`, `login/_actions/login.actions.ts`, `login/_data/login.queries.ts`.

### 3.1.1. Resolución de la marca del pool (pre-auth)

`getTeamLoginInfo(slug)` en `login/_data/login.queries.ts`:

- **Cache** (`react.cache`) — deduplica entre layout, generateMetadata, generateViewport y la page.
- Usa **service-role** (`createServiceRoleClient`) porque `teams` **no tiene SELECT para `anon`**: hay que renderizar branding ANTES de autenticar.
- Query: `teams.select('id, slug, name, primary_color, logo_url').eq('slug', slug).is('deleted_at', null).maybeSingle()`.
- Devuelve `TeamLoginInfo { id, slug, name, primary_color, logo_url }`. Defaults: `name` → `'Tu equipo'`, `primary_color` → `SYSTEM_PRIMARY_COLOR` (`#007AFF`) si vacío, `logo_url` → `null` si vacío.

`page.tsx`: `if (!team) notFound()`. Renderiza logo del team (o ícono `Users` con `primary_color` de fondo si no hay logo), nombre del team, y `TeamLoginForm`. Footer "Impulsado por EVA". `generateMetadata` setea título `Ingresar | {brandName}` + íconos del logo del team.

### 3.1.2. El formulario (`TeamLoginForm.tsx`)

- `'use client'`, `useActionState(teamClientLoginAction, initialState)`.
- Campos: `email` (autoComplete `email`), `password` (autoComplete `current-password`), ambos `required`. Hidden `team_slug`.
- Link "¿Olvidaste tu contraseña?" → `/forgot-password?team_slug=${teamSlug}` (el reset de password recibe el slug del team para volver brandeado).
- Copy fijo: "Tu equipo te envió las credenciales por email" — refleja el modelo de alta: el alumno **no se auto-registra**, el coach/team crea la cuenta y envía credenciales.
- **Redirect client-side** vía `useEffect`: cuando `state.success && state.redirectUrl`, persiste en `localStorage`: `last_team_slug`, `team_brand_name`, `team_logo_url` (o lo borra si no hay logo) y hace `router.push(state.redirectUrl)`. Estos valores de localStorage alimentan la PWA/branding offline.

### 3.1.3. La acción del servidor (`teamClientLoginAction`)

`'use server'`. Tipo de retorno `TeamLoginState { error?, success?, redirectUrl? }`.

**Validación.** `TeamClientLoginSchema = ClientLoginSchema.omit({ coach_slug: true }).extend({ team_slug: z.string().trim().min(1) })`. Espeja el login de `/c` (mismas reglas email+password de `@eva/schemas`: `email` trim+lowercase+`.email()`, `password` min(1)), solo cambia `coach_slug` por `team_slug`. Si falla parse → `{ error: 'Completa tu email y contraseña.' }`.

**Secuencia backend (orden exacto):**

1. `supabase.auth.signInWithPassword({ email, password })` con el cliente **user-scoped** (cookie-based). Si error → `{ error: 'Email o contraseña incorrectos.' }` (mensaje genérico, no filtra si el email existe).
2. `supabase.auth.getUser()` para obtener `user.id`. Si falla → `{ error: 'Error al obtener sesión.' }`.
3. Cambia a **service-role** (`createServiceRoleClient`).
4. Resuelve el team por slug: `teams.select('id, name, slug').eq('slug', teamSlug).is('deleted_at', null).maybeSingle()`. Si no existe → **`supabase.auth.signOut()`** + `{ error: 'Equipo no encontrado.' }`.
5. **Verifica pertenencia (fuente de verdad: identity-split).** `client_memberships.select('client_id').eq('account_id', user.id).eq('team_id', team.id).eq('scope', 'team').eq('status', 'active').is('deleted_at', null).maybeSingle()`. Si hay membership → `clientId = membership.client_id`.
6. **Fallback de compat** si no hay membership: `clients.select('id, team_id').eq('id', user.id).maybeSingle()`. Si no existe el client o `client.team_id !== team.id` → `signOut()` + `{ error: 'No tienes acceso a este equipo.' }`. Si pasa → `clientId = client.id`.
7. **Guard de estado de cuenta (pausa/suspensión):** `clients.select('is_active, is_archived').eq('id', clientId).maybeSingle()`. Si `is_active === false || is_archived === true` → `signOut()` + `{ error: 'Tu cuenta está pausada. Contacta a tu equipo.' }`.
8. Éxito → `{ success: true, redirectUrl: '/t/${teamSlug}/dashboard' }`.

> **Observación de diseño:** el login NUNCA redirige directo a `/c`. Siempre manda a `/t/[slug]/dashboard`, y es el **proxy** (no la acción) quien decide reescribir a `/c/[coach_slug]/dashboard` (alumno con coach) o servir el holding (sin coach). La acción no resuelve coach ni consent — solo autentica + verifica pertenencia + estado. El identity-split (`client_memberships` con `account_id`) es la fuente primaria; `clients.team_id` es fallback legacy.

### 3.1.4. Throttling (rate-limit)

El proxy (`apps/web/src/proxy.ts` §3.5) marca como auth-adyacente y throttlea el POST del login del pool **igual que `/c` y `/e`** — el regex incluye `/^\/t\/[^/]+\/consent$/` para que el POST de consent (que también corre acciones auth-adyacentes) entre al mismo throttling. Sin esto `teamClientLoginAction` correría `signInWithPassword` sin límite (vector de fuerza bruta sobre 300+ alumnos).

### 3.1.5. Gate del proxy para `/t/[slug]/login`

Cuando el alumno YA autenticado vuelve a `/login` (branch §1.6, `tRest === '/login'`): si `user` existe y la RPC dice `is_member === true` → redirect a `/t/[slug]/dashboard` (evita re-login). Si no autenticado, sirve la página de login. El branch `if (!user)` (más abajo) redirige cualquier ruta `/t` protegida sin sesión a `/t/[slug]/login`, copiando cookies de sesión.

---

## 3.2. CONSENT — Gate Ley 21.719 (`/t/[team_slug]/consent`)

Archivos: `consent/page.tsx`, `consent/ConsentForm.tsx`, `consent/_actions/consent.actions.ts`.

### 3.2.1. Cuándo se obliga (proxy)

El proxy (§1.6) inserta el **consent gate** entre el gate de change-password y el de onboarding:

- `if (tRest === '/consent')`: si `tCtx.has_pool_consent === true` → redirect a `/t/[slug]/dashboard` (ya consentido, no muestra el formulario). Si no → sirve `/consent` **sin rewrite** (página propia de `/t`), con los headers de branding del team.
- Guard general: `if (tCtx.has_pool_consent !== true && !tBlocked && tCtx.force_password_change !== true)` → redirect a `/t/[slug]/consent`. O sea: el alumno NO puede tocar la app hasta consentir, salvo que esté bloqueado (suspended se evalúa antes) o deba cambiar password primero.
- **Orden de prioridad de gates:** suspended → change-password → **consent** → onboarding → holding/app.

`has_pool_consent` lo computa la RPC `get_team_alumno_context` (ver 3.6): `EXISTS` de una fila en `client_consents` con `purpose='pool_multidisciplinary_access'` y `revoked_at IS NULL` para `(client_id, team_id)`.

> **Cobertura cruzada `/c` (proxy §3.1):** un alumno de pool (`clients.team_id` SET) que entra por `/c/[coach_slug]/*` directo (bookmark, PWA `start_url` legacy) también es forzado al consent. El proxy resuelve el slug del team (service-role `teams.select('slug').eq('id', teamId)`), llama la MISMA `get_team_alumno_context`, y si `has_pool_consent !== true` → redirige a `/t/[teamSlug]/consent`. Standalone (`team_id NULL`) NO entra a este guard. Esto cierra el bypass de entrar por `/c` salteando el gate de `/t`.

### 3.2.2. La página (`consent/page.tsx`)

- Resuelve `team = getTeamLoginInfo(team_slug)`; `if (!team) redirect('/t/${team_slug}/login')`.
- Auth a nivel página vía **`supabase.auth.getClaims()`** (verificación local del JWT ES256, sin round-trip a `/user`; el proxy ya validó la sesión). `user = claims.sub ? { id } : null`; si no → redirect a login.
- Renderiza logo/ícono del team, "Un último paso" / "Tu autorización para entrenar con {team.name}", y `ConsentForm`.

### 3.2.3. El formulario (`ConsentForm.tsx`)

- `useActionState(grantTeamConsentAction, initialState)` + `useState(accepted)` (checkbox).
- Texto legal mostrado: explica que en `{brandName}` trabaja un equipo multidisciplinario (entrenadores, nutrición, kinesiología y otros) y que se pide autorización para **ver y registrar datos de salud y entrenamiento**. Bullets: acceso multidisciplinario · tratamiento de datos de salud para seguimiento · revocable cuando quiera desde el perfil.
- Checkbox `name="accept"`: "Autorizo el acceso multidisciplinario y el tratamiento de mis datos de salud (Ley 21.719)."
- Botón "Aceptar y continuar" **disabled** hasta marcar el checkbox (`disabled={!accepted}`).
- Nota de pie: "Tus datos están protegidos y son confidenciales."

### 3.2.4. La acción de grant (`grantTeamConsentAction`)

`'use server'`. Constantes: `CONSENT_TEXT_VERSION = 'v1'`; `POOL_CONSENT_PURPOSES = ['pool_multidisciplinary_access', 'health_data_processing']` (espejo del CHECK de `client_consents.purpose`).

**Validación.** `grantConsentSchema`: `teamSlug` (min 1), `accepted: z.literal(true)`, `purposes: z.array(z.enum(POOL_CONSENT_PURPOSES)).min(1)`. El `accepted` se deriva de `formData.get('accept') === 'on' || === 'true'`.

**Secuencia backend:**

1. `supabase.auth.getUser()`. Si falla → `{ error: 'Sesión expirada. Vuelve a ingresar.' }`.
2. Service-role: resuelve team por slug (`deleted_at IS NULL`). Si no → `{ error: 'Equipo no encontrado.' }`.
3. **Verifica pertenencia** (misma lógica que login): `client_memberships` scope='team' active → `clientId`; fallback `clients.team_id === team.id`. Si no pertenece → `{ error: 'No tienes acceso a este equipo.' }`. **La identidad SIEMPRE sale de `auth.uid()`, nunca del body.**
4. Resuelve `accountId`: `client_accounts.select('id').eq('id', user.id).maybeSingle()` → `account?.id ?? null` (el link duro es `client_id`; `account_id` es opcional para identity-split).
5. **Idempotencia:** lee `client_consents` activos (`revoked_at IS NULL`) para `(client_id, team_id)` en los purposes; calcula `purposes = POOL_CONSENT_PURPOSES.filter(p => !already.has(p))` — solo inserta los que falten.
6. Si hay purposes faltantes, captura **evidencia Ley 21.719** desde headers: `ip_address` (`x-forwarded-for`[0] o `x-real-ip`) y `user_agent`. **INSERT vía service-role** (el alumno NO puede self-INSERT — RLS solo permite a coaches del team o service-role). Cada fila: `{ client_id, account_id, team_id, purpose, granted_at: now, consent_text_version: 'v1', granted_via: 'team_onboarding', ip_address, user_agent }`. Si error → `{ error: 'No se pudo registrar el consentimiento...' }`.
7. **`redirect('/t/${teamSlug}/dashboard')`** server-side (evita el race del client push + doble-submit). El proxy, con `has_pool_consent=true`, deja pasar a la app branded del team.

> **Por qué service-role para el INSERT:** las policies de `client_consents` permiten INSERT solo a coaches del team (`client_consents_team_member_manage`) o standalone coach (`client_consents_standalone_coach_manage`) o service-role. El alumno (titular) NO tiene policy de self-INSERT — solo `client_consents_self_select` (lectura) y `client_consents_self_revoke` (UPDATE de `revoked_at`). De ahí que el grant se haga server-side con service-role tras verificar identidad.

---

## 3.3. DASHBOARD = HOLDING (`/t/[team_slug]/dashboard`)

Archivo: `dashboard/page.tsx`. Pantalla de espera para alumno de pool **SIN coach activo** (orfandad).

### 3.3.1. Cuándo se llega aquí

El proxy (§1.6) reescribe a `/c/[coach_slug]/dashboard` al alumno **con coach activo**; el holding `/t/[slug]/dashboard` solo se sirve cuando `!tHasActiveCoach` (`tHasActiveCoach = !!coach_slug && coach_active === true`):

- `if (!tHasActiveCoach)`: si `tRest === '/dashboard' || tRest === '/'` → sirve la page del holding sin rewrite; cualquier otra ruta → redirect a `/t/[slug]/dashboard` (el huérfano no puede navegar a la app real).

### 3.3.2. La página

- `team = getTeamLoginInfo`; `if (!team) redirect(login)`.
- Auth vía `getClaims()` (igual que consent). Sin user → redirect login.
- Service-role: **re-verifica pertenencia + resuelve coach** (defensa en profundidad, no confía solo en el proxy):
  - `client_memberships.select('coach_id, coaches(slug)').eq('account_id', user.id).eq('team_id', team.id).eq('scope','team').eq('status','active').is('deleted_at', null)`. `belongsToTeam = !!membership`; `coachSlug = membership.coaches.slug`.
  - Fallback: `clients.select('team_id, coaches(slug)').eq('id', user.id)`. Si `client.team_id === team.id` → `belongsToTeam = true`, `coachSlug = client.coaches.slug`.
  - `if (!belongsToTeam) redirect(login)`.
- **`if (coachSlug) redirect('/c/${coachSlug}/dashboard')`** — si la page se carga directo y resulta que SÍ hay coach, redirige a la app (reusa `/c` hasta extraer el árbol `/t`).
- Solo si NO hay coach → renderiza el holding: logo/nombre del team + tarjeta con ícono `Clock` y "Estamos asignándote un coach" / "Habla con {team.name} para que te asignen un coach. Cuando esté listo, podrás entrenar desde aquí." Footer EVA.

> **Nota:** la page del dashboard tiene su propia resolución de coach con redirect a `/c` (no idéntica a la del proxy que usa `coach_active`), por lo que un alumno con `coach_slug` poblado pero coach NO activo en el team podría, al cargar la page directo, ser enviado a `/c/[coach_slug]/dashboard` (donde el branch `/c` aplicaría sus propios guards). En el flujo normal el proxy intercepta antes.

---

## 3.4. PERFIL (`/t/[team_slug]/perfil`)

Archivo: `perfil/page.tsx` + `RevokeConsentButton` (exportado desde `consent/ConsentForm.tsx`).

### 3.4.1. Gate del proxy

El proxy sirve `/perfil` **sin rewrite y ANTES del consent gate** (`if (tRest === '/perfil')` aparece arriba del guard general de consent): así un alumno YA consentido puede entrar a revocar, y un alumno que acaba de revocar (que el guard rebotaría a `/consent`) igual alcanza la pantalla. La acción de revoke redirige a `/dashboard`, que el consent gate (`has_pool_consent=false`) rebota a `/consent`.

### 3.4.2. La página

- `team = getTeamLoginInfo`; auth vía `getClaims()`.
- Service-role lee el estado del consentimiento: `client_consents.select('granted_at').eq('client_id', user.id).eq('team_id', team.id).eq('purpose', 'pool_multidisciplinary_access').is('revoked_at', null).order('granted_at', desc).limit(1).maybeSingle()`.
- `hasConsent = !!activeConsent`. `grantedDate` se formatea con `Intl.DateTimeFormat('es-CL', ..., timeZone: 'America/Santiago')`.
- Renderiza estado:
  - **Activo:** ícono `ShieldCheck` (color del team), "Consentimiento activo", "Autorizaste el acceso multidisciplinario y el tratamiento de tus datos de salud (Ley 21.719)", "Otorgado el {grantedDate}", y el `RevokeConsentButton`.
  - **Revocado:** ícono `ShieldOff` (rojo), "Consentimiento revocado", "No autorizas el acceso multidisciplinario. Vuelve a otorgarlo para usar la plataforma del equipo." (sin botón de revocar; el reingreso lo fuerza el consent gate del proxy).

### 3.4.3. La acción de revoke (`revokeTeamConsentAction`)

`'use server'`. Validación `revokeConsentSchema`: solo `teamSlug` (la identidad sale de `auth.uid()`, nunca del body).

`RevokeConsentButton` (cliente): `window.confirm('¿Seguro que quieres revocar...? Perderás el acceso a la plataforma del equipo hasta que lo autorices de nuevo.')` → `useTransition` → llama la acción con un `FormData` con `team_slug`.

**Secuencia backend:**

1. `getUser()`. Si falla → `{ error: 'Sesión expirada...' }`.
2. Service-role resuelve team por slug; verifica pertenencia (membership scope='team' o fallback `clients.team_id`). Misma lógica que el grant — identidad de `auth.uid()`.
3. **UPDATE user-scoped primero** (aplica la policy `client_consents_self_revoke`): con el cliente cookie-based, `client_consents.update({ revoked_at: now }).eq('client_id', clientId).eq('team_id', team.id).is('revoked_at', null).in('purpose', POOL_CONSENT_PURPOSES)`. Revoca **ambos** purposes activos.
4. **Fallback service-role** SOLO si el UPDATE user-scoped falla (caso `account_id`-linked sin `clients.id = auth.uid()`): mismo UPDATE con `admin`. La identidad ya quedó verificada arriba.
5. **`redirect('/t/${teamSlug}/dashboard')`** — `has_pool_consent` ahora es false, el consent gate del proxy rebota a `/consent`.

> **Forward-only:** el trigger `trg_client_consents_guard` (función `client_consents_guard_immutability`) hace `client_consents` inmutable salvo `revoked_at`, y `revoked_at` es **forward-only** (no se re-activa ni edita: levanta `check_violation`). Por eso la acción solo toca filas con `revoked_at IS NULL`. Re-otorgar el consentimiento NO reactiva la fila vieja: el grant inserta **filas nuevas** (audit trail Ley 21.719). El UPDATE filtra `purpose` IN ambos para no tocar consents de otros purposes (photo_storage, marketing).

---

## 3.5. LAYOUT del árbol `/t` (`layout.tsx`)

`TeamBrandLayout` envuelve todo `/t/[team_slug]/*`.

- **Branding del team** vía `getTeamLoginInfo(team_slug)` (cacheado): `brandName` (`'Tu equipo'` default), `primaryColor` (`SYSTEM_PRIMARY_COLOR` default), `logoUrl` (`BRAND_APP_ICON` default).
- **`generateMetadata`:** título con template `%s | {brandName}`, descripción "Entrena con {brandName}...", `appleWebApp` brandeado, íconos = logo del team (o `BRAND_APP_ICON` fallback). **No** setea `manifest` aquí (Next no permite añadir `crossOrigin` al `<link>` que genera).
- **`generateViewport`:** `themeColor = team.primary_color` (status bar Android; iOS usa black-translucent).
- **Manifest crudo:** renderiza `<link rel="manifest" href="/api/manifest/${team_slug}" crossOrigin="use-credentials" />`. El route `/api/manifest/[coach_slug]` resuelve la marca del TEAM desde el `team_id` del cliente autenticado (cualquier slug válido sirve); `crossOrigin="use-credentials"` para servir el manifest con cookies de sesión.
- **Apple splash screens:** mapea `APPLE_SPLASH` (11 device profiles iPhone/iPad) a `<link rel="apple-touch-startup-image">` apuntando a `/api/splash/${team_slug}?w=...&h=...`. El route de splash acepta cualquier slug y resuelve la marca del team desde el cliente autenticado; **pre-auth cae a EVA**.
- **`InstallPrompt`:** PWA install con `brandName`, `logoUrl`, `coachInitial` (primera letra del brandName), `primaryColor`.

> El manifest y el splash son **per-team** vía rutas compartidas con `/c` (`/api/manifest/[coach_slug]`, `/api/splash/[coach_slug]`) que internamente resuelven team vs coach desde el cliente autenticado. Pre-auth (login/consent sin sesión) caen a branding EVA porque no hay `team_id` del cliente — el branding visible pre-auth viene del service-role read de `getTeamLoginInfo`, no del manifest.

---

## 3.6. Backend de soporte (RPC, tabla, RLS, trigger)

### 3.6.1. RPC `get_team_alumno_context(p_team_slug)`

Migración `20260609200000_team_alumno_context_consent.sql` (v2, aditiva CREATE OR REPLACE; base en `20260609190000`). `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public`. Lee `client_consents` salteando RLS (read-only, scoped por team + `auth.uid()`).

Devuelve `jsonb` con: `team_id, team_slug, name, primary_color, logo_url, is_member` (`m.client_id IS NOT NULL OR c.id IS NOT NULL`), `coach_id` (`COALESCE(m.coach_id, c.coach_id)`), `coach_slug`, `coach_active` (EXISTS en `team_members` con `status='active'`, `deleted_at IS NULL`), `is_active`, `is_archived`, `force_password_change`, `onboarding_completed`, **`has_pool_consent`** (EXISTS en `client_consents` con `purpose='pool_multidisciplinary_access'` y `revoked_at IS NULL` para `client_id = COALESCE(m.client_id, c.id)` y `team_id`).

Joins: `teams` (slug + `deleted_at IS NULL`) LEFT JOIN `client_memberships` (`team_id`, `account_id=auth.uid()`, `scope='team'`, `status='active'`, `deleted_at IS NULL`) LEFT JOIN `clients` (`id=auth.uid()`, `team_id`) LEFT JOIN `coaches` (`COALESCE(m.coach_id, c.coach_id)`).

`REVOKE ALL ... FROM PUBLIC, anon`; `GRANT EXECUTE ... TO authenticated`. La marca completa white-label v3 (accent_light/dark, logo_dark, loader_*, neutral_tint, etc.) la añaden migraciones posteriores (`20260610000000_team_brand_full.sql`).

### 3.6.2. Tabla `client_consents`

Migración `20260609054748_governance_entitlements_consent_access_logs.sql`. Columnas: `id` (uuid PK), `client_id` (uuid NOT NULL → `clients(id)` ON DELETE CASCADE), `account_id` (uuid → `client_accounts(id)` ON DELETE SET NULL), `team_id` (uuid → `teams(id)` ON DELETE SET NULL), `purpose` (text NOT NULL, CHECK IN `'pool_multidisciplinary_access','health_data_processing','photo_storage','marketing'`), `granted_at` (timestamptz), `revoked_at` (timestamptz), `consent_text_version` (text), `granted_via` (text), `created_at` (timestamptz NOT NULL default now). Más `ip_address` + `user_agent` (text nullable, migración `20260613160000_consent_evidence_ip_user_agent.sql`, evidencia Ley 21.719).

Indexes: `idx_client_consents_client_id`, `_account_id`, `_team_id`. **Activo = `revoked_at IS NULL`.**

### 3.6.3. Grants y RLS de `client_consents`

`REVOKE ALL FROM anon` y `FROM authenticated`, luego `GRANT SELECT, INSERT, UPDATE, DELETE TO authenticated` (las policies acotan); `GRANT ALL TO service_role`. Policies:

- `client_consents_standalone_coach_manage` (ALL): coach standalone (`c.org_id IS NULL AND c.coach_id = auth.uid()`).
- `client_consents_team_member_manage` (ALL): miembro del team (`c.team_id IS NOT NULL AND is_team_member(c.team_id)`).
- `client_consents_self_select` (SELECT): el titular (`account_id = auth.uid()` o `clients.id = auth.uid()`).
- `client_consents_self_revoke` (UPDATE): el titular (mismo predicado). **No hay self-INSERT** — de ahí que el grant del alumno pase por service-role.
- `client_consents_service` (ALL): `service_role`.

### 3.6.4. Trigger de inmutabilidad

`trg_client_consents_guard` BEFORE UPDATE FOR EACH ROW → `client_consents_guard_immutability()`: levanta `check_violation` si cambian `client_id`/`account_id`/`team_id`/`purpose`/`granted_at`/`consent_text_version`/`granted_via` (solo `revoked_at` es mutable), y si `revoked_at` ya estaba seteado (forward-only, no re-activa ni edita). `service_role` puede corregir.

---

## 3.7. Resumen de redirects y persistencia

| Trigger | Origen | Destino | Capa |
|---|---|---|---|
| Login OK | `teamClientLoginAction` | `/t/[slug]/dashboard` | server action (retorna redirectUrl, push client) |
| Login OK + coach activo | proxy §1.6 | rewrite a `/c/[coach_slug]/dashboard` (URL queda en `/t`) | proxy |
| Login OK sin coach | proxy / dashboard page | holding `/t/[slug]/dashboard` | proxy + page |
| Sin sesión en `/t/*` | proxy §1.6 | `/t/[slug]/login` | proxy |
| Ya logueado en `/login` | proxy §1.6 | `/t/[slug]/dashboard` | proxy |
| `has_pool_consent=false` | proxy §1.6 | `/t/[slug]/consent` | proxy |
| Pool entra por `/c` sin consent | proxy §3.1 | `/t/[slug]/consent` | proxy |
| Grant consent OK | `grantTeamConsentAction` | `/t/[slug]/dashboard` | server redirect |
| Revoke consent OK | `revokeTeamConsentAction` | `/t/[slug]/dashboard` → (gate) `/consent` | server redirect + proxy |
| Suspended/archived | proxy §1.6 | `/t/[slug]/suspended` (rewrite a `/c/[coach]/suspended`) | proxy |
| force_password_change | proxy §1.6 | `/t/[slug]/change-password` | proxy |
| onboarding incompleto | proxy §1.6 | `/t/[slug]/onboarding` | proxy |
| Cuenta pausada (login) | `teamClientLoginAction` | error inline + `signOut()` | server action |

**Persistencia:**
- `client_consents` (filas append-only, revoke = `revoked_at`): granted_at, purpose ×2, consent_text_version, granted_via='team_onboarding', ip_address, user_agent.
- `localStorage` (client, post-login): `last_team_slug`, `team_brand_name`, `team_logo_url`.
- No setea workspace cookie/union `WorkspaceType` — el proxy resuelve workspace por RPC en cada request.

**Orden canónico de gates del proxy `/t`:** sesión → `is_member` → suspended → change-password → **consent** → (perfil bypass) → onboarding → holding (sin coach) / rewrite a `/c` (con coach).
