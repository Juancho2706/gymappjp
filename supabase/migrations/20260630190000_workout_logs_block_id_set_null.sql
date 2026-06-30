-- Sobrecarga progresiva / data-loss del historial: el FK workout_logs.block_id era ON DELETE
-- CASCADE → borrar un workout_block (al re-guardar/sincronizar un programa de cliente) destruía
-- TODOS los workout_logs del alumno (sets, pesos, reps, fechas → streaks, "sesión anterior",
-- progreso). Lo pasamos a ON DELETE SET NULL: el log SOBREVIVE con block_id NULL + sus columnas
-- snapshot (exercise_name_at_log, target_*_at_log, plan_name_at_log) que lo auto-describen.
--
-- ADITIVO / NO DESTRUCTIVO: cero filas tocadas; solo cambia el comportamiento FUTURO del delete.
-- Red de seguridad del fix de reconcile-in-place del save (workout-save-reconcile.ts), que ya
-- preserva los ids de bloque con logs. Idempotente / forward-only (replay-safe).

-- block_id pasa a NULLABLE (requisito de SET NULL). DROP NOT NULL es no-op si ya era nullable.
ALTER TABLE public.workout_logs ALTER COLUMN block_id DROP NOT NULL;

-- Recrear el FK con ON DELETE SET NULL (idempotente: drop-if-exists + add NOT VALID + validate).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'workout_logs_block_id_fkey'
               AND conrelid = 'public.workout_logs'::regclass) THEN
    ALTER TABLE public.workout_logs DROP CONSTRAINT workout_logs_block_id_fkey;
  END IF;
END $$;

ALTER TABLE public.workout_logs
  ADD CONSTRAINT workout_logs_block_id_fkey FOREIGN KEY (block_id)
  REFERENCES public.workout_blocks(id) ON DELETE SET NULL NOT VALID;

-- VALIDATE separado minimiza el lock en la tabla caliente; todas las filas ya satisfacen el FK.
ALTER TABLE public.workout_logs VALIDATE CONSTRAINT workout_logs_block_id_fkey;
