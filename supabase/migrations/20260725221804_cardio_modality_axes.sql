-- Cardio Fase C (specs/cardio-ejes-y-fixes): modalidad por ejercicio del catalogo + Escaladora +
-- unidades rep-based nuevas para prescripcion. 100% aditiva, idempotente, forward-only.
-- Aplicada en LIVE el 2026-07-25 via MCP (version 20260725221804) tras dry-run BEGIN/ROLLBACK:
-- 0 filas violaban el CHECK ampliado; 5.975 workout_blocks revalidaron al instante.
-- Rollback documentado: DROP COLUMN cardio_modality; recrear workout_blocks_poly_check con la lista
-- previa ('reps','passes','breaths'); DELETE del ejercicio 0ca0-...009.

ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS cardio_modality text;
ALTER TABLE public.exercises DROP CONSTRAINT IF EXISTS exercises_cardio_modality_check;
ALTER TABLE public.exercises ADD CONSTRAINT exercises_cardio_modality_check
  CHECK (cardio_modality IS NULL OR cardio_modality IN ('run','bike','row','elliptical','jump_rope','hiit_reps','stairs'));

COMMENT ON COLUMN public.exercises.cardio_modality IS
  'Modalidad de cardio del catalogo (run/bike/row/elliptical/jump_rope/hiit_reps/stairs). NULL = generica: el ejecutor pide Min/Distancia/FC como siempre. Resuelve los ejes de captura en packages/workout-engine/cardio-modality.ts.';

-- Backfill de los 8 ejercicios de sistema del seed (ids deterministicos 0ca0-*).
UPDATE public.exercises SET cardio_modality = v.m
FROM (VALUES
  ('00000000-0000-0000-0ca0-000000000001'::uuid,'run'),
  ('00000000-0000-0000-0ca0-000000000002'::uuid,'run'),
  ('00000000-0000-0000-0ca0-000000000003'::uuid,'run'),
  ('00000000-0000-0000-0ca0-000000000004'::uuid,'bike'),
  ('00000000-0000-0000-0ca0-000000000005'::uuid,'row'),
  ('00000000-0000-0000-0ca0-000000000006'::uuid,'elliptical'),
  ('00000000-0000-0000-0ca0-000000000007'::uuid,'jump_rope'),
  ('00000000-0000-0000-0ca0-000000000008'::uuid,'hiit_reps')
) AS v(id,m)
WHERE public.exercises.id = v.id AND public.exercises.cardio_modality IS DISTINCT FROM v.m;

-- Escaladora: 9no ejercicio de sistema (decision owner D4, 2026-07-25).
INSERT INTO public.exercises
  (id, name, equipment, difficulty, instructions, muscle_group, exercise_type, cardio_modality,
   gender_focus, source, coach_id, org_id, team_id, deleted_at)
VALUES (
  '00000000-0000-0000-0ca0-000000000009',
  'Escaladora',
  'Escaladora',
  'Principiante',
  ARRAY[
    'Sube con el torso erguido y el peso en toda la planta del pie; usa los pasamanos solo para equilibrio, sin descargar el peso en ellos.',
    'Pisa escalones completos y alterna piernas con ritmo constante; ajusta la velocidad para mantenerte en la zona prescrita.',
    'Evita bloquear las rodillas al extender; el impulso sale de gluteos y cuadriceps, no de los brazos.',
    'Prescripcion sugerida: 10-20 min continuos en Z2-Z3, o intervalos de 1-2 min fuertes con 1 min suave.'
  ],
  'Cardio', 'cardio', 'stairs', 'Neutro', 'system', null, null, null, null
)
ON CONFLICT (id) DO NOTHING;

-- reps_unit gana 'jumps' (saltos) y 'floors' (pisos) para prescripcion rep-based de cardio.
-- Se recrea el constraint completo con la MISMA definicion vigente + el superset (solo amplia).
ALTER TABLE public.workout_blocks DROP CONSTRAINT IF EXISTS workout_blocks_poly_check;
ALTER TABLE public.workout_blocks ADD CONSTRAINT workout_blocks_poly_check CHECK (
  ((side_mode IS NULL) OR (side_mode = ANY (ARRAY['bilateral'::text, 'per_side'::text, 'alternating'::text])))
  AND ((reps_unit IS NULL) OR (reps_unit = ANY (ARRAY['reps'::text, 'passes'::text, 'breaths'::text, 'jumps'::text, 'floors'::text])))
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
