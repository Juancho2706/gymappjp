-- HARDENING (seguridad) — WITH CHECK de recursos top-level autoria-coach exige PROPIEDAD del cliente.
--
-- Gap PRE-EXISTENTE (baseline, NO del team) detectado por tests/team/comprehensive-isolation.sql:
-- nutrition_plans / workout_plans / workout_programs / nutrition_plan_cycles / nutrition_plan_history
-- tenian WITH CHECK = coach_id = auth.uid() (rama standalone) SIN verificar que el cliente sea del coach
-- -> un coach podia INSERTAR un plan/programa para el client_id de OTRO (visible para ESE alumno via *_client).
--
-- Fix: SOLO se endurece WITH CHECK (escritura). USING (lectura) queda intacto. Las ramas org/enterprise
-- de nutrition_plans/workout_programs quedan VERBATIM (cero cambio enterprise). workout_plans (sin org_id)
-- se amplia a "cliente alcanzable" (propio standalone O org-admin O org-asignado). Templates (client_id NULL)
-- en workout_plans/programs siguen permitidos. El team policy (OR) sigue cubriendo el pool. App escribe via
-- service-role (bypassa RLS) -> no afectado. Aditiva / idempotente / forward-only.
-- Validado tx+rollback antes de aplicar (own OK, other BLOCK, template OK, pool OK, enterprise OK).

-- ===== nutrition_plans (client_id NOT NULL; rama org verbatim) =====
DROP POLICY IF EXISTS nutrition_plans_workspace_manage ON public.nutrition_plans;
CREATE POLICY nutrition_plans_workspace_manage ON public.nutrition_plans FOR ALL TO authenticated
  USING (
    ((org_id IS NULL) AND (coach_id = auth.uid()))
    OR ((org_id IS NOT NULL) AND is_org_admin_member(org_id))
    OR ((org_id IS NOT NULL) AND (coach_id = auth.uid()) AND is_org_coach_member(org_id, coach_id) AND is_org_coach_assigned_to_client(client_id))
  )
  WITH CHECK (
    ((org_id IS NULL) AND (coach_id = auth.uid()) AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = nutrition_plans.client_id AND c.coach_id = auth.uid() AND c.org_id IS NULL))
    OR ((org_id IS NOT NULL) AND is_org_admin_member(org_id))
    OR ((org_id IS NOT NULL) AND (coach_id = auth.uid()) AND is_org_coach_member(org_id, coach_id) AND is_org_coach_assigned_to_client(client_id))
  );

-- ===== workout_programs (client_id NULLABLE -> templates; rama org verbatim) =====
DROP POLICY IF EXISTS workout_programs_workspace_manage ON public.workout_programs;
CREATE POLICY workout_programs_workspace_manage ON public.workout_programs FOR ALL TO authenticated
  USING (
    ((org_id IS NULL) AND (coach_id = auth.uid()))
    OR ((org_id IS NOT NULL) AND is_org_admin_member(org_id))
    OR ((org_id IS NOT NULL) AND (coach_id = auth.uid()) AND is_org_coach_member(org_id, coach_id) AND ((client_id IS NULL) OR is_org_coach_assigned_to_client(client_id)))
  )
  WITH CHECK (
    ((org_id IS NULL) AND (coach_id = auth.uid()) AND ((client_id IS NULL) OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = workout_programs.client_id AND c.coach_id = auth.uid() AND c.org_id IS NULL)))
    OR ((org_id IS NOT NULL) AND is_org_admin_member(org_id))
    OR ((org_id IS NOT NULL) AND (coach_id = auth.uid()) AND is_org_coach_member(org_id, coach_id) AND ((client_id IS NULL) OR is_org_coach_assigned_to_client(client_id)))
  );

-- ===== workout_plans (sin org_id; client_id NULLABLE -> templates) — 2 policies duplicadas, endurecer ambas =====
DROP POLICY IF EXISTS coaches_manage_plans ON public.workout_plans;
CREATE POLICY coaches_manage_plans ON public.workout_plans FOR ALL
  USING (coach_id = auth.uid())
  WITH CHECK (
    coach_id = auth.uid() AND (
      client_id IS NULL
      OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = workout_plans.client_id AND (
        (c.org_id IS NULL AND c.coach_id = auth.uid())
        OR (c.org_id IS NOT NULL AND is_org_admin_member(c.org_id))
        OR (c.org_id IS NOT NULL AND is_org_coach_assigned_to_client(c.id))
      ))
    )
  );
DROP POLICY IF EXISTS workout_plans_coach ON public.workout_plans;
CREATE POLICY workout_plans_coach ON public.workout_plans FOR ALL TO authenticated
  USING (coach_id = (select auth.uid()))
  WITH CHECK (
    coach_id = (select auth.uid()) AND (
      client_id IS NULL
      OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = workout_plans.client_id AND (
        (c.org_id IS NULL AND c.coach_id = (select auth.uid()))
        OR (c.org_id IS NOT NULL AND is_org_admin_member(c.org_id))
        OR (c.org_id IS NOT NULL AND is_org_coach_assigned_to_client(c.id))
      ))
    )
  );

-- workout_plans 3ra policy duplicada (WITH CHECK era IMPLICITO = USING -> gateaba INSERT con coach_id=self)
DROP POLICY IF EXISTS "Coach can manage workout plans for their clients" ON public.workout_plans;
CREATE POLICY "Coach can manage workout plans for their clients" ON public.workout_plans FOR ALL
  USING (auth.uid() = coach_id)
  WITH CHECK (
    coach_id = auth.uid() AND (
      client_id IS NULL
      OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = workout_plans.client_id AND (
        (c.org_id IS NULL AND c.coach_id = auth.uid())
        OR (c.org_id IS NOT NULL AND is_org_admin_member(c.org_id))
        OR (c.org_id IS NOT NULL AND is_org_coach_assigned_to_client(c.id))
      ))
    )
  );

-- ===== nutrition_plan_cycles (sin org_id; client_id NOT NULL) =====
DROP POLICY IF EXISTS "nutrition_plan_cycles coach all" ON public.nutrition_plan_cycles;
CREATE POLICY "nutrition_plan_cycles coach all" ON public.nutrition_plan_cycles FOR ALL
  USING (coach_id = auth.uid())
  WITH CHECK (
    coach_id = auth.uid() AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = nutrition_plan_cycles.client_id AND (
      (c.org_id IS NULL AND c.coach_id = auth.uid())
      OR (c.org_id IS NOT NULL AND is_org_admin_member(c.org_id))
      OR (c.org_id IS NOT NULL AND is_org_coach_assigned_to_client(c.id))
    ))
  );

-- ===== nutrition_plan_history (sin org_id; client_id NOT NULL) =====
DROP POLICY IF EXISTS "nutrition_plan_history coach all" ON public.nutrition_plan_history;
CREATE POLICY "nutrition_plan_history coach all" ON public.nutrition_plan_history FOR ALL
  USING (coach_id = auth.uid())
  WITH CHECK (
    coach_id = auth.uid() AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = nutrition_plan_history.client_id AND (
      (c.org_id IS NULL AND c.coach_id = auth.uid())
      OR (c.org_id IS NOT NULL AND is_org_admin_member(c.org_id))
      OR (c.org_id IS NOT NULL AND is_org_coach_assigned_to_client(c.id))
    ))
  );
