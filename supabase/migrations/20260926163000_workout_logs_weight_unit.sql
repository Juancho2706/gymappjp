-- Kilos o libras (docs/specs/kg-lb-ejecutor, D1 = a): unidad en que el alumno TECLEÓ el peso de la
-- serie. `weight_kg` sigue siendo SIEMPRE kilos (lo leen récords, tonelaje, volumen, series de fuerza y
-- el dossier); esta columna solo registra cómo se escribió, para mostrarle al alumno su unidad y
-- anotar «(45 lb)» en la vista del coach. NULL = serie anterior al tren o sin selector ⇒ kilos.
--
-- 100% aditiva, idempotente, forward-only. ADD COLUMN nullable SIN DEFAULT = solo metadata: no reescribe
-- la tabla. Sin CHECK a propósito (tabla caliente, un insert por serie): la validación vive en Zod
-- (`WorkoutLogSetSchema.weight_unit`, enum kg|lb), misma política que
-- 20260611090003_workout_logs_polymorphic_mirror.sql.
--
-- lock_timeout: el ALTER toma ACCESS EXCLUSIVE un instante; si hubiera una transacción larga, falla en
-- 5 s en vez de dejar encolados detrás los inserts de series de los alumnos.
--
-- Verificado en LIVE el 2026-09-26 antes de escribir este archivo: columna inexistente; ~29.800 filas /
-- 18 MB; sin vistas dependientes; único trigger `trg_workout_logs_set_exercise_id` (no afectado);
-- ninguna función inserta en workout_logs sin lista de columnas ni usa `workout_logs%rowtype`; permisos
-- a nivel de tabla (no por columna) ⇒ la columna nueva queda cubierta por los mismos grants y la misma
-- RLS (las policies operan por client_id). Dry-run BEGIN/ROLLBACK: ver docs/specs/kg-lb-ejecutor/TASKS.md W2.1.
--
-- Rollback (en un archivo NUEVO, forward-only):
--   ALTER TABLE public.workout_logs DROP COLUMN IF EXISTS weight_unit;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS weight_unit text;

COMMENT ON COLUMN public.workout_logs.weight_unit IS
  'Unidad en que el alumno tecleó el peso: kg | lb (tren kg-lb-ejecutor). weight_kg es SIEMPRE kilos; esto solo decide la lectura (alumno en su unidad, coach «20,4 kg (45 lb)»). NULL = kilos (series previas). Sin CHECK: validación en Zod (WorkoutLogSetSchema.weight_unit).';
