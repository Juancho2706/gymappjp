ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS last_health_score int,
  ADD COLUMN IF NOT EXISTS last_health_score_at timestamptz;
