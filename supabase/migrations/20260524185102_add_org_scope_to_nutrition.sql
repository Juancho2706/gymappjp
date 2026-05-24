ALTER TABLE nutrition_plans
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);

ALTER TABLE nutrition_plan_templates
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);

UPDATE nutrition_plans np
SET org_id = c.org_id
FROM clients c
WHERE np.client_id = c.id
  AND np.org_id IS DISTINCT FROM c.org_id;

CREATE INDEX IF NOT EXISTS idx_nutrition_plans_coach_org
  ON nutrition_plans(coach_id, org_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_nutrition_plans_client_org
  ON nutrition_plans(client_id, org_id)
  WHERE org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nutrition_plan_templates_coach_org
  ON nutrition_plan_templates(coach_id, org_id, updated_at DESC);
