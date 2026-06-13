-- Plan 2 Movida (entrenamiento) — M4: perfil cardio del cliente (modulo `cardio`, F7). Fase EXPAND.
-- Spec: specs/movida-entrenamiento/SPEC.md (AC7, AC8, AC9) + PLAN.md (decision #4).
-- Insumos del calculo de zonas en @eva/calc: FCmax Tanaka por edad (birth_date), Karvonen si hay
-- resting_hr, override manual si el coach midio FCmax real, pace de referencia 5K opcional.
-- Privacidad (AC9): datos personales/salud — visibles SOLO por el scope ya existente de clients
-- (coach dueno / pool / el propio alumno); NO se tocan policies de clients. Captura en el pool
-- cubierta por el consentimiento ya implementado (gate /t/[team]/consent).
-- Columnas nullable => ADD COLUMN metadata-only, sin rewrite. Aditiva / idempotente / replay-safe.
-- Grants: sin tablas/funciones nuevas -> no aplica el bloque REVOKE/GRANT de default privileges.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS resting_hr smallint,
  ADD COLUMN IF NOT EXISTS max_hr_override smallint,
  ADD COLUMN IF NOT EXISTS ref_5k_time_sec integer;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'clients_cardio_profile_check'
                   AND conrelid = 'public.clients'::regclass) THEN
    ALTER TABLE public.clients ADD CONSTRAINT clients_cardio_profile_check CHECK (
      (resting_hr IS NULL OR resting_hr BETWEEN 25 AND 120)
      AND (max_hr_override IS NULL OR max_hr_override BETWEEN 120 AND 230)
      AND (ref_5k_time_sec IS NULL OR ref_5k_time_sec BETWEEN 600 AND 7200)
      AND (birth_date IS NULL OR birth_date BETWEEN '1920-01-01' AND now()::date)
    ) NOT VALID;
  END IF;
END $$;
-- VALIDATE trivial (columnas recien agregadas, todas NULL; tabla chica). Replay-safe (no-op si valido).
-- Nota: now()::date en CHECK es estable-en-runtime (se evalua al insertar/actualizar); patron
-- aceptado en review adversarial del PLAN — solo acota birth_date a "no en el futuro".
ALTER TABLE public.clients VALIDATE CONSTRAINT clients_cardio_profile_check;
