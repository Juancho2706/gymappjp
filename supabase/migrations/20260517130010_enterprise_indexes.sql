-- organizations
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_trial ON organizations(trial_ends_at) WHERE status = 'trial';

-- organization_members
CREATE INDEX IF NOT EXISTS idx_org_members_org_coach ON organization_members(org_id, coach_id);
CREATE INDEX IF NOT EXISTS idx_org_members_coach ON organization_members(coach_id);
CREATE INDEX IF NOT EXISTS idx_org_members_status ON organization_members(status) WHERE deleted_at IS NULL;

-- clients
CREATE INDEX IF NOT EXISTS idx_clients_org_id ON clients(org_id) WHERE org_id IS NOT NULL;

-- coach_client_assignments
CREATE INDEX IF NOT EXISTS idx_assignments_coach_org ON coach_client_assignments(coach_id, org_id);
CREATE INDEX IF NOT EXISTS idx_assignments_client ON coach_client_assignments(client_id);

-- org_audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_date ON org_audit_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_actor ON org_audit_logs(org_id, actor_id, created_at DESC);

-- organization_invites
CREATE INDEX IF NOT EXISTS idx_invites_token_hash ON organization_invites(token_hash);
CREATE INDEX IF NOT EXISTS idx_invites_email_org ON organization_invites(email, org_id) WHERE used_at IS NULL;

-- coaches
CREATE INDEX IF NOT EXISTS idx_coaches_invite_code ON coaches(invite_code);
CREATE INDEX IF NOT EXISTS idx_coaches_active_org ON coaches(active_org_id) WHERE active_org_id IS NOT NULL;

-- org_invoices
CREATE INDEX IF NOT EXISTS idx_org_invoices_org_period ON org_invoices(org_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_org_invoices_status ON org_invoices(status) WHERE status IN ('pending','overdue');
