-- MIGRATION — allowlist de correos por cupón (REGISTER-CODE R1.0). Aditiva, idempotente, forward-only.
-- El deal "20% forever a coaches selectos" restringe el canje a una lista CERRADA de correos. Un cupón
-- con >= 1 fila acá SOLO lo canjean esos correos (normalizados anti +alias/gmail-dots). Cupones sin
-- filas acá se comportan como hoy (abiertos). Escritura solo service-role (catálogo, sin SELECT auth).
--
-- Rollback (forward-only; NO ejecutar salvo emergencia):
--   DROP TABLE IF EXISTS public.coupon_allowed_emails;

CREATE TABLE IF NOT EXISTS public.coupon_allowed_emails (
  coupon_id        uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  normalized_email text NOT NULL,                 -- normalizeEmailForFirstTime (lowercase, sin dots/+alias gmail)
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coupon_id, normalized_email)        -- el PK cubre la FK coupon_id (leftmost) + el lookup del canje
);
COMMENT ON TABLE public.coupon_allowed_emails IS 'Allowlist de correos por cupón (REGISTER-CODE R1.0): si existe >=1 fila, SOLO esos correos canjean. Email ya normalizado. Service-role only.';

-- RLS service-role-only (espejo del catálogo de cupones): REVOKE ALL → GRANT solo service_role.
ALTER TABLE public.coupon_allowed_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coupon_allowed_emails FROM anon;
REVOKE ALL ON public.coupon_allowed_emails FROM authenticated;
GRANT ALL ON public.coupon_allowed_emails TO service_role;
