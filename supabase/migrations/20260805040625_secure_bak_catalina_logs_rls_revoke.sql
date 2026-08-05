-- Fase 1 del runbook de correccion RLS (2026-08-05): cerrar fuga activa.
-- _bak_catalina_logs_20260722 estaba sin RLS y con GRANT completo a anon/authenticated
-- (46 filas de workout_logs de una alumna real, legibles y BORRABLES con la anon key).
-- Deja la tabla identica a las otras tres _bak_*: rls=true, acl solo postgres+service_role.
-- Verificado post-aplicacion: REST con anon key pasa de HTTP 206 a 401/42501.
-- Reversion: GRANT ALL ON public._bak_catalina_logs_20260722 TO anon, authenticated;
--            ALTER TABLE public._bak_catalina_logs_20260722 DISABLE ROW LEVEL SECURITY;
--
-- Gotcha permanente: los default privileges de public conceden arwdDxtm a authenticated
-- (y los de supabase_admin tambien a anon), y CREATE TABLE AS no hereda RLS del origen.
-- Todo _bak_* nuevo debe activar RLS a mano. Chequeo de release:
--   SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
ALTER TABLE public._bak_catalina_logs_20260722 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._bak_catalina_logs_20260722 FROM anon, authenticated;
