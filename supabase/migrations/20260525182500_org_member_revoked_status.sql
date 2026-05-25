-- Allow explicit revoked status for enterprise membership offboarding.
-- Existing code used suspended + deleted_at; revoked is clearer for audit and
-- future UI without changing active-member checks.

ALTER TABLE organization_members
  DROP CONSTRAINT IF EXISTS organization_members_status_check;

ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_status_check
  CHECK (status IN ('invited', 'active', 'suspended', 'revoked'));
