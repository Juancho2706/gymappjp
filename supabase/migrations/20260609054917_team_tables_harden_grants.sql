-- Hardening de grants de las tablas team (migracion team_foundation) contra el
-- ALTER DEFAULT PRIVILEGES del proyecto (authenticated/anon nacen con ALL incl.
-- TRUNCATE, no filtrado por RLS). Aplicada a prod 2026-06-09.
-- teams/team_members: set minimo DML (RLS-gated), sin TRUNCATE/REFERENCES/TRIGGER.
-- team_audit_logs: APPEND-ONLY (solo SELECT, INSERT). anon sin nada en las 3.
REVOKE ALL ON public.teams           FROM anon, authenticated;
REVOKE ALL ON public.team_members    FROM anon, authenticated;
REVOKE ALL ON public.team_audit_logs FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members   TO authenticated;
GRANT SELECT, INSERT                 ON public.team_audit_logs TO authenticated;  -- append-only

GRANT ALL ON public.teams           TO service_role;
GRANT ALL ON public.team_members    TO service_role;
GRANT ALL ON public.team_audit_logs TO service_role;
