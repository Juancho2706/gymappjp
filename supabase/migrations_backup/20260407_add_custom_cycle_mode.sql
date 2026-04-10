-- Migración para añadir el modo de estructura del ciclo a workout_programs

ALTER TABLE public.workout_programs
ADD COLUMN program_structure_type text DEFAULT 'weekly' CHECK (program_structure_type IN ('weekly', 'cycle')),
ADD COLUMN cycle_length integer;

COMMENT ON COLUMN public.workout_programs.program_structure_type IS 'Indica si el programa depende de días de la semana (weekly) o de un ciclo de n días (cycle)';
COMMENT ON COLUMN public.workout_programs.cycle_length IS 'Longitud del ciclo en días si program_structure_type es cycle';
