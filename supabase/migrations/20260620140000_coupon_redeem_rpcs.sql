-- MIGRATION — RPCs de canje de cupón: claim/release del cap global atómico (F3)
-- Aditiva, idempotente, forward-only. El cap global (coupon_codes.redeemed_count < max_redemptions)
-- NO se puede enforcar atómicamente vía PostgREST (no compara columna-vs-columna en un filtro) → se
-- hace en SQL: UPDATE ... WHERE redeemed_count < max_redemptions RETURNING (TOCTOU fix, plan F3 task 3).
-- SECURITY DEFINER + search_path=public; EXECUTE SOLO service_role (el redeem corre service-role).
--
-- Rollback (forward-only; NO ejecutar salvo emergencia):
--   DROP FUNCTION IF EXISTS public.claim_coupon_code(uuid);
--   DROP FUNCTION IF EXISTS public.release_coupon_code(uuid);

-- Reclama 1 cupo del cap global de forma atómica. Devuelve true si quedaba cupo (incrementó), false si
-- el código está lleno/inactivo. max_redemptions NULL = sin tope (siempre reclama si está activo).
CREATE OR REPLACE FUNCTION public.claim_coupon_code(p_code_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_claimed integer;
BEGIN
  UPDATE public.coupon_codes
  SET redeemed_count = redeemed_count + 1
  WHERE id = p_code_id
    AND active
    AND (max_redemptions IS NULL OR redeemed_count < max_redemptions)
  RETURNING 1 INTO v_claimed;
  RETURN v_claimed IS NOT NULL;
END;
$fn$;
COMMENT ON FUNCTION public.claim_coupon_code(uuid) IS 'Reclama atómicamente 1 cupo del cap global de un coupon_code (TOCTOU fix, F3). true=reclamado, false=lleno/inactivo. Service-role only.';

-- Libera 1 cupo (compensación si el INSERT de la redención falla tras reclamar). No baja de 0.
CREATE OR REPLACE FUNCTION public.release_coupon_code(p_code_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.coupon_codes
  SET redeemed_count = GREATEST(redeemed_count - 1, 0)
  WHERE id = p_code_id;
END;
$fn$;
COMMENT ON FUNCTION public.release_coupon_code(uuid) IS 'Compensa (decrementa) 1 cupo si el INSERT de la redención falla tras claim_coupon_code (F3). Service-role only.';

-- EXECUTE solo service_role (el canje corre con service-role; authenticated jamás llama estos RPCs).
REVOKE ALL ON FUNCTION public.claim_coupon_code(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_coupon_code(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_coupon_code(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_coupon_code(uuid) TO service_role;
