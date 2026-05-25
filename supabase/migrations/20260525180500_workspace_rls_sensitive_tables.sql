-- P1.5 Identity & Workspace hardening.
-- Goal: prevent a user who is both standalone coach and enterprise coach from
-- reading/writing rows from the wrong workspace through direct Supabase access.
--
-- Postgres RLS policies are permissive by default (OR). For sensitive tables,
-- replacing old broad coach_id-only policies is safer than adding narrower ones.

CREATE OR REPLACE FUNCTION public.is_org_admin_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members om
    WHERE om.org_id = p_org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('org_owner', 'org_admin')
      AND om.status = 'active'
      AND om.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_coach_member(p_org_id uuid, p_coach_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members om
    WHERE om.org_id = p_org_id
      AND om.user_id = auth.uid()
      AND om.coach_id = p_coach_id
      AND om.role = 'coach'
      AND om.status = 'active'
      AND om.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_coach_assigned_to_client(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM clients c
    JOIN coach_client_assignments cca
      ON cca.client_id = c.id
     AND cca.org_id = c.org_id
     AND cca.coach_id = c.coach_id
     AND cca.deleted_at IS NULL
    JOIN organization_members om
      ON om.org_id = cca.org_id
     AND om.coach_id = cca.coach_id
    WHERE c.id = p_client_id
      AND c.org_id IS NOT NULL
      AND om.user_id = auth.uid()
      AND om.role = 'coach'
      AND om.status = 'active'
      AND om.deleted_at IS NULL
  );
$$;

-- clients --------------------------------------------------------------------

DROP POLICY IF EXISTS "Coach can manage their own clients" ON public.clients;
DROP POLICY IF EXISTS "clients_coach_all" ON public.clients;
DROP POLICY IF EXISTS "coaches_manage_clients" ON public.clients;
DROP POLICY IF EXISTS "Coaches can update their own clients" ON public.clients;

CREATE POLICY "clients_standalone_coach_manage"
ON public.clients
FOR ALL
TO authenticated
USING (org_id IS NULL AND coach_id = auth.uid())
WITH CHECK (org_id IS NULL AND coach_id = auth.uid());

CREATE POLICY "clients_org_admin_manage"
ON public.clients
FOR ALL
TO authenticated
USING (org_id IS NOT NULL AND public.is_org_admin_member(org_id))
WITH CHECK (org_id IS NOT NULL AND public.is_org_admin_member(org_id));

CREATE POLICY "clients_org_coach_assigned_select"
ON public.clients
FOR SELECT
TO authenticated
USING (org_id IS NOT NULL AND public.is_org_coach_assigned_to_client(id));

CREATE POLICY "clients_org_coach_assigned_update"
ON public.clients
FOR UPDATE
TO authenticated
USING (org_id IS NOT NULL AND public.is_org_coach_assigned_to_client(id))
WITH CHECK (
  org_id IS NOT NULL
  AND coach_id = auth.uid()
  AND public.is_org_coach_assigned_to_client(id)
);

CREATE POLICY "clients_org_coach_insert"
ON public.clients
FOR INSERT
TO authenticated
WITH CHECK (
  org_id IS NOT NULL
  AND coach_id = auth.uid()
  AND public.is_org_coach_member(org_id, coach_id)
);

-- workout_programs -----------------------------------------------------------

DROP POLICY IF EXISTS "Coaches can manage their own programs" ON public.workout_programs;
DROP POLICY IF EXISTS "workout_programs_coach" ON public.workout_programs;

CREATE POLICY "workout_programs_workspace_manage"
ON public.workout_programs
FOR ALL
TO authenticated
USING (
  (org_id IS NULL AND coach_id = auth.uid())
  OR (org_id IS NOT NULL AND public.is_org_admin_member(org_id))
  OR (
    org_id IS NOT NULL
    AND coach_id = auth.uid()
    AND public.is_org_coach_member(org_id, coach_id)
    AND (client_id IS NULL OR public.is_org_coach_assigned_to_client(client_id))
  )
)
WITH CHECK (
  (org_id IS NULL AND coach_id = auth.uid())
  OR (org_id IS NOT NULL AND public.is_org_admin_member(org_id))
  OR (
    org_id IS NOT NULL
    AND coach_id = auth.uid()
    AND public.is_org_coach_member(org_id, coach_id)
    AND (client_id IS NULL OR public.is_org_coach_assigned_to_client(client_id))
  )
);

-- nutrition_plans ------------------------------------------------------------

DROP POLICY IF EXISTS "Coaches can manage their own nutrition plans" ON public.nutrition_plans;
DROP POLICY IF EXISTS "nutrition_plans_coach" ON public.nutrition_plans;
DROP POLICY IF EXISTS "nutrition_plans_coach_all" ON public.nutrition_plans;

CREATE POLICY "nutrition_plans_workspace_manage"
ON public.nutrition_plans
FOR ALL
TO authenticated
USING (
  (org_id IS NULL AND coach_id = auth.uid())
  OR (org_id IS NOT NULL AND public.is_org_admin_member(org_id))
  OR (
    org_id IS NOT NULL
    AND coach_id = auth.uid()
    AND public.is_org_coach_member(org_id, coach_id)
    AND public.is_org_coach_assigned_to_client(client_id)
  )
)
WITH CHECK (
  (org_id IS NULL AND coach_id = auth.uid())
  OR (org_id IS NOT NULL AND public.is_org_admin_member(org_id))
  OR (
    org_id IS NOT NULL
    AND coach_id = auth.uid()
    AND public.is_org_coach_member(org_id, coach_id)
    AND public.is_org_coach_assigned_to_client(client_id)
  )
);

-- nutrition_plan_templates ---------------------------------------------------

DROP POLICY IF EXISTS "Coaches can manage their own nutrition templates" ON public.nutrition_plan_templates;
DROP POLICY IF EXISTS "Coaches can manage their own templates" ON public.nutrition_plan_templates;
DROP POLICY IF EXISTS "nutrition_plan_templates_coach" ON public.nutrition_plan_templates;

CREATE POLICY "nutrition_plan_templates_workspace_manage"
ON public.nutrition_plan_templates
FOR ALL
TO authenticated
USING (
  (org_id IS NULL AND coach_id = auth.uid())
  OR (org_id IS NOT NULL AND public.is_org_admin_member(org_id))
  OR (
    org_id IS NOT NULL
    AND coach_id = auth.uid()
    AND public.is_org_coach_member(org_id, coach_id)
  )
)
WITH CHECK (
  (org_id IS NULL AND coach_id = auth.uid())
  OR (org_id IS NOT NULL AND public.is_org_admin_member(org_id))
  OR (
    org_id IS NOT NULL
    AND coach_id = auth.uid()
    AND public.is_org_coach_member(org_id, coach_id)
  )
);

-- client_payments ------------------------------------------------------------

DROP POLICY IF EXISTS "Coaches manage own client payments" ON public.client_payments;

CREATE POLICY "client_payments_workspace_manage"
ON public.client_payments
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM clients c
    WHERE c.id = client_payments.client_id
      AND client_payments.coach_id = auth.uid()
      AND (
        (c.org_id IS NULL AND c.coach_id = auth.uid())
        OR (
          c.org_id IS NOT NULL
          AND c.coach_id = auth.uid()
          AND public.is_org_coach_assigned_to_client(c.id)
        )
      )
  )
  OR EXISTS (
    SELECT 1
    FROM clients c
    WHERE c.id = client_payments.client_id
      AND c.org_id IS NOT NULL
      AND public.is_org_admin_member(c.org_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM clients c
    WHERE c.id = client_payments.client_id
      AND client_payments.coach_id = auth.uid()
      AND (
        (c.org_id IS NULL AND c.coach_id = auth.uid())
        OR (
          c.org_id IS NOT NULL
          AND c.coach_id = auth.uid()
          AND public.is_org_coach_assigned_to_client(c.id)
        )
      )
  )
  OR EXISTS (
    SELECT 1
    FROM clients c
    WHERE c.id = client_payments.client_id
      AND c.org_id IS NOT NULL
      AND public.is_org_admin_member(c.org_id)
  )
);
