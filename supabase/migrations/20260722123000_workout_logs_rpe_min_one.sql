-- Ejecutor V3 (correccion CEO 2026-07-22): RPE vuelve a 1-10; el 0 solo aplica a RIR (0 = al fallo).
-- Revierte 20260722121500 (que habia relajado rpe a >=0; 0 filas con rpe=0, revert seguro).
-- RIR queda 0-10 (workout_logs_rir_check intacto).

alter table public.workout_logs drop constraint workout_logs_rpe_check;
alter table public.workout_logs add constraint workout_logs_rpe_check check (rpe >= 1 and rpe <= 10) not valid;
alter table public.workout_logs validate constraint workout_logs_rpe_check;
