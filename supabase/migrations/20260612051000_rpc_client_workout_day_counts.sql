-- RPC agregada: conteo de series por dia (zona Santiago) — reemplaza getWorkoutHistoryLogsFull
-- (que bajaba hasta 8000 filas crudas solo para contar series/dia). Plan optimizacion, Fase 2 #1.
-- Guard replica las 3 policies de SELECT de workout_logs: cliente legacy, coach, pool.
-- Paridad validada: 38 dias / 751 sets identico al JS (buildWorkoutLogDaySummaries). Aditiva/idempotente.

CREATE OR REPLACE FUNCTION public.get_client_workout_day_counts(p_client_id uuid, p_days_back integer)
  RETURNS TABLE(day date, sets bigint)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    p_client_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.coach_id = (SELECT auth.uid()))
    OR p_client_id IN (SELECT public.current_user_pool_client_ids())
  ) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT timezone('America/Santiago', wl.logged_at)::date AS day, count(*)::bigint AS sets
  FROM public.workout_logs wl
  WHERE wl.client_id = p_client_id
    AND timezone('America/Santiago', wl.logged_at)::date >= (timezone('America/Santiago', now())::date - p_days_back)
  GROUP BY 1 ORDER BY 1 DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_client_workout_day_counts(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_workout_day_counts(uuid, integer) TO authenticated, service_role;
