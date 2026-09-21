-- Advisor `anon_security_definer_function_executable` (2026-09-21): las cinco helpers
-- SECURITY DEFINER de RLS de organizaciones quedan fuera del alcance de `anon`.
--
-- Evidencia (investigación 2026-09-21, LIVE solo lectura):
-- - Único RPC desde código: `apps/web/src/proxy.ts:99` (`is_coach_active_org_member`), siempre
--   dentro de ramas `if (user)` ⇒ JWT `authenticated`. Cero callers en apps/mobile, packages y
--   supabase/functions.
-- - 22 policies `{authenticated}` no cambian. Las 11 policies `{public}` que las invocan caen en
--   tablas que o ya fallan para `anon` (`foods`, `exercises`: `permission denied for function
--   current_user_team_ids`, revocada en junio) o no tienen lector anónimo (`organization_members`,
--   `client_memberships`, `client_imports`, `nutrition_plan_cycles`, `nutrition_plan_history`).
-- - Logs de PostgREST 19-09 14:30Z → 21-09 14:30Z: cero requests con rol `anon` a esas 7 tablas.
-- - Callers internos (`private.food_visible_to_actor`, `private.food_catalog_v2_can_read_food`,
--   `assign_org_client_to_coach`, `soft_delete_nutrition_plan_template_v2`) son SECURITY DEFINER
--   owned by postgres ⇒ chequean EXECUTE como postgres, no como el invocador.
-- - Precedente idéntico: `20260609050855_team_foundation.sql` revocó `is_team_member` /
--   `is_team_manager` de `PUBLIC, anon` sin incidentes.
--
-- Nota mecánica: Postgres verifica EXECUTE al inicializar la expresión (ExecInitFunc), antes de
-- evaluar filas; el OR de policies NO hace short-circuit. Por eso la evidencia de logs importa.
--
-- 4 de 5 tenían `=X/postgres` (PUBLIC) además del grant nominal a `anon`: se revoca de ambos.
-- Idempotente y forward-only. Rollback: GRANT EXECUTE ON FUNCTION <fn> TO anon;

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.is_active_org_member(uuid)',
    'public.is_coach_active_org_member(uuid, uuid)',
    'public.is_org_admin_member(uuid)',
    'public.is_org_coach_assigned_to_client(uuid)',
    'public.is_org_coach_member(uuid, uuid)'
  ] LOOP
    IF to_regprocedure(fn) IS NULL THEN
      RAISE NOTICE '% no existe: REVOKE omitido', fn;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon;', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role;', fn);
  END LOOP;
END $$;

-- Verificación (esperado: anon = false, pub = false, auth = true, svc = true):
-- SELECT p.oid::regprocedure::text AS fn,
--        has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
--        has_function_privilege('service_role', p.oid, 'EXECUTE')  AS svc,
--        has_function_privilege('public', p.oid, 'EXECUTE')        AS pub
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname IN ('is_active_org_member','is_coach_active_org_member',
--   'is_org_admin_member','is_org_coach_assigned_to_client','is_org_coach_member');
