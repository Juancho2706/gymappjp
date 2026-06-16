-- Audit DB 2026-06-16: cierra IDOR cross-tenant en 2 RPC SECURITY DEFINER que no validaban
-- ownership del p_client_id (un coach ajeno podia leer racha / ultima actividad de cualquier
-- alumno). Se agrega el guard del sibling get_client_exercise_prs (coach_id propio / self / pool)
-- CON bypass service-role (auth.uid() IS NULL) — el mobile pulse path los llama bajo service-role
-- via get_clients_streaks_by_ids / DashboardService(admin) con ids ya pre-autorizados; sin el
-- bypass devolverian 0/vacio silencioso.
--
-- Validado en prod (tx-rollback + simulacion de claims): atacante => 0 / 0 filas (bloqueado);
-- dueno, alumno (self), coach de pool (via current_user_pool_client_ids) y service-role => acceso
-- intacto. Forward-only, idempotente (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.get_client_current_streak(p_client_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_streak INTEGER := 0;
  v_last_date DATE;
  v_current_date DATE;
  v_activity_dates DATE[];
  v_date DATE;
BEGIN
  -- IDOR guard: bloquea lectura cross-tenant; deja pasar service-role (auth.uid() IS NULL).
  IF auth.uid() IS NOT NULL AND NOT (
    p_client_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.coach_id = (SELECT auth.uid()))
    OR p_client_id IN (SELECT public.current_user_pool_client_ids())
  ) THEN RETURN 0; END IF;

  SELECT ARRAY_AGG(activity_date ORDER BY activity_date DESC)
  INTO v_activity_dates
  FROM (
    SELECT DATE(logged_at) AS activity_date
    FROM public.workout_logs
    WHERE client_id = p_client_id
      AND logged_at >= CURRENT_DATE - INTERVAL '730 days'
    UNION
    SELECT dnl.log_date AS activity_date
    FROM public.nutrition_meal_logs nml
    JOIN public.daily_nutrition_logs dnl ON nml.daily_log_id = dnl.id
    WHERE dnl.client_id = p_client_id
      AND nml.is_completed = true
      AND dnl.log_date >= CURRENT_DATE - INTERVAL '730 days'
  ) sub;

  IF v_activity_dates IS NULL OR array_length(v_activity_dates, 1) = 0 THEN
    RETURN 0;
  END IF;

  v_current_date := CURRENT_DATE;

  IF v_activity_dates[1] < v_current_date - INTERVAL '1 day' THEN
    RETURN 0;
  END IF;

  v_last_date := v_activity_dates[1];
  v_streak := 1;

  FOR i IN 2..array_length(v_activity_dates, 1) LOOP
    v_date := v_activity_dates[i];
    IF v_date = v_last_date - INTERVAL '1 day' THEN
      v_streak := v_streak + 1;
      v_last_date := v_date;
    ELSIF v_date < v_last_date - INTERVAL '1 day' THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN v_streak;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_clients_last_workout_date(p_client_ids uuid[], p_since timestamp with time zone)
 RETURNS TABLE(client_id uuid, last_logged_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT wl.client_id, MAX(wl.logged_at) AS last_logged_at
    FROM public.workout_logs wl
    WHERE wl.client_id = ANY(p_client_ids)
      AND wl.logged_at >= p_since
      AND (
        (SELECT auth.uid()) IS NULL
        OR wl.client_id = (SELECT auth.uid())
        OR wl.client_id IN (SELECT id FROM public.clients WHERE coach_id = (SELECT auth.uid()))
        OR wl.client_id IN (SELECT public.current_user_pool_client_ids())
      )
    GROUP BY wl.client_id;
$function$;
