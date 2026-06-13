-- BODYCOMP RLS: agrega la rama split-account (client_memberships) al SELECT del titular,
-- espejo EXACTO de movement_assessments_client_self_select. Antes bcm_select solo cubría la
-- identidad legacy (client_id = auth.uid()); un alumno con cuenta dividida (un auth.uid con
-- varias filas clients vía account_id) no podía leer SU propia composición. ADITIVA: solo
-- AGREGA una rama OR que da acceso al titular a SUS datos vía sus memberships activas —
-- no amplía acceso cross-tenant. Escritura (bcm_insert/bcm_update, coach-shaped) intacta.
-- (select auth.uid()) envuelto = InitPlan (regla dura incidente 2026-06-09). Idempotente.
DROP POLICY IF EXISTS bcm_select ON public.body_composition_measurements;
CREATE POLICY bcm_select ON public.body_composition_measurements FOR SELECT TO authenticated
USING (
  client_id IN (SELECT public.current_user_pool_client_ids())                  -- pool: miembro del team del cliente
  OR (team_id IS NULL AND org_id IS NULL AND coach_id = (select auth.uid()))    -- standalone: dueño del registro (coach)
  OR client_id = (select auth.uid())                                           -- alumno (identidad legacy)
  OR client_id IN (                                                            -- NEW: alumno split-account (account_id), espejo de movement
    SELECT cm.client_id FROM public.client_memberships cm
    WHERE cm.account_id = (select auth.uid()) AND cm.status = 'active' AND cm.deleted_at IS NULL
  )
);

COMMENT ON POLICY bcm_select ON public.body_composition_measurements IS
  'SELECT: pool ∪ standalone-coach ∪ alumno (client_id=auth.uid() legacy) ∪ alumno split-account (client_memberships.account_id=auth.uid(), espejo de movement). Escritura sigue coach-shaped: el alumno NO escribe.';
