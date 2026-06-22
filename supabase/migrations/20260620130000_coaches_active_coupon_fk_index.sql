-- MIGRATION — FK-covering index sobre coaches.active_coupon_redemption_id (F1 follow-up)
-- Aditiva, idempotente, forward-only. El audit 2026-06-20 detecto que la migracion de cupones
-- 20260620120000_discount_codes.sql agrego la FK coaches.active_coupon_redemption_id -> coupon_redemptions(id)
-- pero NO su indice de cobertura → get_advisors performance reporta 1 unindexed_foreign_key (WARN),
-- violando el baseline del repo (unindexed_foreign_key = ZERO) y el DoD de F1 (task 11).
-- Se separa de la migracion original porque esa ya esta APLICADA en prod (CREATE INDEX IF NOT EXISTS
-- no se re-ejecuta). Este slot es posterior al head 20260620120000 → replays en orden.
--
-- Rollback (forward-only; NO ejecutar salvo emergencia):
--   DROP INDEX IF EXISTS public.coaches_active_coupon_redemption_idx;

CREATE INDEX IF NOT EXISTS coaches_active_coupon_redemption_idx
  ON public.coaches (active_coupon_redemption_id);
