-- (1) Permite el workspace 'student_team' (alumno de pool) en workspace_preferences. Aditivo/idempotente.
ALTER TABLE public.workspace_preferences DROP CONSTRAINT IF EXISTS workspace_preferences_last_workspace_type_check;
ALTER TABLE public.workspace_preferences
  ADD CONSTRAINT workspace_preferences_last_workspace_type_check
  CHECK (last_workspace_type IN (
    'coach_standalone','enterprise_coach','enterprise_staff',
    'coach_team','student_standalone','student_enterprise','student_team'
  ));

ALTER TABLE public.workspace_preferences DROP CONSTRAINT IF EXISTS workspace_preferences_shape;
ALTER TABLE public.workspace_preferences ADD CONSTRAINT workspace_preferences_shape CHECK (
  (last_workspace_type = 'coach_standalone' AND last_coach_id IS NOT NULL AND last_org_id IS NULL AND last_client_id IS NULL)
  OR (last_workspace_type = 'enterprise_coach' AND last_org_id IS NOT NULL AND last_coach_id IS NOT NULL AND last_client_id IS NULL)
  OR (last_workspace_type = 'enterprise_staff' AND last_org_id IS NOT NULL AND last_coach_id IS NULL AND last_client_id IS NULL)
  OR (last_workspace_type = 'coach_team' AND last_coach_id IS NOT NULL AND last_org_id IS NULL AND last_client_id IS NULL)
  OR (last_workspace_type = 'student_standalone' AND last_client_id IS NOT NULL AND last_coach_id IS NOT NULL AND last_org_id IS NULL)
  OR (last_workspace_type = 'student_enterprise' AND last_client_id IS NOT NULL AND last_org_id IS NOT NULL)
  OR (last_workspace_type = 'student_team' AND last_client_id IS NOT NULL AND last_org_id IS NULL AND last_coach_id IS NULL)
);

-- (2) Backfill de identidad: alumnos movidos a un pool (clients.team_id seteado) cuya membresía
-- quedó en scope='standalone' -> convertir a scope='team' (consistencia del modelo identity-split).
-- Idempotente y forward-only. Esto es lo que A.bis2 hará de forma sistémica en los flujos de entrada.
UPDATE public.client_memberships cm
SET scope = 'team', team_id = cl.team_id, org_id = NULL
FROM public.clients cl
WHERE cl.id = cm.client_id
  AND cl.team_id IS NOT NULL
  AND cm.scope = 'standalone'
  AND cm.status = 'active'
  AND cm.deleted_at IS NULL;
