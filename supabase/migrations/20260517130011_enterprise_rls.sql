-- REGLA: políticas existentes NO se modifican. Solo se agregan nuevas.
-- coaches.id = auth.uid() — no hay columna user_id separada

-- ── organizations ──────────────────────────────────────────────────────────

CREATE POLICY "org_members_see_own_org" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = organizations.id
        AND om.coach_id = auth.uid()
        AND om.status = 'active'
        AND om.deleted_at IS NULL
    )
  );

CREATE POLICY "service_role_manage_orgs" ON organizations
  FOR ALL USING (auth.role() = 'service_role');

-- ── organization_members ────────────────────────────────────────────────────

CREATE POLICY "org_members_see_peers" ON organization_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = organization_members.org_id
        AND om.coach_id = auth.uid()
        AND om.status = 'active'
        AND om.deleted_at IS NULL
    )
  );

CREATE POLICY "service_role_manage_members" ON organization_members
  FOR ALL USING (auth.role() = 'service_role');

-- ── organization_invites ────────────────────────────────────────────────────

CREATE POLICY "org_admin_see_invites" ON organization_invites
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = organization_invites.org_id
        AND om.coach_id = auth.uid()
        AND om.role IN ('org_owner','org_admin')
        AND om.status = 'active'
        AND om.deleted_at IS NULL
    )
  );

-- Autenticado puede leer invite por token_hash para poder aceptarlo
CREATE POLICY "authenticated_read_invite_by_token" ON organization_invites
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_role_manage_invites" ON organization_invites
  FOR ALL USING (auth.role() = 'service_role');

-- ── coach_client_assignments ────────────────────────────────────────────────

CREATE POLICY "org_admin_see_assignments" ON coach_client_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = coach_client_assignments.org_id
        AND om.coach_id = auth.uid()
        AND om.status = 'active'
        AND om.deleted_at IS NULL
    )
  );

CREATE POLICY "service_role_manage_assignments" ON coach_client_assignments
  FOR ALL USING (auth.role() = 'service_role');

-- ── clients (nuevas políticas enterprise — no tocar las existentes) ─────────

CREATE POLICY "org_admin_see_pool" ON clients
  FOR SELECT USING (
    org_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = clients.org_id
        AND om.coach_id = auth.uid()
        AND om.role IN ('org_owner','org_admin')
        AND om.status = 'active'
        AND om.deleted_at IS NULL
    )
  );

CREATE POLICY "org_coach_see_assigned" ON clients
  FOR SELECT USING (
    org_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM coach_client_assignments cca
      JOIN organization_members om ON om.coach_id = cca.coach_id AND om.org_id = cca.org_id
      WHERE cca.client_id = clients.id
        AND cca.deleted_at IS NULL
        AND om.coach_id = auth.uid()
        AND om.status = 'active'
        AND om.deleted_at IS NULL
    )
  );

-- ── org_audit_logs ──────────────────────────────────────────────────────────

CREATE POLICY "org_members_insert_audit" ON org_audit_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = org_audit_logs.org_id
        AND om.coach_id = auth.uid()
        AND om.status = 'active'
        AND om.deleted_at IS NULL
    )
  );

CREATE POLICY "org_admin_read_audit" ON org_audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = org_audit_logs.org_id
        AND om.coach_id = auth.uid()
        AND om.role IN ('org_owner','org_admin')
        AND om.status = 'active'
        AND om.deleted_at IS NULL
    )
  );

-- ── org_invoices ────────────────────────────────────────────────────────────

CREATE POLICY "org_admin_see_own_invoices" ON org_invoices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = org_invoices.org_id
        AND om.coach_id = auth.uid()
        AND om.role IN ('org_owner','org_admin')
        AND om.status = 'active'
        AND om.deleted_at IS NULL
    )
  );

CREATE POLICY "service_role_manage_invoices" ON org_invoices
  FOR ALL USING (auth.role() = 'service_role');

-- ── payment_exceptions ──────────────────────────────────────────────────────

CREATE POLICY "org_admin_see_exceptions" ON payment_exceptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = payment_exceptions.org_id
        AND om.coach_id = auth.uid()
        AND om.role IN ('org_owner','org_admin')
        AND om.status = 'active'
        AND om.deleted_at IS NULL
    )
  );

CREATE POLICY "service_role_manage_exceptions" ON payment_exceptions
  FOR ALL USING (auth.role() = 'service_role');

-- ── audit_log_checksums / purge_audit ───────────────────────────────────────

CREATE POLICY "service_role_only_checksums" ON audit_log_checksums
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_only_purge_audit" ON purge_audit
  FOR ALL USING (auth.role() = 'service_role');
