-- Permite persistir el workspace 'coach_team' (un coach puede ser standalone + enterprise + team).
-- Aditivo/idempotente: amplía los 2 CHECK de workspace_preferences. Sin columna nueva (el match
-- usa last_coach_id; multi-team por coach es edge y queda como mejora futura).
ALTER TABLE public.workspace_preferences DROP CONSTRAINT IF EXISTS workspace_preferences_last_workspace_type_check;
ALTER TABLE public.workspace_preferences
  ADD CONSTRAINT workspace_preferences_last_workspace_type_check
  CHECK (last_workspace_type IN (
    'coach_standalone','enterprise_coach','enterprise_staff',
    'coach_team','student_standalone','student_enterprise'
  ));

ALTER TABLE public.workspace_preferences DROP CONSTRAINT IF EXISTS workspace_preferences_shape;
ALTER TABLE public.workspace_preferences ADD CONSTRAINT workspace_preferences_shape CHECK (
  (last_workspace_type = 'coach_standalone' AND last_coach_id IS NOT NULL AND last_org_id IS NULL AND last_client_id IS NULL)
  OR (last_workspace_type = 'enterprise_coach' AND last_org_id IS NOT NULL AND last_coach_id IS NOT NULL AND last_client_id IS NULL)
  OR (last_workspace_type = 'enterprise_staff' AND last_org_id IS NOT NULL AND last_coach_id IS NULL AND last_client_id IS NULL)
  OR (last_workspace_type = 'coach_team' AND last_coach_id IS NOT NULL AND last_org_id IS NULL AND last_client_id IS NULL)
  OR (last_workspace_type = 'student_standalone' AND last_client_id IS NOT NULL AND last_coach_id IS NOT NULL AND last_org_id IS NULL)
  OR (last_workspace_type = 'student_enterprise' AND last_client_id IS NOT NULL AND last_org_id IS NOT NULL)
);