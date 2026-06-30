-- Sobrecarga progresiva: modo de progresion POR-EJERCICIO (selector del coach en el builder).
-- Motor de target efectivo del alumno: lib/workout/progression.ts (computeEffectiveTarget).
--   weekly_linear (default) | double (doble progresion) | session_linear | adaptive (reservados).
-- Aditiva + idempotente (forward-only): ADD COLUMN IF NOT EXISTS + constraint guardado (replay-safe).
-- Grants: workout_blocks tiene GRANT ALL a authenticated A NIVEL TABLA (baseline) => la columna
-- nueva queda auto-cubierta; NO requiere GRANT UPDATE(col) (no es column-level grant como coaches).
-- Default constante => ADD COLUMN metadata-only, sin rewrite (hot table ~varios miles de filas).

ALTER TABLE public.workout_blocks
  ADD COLUMN IF NOT EXISTS progression_mode text NOT NULL DEFAULT 'weekly_linear';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'workout_blocks_progression_mode_check'
                   AND conrelid = 'public.workout_blocks'::regclass) THEN
    ALTER TABLE public.workout_blocks ADD CONSTRAINT workout_blocks_progression_mode_check
      CHECK (progression_mode IN ('weekly_linear','double','session_linear','adaptive')) NOT VALID;
  END IF;
END $$;
-- VALIDATE trivial: filas existentes = 'weekly_linear' (default) => todas validas. Replay-safe.
ALTER TABLE public.workout_blocks VALIDATE CONSTRAINT workout_blocks_progression_mode_check;

COMMENT ON COLUMN public.workout_blocks.progression_mode IS 'Algoritmo de sobrecarga progresiva (selector por-ejercicio del coach): weekly_linear (default) | double | session_linear | adaptive. Motor: lib/workout/progression.ts';
