-- E4: Tabla legacy meal_completions → vista de solo lectura (misma forma que la tabla).
-- Reemplaza meal_completions_compat (si existía) por el nombre canónico meal_completions.
-- Fase C (nutrición): día de semana opcional en comidas (NULL = todos los días; 1=Lun … 7=Dom).
-- Versión alineada con migración aplicada en remoto (MCP / dashboard).

DROP VIEW IF EXISTS public.meal_completions_compat;

DROP TABLE IF EXISTS public.meal_completions CASCADE;

DROP VIEW IF EXISTS public.meal_completions CASCADE;

CREATE OR REPLACE VIEW public.meal_completions
WITH (security_invoker = true) AS
SELECT
  nml.id,
  dnl.client_id,
  nml.meal_id,
  dnl.log_date AS date_completed,
  nml.created_at
FROM public.nutrition_meal_logs nml
JOIN public.daily_nutrition_logs dnl ON dnl.id = nml.daily_log_id
WHERE nml.is_completed = true;

COMMENT ON VIEW public.meal_completions IS
  'Solo lectura: filas derivadas de nutrition_meal_logs completados (reemplazo de tabla legacy).';

GRANT SELECT ON public.meal_completions TO authenticated, service_role;

ALTER TABLE public.nutrition_meals
  ADD COLUMN IF NOT EXISTS day_of_week smallint
  CONSTRAINT nutrition_meals_day_of_week_check
  CHECK (day_of_week IS NULL OR (day_of_week >= 1 AND day_of_week <= 7));

ALTER TABLE public.template_meals
  ADD COLUMN IF NOT EXISTS day_of_week smallint
  CONSTRAINT template_meals_day_of_week_check
  CHECK (day_of_week IS NULL OR (day_of_week >= 1 AND day_of_week <= 7));

COMMENT ON COLUMN public.nutrition_meals.day_of_week IS
  'Día de la semana (1=Lun … 7=Dom, zona operativa Santiago). NULL = aplica todos los días.';

COMMENT ON COLUMN public.template_meals.day_of_week IS
  'Día de la semana (1=Lun … 7=Dom). NULL = aplica todos los días.';
