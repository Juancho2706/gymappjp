# 1. Vision general, carga, roles y acceso

## 1.1 Que es `/coach/team` (Brand Studio + centro del pool)

La pagina vive en `apps/web/src/app/coach/team/page.tsx` (RSC `CoachTeamPage`, `metadata.title = 'Mi Equipo'`). Es un **modulo EXCLUSIVO del contexto `coach_team`**: el comentario en `page.tsx` lo declara explicito — *"fuera de el, el modulo no existe (separacion de flujos)"*. Es el centro de gobernanza del **pool de coaches** de un team (modo "team": pool plano de coaches que comparten un mismo set de alumnos, aislado de enterprise).

La pagina concentra tres responsabilidades en una sola vista:

1. **Hero de identidad** del team (logo, nombre, rol del coach actual, link/codigo de invitacion, stats).
2. **Brand Studio del equipo** (`TeamBrandStudio`) — la marca white-label que ven el pool y los alumnos en `/t/[slug]`.
3. **Gestion de miembros** (`TeamMembersManager`) — invitar, promover/degradar, transferir propiedad, sacar.

El concepto del pool: el subtitulo del hero dice **"Pool compartido — todo el equipo ve a todos los alumnos"**. Todos los coaches activos del team ven el mismo pool de `clients` (alumnos asignados via `clients.team_id`).

## 1.2 Guard de acceso (quien puede entrar)

Cadena de guards en `CoachTeamPage` (orden exacto):

1. `createClient()` (cliente Supabase server, user-scoped via cookies).
2. `supabase.auth.getClaims()` → verificacion **local** del JWT (ES256), sin round-trip a `/user`. El proxy ya valido/refresco la sesion. Si no hay `claims.sub` → `redirect('/login')`.
3. `getPreferredWorkspaceForRender(user.id)` (de `@/services/auth/workspace-render-cache`, memoizado por request con `React.cache`, keyed por `userId`). **Si `workspace?.type !== 'coach_team'` → `redirect('/coach/dashboard')`**. Este es el guard duro: solo se entra si el **workspace ACTIVO** es de tipo `coach_team`. Un coach standalone, enterprise o alumno cae a su dashboard.
4. `getCoachTeamOverview(workspace.teamId)` → `{ userId, teams }`. Si `!userId` → `redirect('/login')`.
5. **Estado vacio**: si `teams.length === 0` (no pertenece a ningun team activo, o el team fue borrado/suspendido) renderiza un empty-state: titulo "Mi equipo" + tarjeta con icono `Users` y copy *"No perteneces a ningun equipo"* / *"Cuando te sumen a un pool de coaches, aparecera aca."*

### Como se decide el workspace activo (backend de `coach_team`)

`getPreferredWorkspaceForRender` → `resolvePreferredWorkspace(supabase, userId)` (`services/auth/workspace.service.ts`), que corre en paralelo:
- `findWorkspacePreference` → lee `workspace_preferences` (la ultima eleccion del usuario).
- `listUserWorkspaces` → arma TODOS los workspaces disponibles del usuario.

Luego `pickPreferredWorkspace(workspaces, preference)` decide (funcion PURA):
- 0 workspaces → `null`.
- 1 workspace → ese (`isLastUsed: true`).
- N sin preferencia → `null` (el caller muestra selector).
- N con preferencia que matchea → ese; si no matchea ninguno → `null`.

El workspace `coach_team` se construye en `listUserWorkspaces` (loop `for (const team of teams)`):
```
{ type: 'coach_team', userId, coachId: coach?.id ?? userId, teamId: team.teamId,
  label: `${team.name} - Equipo`, brandName: team.name, slug: team.slug }
```
Detalle clave: el coach con `subscription_status === 'team_managed'` (o `org_managed`) **NO** obtiene workspace `coach_standalone` — su identidad ES el team, no un standalone fantasma. Pero un coach standalone normal puede ser standalone + enterprise + team a la vez (multi-workspace).

### Origen de los teams (RLS = techo)

`listUserWorkspaces` → `findWorkspaceIdentityRows(db, userId)` (`infrastructure/db/workspace.repository.ts`). El team se deriva de:
```
db.from('team_members')
  .select('id, team_id, teams(id, name, slug, owner_coach_id, deleted_at, suspended_at)')
  .eq('coach_id', userId).eq('status', 'active').is('deleted_at', null)
```
**Kill-switch del operador**: si `team.deleted_at` o `team.suspended_at` no son null, el team se omite (`continue`) → el workspace se vuelve invisible y el coach cae a su otro contexto o al holding. Pertenecer al pool = tener una fila `team_members` activa (`status='active'`, `deleted_at IS NULL`).

## 1.3 Que datos llegan (`getCoachTeamOverview` — `_data/team.queries.ts`)

Funcion `cache`-ada que recibe `activeTeamId` (= `workspace.teamId`, el del contexto actual; un coach en dos pools solo ve el del contexto activo). Cliente **user-scoped → RLS es el techo**: `teams` solo devuelve teams donde el coach es miembro.

Pasos:
1. `getClaims()` → `user.id` (sin `/user`). Si no hay user → `{ userId: null, teams: [] }`.
2. Query `teams` filtrada por `.eq('id', activeTeamId).is('deleted_at', null)`, ordenada por `created_at asc`. Columnas SELECT explicitas (no `SELECT *`):
   - **Identidad**: `id, name, slug, owner_coach_id, invite_code`.
   - **Cupos**: `seat_limit`.
   - **Marca completa** (paridad white-label con organizations): `primary_color, logo_url, logo_url_dark, accent_light, accent_dark, neutral_tint, splash_bg_color, loader_text, loader_text_color, loader_icon_mode, use_custom_loader`.
   - **Modulos**: `enabled_modules` (jsonb).
3. Si no hay teams → `{ userId: user.id, teams: [] }` (dispara el empty-state).
4. Por cada team (`Promise.all`), dos queries en paralelo:
   - **Miembros** (`team_members`): `id, coach_id, display_role, can_manage, joined_at, coaches(full_name, brand_name)`, filtrado `.eq('team_id', t.id).eq('status', 'active').is('deleted_at', null)`, ordenado por `joined_at asc`. Cada miembro se mapea a `TeamMemberView { id, coach_id, display_role, can_manage, name }` donde `name = brand_name || full_name || 'Coach'`.
   - **Conteo de alumnos del pool** (`clients`): `count: 'exact', head: true`, filtrado `.eq('team_id', t.id).eq('is_archived', false)` → `poolClientCount`.
5. Computa `activeMemberCount = members.length` y los flags de rol (ver 1.4).

El objeto resultante (`TeamOverview`) lleva, ademas de los campos crudos: `members[]`, `activeMemberCount`, `poolClientCount`, `isOwner`, `isManager`, `enabled_modules` (normalizado a `Record<string, boolean>` o `{}`).

> Nota: la pagina mapea `teams.map(...)` aunque por construccion `getCoachTeamOverview` filtra por `activeTeamId` → normalmente es 1 team. El array es defensivo.

## 1.4 Los ROLES y la matriz de permisos

Hay **tres roles** efectivos en el pool, derivados de dos columnas de `teams`/`team_members`:

- **Owner**: `team.owner_coach_id === user.id` → `isOwner = true`.
- **Co-gestor (manager)**: NO es owner pero `team_members.can_manage === true`.
- **Miembro**: coach activo sin `can_manage`.

Calculo en `_data/team.queries.ts`:
```
isOwner = t.owner_coach_id === user.id
isManager = isOwner || (members.find(m => m.coach_id === user.id)?.can_manage ?? false)
```
`isManager` engloba a owner + co-gestor. `isOwner` es estricto.

### Matriz de permisos (quien puede que)

| Accion | Owner | Co-gestor | Miembro | Server action | Guard de fondo |
|--------|-------|-----------|---------|---------------|----------------|
| Ver la pagina (`/coach/team`) | Si | Si | Si | — | workspace activo = `coach_team` |
| Editar marca del team | Si | Si | No | `updateTeamBrandAction` | `resolveTeamManagerContext` (manager) + RLS `team_teams_manager_update` |
| Invitar coach nuevo / existente | Si | Si | No | `createTeamCoachAction` / `addExistingCoachAction` | manager + trigger `seat_guard` |
| Crear co-gestor al invitar | Si | No | No | `createTeamCoachAction` (`can_manage` solo si `isOwner`) | `wantsManage && !isOwner` → error |
| Editar especialidad (`display_role`) | Si | Si | No | `updateTeamMemberRoleAction` | manager |
| Promover/degradar co-gestor | **Si** | No | No | `setTeamMemberManageAction` | `requireOwner: true` + trigger `team_members_guard` |
| Transferir propiedad | **Si** | No | No | `transferTeamOwnershipAction` | `requireOwner: true` + RPC `transfer_team_ownership` |
| Sacar miembro del pool | Si | Si | No | `removeTeamMemberAction` | manager; **owner no se puede sacar** |
| Sacar/transferir al owner | No (nadie) | No | No | — | trigger DB; "transfiere la propiedad primero" |

Notas de la matriz:
- **Editar marca, invitar, editar especialidad, sacar** → cualquier **manager** (owner o co-gestor). Backend: `resolveTeamManagerContext(teamId)` sin `requireOwner` → valida via RPC `is_team_manager` (lee `auth.uid()`).
- **Promover co-gestor y transferir propiedad** → **solo owner**. Backend: `resolveTeamManagerContext(teamId, { requireOwner: true })` (chequea `team.owner_coach_id === user.id`) + el trigger `team_members_guard` exige owner para tocar `can_manage`.
- El **owner es intransferible-por-remocion**: `removeTeamMemberAction` rechaza si `member.coach_id === team.owner_coach_id` ("No se puede sacar al owner. Transfiere la propiedad primero."). El trigger DB lo refuerza.
- **Doble capa de defensa**: cada action revalida el rol server-side (no confia en el frontend) y ademas los triggers de DB (`seat_guard`, `team_members_guard`, RPC `transfer_team_ownership` atomico) son el techo real porque corren sobre el cliente user-scoped. El `admin` (service-role) se usa SOLO para crear cuentas auth/coaches — **NUNCA** para mutar `team_members`, porque service-role bypasearia los triggers.

### Como el frontend refleja la matriz (`TeamMembersManager`)

Recibe `isManager`, `isOwner`, `ownerCoachId`, `userId`. Gating visible:
- Boton "Agregar coach" + dialog `AddCoachDialog` → solo si `isManager` (y deshabilitado si `seatsFull`).
- Menu de acciones por miembro (`showMenu = isManager && !isMemberOwner`): "Editar especialidad" (manager), "Hacer/Quitar co-gestor" y "Transferir propiedad" (solo `isOwner`), "Sacar del equipo" (manager).
- En `AddCoachDialog` → `NewCoachForm` muestra el checkbox "Hacerlo co-gestor" solo si `isOwner`.
- Badges: el owner lleva `Crown` + "Owner"; los co-gestores "Gestor"; el coach actual se marca "(vos)".

## 1.5 Como se compone la pagina (hero + secciones)

Para el unico team (loop defensivo), tres bloques renderizan dentro de un `<section>`:

1. **Hero de identidad** (`<header>`):
   - Logo (`team.logo_url` via `next/image fill`) o fallback icono `Users` tintado con `accent = team.primary_color || '#10B981'`.
   - Nombre (`team.name`) + Badge de rol: `Crown` "Owner" si `isOwner`, "Co-gestor" si `isManager`, si no "Miembro".
   - Subtitulo: *"Pool compartido — todo el equipo ve a todos los alumnos"*.
   - `TeamShareLink` (ver abajo).
   - **Stats row** (3 tarjetas): (a) **Cupos** con anillo SVG `activeMemberCount/seat_limit` (`seatPct` clamp 0-100); (b) **Alumnos** = `poolClientCount`; (c) **Modulos** = `Object.values(team.enabled_modules).filter(Boolean).length`, es un `<Link href="/coach/settings/modules">`.

2. **Brand Studio** (`TeamBrandStudio`): recibe `teamId`, `teamSlug`, `brand` (los 11 campos white-label + `name`) y `canEdit={team.isManager}`. Es la marca que ven el pool y los alumnos en `/t`.

3. **Miembros** (`TeamMembersManager`): recibe `teamId, ownerCoachId, userId, isManager, isOwner, seatLimit, activeMemberCount, members`.

### `TeamShareLink` (accesos de alumnos)

Recibe `teamSlug` + `inviteCode`. Renderiza dos chips copiables:
- **Login de alumnos**: `/t/[teamSlug]/login` (link + boton abrir + copiar URL completa).
- **Codigo de invitacion** (solo si `inviteCode`): muestra el `invite_code` y un link `/join/[inviteCode]` (registro self-service A.bis2 — el alumno entra directo al pool).

## 1.6 Tablas, RLS/grants y triggers tocados (backend)

- **`teams`**: fuente de identidad + marca + `seat_limit` + `enabled_modules`. Lectura user-scoped (RLS: solo teams del coach miembro). Write de marca via RLS `team_teams_manager_update` (manager). `seat_limit` y `enabled_modules` son **compra-only / CEO-only** (toggle directo en `/admin/teams`; trigger `teams_guard_owner_fields` endurecido protege `seat_limit` incluso del owner). Por el patron column-level grants del proyecto, las columnas editables por el coach exigen `GRANT UPDATE(col)`.
- **`team_members`**: membresia del pool (`coach_id`, `display_role`, `can_manage`, `status`, `joined_at`, `deleted_at`). Mutaciones SIEMPRE user-scoped → disparan `seat_guard` (limite de cupos) + `team_members_guard` (anti-escalacion: solo owner toca `can_manage`). Soft-delete = `status='revoked'` + `deleted_at`.
- **`clients`** (`team_id`): el pool de alumnos; conteo `is_archived=false`. Scoping de `clients` (`team_id`) es service-role-only.
- **`team_audit_logs`** (append-only): `writeTeamAuditEvent` registra `team_member.created/linked/revoked/promoted/demoted/role_updated`, `team.ownership_transferred`, `team.brand_updated`. Insert user-scoped (actor = `auth.uid()` + manager).
- **`team_access_logs`** (append-only, Ley 21.719): `logTeamClientAccess` bitacora acceso a datos de salud del pool (no se usa en esta pagina pero vive en el mismo service).
- **`workspace_preferences`**: define cual es el contexto activo (gate de entrada).
- **RPCs**: `is_team_manager` (gate manager), `transfer_team_ownership` (swap atomico owner + `can_manage`), `get_coach_id_by_email` (lookup para vincular coach existente).
- **Aislamiento team↔enterprise**: `addExistingCoachAction` rechaza vincular un coach que ya pertenece a una `organization` (`organization_members` activo).
