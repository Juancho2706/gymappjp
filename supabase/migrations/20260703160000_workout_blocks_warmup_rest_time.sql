-- Fase M: descanso diferenciado calentamiento vs series efectivas (prescripción por bloque).
-- ADITIVA, nullable: NULL = un solo descanso como hoy (cero cambio para planes existentes).
ALTER TABLE public.workout_blocks ADD COLUMN IF NOT EXISTS warmup_rest_time text NULL;
