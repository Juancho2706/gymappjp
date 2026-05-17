-- Platform-wide RPCs for the admin CEO dashboard (no coach_id filter).

-- 1. Global workout sessions per day (last 30 days)
CREATE OR REPLACE FUNCTION public.get_platform_workout_sessions_30d()
RETURNS TABLE (day text, sessions bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT to_char(logged_at::date, 'YYYY-MM-DD') AS day,
         count(DISTINCT client_id)::bigint AS sessions
  FROM public.workout_logs
  WHERE logged_at >= now() - interval '30 days'
  GROUP BY logged_at::date
  ORDER BY logged_at::date;
$$;

-- 2. Coach signups per month (last 6 months)
CREATE OR REPLACE FUNCTION public.get_platform_coach_signups_last_6_months()
RETURNS TABLE (ym text, coach_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH months AS (
    SELECT date_trunc('month', timezone('utc', now())) - (interval '1 month' * generate_series(5, 0)) AS m
  )
  SELECT to_char(months.m, 'YYYY-MM') AS ym,
         count(c.id)::bigint AS coach_count
  FROM months
  LEFT JOIN public.coaches c
    ON date_trunc('month', timezone('utc', c.created_at::timestamptz)) = months.m
  GROUP BY months.m
  ORDER BY months.m;
$$;

-- 3. Platform MRR from subscription_events (last 6 months)
CREATE OR REPLACE FUNCTION public.get_platform_mrr_series()
RETURNS TABLE (ym text, total_amount numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH months AS (
    SELECT date_trunc('month', timezone('utc', now())) - (interval '1 month' * generate_series(5, 0)) AS m
  )
  SELECT to_char(months.m, 'YYYY-MM') AS ym,
         coalesce(sum(se.amount), 0)::numeric AS total_amount
  FROM months
  LEFT JOIN public.subscription_events se
    ON date_trunc('month', timezone('utc', se.created_at::timestamptz)) = months.m
   AND se.status = 'authorized'
  GROUP BY months.m
  ORDER BY months.m;
$$;

-- 4. Total coaches count (fast head query helper)
CREATE OR REPLACE FUNCTION public.get_platform_coaches_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT count(*)::bigint FROM public.coaches;
$$;

-- 5. Total clients count
CREATE OR REPLACE FUNCTION public.get_platform_clients_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT count(*)::bigint FROM public.clients;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.get_platform_workout_sessions_30d() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_platform_coach_signups_last_6_months() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_platform_mrr_series() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_platform_coaches_count() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_platform_clients_count() TO authenticated, service_role;
