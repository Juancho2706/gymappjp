-- Fix: sincronizar filtros entre KPIs y gráficos de finanzas
-- Los KPIs filtran subscription_mp_id IS NOT NULL, las RPCs no.
-- Esto causa que coaches "active" sin mp_id (CEOs, test) aparezcan en gráficos.

-- ============================================================
-- MRR 12 MESES
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_platform_mrr_12_months()
RETURNS TABLE (ym text, mrr_clp numeric, coach_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH months AS (
        SELECT date_trunc('month', timezone('utc', now()))
               - (interval '1 month' * gs) AS m
        FROM generate_series(11, 0, -1) AS gs
    )
    SELECT
        to_char(m.m, 'YYYY-MM') AS ym,
        COALESCE(SUM(
            CASE c.subscription_tier
                WHEN 'starter' THEN 19990
                WHEN 'pro'     THEN 29990
                WHEN 'elite'   THEN 44990
                WHEN 'scale'   THEN 64990
                ELSE 0
            END
        ), 0)::numeric AS mrr_clp,
        COUNT(c.id)::bigint AS coach_count
    FROM months m
    LEFT JOIN public.coaches c
        ON c.subscription_status = 'active'
        AND c.payment_provider != 'beta'
        AND c.subscription_mp_id IS NOT NULL
        AND c.created_at <= (m.m + interval '1 month')
        AND (c.current_period_end IS NULL OR c.current_period_end >= m.m)
    GROUP BY m.m
    ORDER BY m.m;
$$;

-- ============================================================
-- REVENUE BY BILLING CYCLE (donut)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_platform_revenue_by_cycle()
RETURNS TABLE (billing_cycle text, mrr_clp numeric, coach_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT
        COALESCE(billing_cycle, 'monthly') AS billing_cycle,
        SUM(
            CASE subscription_tier
                WHEN 'starter' THEN 19990
                WHEN 'pro'     THEN 29990
                WHEN 'elite'   THEN 44990
                WHEN 'scale'   THEN 64990
                ELSE 0
            END
        )::numeric AS mrr_clp,
        COUNT(id)::bigint AS coach_count
    FROM public.coaches
    WHERE subscription_status = 'active'
      AND payment_provider != 'beta'
      AND subscription_mp_id IS NOT NULL
    GROUP BY billing_cycle
    ORDER BY mrr_clp DESC;
$$;

-- ============================================================
-- REVENUE BY TIER (horizontal bar)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_platform_revenue_by_tier()
RETURNS TABLE (tier text, mrr_clp numeric, coach_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT
        subscription_tier AS tier,
        SUM(
            CASE subscription_tier
                WHEN 'starter' THEN 19990
                WHEN 'pro'     THEN 29990
                WHEN 'elite'   THEN 44990
                WHEN 'scale'   THEN 64990
                ELSE 0
            END
        )::numeric AS mrr_clp,
        COUNT(id)::bigint AS coach_count
    FROM public.coaches
    WHERE subscription_status = 'active'
      AND payment_provider != 'beta'
      AND subscription_tier IS NOT NULL
      AND subscription_mp_id IS NOT NULL
    GROUP BY subscription_tier
    ORDER BY mrr_clp DESC;
$$;
