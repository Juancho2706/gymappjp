-- Fase 4(c) del plan de optimizacion: cap del streak en 730 dias (2 años).
-- Deuda PRE-existente: get_client_current_streak hacia full-scan de TODO el historial de
-- workout_logs + nutrition por cliente solo para contar la racha actual. Rachas >2 años no
-- existen en la practica -> acotar a 730d mata el full-scan sin cambiar ningun resultado real.
-- Paridad validada: diff orig vs capped sobre clientes con racha activa = 0 filas (BEGIN..ROLLBACK).
-- Aditiva / idempotente / forward-only (CREATE OR REPLACE). El indice de Fase 1 ayuda al filtro.

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

-- Limpieza de la funcion temporal de validacion de paridad (idempotente).
DROP FUNCTION IF EXISTS public._tmp_streak_capped(uuid);
