-- Custom Exercise Creator — Migration 2 of 2 for exercises table
-- Enables RLS with PERMISSIVE policies so current behavior is preserved:
--   - Authenticated users see system exercises (coach_id IS NULL) + their own.
--   - Only the owner coach can insert/update/delete their own exercises.
--   - Service role bypasses RLS automatically (admin operations unaffected).
--
-- PRE-DEPLOY MANUAL CHECK (run on prod BEFORE applying this migration):
--   SELECT count(*) FROM public.exercises e
--   WHERE e.coach_id IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = e.coach_id);
-- Expected: 0. If > 0, those rows would become invisible to their (orphan)
-- coach post-RLS. Backfill or null out coach_id before proceeding.
--
-- ROLLBACK (single command, reverts to current unsecured behavior):
--   ALTER TABLE public.exercises DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS exercises_select_visible ON public.exercises;
--   DROP POLICY IF EXISTS exercises_insert_own ON public.exercises;
--   DROP POLICY IF EXISTS exercises_update_own ON public.exercises;
--   DROP POLICY IF EXISTS exercises_delete_own ON public.exercises;

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

-- SELECT: system exercises (coach_id IS NULL) visible to everyone;
-- coach-owned visible only to that coach.
CREATE POLICY exercises_select_visible ON public.exercises
    FOR SELECT
    USING (
        coach_id IS NULL
        OR coach_id = auth.uid()
    );

-- INSERT: a coach can only insert exercises owned by themselves.
-- Sentinel coach_id IS NULL inserts (system seed) must go through service role.
CREATE POLICY exercises_insert_own ON public.exercises
    FOR INSERT
    WITH CHECK (coach_id = auth.uid());

-- UPDATE: only owner. WITH CHECK prevents ownership transfer.
CREATE POLICY exercises_update_own ON public.exercises
    FOR UPDATE
    USING (coach_id = auth.uid())
    WITH CHECK (coach_id = auth.uid());

-- DELETE: only owner. App layer uses soft-delete (deleted_at) instead,
-- but hard-delete remains possible for the owner if explicitly invoked.
CREATE POLICY exercises_delete_own ON public.exercises
    FOR DELETE
    USING (coach_id = auth.uid());
