-- =============================================================================
-- COACH CARD METADATA — grants-drift assertion (companion de la migracion
-- 20260615120000_coach_card_metadata.sql).
-- Suite de LECTURA (no escribe data). Se ejecuta en el GATE, contra el branch efimero DONDE la
-- migracion 20260615120000_coach_card_metadata.sql YA esta aplicada (el merge re-ejecuta el
-- historial; en el branch las columnas/grants ya viven).
--
-- Patron de tests/separation/module-grants.sql §CASO11: chequea drift de grants contra
-- information_schema.column_privileges. Aqui el invariante es la AUSENCIA: las columnas
-- card_last4 / card_brand / card_payment_method_id son DISPLAY-ONLY, service-role-write-only,
-- y por lo tanto NO deben aparecer entre los UPDATE grants de `authenticated` (default DENY por
-- no estar en el allowlist de columnas de `coaches`).
--
-- Resultado esperado: una fila 'ALL CARD-METADATA GRANTS TESTS PASSED'. Un FAIL hace RAISE EXCEPTION.
--
-- Gotcha PostgreSQL: `REVOKE UPDATE(col)` es no-op si el grant original era de tabla; el patron
-- correcto (ya aplicado en 20260611120000) es REVOKE UPDATE ON tabla + GRANT UPDATE(allowlist).
-- Como las columnas card_* simplemente nunca entraron al allowlist, su default es DENY.
-- =============================================================================

BEGIN;

-- ---- AUSENCIA: ninguna columna card_* tiene UPDATE para `authenticated` -----------------------
-- El set de columnas con UPDATE para `authenticated` en coaches NO debe contener ninguna card_*.
-- Si una migracion futura las agregara al allowlist por error, este caso lo detecta como drift.
DO $$
DECLARE
  v_leaked text[];
BEGIN
  SELECT array_agg(column_name ORDER BY column_name) INTO v_leaked
  FROM information_schema.column_privileges
  WHERE table_schema='public' AND table_name='coaches'
    AND grantee='authenticated' AND privilege_type='UPDATE'
    AND column_name IN ('card_last4','card_brand','card_payment_method_id');
  IF v_leaked IS NOT NULL THEN
    RAISE EXCEPTION 'CARD-GRANTS FAIL: authenticated tiene UPDATE sobre columnas card_* (display-only/service-role-write-only): %', v_leaked;
  END IF;
END $$;

SELECT 'ALL CARD-METADATA GRANTS TESTS PASSED' AS result;
ROLLBACK;
