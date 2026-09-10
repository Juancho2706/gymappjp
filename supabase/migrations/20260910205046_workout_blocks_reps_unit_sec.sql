-- Cuenta atras en pantalla (specs/cuenta-atras-en-pantalla, D3/R4): reps_unit gana 'sec' para la
-- prescripcion de FUERZA POR TIEMPO. 100% aditiva, idempotente, forward-only.
-- Definicion copiada VERBATIM de LIVE con pg_get_constraintdef(oid) el 2026-09-10 + el superset:
-- solo amplia el ARRAY de reps_unit; el resto del CHECK queda byte-identico.
-- Dry-run BEGIN/ROLLBACK previo: 0 filas con reps_unit='sec' (SELECT count(*) sobre workout_blocks),
-- 0 filas violaban el CHECK ampliado.
-- Rollback documentado: UPDATE public.workout_blocks SET reps_unit = NULL WHERE reps_unit = 'sec';
-- luego recrear workout_blocks_poly_check con la lista previa
-- ('reps','passes','breaths','jumps','floors'), en un archivo NUEVO (forward-only).

ALTER TABLE public.workout_blocks DROP CONSTRAINT IF EXISTS workout_blocks_poly_check;
ALTER TABLE public.workout_blocks ADD CONSTRAINT workout_blocks_poly_check CHECK (
  ((side_mode IS NULL) OR (side_mode = ANY (ARRAY['bilateral'::text, 'per_side'::text, 'alternating'::text])))
  AND ((reps_unit IS NULL) OR (reps_unit = ANY (ARRAY['reps'::text, 'passes'::text, 'breaths'::text, 'jumps'::text, 'floors'::text, 'sec'::text])))
  AND ((load_type IS NULL) OR (load_type = ANY (ARRAY['weight'::text, 'time'::text, 'bodyweight'::text, 'none'::text])))
  AND ((load_unit IS NULL) OR (load_unit = ANY (ARRAY['kg'::text, 'lb'::text, 'sec'::text])))
  AND ((distance_unit IS NULL) OR (distance_unit = ANY (ARRAY['m'::text, 'km'::text])))
  AND ((hr_zone IS NULL) OR ((hr_zone >= 1) AND (hr_zone <= 5)))
  AND ((exercise_type_override IS NULL) OR (exercise_type_override = ANY (ARRAY['strength'::text, 'cardio'::text, 'mobility'::text, 'roller'::text])))
  AND ((reps_value IS NULL) OR (reps_value >= 0))
  AND ((load_value IS NULL) OR (load_value >= (0)::numeric))
  AND ((distance_value IS NULL) OR (distance_value >= (0)::numeric))
  AND ((duration_sec IS NULL) OR (duration_sec >= 0))
  AND ((target_pace_sec_per_km IS NULL) OR (target_pace_sec_per_km > 0))
);

COMMENT ON COLUMN public.workout_blocks.reps_unit IS
  'Unidad del conteo prescrito. reps|passes|breaths|jumps|floors (cardio/movilidad/roller) + sec = FUERZA POR TIEMPO (D3): el bloque sigue siendo strength, con duration_sec como objetivo del hold y reps como espejo legacy. Espejo TS: REPS_UNIT_VALUES en packages/schemas/workout.ts.';
