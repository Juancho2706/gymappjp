-- Add coach_last_login_at to get_admin_coaches_paginated
-- Requires SECURITY DEFINER + auth in search_path to access auth.users.last_sign_in_at

DROP FUNCTION IF EXISTS public.get_admin_coaches_paginated(text,text,text,boolean,text,text,integer,integer);

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
    id                   uuid,
    full_name            text,
    brand_name           text,
    slug                 text,
    subscription_tier    text,
    subscription_status  text,
    billing_cycle        text,
    payment_provider     text,
    max_clients          integer,
    current_period_end   timestamptz,
    trial_ends_at        timestamptz,
    created_at           timestamptz,
    client_count         bigint,
    active_client_count  bigint,
    days_until_expiry    integer,
    utilization_pct      numeric,
    last_activity_at     timestamptz,
    coach_last_login_at  timestamptz,
    total_count          bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
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
            u.last_sign_in_at                                           AS coach_last_login_at,
            COUNT(*) OVER()::bigint                                     AS total_count
        FROM public.coaches c
        LEFT JOIN auth.users u ON u.id = c.id
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
        GROUP BY c.id, u.last_sign_in_at
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
