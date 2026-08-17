-- Clientes viejos del builder movil (bundle <= jun-2026) mandan program_phases: null
-- cuando el programa no tiene fases; la columna es jsonb NOT NULL DEFAULT '[]'.
-- Este trigger coalesce null → '[]' para no romper guardados desde apps sin el fix
-- (iOS en review no puede recibir OTA). Reversible: DROP TRIGGER + DROP FUNCTION.

CREATE OR REPLACE FUNCTION public.workout_programs_default_phases()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.program_phases := '[]'::jsonb;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_workout_programs_default_phases
BEFORE INSERT OR UPDATE ON public.workout_programs
FOR EACH ROW
WHEN (NEW.program_phases IS NULL)
EXECUTE FUNCTION public.workout_programs_default_phases();
