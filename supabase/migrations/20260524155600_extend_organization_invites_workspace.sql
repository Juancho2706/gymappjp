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
