-- Custom Exercise Creator — Migration 2: enable RLS on exercises (enterprise-aware)
--
-- Access rules:
--   System exercises (coach_id IS NULL AND org_id IS NULL) → visible to all authenticated users
--   Standalone coach exercises (coach_id = auth.uid(), org_id IS NULL) → owner only
--   Org exercises (org_id IS NOT NULL) → all active org members can SELECT;
--     only org_owner/org_admin can INSERT/UPDATE/DELETE
--
-- PRE-DEPLOY CHECK:
--   SELECT count(*) FROM public.exercises e
--   WHERE e.coach_id IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = e.coach_id);
-- Expected: 0
--
-- Rollback:
--   ALTER TABLE public.exercises DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS exercises_select_visible ON public.exercises;
--   DROP POLICY IF EXISTS exercises_insert_own ON public.exercises;
--   DROP POLICY IF EXISTS exercises_update_own ON public.exercises;
--   DROP POLICY IF EXISTS exercises_delete_own ON public.exercises;
--   DROP POLICY IF EXISTS exercises_org_select ON public.exercises;
--   DROP POLICY IF EXISTS exercises_org_insert ON public.exercises;
--   DROP POLICY IF EXISTS exercises_org_update ON public.exercises;
--   DROP POLICY IF EXISTS exercises_org_delete ON public.exercises;

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

-- ── Standalone coach + system policies ────────────────────────────────────────

-- System exercises (no coach, no org) visible to all authenticated users.
-- Coach-owned exercises visible only to that coach.
DROP POLICY IF EXISTS exercises_select_visible ON public.exercises;
CREATE POLICY exercises_select_visible ON public.exercises
    FOR SELECT
    USING (
        -- system exercise: no owner
        (coach_id IS NULL AND org_id IS NULL)
        -- standalone coach exercise: own exercises only
        OR (coach_id = auth.uid() AND org_id IS NULL)
    );

DROP POLICY IF EXISTS exercises_insert_own ON public.exercises;
CREATE POLICY exercises_insert_own ON public.exercises
    FOR INSERT
    WITH CHECK (coach_id = auth.uid() AND org_id IS NULL);

DROP POLICY IF EXISTS exercises_update_own ON public.exercises;
CREATE POLICY exercises_update_own ON public.exercises
    FOR UPDATE
    USING (coach_id = auth.uid() AND org_id IS NULL)
    WITH CHECK (coach_id = auth.uid() AND org_id IS NULL);

DROP POLICY IF EXISTS exercises_delete_own ON public.exercises;
CREATE POLICY exercises_delete_own ON public.exercises
    FOR DELETE
    USING (coach_id = auth.uid() AND org_id IS NULL);

-- ── Enterprise org policies ────────────────────────────────────────────────────

-- All active org members can view org-scoped exercises.
DROP POLICY IF EXISTS exercises_org_select ON public.exercises;
CREATE POLICY exercises_org_select ON public.exercises
    FOR SELECT
    USING (
        org_id IS NOT NULL
        AND public.is_active_org_member(org_id)
    );

-- Only org_owner/org_admin can create org-scoped exercises.
DROP POLICY IF EXISTS exercises_org_insert ON public.exercises;
CREATE POLICY exercises_org_insert ON public.exercises
    FOR INSERT
    WITH CHECK (
        org_id IS NOT NULL
        AND coach_id IS NULL
        AND EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.org_id = org_id
              AND om.user_id = auth.uid()
              AND om.role IN ('org_owner', 'org_admin')
              AND om.status = 'active'
              AND om.deleted_at IS NULL
        )
    );

DROP POLICY IF EXISTS exercises_org_update ON public.exercises;
CREATE POLICY exercises_org_update ON public.exercises
    FOR UPDATE
    USING (
        org_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.org_id = exercises.org_id
              AND om.user_id = auth.uid()
              AND om.role IN ('org_owner', 'org_admin')
              AND om.status = 'active'
              AND om.deleted_at IS NULL
        )
    )
    WITH CHECK (
        org_id IS NOT NULL
        AND coach_id IS NULL
    );

DROP POLICY IF EXISTS exercises_org_delete ON public.exercises;
CREATE POLICY exercises_org_delete ON public.exercises
    FOR DELETE
    USING (
        org_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.org_id = exercises.org_id
              AND om.user_id = auth.uid()
              AND om.role IN ('org_owner', 'org_admin')
              AND om.status = 'active'
              AND om.deleted_at IS NULL
        )
    );
