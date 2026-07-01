-- Data-loss análogo al de workout (fix 20260630190000), pero en NUTRICIÓN: borrar un
-- nutrition_plan destruía la ADHERENCIA del alumno vía CASCADE:
--   nutrition_plan → daily_nutrition_logs.plan_id (CASCADE) → nutrition_meal_logs.daily_log_id (CASCADE)
--   nutrition_plan → nutrition_meals.plan_id (CASCADE) → nutrition_meal_logs.meal_id (CASCADE)
-- Pasamos los FKs de las tablas de LOG a ON DELETE SET NULL:
--   - daily_nutrition_logs.plan_id → SET NULL: el registro diario SOBREVIVE, auto-descrito por sus
--     columnas snapshot (plan_name_at_log, target_*_at_log). Preserva la adherencia diaria (target
--     vs consumido) aunque se borre el plan.
--   - nutrition_meal_logs.meal_id → SET NULL: el check de comida sobrevive (is_completed +
--     daily_log_id intactos → sigue contando para las comidas completadas del día). No tiene
--     snapshot de la comida, así que se pierde SOLO la identidad de la comida, no la adherencia.
--
-- ADITIVO / NO DESTRUCTIVO: cero filas tocadas; solo cambia el comportamiento futuro del delete.
-- NO afecta la cascada legítima client_id (borrar el alumno sí borra sus logs). El reconcile de
-- comidas (reconcileMeals: solo borra comidas SIN logs) sigue igual; esto es una red de seguridad
-- para el path de borrar el PLAN entero, que reconcileMeals no cubre. Idempotente / forward-only.

-- daily_nutrition_logs.plan_id → SET NULL
ALTER TABLE public.daily_nutrition_logs ALTER COLUMN plan_id DROP NOT NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'daily_nutrition_logs_plan_id_fkey'
               AND conrelid = 'public.daily_nutrition_logs'::regclass) THEN
    ALTER TABLE public.daily_nutrition_logs DROP CONSTRAINT daily_nutrition_logs_plan_id_fkey;
  END IF;
END $$;
ALTER TABLE public.daily_nutrition_logs
  ADD CONSTRAINT daily_nutrition_logs_plan_id_fkey FOREIGN KEY (plan_id)
  REFERENCES public.nutrition_plans(id) ON DELETE SET NULL;

-- nutrition_meal_logs.meal_id → SET NULL
ALTER TABLE public.nutrition_meal_logs ALTER COLUMN meal_id DROP NOT NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'nutrition_meal_logs_meal_id_fkey'
               AND conrelid = 'public.nutrition_meal_logs'::regclass) THEN
    ALTER TABLE public.nutrition_meal_logs DROP CONSTRAINT nutrition_meal_logs_meal_id_fkey;
  END IF;
END $$;
ALTER TABLE public.nutrition_meal_logs
  ADD CONSTRAINT nutrition_meal_logs_meal_id_fkey FOREIGN KEY (meal_id)
  REFERENCES public.nutrition_meals(id) ON DELETE SET NULL;
