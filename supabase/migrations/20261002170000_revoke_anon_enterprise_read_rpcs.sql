-- Retiro de Enterprise (docs/specs/retiro-starter-y-enterprise) · cierre del grant a `anon` de las 2
-- funciones SECURITY DEFINER de lectura que sobrevivieron al E0/E1.
--
-- Por qué ahora y por qué es seguro (verificado en LIVE 2026-10-02):
--   · Los ÚNICOS llamadores son de `apps/web/src/proxy.ts` y todos corren con sesión:
--       - `get_enterprise_alumno_context` (:837 dentro de `if (user)`, :856 después del `if (!user)` que redirige).
--       - `get_org_branding` (:1324 y :1358, dentro del `if (!user) redirect` de `/c/:slug/*` no-login).
--     El comentario de 20260805182248 («hot path anon del proxy /c y /e») ya no describe el código:
--     ningún camino pre-login las llama. Sin llamadores en `apps/mobile`, `supabase/functions` ni en
--     otras funciones o políticas de la base (`prosrc`/`pg_policy` sin referencias).
--   · `authenticated` y `service_role` conservan EXECUTE: el proxy sigue funcionando igual.
--   · LIVE tiene 1 sola organización (`org-prueba`); lo expuesto a `anon` era branding, pero un
--     SECURITY DEFINER abierto a `anon` sin llamador anon es superficie gratuita (advisor
--     `anon_security_definer_function_executable`).
--   · Dry-run en LIVE (DO + RAISE EXCEPTION, rollback garantizado): tras el REVOKE quedan
--     anon=false, authenticated=true, service_role=true en ambas; sin grant a PUBLIC que lo reabra.
--
-- Rollback: GRANT EXECUTE ON FUNCTION public.get_enterprise_alumno_context(text) TO anon;
--           GRANT EXECUTE ON FUNCTION public.get_org_branding(uuid) TO anon;

SET LOCAL lock_timeout = '5s';

REVOKE EXECUTE ON FUNCTION public.get_enterprise_alumno_context(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_org_branding(uuid) FROM anon;
