-- Sobrecarga progresiva / data-loss del historial: el FK workout_logs.block_id era ON DELETE
-- CASCADE → borrar un workout_block (al re-guardar/sincronizar un programa de cliente) destruía
-- TODOS los workout_logs del alumno (sets, pesos, reps, fechas → streaks, "sesión anterior",
-- progreso). Lo pasamos a ON DELETE SET NULL: el log SOBREVIVE con block_id NULL + sus columnas
-- snapshot (exercise_name_at_log, target_*_at_log, plan_name_at_log) que lo auto-describen.
--
-- ADITIVO / NO DESTRUCTIVO: cero filas tocadas; solo cambia el comportamiento FUTURO del delete.
-- Red de seguridad del reconcile-in-place del save (workout-save-reconcile.ts), que ya preserva
-- los ids de bloque con logs. Idempotente / forward-only (replay-safe).
--
-- Nota de lock: el archivo de migración corre en UNA transacción, así que el ADD CONSTRAINT toma
-- ACCESS EXCLUSIVE mientras valida el scan (no se usa el truco NOT VALID/VALIDATE porque en una
-- sola txn no aporta — el lock se mantiene hasta el COMMIT igual). workout_logs es la tabla más
-- caliente; a la escala actual el scan es corto (FK ya satisfecho), pero tenerlo presente.

-- block_id pasa a NULLABLE (requisito de SET NULL). DROP NOT NULL es no-op si ya era nullable.
ALTER TABLE public.workout_logs ALTER COLUMN block_id DROP NOT NULL;

-- Recrear el FK con ON DELETE SET NULL (idempotente: drop-if-exists + add).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'workout_logs_block_id_fkey'
               AND conrelid = 'public.workout_logs'::regclass) THEN
    ALTER TABLE public.workout_logs DROP CONSTRAINT workout_logs_block_id_fkey;
  END IF;
END $$;

ALTER TABLE public.workout_logs
  ADD CONSTRAINT workout_logs_block_id_fkey FOREIGN KEY (block_id)
  REFERENCES public.workout_blocks(id) ON DELETE SET NULL;
