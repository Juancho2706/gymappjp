-- admin_audit_logs: índice compuesto para las lecturas «ledger» por acción + objetivo.
--
-- Hasta hoy la tabla solo tenía índices por `action`, `admin_email` y `created_at desc`. Dos
-- consumidores nuevos la leen como libro mayor filtrando por (action, target_id, created_at):
--   · el cron `cap-nudge` (W1 del embudo Free→Pro): envíos previos del correo de cupo por coach;
--   · el reenvío de confirmación móvil (W4): cooldown 60 s + tope diario por uid, en un endpoint
--     sin autenticar que corre esa query como PRIMERA operación.
-- Sin índice por `target_id` cada request era un scan por `action`; la tabla no se purga nunca.
-- Aditiva e idempotente.
create index if not exists admin_audit_logs_action_target_created_idx
    on public.admin_audit_logs (action, target_id, created_at desc);
