-- MIGRATION — discount codes / cupones (F1, specs/discount-codes/EXECUTION-PLAN.md)
-- Aditiva, idempotente, forward-only. Espejo del hardening de coach_addons (20260613151100):
-- ALTER DEFAULT PRIVILEGES del proyecto otorga ALL a authenticated/anon en TODA tabla nueva de
-- public → REVOKE ALL antes del GRANT minimo (solo SELECT propio en el ledger; cero SELECT en el
-- catalogo). Toda escritura = service-role. Auditoria DB 2026-06-20 foldeada: search_path en
-- funciones DEFINER, RPC sin param (auth.uid() interno, anti-IDOR), FK-covering index en cada FK,
-- ledger inmutable via trigger, FK circular coaches<->redemptions (SET NULL / RESTRICT).
--
-- Rollback (forward-only; NO ejecutar salvo emergencia — deja la DB inerte sin esto):
--   DROP TRIGGER IF EXISTS trg_coupon_redemptions_sync ON public.coupon_redemptions;
--   DROP TRIGGER IF EXISTS trg_coupon_redemptions_immutable ON public.coupon_redemptions;
--   DROP FUNCTION IF EXISTS public.sync_coach_active_coupon();
--   DROP FUNCTION IF EXISTS public.guard_coupon_redemption_immutable();
--   DROP FUNCTION IF EXISTS public.resolve_active_discount();
--   ALTER TABLE public.coaches DROP COLUMN IF EXISTS active_coupon_redemption_id;
--   DROP TABLE IF EXISTS public.coupon_cycle_decrements;
--   DROP TABLE IF EXISTS public.coupon_redemptions;
--   DROP TABLE IF EXISTS public.coupon_codes;
--   DROP TABLE IF EXISTS public.coupons;

-- ============================================================================
-- (1) coupons — definicion del descuento (escritura solo service-role)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.coupons (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_kind          text NOT NULL DEFAULT 'single' CHECK (code_kind IN ('single','unique_batch')),
  discount_type      text NOT NULL CHECK (discount_type IN ('percent','fixed_clp')),
  percent_value      integer CHECK (percent_value IS NULL OR (percent_value BETWEEN 1 AND 100)),
  amount_off_clp     integer CHECK (amount_off_clp IS NULL OR amount_off_clp >= 0),
  fixed_clp_target   text NOT NULL DEFAULT 'base' CHECK (fixed_clp_target IN ('base','module','total')),
  duration           text NOT NULL CHECK (duration IN ('once','repeating','forever')),
  duration_in_cycles integer CHECK (duration_in_cycles IS NULL OR duration_in_cycles >= 1),
  applies_to_scope   jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { tiers:[], module_keys:[] }; {} = base/total
  max_redemptions    integer CHECK (max_redemptions IS NULL OR max_redemptions >= 0),
  redeem_by          timestamptz,
  currency           text NOT NULL DEFAULT 'CLP',
  stackable          boolean NOT NULL DEFAULT false,
  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- XOR: exactamente un valor segun el tipo
  CONSTRAINT coupons_value_xor CHECK (
    (discount_type = 'percent'   AND percent_value IS NOT NULL AND amount_off_clp IS NULL) OR
    (discount_type = 'fixed_clp' AND amount_off_clp IS NOT NULL AND percent_value IS NULL)
  ),
  -- duration_in_cycles obligatorio SII repeating
  CONSTRAINT coupons_repeating_cycles CHECK ((duration = 'repeating') = (duration_in_cycles IS NOT NULL)),
  -- 100%-forever NO por el path pago → va por admin_grant (MP rechaza transaction_amount <= 0)
  CONSTRAINT coupons_no_100_forever CHECK (NOT (discount_type = 'percent' AND percent_value = 100 AND duration = 'forever'))
);
COMMENT ON TABLE public.coupons IS 'Definicion del cupon (cupones/discount codes, F1). Escritura SOLO service-role (CEO via /admin). Sin SELECT para authenticated: validacion via RPC SECURITY DEFINER. target=total = % sobre toda la cuenta del coach.';

-- ============================================================================
-- (2) coupon_codes — string canjeable (escritura solo service-role)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.coupon_codes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id           uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  code_normalized     text NOT NULL,                       -- UPPER+trim ya normalizado; unicidad case-insensitive por construccion
  code_display        text,                                -- casing original (vanity)
  active              boolean NOT NULL DEFAULT true,
  expires_at          timestamptz,
  max_redemptions     integer CHECK (max_redemptions IS NULL OR max_redemptions >= 0),
  redeemed_count      integer NOT NULL DEFAULT 0 CHECK (redeemed_count >= 0),  -- contador atomico del cap global (TOCTOU fix)
  per_account_limit   integer NOT NULL DEFAULT 1 CHECK (per_account_limit >= 1),
  first_time_only     boolean NOT NULL DEFAULT false,
  min_amount_clp      integer CHECK (min_amount_clp IS NULL OR min_amount_clp >= 0),
  restricted_to_coach_id uuid REFERENCES public.coaches(id) ON DELETE CASCADE,  -- codigo de partner atado a 1 coach (anti-leak)
  created_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.coupon_codes IS 'String canjeable de un cupon (vanity o random). code_normalized ya viene uppercased → unicidad case-insensitive directa. redeemed_count = contador atomico del cap. Escritura solo service-role.';
-- Unicidad case-insensitive del codigo activo (code_normalized ya esta uppercased → sin lower() wrap, audit perf)
CREATE UNIQUE INDEX IF NOT EXISTS coupon_codes_code_active_uq ON public.coupon_codes (code_normalized) WHERE active;
CREATE INDEX IF NOT EXISTS coupon_codes_coupon_idx ON public.coupon_codes (coupon_id);
CREATE INDEX IF NOT EXISTS coupon_codes_restricted_coach_idx ON public.coupon_codes (restricted_to_coach_id);

-- ============================================================================
-- (3) coupon_redemptions — ledger inmutable append-only (evidencia SERNAC)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id               uuid NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,       -- preservar evidencia
  coupon_code_id          uuid NOT NULL REFERENCES public.coupon_codes(id) ON DELETE RESTRICT,
  coach_id                uuid NOT NULL REFERENCES public.coaches(id) ON DELETE RESTRICT,        -- coaches.id = auth.uid()
  redeemed_at             timestamptz NOT NULL DEFAULT now(),
  status                  text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','reverted')),
  discount_value_snapshot jsonb NOT NULL,                  -- terminos congelados al canje
  applied_cycles_remaining integer,                        -- para repeating; NULL = forever/once
  revoke_effective_at     timestamptz,                     -- revoke future-only honra hasta esta fecha
  billing_snapshot_id     uuid REFERENCES public.billing_snapshots(id) ON DELETE SET NULL,
  first_time_only         boolean NOT NULL DEFAULT false,  -- copiado del code al canje (para el indice parcial)
  normalized_email        text,                            -- email normalizado (anti +alias) para first_time_only
  coupon_terms_version    text,
  coupon_terms_text       text,                            -- copia interpolada del disclosure (evidencia consentimiento)
  source_ip               inet,
  created_at              timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.coupon_redemptions IS 'Ledger inmutable de canjes (evidencia SERNAC). Append-only: trigger guard_coupon_redemption_immutable bloquea DELETE y el cambio de columnas congeladas. 1 sola viva por coach (non-stackable). Escritura solo service-role.';
-- 1 cupon activo por coach (non-stackable v1) — subsume (coupon_id,coach_id) per audit
CREATE UNIQUE INDEX IF NOT EXISTS coupon_redemptions_one_active_per_coach ON public.coupon_redemptions (coach_id) WHERE status = 'active';
-- first_time_only atomico por (cupon, email) — bloquea +alias/gmail dot
CREATE UNIQUE INDEX IF NOT EXISTS coupon_redemptions_first_time_uq ON public.coupon_redemptions (coupon_id, normalized_email) WHERE first_time_only AND status = 'active';
-- FK-covering indexes (audit: baseline mantiene unindexed_foreign_key en CERO)
CREATE INDEX IF NOT EXISTS coupon_redemptions_coupon_idx ON public.coupon_redemptions (coupon_id);
CREATE INDEX IF NOT EXISTS coupon_redemptions_code_idx ON public.coupon_redemptions (coupon_code_id);
CREATE INDEX IF NOT EXISTS coupon_redemptions_coach_idx ON public.coupon_redemptions (coach_id);
CREATE INDEX IF NOT EXISTS coupon_redemptions_snapshot_idx ON public.coupon_redemptions (billing_snapshot_id);

-- ============================================================================
-- (4) coaches.active_coupon_redemption_id — puntero al descuento vivo (rompe FK circular)
--     Service-role-only: NO se agrega al GRANT UPDATE allowlist (plan 03) → coach PATCH = 42501
-- ============================================================================
ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS active_coupon_redemption_id uuid REFERENCES public.coupon_redemptions(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.coaches.active_coupon_redemption_id IS 'Descuento vivo del coach, recomputado por trg_coupon_redemptions_sync. Service-role-only (NO en el GRANT UPDATE allowlist de coaches → authenticated PATCH = 42501).';

-- ============================================================================
-- (5) coupon_cycle_decrements — idempotencia del decremento de ciclos por cobro
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.coupon_cycle_decrements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  redemption_id       uuid NOT NULL REFERENCES public.coupon_redemptions(id) ON DELETE CASCADE,
  provider_payment_id text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupon_cycle_decrements_once UNIQUE (redemption_id, provider_payment_id)
);
COMMENT ON TABLE public.coupon_cycle_decrements IS 'Ledger interno de idempotencia: decrementar applied_cycles_remaining EXACTAMENTE una vez por provider_payment_id. Service-role-only, sin SELECT para authenticated.';
CREATE INDEX IF NOT EXISTS coupon_cycle_decrements_redemption_idx ON public.coupon_cycle_decrements (redemption_id);

-- ============================================================================
-- (6) billing_snapshots — columnas de descuento (nullable/defaulted, back-compat) + kind re-assert
-- ============================================================================
ALTER TABLE public.billing_snapshots ADD COLUMN IF NOT EXISTS base_before_discount_clp integer;
ALTER TABLE public.billing_snapshots ADD COLUMN IF NOT EXISTS discount_clp integer DEFAULT 0;
ALTER TABLE public.billing_snapshots ADD COLUMN IF NOT EXISTS coupon_code text;
ALTER TABLE public.billing_snapshots ADD COLUMN IF NOT EXISTS coupon_redemption_id uuid REFERENCES public.coupon_redemptions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS billing_snapshots_coupon_redemption_idx ON public.billing_snapshots (coupon_redemption_id);
-- kind CHECK forward-only: asegurar los 3 valores (prod ya lo tiene via 20260614120000; re-assert idempotente)
ALTER TABLE public.billing_snapshots DROP CONSTRAINT IF EXISTS billing_snapshots_kind_check;
ALTER TABLE public.billing_snapshots ADD CONSTRAINT billing_snapshots_kind_check
  CHECK (kind IN ('recurring','addon_proration','tier_upgrade_proration'));

-- ============================================================================
-- (7) Trigger de sync: coaches.active_coupon_redemption_id desde la redencion viva
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_coach_active_coupon()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_coach_id uuid := COALESCE(NEW.coach_id, OLD.coach_id);
BEGIN
  UPDATE public.coaches c
  SET active_coupon_redemption_id = (
    SELECT r.id FROM public.coupon_redemptions r
    WHERE r.coach_id = v_coach_id AND r.status = 'active'
    LIMIT 1                                  -- a lo sumo 1 por el indice unico parcial
  )
  WHERE c.id = v_coach_id;
  RETURN NULL;
END;
$fn$;
COMMENT ON FUNCTION public.sync_coach_active_coupon() IS 'Recomputa coaches.active_coupon_redemption_id desde la redencion viva del coach (single-row, indice parcial). COALESCE→NULL cuando no hay. SECURITY DEFINER (la col es service-role-only).';

DROP TRIGGER IF EXISTS trg_coupon_redemptions_sync ON public.coupon_redemptions;
CREATE TRIGGER trg_coupon_redemptions_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.coupon_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_coach_active_coupon();

-- ============================================================================
-- (8) Trigger de inmutabilidad del ledger (SERNAC): bloquea DELETE + cambio de cols congeladas
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guard_coupon_redemption_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'coupon_redemptions es append-only (evidencia SERNAC): DELETE bloqueado';
  END IF;
  -- UPDATE: permitir solo transiciones de estado/ciclos/revoke/snapshot; congelar el resto
  IF NEW.coupon_id IS DISTINCT FROM OLD.coupon_id
     OR NEW.coupon_code_id IS DISTINCT FROM OLD.coupon_code_id
     OR NEW.coach_id IS DISTINCT FROM OLD.coach_id
     OR NEW.redeemed_at IS DISTINCT FROM OLD.redeemed_at
     OR NEW.discount_value_snapshot IS DISTINCT FROM OLD.discount_value_snapshot
     OR NEW.coupon_terms_version IS DISTINCT FROM OLD.coupon_terms_version
     OR NEW.coupon_terms_text IS DISTINCT FROM OLD.coupon_terms_text
     OR NEW.normalized_email IS DISTINCT FROM OLD.normalized_email
     OR NEW.first_time_only IS DISTINCT FROM OLD.first_time_only THEN
    RAISE EXCEPTION 'coupon_redemptions: columnas de evidencia congeladas (solo status/applied_cycles_remaining/revoke_effective_at/billing_snapshot_id son mutables)';
  END IF;
  RETURN NEW;
END;
$fn$;
COMMENT ON FUNCTION public.guard_coupon_redemption_immutable() IS 'Inmutabilidad del ledger SERNAC: bloquea DELETE y el cambio de columnas de evidencia; solo status/applied_cycles_remaining/revoke_effective_at/billing_snapshot_id son mutables (incluso para service-role).';

DROP TRIGGER IF EXISTS trg_coupon_redemptions_immutable ON public.coupon_redemptions;
CREATE TRIGGER trg_coupon_redemptions_immutable
  BEFORE UPDATE OR DELETE ON public.coupon_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.guard_coupon_redemption_immutable();

-- ============================================================================
-- (9) RPC resolve_active_discount — lee SOLO el descuento del caller (anti-IDOR, sin param)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.resolve_active_discount()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'redemption_id', r.id,
    'discount_value_snapshot', r.discount_value_snapshot,
    'applied_cycles_remaining', r.applied_cycles_remaining
  )
  FROM public.coupon_redemptions r
  WHERE r.coach_id = (SELECT auth.uid()) AND r.status = 'active'
  LIMIT 1;
$fn$;
COMMENT ON FUNCTION public.resolve_active_discount() IS 'Devuelve SOLO el descuento congelado del coach autenticado (auth.uid() interno, sin param → anti-IDOR). Usado por subscription-status (cliente user-scoped no puede joinear el catalogo bajo RLS).';
REVOKE ALL ON FUNCTION public.resolve_active_discount() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_active_discount() FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_active_discount() TO authenticated;

-- Las 2 funciones TRIGGER no deben ser ejecutables por RPC (anon/authenticated): los triggers
-- disparan sin chequear EXECUTE. REVOKE del grant default a PUBLIC (silencia el advisor *_security_definer).
REVOKE ALL ON FUNCTION public.sync_coach_active_coupon() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_coupon_redemption_immutable() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- (10) RLS + grants — espejo de coach_addons: REVOKE ALL → GRANT minimo. Escritura solo service-role.
-- ============================================================================
ALTER TABLE public.coupons              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_codes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_cycle_decrements ENABLE ROW LEVEL SECURITY;

-- coupons / coupon_codes: SIN SELECT para authenticated (catalogo no se filtra; validacion via RPC)
REVOKE ALL ON public.coupons FROM anon;            REVOKE ALL ON public.coupons FROM authenticated;
GRANT ALL ON public.coupons TO service_role;
REVOKE ALL ON public.coupon_codes FROM anon;       REVOKE ALL ON public.coupon_codes FROM authenticated;
GRANT ALL ON public.coupon_codes TO service_role;
-- coupon_redemptions: SELECT propio
REVOKE ALL ON public.coupon_redemptions FROM anon; REVOKE ALL ON public.coupon_redemptions FROM authenticated;
GRANT SELECT ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;
-- coupon_cycle_decrements: ledger interno, sin SELECT para authenticated
REVOKE ALL ON public.coupon_cycle_decrements FROM anon; REVOKE ALL ON public.coupon_cycle_decrements FROM authenticated;
GRANT ALL ON public.coupon_cycle_decrements TO service_role;

-- Policies: una sola permissive. coupons/coupon_codes/cycle_decrements = NINGUNA policy para authenticated
-- (RLS on + 0 policy = deny-all a authenticated; service_role bypasea RLS). redemptions = SELECT propio.
DROP POLICY IF EXISTS coupon_redemptions_select_own ON public.coupon_redemptions;
CREATE POLICY coupon_redemptions_select_own ON public.coupon_redemptions AS PERMISSIVE FOR SELECT TO authenticated
  USING (coach_id = (SELECT auth.uid()));

-- ============================================================================
-- (11) Autovacuum del contador caliente (HOT-update por cada canje; espejo de 20260617170346)
-- ============================================================================
ALTER TABLE public.coupon_codes SET (
  autovacuum_vacuum_scale_factor = 0.0,
  autovacuum_vacuum_threshold = 50,
  autovacuum_analyze_scale_factor = 0.02
);
