-- W1.1 (flujo-coach-nuevo): clients.first_login_at — la North Star deja de inferirse.
--
-- PRIMER login del alumno, escrito UNA sola vez (`WHERE first_login_at IS NULL`) y SOLO por
-- `service_role` desde `recordStudentFirstLogin` (student-login-signal.service.ts, W1.2). Una
-- columna de "último login" no puede responder «activado dentro de 72 h» (SPEC §5 regla 2).
--
-- SIN default: la fila nace NULL y el primer login real la sella.
-- SIN `GRANT UPDATE(first_login_at)`: ver COMMENT abajo — es la premisa de seguridad completa.
--
-- ÍNDICE: NO se crea. La tarea lo condicionaba a que el EXPLAIN de la consulta de W0.1 lo
-- justificara; verificado contra LIVE el 26-08: `public.clients` tiene 111 filas y ya existen
-- `idx_clients_coach_id`, `idx_clients_coach_id_created_at` e `idx_clients_coach_archived` —
-- todo acceso del roster y de la consulta semanal entra por coach_id. Un índice parcial sobre
-- first_login_at sería mantenimiento sin lectura que lo use. Se revisa recién si la tabla
-- crece dos órdenes de magnitud.
--
-- APLICADA en LIVE el 2026-08-26 (jefe) como versión 20260826044738. Validación previa con
-- BEGIN … ROLLBACK: 111 filas OK, 0 grants UPDATE para authenticated/anon sobre la columna.

alter table public.clients
    add column if not exists first_login_at timestamptz;

comment on column public.clients.first_login_at is
    'Primer login real del alumno (North Star de flujo-coach-nuevo). La escribe SOLO service_role '
    'via recordStudentFirstLogin (una vez: UPDATE ... WHERE first_login_at IS NULL). SIN column-grant '
    'a authenticated/anon A PROPOSITO: clients tiene tres politicas de auto-UPDATE del propio alumno '
    '(baseline 00000000000001:2493,2856,2893), asi que un grant la haria escribible desde el navegador '
    'con la anon key y la North Star seria falsificable por el cliente. La premisa NO la sostiene el '
    'baseline (que trae GRANT ALL ON public.clients TO authenticated en :3599): la sostiene '
    '20260612140001_clients_scoping_grants.sql:36-37 — REVOKE UPDATE ... FROM authenticated, anon + '
    'allowlist de 17 columnas (default-deny por columna), aplicada en LIVE. Esta columna NO entra en '
    'esa allowlist; quien la agregue rompe la metrica.';
