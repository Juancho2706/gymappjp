-- ═══════════════════════════════════════════════════════════════════════════
-- MRR neto: 2 fixes (auditoria panel CEO 2026-08-05)
--   Bug 1: el MRR sumaba precio de lista ignorando cupones vivos (coupon_redemptions).
--   Bug 2: el filtro `subscription_mp_id IS NOT NULL` excluia a los coaches Flow
--          (dual-gateway): pagaban y no aparecian en MRR/ARPC/conteos.
-- Regla de redondeo = la del motor de cobro (evidencia billing_snapshots):
--   descuento = round(precio * pct/100); neto = precio - descuento.
-- Validado contra cobros reales pre-migracion: netos 29990/22492/14995/29990, total 97467.
-- Espejo TS: apps/web/src/services/billing/mrr.service.ts — mantener en sync.
-- Aplicada en LIVE via MCP apply_migration (version 20260805211332); este archivo es el espejo local.
-- ═══════════════════════════════════════════════════════════════════════════

-- Precio mensual de lista por tier. UNICA copia SQL (antes habia 3 CASE duplicados).
-- Mantener en sync con TIER_CONFIG de packages/tiers/index.ts.
CREATE OR REPLACE FUNCTION public.admin_tier_monthly_price_clp(p_tier text)
RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE p_tier
        WHEN 'starter' THEN 19990
        WHEN 'pro'     THEN 29990
        WHEN 'elite'   THEN 44990
        WHEN 'growth'  THEN 84990
        WHEN 'scale'   THEN 190000
        ELSE 0
    END::numeric
$$;

-- Neto MENSUALIZADO por coach: precio de ciclo (con descuento de ciclo -10%/-20%,
-- BILLING_CYCLE_CONFIG) menos el cupon vivo, dividido por meses del ciclo.
-- Cupon target 'module' NO descuenta la base; ciclos agotados (rem <= 0) = sin descuento.
CREATE OR REPLACE FUNCTION public.admin_coach_net_monthly_clp(
    p_tier text,
    p_billing_cycle text,
    p_redemption_id uuid
)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    WITH price AS (
        SELECT
            public.admin_tier_monthly_price_clp(p_tier) AS monthly,
            CASE COALESCE(p_billing_cycle, 'monthly') WHEN 'quarterly' THEN 3 WHEN 'annual' THEN 12 ELSE 1 END AS months,
            CASE COALESCE(p_billing_cycle, 'monthly') WHEN 'quarterly' THEN 0.10 WHEN 'annual' THEN 0.20 ELSE 0::numeric END AS cycle_disc
    ), cyc AS (
        SELECT months, round(monthly * months * (1 - cycle_disc)) AS cycle_price FROM price
    ), disc AS (
        SELECT r.discount_value_snapshot AS snap, r.applied_cycles_remaining AS rem
        FROM public.coupon_redemptions r
        WHERE r.id = p_redemption_id AND r.status = 'active'
    )
    SELECT round(
        CASE
            WHEN d.snap IS NULL OR (d.rem IS NOT NULL AND d.rem <= 0) OR (d.snap->>'target') = 'module'
                THEN c.cycle_price
            WHEN d.snap->>'type' = 'percent'
                THEN c.cycle_price - round(c.cycle_price * (d.snap->>'value')::numeric / 100)
            WHEN d.snap->>'type' = 'fixed_clp'
                THEN greatest(c.cycle_price - round((d.snap->>'value')::numeric), 0)
            ELSE c.cycle_price
        END / c.months
    )
    FROM cyc c LEFT JOIN disc d ON true
$$;

-- Helpers internos del panel (los llaman los RPCs SECURITY DEFINER / service-role).
REVOKE EXECUTE ON FUNCTION public.admin_tier_monthly_price_clp(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_coach_net_monthly_clp(text, text, uuid) FROM anon, authenticated;

-- ── RPC 1/3: serie MRR 12 meses (neto + Flow) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.get_platform_mrr_12_months()
 RETURNS TABLE(ym text, mrr_clp numeric, coach_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
    WITH months AS (
        SELECT date_trunc('month', timezone('utc', now()))
               - (interval '1 month' * gs) AS m
        FROM generate_series(11, 0, -1) AS gs
    )
    SELECT
        to_char(m.m, 'YYYY-MM') AS ym,
        COALESCE(SUM(public.admin_coach_net_monthly_clp(
            c.subscription_tier, c.billing_cycle, c.active_coupon_redemption_id
        )), 0)::numeric AS mrr_clp,
        COUNT(c.id)::bigint AS coach_count
    FROM months m
    LEFT JOIN public.coaches c
        ON c.subscription_status = 'active'
        AND (
            (c.payment_provider = 'mercadopago' AND c.subscription_mp_id IS NOT NULL)
            OR (c.payment_provider = 'flow' AND c.subscription_provider_external_id IS NOT NULL)
        )
        AND c.created_at <= (m.m + interval '1 month')
        AND (c.current_period_end IS NULL OR c.current_period_end >= m.m)
    LEFT JOIN auth.users u ON u.id = c.id
    WHERE c.id IS NULL
       OR u.email IS NULL
       OR (u.email NOT ILIKE '%@evatest.cl'
           AND lower(u.email) <> 'juanmvr2706@gmail.com')
    GROUP BY m.m
    ORDER BY m.m;
$function$;

-- ── RPC 2/3: MRR por ciclo (neto + Flow) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_platform_revenue_by_cycle()
 RETURNS TABLE(billing_cycle text, mrr_clp numeric, coach_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
    SELECT
        COALESCE(c.billing_cycle, 'monthly') AS billing_cycle,
        SUM(public.admin_coach_net_monthly_clp(
            c.subscription_tier, c.billing_cycle, c.active_coupon_redemption_id
        ))::numeric AS mrr_clp,
        COUNT(c.id)::bigint AS coach_count
    FROM public.coaches c
    LEFT JOIN auth.users u ON u.id = c.id
    WHERE c.subscription_status = 'active'
      AND (
          (c.payment_provider = 'mercadopago' AND c.subscription_mp_id IS NOT NULL)
          OR (c.payment_provider = 'flow' AND c.subscription_provider_external_id IS NOT NULL)
      )
      AND (u.email IS NULL OR (u.email NOT ILIKE '%@evatest.cl' AND lower(u.email) <> 'juanmvr2706@gmail.com'))
    GROUP BY c.billing_cycle
    ORDER BY mrr_clp DESC;
$function$;

-- ── RPC 3/3: MRR por tier (neto + Flow) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_platform_revenue_by_tier()
 RETURNS TABLE(tier text, mrr_clp numeric, coach_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
    SELECT
        c.subscription_tier AS tier,
        SUM(public.admin_coach_net_monthly_clp(
            c.subscription_tier, c.billing_cycle, c.active_coupon_redemption_id
        ))::numeric AS mrr_clp,
        COUNT(c.id)::bigint AS coach_count
    FROM public.coaches c
    LEFT JOIN auth.users u ON u.id = c.id
    WHERE c.subscription_status = 'active'
      AND c.subscription_tier IS NOT NULL
      AND (
          (c.payment_provider = 'mercadopago' AND c.subscription_mp_id IS NOT NULL)
          OR (c.payment_provider = 'flow' AND c.subscription_provider_external_id IS NOT NULL)
      )
      AND (u.email IS NULL OR (u.email NOT ILIKE '%@evatest.cl' AND lower(u.email) <> 'juanmvr2706@gmail.com'))
    GROUP BY c.subscription_tier
    ORDER BY mrr_clp DESC;
$function$;

-- (Aplicado como migracion separada 20260805212650_revoke_public_execute_mrr_helpers en LIVE:)
-- El grant implicito a PUBLIC dejaba EXECUTE via herencia a anon/authenticated pese al
-- revoke directo. Los helpers quedan solo para service_role/postgres (SECURITY DEFINER chain).
REVOKE ALL ON FUNCTION public.admin_tier_monthly_price_clp(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_coach_net_monthly_clp(text, text, uuid) FROM PUBLIC;
