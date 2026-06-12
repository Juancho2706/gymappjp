-- Performance — indices para agregacion server-side (plan optimizacion Supabase, Fase 1).
-- Deuda PRE-existente: el dashboard de progreso del alumno y el detalle de cliente del coach
-- filtran workout_logs por (client_id, weight_kg IS NOT NULL) y proyectan weight/reps/block.
-- Aditiva / idempotente / forward-only (IF NOT EXISTS). NO toca data ni schema.
-- Validado en tx-rollback con EXPLAIN ANALYZE: la query de PRs pasa a Index Only Scan (1.3ms).

-- (1) Covering parcial para PRs/volumen/fuerza: index-only sobre las filas con peso (salta
-- cardio/movilidad sin weight_kg). Las columnas INCLUDE evitan el heap fetch.
CREATE INDEX IF NOT EXISTS idx_wl_client_logged_notnull
  ON public.workout_logs (client_id, logged_at DESC)
  INCLUDE (weight_kg, reps_done, block_id)
  WHERE weight_kg IS NOT NULL;

-- (2) FK faltante: nutrition_meal_logs.daily_log_id se usa en joins calientes
-- (nutrition-coach.queries.ts, client-detail.service.ts) y crece con N clientes x dias.
CREATE INDEX IF NOT EXISTS idx_nutrition_meal_logs_daily_log_id
  ON public.nutrition_meal_logs (daily_log_id);
