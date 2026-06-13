-- MIGRATION — coach_addons + billing_snapshots (motor de cobro de add-ons self-service, plan 05)
-- Aditiva, idempotente, forward-only. NO aplicar ahora: entra en el branch efimero del GATE
-- (Director Movida §3), DESPUES de sellar el gate Movida pendiente. Timestamp posterior a 20260611*.
-- Spec: docs/plans/estrategia/05-PLAN-billing-addons-selfservice.md §F1.
--
-- HALLAZGO CLAVE heredado de 20260609054748 (verificado live): el proyecto tiene
-- ALTER DEFAULT PRIVILEGES que otorga ALL a authenticated/anon en TODA tabla nueva de public.
-- Por eso se hace REVOKE ALL antes del GRANT minimo. Aca el minimo es SOLO SELECT:
-- toda escritura queda en service-role (espejo del hardening de enabled_modules, plan 03 / doc fuente §2.2).
--
-- D1: coaches.enabled_modules se SINCRONIZA desde coach_addons via trigger (cero drift por construccion).
-- D2: el override del CEO se modela como fila admin_grant price 0 (no write directo de enabled_modules).
-- enabled_modules quedo bloqueado por column-grant en el plan 03; el trigger es SECURITY DEFINER, escribe igual.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_coach_addons_sync ON public.coach_addons;
--   DROP FUNCTION IF EXISTS public.sync_coach_enabled_modules();
--   DROP TABLE IF EXISTS public.billing_snapshots;
--   DROP TABLE IF EXISTS public.coach_addons;

-- ============================================================================
-- (1) coach_addons — fuente de verdad de entitlements pagados (escritura solo service-role)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.coach_addons (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id            uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  module_key          text NOT NULL CHECK (module_key IN
                        ('cardio','movement_assessment','body_composition','nutrition_exchanges')), -- espejo de MODULE_KEYS (entitlements.service.ts:19-24)
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancel_pending','cancelled')),
  source              text NOT NULL DEFAULT 'self_service' CHECK (source IN ('self_service','admin_grant')),
  price_clp           integer NOT NULL CHECK (price_clp >= 0),     -- precio MENSUAL de lista congelado; 0 en admin_grant
  terms_version       text NOT NULL,
  terms_accepted_at   timestamptz NOT NULL DEFAULT now(),
  activated_at        timestamptz NOT NULL DEFAULT now(),
  first_charged_at    timestamptz,                                 -- set-once por webhook (idempotente: WHERE IS NULL)
  cancel_requested_at timestamptz,
  expires_at          timestamptz,                                 -- fin del periodo ya pagado; al alcanzarse → cancelled
  cancelled_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.coach_addons IS 'Fuente de verdad de entitlements de add-ons del coach standalone (plan 05). Escritura SOLO service-role; el trigger trg_coach_addons_sync recomputa coaches.enabled_modules. source=admin_grant price 0 = cortesia CEO (D2). cancelled es terminal: reactivar crea fila nueva.';

-- 1 fila viva por modulo POR SOURCE: un grant del CEO y un add-on pago del mismo modulo DEBEN coexistir
-- (caso "Admin grant + add-on pago" de la matriz QA y D2). source va en el indice A PROPOSITO.
CREATE UNIQUE INDEX IF NOT EXISTS coach_addons_one_live_per_module
  ON public.coach_addons (coach_id, module_key, source)
  WHERE status IN ('active','cancel_pending');
CREATE INDEX IF NOT EXISTS coach_addons_coach_idx ON public.coach_addons (coach_id);

ALTER TABLE public.coach_addons ENABLE ROW LEVEL SECURITY;
-- Neutralizar el ALTER DEFAULT PRIVILEGES (ALL a authenticated) y dejar SOLO SELECT.
REVOKE ALL ON public.coach_addons FROM anon;
REVOKE ALL ON public.coach_addons FROM authenticated;
GRANT SELECT ON public.coach_addons TO authenticated;
GRANT ALL ON public.coach_addons TO service_role;

-- UNICA policy: SELECT propio (patron initplan, coaches.id = auth.uid()). CERO policies INSERT/UPDATE/DELETE
-- para authenticated → toda escritura solo service-role.
DROP POLICY IF EXISTS coach_addons_select_own ON public.coach_addons;
CREATE POLICY coach_addons_select_own ON public.coach_addons AS PERMISSIVE FOR SELECT TO authenticated
  USING (coach_id = (SELECT auth.uid()));

-- ============================================================================
-- (2) Trigger de sync (D1): coaches.enabled_modules recomputado desde coach_addons en la misma transaccion
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_coach_enabled_modules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_coach_id uuid := COALESCE(NEW.coach_id, OLD.coach_id);
BEGIN
  -- coalesce('{}') OBLIGATORIO: enabled_modules es jsonb NOT NULL y jsonb_object_agg sobre 0 filas vivas
  -- devuelve NULL (cancelar el unico add-on del coach reventaria el UPDATE sin esto).
  UPDATE public.coaches c
  SET enabled_modules = COALESCE(
    (
      SELECT jsonb_object_agg(a.module_key, true)
      FROM public.coach_addons a
      WHERE a.coach_id = v_coach_id
        AND a.status IN ('active','cancel_pending')
    ),
    '{}'::jsonb
  )
  WHERE c.id = v_coach_id;
  RETURN NULL; -- AFTER trigger: el valor de retorno se ignora
END;
$fn$;
COMMENT ON FUNCTION public.sync_coach_enabled_modules() IS 'D1 plan 05: recomputa coaches.enabled_modules desde las filas vivas (active|cancel_pending) de coach_addons. SECURITY DEFINER para escribir aunque enabled_modules este bloqueado por column-grant. Pisa el jsonb completo del coach standalone: tras D2 no quedan escritores legitimos fuera de coach_addons.';

DROP TRIGGER IF EXISTS trg_coach_addons_sync ON public.coach_addons;
CREATE TRIGGER trg_coach_addons_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.coach_addons
  FOR EACH ROW EXECUTE FUNCTION public.sync_coach_enabled_modules();

-- ============================================================================
-- (3) billing_snapshots — evidencia SERNAC del desglose congelado por cobro (escritura solo service-role)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billing_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id            uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  provider_payment_id text NOT NULL UNIQUE,                        -- idempotencia por cobro
  charged_at          timestamptz NOT NULL,
  tier                text,
  billing_cycle       text,
  kind                text NOT NULL CHECK (kind IN ('recurring','addon_proration')),
  base_clp            integer NOT NULL,
  addons              jsonb NOT NULL DEFAULT '[]'::jsonb,          -- [{module_key, price_clp, cycle_amount_clp}]
  total_clp           integer NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.billing_snapshots IS 'Desglose base+add-ons congelado al momento exacto de CADA cobro aprobado (recurrente u one-shot), escrito por el webhook (service-role). Evidencia SERNAC: prueba que se cobro y por que. Idempotente por provider_payment_id.';
CREATE INDEX IF NOT EXISTS billing_snapshots_coach_idx ON public.billing_snapshots (coach_id, charged_at DESC);

ALTER TABLE public.billing_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_snapshots FROM anon;
REVOKE ALL ON public.billing_snapshots FROM authenticated;
GRANT SELECT ON public.billing_snapshots TO authenticated;
GRANT ALL ON public.billing_snapshots TO service_role;

DROP POLICY IF EXISTS billing_snapshots_select_own ON public.billing_snapshots;
CREATE POLICY billing_snapshots_select_own ON public.billing_snapshots AS PERMISSIVE FOR SELECT TO authenticated
  USING (coach_id = (SELECT auth.uid()));
