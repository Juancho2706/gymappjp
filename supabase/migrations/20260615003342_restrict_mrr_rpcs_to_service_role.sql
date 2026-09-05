-- Reconstruida el 2026-09-05 desde el estado de LIVE: la migración original se aplicó vía MCP el 2026-06-15 00:33:42 y nunca se versionó. Idempotente; la fila 20260615003342 ya existe en supabase_migrations.schema_migrations, por lo que db push NO la reejecuta.
--
-- Qué hacía: cerrar los 3 RPCs de MRR de plataforma a service_role. Se aplicó 4m44s después de
-- la versión remota 20260615002858 `exclude_test_coaches_from_mrr` (= archivo local
-- 20260614130000_exclude_test_coaches_from_mrr.sql), que los pasó a SECURITY DEFINER: al devolver
-- el MRR de TODA la plataforma no pueden quedar ejecutables por anon/authenticated.
--
-- Estado VIGENTE en LIVE al 2026-09-05 (pg_proc.proacl):
--   get_platform_mrr_12_months()      = postgres=X/postgres | service_role=X/postgres
--   get_platform_revenue_by_cycle()   = postgres=X/postgres | service_role=X/postgres
--   get_platform_revenue_by_tier()    = postgres=X/postgres | service_role=X/postgres
--   → sin PUBLIC, sin anon, sin authenticated. ✔ coincide con lo que este archivo deja.
--
-- Cross-check: el archivo local 20260614130000_exclude_test_coaches_from_mrr.sql:167-172 ya trae
-- este mismo bloque (el autor lo mergeó en el espejo local). Repetirlo es idempotente y no
-- contradice nada. Tampoco contradice a 20260805211332_fix_platform_mrr_net_flow_coupons.sql,
-- que reescribe el CUERPO de los 3 RPCs sin tocar sus grants (un CREATE OR REPLACE conserva el ACL).

REVOKE EXECUTE ON FUNCTION public.get_platform_mrr_12_months()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_platform_revenue_by_cycle() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_platform_revenue_by_tier()  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_platform_mrr_12_months()    TO service_role;
GRANT EXECUTE ON FUNCTION public.get_platform_revenue_by_cycle() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_platform_revenue_by_tier()  TO service_role;
