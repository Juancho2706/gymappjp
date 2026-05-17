-- Append-only — sin UPDATE ni DELETE policies por diseño
CREATE TABLE org_audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id),
  actor_id    uuid NOT NULL REFERENCES auth.users(id),
  action      text NOT NULL,
  target_id   uuid,
  target_type text,
  metadata    jsonb,
  created_at  timestamptz DEFAULT now()
);

-- Checksums semanales para tamper-evidence (Ley 21.719)
CREATE TABLE audit_log_checksums (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start   date NOT NULL UNIQUE,
  checksum     text NOT NULL,
  row_count    int NOT NULL,
  generated_at timestamptz DEFAULT now()
  -- Sin deleted_at, sin UPDATE — append-only
);

ALTER TABLE org_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log_checksums ENABLE ROW LEVEL SECURITY;
