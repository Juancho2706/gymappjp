CREATE TABLE IF NOT EXISTS organization_invites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           text NOT NULL,
  role            text NOT NULL CHECK (role IN ('org_admin','coach')),
  token_hash      text UNIQUE NOT NULL,
  expires_at      timestamptz NOT NULL DEFAULT now() + interval '7 days',
  used_at         timestamptz,
  created_by      uuid NOT NULL REFERENCES auth.users(id),
  deleted_at      timestamptz
);

ALTER TABLE organization_invites
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS redeemed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS redeemed_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_attempts int NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS attempt_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

UPDATE organization_invites
SET status = 'redeemed',
    redeemed_at = COALESCE(redeemed_at, used_at)
WHERE used_at IS NOT NULL
  AND status = 'active';

UPDATE organization_invites
SET status = 'revoked'
WHERE deleted_at IS NOT NULL
  AND status = 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_invites_status_check'
  ) THEN
    ALTER TABLE organization_invites
      ADD CONSTRAINT organization_invites_status_check
      CHECK (status IN ('active', 'redeemed', 'revoked', 'expired'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_invites_attempts_check'
  ) THEN
    ALTER TABLE organization_invites
      ADD CONSTRAINT organization_invites_attempts_check
      CHECK (max_attempts > 0 AND attempt_count >= 0 AND attempt_count <= max_attempts);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_org_invites_active_email
  ON organization_invites(org_id, email)
  WHERE status = 'active' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_org_invites_redeemed_by
  ON organization_invites(redeemed_by)
  WHERE redeemed_by IS NOT NULL;

ALTER TABLE organization_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_admin_see_invites" ON organization_invites;
CREATE POLICY "org_admin_see_invites" ON organization_invites
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = organization_invites.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('org_owner', 'org_admin')
        AND om.status = 'active'
        AND om.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "service_role_manage_invites" ON organization_invites;
CREATE POLICY "service_role_manage_invites" ON organization_invites
  FOR ALL USING (auth.role() = 'service_role');
