-- F15b: read-only SECURITY DEFINER RPCs were EXECUTE-granted to anon (unauthenticated).
-- They expose per-id data (client/coach streaks, last workout, 30d sessions, platform
-- metrics, admin coach list) and have no business being callable without a session.
-- All legitimate callers are authenticated (alumno/coach via supabase.rpc) or service_role
-- (admin). We revoke ONLY anon, keeping authenticated so app flows are untouched:
--   - get_client_current_streak: called by authenticated alumno (c/.../dashboard) + coach
--   - touch_coach_activity: called by authenticated coach in proxy.ts:330
--   - the rest: coach/admin analytics, authenticated/service_role only
--
-- NOT touched here:
--   - check_platform_email_availability: needed during signup (called via admin), low-sensitivity
--   - is_active_org_member / is_org_* : used INSIDE RLS policies; revoking would break RLS
--     evaluation for those roles. Left intact.
--   - get_admin_coaches_paginated also remains executable by `authenticated`; tightening that
--     to admin-only needs an internal auth check and is tracked as a separate follow-up.
--
-- Rollback: GRANT EXECUTE ON FUNCTION ... TO anon; (per function below)

REVOKE EXECUTE ON FUNCTION public.get_client_current_streak(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_clients_last_workout_date(uuid[], timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_coach_clients_streaks(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_coach_workout_sessions_30d(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_platform_trial_conversion_rate() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_coaches_paginated(text, text, text, boolean, text, text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.touch_coach_activity(uuid) FROM anon;
