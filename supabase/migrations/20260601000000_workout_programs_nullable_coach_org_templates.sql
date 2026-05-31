-- P2.5-C: Allow org-level workout templates (coach_id nullable)
-- Org owners/admins can create shared templates not tied to a specific coach.
-- Existing programs are unaffected (all have coach_id).

-- 1. Make coach_id nullable
ALTER TABLE workout_programs ALTER COLUMN coach_id DROP NOT NULL;

-- 2. Guardrail: every program must have a coach OR an org (never orphaned)
ALTER TABLE workout_programs
  ADD CONSTRAINT chk_workout_owner
  CHECK (coach_id IS NOT NULL OR org_id IS NOT NULL);

-- 3. RLS: enterprise coaches can read org templates (coach_id = null) for their org
CREATE POLICY "org_coaches_read_org_workout_templates"
  ON workout_programs FOR SELECT
  USING (
    client_id IS NULL
    AND coach_id IS NULL
    AND org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.org_id = workout_programs.org_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.status = 'active'
    )
  );
