-- Pedido del owner 25-08 (noche): el listado de coaches del panel admin debe poder
-- ordenarse por ultima actividad (mayor a menor). Se agregan dos sorts a la RPC:
-- 'activity' = coach_last_active_at (ultima vez que el COACH entro) y
-- 'student_activity' = last_activity_at (ultimo workout de sus alumnos, 30d).
-- Mismo tipo de retorno; solo ORDER BY (CREATE OR REPLACE sin DROP, ACL intacta).
CREATE OR REPLACE FUNCTION public.get_admin_coaches_paginated(p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_tier text DEFAULT NULL::text, p_beta boolean DEFAULT NULL::boolean, p_sort text DEFAULT 'created_at'::text, p_dir text DEFAULT 'desc'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, full_name text, brand_name text, slug text, subscription_tier text, subscription_status text, billing_cycle text, payment_provider text, max_clients integer, current_period_end timestamp with time zone, trial_ends_at timestamp with time zone, created_at timestamp with time zone, client_count bigint, active_client_count bigint, days_until_expiry integer, utilization_pct numeric, last_activity_at timestamp with time zone, coach_last_active_at timestamp with time zone, auth_email text, total_count bigint, demo_client_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
            COUNT(DISTINCT cl.id)::bigint                                                       AS client_count,
            COUNT(DISTINCT cl.id) FILTER (WHERE cl.is_active = true)::bigint                   AS active_client_count,
            CASE
                WHEN c.current_period_end IS NOT NULL
                    THEN EXTRACT(day FROM c.current_period_end - now())::integer
                WHEN c.trial_ends_at IS NOT NULL
                    THEN EXTRACT(day FROM c.trial_ends_at - now())::integer
                ELSE NULL
            END AS days_until_expiry,
            CASE
                WHEN c.max_clients > 0
                    THEN ROUND((COUNT(DISTINCT cl.id)::numeric / c.max_clients) * 100, 1)
                ELSE 0
            END AS utilization_pct,
            MAX(wl.logged_at)                                           AS last_activity_at,
            COALESCE(c.last_active_at, u.last_sign_in_at)              AS coach_last_active_at,
            u.email                                                     AS auth_email,
            COUNT(*) OVER()::bigint                                     AS total_count,
            COUNT(DISTINCT dcl.id)::bigint                              AS demo_client_count
        FROM public.coaches c
        LEFT JOIN auth.users u ON u.id = c.id
        LEFT JOIN public.clients cl
            ON cl.coach_id = c.id
            AND COALESCE(cl.is_demo, false) = false
            AND COALESCE(cl.is_archived, false) = false
        LEFT JOIN public.clients dcl
            ON dcl.coach_id = c.id
            AND dcl.is_demo = true
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
        GROUP BY c.id, u.last_sign_in_at, u.email
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
        CASE WHEN p_sort = 'activity'          AND p_dir = 'desc' THEN coach_last_active_at END DESC NULLS LAST,
        CASE WHEN p_sort = 'activity'          AND p_dir = 'asc'  THEN coach_last_active_at END ASC  NULLS LAST,
        CASE WHEN p_sort = 'student_activity'  AND p_dir = 'desc' THEN last_activity_at     END DESC NULLS LAST,
        CASE WHEN p_sort = 'student_activity'  AND p_dir = 'asc'  THEN last_activity_at     END ASC  NULLS LAST,
        created_at DESC
    LIMIT p_limit OFFSET p_offset;
$function$;
