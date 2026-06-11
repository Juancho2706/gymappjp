# Auditoria: clientes "admin" basados en cookies vs RLS real (2026-06-11)

> **Alcance:** solo lectura de codigo local (`apps/web/src`) + policies en `supabase/migrations/`.
> No se toco la base remota ni se modifico codigo fuente. Branch: `feat/movida-platform`.

## 1. Hallazgo base (mecanismo, verificado empiricamente 2026-06-11)

Existen **3 factories** de cliente Supabase con `SUPABASE_SERVICE_ROLE_KEY` (unicos usos de la
service key en `apps/web/src`, verificado por grep):

| Factory | Archivo | Cookies | Comportamiento real |
|---|---|---|---|
| `createRawAdminClient` | `apps/web/src/lib/supabase/admin-raw.ts` | Si (`@supabase/ssr` sobre el request) | **Bimodal.** Con sesion en cookies: PostgREST recibe el JWT de la SESION en `Authorization` (la service key queda solo en `apikey`) → corre como `authenticated` y **RLS APLICA**. Sin sesion: cae al apikey → service_role real. |
| `createAdminClient` | `apps/web/src/lib/supabase/server.ts:38` | Si | **Mismo patron defectuoso** que `createRawAdminClient` (duplicado). |
| `createServiceRoleClient` | `apps/web/src/lib/supabase/admin-client.ts` | No | **Bypass real** de RLS siempre (`persistSession: false`, sin cookies). |

Matiz critico adicional: los metodos **`auth.admin.*`** (GoTrue Admin API: `createUser`,
`deleteUser`, `updateUserById`) usan los headers globales fijados al construir el cliente
(`Authorization: Bearer <service key>`); la sustitucion del token de sesion solo aplica a
PostgREST/Storage/Functions. Por eso `rawAdmin.auth.admin.*` **si es admin real** aunque
`rawAdmin.from(...)` corra como el usuario. Esto explica por que "funciona todo" en prod y el
defecto paso inadvertido: las operaciones GoTrue siempre fueron admin; las queries PostgREST
funcionaban porque el usuario de la sesion pasaba RLS de casualidad.

El codigo ya reconoce el defecto en 3 lugares (comentarios correctos):
`services/workout/workout.service.ts:82`, `infrastructure/db/client-membership.repository.ts:11-14`
y `app/c/[coach_slug]/workout/[planId]/_data/workout-execution.queries.ts:165-168`.
En cambio, la migracion `20260609180000_harden_standalone_withcheck_client_ownership.sql` (linea 11)
afirma "App escribe via service-role (bypassa RLS) → no afectado", lo cual es **falso** para los
sitios que usan `createRawAdminClient`: esas escrituras SI pasan por RLS.

## 2. Policies relevantes (resumen del estado final en `supabase/migrations/`)

- **`coaches`**: SELECT publico (`public_read_coach_branding` / `Public read access to coaches`
  `USING (true)`, baseline); UPDATE solo self (`coaches_update_own`). Vigentes (sin drops posteriores).
- **`clients`**: standalone manage propio (`clients_standalone_coach_manage`,
  `20260525180500`); org admin manage; org coach SELECT/UPDATE solo si hay fila en
  `coach_client_assignments` (`is_org_coach_assigned_to_client`); INSERT org coach
  (`clients_org_coach_insert`); pool team full-access (`team_clients_member_all`,
  `20260609160000`); alumno: SELECT/UPDATE self (baseline).
- **`workout_programs` / `workout_plans` / `workout_blocks`**: coach propio
  (+ WITH CHECK endurecido a propiedad del cliente, `20260609180000`); rama org admin/asignado;
  pool team via helpers set-returning (`team_*_member_all`, `20260609160000`).
- **`workout_logs`**: alumno self (`client_manage_logs`); coach del cliente (`workout_logs_coach`
  FOR ALL); pool team.
- **`coach_client_assignments`**: **solo** SELECT para org admins (`org_admin_see_assignments`)
  y ALL para `service_role`. **Ningun coach autenticado puede INSERT** (verificado: no existe otra policy).
- **`organization_members`**: SELECT solo para miembros activos de la org
  (`org_members_see_peers`). **El alumno NO tiene lectura** — confirmado por el comentario de
  `20260608230000_enterprise_alumno_context.sql` ("the alumno has no RLS read on organizations /
  organization_members"), que creo el RPC `get_enterprise_alumno_context` justamente por eso.
- RPC `check_platform_email_availability`: SECURITY DEFINER con GRANT a `authenticated`
  (baseline + `20260608120150/160`) → funciona sin bypass.

## 3. Inventario completo de call sites (25 en codigo de produccion)

`createRawAdminClient`: 23 sitios. `createAdminClient`: 2 sitios. (Los `.test.ts` solo mockean.)
Convencion del veredicto: **OK-RLS** = funciona porque el usuario de la sesion pasa RLS sobre esas
filas ("funciona de casualidad, no es bypass"); **OK-ADMIN** = la sub-operacion usa GoTrue admin o
RPC DEFINER y si es admin real; **ROTO** = asume bypass y RLS lo bloquea hoy.

### 3.1 `services/workout/workout.service.ts` (sesion: coach; 10 sitios)

Todas las acciones pre-validan el acceso al alumno con el cliente **user-scoped** segun el
workspace activo (`resolveCoachClientAccess`, patron 3-vias) antes de usar `adminDb`.

| Linea | Accion | Que hace con `adminDb` | ¿Asume bypass? | Comportamiento real / impacto | Veredicto |
|---|---|---|---|---|---|
| 230 | `saveWorkoutProgramAction` | SELECT/UPDATE/INSERT `workout_programs`, DELETE+INSERT `workout_plans`, INSERT `workout_blocks`, SELECT `coaches` (awareness) | No (comment linea 82 ya lo sabe) | Coach pasa RLS: propio (standalone), pool (`team_*_member_all`), org (rama workspace_manage). Filtros explicitos `coach_id`/`client_id` + org scope redundan con RLS | OK-RLS |
| 479 | `deleteWorkoutProgramAction` | DELETE `workout_programs` scoped | No | Idem; un DELETE filtrado por RLS seria 0-rows silencioso, pero el precheck lo hace inalcanzable | OK-RLS |
| 516 | `deletePlanAction` | SELECT `workout_plans` + join `workout_programs`, DELETE plan | No | Joins embebidos tambien pasan RLS (pool/propio) | OK-RLS |
| 575 | `duplicateWorkoutProgramAction` | SELECT programa propio (+`clients`, planes, bloques), INSERT copia | No | Todo `coach_id = self` → pasa | OK-RLS |
| 721 | `assignProgramToClientsAction` | SELECT template propio, SELECT `clients` destino, INSERT programas/planes/bloques, SELECT `coaches` | No | Pool: WITH CHECK team pasa; enterprise: depende de que exista la fila en `coach_client_assignments` (ver hallazgo R1 — efecto cascada) | OK-RLS |
| 971 | `getExerciseHistoryAction` | SELECT `workout_logs` + join `workout_blocks` | No | `workout_logs_coach` / team policy cubren | OK-RLS |
| 1022 | `getTemplatesForBuilderAction` | SELECT templates propios | No | `coach_id = self` | OK-RLS |
| 1059 | `loadTemplateForBuilderAction` | SELECT template propio + `exercises` | No | `exercises` SELECT es `USING (true)` para authenticated | OK-RLS |
| 1139 | `syncProgramFromTemplateAction` | SELECT programa + template propios | No | Idem | OK-RLS |
| 1230 | `getCoachClientsAction` | SELECT `clients` picker 3-vias | No | team/standalone/org-asignado pasan | OK-RLS |

**Recomendacion (todo el archivo):** reemplazar `adminDb` por el cliente user-scoped `supabase`
que ya esta en scope (mas honesto; RLS como techo = defensa en profundidad; cero cambio funcional).
El nombre `adminDb` invita a copiar el patron asumiendo bypass.

### 3.2 `app/coach/clients/_actions/clients.actions.ts` (sesion: coach; 6 sitios)

| Linea | Accion | Sub-operaciones | ¿Asume bypass? | Comportamiento real / impacto | Veredicto |
|---|---|---|---|---|---|
| 102 | `createClientAction` | (a) RPC `check_platform_email_availability`; (b) `auth.admin.createUser`; (c) INSERT `clients`; (d) **INSERT `coach_client_assignments` (linea 155, solo org)**; (e) SELECT `teams` | (d) **SI** | (a) OK-ADMIN (DEFINER+grant); (b) OK-ADMIN (GoTrue usa service key); (c) OK-RLS (WITH CHECK standalone/team/org-coach pasa); (d) **ROTO**: no hay policy de INSERT para coach → falla SIEMPRE en contexto enterprise, se traga como "non-fatal" (console.error). El alumno queda sin asignacion → invisible para el coach que lo creo (`org_coach_see_assigned` exige la fila cca) y `assignProgramToClientsAction` lo rechaza; (e) OK-RLS (member) | **ROTO (R1)** |
| 340 | `deleteClientAction` | SELECT `coaches` (edge coach-como-cliente); DELETE `clients` propio; `auth.admin.deleteUser` | No | coaches SELECT publico; DELETE pasa RLS propia; deleteUser es admin real | OK-RLS / OK-ADMIN |
| 381 | `resetClientPasswordAction` | `auth.admin.updateUserById` | No (necesita admin y LO TIENE) | GoTrue admin real; el precheck del alumno es user-scoped | OK-ADMIN |
| 418 | `archiveClientAction` | UPDATE `clients` propio | No | Pasa RLS | OK-RLS |
| 489 | `unarchiveClientAction` | UPDATE `clients` propio | No | Pasa RLS | OK-RLS |
| 528 | `toggleClientStatusAction` | UPDATE `clients` propio | No | Pasa RLS (el filtro `coach_id = self` ya acota mas que RLS) | OK-RLS |

### 3.3 `app/coach/clients/import/_actions/import.actions.ts` (sesion: coach u org admin; 1 sitio)

| Linea | Accion | Sub-operaciones | ¿Asume bypass? | Comportamiento real / impacto | Veredicto |
|---|---|---|---|---|---|
| 170 | `importClientsAction` → `createClientInternal` por fila | RPC availability; `auth.admin.createUser/deleteUser`; INSERT `clients` (org pool con `coach_id: null`, team pool, o standalone) | No | RPC y GoTrue OK-ADMIN. INSERT org pool corre como **org admin** (import gated a `isOrgAdmin`) → `clients_org_admin_manage` pasa; team → `team_clients_member_all`; standalone → propio. No inserta `coach_client_assignments` (pool sin asignar = intencional) | OK-RLS / OK-ADMIN |

### 3.4 `app/c/[coach_slug]/login/_actions/login.actions.ts` (sesion: alumno recien creada; 2 sitios)

Nota de mecanica: `signInWithPassword` escribe las cookies de sesion ANTES de crear `rawAdmin`
(en server actions las mutaciones de `cookies()` son visibles en el mismo request) → `rawAdmin`
corre como el **alumno**, no como service_role.

| Linea | Accion | Sub-operaciones | ¿Asume bypass? | Comportamiento real / impacto | Veredicto |
|---|---|---|---|---|---|
| 49 | `clientLoginAction` | (a) SELECT `coaches` por slug/invite_code; (b) SELECT `clients` self; (c) **SELECT `organization_members` (linea 110)** | (c) **SI** | (a) OK-RLS (coaches SELECT publico); (b) OK-RLS (`client_read_self`); (c) **ROTO**: el alumno no tiene lectura sobre `organization_members` → `orgMember` siempre `null` → la rama "alumno enterprise entra por el slug de OTRO coach de su misma org" devuelve "No tienes acceso a esta plataforma". Bug funcional silencioso (solo enterprise multi-coach); el camino feliz (slug del coach asignado) no pasa por esa rama | **ROTO (R2)** |
| 185 | `changePasswordAction` | UPDATE `clients` self (`force_password_change: false`) | No | `Client can update their own profile` pasa | OK-RLS |

### 3.5 `app/c/[coach_slug]/workout/[planId]/_actions/workout-log.actions.ts` (sesion: alumno; 1 sitio)

| Linea | Accion | Sub-operaciones | ¿Asume bypass? | Comportamiento real / impacto | Veredicto |
|---|---|---|---|---|---|
| 42 | `logSetAction` | SELECT/UPDATE/INSERT/DELETE `workout_logs` propios | No | `client_manage_logs` (self) pasa. Bonus: el DELETE de duplicados `.in('id', ...)` sin filtro de client_id queda acotado por RLS — aqui RLS protege activamente | OK-RLS |

### 3.6 `app/coach/settings/_actions/settings.actions.ts` (sesion: coach; 2 sitios)

| Linea | Accion | Sub-operaciones | ¿Asume bypass? | Comportamiento real / impacto | Veredicto |
|---|---|---|---|---|---|
| 63 | `updateBrandSettingsAction` | UPDATE `coaches` self | No | `coaches_update_own` pasa | OK-RLS |
| 130 | `updateLogoAction` | UPDATE `coaches` self (`logo_url`) | No | Idem | OK-RLS |

(`deleteCoachAccountAction` en el mismo archivo usa `createServiceRoleClient` — bypass real,
correcto para borrar/anonimizar data cruzada; fuera del alcance riesgoso.)

### 3.7 `app/coach/_actions/public-code.actions.ts` (sesion: coach; 1 sitio)

| Linea | Accion | Sub-operaciones | ¿Asume bypass? | Comportamiento real / impacto | Veredicto |
|---|---|---|---|---|---|
| 16 | `confirmCoachPublicCodeAction` | SELECT+UPDATE `coaches` self (merge `onboarding_guide`) | El comentario (lineas 13-15) sugiere que el admin client "arreglo" un write que no persistia — falso: corre con la MISMA RLS que el user client | Pasa `coaches_update_own`; el fix real fue el re-read+merge, no el cliente | OK-RLS |

### 3.8 `createAdminClient` (`lib/supabase/server.ts:38`) — 2 sitios

| Archivo:linea | Que hace | ¿Asume bypass? | Comportamiento real / impacto | Veredicto |
|---|---|---|---|---|
| `app/coach/_data/public-code.queries.ts:16` (`ensureCoachPublicCode`) | SELECT `coaches` por `invite_code` (unicidad) + UPDATE `coaches` del coach logueado (llamado desde `app/coach/layout.tsx:98` con `coach.id` = sesion) | Parcial: la unicidad necesita ver TODOS los coaches | SELECT pasa porque `coaches` tiene SELECT publico (no por bypass); UPDATE self pasa. Si algun dia se llamara con OTRO coachId → UPDATE 0-rows... pero `eq` retorna sin error y la funcion solo chequea `error` → devolveria un codigo NO persistido (riesgo latente, hoy inalcanzable) | OK-RLS (fragil) |
| `lib/admin/admin-action-wrapper.ts:10` (`assertAdmin`) | Solo `auth.getUser()` (gate por `ADMIN_EMAILS`); la DB se toca con `createServiceRoleClient` | No | `getUser()` lee la sesion de cookies — identico a `createClient()` con anon key. La service key aqui es peso muerto (y un cliente con service key + cookies de request es superficie innecesaria) | OK (innecesario) |

## 4. Hallazgos riesgosos priorizados

### R1 — P0: `coach_client_assignments` INSERT falla silenciosamente (enterprise)
- **Sitio:** `apps/web/src/app/coach/clients/_actions/clients.actions.ts:155` (dentro de
  `createClientAction`, cliente de linea 102).
- **Causa:** asume bypass; como coach autenticado no existe NINGUNA policy de INSERT en
  `coach_client_assignments` (solo `org_admin_see_assignments` SELECT y `service_role` ALL).
- **Impacto hoy:** cuando un coach enterprise (workspace org activo) crea un alumno desde
  `/coach/clients`: el alumno y su auth user se crean, pero la asignacion NO → el alumno
  desaparece de la vista del coach (`org_coach_see_assigned` exige la fila cca, igual que
  `is_org_coach_assigned_to_client` en workout/nutrition) y `assignProgramToClientsAction` lo
  rechaza ("El alumno no pertenece a este coach"). El error solo queda en `console.error`.
- **Fix recomendado (codigo, sin DDL):** ejecutar ESE insert con `createServiceRoleClient()`
  acotado (org/coach ya validados server-side por `resolveCoachScope`), y convertirlo en fatal
  con rollback (deleteUser + delete client) si falla. NO crear policy de INSERT para coaches
  (seria escalada horizontal: cualquier coach org podria autoasignarse alumnos).

### R2 — P1: login de alumno enterprise por slug de coach peer roto
- **Sitio:** `apps/web/src/app/c/[coach_slug]/login/_actions/login.actions.ts:110`.
- **Causa:** asume bypass; el alumno (sesion recien creada por `signInWithPassword` en el mismo
  request) no tiene lectura RLS sobre `organization_members`.
- **Impacto hoy:** un alumno enterprise solo puede loguearse por el slug/codigo de SU coach
  asignado; entrar por el de otro coach de la misma org (rama disenada para permitirlo) devuelve
  "No tienes acceso a esta plataforma". Bug funcional silencioso, sin error en logs (el
  `maybeSingle` retorna null "legitimo").
- **Fix recomendado (codigo, sin DDL):** resolver esa verificacion con `createServiceRoleClient()`
  acotado (`eq org_id` + `eq coach_id` + `status active`), o reutilizar el RPC existente
  `get_enterprise_alumno_context` (SECURITY DEFINER, ya creado para este problema exacto).

### R3 — P2: deuda estructural — dos factories "admin" que mienten
- **Sitios:** los 23 call sites OK-RLS de las secciones 3.1-3.8.
- **Riesgo:** (a) el proximo dev que copie `createRawAdminClient` asumiendo bypass reproduce
  R1/R2 (ya paso: el comentario de la migracion `20260609180000` linea 11 asume bypass que no
  existe); (b) UPDATE/DELETE filtrados por RLS son **0-rows sin error** → bugs silenciosos si los
  prechecks user-scoped y la query admin divergen; (c) comportamiento bimodal (con/sin sesion)
  imposible de razonar localmente.
- **Fix recomendado (codigo, sin DDL), en orden:**
  1. Donde solo se necesita GoTrue admin (`createUser`/`deleteUser`/`updateUserById`):
     `createServiceRoleClient()` (o un helper `createAuthAdmin()` que solo exponga `.auth.admin`).
  2. Donde las queries pasan RLS del usuario (todo workout.service, settings, public-code,
     change-password, logSet, archive/unarchive/toggle/delete de clients): usar el cliente
     **user-scoped** existente — es el cambio honesto y deja RLS como techo.
  3. Eliminar `createAdminClient` de `server.ts` (en `assertAdmin` basta `createClient()`;
     `ensureCoachPublicCode` pasa a user-scoped + el SELECT de unicidad ya es publico).
  4. Borrar `admin-raw.ts` al final, y corregir el comentario falso de la migracion 20260609180000
     en la proxima migracion documental (o en el doc canonico de RLS).
- **Testing:** por tanda solo `pnpm typecheck` + vitest (mocks ya cubren ambas factories);
  Playwright/SQL contra Supabase SOLO en el gate autorizado del plan.

## 5. Contraste: el bypass real (`createServiceRoleClient`) esta bien usado

~60 call sites usan `createServiceRoleClient` (crons, webhooks MP, rutas `/api/mobile/*` con
Bearer token sin cookies, login `/t` y `/e` pre-sesion, admin panel post-`assertAdmin`,
`team.service.getTeamManagementContext` post-validacion de membresia, registro). Todos son
contextos sin sesion de cookies o post-gate explicito, donde el bypass es necesario y correcto.
Tres archivos ya documentan la distincion correcta (ver §1). Ese es el patron a seguir:
**bypass solo con `createServiceRoleClient`, siempre despues de un gate server-side y con
filtros explicitos de tenant** (org/team/coach), nunca un cliente con service key + cookies.

## 6. Migraciones requeridas

**Ninguna.** Los dos fixes P0/P1 son de codigo (usar el bypass real acotado o el RPC DEFINER ya
existente). Si en el futuro se decidiera resolver R2 por RLS en vez de service-role, la unica
alternativa aceptable seria una policy ADITIVA de SELECT minimo sobre `organization_members`
para alumnos de la org (via helper set-returning `current_user_...`, patron de
`20260609160000` — jamas EXISTS correlacionado per-row en hot tables), validada con EXPLAIN
ANALYZE en branch efimero del MCP antes del merge. No se recomienda: el RPC existente ya cubre
el caso con menor superficie.
