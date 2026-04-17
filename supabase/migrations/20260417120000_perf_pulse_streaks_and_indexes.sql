-- Batch streaks for coach directory pulse (single round-trip vs N RPCs).
-- Requires existing public.get_client_current_streak(uuid).

CREATE OR REPLACE FUNCTION public.get_coach_clients_streaks(p_coach_id uuid)
RETURNS TABLE(client_id uuid, streak integer)
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
    SELECT
        c.id AS client_id,
        COALESCE(public.get_client_current_streak(c.id), 0)::integer AS streak
    FROM public.clients c
    WHERE c.coach_id = p_coach_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_coach_clients_streaks(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_coach_clients_streaks(uuid) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_workout_logs_client_id_logged_at_desc
    ON public.workout_logs (client_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS idx_daily_nutrition_logs_client_id_log_date_desc
    ON public.daily_nutrition_logs (client_id, log_date DESC);
