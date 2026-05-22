CREATE TABLE org_nutrition_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  goal_type    text,
  daily_calories int,
  protein_g    int,
  carbs_g      int,
  fats_g       int,
  instructions text,
  meal_names   jsonb NOT NULL DEFAULT '[]',  -- [{name, order_index, description}]
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE org_nutrition_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_admin_manage_nutrition_templates" ON org_nutrition_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = org_nutrition_templates.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('org_owner', 'org_admin')
        AND om.status = 'active'
        AND om.deleted_at IS NULL
    )
  );

-- Coaches in the org can read templates
CREATE POLICY "org_coach_read_nutrition_templates" ON org_nutrition_templates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = org_nutrition_templates.org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.deleted_at IS NULL
    )
  );

CREATE POLICY "service_role_manage_nutrition_templates" ON org_nutrition_templates
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_org_nutrition_templates_org ON org_nutrition_templates (org_id);
