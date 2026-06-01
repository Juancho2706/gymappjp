-- Expand organization_members.role to support all enterprise staff roles.
-- Prior constraint only allowed org_owner, org_admin, coach.
-- Adds: ops, analyst, brand_manager (already used in app code since commit a707d09).

ALTER TABLE organization_members
  DROP CONSTRAINT IF EXISTS organization_members_role_check;

ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('org_owner', 'org_admin', 'ops', 'analyst', 'brand_manager', 'coach'));
