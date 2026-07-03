-- Nota rápida del alumno por serie ("me dolió el hombro") — viaja al coach en la ficha.
-- ADITIVA, nullable; workout_logs no tiene column-grants restrictivos (INSERT/UPDATE del alumno
-- pasan por RLS client-scoped existente, la columna nueva viaja en el mismo payload).
ALTER TABLE public.workout_logs ADD COLUMN IF NOT EXISTS note text NULL;
