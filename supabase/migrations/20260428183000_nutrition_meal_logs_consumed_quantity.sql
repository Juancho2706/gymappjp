-- B11: porcentaje opcional (0-100) de la comida planificada consumida.
-- NULL = modo binario (100% de macros del plan cuando is_completed).

ALTER TABLE public.nutrition_meal_logs
  ADD COLUMN IF NOT EXISTS consumed_quantity numeric(7,4) NULL;

COMMENT ON COLUMN public.nutrition_meal_logs.consumed_quantity IS
  'Porcentaje 0-100 del plan de esta comida consumido; NULL = modo binario (100% si is_completed).';

ALTER TABLE public.nutrition_meal_logs
  DROP CONSTRAINT IF EXISTS nutrition_meal_logs_consumed_quantity_check;

ALTER TABLE public.nutrition_meal_logs
  ADD CONSTRAINT nutrition_meal_logs_consumed_quantity_check
  CHECK (
    consumed_quantity IS NULL
    OR (consumed_quantity >= 0 AND consumed_quantity <= 100)
  );
