-- coach_email_ledger: dedupe atómico por (coach_id, template_key).
--
-- Hallazgo de la revisión adversarial de W2 (2026-08-22): el dedupe de `scheduleCoachEmail` era
-- SELECT-y-después-INSERT sin respaldo de la DB. Dos ejecuciones concurrentes (doble clic en el link
-- de confirmación ⇒ dos GET a /auth/confirm antes de que commitee el UPDATE a `pending_email`)
-- mandaban el drip dos veces. Con este índice único parcial el segundo INSERT falla con 23505 y el
-- service lo trata como `deduped` (y cancela en Resend el agendado que acaba de crear).
--
-- Parcial: `failed` queda fuera a propósito — un correo que nunca salió debe poder reintentarse.
-- Aditiva e idempotente. La tabla nació vacía el 22-08 00:42Z, así que no hay filas que violen el índice.
create unique index if not exists coach_email_ledger_dedupe_uidx
    on public.coach_email_ledger (coach_id, template_key)
    where status <> 'failed';

comment on index public.coach_email_ledger_dedupe_uidx is
    'Dedupe atómico del ledger de correos: un solo correo vivo (no failed) por coach y template_key.';
