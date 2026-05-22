CREATE TABLE org_announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id),
  title       text NOT NULL,
  body        text NOT NULL,
  active_until timestamptz,          -- NULL = permanent until manually deactivated
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE org_announcements ENABLE ROW LEVEL SECURITY;

-- Org admins can manage announcements
CREATE POLICY "org_admin_manage_announcements" ON org_announcements
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = org_announcements.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('org_owner', 'org_admin')
        AND om.status = 'active'
        AND om.deleted_at IS NULL
    )
  );

-- Clients can read active announcements for their org
CREATE POLICY "client_read_active_announcements" ON org_announcements
  FOR SELECT USING (
    is_active = true
    AND (active_until IS NULL OR active_until > now())
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = auth.uid()
        AND c.org_id = org_announcements.org_id
    )
  );

CREATE POLICY "service_role_manage_announcements" ON org_announcements
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_org_announcements_org_active
  ON org_announcements (org_id, is_active, active_until);
