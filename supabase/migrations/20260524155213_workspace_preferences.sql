CREATE TABLE IF NOT EXISTS workspace_preferences (
  user_id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_workspace_type  text NOT NULL CHECK (
    last_workspace_type IN (
      'coach_standalone',
      'enterprise_coach',
      'enterprise_staff',
      'student_standalone',
      'student_enterprise'
    )
  ),
  last_org_id          uuid REFERENCES organizations(id) ON DELETE SET NULL,
  last_coach_id        uuid REFERENCES coaches(id) ON DELETE SET NULL,
  last_client_id       uuid REFERENCES clients(id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_preferences_shape CHECK (
    (
      last_workspace_type = 'coach_standalone'
      AND last_coach_id IS NOT NULL
      AND last_org_id IS NULL
      AND last_client_id IS NULL
    )
    OR (
      last_workspace_type = 'enterprise_coach'
      AND last_org_id IS NOT NULL
      AND last_coach_id IS NOT NULL
      AND last_client_id IS NULL
    )
    OR (
      last_workspace_type = 'enterprise_staff'
      AND last_org_id IS NOT NULL
      AND last_coach_id IS NULL
      AND last_client_id IS NULL
    )
    OR (
      last_workspace_type = 'student_standalone'
      AND last_client_id IS NOT NULL
      AND last_coach_id IS NOT NULL
      AND last_org_id IS NULL
    )
    OR (
      last_workspace_type = 'student_enterprise'
      AND last_client_id IS NOT NULL
      AND last_org_id IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_workspace_preferences_org
  ON workspace_preferences(last_org_id)
  WHERE last_org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_preferences_coach
  ON workspace_preferences(last_coach_id)
  WHERE last_coach_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_preferences_client
  ON workspace_preferences(last_client_id)
  WHERE last_client_id IS NOT NULL;

ALTER TABLE workspace_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_preferences_select_own" ON workspace_preferences;
CREATE POLICY "workspace_preferences_select_own" ON workspace_preferences
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "workspace_preferences_insert_own" ON workspace_preferences;
CREATE POLICY "workspace_preferences_insert_own" ON workspace_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "workspace_preferences_update_own" ON workspace_preferences;
CREATE POLICY "workspace_preferences_update_own" ON workspace_preferences
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "workspace_preferences_delete_own" ON workspace_preferences;
CREATE POLICY "workspace_preferences_delete_own" ON workspace_preferences
  FOR DELETE USING (user_id = auth.uid());
