-- Partial unique index para ON CONFLICT en accept_org_invite RPC
-- Separado de migration 002 para aplicarlo DESPUÉS del backfill de datos existentes
CREATE UNIQUE INDEX IF NOT EXISTS organization_members_active_unique
  ON organization_members(org_id, coach_id)
  WHERE deleted_at IS NULL AND status = 'active';
