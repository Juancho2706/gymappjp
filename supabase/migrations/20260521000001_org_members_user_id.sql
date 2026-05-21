-- Enterprise identity split: organization_members.user_id is the primary
-- membership identity. coach_id remains only for members that are coaches.

ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

UPDATE organization_members
SET user_id = coach_id
WHERE user_id IS NULL
  AND coach_id IS NOT NULL;

ALTER TABLE organization_members
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE organization_members
  ALTER COLUMN coach_id DROP NOT NULL;

DROP INDEX IF EXISTS org_members_unique_active;
DROP INDEX IF EXISTS organization_members_active_unique;

CREATE UNIQUE INDEX org_members_unique_active
  ON organization_members(user_id, org_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX organization_members_active_unique
  ON organization_members(org_id, user_id)
  WHERE deleted_at IS NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_org_members_user_id
  ON organization_members(user_id);

CREATE INDEX IF NOT EXISTS idx_org_members_org_user
  ON organization_members(org_id, user_id);

CREATE INDEX IF NOT EXISTS idx_org_members_coach_id
  ON organization_members(coach_id)
  WHERE coach_id IS NOT NULL;

ALTER TABLE organization_members
  DROP CONSTRAINT IF EXISTS org_members_coach_role_requires_coach_id;

ALTER TABLE organization_members
  ADD CONSTRAINT org_members_coach_role_requires_coach_id
  CHECK (role != 'coach' OR coach_id IS NOT NULL);
