-- Ejecutor V3 (E0.4): RPE pasa de 1-10 a 0-10 (decision CEO 2026-07-21; RPE 0 = sin esfuerzo).
-- rir ya aceptaba 0-10; solo rpe conservaba el CHECK legacy >= 1.
-- Patron tabla caliente: NOT VALID + VALIDATE (todas las filas existentes cumplen >=1, subset de >=0).

alter table public.workout_logs drop constraint workout_logs_rpe_check;
alter table public.workout_logs add constraint workout_logs_rpe_check check (rpe >= 0 and rpe <= 10) not valid;
alter table public.workout_logs validate constraint workout_logs_rpe_check;
