-- Fase 2B: consolidate RLS on foods + exercises to be org-aware and close the leak.
--
-- LEAK (current prod): policies like foods "Anyone can view global foods" / foods_select_global
-- (coach_id IS NULL) and exercises_select_visible ((coach_id IS NULL) OR ...) match ORG rows
-- (org foods/exercises = coach_id NULL, org_id set), exposing one org's catalog to everyone.
--
-- Model:
--   system  : coach_id NULL, org_id NULL  -> readable by anyone (global catalog)
--   own      : coach_id = me, org_id NULL  -> standalone coach owns
--   org      : coach_id NULL, org_id = X   -> org-shared (org admins manage, members read)
--   client read: standalone client sees their coach's; enterprise client sees their org's.
--
-- saved_meals / food_swap_groups are intentionally NOT changed here: they are coach-owned
-- (coach_id = me); org_id is only a workspace tag the APP filters on, so coach_id RLS already
-- isolates them with no leak.
--
-- Reversible: drops are IF EXISTS; rollback = restore the prior policies (see git history of
-- 20260527120100 / baseline). Verified against prod policy list before writing.

-- ─────────────────────────── FOODS ───────────────────────────
DROP POLICY IF EXISTS "foods_write_own" ON public.foods;
DROP POLICY IF EXISTS "foods_coach_delete" ON public.foods;
DROP POLICY IF EXISTS "Coaches can insert their own custom foods" ON public.foods;
DROP POLICY IF EXISTS "foods_coach_insert" ON public.foods;
DROP POLICY IF EXISTS "Anyone can view global foods" ON public.foods;
DROP POLICY IF EXISTS "Clients can view their coach's custom foods" ON public.foods;
DROP POLICY IF EXISTS "Coaches can view their own custom foods" ON public.foods;
DROP POLICY IF EXISTS "foods_read" ON public.foods;
DROP POLICY IF EXISTS "foods_select_client_coach_catalog" ON public.foods;
DROP POLICY IF EXISTS "foods_select_global" ON public.foods;
DROP POLICY IF EXISTS "foods_select_own_coach" ON public.foods;
DROP POLICY IF EXISTS "foods_coach_update" ON public.foods;

CREATE POLICY foods_select_visible ON public.foods FOR SELECT
  USING ((coach_id IS NULL AND org_id IS NULL) OR (coach_id = auth.uid() AND org_id IS NULL));
CREATE POLICY foods_insert_own ON public.foods FOR INSERT
  WITH CHECK (coach_id = auth.uid() AND org_id IS NULL);
CREATE POLICY foods_update_own ON public.foods FOR UPDATE
  USING (coach_id = auth.uid() AND org_id IS NULL)
  WITH CHECK (coach_id = auth.uid() AND org_id IS NULL);
CREATE POLICY foods_delete_own ON public.foods FOR DELETE
  USING (coach_id = auth.uid() AND org_id IS NULL);

CREATE POLICY foods_org_select ON public.foods FOR SELECT
  USING (org_id IS NOT NULL AND public.is_active_org_member(org_id));
CREATE POLICY foods_org_insert ON public.foods FOR INSERT
  WITH CHECK (org_id IS NOT NULL AND coach_id IS NULL AND public.is_org_admin_member(org_id));
CREATE POLICY foods_org_update ON public.foods FOR UPDATE
  USING (org_id IS NOT NULL AND public.is_org_admin_member(org_id))
  WITH CHECK (org_id IS NOT NULL AND coach_id IS NULL);
CREATE POLICY foods_org_delete ON public.foods FOR DELETE
  USING (org_id IS NOT NULL AND public.is_org_admin_member(org_id));

CREATE POLICY foods_client_coach_select ON public.foods FOR SELECT
  USING (coach_id IS NOT NULL AND org_id IS NULL AND EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id = auth.uid() AND c.coach_id = foods.coach_id));
CREATE POLICY foods_client_org_select ON public.foods FOR SELECT
  USING (org_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id = auth.uid() AND c.org_id = foods.org_id));

-- ─────────────────────────── EXERCISES ───────────────────────────
DROP POLICY IF EXISTS "exercises_select_visible" ON public.exercises;
DROP POLICY IF EXISTS "exercises_insert_own" ON public.exercises;
DROP POLICY IF EXISTS "exercises_update_own" ON public.exercises;
DROP POLICY IF EXISTS "exercises_delete_own" ON public.exercises;

CREATE POLICY exercises_select_visible ON public.exercises FOR SELECT
  USING ((coach_id IS NULL AND org_id IS NULL) OR (coach_id = auth.uid() AND org_id IS NULL));
CREATE POLICY exercises_insert_own ON public.exercises FOR INSERT
  WITH CHECK (coach_id = auth.uid() AND org_id IS NULL);
CREATE POLICY exercises_update_own ON public.exercises FOR UPDATE
  USING (coach_id = auth.uid() AND org_id IS NULL)
  WITH CHECK (coach_id = auth.uid() AND org_id IS NULL);
CREATE POLICY exercises_delete_own ON public.exercises FOR DELETE
  USING (coach_id = auth.uid() AND org_id IS NULL);

CREATE POLICY exercises_org_select ON public.exercises FOR SELECT
  USING (org_id IS NOT NULL AND public.is_active_org_member(org_id));
CREATE POLICY exercises_org_insert ON public.exercises FOR INSERT
  WITH CHECK (org_id IS NOT NULL AND coach_id IS NULL AND public.is_org_admin_member(org_id));
CREATE POLICY exercises_org_update ON public.exercises FOR UPDATE
  USING (org_id IS NOT NULL AND public.is_org_admin_member(org_id))
  WITH CHECK (org_id IS NOT NULL AND coach_id IS NULL);
CREATE POLICY exercises_org_delete ON public.exercises FOR DELETE
  USING (org_id IS NOT NULL AND public.is_org_admin_member(org_id));

CREATE POLICY exercises_client_coach_select ON public.exercises FOR SELECT
  USING (coach_id IS NOT NULL AND org_id IS NULL AND EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id = auth.uid() AND c.coach_id = exercises.coach_id));
CREATE POLICY exercises_client_org_select ON public.exercises FOR SELECT
  USING (org_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id = auth.uid() AND c.org_id = exercises.org_id));
