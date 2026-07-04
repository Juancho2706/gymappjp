-- Fase L (exec alumno) · sustitucion de maquina ocupada — specs/exec-fase-l DC-1.
-- Columnas ADITIVAS nullable: el codigo legado (web/mobile) las ignora sin romperse.
-- exercise_id del log NO se toca (DC-4/AC-C7): el sustituto vive SOLO en estas columnas.
-- workout_logs tiene GRANT de tabla para authenticated -> sin GRANT de columna extra.
-- Idempotente / forward-only (regla del repo).
ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS substituted_exercise_id uuid REFERENCES public.exercises(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS substituted_exercise_name text,
  ADD COLUMN IF NOT EXISTS substitution_reason text;

-- Indice parcial: solo las filas sustituidas (fraccion minima) — cubre el FK sin engordar el indice.
CREATE INDEX IF NOT EXISTS idx_workout_logs_substituted_exercise_id
  ON public.workout_logs (substituted_exercise_id)
  WHERE substituted_exercise_id IS NOT NULL;
