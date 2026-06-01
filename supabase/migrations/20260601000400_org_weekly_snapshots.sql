-- org_weekly_snapshots: stores weekly org metrics for delta comparison.
-- Populated by /api/cron/audit-checksum or a dedicated weekly cron.
-- One row per (org_id, week_start) — week_start = Monday ISO date.

CREATE TABLE IF NOT EXISTS org_weekly_snapshots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  week_start   date NOT NULL,                   -- ISO date of Monday this week
  health_score integer,
  active_clients integer NOT NULL DEFAULT 0,
  assigned_clients integer NOT NULL DEFAULT 0,
  total_coaches integer NOT NULL DEFAULT 0,
  check_ins_7d  integer NOT NULL DEFAULT 0,
  assignment_rate integer NOT NULL DEFAULT 0,   -- pct 0-100
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, week_start)
);

-- RLS: only service_role can write; org members can read their own snapshots
ALTER TABLE org_weekly_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read_own_snapshots"
  ON org_weekly_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = org_weekly_snapshots.org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );
