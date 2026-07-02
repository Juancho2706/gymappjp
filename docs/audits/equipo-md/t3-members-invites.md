# 3. Miembros, invitaciones y accesos de alumnos

Módulo **exclusivo del contexto `coach_team`**: la página `/coach/team` (`apps/web/src/app/coach/team/page.tsx`) redirige a `/coach/dashboard` si el workspace activo (resuelto por `getPreferredWorkspaceForRender`) no es `coach_team`. Un coach que pertenece a dos pools solo ve el del workspace activo (`activeTeamId`). Los datos los provee `getCoachTeamOverview(teamId)` (`_data/team.queries.ts`); la gestión de miembros la renderiza `TeamMembersManager.tsx` y los accesos de alumnos `TeamShareLink.tsx`.

Toda mutación de esta sección pasa por **server actions** en `apps/web/src/app/coach/team/_actions/team.actions.ts`, que resuelven contexto con `resolveTeamManagerContext` (`apps/web/src/services/team/team.service.ts`) y escriben bitácora con `writeTeamAuditEvent`. Cada acción cierra con `revalidatePath('/coach/team')`.

---

## 3.0 Modelo de datos y capa de permisos (BACKEND — leer primero)

### Tablas

- **`teams`** — el pool. Columnas relevantes: `id`, `name`, `slug`, `seat_limit`, `owner_coach_id`, `invite_code`, `primary_color`, `logo_url`, `logo_url_dark`, `accent_light`, `accent_dark`, `neutral_tint`, `splash_bg_color`, `loader_text`, `loader_text_color`, `loader_icon_mode`, `use_custom_loader`, `enabled_modules`, `deleted_at`.
- **`team_members`** — membresía de cada coach en el pool. Columnas: `id`, `team_id`, `coach_id`, `display_role` (etiqueta de especialidad, solo display), `can_manage` (co-gestor), `status` (`active`/`revoked`), `joined_at`, `deleted_at`. La salida hacia el front es `TeamMemberView` (`{ id, coach_id, display_role, can_manage, name }`), donde `name = coaches.brand_name || coaches.full_name || 'Coach'` (join a `coaches`).
- **`clients`** — alumnos del pool, identificados por `team_id`. El conteo del pool (`poolClientCount`) cuenta `clients` con `team_id = t.id AND is_archived = false`.
- **`team_audit_logs`** — bitácora append-only de gobernanza (`team_id`, `actor_coach_id`, `action`, `target_type`, `target_id`, `metadata`, `created_at`).

### Roles efectivos

- **Owner**: `teams.owner_coach_id === userId`. Único con permisos sobre co-gestores, transferencia y (a nivel DB) cupos.
- **Co-gestor (manager)**: `team_members.can_manage = true`. Puede invitar/sacar miembros y editar marca, pero NO tocar permisos ni transferir.
- **`isManager`** (calculado en la query) = `isOwner || (member.can_manage del usuario)`. Habilita "Agregar coach", editar especialidad y sacar miembros.
- **Miembro simple**: ve el pool pero no gestiona.

### Capa de autorización en capas (defensa en profundidad)

`resolveTeamManagerContext(teamId, { requireOwner? })`:
1. `supabase.auth.getUser()` → si no hay sesión devuelve `error` "Sesión expirada".
2. Carga `teams` (user-scoped, `deleted_at IS NULL`) → si no existe, "Equipo no encontrado".
3. `isOwner = team.owner_coach_id === user.id`.
4. Si `requireOwner` → exige `isOwner`, si no devuelve "Solo el owner del equipo puede hacer esto."
5. Si NO `requireOwner` → llama RPC **`is_team_manager(p_team_id)`** (SECURITY DEFINER; true si owner o `can_manage` activo). Si no, "No tienes permisos de gestión en este equipo."
6. Devuelve `{ supabase (user-scoped), admin (service-role), user, team, isOwner }`.

> **Decisión clave de seguridad:** el cliente **user-scoped** se usa para mutar `team_members`/`teams` (así disparan RLS + triggers). El cliente **service-role** se usa SOLO para crear cuentas auth/`coaches` y para lookups de lectura — porque service-role **bypasea** los triggers de seat_limit y anti-escalación.

### RLS y triggers (techo real, en DB)

Migraciones: `20260609050855_team_foundation.sql`, `20260609051251_team_foundation_harden_trigger_grants.sql`, `20260609220000_team_governance_hardening.sql`, `20260612140000_modules_compra_only_grants.sql`.

- **RLS `team_members_manager_write`**: `FOR ALL USING/WITH CHECK is_team_manager(team_id)` → solo manager puede insertar/actualizar/borrar membresías.
- **RLS `team_teams_manager_update`**: `is_team_manager(id)` → manager edita `teams` (marca).
- **RLS `team_members_peer_select`** / **`team_teams_member_select`**: cualquier miembro lee.
- **Trigger `team_members_guard`** (BEFORE INSERT/UPDATE/DELETE, SECURITY DEFINER):
  - service_role o `auth.uid()` null → pasa sin chequeo.
  - DELETE/UPDATE de la fila del owner por alguien que no es owner → excepción ("no se puede eliminar/modificar la membresía del owner").
  - Otorgar `can_manage = true` (INSERT, o UPDATE de `false`→`true`) por quien no es owner → excepción ("solo el owner del team puede otorgar can_manage"). **Re-valida en DB el guard de la app.**
- **Trigger `team_members_seat_guard`** (BEFORE INSERT OR UPDATE, `WHEN NEW.status='active' AND deleted_at IS NULL`): cuenta activos del team excluyendo la propia fila; si `>= seat_limit` lanza `team seat_limit (%) alcanzado`. Cubre tanto el alta nueva como la reactivación (`revoked`→`active`). Es el **guard duro**; el pre-check de la app es solo UX.
- **Trigger `teams_guard_owner_fields`** (BEFORE UPDATE): cambiar `owner_coach_id` o `seat_limit` exige ser el owner. Endurecido en `20260612140000` como segunda capa (ni el owner cambia `seat_limit` por PATCH — es compra-only del CEO).

### Errores de DB → copy amigable

`friendlyTeamError(msg)` mapea: `seat_limit`→"Límite de cupos alcanzado…", `owner`→"Esta acción solo la puede hacer el owner…", `can_manage`→"Solo el owner puede cambiar los permisos…", `duplicate key`/`unique`→"Ese coach ya está en el equipo.", default→genérico.

---

## 3.1 Lista de miembros del pool

`TeamMembersManager` recibe `members: TeamMemberView[]` (ya filtrados a `status='active'`, `deleted_at IS NULL`, ordenados por `joined_at` asc). Encabezado muestra "Miembros (`activeMemberCount`)".

Por cada miembro:
- Avatar con iniciales (`initialsOf(name)`), nombre (`+ "(vos)"` si `coach_id === userId`) y **especialidad** (`display_role || 'Coach'`).
- Badge de rol: **Owner** si `coach_id === ownerCoachId`; si no y `can_manage`, badge **Gestor**.
- Menú de acciones (`MoreVertical`) **solo** si `isManager && !isMemberOwner` (`showMenu`). Es decir: el owner no expone menú sobre sí mismo, y un miembro simple no ve menús.

Botón **"Agregar coach"** visible solo si `isManager`. Se **deshabilita** cuando `seatsFull` (`activeMemberCount >= seatLimit`) o hay una acción `pending`. Si `seatsFull && isManager`, se muestra el aviso: "Llegaste al límite de N cupos. Pide al administrador ampliar el equipo…".

El feedback (`success`/`error`) se renderiza arriba de la lista; cada acción usa el helper `run(fn, okMsg, onOk)` que ejecuta dentro de `useTransition`, captura `res.error` y muestra el mensaje o el `okMsg`.

---

## 3.2 Agregar coach (modal `AddCoachDialog`)

Modal con **toggle de modo**: `'new'` (Cuenta nueva) vs `'existing'` (Coach existente). Visible solo si `isManager`.

### Modo "Cuenta nueva" — `createTeamCoachAction(teamId, formData)`

Form (`NewCoachForm`): `full_name` (req, 2–120), `email` (req), `display_role` (opcional, ≤60), y checkbox **`can_manage`** ("Hacerlo co-gestor") **solo si quien crea es owner** (`isOwner`).

Backend (server action), en orden:
1. **Validación Zod** `CreateTeamCoachSchema` (`packages/schemas/team.ts`): `full_name` 2–120, `email` válido ≤254, `display_role` ≤60 opcional, `can_manage` coerce-boolean default false, `temp_password` 8–72 opcional. `can_manage` se lee de `'on'`/`'true'`.
2. `resolveTeamManagerContext` (manager).
3. **Guard de escalación en app**: si `wantsManage && !isOwner` → "Solo el owner puede crear co-gestores." (re-validado por trigger en DB).
4. **Pre-check de cupos** `countActiveMembers(supabase, teamId)` (user-scoped, `status='active'`, `deleted_at IS NULL`): si `>= team.seat_limit` → "Límite de N cupos alcanzado…".
5. **Email**: `sanitizePlatformEmail` (trim+lowercase) + `assertPlatformEmailAvailable(admin, email)` — normaliza (`normalizePlatformEmail`: dedup gmail dots/+alias), rechaza dominio bloqueado (`eva-app.cl`), rechaza **desechables** (lista `DISPOSABLE_EMAIL_DOMAINS`), y llama RPC `check_platform_email_availability`. Si ya existe en auth o es huérfano → `PLATFORM_EMAIL_TAKEN_ES`.
6. **Crea cuenta auth** vía service-role `admin.auth.admin.createUser`: `email_confirm: true`, `user_metadata.full_name`, `app_metadata.requires_password_change: true`. Password = `temp_password` recibido o `generateTempPassword()` (`Eva` + random base36 + 4 dígitos + `!`, p.ej. `Eva7k2p9q3841!`; cumple la regla anti-PIN de HIBP).
7. **Genera `slug` e `invite_code` únicos** en paralelo (`generateUniqueCoachSlug` reintenta 12 veces sobre `coaches.slug`; `generateUniqueInviteCode` 20 veces). El `invite_code` se setea **explícito** porque `coaches.invite_code` tiene DEFAULT `''` y el trigger generador solo dispara con NULL → omitirlo colisionaría en el unique del 2º coach.
8. **Inserta fila `coaches`** (service-role): hereda marca del team (`brand_name = team.name`, `primary_color`, `logo_url`), y queda como **coach gestionado por el team**: `subscription_status: 'team_managed'`, `subscription_tier: 'scale'`, `billing_cycle: 'monthly'`, `payment_provider: 'admin'`, `max_clients = getTierMaxClients('scale')`, `onboarding_guide: { invite_code_confirmed: true, … }` (saltea el modal de migración legacy `PublicCodeRequiredModal`). **Sin billing individual.**
9. **Inserta `team_members`** con el cliente **user-scoped** (dispara `seat_guard` + `team_members_guard`): `display_role` o null, `can_manage = isOwner ? wantsManage : false`, `status: 'active'`.
10. **Rollback compensatorio**: si falla el insert de `coaches` → borra la cuenta auth. Si falla el insert de `team_members` → borra `coaches` y la cuenta auth. (No hay tx única cross-service, se compensa manualmente.)
11. **Bitácora** `team_member.created` (metadata `email`, `display_role`, `can_manage`).
12. `revalidatePath('/coach/team')` y devuelve `{ success: true, email, tempPassword }`.

**Pantalla de éxito (credenciales post-creación):** al recibir `success`, el modal muestra el `email` y el **`tempPassword`** en una caja mono con **botón Copiar** (`navigator.clipboard.writeText`, ícono `Check` 1.5 s). Texto: "cambiará la contraseña al primer ingreso". El modal **queda abierto** hasta "Listo". Las credenciales NO se reenvían por email automáticamente — el gestor las comparte manualmente.

**Persistencia neta:** 1 usuario en `auth.users` (con `requires_password_change`), 1 fila `coaches` (team_managed/scale, slug + invite_code propios), 1 fila `team_members` activa, 1 fila `team_audit_logs`.

### Modo "Coach existente" — `addExistingCoachAction(teamId, formData)`

Form: `email` (req) + `display_role` (opcional ≤60). No hay opción de co-gestor en este flujo (entra siempre `can_manage: false`).

Backend:
1. Validación Zod `AddExistingCoachSchema` (email ≤254, display_role ≤60 opcional).
2. `resolveTeamManagerContext` (manager).
3. **Pre-check de cupos** (igual que arriba).
4. `sanitizePlatformEmail` + lookup **directo** vía RPC `get_coach_id_by_email(p_email)` (SECURITY DEFINER sobre `auth.users JOIN coaches`; solo service_role). Evita `listUsers` paginado que falla con >1000 usuarios. Si no hay coach → "No existe un coach con ese email."
5. **Aislamiento team↔enterprise**: si el coach tiene `organization_members` activo → "Ese coach pertenece a una organización; no se puede sumar a un equipo." (no se absorbe un coach de una org).
6. Busca `team_members` previa (`admin`, por `team_id`+`coach_id`):
   - Si existe **activa** (`status='active' && !deleted_at`) → "Ese coach ya es miembro del equipo."
   - Si existe **revocada** → **reactiva** (UPDATE user-scoped): `status='active'`, `deleted_at=null`, `display_role` nuevo. (El `seat_guard` se evalúa en la transición a activo.)
   - Si no existe → **insert** user-scoped con `can_manage: false`, `status:'active'`.
7. **Bitácora** `team_member.linked` (metadata `email`, `reactivated`).
8. `revalidatePath` + `{ success: true }`. El modal **cierra y resetea** (no muestra credenciales: el coach ya tiene su cuenta).

**Persistencia neta:** 1 fila `team_members` (insert o reactivación), 1 bitácora. No toca `auth`/`coaches`.

---

## 3.3 Acciones por miembro (menú, solo no-owner)

Menú visible solo si `isManager && !isMemberOwner`. Items:

### Editar especialidad — `updateTeamMemberRoleAction(teamId, memberId, displayRole)` (cualquier manager)
Modal `EditRoleDialog`: un input ≤60 con el `display_role` actual. Validación Zod `UpdateTeamMemberRoleSchema` (`display_role` trim ≤60). UPDATE user-scoped de `team_members.display_role` (o null si vacío) filtrando por `id` + `team_id`. Bitácora `team_member.role_updated`. **No cambia permisos** (es solo etiqueta de display). Toast "Especialidad actualizada".

### Hacer / quitar co-gestor — `setTeamMemberManageAction(teamId, memberId, canManage)` (SOLO owner)
Item visible solo si `isOwner`; togglea `!m.can_manage`. Backend con `requireOwner: true`:
1. Carga el miembro (admin). Si no existe → "Miembro no encontrado."
2. Si es la fila del owner → "El owner ya gestiona el equipo."
3. **No-op idempotente**: si `member.can_manage === canManage` devuelve `success` sin escribir (evita bitácora duplicada por doble-click/tabs).
4. UPDATE user-scoped `can_manage` (el trigger `team_members_guard` re-exige owner para promover).
5. Bitácora `team_member.promoted` o `team_member.demoted`. Toast "Co-gestor asignado" / "Co-gestor degradado".

### Transferir propiedad — `transferTeamOwnershipAction(teamId, newOwnerCoachId)` (SOLO owner, casi irreversible)
Item visible solo si `isOwner`; abre `AlertDialog` con copy: "X pasa a ser owner… Vos quedas como co-gestor. No se puede deshacer salvo que el nuevo owner te la devuelva." Backend con `requireOwner: true`:
1. Guard app: si `newOwnerCoachId === team.owner_coach_id` → "Ese coach ya es el owner."
2. Ejecuta **RPC atómico `transfer_team_ownership(p_team_id, p_new_owner)`** (SECURITY DEFINER, una sola tx). El RPC **auto-verifica** dentro de la tx: team existe y no borrado; `owner_coach_id === auth.uid()` (si no, "solo el owner puede transferir la propiedad"); nuevo owner ≠ owner actual; **nuevo owner es miembro activo** (si no, "el nuevo owner debe ser un miembro activo del equipo"). Luego setea `can_manage=true` para AMBOS (entrante y saliente) y hace `UPDATE teams SET owner_coach_id = p_new_owner`. (Antes eran 3 writes sueltos sin tx → un fallo parcial dejaba estado inconsistente; ahora es todo-o-nada.)
3. Bitácora `team.ownership_transferred` (metadata `previous_owner`). Toast "Propiedad transferida".

**Efecto:** el ex-owner queda como co-gestor (no pierde acceso), el nuevo controla cupos, co-gestores y futuras transferencias.

### Sacar del equipo — `removeTeamMemberAction(teamId, memberId)` (cualquier manager, reversible)
`AlertDialog` con copy: "Pierde acceso al pool. Los alumnos siguen en el equipo y los ve el resto. Reversible: lo puedes volver a agregar." Backend (manager):
1. Carga el miembro (admin). Si no existe → "Miembro no encontrado."
2. Si `member.coach_id === team.owner_coach_id` → "No se puede sacar al owner. Transfiere la propiedad primero." (también lo bloquea el trigger).
3. **Soft-delete** (UPDATE user-scoped): `status='revoked'`, `deleted_at = now()`. **NO borra la fila** → permite reactivación posterior vía "Coach existente".
4. Bitácora `team_member.revoked` (metadata `member_id`, `previous_status`). Toast "Coach removido".

**Invariante de datos:** los **alumnos del pool (`clients.team_id`) NO se tocan** — siguen en el equipo y los siguen viendo los demás coaches (lectura colaborativa por `team_id`, no por `coach_id`). Sacar al coach solo le quita a él el acceso.

---

## 3.4 Cupos (`seat_limit`)

- `seat_limit` vive en `teams`, es **compra-only del CEO** (gestionado en `/admin/teams`): un manager/owner NO lo puede cambiar por PATCH (doble candado: RLS column-grants + trigger `teams_guard_owner_fields` endurecido).
- **Conteo de cupos usados** = `team_members` con `status='active' && deleted_at IS NULL`. El hero muestra `activeMemberCount/seat_limit` (anillo SVG + porcentaje).
- **Al llenarse**: el botón "Agregar coach" se deshabilita (`seatsFull`), aparece el aviso de "pide al administrador ampliar el equipo", y aunque se intente, tanto el pre-check de la app como el **trigger `team_members_seat_guard`** rechazan el alta/reactivación con `team seat_limit (N) alcanzado` → mapeado a copy amigable. Reactivar un coach revocado también consume cupo y pasa por el guard.

---

## 3.5 Accesos de alumnos (`TeamShareLink`)

Componente del hero (siempre visible, **no es modal**). Recibe `teamSlug` e `inviteCode` (el `invite_code` del `teams`, traído por la query). **Solo copia al portapapeles / abre links — no escribe en DB.**

Dos vías de acceso para alumnos del pool:

1. **Link de login** `/t/[teamSlug]/login` — para alumnos que **ya tienen cuenta**.
   - Chip muestra `/t/{teamSlug}`, botón **Copiar** (copia la URL absoluta `origin + /t/{slug}/login`) y botón **Abrir** (`<a target="_blank">` al login del alumno).
2. **Código de invitación** `/join/[inviteCode]` — registro **self-service** (A.bis2): el alumno se crea cuenta y **entra directo al pool**. Solo se renderiza si hay `inviteCode`.
   - Chip muestra el **código** en mono espaciado + botón **Copiar** (copia `origin + /join/{inviteCode}`).

### Qué hace el código al canjearse (backend, `resolveInvite`)
`apps/web/src/app/join/[invite_code]/_lib/resolve-invite.ts` resuelve el **scope** del código por orden defensivo: enterprise (`organization_members.invite_code`) → **team (`teams.invite_code`)** → standalone (`coaches.invite_code`). Para un código de team devuelve scope `'team'` con: `teamId = teams.id`, `coachId = teams.owner_coach_id` (la fila `clients` se estampa con el **owner del team** como `coach_id`, pero las lecturas colaborativas lo ignoran y usan `team_id`), branding del team (`name`, `primary_color`, `logo_url`), `welcomeMessage = null`, y `loginHref = /t/{slug}/login`. La generación garantiza no-overlap entre los tres espacios (`generate_unique_invite_code` chequea los tres).

**Persistencia de la sección de accesos:** ninguna. Es read-only sobre `teams.slug` y `teams.invite_code`; el alta efectiva del alumno la hace el flujo `/join` (fuera de este módulo).
