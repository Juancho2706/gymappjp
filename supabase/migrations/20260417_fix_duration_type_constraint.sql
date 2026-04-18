-- Fix: el constraint antiguo usaba ('weeks', 'days', 'indefinite').
-- El código usa ('weeks', 'calendar_days', 'async').
-- Todos los registros existentes tienen 'weeks' → migración de datos innecesaria.
ALTER TABLE workout_programs
    DROP CONSTRAINT IF EXISTS workout_programs_duration_type_check;

ALTER TABLE workout_programs
    ADD CONSTRAINT workout_programs_duration_type_check
    CHECK (duration_type IN ('weeks', 'calendar_days', 'async'));
