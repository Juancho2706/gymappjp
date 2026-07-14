-- Metas profesionales aditivas sobre el plan nutricional activo.
-- Aplicada en Supabase project `constant` (jikjeokundmaafuytdcx) el 2026-07-14.

ALTER TABLE public.nutrition_plans
  ADD COLUMN IF NOT EXISTS hydration_target_ml integer,
  ADD COLUMN IF NOT EXISTS steps_target integer,
  ADD COLUMN IF NOT EXISTS sleep_target_hours numeric,
  ADD COLUMN IF NOT EXISTS fasting_target_hours numeric,
  ADD COLUMN IF NOT EXISTS supplement_guidance text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS protocol_notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='nutrition_plans_guidance_targets_check'
      AND conrelid='public.nutrition_plans'::regclass
  ) THEN
    ALTER TABLE public.nutrition_plans
      ADD CONSTRAINT nutrition_plans_guidance_targets_check
      CHECK (
        (hydration_target_ml IS NULL OR hydration_target_ml BETWEEN 0 AND 20000)
        AND (steps_target IS NULL OR steps_target BETWEEN 0 AND 100000)
        AND (sleep_target_hours IS NULL OR sleep_target_hours BETWEEN 0 AND 24)
        AND (fasting_target_hours IS NULL OR fasting_target_hours BETWEEN 0 AND 24)
      ) NOT VALID;
  END IF;
END $$;

COMMENT ON COLUMN public.nutrition_plans.hydration_target_ml IS
  'Meta diaria configurada por el profesional; se compara con daily_habits.water_ml.';
COMMENT ON COLUMN public.nutrition_plans.steps_target IS
  'Meta diaria de pasos configurada por el profesional.';
COMMENT ON COLUMN public.nutrition_plans.sleep_target_hours IS
  'Meta diaria de sueño configurada por el profesional.';
COMMENT ON COLUMN public.nutrition_plans.fasting_target_hours IS
  'Meta opcional de ayuno; no se completa ni recomienda automáticamente.';
COMMENT ON COLUMN public.nutrition_plans.supplement_guidance IS
  'Indicaciones textuales del profesional; EVA no prescribe automáticamente.';
COMMENT ON COLUMN public.nutrition_plans.protocol_notes IS
  'Recomendaciones y protocolo nutricional longitudinal del plan.';
