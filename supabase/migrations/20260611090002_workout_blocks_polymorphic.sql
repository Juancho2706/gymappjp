-- Plan 2 Movida (entrenamiento) — M2: prescripcion polimorfica en workout_blocks. Fase EXPAND.
-- Spec: specs/movida-entrenamiento/SPEC.md (AC1, AC2, AC3) + PLAN.md (decisiones #1, #3, #4).
-- Ejes ortogonales (research Hevy): reps/duracion/distancia/carga/lado coexisten (farmer carry
-- tri-eje). hr_zone 1-5 se prescribe por zona; los bpm se calculan por alumno al renderizar
-- (research TrainingPeaks) — NUNCA persistir bpm absolutos en la prescripcion.
-- Coexistencia expand-contract: reps texto (NOT NULL) sigue intacto y SIEMPRE poblado con el
-- resumen legacy corto generado por el builder; lectura prefiere campos tipados, fallback a reps.
-- NO se dropea/renombra reps ni section (fase CONTRACT futura, fuera de este plan).
-- Todas las columnas nuevas nullable => ADD COLUMN metadata-only, sin rewrite (hot table).
-- interval_config / extra_targets: jsonb validado por Zod (IntervalConfigSchema) en app layer.
-- Grants: sin tablas/funciones nuevas -> no aplica el bloque REVOKE/GRANT de default privileges.

ALTER TABLE public.workout_blocks
  ADD COLUMN IF NOT EXISTS is_unilateral boolean,
  ADD COLUMN IF NOT EXISTS side_mode text,
  ADD COLUMN IF NOT EXISTS reps_value integer,
  ADD COLUMN IF NOT EXISTS reps_unit text,
  ADD COLUMN IF NOT EXISTS load_type text,
  ADD COLUMN IF NOT EXISTS load_value numeric,
  ADD COLUMN IF NOT EXISTS load_unit text,
  ADD COLUMN IF NOT EXISTS distance_value numeric,
  ADD COLUMN IF NOT EXISTS distance_unit text,
  ADD COLUMN IF NOT EXISTS duration_sec integer,
  ADD COLUMN IF NOT EXISTS target_pace_sec_per_km integer,
  ADD COLUMN IF NOT EXISTS hr_zone smallint,
  ADD COLUMN IF NOT EXISTS instructions text,
  ADD COLUMN IF NOT EXISTS exercise_type_override text,
  ADD COLUMN IF NOT EXISTS interval_config jsonb,
  ADD COLUMN IF NOT EXISTS extra_targets jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'workout_blocks_poly_check'
                   AND conrelid = 'public.workout_blocks'::regclass) THEN
    ALTER TABLE public.workout_blocks ADD CONSTRAINT workout_blocks_poly_check CHECK (
      (side_mode IS NULL OR side_mode IN ('bilateral','per_side','alternating'))
      AND (reps_unit IS NULL OR reps_unit IN ('reps','passes','breaths'))
      AND (load_type IS NULL OR load_type IN ('weight','time','bodyweight','none'))
      AND (load_unit IS NULL OR load_unit IN ('kg','lb','sec'))
      AND (distance_unit IS NULL OR distance_unit IN ('m','km'))
      AND (hr_zone IS NULL OR hr_zone BETWEEN 1 AND 5)
      AND (exercise_type_override IS NULL OR exercise_type_override IN ('strength','cardio','mobility','roller'))
      AND (reps_value IS NULL OR reps_value >= 0)
      AND (load_value IS NULL OR load_value >= 0)
      AND (distance_value IS NULL OR distance_value >= 0)
      AND (duration_sec IS NULL OR duration_sec >= 0)
      AND (target_pace_sec_per_km IS NULL OR target_pace_sec_per_km > 0)
    ) NOT VALID;
  END IF;
END $$;
-- VALIDATE trivial: columnas recien agregadas => todas NULL en filas existentes (~4k filas, OK).
-- Replay-safe: validar un constraint ya valido es no-op.
ALTER TABLE public.workout_blocks VALIDATE CONSTRAINT workout_blocks_poly_check;
