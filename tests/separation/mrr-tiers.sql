-- ============================================================================
-- Plan 04 · F4.6 — Suite SQL del gate para la migración de MRR/tiers
--   (20260612130000_fix_mrr_rpcs_consolidated_tiers.sql).
--
-- Valida sobre DATA SINTÉTICA, sin dejar rastro:
--   - cada RPC de MRR devuelve el precio correcto por tier (incluye los LEGACY
--     growth=84990, scale=190000 — el bug pre-existente que la migración cierra);
--   - un coach team_managed con tier scale suma $0 (lo excluye el filtro de status);
--   - get_legacy_tier_counts() refleja la data legacy insertada y NO cuenta los
--     tiers de venta (starter/pro/elite/free);
--   - el UPDATE de F4.5 (techo elite 100) es no-op al correrlo una 2ª vez (pin de
--     idempotencia) y respeta overrides manuales del admin (max_clients ≠ 60).
--
-- Read-only respecto a la DB: TODO ocurre dentro de una transacción que termina en
-- ROLLBACK. Nada se persiste. Apto para correr en el branch efímero del gate.
-- Esperado: una fila final 'MRR TIERS OK'. Cualquier violación → RAISE EXCEPTION.
--
-- ⚠️ NO EJECUTAR fuera del gate autorizado (regla 2026-06-10: Playwright/SQL contra
--    Supabase solo al cierre del plan y con OK explícito del dueño).
--
-- Requiere rol con escritura en auth.users + public.coaches (postgres/service via
-- MCP execute_sql en el branch). Los UUIDs de prueba van bajo el namespace fijo
-- 0000aaaa-… para no colisionar con data real.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  -- UUIDs sintéticos estables (namespace de prueba; rollback al final).
  u_starter   uuid := '0000aaaa-0000-0000-0000-000000000001';
  u_pro       uuid := '0000aaaa-0000-0000-0000-000000000002';
  u_elite     uuid := '0000aaaa-0000-0000-0000-000000000003';
  u_growth    uuid := '0000aaaa-0000-0000-0000-000000000004';
  u_scale     uuid := '0000aaaa-0000-0000-0000-000000000005';
  u_scale_tm  uuid := '0000aaaa-0000-0000-0000-000000000006'; -- team_managed, NO debe sumar
  u_elite_60  uuid := '0000aaaa-0000-0000-0000-000000000007'; -- elite active max_clients=60 → sube a 100
  u_elite_ovr uuid := '0000aaaa-0000-0000-0000-000000000008'; -- elite con override admin (45) → NO se toca

  v_mrr        numeric;
  v_cnt        bigint;
  v_n          int;
BEGIN
  -- ----------------------------------------------------------------------
  -- Setup: auth.users (FK coaches_id_fkey) + coaches sintéticos.
  -- payment_provider 'mercadopago' (no excluido) y subscription_mp_id set para
  -- contar en los RPCs (filtro de la migración).
  -- ----------------------------------------------------------------------
  INSERT INTO auth.users (id, instance_id, aud, role, email)
  SELECT v.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.id::text || '@mrr-test.invalid'
  FROM (VALUES (u_starter),(u_pro),(u_elite),(u_growth),(u_scale),(u_scale_tm),(u_elite_60),(u_elite_ovr)) AS v(id);

  INSERT INTO public.coaches
    (id, slug, full_name, brand_name, subscription_status, subscription_tier,
     subscription_mp_id, max_clients, billing_cycle, payment_provider, current_period_end)
  VALUES
    (u_starter, 'mrr-test-starter', 'T Starter', 'T Starter', 'active', 'starter', 'mp_s', 10, 'monthly',   'mercadopago', now() + interval '30 days'),
    (u_pro,     'mrr-test-pro',     'T Pro',     'T Pro',     'active', 'pro',     'mp_p', 30, 'monthly',   'mercadopago', now() + interval '30 days'),
    (u_elite,   'mrr-test-elite',   'T Elite',   'T Elite',   'active', 'elite',   'mp_e', 60, 'annual',    'mercadopago', now() + interval '30 days'),
    (u_growth,  'mrr-test-growth',  'T Growth',  'T Growth',  'active', 'growth',  'mp_g', 120,'quarterly', 'mercadopago', now() + interval '30 days'),
    (u_scale,   'mrr-test-scale',   'T Scale',   'T Scale',   'active', 'scale',   'mp_x', 500,'annual',    'mercadopago', now() + interval '30 days'),
    -- team_managed placeholder con tier scale: NO debe sumar MRR (status ≠ active, sin mp_id).
    (u_scale_tm,'mrr-test-scale-tm','T Scale TM','T Scale TM','team_managed','scale', NULL, 500,'monthly',  'admin',       NULL),
    -- elite active a 60 → debe subir a 100 con el UPDATE F4.5.
    (u_elite_60,'mrr-test-elite-60','T Elite 60','T Elite 60','active','elite',    'mp_e60', 60,'monthly',  'mercadopago', now() + interval '30 days'),
    -- elite con override admin (45) → el UPDATE F4.5 NO debe tocarlo (predicado = 60).
    (u_elite_ovr,'mrr-test-elite-ovr','T Elite Ovr','T Elite Ovr','active','elite','mp_eovr',45,'monthly', 'mercadopago', now() + interval '30 days');

  -- ======================================================================
  -- A) get_platform_revenue_by_tier: precio exacto por tier.
  -- ======================================================================
  SELECT mrr_clp, coach_count INTO v_mrr, v_cnt FROM public.get_platform_revenue_by_tier() WHERE tier = 'starter';
  IF v_mrr <> 19990 OR v_cnt <> 1 THEN RAISE EXCEPTION 'A FAIL starter: mrr=% cnt=% (esperado 19990/1)', v_mrr, v_cnt; END IF;

  SELECT mrr_clp INTO v_mrr FROM public.get_platform_revenue_by_tier() WHERE tier = 'pro';
  IF v_mrr <> 29990 THEN RAISE EXCEPTION 'A FAIL pro: mrr=% (esperado 29990)', v_mrr; END IF;

  -- elite: u_elite + u_elite_60 + u_elite_ovr = 3 filas activas × 44990.
  SELECT mrr_clp, coach_count INTO v_mrr, v_cnt FROM public.get_platform_revenue_by_tier() WHERE tier = 'elite';
  IF v_mrr <> 44990 * 3 OR v_cnt <> 3 THEN RAISE EXCEPTION 'A FAIL elite: mrr=% cnt=% (esperado 134970/3)', v_mrr, v_cnt; END IF;

  -- growth LEGACY: el bug pre-existente lo computaba en $0; ahora 84990.
  SELECT mrr_clp INTO v_mrr FROM public.get_platform_revenue_by_tier() WHERE tier = 'growth';
  IF v_mrr <> 84990 THEN RAISE EXCEPTION 'A FAIL growth (LEGACY): mrr=% (esperado 84990; bug viejo daba 0)', v_mrr; END IF;

  -- scale LEGACY: el bug pre-existente lo computaba en 64990; ahora 190000.
  -- Solo el scale ACTIVE (u_scale) cuenta; el team_managed (u_scale_tm) NO aparece.
  SELECT mrr_clp, coach_count INTO v_mrr, v_cnt FROM public.get_platform_revenue_by_tier() WHERE tier = 'scale';
  IF v_mrr <> 190000 OR v_cnt <> 1 THEN RAISE EXCEPTION 'A FAIL scale (LEGACY): mrr=% cnt=% (esperado 190000/1; bug viejo daba 64990)', v_mrr, v_cnt; END IF;

  -- El team_managed scale NO debe figurar como fila de tier 'scale' con 2 coaches:
  -- (ya validado arriba por cnt=1). Pin explícito: no hay fila con su status.
  IF EXISTS (
    SELECT 1 FROM public.coaches c
    WHERE c.id = u_scale_tm AND c.subscription_status = 'active'
  ) THEN RAISE EXCEPTION 'A FAIL: el placeholder team_managed quedó marcado active (setup corrupto)'; END IF;

  -- ======================================================================
  -- B) get_platform_revenue_by_cycle: el total por ciclo usa el mismo CASE.
  --    monthly = starter(19990)+pro(29990)+elite_60(44990)+elite_ovr(44990) = 139960.
  -- ======================================================================
  SELECT mrr_clp, coach_count INTO v_mrr, v_cnt FROM public.get_platform_revenue_by_cycle() WHERE billing_cycle = 'monthly';
  IF v_mrr <> 19990 + 29990 + 44990 + 44990 OR v_cnt <> 4 THEN
    RAISE EXCEPTION 'B FAIL monthly: mrr=% cnt=% (esperado 139960/4)', v_mrr, v_cnt;
  END IF;
  -- annual = elite(44990) + scale(190000) = 234990.
  SELECT mrr_clp INTO v_mrr FROM public.get_platform_revenue_by_cycle() WHERE billing_cycle = 'annual';
  IF v_mrr <> 44990 + 190000 THEN RAISE EXCEPTION 'B FAIL annual: mrr=% (esperado 234990)', v_mrr; END IF;
  -- quarterly = growth(84990).
  SELECT mrr_clp INTO v_mrr FROM public.get_platform_revenue_by_cycle() WHERE billing_cycle = 'quarterly';
  IF v_mrr <> 84990 THEN RAISE EXCEPTION 'B FAIL quarterly: mrr=% (esperado 84990)', v_mrr; END IF;

  -- ======================================================================
  -- C) get_platform_mrr_12_months: el mes actual incluye todo lo activo creado hoy.
  --    Total = starter+pro+3×elite+growth+scale = 19990+29990+134970+84990+190000 = 459940.
  -- ======================================================================
  SELECT mrr_clp INTO v_mrr FROM public.get_platform_mrr_12_months()
  WHERE ym = to_char(date_trunc('month', timezone('utc', now())), 'YYYY-MM');
  IF v_mrr <> 19990 + 29990 + (44990*3) + 84990 + 190000 THEN
    RAISE EXCEPTION 'C FAIL mes actual: mrr=% (esperado 459940)', v_mrr;
  END IF;

  -- ======================================================================
  -- D) get_legacy_tier_counts: refleja la data legacy y NO cuenta tiers de venta.
  -- ======================================================================
  -- growth/active/quarterly = 1
  SELECT coach_count INTO v_cnt FROM public.get_legacy_tier_counts()
  WHERE tier = 'growth' AND subscription_status = 'active' AND billing_cycle = 'quarterly';
  IF v_cnt IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'D FAIL growth/active/quarterly: cnt=% (esperado 1)', v_cnt; END IF;

  -- scale/active/annual = 1 (u_scale)
  SELECT coach_count INTO v_cnt FROM public.get_legacy_tier_counts()
  WHERE tier = 'scale' AND subscription_status = 'active' AND billing_cycle = 'annual';
  IF v_cnt IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'D FAIL scale/active/annual: cnt=% (esperado 1)', v_cnt; END IF;

  -- scale/team_managed/monthly = 1 (u_scale_tm) — el placeholder SALE visible, distinguible por status.
  SELECT coach_count INTO v_cnt FROM public.get_legacy_tier_counts()
  WHERE tier = 'scale' AND subscription_status = 'team_managed' AND billing_cycle = 'monthly';
  IF v_cnt IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'D FAIL scale/team_managed/monthly: cnt=% (esperado 1)', v_cnt; END IF;

  -- NO debe haber NINGUNA fila de tiers de venta en el RPC legacy.
  SELECT count(*) INTO v_n FROM public.get_legacy_tier_counts()
  WHERE tier IN ('free', 'starter', 'pro', 'elite');
  IF v_n <> 0 THEN RAISE EXCEPTION 'D FAIL: get_legacy_tier_counts devolvió % filas de tiers de venta (esperado 0)', v_n; END IF;

  -- ======================================================================
  -- E) F4.5 — UPDATE techo elite 100: idempotencia + respeto de overrides.
  -- ======================================================================
  -- 1ª corrida: u_elite (60→100), u_elite_60 (60→100) suben; u_elite_ovr (45) NO.
  UPDATE public.coaches
  SET max_clients = 100
  WHERE subscription_tier = 'elite'
    AND subscription_status IN ('active', 'trialing', 'canceled', 'past_due', 'paused')
    AND max_clients = 60;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 2 THEN RAISE EXCEPTION 'E FAIL 1ª corrida: filas afectadas=% (esperado 2: u_elite + u_elite_60)', v_n; END IF;

  -- 2ª corrida: no-op (todos ya en 100 o con override ≠ 60).
  UPDATE public.coaches
  SET max_clients = 100
  WHERE subscription_tier = 'elite'
    AND subscription_status IN ('active', 'trialing', 'canceled', 'past_due', 'paused')
    AND max_clients = 60;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'E FAIL 2ª corrida (idempotencia): filas afectadas=% (esperado 0)', v_n; END IF;

  -- El override admin (45) sobrevivió intacto.
  SELECT max_clients INTO v_n FROM public.coaches WHERE id = u_elite_ovr;
  IF v_n <> 45 THEN RAISE EXCEPTION 'E FAIL override: u_elite_ovr.max_clients=% (esperado 45, no debió tocarse)', v_n; END IF;

  -- Confirmar los bumps.
  SELECT count(*) INTO v_n FROM public.coaches WHERE id IN (u_elite, u_elite_60) AND max_clients = 100;
  IF v_n <> 2 THEN RAISE EXCEPTION 'E FAIL bump: % de 2 elite quedaron en 100', v_n; END IF;

  RAISE NOTICE 'MRR TIERS OK';
END $$;

ROLLBACK;

-- Marcador fuera de la transacción (la sentencia siguiente NO toca tablas).
SELECT 'MRR TIERS OK' AS result;
