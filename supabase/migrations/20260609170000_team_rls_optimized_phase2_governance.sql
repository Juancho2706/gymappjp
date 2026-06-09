-- TEAM RLS OPTIMIZADO — FASE 2 (gobernanza + tablas team_*).
--
-- Auditoria backend senior tras el incidente: el mismo anti-patron per-row
-- (is_team_member/is_team_manager con argumento de FILA) seguia en las policies de
-- teams / team_members / team_audit_logs / team_access_logs / client_consents /
-- workout_section_templates. No tumbo prod (el app en master no consulta estas tablas)
-- pero team_access_logs y team_audit_logs son APPEND-ONLY y CRECEN -> un gestor que abre
-- la bitacora evaluaria is_team_member por fila sobre miles. Se elimina el vicio.
--
-- Patron (igual que 20260609160000): helpers SECURITY DEFINER STABLE set-returning sin
-- parametro de fila + `col IN (SELECT helper())` -> InitPlan (1 eval/query), hash join.
-- Semantica identica a las policies originales. Aditiva / idempotente / forward-only.
-- Las funciones is_team_member/is_team_manager SE MANTIENEN (las usa el app via RPC).

-- helper nuevo: teams que el usuario GESTIONA (owner o can_manage activo)
CREATE OR REPLACE FUNCTION public.current_user_managed_team_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id FROM public.teams t
  WHERE t.deleted_at IS NULL
    AND (
      t.owner_coach_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = t.id AND tm.coach_id = auth.uid()
          AND tm.can_manage = true AND tm.status = 'active' AND tm.deleted_at IS NULL
      )
    )
$$;
REVOKE EXECUTE ON FUNCTION public.current_user_managed_team_ids() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.current_user_managed_team_ids() TO authenticated, service_role;

-- ===== teams =====
DROP POLICY IF EXISTS team_teams_member_select ON public.teams;
CREATE POLICY team_teams_member_select ON public.teams FOR SELECT TO authenticated
  USING (id IN (SELECT public.current_user_team_ids()));
DROP POLICY IF EXISTS team_teams_manager_update ON public.teams;
CREATE POLICY team_teams_manager_update ON public.teams FOR UPDATE TO authenticated
  USING (id IN (SELECT public.current_user_managed_team_ids()))
  WITH CHECK (id IN (SELECT public.current_user_managed_team_ids()));

-- ===== team_members =====
DROP POLICY IF EXISTS team_members_peer_select ON public.team_members;
CREATE POLICY team_members_peer_select ON public.team_members FOR SELECT TO authenticated
  USING (team_id IN (SELECT public.current_user_team_ids()));
DROP POLICY IF EXISTS team_members_manager_write ON public.team_members;
CREATE POLICY team_members_manager_write ON public.team_members FOR ALL TO authenticated
  USING (team_id IN (SELECT public.current_user_managed_team_ids()))
  WITH CHECK (team_id IN (SELECT public.current_user_managed_team_ids()));

-- ===== team_audit_logs (append-only) =====
DROP POLICY IF EXISTS team_audit_logs_member_select ON public.team_audit_logs;
CREATE POLICY team_audit_logs_member_select ON public.team_audit_logs FOR SELECT TO authenticated
  USING (team_id IN (SELECT public.current_user_team_ids()));
DROP POLICY IF EXISTS team_audit_logs_member_insert ON public.team_audit_logs;
CREATE POLICY team_audit_logs_member_insert ON public.team_audit_logs FOR INSERT TO authenticated
  WITH CHECK (team_id IN (SELECT public.current_user_team_ids()) AND actor_coach_id = (SELECT auth.uid()));

-- ===== team_access_logs (append-only, crece rapido) =====
DROP POLICY IF EXISTS team_access_logs_member_select ON public.team_access_logs;
CREATE POLICY team_access_logs_member_select ON public.team_access_logs FOR SELECT TO authenticated
  USING (team_id IN (SELECT public.current_user_team_ids()));
DROP POLICY IF EXISTS team_access_logs_member_insert ON public.team_access_logs;
CREATE POLICY team_access_logs_member_insert ON public.team_access_logs FOR INSERT TO authenticated
  WITH CHECK (
    team_id IN (SELECT public.current_user_team_ids())
    AND actor_coach_id = (SELECT auth.uid())
    AND (client_id IS NULL OR EXISTS (
      SELECT 1 FROM public.clients c WHERE c.id = team_access_logs.client_id AND c.team_id = team_access_logs.team_id
    ))
  );

-- ===== client_consents (policy de team) =====
DROP POLICY IF EXISTS client_consents_team_member_manage ON public.client_consents;
CREATE POLICY client_consents_team_member_manage ON public.client_consents FOR ALL TO authenticated
  USING (client_id IN (SELECT public.current_user_pool_client_ids()))
  WITH CHECK (client_id IN (SELECT public.current_user_pool_client_ids()));

-- ===== workout_section_templates (system read-only / coach propio / team gestor) =====
DROP POLICY IF EXISTS wst_select ON public.workout_section_templates;
CREATE POLICY wst_select ON public.workout_section_templates FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      is_system = true
      OR (coach_id IS NOT NULL AND coach_id = (SELECT auth.uid()))
      OR (team_id IS NOT NULL AND team_id IN (SELECT public.current_user_team_ids()))
    )
  );
DROP POLICY IF EXISTS wst_insert ON public.workout_section_templates;
CREATE POLICY wst_insert ON public.workout_section_templates FOR INSERT TO authenticated
  WITH CHECK (
    is_system = false AND (
      (coach_id IS NOT NULL AND coach_id = (SELECT auth.uid()) AND team_id IS NULL)
      OR (team_id IS NOT NULL AND team_id IN (SELECT public.current_user_managed_team_ids()) AND coach_id IS NULL)
    )
  );
DROP POLICY IF EXISTS wst_update ON public.workout_section_templates;
CREATE POLICY wst_update ON public.workout_section_templates FOR UPDATE TO authenticated
  USING (
    is_system = false AND (
      (coach_id IS NOT NULL AND coach_id = (SELECT auth.uid()))
      OR (team_id IS NOT NULL AND team_id IN (SELECT public.current_user_managed_team_ids()))
    )
  )
  WITH CHECK (
    is_system = false AND (
      (coach_id IS NOT NULL AND coach_id = (SELECT auth.uid()) AND team_id IS NULL)
      OR (team_id IS NOT NULL AND team_id IN (SELECT public.current_user_managed_team_ids()) AND coach_id IS NULL)
    )
  );
DROP POLICY IF EXISTS wst_delete ON public.workout_section_templates;
CREATE POLICY wst_delete ON public.workout_section_templates FOR DELETE TO authenticated
  USING (
    is_system = false AND (
      (coach_id IS NOT NULL AND coach_id = (SELECT auth.uid()))
      OR (team_id IS NOT NULL AND team_id IN (SELECT public.current_user_managed_team_ids()))
    )
  );
