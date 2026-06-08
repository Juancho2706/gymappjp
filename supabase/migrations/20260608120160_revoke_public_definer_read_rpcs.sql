-- F15c: the previous migration revoked anon EXECUTE, but several read/utility SECURITY
-- DEFINER functions are still anon-callable because they were created with the default
-- EXECUTE grant to PUBLIC (anon inherits from PUBLIC, so REVOKE FROM anon was a no-op).
-- Revoke from PUBLIC and re-grant only to authenticated + service_role, matching their
-- real callers (authenticated alumno/coach via supabase.rpc, or service_role via admin).
--
-- Left intentionally untouched:
--   - check_platform_email_availability: signup path, returns only booleans, low sensitivity.
--   - is_active_org_member / is_org_* : called INSIDE RLS policies; revoking from PUBLIC would
--     break RLS evaluation for authenticated/anon. They only return membership booleans.
--   - get_admin_coaches_paginated stays executable by `authenticated`; making it admin-only
--     requires an internal auth.uid() admin check (separate follow-up).
--
-- Rollback (per function): GRANT EXECUTE ON FUNCTION ... TO PUBLIC;

DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.get_client_current_streak(uuid)',
    'public.get_clients_last_workout_date(uuid[], timestamptz)',
    'public.get_platform_trial_conversion_rate()',
    'public.get_admin_coaches_paginated(text, text, text, boolean, text, text, integer, integer)',
    'public.touch_coach_activity(uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon;', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role;', fn);
  END LOOP;
END $$;
