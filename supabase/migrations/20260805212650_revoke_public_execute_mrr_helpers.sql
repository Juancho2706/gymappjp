-- Reconstruida el 2026-09-05 desde el estado de LIVE: la migración original se aplicó vía MCP el 2026-08-05 21:26:50 y nunca se versionó. Idempotente; la fila 20260805212650 ya existe en supabase_migrations.schema_migrations, por lo que db push NO la reejecuta.
--
-- Qué hacía: matar el GRANT IMPLÍCITO a PUBLIC sobre los 2 helpers de MRR creados 13 min antes por
-- 20260805211332_fix_platform_mrr_net_flow_coupons.sql. Ese archivo hacía
-- `REVOKE EXECUTE ... FROM anon, authenticated` (líneas 71-72), pero una función nueva nace con
-- EXECUTE para PUBLIC: anon/authenticated lo seguían heredando por PUBLIC pese al revoke directo.
--
-- Evidencia documental: el propio 20260805211332_fix_platform_mrr_net_flow_coupons.sql:151-155 deja
-- escrito «(Aplicado como migracion separada 20260805212650_revoke_public_execute_mrr_helpers en LIVE:)»
-- seguido de los dos REVOKE ALL ... FROM PUBLIC. Este archivo es exactamente ese bloque.
--
-- Estado VIGENTE en LIVE al 2026-09-05 (pg_proc.proacl):
--   admin_tier_monthly_price_clp(text)          = postgres=X/postgres | service_role=X/postgres
--   admin_coach_net_monthly_clp(text,text,uuid) = postgres=X/postgres | service_role=X/postgres
--   → sin PUBLIC, sin anon, sin authenticated. La cadena SECURITY DEFINER de los RPCs del panel
--     los sigue llamando sin problema (corren como postgres, dueño de las funciones). ✔
--
-- Cross-check: NO contradice a 20260805211332 (que ordena antes y sólo revoca anon/authenticated).

REVOKE ALL ON FUNCTION public.admin_tier_monthly_price_clp(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_coach_net_monthly_clp(text, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_tier_monthly_price_clp(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_coach_net_monthly_clp(text, text, uuid) TO service_role;
