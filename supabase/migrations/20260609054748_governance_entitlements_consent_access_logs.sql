-- MIGRATION 2 — Coach entitlements + Consentimientos (Ley 21.719) + Bitacora de accesos
-- Aditiva, idempotente, forward-only. Aplicada a prod 2026-06-09 via MCP. Spec: specs/movida-team/.
-- Validada: T1-T20 (tests/team/governance-isolation.sql) tx+rollback, 0 contaminacion; get_advisors 0 ERRORs.
--
-- HALLAZGO CLAVE (verificado live): el proyecto tiene ALTER DEFAULT PRIVILEGES que otorga ALL
-- (incl. TRUNCATE, no filtrado por RLS) a authenticated/anon en TODA tabla nueva de public.
-- Por eso se hace REVOKE ALL antes del GRANT minimo (append-only real). Ver tambien migracion
-- team_tables_harden_grants que aplica lo mismo a las tablas de migracion 1.

-- (1) coaches.enabled_modules (entitlements del coach standalone; en team manda teams.enabled_modules)
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS enabled_modules jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.coaches.enabled_modules IS 'Entitlements/feature flags del coach standalone para su dashboard propio. En contexto team la fuente de verdad es teams.enabled_modules.';

-- (2) client_consents (Ley 21.719). Activo = revoked_at IS NULL.
CREATE TABLE IF NOT EXISTS public.client_consents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  account_id           uuid REFERENCES public.client_accounts(id) ON DELETE SET NULL,
  team_id              uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  purpose              text NOT NULL CHECK (purpose IN ('pool_multidisciplinary_access','health_data_processing','photo_storage','marketing')),
  granted_at           timestamptz,
  revoked_at           timestamptz,
  consent_text_version text,
  granted_via          text,
  created_at           timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.client_consents IS 'Consentimiento por proposito (Ley 21.719 Chile). Activo = revoked_at IS NULL. Inmutable salvo revoked_at (trigger trg_client_consents_guard); revoke forward-only. service_role corrige.';
CREATE INDEX IF NOT EXISTS idx_client_consents_client_id  ON public.client_consents(client_id);
CREATE INDEX IF NOT EXISTS idx_client_consents_account_id ON public.client_consents(account_id);
CREATE INDEX IF NOT EXISTS idx_client_consents_team_id    ON public.client_consents(team_id);
ALTER TABLE public.client_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_consents FROM anon;
REVOKE ALL ON public.client_consents FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_consents TO authenticated;
GRANT ALL ON public.client_consents TO service_role;

CREATE OR REPLACE FUNCTION public.client_consents_guard_immutability()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $fn$
BEGIN
  IF (SELECT auth.role()) = 'service_role' THEN RETURN NEW; END IF;
  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.account_id IS DISTINCT FROM OLD.account_id
     OR NEW.team_id IS DISTINCT FROM OLD.team_id
     OR NEW.purpose IS DISTINCT FROM OLD.purpose
     OR NEW.granted_at IS DISTINCT FROM OLD.granted_at
     OR NEW.consent_text_version IS DISTINCT FROM OLD.consent_text_version
     OR NEW.granted_via IS DISTINCT FROM OLD.granted_via
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'client_consents: solo revoked_at es mutable (Ley 21.719 audit trail)' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'client_consents: revoked_at es forward-only (no se re-activa ni se edita)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_client_consents_guard ON public.client_consents;
CREATE TRIGGER trg_client_consents_guard BEFORE UPDATE ON public.client_consents FOR EACH ROW EXECUTE FUNCTION public.client_consents_guard_immutability();

DROP POLICY IF EXISTS client_consents_standalone_coach_manage ON public.client_consents;
CREATE POLICY client_consents_standalone_coach_manage ON public.client_consents AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_consents.client_id AND c.org_id IS NULL AND c.coach_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_consents.client_id AND c.org_id IS NULL AND c.coach_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS client_consents_team_member_manage ON public.client_consents;
CREATE POLICY client_consents_team_member_manage ON public.client_consents AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_consents.client_id AND c.team_id IS NOT NULL AND is_team_member(c.team_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_consents.client_id AND c.team_id IS NOT NULL AND is_team_member(c.team_id)));
DROP POLICY IF EXISTS client_consents_self_select ON public.client_consents;
CREATE POLICY client_consents_self_select ON public.client_consents AS PERMISSIVE FOR SELECT TO authenticated
  USING (account_id = (SELECT auth.uid()) OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_consents.client_id AND c.id = (SELECT auth.uid())));
DROP POLICY IF EXISTS client_consents_self_revoke ON public.client_consents;
CREATE POLICY client_consents_self_revoke ON public.client_consents AS PERMISSIVE FOR UPDATE TO authenticated
  USING (account_id = (SELECT auth.uid()) OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_consents.client_id AND c.id = (SELECT auth.uid())))
  WITH CHECK (account_id = (SELECT auth.uid()) OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_consents.client_id AND c.id = (SELECT auth.uid())));
DROP POLICY IF EXISTS client_consents_service ON public.client_consents;
CREATE POLICY client_consents_service ON public.client_consents AS PERMISSIVE FOR ALL TO service_role
  USING ((SELECT auth.role()) = 'service_role') WITH CHECK ((SELECT auth.role()) = 'service_role');

-- (3) team_access_logs (append-only)
CREATE TABLE IF NOT EXISTS public.team_access_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  actor_coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  client_id      uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  resource       text NOT NULL,
  action         text NOT NULL CHECK (action IN ('view','create','update','delete','export','pdf_generate')),
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  at             timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.team_access_logs IS 'Bitacora append-only de accesos a datos de salud por team. Append-only por grants (sin UPDATE/DELETE/TRUNCATE a authenticated) + ausencia de policies UPDATE/DELETE.';
CREATE INDEX IF NOT EXISTS idx_team_access_logs_team_at   ON public.team_access_logs(team_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_team_access_logs_client_id ON public.team_access_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_team_access_logs_actor     ON public.team_access_logs(actor_coach_id);
ALTER TABLE public.team_access_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_access_logs FROM anon;
REVOKE ALL ON public.team_access_logs FROM authenticated;
GRANT SELECT, INSERT ON public.team_access_logs TO authenticated;
GRANT ALL ON public.team_access_logs TO service_role;
DROP POLICY IF EXISTS team_access_logs_member_select ON public.team_access_logs;
CREATE POLICY team_access_logs_member_select ON public.team_access_logs AS PERMISSIVE FOR SELECT TO authenticated USING (is_team_member(team_id));
DROP POLICY IF EXISTS team_access_logs_member_insert ON public.team_access_logs;
CREATE POLICY team_access_logs_member_insert ON public.team_access_logs AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_team_member(team_id) AND actor_coach_id = (SELECT auth.uid())
    AND (client_id IS NULL OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = team_access_logs.client_id AND c.team_id = team_access_logs.team_id)));
DROP POLICY IF EXISTS team_access_logs_service ON public.team_access_logs;
CREATE POLICY team_access_logs_service ON public.team_access_logs AS PERMISSIVE FOR ALL TO service_role
  USING ((SELECT auth.role()) = 'service_role') WITH CHECK ((SELECT auth.role()) = 'service_role');
