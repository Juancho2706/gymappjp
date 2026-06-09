# PLAN — movida-team

> Cómo. Ver [SPEC](SPEC.md). Schema real verificado por MCP 2026-06-09.

## Arquitectura

Concepto `team` = agrupación plana de coaches con un pool compartido de alumnos, **tablas propias** (no reusa `organizations`). Acceso vía RLS con helper `SECURITY DEFINER` (mismo patrón que `is_active_org_member`, fix recursión `20260517150000`). Full-access: cualquier miembro activo ve/edita todo el pool. Standalone (`team_id NULL`) sin cambios — las policies `team_*` son **aditivas** y solo matchean filas con `team_id` no nulo.

## Cambios de DB (migración 1 — aditiva/idempotente/forward-only)

**Tablas nuevas:**
- `teams`: `id uuid pk`, `name text`, `slug text unique`, `owner_coach_id uuid → coaches`, `logo_url`, `primary_color`, `seat_limit int`, `enabled_modules jsonb default '{}'`, `created_at`, `deleted_at`.
- `team_members`: `id`, `team_id → teams`, `coach_id → coaches`, `display_role text`, `can_manage bool default false`, `status text check (active|suspended|revoked) default 'active'`, `joined_at`, `deleted_at`, `unique(team_id, coach_id)`.
- `team_audit_logs`: `id`, `team_id`, `actor_coach_id`, `action`, `target_type`, `target_id`, `metadata jsonb`, `created_at`.

**Columnas nuevas:**
- `clients.team_id uuid null → teams` + índice.
- `client_memberships.team_id uuid null → teams`.
- `client_memberships`: ensanchar `scope_check` a `('standalone','enterprise','team')`; reemplazar composite check por uno que incluya `(scope='team' AND team_id IS NOT NULL AND org_id IS NULL)` preservando las ramas standalone/enterprise. (DROP+ADD de los 2 CHECK = seguro: el nuevo es superset; las 63 filas existentes siguen válidas.)

**Funciones (SECURITY DEFINER, STABLE, `SET search_path=public`):**
- `is_team_member(p_team_id uuid) → bool`: existe `team_members` activo para `auth.uid()` en ese team.
- `is_team_manager(p_team_id uuid) → bool`: idem + (`can_manage` OR `teams.owner_coach_id = auth.uid()`).
- `REVOKE EXECUTE ... FROM anon, public; GRANT ... TO authenticated;` (evita advisors 0028/0029).

**RLS (policies nuevas `team_*`, aditivas — NO tocar las existentes):**
- `clients`: directo por `team_id` + `is_team_member`. SELECT (USING) + INSERT/UPDATE/DELETE (WITH CHECK).
- `workout_programs`, `workout_plans`, `nutrition_plans`: por `client_id`→`clients.team_id`; **templates** (`client_id NULL`) por `coach_id ∈ team_members(team)`.
- `workout_blocks`: `EXISTS` via `plan_id → workout_plans` (no tiene client_id directo).
- `nutrition_meals`: via `plan_id → nutrition_plans`; `food_items`: via `meal_id → nutrition_meals`.
- `workout_logs`, `check_ins`, `client_intake`, `daily_nutrition_logs`, `client_payments`, `daily_habits`, `client_food_preferences`: por `client_id → clients.team_id`.
- `nutrition_meal_logs`: via `daily_log_id → daily_nutrition_logs.client_id`.
- `teams`/`team_members`/`team_audit_logs`: RLS on; miembros ven su team (helper); gestión (insert/update miembros) gateada por `is_team_manager`.
- Performance: envolver `auth.uid()` en `(select auth.uid())`; indexar todas las FK nuevas.

## Reuso de código existente

- Patrón helper: `is_active_org_member` (`20260517150000`).
- Patrón RLS enterprise por tabla: migración `20260517130011_enterprise_rls`.
- Patrón audit: `org_audit_logs`.
- Tests de aislamiento: `tests/enterprise/rls-isolation.spec.ts` y `apps/web/scripts/enterprise-isolation-test.mjs` (clonar para `team-isolation`).

## Fases / validación

1. Autorear + revisar SQL (workflow multi-lente) → migración final + seed sintético + tests RLS. **(en curso)**
2. Aplicar en **branch de Supabase Pro** (`apply_migration`) — si el branching del MCP queda habilitado; si no, directo-en-prod-aditivo con snapshot previo (`_bak_*`).
3. Seed sintético (`execute_sql`) + tests de aislamiento (AC1-AC5) + `get_advisors` verde (AC6).
4. **PARAR antes de `merge_branch`/aplicar a prod** → pedir OK al usuario.
5. Post-merge: `supabase db pull` + regenerar `database.types.ts` + `pnpm typecheck/test/build`.

## Riesgos

- Recursión RLS en `team_members` → usar helper SECURITY DEFINER (no EXISTS directo).
- Ensanche de CHECK en `client_memberships` (tabla del split de identidad reciente) → DROP+ADD cuidadoso, verificar 63 filas válidas.
- Branching del MCP no disponible (config) → decisión operativa (fase 2).
