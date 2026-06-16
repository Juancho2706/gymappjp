-- Audit DB 2026-06-16: endurece 2 RPC SECURITY DEFINER de alcance plataforma.
--
-- check_platform_email_availability(text): oraculo de enumeracion de emails/cuentas (devuelve si
--   un email existe en auth.users/coaches/clients). Unico caller runtime = assertPlatformEmailAvailable():
--   el alta de alumno (coach/clients/_actions/clients.actions.ts) lo pasa USER-SCOPED (authenticated)
--   y el flujo de register lo pasa SERVICE-ROLE. NINGUN caller corre como anon (los server actions
--   del registro usan service-role aunque el usuario este deslogueado).
--   => REVOKE anon; se mantienen authenticated + service_role.
--
-- get_platform_trial_conversion_rate(): KPI global de conversion trial->pago de TODA la plataforma.
--   Unico caller = dashboard /admin via cliente service-role (admin/(panel)/dashboard/_data/admin.queries.ts,
--   gated por ADMIN_EMAILS). Un coach/cliente autenticado no debe poder leer metricas de plataforma.
--   => REVOKE authenticated; se mantiene service_role.
--
-- Reversible (GRANT EXECUTE ... TO <role>). Forward-only. Verificado contra pg_proc.proacl post-apply.

REVOKE EXECUTE ON FUNCTION public.check_platform_email_availability(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_platform_trial_conversion_rate() FROM authenticated;
