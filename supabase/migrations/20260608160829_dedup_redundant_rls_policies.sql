-- Reconstruida el 2026-09-05 desde el estado de LIVE: la migración original se aplicó vía MCP el 2026-06-08 16:08:29 y nunca se versionó. Idempotente; la fila 20260608160829 ya existe en supabase_migrations.schema_migrations, por lo que db push NO la reejecuta.
--
-- ⚠️ ÚNICA de las 8 reconstruidas que NO se puede recrear: era una migración de BORRADO de
-- policies redundantes. Lo que se borra no deja rastro en el catálogo, así que desde LIVE es
-- imposible saber QUÉ policies desaparecieron. Este archivo es un NO-OP deliberado que sólo
-- documenta el inventario vigente hoy (2026-09-05) de las tablas del contexto.
--
-- Contexto (por qué estas tablas): la versión remota 20260608160829 se aplicó 46 s después de
-- 20260608160743 `coach_org_managed_guard` y ~14 min después de 20260608154247
-- `consolidate_foods_exercises_org_rls` (= archivo local 20260608180000_consolidate_foods_exercises_org_rls.sql).
-- Es la cola de esa ola de consolidación RLS org-scope del 2026-06-08.
--
-- ── Inventario vigente en LIVE al 2026-09-05 (SELECT sobre pg_policies) ────────────────
-- Total público: 380 policies en 100 tablas.
--
-- client_imports        : client_imports_org_all (ALL, public) · client_imports_owner_all (ALL, public)
-- clients               : archive_gate_clients_delete (RESTRICTIVE, authenticated, DELETE)
--                         archive_gate_clients_select (RESTRICTIVE, authenticated, SELECT)
--                         archive_gate_clients_update (RESTRICTIVE, authenticated, UPDATE)
--                         clients_org_admin_manage (ALL, authenticated)
--                         clients_org_coach_assigned_select (SELECT, authenticated)
--                         clients_org_coach_assigned_update (UPDATE, authenticated)
--                         clients_org_coach_insert (INSERT, authenticated)
--                         clients_self_select (SELECT, authenticated)
--                         clients_self_update (UPDATE, authenticated)
--                         clients_standalone_coach_manage (ALL, authenticated)
--                         org_admin_see_pool (SELECT, public)
--                         org_coach_see_assigned (SELECT, public)
--                         team_clients_member_all (ALL, public)
-- coaches               : clients_read_coach_branding (SELECT, public) · coaches_select_anon (SELECT, anon)
--                         coaches_select_authenticated (SELECT, authenticated) · coaches_select_own (SELECT, public)
--                         coaches_update_own (UPDATE, authenticated)
-- exercises             : exercises_client_coach_select · exercises_client_org_select · exercises_client_team_select
--                         exercises_delete_own · exercises_insert_own · exercises_org_delete · exercises_org_insert
--                         exercises_org_select · exercises_org_update · exercises_select_visible
--                         exercises_team_delete · exercises_team_insert · exercises_team_select · exercises_team_update
--                         (15 policies, todas PERMISSIVE)
-- foods                 : foods_client_coach_select · foods_client_org_select · foods_delete_own · foods_insert_own
--                         foods_org_delete · foods_org_insert · foods_org_select · foods_org_update
--                         foods_select_visible · foods_update_own  (10 policies, todas PERMISSIVE)
-- organization_members  : org_members_see_peers (SELECT, public) · service_role_manage_members (ALL, public)
-- organizations         : org_members_see_own_org (SELECT, public) · service_role_manage_orgs (ALL, public)
-- workout_sessions      : archive_gate_workout_sessions (RESTRICTIVE, authenticated, ALL)
--                         workout_sessions_client (ALL, authenticated) · workout_sessions_coach (ALL, authenticated)
--
-- Nota: parte de este inventario ya no es obra de 20260608160829 sino de olas posteriores que sí
-- están versionadas (20260617032630 rls_drop_legacy_duplicate_policies, 20260617051524
-- rls_drop_remaining_exact_duplicate_policies, 20260617170700 rls_drop_nutrition_meal_logs_legacy_dup_policies,
-- 20260805040810_archive_gate_set_based_rls.sql, 20260805041843_nutrition_v2_set_based_rls_and_or_order.sql).
-- El inventario se deja como foto de referencia, no como afirmación de autoría.

DO $$
BEGIN
  -- no-op: estado ya en LIVE. Ver el bloque comentado de arriba.
  NULL;
END
$$;
