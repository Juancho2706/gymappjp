-- Plan 2 Movida (entrenamiento) — M3: espejo polimorfico en workout_logs. Fase EXPAND.
-- Spec: specs/movida-entrenamiento/SPEC.md (AC4) + PLAN.md (mapa de campos por tipo).
-- Espejo nullable de lo registrado por el alumno segun tipo efectivo:
--   cardio   -> actual_duration_sec, actual_distance_m, actual_pace_sec_per_km, actual_avg_hr
--   mobility -> actual_hold_sec
--   roller   -> actual_duration_sec O reps_done (columna existente)
--   metadata -> jsonb libre (ej. lado L/R v1 — logging por lado separado fuera de alcance).
-- NO reusar reps_done (INT) para semantica nueva. SIN CHECKs: hot table (tabla mas caliente de la
-- app, 1 insert por set logueado) — la validacion vive en Zod (WorkoutLogSetSchema), igual que
-- weight_kg/rpe/rir hoy. ADD COLUMN nullable = metadata-only, sin rewrite.
-- actual_avg_hr se ingresa a mano (sin integracion con relojes/bandas, fuera de alcance v1).
-- RLS de workout_logs intacta (policies endurecidas 20260530170000/20260608120000 + pool
-- 20260609160000 operan por client_id, no por columnas de payload).
-- Grants: sin tablas/funciones nuevas -> no aplica el bloque REVOKE/GRANT de default privileges.

ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS actual_duration_sec integer,
  ADD COLUMN IF NOT EXISTS actual_distance_m numeric,
  ADD COLUMN IF NOT EXISTS actual_pace_sec_per_km integer,
  ADD COLUMN IF NOT EXISTS actual_hold_sec integer,
  ADD COLUMN IF NOT EXISTS actual_avg_hr smallint,
  ADD COLUMN IF NOT EXISTS metadata jsonb;
