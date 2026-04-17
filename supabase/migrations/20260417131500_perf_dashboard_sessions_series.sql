-- Aggregate daily workout sessions for coach dashboard chart.
-- Counts unique client/day sessions for last 30 days in DB.

CREATE OR REPLACE FUNCTION public.get_coach_workout_sessions_30d(p_coach_id uuid)
RETURNS TABLE(day date, sessions integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_coach_id THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH session_days AS (
        SELECT DISTINCT
            wl.client_id,
            timezone('America/Santiago', wl.logged_at)::date AS day
        FROM public.workout_logs wl
        JOIN public.clients c
          ON c.id = wl.client_id
        WHERE c.coach_id = p_coach_id
          AND wl.logged_at >= now() - interval '30 days'
    )
    SELECT
        sd.day,
        COUNT(*)::integer AS sessions
    FROM session_days sd
    GROUP BY sd.day
    ORDER BY sd.day ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_coach_workout_sessions_30d(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_coach_workout_sessions_30d(uuid) TO authenticated;
