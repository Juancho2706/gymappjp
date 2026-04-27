-- Admin Phase 2: Finanzas + Auditoria RPCs

-- ============================================================
-- CHURN MONTHLY (12 months)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_platform_churn_monthly()
RETURNS TABLE (ym text, churned_count bigint)
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
        COUNT(c.id)::bigint AS churned_count
    FROM months m
    LEFT JOIN public.coaches c
        ON c.subscription_status IN ('canceled', 'expired')
        AND date_trunc('month', c.updated_at) = m.m
    GROUP BY m.m
    ORDER BY m.m;
$$;

-- ============================================================
-- AUDIT LOGS PAGINATED
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_admin_audit_logs_paginated(
    p_action  text    DEFAULT NULL,
    p_from    timestamptz DEFAULT NULL,
    p_to      timestamptz DEFAULT NULL,
    p_target  text    DEFAULT NULL,
    p_limit   integer DEFAULT 50,
    p_offset  integer DEFAULT 0
)
RETURNS TABLE (
    id           uuid,
    admin_email  text,
    action       text,
    target_table text,
    target_id    text,
    payload      jsonb,
    ip_address   text,
    created_at   timestamptz,
    total_count  bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT
        id,
        admin_email,
        action,
        target_table,
        target_id,
        payload,
        ip_address,
        created_at,
        COUNT(*) OVER()::bigint AS total_count
    FROM public.admin_audit_logs
    WHERE
        (p_action IS NULL OR action = p_action)
        AND (p_from   IS NULL OR created_at >= p_from)
        AND (p_to     IS NULL OR created_at <= p_to)
        AND (p_target IS NULL OR target_id = p_target)
    ORDER BY created_at DESC
    LIMIT p_limit OFFSET p_offset;
$$;

-- ============================================================
-- REVENUE BY BILLING CYCLE (for donut)
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
    GROUP BY billing_cycle
    ORDER BY mrr_clp DESC;
$$;

-- ============================================================
-- REVENUE BY TIER (for horizontal bar)
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
    GROUP BY subscription_tier
    ORDER BY mrr_clp DESC;
$$;
