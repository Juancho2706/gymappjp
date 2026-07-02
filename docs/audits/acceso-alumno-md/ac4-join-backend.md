# 4. Alta por invitacion (/join) y backend de cuentas/consentimiento

> Auditoria del embudo de **alta self-service del alumno** (`/join/[invite_code]`) y consolidado del **backend de cuentas** (creacion, autenticacion, scoping, grants) y del **consentimiento** (Ley 21.719). Enfasis backend: que llega, que valida, como se crea/autentica la cuenta, que persiste, scoping y redirects. Frontend solo funcional.

---

## 4.0 Mapa de la seccion

| Bloque | Que cubre | Archivos clave |
|---|---|---|
| 4.1 | `/join/[invite_code]` — pagina de alta self-service | `app/join/[invite_code]/page.tsx` |
| 4.2 | `resolveInvite` — resolucion de scope desde el codigo | `app/join/[invite_code]/_lib/resolve-invite.ts` |
| 4.3 | `JoinForm` — campos del formulario | `app/join/[invite_code]/_components/JoinForm.tsx` |
| 4.4 | `joinViaInviteAction` — creacion de cuenta | `app/join/[invite_code]/_actions/join.actions.ts` |
| 4.5 | Consolidado del backend de cuentas del alumno | `infrastructure/db/client-membership.repository.ts`, `lib/auth/temp-credentials.ts`, `coach/clients/_actions/clients.actions.ts` |
| 4.6 | Consentimiento de pool (Ley 21.719) | `t/[team_slug]/consent/_actions/consent.actions.ts` |
| 4.7 | Onboarding / intake del alumno | `c/[coach_slug]/onboarding/_actions/onboarding.actions.ts` |
| 4.8 | Invariantes de seguridad transversales | (varios) |

---

## 4.1 `/join/[invite_code]` — pagina de alta self-service del alumno

Archivo: `apps/web/src/app/join/[invite_code]/page.tsx` (Server Component).

Es el **self-signup** del alumno: el coach/team/org comparte un link `https://eva-app.cl/join/<codigo>` y el alumno se crea la cuenta solo, sin que el coach lo dé de alta manualmente.

### Que datos llegan / que renderiza

1. La ruta recibe `params.invite_code` (segmento dinamico).
2. Crea un **cliente service-role** (`createServiceRoleClient()` de `@/lib/supabase/admin-client`) — la pagina es publica (no hay sesion del alumno todavia), asi que NO hay sesion de usuario y la resolucion del codigo debe leer tablas (`coaches`/`teams`/`organization_members`) que el `anon` no puede leer completas. Por eso usa service-role.
3. Llama `resolveInvite(admin, invite_code)` (ver 4.2). Si devuelve `null` → `notFound()` (404). Asi se manejan codigos **invalidos** (no apuntan a nada vivo).
4. Construye un objeto `coach` de presentacion con la **marca resuelta** (no del coach literal sino del scope: org > team > coach):
   - `brand_name` ← `invite.brandName`
   - `primary_color` ← `invite.primaryColor` (fallback a `#10B981`, el `BRAND_PRIMARY_COLOR` de EVA)
   - `logo_url` ← `invite.logoUrl`
   - `welcome_message` ← `invite.welcomeMessage`
5. Renderiza:
   - Logo (img `logo_url`) o, si no hay, un avatar con la inicial del `brand_name` sobre el `primary_color`.
   - `brand_name` como titulo y `welcome_message` como subtitulo (si existe).
   - `<JoinForm inviteCode={invite_code} primaryColor={color} />`.
   - Link "¿Ya tenés cuenta? Inicia sesión" → `invite.loginHref` (el login del scope correcto: `/c/[slug]/login` o `/t/[slug]/login`).

### `generateMetadata`

Tambien resuelve el codigo via service-role para el `<title>`: `Únete a ${invite.brandName}` o `'Únete'` si no resuelve. (Doble resolucion del codigo por request: una en `generateMetadata`, otra en el render — sin cache compartido entre ambas, son dos lecturas.)

> **Nota frontend (funcional):** el logo se renderiza con `<img>` crudo, no con `<Image>` de Next (linea con `eslint-disable no-img-element`). Es una de las pocas excepciones a la regla "zero raw `<img>`".

---

## 4.2 `resolveInvite` — el codigo de invitacion ENCODES SCOPE

Archivo: `apps/web/src/app/join/[invite_code]/_lib/resolve-invite.ts`. `import 'server-only'` (jamas llega al cliente).

Esta es la pieza de backend mas importante del alta: **un mismo codigo decide a quien y con que scope se crea el alumno**. No hay un parametro "tipo de cuenta"; el codigo en si mismo determina si el alumno nace standalone, enterprise o team. Single source of truth.

Firma: `resolveInvite(admin: SupabaseClient<Database>, code: string): Promise<InviteResolution>`.

### Las 3 fuentes de codigo (orden de chequeo: enterprise → team → standalone)

El orden es **defensivo**: enterprise y team se chequean antes que standalone para que un codigo (hipoteticamente) compartido resuelva al contexto gestionado. La generacion (`generate_unique_invite_code`) garantiza unicidad cruzando los 3 espacios, pero el orden cubre cualquier solapamiento.

**1) Codigo ENTERPRISE** — `organization_members.invite_code`:

```
admin.from('organization_members')
  .select('org_id, coach_id, organizations(name, primary_color, logo_url),
           coaches(slug, brand_name, welcome_message, primary_color, logo_url)')
  .eq('invite_code', code)
  .eq('status', 'active')
  .is('deleted_at', null)
  .not('coach_id', 'is', null)
  .maybeSingle()
```

- El codigo vive en una **membership de coach** de la org. Si la membership esta `active`, no borrada (`deleted_at IS NULL`) y tiene `coach_id` → es un codigo enterprise. (La validacion de "no expirado/no revocado" es justamente este filtro: membership inactiva o soft-deleted no resuelve.)
- Resultado: `scope: 'enterprise'`, `coachId = member.coach_id`, `orgId = member.org_id`, `teamId: null`.
- **Branding**: prioriza la org sobre el coach: `brandName = org.name ?? coach.brand_name ?? 'EVA'`, `primaryColor = org.primary_color ?? coach.primary_color`, `logoUrl = org.logo_url ?? coach.logo_url`. `welcomeMessage = coach.welcome_message`.
- `loginHref = /c/${coach.slug}/login` (el alumno enterprise entra por la ruta del coach; el proxy reescribe `/e/[org_slug]` → `/c/[coach_slug]`).

**2) Codigo TEAM** — `teams.invite_code`:

```
admin.from('teams')
  .select('id, slug, name, primary_color, logo_url, owner_coach_id')
  .eq('invite_code', code)
  .is('deleted_at', null)
  .maybeSingle()
```

- Codigo del equipo (pool plano). Team no borrado.
- Resultado: `scope: 'team'`, `coachId = team.owner_coach_id` (el alumno del pool se estampa con el **owner** del team como `coach_id`; las lecturas colaborativas del pool ignoran ese `coach_id`), `orgId: null`, `teamId = team.id`.
- **Branding del team**: `brandName = team.name`, `primaryColor = team.primary_color`, `logoUrl = team.logo_url`. `welcomeMessage: null` (los teams no tienen mensaje de bienvenida).
- `loginHref = /t/${team.slug}/login` (el alumno del pool entra por la ruta nativa `/t/[team_slug]`).

**3) Codigo STANDALONE** — `coaches.invite_code`:

```
admin.from('coaches')
  .select('id, slug, brand_name, primary_color, logo_url, welcome_message')
  .eq('invite_code', code)
  .maybeSingle()
```

- Codigo del coach individual.
- Resultado: `scope: 'standalone'`, `coachId = coach.id`, `orgId: null`, `teamId: null`.
- **Branding del coach**: `brandName = coach.brand_name ?? 'EVA'`, `primaryColor`, `logoUrl`, `welcomeMessage = coach.welcome_message`.
- `loginHref = /c/${coach.slug}/login`.

Si ninguno matchea → devuelve `null` → la pagina hace `notFound()`.

### Tipo de retorno `InviteResolution`

Union discriminada por `scope` (`'standalone' | 'enterprise' | 'team'`) o `null`. Campos comunes: `coachId`, `orgId`, `teamId`, `brandName`, `primaryColor`, `logoUrl`, `welcomeMessage`, `loginHref`. El tipo refleja en compile-time que enterprise SIEMPRE tiene `orgId: string`/`teamId: null`, team SIEMPRE `teamId: string`/`orgId: null`/`welcomeMessage: null`, y standalone ambos `null`.

> **Validacion implicita = filtros de la query.** No hay un campo "expires_at" en los codigos; la validez se deriva del estado de la fila padre: membership `active`+`!deleted_at`+`coach_id IS NOT NULL`, team `!deleted_at`, coach (sin filtro de estado — un coach existente con codigo siempre resuelve). **Gotcha:** un codigo standalone de un coach con suscripcion vencida/pausada NO se filtra aqui; el alumno se podria crear igual. El gate de pausa es downstream (login del alumno / estado del coach), no en `resolveInvite`.

---

## 4.3 `JoinForm` — campos del formulario

Archivo: `apps/web/src/app/join/[invite_code]/_components/JoinForm.tsx` (`'use client'`).

Props: `inviteCode: string`, `primaryColor: string` (solo para el color del boton).

### Campos (HTML + validacion cliente nativa)

| Campo | `name` | Tipo | Validacion cliente |
|---|---|---|---|
| Nombre completo | `full_name` | text | `required`, `minLength=2`, `maxLength=120` |
| Email | `email` | email | `required` (validacion de formato nativa del input `type="email"`) |
| Teléfono (opcional) | `phone` | tel | `maxLength=30` |
| Contraseña | `password` | password | `required`, `minLength=8` |

### Flujo de submit

- `handleSubmit` hace `preventDefault`, arma un `FormData`, limpia error y dentro de `useTransition` llama:
  `joinViaInviteAction(inviteCode, null, formData)`.
  (Nota: pasa `null` como `_prev` — esta accion NO usa `useActionState`, se invoca imperativa.)
- Resultado:
  - Si `'error' in result && result.error` → `setError(result.error)` (muestra el mensaje en rojo).
  - Si `'loginHref' in result && result.loginHref` → `router.push(\`${result.loginHref}?registered=1\`)`.
- Boton: deshabilitado mientras `pending`; texto "Creando cuenta..." / "Crear cuenta".

> El `?registered=1` en el redirect al login es la señal que consume la pantalla de login para mostrar "cuenta creada, inicia sesion" (el alumno se crea pero NO se autosesiona — debe loguearse).

---

## 4.4 `joinViaInviteAction` — COMO SE CREA LA CUENTA del alumno

Archivo: `apps/web/src/app/join/[invite_code]/_actions/join.actions.ts` (`'use server'`).

Firma: `joinViaInviteAction(inviteCode: string, _prev: unknown, formData: FormData)`.

### Paso a paso (orden exacto)

**1) Rate limit (fail-CLOSED, por IP).**
```
const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
const rl = await rateLimitInviteAccept(ip)
if (!rl.ok) return { error: 'Demasiados intentos. Espera un momento antes de volver a intentar.' }
```
- `rateLimitInviteAccept` (`@/lib/rate-limit`): Upstash sliding window **10 por hora** por IP (prefix `ratelimit:invite-accept`).
- **fail-CLOSED**: si Redis no responde o no esta configurado, `return { ok:false, retryAfter:3600 }` → bloquea. Endpoint sensible a abuso (crea cuentas auth) → preferimos negar.
- IP derivada de `x-forwarded-for` (primer hop) o `'unknown'` (todos los sin-IP comparten cubeta).

**2) Validacion Zod (servidor).**
```
const JoinSchema = z.object({
  full_name: z.string().min(2).max(120),
  email: z.email(),
  phone: z.string().max(30).optional().or(z.literal('')),
  password: z.string().min(8).max(72),
})
```
- Zod v4 (`zod/v4`). Reglas espejo del cliente + tope duro de password 72 (limite de bcrypt de GoTrue).
- Si falla → `return { error: <primer issue> }`. (Mensaje crudo de Zod, en ingles.)

**3) Resolver el scope del codigo.**
```
const admin = createServiceRoleClient()
const invite = await resolveInvite(admin, inviteCode)
if (!invite) return { error: 'Código de invitación inválido' }
```
- **El servidor RE-RESUELVE el codigo** (no confia en lo que mostro la pagina). La identidad del scope (coach/org/team) viene del codigo del servidor, NUNCA del body.

**4) Guard de email duplicado (pre-check).**
```
const { data: existing } = await admin.from('clients')
  .select('id').eq('email', parsed.data.email).maybeSingle()
if (existing) return { error: 'Ya existe una cuenta con ese email' }
```
- Chequeo en `clients` por `email`. **No** es atomico con el `createUser` (hay ventana de carrera), pero el `createUser` de GoTrue tambien rechaza duplicados de email en `auth.users`, asi que la coleccion final esta cubierta por GoTrue.

**5) Crear el usuario auth (GoTrue Admin API, service-role).**
```
const { data: newUser, error: authErr } = await admin.auth.admin.createUser({
  email: parsed.data.email,
  password: parsed.data.password,
  email_confirm: true,
  user_metadata: { full_name: parsed.data.full_name },
})
if (authErr) return { error: authErr.message }
```
- `email_confirm: true` → la cuenta nace **con email confirmado** (no se manda magic link / no hay verificacion por correo). El alumno puede loguear de inmediato.
- `password`: la que el alumno eligio (≥8). A diferencia del alta por coach, aqui NO hay temp-password ni HIBP-workaround — el alumno pone su propia clave.
- `user_metadata.full_name`: se guarda en `auth.users.raw_user_meta_data`.

**6) Insertar la fila `clients` (service-role).**
```
const { error: insertErr } = await admin.from('clients').insert({
  id: newUser.user.id,                 // PK = auth.uid (modelo 1:1)
  full_name, email, phone: phone || null,
  coach_id: invite.coachId,
  org_id:   invite.orgId,
  team_id:  invite.teamId,
  is_active: true,
  force_password_change: false,        // self-signup eligio su clave → NO forzar cambio
  age_confirmed_at: new Date().toISOString(),
})
```
- **`clients.id = auth.users.id`** (modelo 1:1 cuenta↔alumno).
- **Scoping (`coach_id`/`org_id`/`team_id`) sale del codigo**, no del body — la invariante de scoping (ver 4.8). El insert lo hace service-role (las 4 columnas de scoping son service-role-only; ver 4.5).
- `force_password_change: false` — el self-signup ya eligio password, no se fuerza cambio (a diferencia del alta por coach con clave temporal, que pone `true`).
- `age_confirmed_at` se sella con `now()` (el alta self-service asume confirmacion de edad implicita; el onboarding lo re-sella).
- **Rollback compensatorio:** si el insert de `clients` falla → `admin.auth.admin.deleteUser(newUser.user.id)` y devuelve el error. Evita huerfanos auth-sin-clients.

**7) Materializar la identidad (no-fatal).**
```
const identity = await createClientIdentity({
  accountId: newUser.user.id, clientId: newUser.user.id,
  coachId: invite.coachId, orgId: invite.orgId, teamId: invite.teamId,
})
if (!identity.ok) console.error('createClientIdentity (non-fatal):', identity.error)
```
- Escribe `client_accounts` + `client_memberships` (ver 4.5). **No-fatal**: si falla, las lecturas degradan al fallback de la fila `clients`.

**8) Enterprise: registrar la asignacion coach↔alumno.**
```
if (invite.scope === 'enterprise') {
  await admin.from('coach_client_assignments').insert({
    org_id: invite.orgId, client_id: newUser.user.id,
    coach_id: invite.coachId, assigned_by: invite.coachId,
  })
}
```
- Solo en scope enterprise: la org necesita la fila explicita de asignacion (la membership del coach cuyo codigo se uso es quien queda asignado; `assigned_by` = ese coach).

**9) Retorno.**
```
return { success: true, loginHref: invite.loginHref }
```
- El front redirige a `${loginHref}?registered=1`. **No autosesiona** — el alumno debe loguear con la clave que puso.

### Resumen de lo que persiste tras un join exitoso

| Tabla | Fila creada | Por quien |
|---|---|---|
| `auth.users` | usuario con email confirmado + `full_name` en metadata | GoTrue Admin (service-role) |
| `clients` | perfil con scope (coach/org/team), `force_password_change=false`, `age_confirmed_at=now` | service-role |
| `client_accounts` | 1 fila (la persona), idempotente | service-role (`createClientIdentity`) |
| `client_memberships` | 1 fila `active` con `scope` resuelto | service-role (`createClientIdentity`) |
| `coach_client_assignments` | solo si enterprise | service-role |

---

## 4.5 Consolidado del BACKEND DE CUENTAS DEL ALUMNO

Un alumno en EVA es **siempre** la tripleta `auth.users` (1) + `clients` (1) + `client_accounts`/`client_memberships` (identidad). Hay **dos caminos** de creacion:

### A) Alta por el COACH (clave temporal) — `coach/clients/_actions/clients.actions.ts`

`createClientAction` (`createClient` con FormData):
- Valida `CreateClientSchema` (full_name, email, phone, subscription_start_date, **temp_password**, age_confirmed).
- Resuelve scope del coach (`resolveCoachScope`/`getCoachClientScope`): standalone, enterprise (`scope.orgId`) o team (`scope.activeTeamId`).
- **Cap de tier** (solo standalone): cuenta `clients` activos no archivados; si `>= max_clients` → email "upgrade requerido" al coach y bloquea con `upgradeRequired`. Enterprise y team NO topan (pagan centralizado).
- `assertPlatformEmailAvailable` (RPC SECURITY DEFINER, GRANT a authenticated) chequea disponibilidad del email.
- `createUser` via **service-role** (`createServiceRoleClient()` como `authAdmin`) con:
  ```
  email: emailSan, password: parsed.data.temp_password, email_confirm: true
  ```
- Insert `clients` con:
  ```
  id: newAuthUser.user.id, coach_id: coach.id, full_name, email, phone,
  subscription_start_date, force_password_change: TRUE,   // <-- forza cambio
  age_confirmed_at: now, org_id: scope.orgId, team_id: scope.activeTeamId  // pool
  ```
- **`force_password_change: true`**: el alumno entra con la clave temporal y debe cambiarla en el primer login.
- Despues llama `createClientIdentity(...)` (mismo chokepoint).

#### Gotcha HIBP / `generateStudentTempPassword`

Archivo: `apps/web/src/lib/auth/temp-credentials.ts`.

```
export function generateStudentTempPassword(): string {
  const pin = Math.floor(100000 + Math.random() * 900000)
  return `Eva${pin}!`
}
```
- La proteccion de **leaked-password (HIBP)** de Supabase Auth esta **ON**. Un PIN puramente numerico de 6 digitos casi siempre esta en la base de filtraciones → GoTrue responde **422 "Password is known to be weak and easy to guess"** y rompe el alta/reset.
- Solucion: prefijo + simbolo `Eva${pin}!` (ej. `Eva482913!`) — pasa el filtro pero sigue siendo legible/dictable. Mismo patron en `apps/mobile`.
- Se usa tambien en el **reset de password de alumno por el coach** (mismo archivo, `coach/clients/_actions/clients.actions.ts` linea ~396, y `api/mobile/coach/clients/[clientId]/reset-password/route.ts`): `updateUserById(clientId, { password })` via service-role + `update clients set force_password_change=true`.
- **Gotcha del filtro:** HIBP corre en la **capa API** de GoTrue, no en SQL. Un reset via SQL directo (`crypt`/`gen_salt`) SALTA el filtro — por eso el helper aplica el patron en el camino API.

### B) Self-signup (`/join`) — ver 4.4

- El alumno pone su propia clave (≥8), `force_password_change: false`. Sin temp-password ni HIBP-workaround (la clave del alumno es libre y la valida GoTrue normalmente).

### `createClientIdentity` — chokepoint de escritura de identidad (F1)

Archivo: `apps/web/src/infrastructure/db/client-membership.repository.ts`.

```
createClientIdentity({ accountId, clientId, coachId, orgId, teamId? })
  scope = orgId ? 'enterprise' : teamId ? 'team' : 'standalone'
```
- **Lo llaman TODOS** los caminos de creacion (coach create, join, org add/CSV, admin). Se invoca **DESPUES** de insertar `clients`.
- Inserta:
  1. `client_accounts` `{ id: accountId }` — una fila por auth user. `23505` (unique violation) = success (idempotente).
  2. `client_memberships` `{ account_id, client_id, scope, coach_id, org_id, team_id, status: 'active' }`. Indices unicos parciales garantizan **una membership activa standalone por cuenta** + una por `(cuenta, org)`. `23505` = success.
- **Usa un TRUE service-role client** (sin cookies). Razon: los callers usan `createRawAdminClient` que corre PostgREST como el coach autenticado, y el coach NO tiene RLS write sobre `client_memberships` (self/org-admin/service-role only).
- **NON-FATAL por diseño**: envuelto en `try/catch`, jamas lanza. Un fallo degrada al fallback de lectura legacy-`clients` (la cuenta sigue funcionando para login). `INV8`: org gana sobre team si ambos vinieran (no deberia pasar).

### `requires_password_change` / `force_password_change`

- La columna es `clients.force_password_change` (boolean).
- `true` en alta por coach + en reset por coach. `false` en self-signup `/join`.
- El **proxy** (para `/admin`/`/org`) y los layouts del alumno leen este flag y empujan al alumno a la pantalla de cambio de clave. La accion de cambio vive en `c/[coach_slug]/login/_actions/login.actions.ts` (unico archivo en `app/c` que toca `force_password_change`).
- **GRANT:** `force_password_change` esta en el allowlist de `GRANT UPDATE(...)` de `clients` (el alumno puede apagarlo al cambiar su clave) — ver migracion abajo.

### Scoping de `clients` es service-role-only (column-level grants)

Migracion: `supabase/migrations/20260612140001_clients_scoping_grants.sql`.

- Patron: `REVOKE UPDATE ON public.clients FROM authenticated, anon` + `GRANT UPDATE (<17 cols de perfil>) ON public.clients TO authenticated`.
- El allowlist (17 cols) **excluye deliberadamente las 4 columnas de scoping**: `id`, `org_id`, `team_id`, `coach_id`.
- **Consecuencia:** ningun `authenticated` puede mover un alumno de scope por `PATCH`/`UPDATE` (PostgREST devuelve `42501` recien en runtime). La reasignacion org/team de alumnos pasa por **service-role con guard de membership** (refactor F1.4). El INSERT NO cambia (necesita escribir `coach_id`/`org_id`/`team_id` — eso lo hace el service-role en `createClientAction`/`joinViaInviteAction`).
- **Regla de mantenimiento OBLIGATORIA:** toda columna nueva user-editable de `clients` exige un `GRANT UPDATE(<col>)` en la MISMA migracion que la crea. Default-deny: columna sin grant → solo service-role la escribe.
- Allowlist actual (17): `age_confirmed_at`, `birth_date`, `created_at`, `email`, `force_password_change`, `full_name`, `goal_weight_kg`, `is_active`, `is_archived`, `max_hr_override`, `onboarding_completed`, `phone`, `ref_5k_time_sec`, `resting_hr`, `subscription_start_date`, `updated_at`, `use_coach_brand_colors`.

---

## 4.6 CONSENTIMIENTO de pool (Ley 21.719) — `consent.actions.ts`

Archivo: `apps/web/src/app/t/[team_slug]/consent/_actions/consent.actions.ts` (`'use server'`).

Aplica **solo al scope team** (`/t`): como el pool es de acceso multidisciplinario (varios coaches del team ven los datos de salud del alumno), la Ley 21.719 chilena exige consentimiento explicito. El alumno del pool **no entra a su dashboard** hasta otorgarlo (gate en el proxy `/t`).

### Tabla `client_consents`

Migracion: `supabase/migrations/20260609054748_governance_entitlements_consent_access_logs.sql`.

Columnas: `id`, `client_id` (FK `clients`, `ON DELETE CASCADE`), `account_id` (FK `client_accounts`, `ON DELETE SET NULL`), `team_id` (FK `teams`, `ON DELETE SET NULL`), `purpose` (CHECK IN `'pool_multidisciplinary_access'`, `'health_data_processing'`, `'photo_storage'`, `'marketing'`), `granted_at`, `revoked_at`, `consent_text_version`, `granted_via`, `created_at`. Evidencia IP/User-Agent agregada por `20260613160000_consent_evidence_ip_user_agent.sql` (`ip_address`, `user_agent`).

- **Activo = `revoked_at IS NULL`.**
- **Inmutable salvo `revoked_at`**: trigger `trg_client_consents_guard` (`client_consents_guard_immutability`, SECURITY INVOKER) — service-role bypasea; para el resto, cualquier cambio a `client_id`/`account_id`/`team_id`/`purpose`/`granted_at`/`consent_text_version`/`granted_via`/`created_at`/`id` → `check_violation`. Y `revoked_at` es **forward-only** (no se re-activa: si `OLD.revoked_at` ya estaba seteado, no se puede cambiar).
- **RLS** (relevante al alumno):
  - `client_consents_self_select` (SELECT): `account_id = auth.uid()` OR `clients.id = auth.uid()`.
  - `client_consents_self_revoke` (UPDATE): mismo predicado en USING + WITH CHECK → el alumno **puede revocar lo propio** pero (por el trigger) solo tocando `revoked_at`.
  - **El alumno NO puede self-INSERT** (no hay policy de insert para el titular). Solo coaches del team (`client_consents_team_member_manage`), coach standalone (`client_consents_standalone_coach_manage`) o service-role. **Por eso el grant inicial se hace server-side con service-role** tras verificar identidad.

### `grantTeamConsentAction(_prev, formData)` — otorgar

`CONSENT_TEXT_VERSION = 'v1'`. `POOL_CONSENT_PURPOSES = ['pool_multidisciplinary_access', 'health_data_processing']` (espejo del CHECK).

1. `accepted = formData.get('accept') === 'on' || 'true'`.
2. Zod `grantConsentSchema`: `teamSlug` (min 1), `accepted: z.literal(true)` ("Debes aceptar para continuar."), `purposes` (array de los 2 enums, min 1).
3. `getUser()` (cliente user-scoped) → si no hay user → "Sesión expirada. Vuelve a ingresar.".
4. **Verificacion de identidad** (service-role `admin`):
   - Resuelve `team` por `slug` (no borrado).
   - Verifica pertenencia: `client_memberships` con `account_id = user.id`, `team_id`, `scope='team'`, `status='active'`, `!deleted_at`. Si no, **fallback** a `clients` con `id = user.id` y `client.team_id === team.id`. Si nada matchea → "No tienes acceso a este equipo.".
   - **La identidad SALE de `auth.uid()`, no del body** — el body solo trae el `teamSlug`.
   - Resuelve `account_id` (de `client_accounts` por `id = user.id`) si existe, si no `null` (el link duro es `client_id`).
5. **Anti-duplicado**: lee consentimientos activos (`revoked_at IS NULL`) de esos `purpose` para `(client_id, team_id)`; inserta solo los faltantes.
6. **Insert via service-role** (porque el titular no puede self-INSERT), una fila por `purpose` faltante:
   ```
   { client_id, account_id, team_id, purpose, granted_at: now,
     consent_text_version: 'v1', granted_via: 'team_onboarding',
     ip_address, user_agent }   // evidencia Ley 21.719: IP + UA del titular
   ```
   - `ip_address` = `x-forwarded-for` (primer hop) o `x-real-ip` o `null`. `user_agent` = header `user-agent`.
7. **Redirect server-side** a `/t/${teamSlug}/dashboard` (evita race del client push + doble-submit). Con `has_pool_consent=true`, el proxy `/t` deja pasar a la app del alumno con marca del team.

### `revokeTeamConsentAction(_prev, formData)` — revocar (derecho del titular)

`revokeConsentSchema`: solo `teamSlug` (la identidad sale de `auth.uid()`).

1. `getUser()` → identidad.
2. Misma verificacion de pertenencia que el grant (membership scope='team' o fallback `clients.team_id`).
3. **Update user-scoped primero** (aplica policy `client_consents_self_revoke`):
   ```
   supabase.from('client_consents').update({ revoked_at: now })
     .eq('client_id', clientId).eq('team_id', team.id)
     .is('revoked_at', null).in('purpose', POOL_CONSENT_PURPOSES)
   ```
   - Solo toca filas activas (`revoked_at IS NULL`) → respeta el forward-only del trigger.
4. **Fallback service-role** solo si el update user-scoped falla (caso account_id-linked sin `clients.id = auth.uid()`). La identidad ya quedo verificada arriba.
5. Redirect a `/t/${teamSlug}/dashboard`. Con `has_pool_consent=false`, el proxy `/t` devuelve al alumno a `/consent`.

> **Invariante del consentimiento:** el alumno controla su propio consentimiento (grant inicial via service-role tras verificacion de identidad; revoke via policy self con fallback), pero NUNCA puede falsificar de quien es el consentimiento — `client_id`/`team_id` se derivan de `auth.uid()`+verificacion de pertenencia, jamas del body. El audit trail (Ley 21.719) es inmutable salvo el `revoked_at` forward-only.

---

## 4.7 Onboarding / intake del alumno — `onboarding.actions.ts`

Archivo: `apps/web/src/app/c/[coach_slug]/onboarding/_actions/onboarding.actions.ts` (`'use server'`).

`submitIntakeForm(coachSlug, prevState, formData)` — el formulario de admision tras el primer login del alumno (aplica al scope coach/enterprise; el team usa el flujo de consent).

1. `getUser()` (cliente user-scoped) → si no hay user → "No estás autenticado".
2. Lee del FormData: `weight`, `height`, `goals`, `experience_level`, `injuries`, `medical_conditions`, `availability`, `age_confirmed` (`=== 'on'`).
3. **Validacion server**: obligatorios `weight`, `height`, `goals`, `experience_level`, `availability` → si falta alguno "Por favor, completa todos los campos obligatorios.". Si `!ageConfirmed` → "Debes confirmar que tienes 14 años o más." (umbral de edad 14).
4. Insert `client_intake` (cliente **user-scoped**, RLS del alumno):
   ```
   { client_id: user.id, weight_kg: parseFloat(weight), height_cm: parseFloat(height),
     goals, experience_level, injuries|null, medical_conditions|null, availability }
   ```
   - Si error y `code !== '23505'` → "Ocurrió un error al guardar tu información." (un `23505` = intake ya existe → se ignora, idempotente).
5. Update `clients` (user-scoped): `{ onboarding_completed: true, age_confirmed_at: now }`. Si error → "Ocurrió un error al actualizar tu estado.".
   - Ambas columnas (`onboarding_completed`, `age_confirmed_at`) estan en el allowlist `GRANT UPDATE` de `clients` (user-editable).
6. `revalidatePath(\`/c/${coachSlug}/onboarding\`)` + `redirect(\`${await getClientBasePath(coachSlug)}/dashboard\`)`.
   - `getClientBasePath` (`@/lib/client/base-path`): devuelve el header `x-client-base-path` que el proxy setea al servir bajo `/e/[org_slug]` (rewrite → `/c/[coach_slug]`), con fallback `/c/${coachSlug}`. Asi el redirect post-onboarding respeta el scope enterprise.

> A diferencia de `joinViaInviteAction` (service-role en todo), el onboarding corre **user-scoped** (el alumno ya esta autenticado y edita solo su propia fila bajo RLS) — `client_intake` y las 2 columnas de `clients` estan permitidas por sus policies/grants.

---

## 4.8 Invariantes de seguridad transversales (CONSOLIDADO)

1. **Identidad SIEMPRE via `auth.uid()`.** Ningun flujo lee `coach_id`/`org_id`/`team_id`/`client_id` del body del request para decidir identidad o pertenencia. En `/join` el scope sale del **codigo** (re-resuelto en el servidor); en consent/onboarding sale de `auth.uid()` + verificacion de membership. El `teamSlug` del body solo selecciona la fila a verificar, no concede acceso.

2. **Scoping de `clients` es service-role-only.** Las 4 columnas de scoping (`id`, `org_id`, `team_id`, `coach_id`) tienen el `GRANT UPDATE` revocado a `authenticated`. Solo el service-role (alta legitima, reasignacion con guard de membership F1.4) las escribe. Un coach NO puede mover un alumno de scope por PATCH (→ `42501`).

3. **El codigo de invitacion = unica fuente de scope.** No hay parametro de "tipo de cuenta". Standalone/enterprise/team se determina por de cual tabla (`coaches`/`organization_members`/`teams`) provino el `invite_code`. La generacion garantiza unicidad cross-space; el orden de chequeo (enterprise→team→standalone) es defensa adicional.

4. **Service-role en `/join` por necesidad** (pagina publica sin sesion; debe leer branding/scope de tablas que `anon` no ve, y crear `auth.users` + `clients` + identidad). La accion RE-VALIDA el codigo server-side, no confia en el render.

5. **Rate limit fail-CLOSED** en el alta self-service (10/h por IP): crear cuentas auth es blanco de abuso → ante caida de Redis, se niega.

6. **Rollback compensatorio** en `/join`: si falla el insert de `clients`, se borra el `auth.users` recien creado (no quedan huerfanos). `createClientIdentity` es no-fatal (degrada a fallback de lectura).

7. **No autosesion tras `/join`**: la cuenta se crea pero el alumno se redirige al login (`?registered=1`) y debe autenticarse con su clave.

8. **Consentimiento (Ley 21.719):** el titular no puede self-INSERT consentimiento (lo hace service-role tras verificar identidad); puede self-revocar (policy + fallback); el audit trail es inmutable salvo `revoked_at` forward-only (trigger). Evidencia IP+UA persistida al otorgar.

9. **Clave temporal HIBP-safe** (`Eva${pin}!`) solo en alta/reset por coach; el self-signup usa la clave libre del alumno. `force_password_change=true` en alta por coach, `false` en self-signup.

---

## 4.9 Hallazgos / gotchas para el rediseño (feature parity)

- **`resolveInvite` no filtra por estado del coach standalone** (sin chequeo de suscripcion vencida/pausada/archivado). Un codigo standalone resuelve mientras la fila `coaches` exista. Si el rediseño debe bloquear altas en cuentas pausadas, el gate hay que agregarlo aqui o downstream — hoy no esta en el alta.
- **Doble resolucion del codigo por request** (`generateMetadata` + render de `page.tsx`), mas una tercera en `joinViaInviteAction`. Sin cache compartido entre ellas. Para parity esta bien; para optimizar, `React.cache` la resolveria una vez por request del render.
- **Guard de email duplicado no atomico** (pre-check en `clients` + el rechazo de GoTrue). La carrera se cierra en GoTrue, pero el mensaje al usuario puede variar (mensaje crudo de `authErr.message` vs. "Ya existe una cuenta con ese email").
- **Mensajes de error de Zod sin i18n** en `/join` (devuelve `parsed.error.issues[0]?.message` crudo, en ingles). Los mensajes manuales del resto (consent/onboarding) si estan en español.
- **`age_confirmed_at` se sella en el alta self-service** sin un checkbox explicito de edad en el `JoinForm` (a diferencia del onboarding, que exige `age_confirmed` ≥14). El consentimiento de edad en `/join` es implicito.
- **`force_password_change=false` en self-signup** significa que el alumno de `/join` NO pasa por la pantalla de cambio de clave (correcto: eligio su clave). El de alta-por-coach SI.
- **El alumno de team** no pasa por `JoinForm`+onboarding clasico: tras crearse (join scope team) entra por `/t/[slug]/login` y el gate es `/t/.../consent` (otorgar consentimiento de pool), no el intake de `client_intake`.
