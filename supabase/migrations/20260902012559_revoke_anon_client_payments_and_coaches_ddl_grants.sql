-- SEC 2026-09-02 — Higiene de grants de `anon` que no sostiene ningún camino de la app.
--
-- (1) `public.client_payments`: `anon` tenía los MISMOS grants de tabla que `authenticated`
--     (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES). Hoy no se explota porque la única
--     política que alcanza a `anon` (`team_client_payments_member_all`, TO public) llama a
--     `current_user_pool_client_ids()`, sobre la que `anon` no tiene EXECUTE (el REST anónimo
--     devuelve 401/42501). Es una casualidad, no un diseño: cualquier política permisiva futura
--     `TO public` convertiría esos grants en escritura real sobre los pagos de los alumnos.
--     Censo de código (02-09): CERO lecturas/escrituras de `client_payments` con la anon key.
-- (2) `public.coaches`: TRIGGER/TRUNCATE/REFERENCES para `anon` son residuos del `GRANT ALL`
--     original de PostgREST. Nada los usa. Los grants de COLUMNA (branding público) NO se tocan acá:
--     la revocación de `invite_code` exige primero el RPC `get_coach_public_branding` + deploy web
--     + OTA adoptada (ver docs/operations/MANUAL_TASKS.md § SEC-01).
--
-- Aditiva y reversible: no borra columnas, ni políticas, ni datos. Idempotente (REVOKE de un
-- privilegio ausente es no-op). Probada en LIVE dentro de una transacción con rollback el 02-09:
-- anon pierde SELECT/INSERT en client_payments y TRUNCATE en coaches; conserva SELECT de slug/brand_*;
-- authenticated conserva client_payments.
--
-- Rollback:
--   grant select, insert, update, delete, truncate, trigger, references on public.client_payments to anon;
--   grant trigger, truncate, references on public.coaches to anon;

revoke all on public.client_payments from anon;

revoke trigger, truncate, references on public.coaches from anon;
