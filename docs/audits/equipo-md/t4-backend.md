# 4. Backend del equipo (acciones, servicios, RLS)

> Modelo `team`: pool plano de coaches con full-access compartido a un mismo conjunto de alumnos, AISLADO de enterprise (tablas propias `teams` / `team_members`, NO reusa `organizations`). Feature PERMANENTE de EVA tras cancelarse Movida. Rutas: `/coach/team` (gestión del pool por el coach owner/co-gestor) y `/t/[team_slug]/*` (shell del alumno). Provisión del team en sí (crear team, fijar `seat_limit`, togglear módulos) = CEO en `/admin/teams`, fuera del alcance de estos tres archivos.

Tres archivos cubiertos:

- `apps/web/src/app/coach/team/_actions/team.actions.ts` — server actions (`'use server'`).
- `apps/web/src/services/team/team.service.ts` — resolución de contexto de gestión + bitácoras.
- `apps/web/src/services/auth/team.service.ts` — helpers de pertenencia/acceso a nivel app (espejo de RLS).

---

## 4.1 Modelo de datos (tablas, columnas, constraints)

Fuente: `supabase/migrations/20260609050855_team_foundation.sql` + `20260610000000_team_brand_full.sql` + `20260610010000_team_invite_code.sql` + `20260610030000_team_kill_switch.sql`.

### `teams`
| Columna | Tipo / default | Notas |
|---|---|---|
| `id` | uuid PK `gen_random_uuid()` | |
| `name` | text NOT NULL | Nombre del equipo. Se copia a `coaches.brand_name` al crear un coach del pool. |
| `slug` | text NOT NULL | UNIQUE parcial (`teams_slug_uidx` WHERE `deleted_at IS NULL`). Ruta `/t/[slug]`. **service-role-only** (no en grant de columna). |
| `owner_coach_id` | uuid NOT NULL → `coaches(id)` ON DELETE RESTRICT | Owner del team. Solo cambia vía RPC `transfer_team_ownership`. |
| `logo_url` | text | Logo claro. |
| `primary_color` | text | Color primario del team. |
| `seat_limit` | integer NOT NULL DEFAULT 5 | Cupos de coaches activos. **service-role-only** + protegido por trigger `teams_guard_owner_fields` endurecido (ni el owner lo cambia). Lo fija el CEO en `/admin/teams`. |
| `enabled_modules` | jsonb NOT NULL DEFAULT `'{}'` | Entitlements de módulos del team. **compra-only / service-role-only** (toggle del CEO en `/admin/teams`). |
| `logo_url_dark`, `accent_light`, `accent_dark`, `splash_bg_color`, `loader_text`, `loader_text_color` | text | Marca white-label (paridad con `organizations`). |
| `neutral_tint` | boolean NOT NULL DEFAULT false | |
| `loader_icon_mode` | text NOT NULL DEFAULT `'logo'` CHECK IN (`logo`,`text`,`none`,`eva`) | |
| `use_custom_loader` | boolean NOT NULL DEFAULT false | |
| `invite_code` | text | UNIQUE parcial. Alumnos se unen al pool por `/join/[code]`. **service-role-only** (backfill `generate_unique_invite_code`). |
| `suspended_at` | timestamptz | Kill-switch de operador (CEO). Team suspendido = invisible al alumno (el RPC `get_team_alumno_context` filtra `suspended_at IS NULL`). |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |
| `deleted_at` | timestamptz | Soft-delete. **NO existe `updated_at`** en `teams` (gotcha documentado en el grant). |

### `team_members`
| Columna | Tipo / default | Notas |
|---|---|---|
| `id` | uuid PK | |
| `team_id` | uuid NOT NULL → `teams(id)` ON DELETE CASCADE | |
| `coach_id` | uuid NOT NULL → `coaches(id)` ON DELETE CASCADE | |
| `display_role` | text | Etiqueta de especialidad (display-only, p.ej. "Nutricionista"). |
| `can_manage` | boolean NOT NULL DEFAULT false | Co-gestor. Solo el owner puede otorgarlo (trigger `team_members_guard`). |
| `status` | text NOT NULL DEFAULT `'active'` CHECK IN (`active`,`suspended`,`revoked`) | Baja = `revoked` (soft). |
| `joined_at` | timestamptz NOT NULL DEFAULT now() | |
| `deleted_at` | timestamptz | Soft-delete (se setea junto con `revoked`). |
| UNIQUE `(team_id, coach_id)` | `team_members_team_coach_uniq` | Por eso `addExistingCoachAction` REACTIVA (UPDATE) si ya existe una fila revocada, en vez de insertar. |

> **Aclaración de nomenclatura:** en el modelo `team` la tabla de membresía es `team_members`, NO `organization_members`. La pertenencia a una org (enterprise) sí vive en `organization_members`. El brief de la tarea menciona "team_members/organization_members con scope team", pero en el código real son tablas separadas; `addExistingCoachAction` CONSULTA `organization_members` solo para RECHAZAR coaches que ya pertenecen a una org (aislamiento team↔enterprise), no como almacén de membresía de team.

### `clients.team_id`
- Columna `team_id uuid` agregada a `clients` → `teams(id)` ON DELETE SET NULL. Índice parcial `clients_team_id_idx WHERE team_id IS NOT NULL`.
- Un alumno con `team_id` no-nulo es accesible por **cualquier miembro activo del pool** (RLS `team_clients_member_all`, ver §4.6).
- El scoping de `clients` (`team_id`/`org_id`/`coach_id`) es **service-role-only** (migración `20260612140001_clients_scoping_grants.sql`): ningún `authenticated` mueve un alumno de scope vía PATCH. Regla LOCKED.

### `client_memberships` (scope `team`)
- Columna `team_id` + check ensanchado: `scope IN ('standalone','enterprise','team')` con composite check (`team` ⇒ `team_id NOT NULL AND org_id NULL`). UNIQUE parcial `(account_id, team_id)`.

### Bitácoras
- `team_audit_logs` — gobernanza (append-only): `team_id`, `actor_coach_id`, `action`, `target_type`, `target_id`, `metadata jsonb`, `created_at`. La escriben TODAS las actions vía `writeTeamAuditEvent`.
- `team_access_logs` — acceso a datos de salud del pool (Ley 21.719, append-only): `team_id`, `actor_coach_id`, `client_id`, `resource`, `action` (`view`/`create`/`update`/`delete`/`export`/`pdf_generate`), `metadata`. La escribe `logTeamClientAccess` (no la usan las actions de `team.actions.ts`; la usan los _data de lectura de alumnos del pool).

---

## 4.2 Servicio de contexto: `resolveTeamManagerContext` (team.service.ts)

Núcleo de autorización de TODAS las actions. Firma:

```
resolveTeamManagerContext(teamId, opts?: { requireOwner?: boolean })
  → { error: string } | TeamManagerContext
```

`TeamManagerContext = { supabase, admin, user: {id}, team: TeamRow, isOwner }`.

Pasos:
1. `supabase = await createClient()` — cliente **USER-scoped** (cookies de sesión). Las RLS + triggers de gobernanza son el techo real de los writes.
2. `supabase.auth.getUser()` → si no hay user: `{ error: 'Sesión expirada. Vuelve a ingresar.' }`. **Identidad SIEMPRE de `auth.uid()`**, jamás del body.
3. Lee `teams` user-scoped (`SELECT id, name, slug, seat_limit, owner_coach_id, primary_color, logo_url WHERE id = teamId AND deleted_at IS NULL`). La RLS `team_teams_member_select` ya restringe a teams donde el caller es miembro. Si no hay fila: `{ error: 'Equipo no encontrado.' }`.
4. `isOwner = team.owner_coach_id === user.id`.
5. Gate de permiso:
   - `requireOwner: true` → exige `isOwner`, si no `{ error: 'Solo el owner del equipo puede hacer esto.' }`.
   - default (manager) → RPC `is_team_manager(p_team_id)` (lee `auth.uid()` internamente, SECURITY DEFINER); si `!== true`: `{ error: 'No tienes permisos de gestión en este equipo.' }`. Manager = owner **o** co-gestor (`can_manage = true` activo).
6. Devuelve `admin: createServiceRoleClient()` (service-role, SIN cookies → bypass real de RLS) **SOLO** para crear cuentas auth/`coaches` y subir logos. **NUNCA** para mutar `team_members`/`teams`, porque service-role bypasearía los triggers de `seat_limit`/anti-escalación.

Patrón clave (LOCKED): **service-role para crear cuentas; user-scoped para mutar membresía/marca** (para que disparen los triggers de gobernanza).

---

## 4.3 Bitácoras: `writeTeamAuditEvent` y `logTeamClientAccess` (team.service.ts)

### `writeTeamAuditEvent(db, e)`
- INSERT en `team_audit_logs` con el cliente **user-scoped** (debe ser user-scoped para que `actor_coach_id = auth.uid()` satisfaga la policy `team_audit_logs_member_insert`: `team_id IN current_user_team_ids() AND actor_coach_id = auth.uid()`).
- Devuelve `{ error?: string }` (no lanza). Las actions la llaman pero no abortan por su error (best-effort de gobernanza).

### `logTeamClientAccess(db, input)`
- INSERT en `team_access_logs` (consentimiento/acceso a salud). **Best-effort: try/catch que NUNCA lanza** — una bitácora fallida no debe romper la lectura del coach. Policy `team_access_logs_member_insert` exige `is_team_member` + self-attribution + que el `client_id` pertenezca al `team_id`.
- No la consumen las actions de gestión; es para las queries de lectura de fichas del pool.

---

## 4.4 Helpers de pertenencia (auth/team.service.ts)

Espejo a nivel app de la RLS, para que un peer del pool no quede bloqueado por filtros `coach_id` legacy pre-RLS. Todos esperan un cliente **user-scoped** (los RPC leen `auth.uid()`).

| Helper | Qué hace |
|---|---|
| `getCoachActiveTeamIds(db, coachId)` | `team_members.team_id WHERE coach_id = coachId AND status='active' AND deleted_at IS NULL`. Ensancha queries de listado al pool. Over-inclusión segura: RLS re-filtra (e incluye `teams.deleted_at`). Devuelve `[]` ante error. |
| `isCurrentUserTeamMember(db, teamId)` | RPC `is_team_member(p_team_id)` → bool. |
| `isCurrentUserTeamManager(db, teamId)` | RPC `is_team_manager(p_team_id)` → bool (owner o co-gestor activo). |
| `currentUserHasTeamAccessToClient(db, clientId)` | Resuelve `clients.team_id` (RLS deja leerlo a un peer) y verifica membresía. `false` si `team_id` NULL (standalone/enterprise mantienen sus paths). |

---

## 4.5 Server actions (team.actions.ts) — una por una

Todas: `'use server'`, reciben `teamId` explícito + payload, resuelven contexto con `resolveTeamManagerContext`, validan con Zod (`@eva/schemas`), persisten, escriben auditoría, y terminan con `revalidatePath('/coach/team')`. Errores de DB se traducen con `friendlyTeamError(msg)` (mapea `seat_limit`/`owner`/`can_manage`/`duplicate key|unique` → copy ES; default genérico).

Helper de UX `countActiveMembers(supabase, teamId)`: cuenta `team_members` con `status='active' AND deleted_at IS NULL` (head + count exact, user-scoped → RLS es techo). Es **pre-check de UX**; el guard duro es el trigger `team_members_seat_guard`.

### (a) `createTeamCoachAction(teamId, formData)` — crear coach NUEVO + sumarlo al pool
- **Recibe (FormData):** `full_name`, `email`, `display_role` (opcional), `can_manage` (checkbox `'on'`/`'true'`), `temp_password` (opcional).
- **Valida:** `CreateTeamCoachSchema` — `full_name` 2–120, `email` válido ≤254, `display_role` ≤60 opcional, `can_manage` coerce-bool default false, `temp_password` 8–72 opcional. Si falla: `{ error: issue.message }`.
- **Autoriza:** `resolveTeamManagerContext(teamId)` (manager). Si `wantsManage && !isOwner` → `{ error: 'Solo el owner puede crear co-gestores.' }`.
- **Pre-check de cupo:** `countActiveMembers >= team.seat_limit` → error de cupo (UX). El trigger es el guard real.
- **Email:** `sanitizePlatformEmail` (trim+lower). `assertPlatformEmailAvailable(admin, email)` (RPC `check_platform_email_availability` SECURITY DEFINER, service-role): rechaza dominios bloqueados (`eva-app.cl`), desechables, y emails ya usados en la plataforma (auth/coach/client/orphan).
- **Crea cuenta auth (service-role):** `admin.auth.admin.createUser({ email, password: tempPassword || generateTempPassword(), email_confirm: true, user_metadata:{full_name}, app_metadata:{ requires_password_change: true } })`. `generateTempPassword()` produce `Eva<rand>!` (cumple HIBP / leaked-password protection; un PIN numérico sería rechazado). Si falla → `{ error }`.
- **Genera identidad en paralelo:** `generateUniqueCoachSlug(admin, full_name)` (slugify + reintentos hasta 12 chequeando colisión) y `generateUniqueInviteCode(admin)` (genera código 5-char hasta 20 intentos chequeando `coaches.invite_code`). **Gotcha:** `coaches.invite_code` tiene DEFAULT `''` y el trigger generador solo dispara con NULL → hay que setear `invite_code` explícito o el 2º coach colisiona en el unique.
- **Inserta fila `coaches` (service-role)** con: `id = newCoachId`, `full_name`, `brand_name = team.name`, `slug`, `invite_code`, `primary_color = team.primary_color ?? '#10B981'`, `logo_url = team.logo_url`, `subscription_status='team_managed'`, `subscription_tier='scale'`, `billing_cycle='monthly'`, `payment_provider='admin'`, `max_clients = getTierMaxClients('scale')`, `onboarding_guide = { invite_code_confirmed: true, ... }` (saltea el modal one-shot de migración de código, solo para coaches legacy). Coach gestionado por el team → acceso completo, **sin billing individual** (espejo de `org_managed`). Si falla → rollback: `admin.auth.admin.deleteUser(newCoachId)`.
- **Inserta `team_members` (USER-scoped):** `{ team_id, coach_id: newCoachId, display_role||null, can_manage: isOwner ? wantsManage : false, status:'active' }`. User-scoped a propósito → dispara `team_members_seat_guard` (cupo) + `team_members_guard` (anti-escalación de `can_manage`). Si falla → rollback completo: borra fila `coaches` + cuenta auth.
- **Auditoría:** `team_member.created` (metadata: email, display_role, can_manage efectivo).
- **Persiste / permisos:** cualquier manager puede crear coach básico; solo el **owner** puede crear con `can_manage=true`.
- **revalidate:** `/coach/team`.
- **Retorna:** `{ success: true, email, tempPassword }` (la UI muestra la clave temporal una sola vez).

### (b) `addExistingCoachAction(teamId, formData)` — vincular coach EXISTENTE por email
- **Recibe:** `email`, `display_role` (opcional). **Valida:** `AddExistingCoachSchema`.
- **Autoriza:** `resolveTeamManagerContext(teamId)` (manager). **Pre-check de cupo** igual que (a).
- **Lookup:** `sanitizePlatformEmail` → RPC `get_coach_id_by_email(p_email)` (SECURITY DEFINER, **service-role only**, lee `auth.users JOIN coaches`; evita `listUsers` paginado que falla con >1000 usuarios). Si no existe coach → `{ error: 'No existe un coach con ese email.' }`.
- **Aislamiento team↔enterprise:** consulta `organization_members` (service-role) `WHERE user_id = targetCoachId AND status='active' AND deleted_at IS NULL`. Si pertenece a una org → `{ error: 'Ese coach pertenece a una organización; no se puede sumar a un equipo.' }`.
- **Existencia previa en el pool:** lee `team_members WHERE team_id, coach_id` (service-role). Si `active && !deleted_at` → `{ error: 'Ese coach ya es miembro del equipo.' }`.
- **Persiste (USER-scoped):**
  - Si existe fila (revocada) → **REACTIVA** con UPDATE `{ status:'active', deleted_at:null, display_role||null }` (necesario por el UNIQUE `(team_id, coach_id)`). Dispara seat_guard en UPDATE (transición a activo cuenta cupo).
  - Si no existe → INSERT `{ team_id, coach_id, display_role||null, can_manage:false, status:'active' }`.
- **Auditoría:** `team_member.linked` (metadata: email, `reactivated`).
- **Permisos:** cualquier manager. `can_manage` SIEMPRE false al vincular existente.
- **revalidate:** `/coach/team`. **Retorna:** `{ success: true }`.

### (c) `removeTeamMemberAction(teamId, memberId)` — sacar miembro (soft-delete)
- **Autoriza:** `resolveTeamManagerContext(teamId)` (manager).
- Lee `team_members WHERE id=memberId AND team_id` (service-role, `id, coach_id, status`). Si no existe → `{ error:'Miembro no encontrado.' }`.
- **Invariante owner:** si `member.coach_id === team.owner_coach_id` → `{ error:'No se puede sacar al owner. Transfiere la propiedad primero.' }` (además del trigger `team_members_guard` que lo bloquea en DB).
- **Persiste (USER-scoped):** UPDATE `{ status:'revoked', deleted_at: now }`. Soft-delete (libera cupo).
- **Auditoría:** `team_member.revoked` (metadata: member_id, previous_status).
- **Permisos:** cualquier manager (salvo sacar al owner). **revalidate:** `/coach/team`.

### (d) `setTeamMemberManageAction(teamId, memberId, canManage)` — promover/degradar co-gestor
- **Autoriza:** `resolveTeamManagerContext(teamId, { requireOwner: true })` — **solo owner** (lo exige también el trigger `team_members_guard`).
- Lee `team_members` (service-role, `id, coach_id, can_manage`). Si no existe → error. Si `coach_id === owner` → `{ error:'El owner ya gestiona el equipo.' }`.
- **No-op idempotente:** si `member.can_manage === canManage` → `{ success: true }` sin escribir (evita bitácora duplicada por doble-click/tabs).
- **Persiste (USER-scoped):** UPDATE `{ can_manage: canManage }`.
- **Auditoría:** `team_member.promoted` o `team_member.demoted`.
- **revalidate:** `/coach/team`.

### (e) `transferTeamOwnershipAction(teamId, newOwnerCoachId)` — transferir propiedad
- **Autoriza:** `resolveTeamManagerContext(teamId, { requireOwner: true })` — solo owner.
- Si `newOwnerCoachId === team.owner_coach_id` → `{ error:'Ese coach ya es el owner.' }`.
- **Persiste (USER-scoped, ATÓMICO vía RPC):** `transfer_team_ownership(p_team_id, p_new_owner)`. La RPC (SECURITY DEFINER, una sola tx) auto-verifica que `auth.uid()` sea el owner actual y que el nuevo owner sea miembro **activo**, setea `can_manage=true` a ambos y hace el swap de `owner_coach_id`. Antes eran 3 writes sueltos sin tx → fallo parcial dejaba estado inconsistente. Aunque es SECURITY DEFINER (bypasea triggers), valida internamente owner=auth.uid().
- **Auditoría:** `team.ownership_transferred` (metadata: previous_owner). **revalidate:** `/coach/team`.

### (f) `updateTeamMemberRoleAction(teamId, memberId, displayRole)` — etiqueta de especialidad
- **Valida:** `UpdateTeamMemberRoleSchema` (`display_role` trim ≤60). **Autoriza:** manager (cualquier gestor).
- **Persiste (USER-scoped):** UPDATE `team_members SET display_role = value || null WHERE id=memberId AND team_id`.
- **Auditoría:** `team_member.role_updated` (targetType `team_member`). **revalidate:** `/coach/team`. (Display-only; no afecta permisos.)

### (g) `updateTeamBrandAction(teamId, formData)` — marca COMPLETA del team
- **Autoriza:** `resolveTeamManagerContext(teamId)` (owner **o** co-gestor; la RLS `team_teams_manager_update` es el techo; el trigger de owner solo protege `owner_coach_id`/`seat_limit`, NO color/logo). Distinta de "Mi Marca" (marca PERSONAL del coach standalone, oculta en contexto team).
- **Construye `updates` parcial validando campo a campo:**
  - `name` — si presente: 2–80 chars, si no error.
  - Colores (`primary_color`, `accent_light`, `accent_dark`, `splash_bg_color`, `loader_text_color`) — `null` (campo ausente) se saltea; `''` ⇒ limpiar (`null`, vuelve al default del sistema); hex `#RRGGBB` (`HEX_RE`) ⇒ setear; otro ⇒ error.
  - `loader_text` — ≤24 chars; **hardening Stored-XSS:** rechaza `< >` (`/[<>]/`) porque el texto se inyecta en un `<style>` del shell del alumno (`c/[coach_slug]/layout.tsx`); sin esto un gestor podía guardar `</style><script>…` y XSSear al pool.
  - `loader_icon_mode` — debe estar en `LOADER_ICON_MODES = {logo,text,none,eva}`.
  - `use_custom_loader`, `neutral_tint` — booleanos (`'on'`/`'true'`).
  - `logo` / `logo_dark` (File) — `uploadTeamImage(admin, teamId, file, 'logo'|'logo-dark')`: valida ≤2 MB, `type` `image/*`, **magic bytes** JPEG (`FF D8`) o PNG (`89 50 4E 47`), sube a bucket `logos` path `teams/<teamId>/<name>.<ext>` con `upsert:true` (service-role tras el gate de manager; bucket público), devuelve `publicUrl?t=<ts>` (cache-bust). Setea `logo_url` / `logo_url_dark`.
- Si `updates` vacío → `{ error:'Nada que actualizar.' }`.
- **Persiste (USER-scoped):** `supabase.from('teams').update(updates).eq('id', teamId)`. La RLS (manager) es el techo real del write. **Importante:** las columnas de marca tienen `GRANT UPDATE(col)` para `authenticated` (migración `20260612140000`); sin el grant PostgREST devolvería `42501`.
- **Auditoría:** `team.brand_updated` (metadata: `fields` modificados).
- **revalidate:** `/coach/team` **y** `/coach` (layout) — la marca del team pinta el shell del coach en contexto team.

---

## 4.6 Triggers, RPCs y RLS (la capa que realmente autoriza)

### Helpers SECURITY DEFINER (anti-recursión)
- `is_team_member(p_team_id)` — true si `auth.uid()` es miembro `active`/no-deleted de un team vivo. EXECUTE: `authenticated`, `service_role` (REVOKE anon/PUBLIC).
- `is_team_manager(p_team_id)` — true si `auth.uid()` es owner **o** co-gestor (`can_manage=true` activo).
- `current_user_team_ids()` / `current_user_managed_team_ids()` — set-returning (InitPlan, 1 eval/query) usados por las policies `... IN (SELECT helper())` para evitar el anti-patrón per-row sobre tablas append-only que crecen.
- `get_coach_id_by_email(p_email)` — **service-role only**, lee `auth.users`.
- `transfer_team_ownership(p_team_id, p_new_owner)` — `authenticated`; auto-verifica owner + miembro activo.

### Triggers de gobernanza (sobre `team_members` / `teams`)
- `teams_guard_owner_fields` (BEFORE UPDATE teams) — **endurecido** en `20260612140000`: `seat_limit` bloqueado para TODO `authenticated` **incluido el owner** (`RAISE EXCEPTION 'seat_limit solo lo cambia el operador (service-role)…'`); `owner_coach_id` solo cambiable por el owner (en la práctica solo vía la RPC de transferencia). service-role exento. Segunda capa de defensa por si un grant futuro re-expone `seat_limit`.
- `team_members_guard` (BEFORE INSERT/UPDATE/DELETE team_members, SECURITY DEFINER) — service-role exento. (1) No se puede borrar/modificar la membresía del **owner** salvo por el propio owner. (2) `can_manage=true` (en INSERT, o transición a true en UPDATE) solo lo otorga el **owner** (`auth.uid() = owner`), si no `RAISE EXCEPTION`. Esto es lo que hace que `createTeamCoachAction`/`setTeamMemberManageAction` deban correr user-scoped y solo dejen `can_manage` al owner.
- `team_members_seat_guard` (BEFORE INSERT/UPDATE WHEN status='active' AND deleted_at NULL) — endurecido en `20260609220000`: cuenta activos excluyendo la propia fila; un UPDATE que ya estaba activo no consume cupo; un UPDATE revoked→active sí. `RAISE EXCEPTION 'team seat_limit (%) alcanzado'` cuando `count >= seat_limit`. **No** exento de service-role explícitamente (pero el flujo nunca inserta membresía via service-role).
- `coaches_invite_code_set_once` (BEFORE UPDATE OF invite_code coaches) — set-once: NULL/vacío→valor permitido (backfill legacy); valor→otro valor prohibido salvo service-role. Refuerza la identidad-por-código del coach del pool.

### RLS (techo real de los writes user-scoped)
- `teams`: `team_teams_member_select` (SELECT a miembros), `team_teams_manager_update` (UPDATE solo a `current_user_managed_team_ids()`), `team_teams_service` (service-role ALL).
- `team_members`: `team_members_peer_select` (SELECT a miembros del pool), `team_members_manager_write` (ALL solo managers), `team_members_service` (service-role ALL).
- `team_audit_logs`: SELECT a miembros; INSERT con `actor_coach_id = auth.uid()` + team propio.
- `team_access_logs`: SELECT a miembros; INSERT con self-attribution + `client_id` perteneciente al `team_id`.
- **Acceso al pool de alumnos:** familia `team_<tabla>_member_all` ADITIVA sobre `clients`, `check_ins`, `client_intake`, `workout_logs`, `daily_habits`, `client_food_preferences`, `client_payments`, `daily_nutrition_logs`, `nutrition_meal_logs`, `nutrition_plans`, `nutrition_meals`, `food_items` — FOR ALL USING/CHECK `EXISTS(... clients c WHERE c.team_id IS NOT NULL AND is_team_member(c.team_id))`. **Cualquier miembro activo ve/edita TODO alumno del pool** (full-access compartido). `workout_plans`/`_blocks`/`_programs`/`nutrition_plan_templates`: asignados por `client_id→team_id`; templates (`client_id NULL`) compartidos por coach autor acotados al mismo team. **Scoping de `clients` (mover de scope) = service-role-only** (regla LOCKED).

### Identidad y aislamiento
- Identidad SIEMPRE de `auth.uid()` / claims JWT, nunca del body. El claim de rol para un coach de pool es `org_role` `coach_team` (lo agrega `custom_access_token_hook`; `getCoachOrgContext` en `coach-context.ts`).
- Aislamiento team↔enterprise hard: `addExistingCoachAction` rechaza coaches que estén en `organization_members` activos.

---

## 4.7 Invariantes / reglas LOCKED (para no romper en el rediseño)

1. **`seat_limit`** — service-role-only + trigger `teams_guard_owner_fields` lo bloquea para TODO `authenticated` (ni el owner). Lo fija el CEO en `/admin/teams`. El pre-check `countActiveMembers` es solo UX; el guard duro es `team_members_seat_guard`.
2. **`enabled_modules` del team** — compra-only / service-role-only (toggle del CEO). No editable user-scoped.
3. **Scoping del pool** — `clients.team_id`/`org_id`/`coach_id` solo los mueve service-role. Ningún coach reasigna un alumno de scope por PATCH.
4. **`can_manage`** — solo el owner lo otorga (trigger + gate de action). Co-gestor puede gestionar miembros/marca pero NO promover a otros ni transferir propiedad.
5. **Transferencia de propiedad** — único camino para cambiar `owner_coach_id`: RPC atómica `transfer_team_ownership` (nuevo owner debe ser miembro activo).
6. **service-role solo para crear cuentas/subir logos; user-scoped para mutar membresía/marca** (para que disparen los triggers). Mutar `team_members` vía service-role bypasearía seat/anti-escalación.
7. **Baja de coach = soft-delete** (`status='revoked'` + `deleted_at`); reactivación vía UPDATE por el UNIQUE `(team_id, coach_id)`.
8. **`coaches.invite_code`** explícito al crear coach del pool (DEFAULT `''` + trigger solo-NULL ⇒ colisión si se omite) y set-once a nivel DB.
9. **Toda columna nueva de `teams` user-editable exige `GRANT UPDATE(col)` en la MISMA migración** (default-deny; sin grant ⇒ `42501` en runtime). `teams` NO tiene `updated_at`.
10. **`loader_text` sanitizado** (sin `< >`) por inyección en `<style>` del shell del alumno.
