-- F13: workout_sessions cross-user SELECT leak.
-- A catch-all "Enable read access for authenticated users" SELECT USING(true)
-- let ANY authenticated user read every user's workout_sessions. The earlier
-- 20260517120000_security_fixes dropped the INSERT/UPDATE/DELETE catch-alls but
-- missed this SELECT one (same bug class fixed for check_ins in 20260530170000).
-- The scoped policies workout_sessions_client (client_id = auth.uid()) and
-- workout_sessions_coach (coach owns the client) already cover legitimate reads,
-- including org coaches who reach their clients via coach_id.
--
-- Verified against prod before writing (pg_policies): the USING(true) policy exists.
--
-- Rollback:
--   CREATE POLICY "Enable read access for authenticated users"
--     ON public.workout_sessions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.workout_sessions;
