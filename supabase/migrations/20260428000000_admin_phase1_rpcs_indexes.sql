-- Admin Phase 1: Performance indexes + dashboard RPCs + coaches paginated RPC

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_workout_logs_logged_at_recent
    ON public.workout_logs (logged_at DESC)
    WHERE logged_at >= (now() - interval '30 days');

CREATE INDEX IF NOT EXISTS idx_coaches_updated_at_status
    ON public.coaches (updated_at DESC)
    WHERE subscription_status IN ('canceled', 'expired', 'trialing');

CREATE INDEX IF NOT EXISTS idx_coaches_payment_provider_period
    ON public.coaches (payment_provider, current_period_end);

-- ============================================================
-- DASHBOARD RPCs
-- ============================================================

-- MRR by month (12 months) — approximated from coaches table
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
        AND c.created_at <= (m.m + interval '1 month')
        AND (c.current_period_end IS NULL OR c.current_period_end >= m.m)
    GROUP BY m.m
    ORDER BY m.m;
$$;

-- Coaches by tier per month (6 months stacked bar)
CREATE OR REPLACE FUNCTION public.get_platform_coaches_by_tier_monthly()
RETURNS TABLE (ym text, tier text, coach_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH months AS (
        SELECT date_trunc('month', timezone('utc', now()))
               - (interval '1 month' * gs) AS m
        FROM generate_series(5, 0, -1) AS gs
    )
    SELECT
        to_char(m.m, 'YYYY-MM') AS ym,
        c.subscription_tier AS tier,
        COUNT(c.id)::bigint AS coach_count
    FROM months m
    JOIN public.coaches c
        ON c.subscription_status IN ('active', 'trialing')
        AND c.created_at <= (m.m + interval '1 month')
        AND (c.current_period_end IS NULL OR c.current_period_end >= m.m)
    GROUP BY m.m, c.subscription_tier
    ORDER BY m.m, c.subscription_tier;
$$;

-- Check-ins last 7 days (platform-wide)
CREATE OR REPLACE FUNCTION public.get_platform_checkins_7d()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT COUNT(*)::bigint
    FROM public.check_ins
    WHERE created_at >= now() - interval '7 days';
$$;

-- Churn last 30 days (coaches moved to canceled/expired)
CREATE OR REPLACE FUNCTION public.get_platform_churn_last_30d()
RETURNS TABLE (coach_id uuid, coach_name text, tier text, churned_at timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT
        c.id AS coach_id,
        c.full_name AS coach_name,
        c.subscription_tier AS tier,
        c.updated_at AS churned_at
    FROM public.coaches c
    WHERE c.subscription_status IN ('canceled', 'expired')
      AND c.updated_at >= now() - interval '30 days'
    ORDER BY c.updated_at DESC;
$$;

-- ============================================================
-- COACHES PAGINATED RPC (replaces N+1 client queries)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_admin_coaches_paginated(
    p_search  text    DEFAULT NULL,
    p_status  text    DEFAULT NULL,
    p_tier    text    DEFAULT NULL,
    p_beta    boolean DEFAULT NULL,
    p_sort    text    DEFAULT 'created_at',
    p_dir     text    DEFAULT 'desc',
    p_limit   integer DEFAULT 50,
    p_offset  integer DEFAULT 0
)
RETURNS TABLE (
    id                  uuid,
    full_name           text,
    brand_name          text,
    slug                text,
    subscription_tier   text,
    subscription_status text,
    billing_cycle       text,
    payment_provider    text,
    max_clients         integer,
    current_period_end  timestamptz,
    trial_ends_at       timestamptz,
    created_at          timestamptz,
    client_count        bigint,
    active_client_count bigint,
    days_until_expiry   integer,
    utilization_pct     numeric,
    last_activity_at    timestamptz,
    total_count         bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH base AS (
        SELECT
            c.id,
            c.full_name,
            c.brand_name,
            c.slug,
            c.subscription_tier,
            c.subscription_status,
            c.billing_cycle,
            c.payment_provider,
            c.max_clients,
            c.current_period_end,
            c.trial_ends_at,
            c.created_at,
            COUNT(cl.id)::bigint                                        AS client_count,
            COUNT(cl.id) FILTER (WHERE cl.is_active = true)::bigint     AS active_client_count,
            CASE
                WHEN c.current_period_end IS NOT NULL
                    THEN EXTRACT(day FROM c.current_period_end - now())::integer
                WHEN c.trial_ends_at IS NOT NULL
                    THEN EXTRACT(day FROM c.trial_ends_at - now())::integer
                ELSE NULL
            END AS days_until_expiry,
            CASE
                WHEN c.max_clients > 0
                    THEN ROUND((COUNT(cl.id)::numeric / c.max_clients) * 100, 1)
                ELSE 0
            END AS utilization_pct,
            MAX(wl.logged_at)                                           AS last_activity_at,
            COUNT(*) OVER()::bigint                                     AS total_count
        FROM public.coaches c
        LEFT JOIN public.clients cl ON cl.coach_id = c.id
        LEFT JOIN public.workout_logs wl
            ON wl.client_id = cl.id
            AND wl.logged_at >= now() - interval '30 days'
        WHERE
            (p_search IS NULL OR
             c.full_name  ILIKE '%' || p_search || '%' OR
             c.brand_name ILIKE '%' || p_search || '%' OR
             c.slug       ILIKE '%' || p_search || '%')
            AND (p_status IS NULL OR c.subscription_status = p_status)
            AND (p_tier   IS NULL OR c.subscription_tier   = p_tier)
            AND (p_beta   IS NULL OR (p_beta = true AND c.payment_provider = 'beta')
                                  OR (p_beta = false AND c.payment_provider != 'beta'))
        GROUP BY c.id
    )
    SELECT * FROM base
    ORDER BY
        CASE WHEN p_sort = 'created_at'  AND p_dir = 'desc' THEN created_at            END DESC NULLS LAST,
        CASE WHEN p_sort = 'created_at'  AND p_dir = 'asc'  THEN created_at            END ASC  NULLS LAST,
        CASE WHEN p_sort = 'expiry'      AND p_dir = 'asc'  THEN days_until_expiry::float END ASC  NULLS LAST,
        CASE WHEN p_sort = 'expiry'      AND p_dir = 'desc' THEN days_until_expiry::float END DESC NULLS LAST,
        CASE WHEN p_sort = 'clients'     AND p_dir = 'desc' THEN client_count::float   END DESC NULLS LAST,
        CASE WHEN p_sort = 'clients'     AND p_dir = 'asc'  THEN client_count::float   END ASC  NULLS LAST,
        CASE WHEN p_sort = 'utilization' AND p_dir = 'desc' THEN utilization_pct       END DESC NULLS LAST,
        CASE WHEN p_sort = 'health'      AND p_dir = 'desc' THEN utilization_pct       END DESC NULLS LAST,
        created_at DESC
    LIMIT p_limit OFFSET p_offset;
$$;
