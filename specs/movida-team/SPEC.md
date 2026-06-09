# SPEC — movida-team (pool compartido "team")

> Feature de la fase Cimientos del plan Movida. Ver [Director](../../docs/plans/movida/00-DIRECTOR.md) · [Plan 1](../../docs/plans/movida/01-PLAN-cimientos.md).

## Qué y por qué

EVA hoy modela **un coach por cliente** (`clients.coach_id`). Movida (centro con ~30 profesionales) necesita que **varios coaches compartan un pool de alumnos** y todos puedan ver/editar a cualquier alumno y todas las funciones, **sin** usar el flujo enterprise (que es jerárquico y asigna 1 coach por alumno). Se crea un concepto nuevo, **`team`**, aislado de enterprise: la **tercera forma de EVA** (standalone / team / enterprise).

## User stories

- Como **CEO (admin de plataforma)** creo un team, su marca, su límite de cupos (`seat_limit`) y designo un owner. *(la UI del CEO panel es otra spec; aquí va el modelo de datos + RLS que la soporta.)*
- Como **coach miembro de un team** veo y edito **todos** los alumnos del pool del team y todas las funciones habilitadas, igual que cualquier otro miembro (sin jerarquía de datos).
- Como **owner / co-gestor** (`can_manage`) gestiono los miembros del team. *(UI "Equipo" = spec aparte.)*
- Como **alumno de un team** accedo a mi app con la marca del team (`/t/[team_slug]`), y mis datos los ven los profesionales del team. *(login/branding/ruta = spec/fases siguientes; aquí va el scope `team` en `client_memberships` + `clients.team_id`.)*
- Como **coach standalone** (sin team) **nada cambia**: sigo viendo solo mis clientes.

## Alcance de esta spec

**Incluye (migración 1 + RLS):**
- Tablas `teams`, `team_members`, `team_audit_logs`.
- `clients.team_id` (FK nullable).
- `client_memberships`: columna `team_id` + scope `'team'` (ensanchar los 2 CHECK).
- Helpers `is_team_member(team_id)` y `is_team_manager(team_id)` SECURITY DEFINER (anti-recursión).
- Políticas RLS `team_*` (aditivas) en `clients` y tablas hijas de datos de cliente, con USING (lectura) + WITH CHECK (escritura) = **full-access** para miembro activo del team. Standalone/enterprise intactos.
- `teams.seat_limit` y `teams.enabled_modules` como columnas (se usan en specs siguientes).

**NO incluye (otras specs):** consentimiento (`client_consents`) + `team_access_logs`, resolución de entitlements/toggles + menú Settings, áreas custom del builder, awareness (`last_edited_by`/undo), login/branding del alumno (`/t/[team_slug]`), provisión y UI "Equipo" del CEO panel, ajuste de flujos de entrada (resolve-invite/import/join), guards de app (`assertCoachClientReadAccess`).

## Criterios de aceptación

- AC1: un miembro **activo** del team A hace SELECT/INSERT/UPDATE/DELETE sobre cualquier cliente del team A y sus datos hijos (workout/nutrition/check_ins/etc.). ✅
- AC2: un miembro del team B **no ve** ninguna fila del team A. ✅
- AC3: un coach **standalone** (no miembro de ningún team) ve **exactamente lo mismo** que antes (sus clientes por `coach_id`); cero regresión en standalone y enterprise. ✅
- AC4: un miembro **suspended/revoked** del team A ve **0 filas** del team A. ✅
- AC5: clientes con `team_id IS NULL` **no matchean** ninguna policy `team_*` (no se ensancha acceso a standalone/enterprise). ✅
- AC6: `get_advisors` (security+performance) **sin nuevos críticos** tras la migración; helpers con `search_path` y sin `EXECUTE` para anon. ✅
- AC7: la migración es **aditiva, idempotente y forward-only**; re-ejecutarla no falla; no toca data de clientes reales. ✅
- AC8: las 63 filas existentes de `client_memberships` siguen válidas tras ensanchar los CHECK. ✅

## Fuera de alcance / supuestos

- "Especialidad" del coach = etiqueta display (`team_members.display_role`), **no** restringe acceso.
- Templates (`client_id NULL`) se comparten dentro del pool (por `coach_id ∈ team`).
- Validación: en **branch de Supabase Pro** (si el MCP de branching queda habilitado) o directo-en-prod-aditivo con snapshot (decisión operativa).
