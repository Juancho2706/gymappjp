-- =============================================================================
-- COACH CARD METADATA — columnas DISPLAY-ONLY para la tarjeta de pago del coach.
-- Migracion ADITIVA / idempotente / forward-only (el merge re-ejecuta TODO el historial,
-- ver CLAUDE.md §Supabase): solo ADD COLUMN IF NOT EXISTS. JAMAS DROP/rename destructivo.
--
-- Que se persiste y por que:
--   card_last4              — ultimos 4 digitos (display: "•••• 4242").
--   card_brand              — marca (visa/mastercard/amex/…), para el icono.
--   card_payment_method_id  — id del medio de pago del proveedor (MercadoPago), display/soporte.
-- El TOKEN crudo de la tarjeta NUNCA se persiste (PAN/CVV/expiracion completa quedan fuera de la
-- DB): solo se guardan last4/brand/payment_method_id para mostrar al coach que tiene una tarjeta
-- registrada. Base legal: Ley 19.628 (proteccion de la vida privada / datos personales) — minimizar
-- el dato sensible almacenado.
--
-- HARDENING — service-role-write-only (column-level grants, ver CLAUDE.md §Column-level grants gotcha):
-- `coaches` ya tiene grants de columna (REVOKE UPDATE en la tabla + GRANT UPDATE(allowlist) a
-- `authenticated`). Estas columnas NO se agregan al allowlist -> el default es DENY. NO se emite
-- ningun GRANT UPDATE(card_*) para `authenticated`: solo service-role (el webhook/backend de pagos)
-- las escribe. La suite tests/separation/card-metadata-grants.sql verifica esta ausencia.
-- =============================================================================

ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS card_last4 text;
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS card_brand text;
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS card_payment_method_id text;

COMMENT ON COLUMN public.coaches.card_last4 IS
  'Display-only: ultimos 4 digitos de la tarjeta del coach. Service-role-write-only (no en el allowlist de authenticated). El token crudo NUNCA se persiste — Ley 19.628.';
COMMENT ON COLUMN public.coaches.card_brand IS
  'Display-only: marca de la tarjeta (visa/mastercard/…) para el icono. Service-role-write-only.';
COMMENT ON COLUMN public.coaches.card_payment_method_id IS
  'Display-only: id del medio de pago del proveedor (MercadoPago). Service-role-write-only. NO es el token de la tarjeta.';
