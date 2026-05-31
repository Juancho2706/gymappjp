-- P2.5-D: Allow org-level nutrition plan templates (coach_id nullable)
-- Org owners/admins can create shared nutrition templates coaches use directly.
-- Same pattern as P2.5-C for workout_programs.

-- 1. Make coach_id nullable
ALTER TABLE nutrition_plan_templates ALTER COLUMN coach_id DROP NOT NULL;

-- 2. Guardrail: template must belong to a coach OR an org (never orphaned)
ALTER TABLE nutrition_plan_templates
  ADD CONSTRAINT chk_nutrition_template_owner
  CHECK (coach_id IS NOT NULL OR org_id IS NOT NULL);

-- 3. RLS: enterprise coaches can read org nutrition templates for their org
CREATE POLICY "org_coaches_read_org_nutrition_plan_templates"
  ON nutrition_plan_templates FOR SELECT
  USING (
    coach_id IS NULL
    AND org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.org_id = nutrition_plan_templates.org_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.status = 'active'
    )
  );
