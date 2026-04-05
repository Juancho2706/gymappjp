-- Migración: Añadir campo is_custom a nutrition_plans para aislar personalizaciones de los alumnos
-- Adicional: Añadir métricas en logueos de checkin/workout si estaban faltando según las queries

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'nutrition_plans' AND column_name = 'is_custom'
    ) THEN
        ALTER TABLE public.nutrition_plans ADD COLUMN is_custom BOOLEAN DEFAULT false NOT NULL;
    END IF;

    -- Agregar campos de logeo histórico en daily_nutrition_logs
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'daily_nutrition_logs' AND column_name = 'plan_name_at_log'
    ) THEN
        ALTER TABLE public.daily_nutrition_logs ADD COLUMN plan_name_at_log TEXT;
        ALTER TABLE public.daily_nutrition_logs ADD COLUMN target_calories_at_log INTEGER;
        ALTER TABLE public.daily_nutrition_logs ADD COLUMN target_protein_at_log INTEGER;
        ALTER TABLE public.daily_nutrition_logs ADD COLUMN target_carbs_at_log INTEGER;
        ALTER TABLE public.daily_nutrition_logs ADD COLUMN target_fats_at_log INTEGER;
    END IF;

    -- Agregar campos de logeo histórico en workout_logs
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'workout_logs' AND column_name = 'plan_name_at_log'
    ) THEN
        ALTER TABLE public.workout_logs ADD COLUMN plan_name_at_log TEXT;
    END IF;
END $$;
