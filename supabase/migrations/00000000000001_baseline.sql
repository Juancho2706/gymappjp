


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."check_platform_email_availability"("p_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
declare
  v_norm text := lower(trim(both from coalesce(p_email, '')));
  v_user_id uuid;
begin
  if v_norm = '' then
    return jsonb_build_object(
      'exists_in_auth', false,
      'is_coach', false,
      'is_client', false,
      'orphan_client_email', false
    );
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(trim(both from coalesce(u.email, ''))) = v_norm
  limit 1;

  if v_user_id is not null then
    return jsonb_build_object(
      'exists_in_auth', true,
      'is_coach', exists (select 1 from public.coaches c where c.id = v_user_id),
      'is_client', exists (select 1 from public.clients cl where cl.id = v_user_id),
      'orphan_client_email', false
    );
  end if;

  if exists (
    select 1 from public.clients cl
    where lower(trim(both from coalesce(cl.email, ''))) = v_norm
  ) then
    return jsonb_build_object(
      'exists_in_auth', false,
      'is_coach', false,
      'is_client', true,
      'orphan_client_email', true
    );
  end if;

  return jsonb_build_object(
    'exists_in_auth', false,
    'is_coach', false,
    'is_client', false,
    'orphan_client_email', false
  );
end;
$$;


ALTER FUNCTION "public"."check_platform_email_availability"("p_email" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_platform_email_availability"("p_email" "text") IS 'Returns whether normalized email exists in auth.users and coach/client flags; orphan_client_email when clients.email matches without auth row.';



CREATE OR REPLACE FUNCTION "public"."get_admin_audit_logs_paginated"("p_action" "text" DEFAULT NULL::"text", "p_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_to" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_target" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "admin_email" "text", "action" "text", "target_table" "text", "target_id" "text", "payload" "jsonb", "ip_address" "text", "created_at" timestamp with time zone, "total_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."get_admin_audit_logs_paginated"("p_action" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_target" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_coaches_paginated"("p_search" "text" DEFAULT NULL::"text", "p_status" "text" DEFAULT NULL::"text", "p_tier" "text" DEFAULT NULL::"text", "p_beta" boolean DEFAULT NULL::boolean, "p_sort" "text" DEFAULT 'created_at'::"text", "p_dir" "text" DEFAULT 'desc'::"text", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "full_name" "text", "brand_name" "text", "slug" "text", "subscription_tier" "text", "subscription_status" "text", "billing_cycle" "text", "payment_provider" "text", "max_clients" integer, "current_period_end" timestamp with time zone, "trial_ends_at" timestamp with time zone, "created_at" timestamp with time zone, "client_count" bigint, "active_client_count" bigint, "days_until_expiry" integer, "utilization_pct" numeric, "last_activity_at" timestamp with time zone, "coach_last_active_at" timestamp with time zone, "auth_email" "text", "total_count" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
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
        created_at DESC
    LIMIT p_limit OFFSET p_offset;
$$;


ALTER FUNCTION "public"."get_admin_coaches_paginated"("p_search" "text", "p_status" "text", "p_tier" "text", "p_beta" boolean, "p_sort" "text", "p_dir" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_client_current_streak"("p_client_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_streak INTEGER := 0;
    v_last_date DATE;
    v_current_date DATE;
    v_activity_dates DATE[];
    v_date DATE;
BEGIN
    -- Get unique activity dates from workout_logs (real data source)
    -- and nutrition_meal_logs via daily_nutrition_logs (real nutrition data source)
    SELECT ARRAY_AGG(activity_date ORDER BY activity_date DESC)
    INTO v_activity_dates
    FROM (
        SELECT DATE(logged_at) AS activity_date
        FROM workout_logs
        WHERE client_id = p_client_id
        UNION
        SELECT dnl.log_date AS activity_date
        FROM nutrition_meal_logs nml
        JOIN daily_nutrition_logs dnl ON nml.daily_log_id = dnl.id
        WHERE dnl.client_id = p_client_id
          AND nml.is_completed = true
    ) sub;

    IF v_activity_dates IS NULL OR array_length(v_activity_dates, 1) = 0 THEN
        RETURN 0;
    END IF;

    v_current_date := CURRENT_DATE;

    -- If most recent activity is older than yesterday, streak is 0
    IF v_activity_dates[1] < v_current_date - INTERVAL '1 day' THEN
        RETURN 0;
    END IF;

    v_last_date := v_activity_dates[1];
    v_streak := 1;

    -- Walk backwards through dates
    FOR i IN 2..array_length(v_activity_dates, 1) LOOP
        v_date := v_activity_dates[i];

        IF v_date = v_last_date - INTERVAL '1 day' THEN
            v_streak := v_streak + 1;
            v_last_date := v_date;
        ELSIF v_date < v_last_date - INTERVAL '1 day' THEN
            EXIT;
        END IF;
    END LOOP;

    RETURN v_streak;
END;
$$;


ALTER FUNCTION "public"."get_client_current_streak"("p_client_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_clients_last_workout_date"("p_client_ids" "uuid"[], "p_since" timestamp with time zone) RETURNS TABLE("client_id" "uuid", "last_logged_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT client_id, MAX(logged_at) AS last_logged_at
    FROM public.workout_logs
    WHERE client_id = ANY(p_client_ids)
      AND logged_at >= p_since
    GROUP BY client_id;
$$;


ALTER FUNCTION "public"."get_clients_last_workout_date"("p_client_ids" "uuid"[], "p_since" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_coach_client_signups_last_6_months"("p_coach_id" "uuid") RETURNS TABLE("ym" "text", "client_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  with months as (
    select date_trunc('month', timezone('utc', now())) - (interval '1 month' * generate_series(5, 0)) as m
  )
  select to_char(months.m, 'YYYY-MM') as ym,
         count(c.id)::bigint as client_count
  from months
  left join public.clients c
    on c.coach_id = p_coach_id
   and date_trunc('month', timezone('utc', c.created_at::timestamptz)) = months.m
  group by months.m
  order by months.m;
$$;


ALTER FUNCTION "public"."get_coach_client_signups_last_6_months"("p_coach_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_coach_clients_streaks"("p_coach_id" "uuid") RETURNS TABLE("client_id" "uuid", "streak" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_coach_id THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        c.id AS client_id,
        COALESCE(public.get_client_current_streak(c.id), 0)::integer AS streak
    FROM public.clients c
    WHERE c.coach_id = p_coach_id;
END;
$$;


ALTER FUNCTION "public"."get_coach_clients_streaks"("p_coach_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_coach_workout_sessions_30d"("p_coach_id" "uuid") RETURNS TABLE("day" "date", "sessions" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_coach_id THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH session_days AS (
        SELECT DISTINCT
            wl.client_id,
            timezone('America/Santiago', wl.logged_at)::date AS day
        FROM public.workout_logs wl
        JOIN public.clients c
          ON c.id = wl.client_id
        WHERE c.coach_id = p_coach_id
          AND wl.logged_at >= now() - interval '30 days'
    )
    SELECT
        sd.day,
        COUNT(*)::integer AS sessions
    FROM session_days sd
    GROUP BY sd.day
    ORDER BY sd.day ASC;
END;
$$;


ALTER FUNCTION "public"."get_coach_workout_sessions_30d"("p_coach_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_platform_checkins_7d"() RETURNS bigint
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
    SELECT COUNT(*)::bigint FROM public.check_ins
    WHERE created_at >= now() - interval '7 days';
$$;


ALTER FUNCTION "public"."get_platform_checkins_7d"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_platform_churn_last_30d"() RETURNS TABLE("coach_id" "uuid", "coach_name" "text", "tier" "text", "churned_at" timestamp with time zone)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
    SELECT
        c.id AS coach_id,
        c.full_name AS coach_name,
        c.subscription_tier AS tier,
        c.updated_at AS churned_at
    FROM public.coaches c
    WHERE c.subscription_status IN ('canceled', 'expired')
      AND c.payment_provider NOT IN ('beta', 'internal')
      AND c.updated_at >= now() - interval '30 days'
    ORDER BY c.updated_at DESC;
$$;


ALTER FUNCTION "public"."get_platform_churn_last_30d"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_platform_churn_monthly"() RETURNS TABLE("ym" "text", "churned_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."get_platform_churn_monthly"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_platform_clients_count"() RETURNS bigint
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT count(*)::bigint FROM public.clients WHERE is_archived = false;
$$;


ALTER FUNCTION "public"."get_platform_clients_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_platform_coach_signups_last_6_months"() RETURNS TABLE("ym" "text", "coach_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH months AS (
    SELECT date_trunc('month', timezone('utc', now())) - (interval '1 month' * generate_series(5, 0)) AS m
  )
  SELECT to_char(months.m, 'YYYY-MM') AS ym,
         count(c.id)::bigint AS coach_count
  FROM months
  LEFT JOIN public.coaches c
    ON date_trunc('month', timezone('utc', c.created_at::timestamptz)) = months.m
  GROUP BY months.m
  ORDER BY months.m;
$$;


ALTER FUNCTION "public"."get_platform_coach_signups_last_6_months"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_platform_coaches_by_tier"() RETURNS TABLE("tier" "text", "coach_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT subscription_tier AS tier,
         count(*)::bigint AS coach_count
  FROM public.coaches
  WHERE subscription_status IN ('active', 'trialing')
  GROUP BY subscription_tier;
$$;


ALTER FUNCTION "public"."get_platform_coaches_by_tier"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_platform_coaches_by_tier_monthly"() RETURNS TABLE("ym" "text", "tier" "text", "coach_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
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
        AND c.payment_provider NOT IN ('beta', 'internal')
        AND c.created_at <= (m.m + interval '1 month')
        AND (c.current_period_end IS NULL OR c.current_period_end >= m.m)
    GROUP BY m.m, c.subscription_tier
    ORDER BY m.m, c.subscription_tier;
$$;


ALTER FUNCTION "public"."get_platform_coaches_by_tier_monthly"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_platform_coaches_count"() RETURNS bigint
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT count(*)::bigint FROM public.coaches;
$$;


ALTER FUNCTION "public"."get_platform_coaches_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_platform_mrr_12_months"() RETURNS TABLE("ym" "text", "mrr_clp" numeric, "coach_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
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
        AND c.payment_provider NOT IN ('beta', 'internal')
        AND c.subscription_mp_id IS NOT NULL
        AND c.created_at <= (m.m + interval '1 month')
        AND (c.current_period_end IS NULL OR c.current_period_end >= m.m)
    GROUP BY m.m
    ORDER BY m.m;
$$;


ALTER FUNCTION "public"."get_platform_mrr_12_months"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_platform_revenue_by_cycle"() RETURNS TABLE("billing_cycle" "text", "mrr_clp" numeric, "coach_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
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
      AND payment_provider NOT IN ('beta', 'internal')
      AND subscription_mp_id IS NOT NULL
    GROUP BY billing_cycle
    ORDER BY mrr_clp DESC;
$$;


ALTER FUNCTION "public"."get_platform_revenue_by_cycle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_platform_revenue_by_tier"() RETURNS TABLE("tier" "text", "mrr_clp" numeric, "coach_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
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
      AND payment_provider NOT IN ('beta', 'internal')
      AND subscription_tier IS NOT NULL
      AND subscription_mp_id IS NOT NULL
    GROUP BY subscription_tier
    ORDER BY mrr_clp DESC;
$$;


ALTER FUNCTION "public"."get_platform_revenue_by_tier"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_platform_subscription_events_series"() RETURNS TABLE("ym" "text", "event_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH months AS (
    SELECT date_trunc('month', timezone('utc', now())) - (interval '1 month' * generate_series(5, 0)) AS m
  )
  SELECT to_char(months.m, 'YYYY-MM') AS ym,
         count(se.id)::bigint AS event_count
  FROM months
  LEFT JOIN public.subscription_events se
    ON date_trunc('month', timezone('utc', se.created_at::timestamptz)) = months.m
   AND se.provider_status = 'authorized'
  GROUP BY months.m
  ORDER BY months.m;
$$;


ALTER FUNCTION "public"."get_platform_subscription_events_series"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_platform_trial_conversion_rate"() RETURNS TABLE("converted" bigint, "total_trials" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    COUNT(CASE WHEN subscription_status = 'active'
               AND payment_provider NOT IN ('beta', 'internal', 'admin')
               THEN 1 END)::bigint AS converted,
    COUNT(CASE WHEN subscription_status IN ('active', 'trialing', 'expired', 'canceled')
               THEN 1 END)::bigint AS total_trials
  FROM coaches
  WHERE created_at >= now() - interval '90 days';
$$;


ALTER FUNCTION "public"."get_platform_trial_conversion_rate"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_platform_workout_sessions_30d"() RETURNS TABLE("day" "text", "sessions" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT to_char(logged_at::date, 'YYYY-MM-DD') AS day,
         count(DISTINCT client_id)::bigint AS sessions
  FROM public.workout_logs
  WHERE logged_at >= now() - interval '30 days'
  GROUP BY logged_at::date
  ORDER BY logged_at::date;
$$;


ALTER FUNCTION "public"."get_platform_workout_sessions_30d"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_workout_program_planned_set_totals"("p_program_ids" "uuid"[]) RETURNS TABLE("program_id" "uuid", "total_planned_sets" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select wp.id as program_id,
         coalesce(sum(wb.sets), 0)::bigint as total_planned_sets
  from (select distinct unnest(p_program_ids) as pid) x
  join public.workout_programs wp on wp.id = x.pid
  left join public.workout_plans wpl on wpl.program_id = wp.id
  left join public.workout_blocks wb on wb.plan_id = wpl.id
  group by wp.id;
$$;


ALTER FUNCTION "public"."get_workout_program_planned_set_totals"("p_program_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."immutable_unaccent"("text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE STRICT PARALLEL SAFE
    AS $_$
  SELECT public.unaccent('public.unaccent', $1)
$_$;


ALTER FUNCTION "public"."immutable_unaccent"("text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."foods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "serving_size" integer NOT NULL,
    "calories" integer NOT NULL,
    "protein_g" integer NOT NULL,
    "carbs_g" integer NOT NULL,
    "fats_g" integer NOT NULL,
    "coach_id" "uuid",
    "serving_unit" "text" DEFAULT 'g'::"text",
    "category" "text" DEFAULT 'otro'::"text",
    "is_liquid" boolean DEFAULT false NOT NULL,
    "brand" "text",
    "name_search" "text" GENERATED ALWAYS AS ("public"."immutable_unaccent"("lower"("name"))) STORED,
    CONSTRAINT "foods_category_check" CHECK (("category" = ANY (ARRAY['proteina'::"text", 'carbohidrato'::"text", 'grasa'::"text", 'lacteo'::"text", 'fruta'::"text", 'verdura'::"text", 'legumbre'::"text", 'bebida'::"text", 'snack'::"text", 'otro'::"text"])))
);


ALTER TABLE "public"."foods" OWNER TO "postgres";


COMMENT ON COLUMN "public"."foods"."serving_size" IS 'Cantidad de la porción en la unidad especificada en serving_unit';



COMMENT ON COLUMN "public"."foods"."serving_unit" IS 'Unidad de medida de la porción (ej: g, ml, unidad)';



CREATE OR REPLACE FUNCTION "public"."search_foods"("search_term" "text") RETURNS SETOF "public"."foods"
    LANGUAGE "plpgsql"
    AS $$
begin
  return query
    select *
    from foods
    where name ilike '%' || search_term || '%';
end;
$$;


ALTER FUNCTION "public"."search_foods"("search_term" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_coach_activity"("p_coach_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    UPDATE public.coaches
    SET last_active_at = NOW()
    WHERE id = p_coach_id
      AND (last_active_at IS NULL OR last_active_at < NOW() - INTERVAL '5 minutes');
$$;


ALTER FUNCTION "public"."touch_coach_activity"("p_coach_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_email" "text" NOT NULL,
    "action" "text" NOT NULL,
    "target_table" "text" NOT NULL,
    "target_id" "text",
    "payload" "jsonb",
    "ip_address" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."beta_invite_registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ip_address" "text" NOT NULL,
    "email" "text" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."beta_invite_registrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."check_ins" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "weight" numeric(5,2),
    "energy_level" integer,
    "front_photo_url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "back_photo_url" "text",
    CONSTRAINT "check_ins_energy_level_check" CHECK ((("energy_level" >= 1) AND ("energy_level" <= 10)))
);


ALTER TABLE "public"."check_ins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_food_preferences" (
    "client_id" "uuid" NOT NULL,
    "food_id" "uuid" NOT NULL,
    "preference_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_food_preferences_preference_type_check" CHECK (("preference_type" = ANY (ARRAY['favorite'::"text", 'dislike'::"text"])))
);


ALTER TABLE "public"."client_food_preferences" OWNER TO "postgres";


COMMENT ON TABLE "public"."client_food_preferences" IS 'Per-client food preference flags: favorite or dislike.';



COMMENT ON COLUMN "public"."client_food_preferences"."food_id" IS 'Catalog foods.id the client marked favorite/dislike.';



CREATE TABLE IF NOT EXISTS "public"."client_intake" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "weight_kg" numeric NOT NULL,
    "height_cm" numeric NOT NULL,
    "goals" "text" NOT NULL,
    "experience_level" "text" NOT NULL,
    "injuries" "text",
    "medical_conditions" "text",
    "availability" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."client_intake" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "service_description" "text" NOT NULL,
    "period_months" integer,
    "payment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "status" "text" DEFAULT 'paid'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."client_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "force_password_change" boolean DEFAULT true NOT NULL,
    "onboarding_completed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT true,
    "phone" character varying(20),
    "subscription_start_date" "date",
    "use_coach_brand_colors" boolean DEFAULT true,
    "goal_weight_kg" numeric(5,2),
    "is_archived" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


COMMENT ON COLUMN "public"."clients"."phone" IS 'Phone number of the client (e.g., +56912345678)';



COMMENT ON COLUMN "public"."clients"."subscription_start_date" IS 'Start date of the current subscription';



COMMENT ON COLUMN "public"."clients"."use_coach_brand_colors" IS 'If true, the student sees the coach''s brand color. If false, they see the default app blue color. Default is true.';



COMMENT ON COLUMN "public"."clients"."is_archived" IS 'When true, client cannot access /c/[slug]. Data preserved. Coach can unarchive at any time.';



CREATE TABLE IF NOT EXISTS "public"."coach_email_drip_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "template_key" "text" NOT NULL,
    "scheduled_day" integer NOT NULL,
    "status" "text" NOT NULL,
    "provider_message_id" "text",
    "error" "text",
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coach_email_drip_events_scheduled_day_check" CHECK (("scheduled_day" = ANY (ARRAY[1, 3, 7, 14]))),
    CONSTRAINT "coach_email_drip_events_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."coach_email_drip_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_onboarding_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "step_key" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coach_onboarding_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['step_completed'::"text", 'step_reopened'::"text", 'aha_moment'::"text"])))
);


ALTER TABLE "public"."coach_onboarding_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coaches" (
    "id" "uuid" NOT NULL,
    "slug" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "brand_name" "text" NOT NULL,
    "primary_color" "text" DEFAULT '#8B5CF6'::"text" NOT NULL,
    "logo_url" "text",
    "subscription_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subscription_tier" "text" DEFAULT 'starter'::"text" NOT NULL,
    "subscription_mp_id" "text",
    "trial_ends_at" timestamp with time zone,
    "trial_used_email" "text",
    "use_brand_colors_coach" boolean DEFAULT false,
    "max_clients" integer DEFAULT 10 NOT NULL,
    "current_period_end" timestamp with time zone,
    "billing_cycle" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "payment_provider" "text" DEFAULT 'mercadopago'::"text" NOT NULL,
    "welcome_message" "text",
    "superseded_mp_preapproval_id" "text",
    "loader_text" "text",
    "use_custom_loader" boolean DEFAULT false NOT NULL,
    "loader_text_color" "text",
    "loader_show_icon" boolean DEFAULT true NOT NULL,
    "slug_changed_at" timestamp with time zone DEFAULT "now"(),
    "previous_slugs" "text"[] DEFAULT '{}'::"text"[],
    "welcome_modal_enabled" boolean DEFAULT false NOT NULL,
    "welcome_modal_content" "text" DEFAULT ''::"text",
    "welcome_modal_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "welcome_modal_version" integer DEFAULT 0 NOT NULL,
    "welcome_modal_updated_at" timestamp with time zone DEFAULT "now"(),
    "loader_icon_mode" "text" DEFAULT 'eva'::"text" NOT NULL,
    "admin_notes" "text",
    "onboarding_guide" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "health_data_consent_at" timestamp with time zone,
    "marketing_consent" boolean DEFAULT false NOT NULL,
    "registration_ip" "text",
    "trial_warning_days_sent" integer[] DEFAULT '{}'::integer[] NOT NULL,
    "last_active_at" timestamp with time zone,
    CONSTRAINT "coaches_billing_cycle_check" CHECK (("billing_cycle" = ANY (ARRAY['monthly'::"text", 'quarterly'::"text", 'annual'::"text"]))),
    CONSTRAINT "coaches_loader_icon_mode_check" CHECK (("loader_icon_mode" = ANY (ARRAY['eva'::"text", 'coach'::"text", 'none'::"text"]))),
    CONSTRAINT "coaches_loader_text_color_hex" CHECK ((("loader_text_color" IS NULL) OR ("loader_text_color" ~ '^#[0-9a-fA-F]{6}$'::"text"))),
    CONSTRAINT "coaches_loader_text_max_length" CHECK (("length"("loader_text") <= 10)),
    CONSTRAINT "coaches_subscription_status_check" CHECK (("subscription_status" = ANY (ARRAY['active'::"text", 'trialing'::"text", 'pending_payment'::"text", 'past_due'::"text", 'canceled'::"text", 'expired'::"text", 'paused'::"text"]))),
    CONSTRAINT "coaches_subscription_tier_check" CHECK (("subscription_tier" = ANY (ARRAY['free'::"text", 'starter'::"text", 'pro'::"text", 'elite'::"text", 'growth'::"text", 'scale'::"text"]))),
    CONSTRAINT "coaches_welcome_modal_type_check" CHECK (("welcome_modal_type" = ANY (ARRAY['text'::"text", 'video'::"text"])))
);


ALTER TABLE "public"."coaches" OWNER TO "postgres";


COMMENT ON COLUMN "public"."coaches"."use_brand_colors_coach" IS 'If true, the coach''s custom brand color will be used in their own dashboard. If false, the default blue will be used.';



COMMENT ON COLUMN "public"."coaches"."loader_text" IS 'Texto que aparece en el loader animado (max 10 chars). Ej: JUAN, FITPRO';



COMMENT ON COLUMN "public"."coaches"."use_custom_loader" IS 'Si true, el loader muestra loader_text en vez de EVA';



COMMENT ON COLUMN "public"."coaches"."loader_text_color" IS 'Color del texto del loader. Si null, usa gradiente por defecto (violet-sky-emerald).';



COMMENT ON COLUMN "public"."coaches"."loader_show_icon" IS 'Si false, el loader no muestra el ícono de EVA, solo el texto.';



COMMENT ON COLUMN "public"."coaches"."slug_changed_at" IS 'Timestamp del último cambio de slug. Usado para restringir cambios a 1 por 30 días.';



COMMENT ON COLUMN "public"."coaches"."previous_slugs" IS 'Array de slugs anteriores. Útil para redirecciones 301 o debugging.';



COMMENT ON COLUMN "public"."coaches"."welcome_modal_enabled" IS 'Si true, el alumno ve un modal de bienvenida al entrar al dashboard.';



COMMENT ON COLUMN "public"."coaches"."welcome_modal_content" IS 'Contenido del modal: texto plano o URL de video (YouTube/Vimeo).';



COMMENT ON COLUMN "public"."coaches"."welcome_modal_type" IS 'Tipo de contenido: text o video.';



COMMENT ON COLUMN "public"."coaches"."welcome_modal_version" IS 'Versión incremental. Se usa para invalidar el dismiss del alumno en localStorage.';



COMMENT ON COLUMN "public"."coaches"."welcome_modal_updated_at" IS 'Última vez que el coach actualizó el mensaje de bienvenida.';



COMMENT ON COLUMN "public"."coaches"."admin_notes" IS 'Internal admin notes — not visible to coach';



COMMENT ON COLUMN "public"."coaches"."onboarding_guide" IS 'JSON: { dismissed?: boolean, completed?: { stepKey: boolean }, ahaMomentSent?: boolean } — guía inicio dashboard coach.';



CREATE TABLE IF NOT EXISTS "public"."daily_habits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "log_date" "date" NOT NULL,
    "water_ml" smallint,
    "steps" integer,
    "sleep_hours" numeric(3,1),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fasting_hours" smallint,
    "supplements" "text"[] DEFAULT '{}'::"text"[],
    CONSTRAINT "daily_habits_fasting_hours_check" CHECK ((("fasting_hours" IS NULL) OR (("fasting_hours" >= 0) AND ("fasting_hours" <= 72)))),
    CONSTRAINT "daily_habits_sleep_hours_check" CHECK ((("sleep_hours" >= (0)::numeric) AND ("sleep_hours" <= (24)::numeric))),
    CONSTRAINT "daily_habits_steps_check" CHECK (("steps" >= 0)),
    CONSTRAINT "daily_habits_water_ml_check" CHECK (("water_ml" >= 0))
);


ALTER TABLE "public"."daily_habits" OWNER TO "postgres";


COMMENT ON TABLE "public"."daily_habits" IS 'Daily habit tracking: water, steps, sleep per client per date.';



CREATE TABLE IF NOT EXISTS "public"."daily_nutrition_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "log_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plan_name_at_log" "text",
    "target_calories_at_log" numeric,
    "target_protein_at_log" numeric,
    "target_carbs_at_log" numeric,
    "target_fats_at_log" numeric
);


ALTER TABLE "public"."daily_nutrition_logs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."daily_nutrition_logs"."plan_name_at_log" IS 'Nombre del plan de nutrición en el momento del log';



COMMENT ON COLUMN "public"."daily_nutrition_logs"."target_calories_at_log" IS 'Calorías objetivo del plan en el momento del log';



CREATE TABLE IF NOT EXISTS "public"."exercises" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "muscle_group" "text" NOT NULL,
    "video_url" "text",
    "coach_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "gif_url" "text",
    "instructions" "text"[],
    "equipment" "text",
    "secondary_muscles" "text"[],
    "body_part" "text",
    "difficulty" "text",
    "gender_focus" "text"
);


ALTER TABLE "public"."exercises" OWNER TO "postgres";


COMMENT ON COLUMN "public"."exercises"."difficulty" IS 'Nivel de dificultad: Principiante, Intermedio, Avanzado';



COMMENT ON COLUMN "public"."exercises"."gender_focus" IS 'Enfoque preferencial por género: Foco Glúteo, Foco Espalda, Neutro';



CREATE TABLE IF NOT EXISTS "public"."exercises_backup_20260405" (
    "id" "uuid",
    "name" "text",
    "muscle_group" "text",
    "video_url" "text",
    "coach_id" "uuid",
    "created_at" timestamp with time zone,
    "gif_url" "text",
    "instructions" "text"[],
    "equipment" "text",
    "secondary_muscles" "text"[],
    "body_part" "text",
    "difficulty" "text",
    "gender_focus" "text"
);


ALTER TABLE "public"."exercises_backup_20260405" OWNER TO "postgres";


COMMENT ON TABLE "public"."exercises_backup_20260405" IS 'Backup of exercises table created on 2026-04-05 before wipe';



CREATE TABLE IF NOT EXISTS "public"."food_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "meal_id" "uuid" NOT NULL,
    "food_id" "uuid" NOT NULL,
    "quantity" integer NOT NULL,
    "unit" "text" DEFAULT 'g'::"text",
    "swap_options" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."food_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."food_items"."swap_options" IS 'JSON array of allowed swap options for this plan item: [{food_id,name,calories,protein_g,carbs_g,fats_g,serving_size,serving_unit}]';



CREATE TABLE IF NOT EXISTS "public"."food_swap_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "food_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."food_swap_groups" OWNER TO "postgres";


COMMENT ON TABLE "public"."food_swap_groups" IS 'Coach-defined groups of interchangeable foods for client plan swaps.';



CREATE TABLE IF NOT EXISTS "public"."nutrition_meal_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "daily_log_id" "uuid" NOT NULL,
    "meal_id" "uuid" NOT NULL,
    "is_completed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "consumed_quantity" numeric(7,4),
    "satisfaction_score" smallint,
    CONSTRAINT "nutrition_meal_logs_consumed_quantity_check" CHECK ((("consumed_quantity" IS NULL) OR (("consumed_quantity" >= (0)::numeric) AND ("consumed_quantity" <= (100)::numeric)))),
    CONSTRAINT "nutrition_meal_logs_satisfaction_score_check" CHECK (("satisfaction_score" = ANY (ARRAY[1, 2, 3])))
);


ALTER TABLE "public"."nutrition_meal_logs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."nutrition_meal_logs"."consumed_quantity" IS 'Porcentaje 0-100 del plan de esta comida consumido; NULL = modo binario (100% si is_completed).';



COMMENT ON COLUMN "public"."nutrition_meal_logs"."satisfaction_score" IS 'Optional meal satisfaction: 1=no me gustó, 2=regular, 3=muy rico. NULL means no feedback.';



CREATE OR REPLACE VIEW "public"."meal_completions" WITH ("security_invoker"='true') AS
 SELECT "nml"."id",
    "dnl"."client_id",
    "nml"."meal_id",
    "dnl"."log_date" AS "date_completed",
    "nml"."created_at"
   FROM ("public"."nutrition_meal_logs" "nml"
     JOIN "public"."daily_nutrition_logs" "dnl" ON (("dnl"."id" = "nml"."daily_log_id")))
  WHERE ("nml"."is_completed" = true);


ALTER VIEW "public"."meal_completions" OWNER TO "postgres";


COMMENT ON VIEW "public"."meal_completions" IS 'Solo lectura: filas derivadas de nutrition_meal_logs completados (reemplazo de tabla legacy).';



CREATE TABLE IF NOT EXISTS "public"."news_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "type" "text" NOT NULL,
    "content" "text" NOT NULL,
    "image_url" "text",
    "cta_url" "text",
    "cta_label" "text",
    "is_pinned" boolean DEFAULT false,
    "status" "text" DEFAULT 'draft'::"text",
    "published_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "news_items_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"]))),
    CONSTRAINT "news_items_type_check" CHECK (("type" = ANY (ARRAY['feature'::"text", 'improvement'::"text", 'fix'::"text", 'announcement'::"text"])))
);


ALTER TABLE "public"."news_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."news_reads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "news_item_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."news_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nutrition_meal_food_swaps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "daily_log_id" "uuid" NOT NULL,
    "meal_id" "uuid" NOT NULL,
    "original_food_id" "uuid" NOT NULL,
    "swapped_food_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "swapped_quantity" numeric(10,2),
    "swapped_unit" "text",
    CONSTRAINT "nutrition_meal_food_swaps_distinct_foods" CHECK (("original_food_id" <> "swapped_food_id")),
    CONSTRAINT "nutrition_meal_food_swaps_quantity_nonnegative" CHECK ((("swapped_quantity" IS NULL) OR ("swapped_quantity" > (0)::numeric))),
    CONSTRAINT "nutrition_meal_food_swaps_unit_valid" CHECK ((("swapped_unit" IS NULL) OR ("swapped_unit" = ANY (ARRAY['g'::"text", 'un'::"text", 'ml'::"text"]))))
);


ALTER TABLE "public"."nutrition_meal_food_swaps" OWNER TO "postgres";


COMMENT ON TABLE "public"."nutrition_meal_food_swaps" IS 'Client food replacements per meal log (swap history state).';



COMMENT ON COLUMN "public"."nutrition_meal_food_swaps"."swapped_quantity" IS 'Optional quantity selected by client for swapped food; NULL means use original item quantity.';



COMMENT ON COLUMN "public"."nutrition_meal_food_swaps"."swapped_unit" IS 'Optional unit selected by client for swapped food; NULL means use original item unit.';



CREATE TABLE IF NOT EXISTS "public"."nutrition_meals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "day_of_week" smallint,
    CONSTRAINT "nutrition_meals_day_of_week_check" CHECK ((("day_of_week" IS NULL) OR (("day_of_week" >= 1) AND ("day_of_week" <= 7))))
);


ALTER TABLE "public"."nutrition_meals" OWNER TO "postgres";


COMMENT ON COLUMN "public"."nutrition_meals"."day_of_week" IS 'Día de la semana (1=Lun … 7=Dom, zona operativa Santiago). NULL = aplica todos los días.';



CREATE TABLE IF NOT EXISTS "public"."nutrition_plan_cycles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "blocks" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_applied_week" integer,
    "last_applied_template_id" "uuid"
);


ALTER TABLE "public"."nutrition_plan_cycles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nutrition_plan_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "nutrition_plan_id" "uuid" NOT NULL,
    "snapshot" "jsonb" NOT NULL,
    "label" "text",
    "source" "text" DEFAULT 'auto_before_save'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."nutrition_plan_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nutrition_plan_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "daily_calories" integer,
    "protein_g" integer,
    "carbs_g" integer,
    "fats_g" integer,
    "instructions" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "goal_type" "text" DEFAULT 'general'::"text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "is_favorite" boolean DEFAULT false,
    CONSTRAINT "nutrition_plan_templates_goal_type_check" CHECK (("goal_type" = ANY (ARRAY['deficit'::"text", 'mantenimiento'::"text", 'volumen'::"text", 'definicion'::"text", 'general'::"text"])))
);


ALTER TABLE "public"."nutrition_plan_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nutrition_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "daily_calories" integer,
    "protein_g" integer,
    "carbs_g" integer,
    "fats_g" integer,
    "instructions" "text",
    "is_active" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "template_id" "uuid",
    "is_custom" boolean DEFAULT false,
    "template_version_id" "uuid"
);


ALTER TABLE "public"."nutrition_plans" OWNER TO "postgres";


COMMENT ON COLUMN "public"."nutrition_plans"."is_custom" IS 'Si es TRUE, el plan ya no se sincroniza con la plantilla maestra al recibir actualizaciones.';



COMMENT ON COLUMN "public"."nutrition_plans"."template_version_id" IS 'Mantiene el vínculo con la versión específica de la plantilla para detectar cambios.';



CREATE TABLE IF NOT EXISTS "public"."personal_gastos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "cantidad" numeric DEFAULT 1 NOT NULL,
    "costo" numeric NOT NULL,
    "pagador" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."personal_gastos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipe_ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipe_id" "uuid" NOT NULL,
    "food_id" "uuid",
    "name" "text" NOT NULL,
    "quantity" numeric NOT NULL,
    "unit" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."recipe_ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "instructions" "text",
    "prep_time_minutes" integer,
    "calories" integer,
    "protein_g" integer,
    "carbs_g" integer,
    "fats_g" integer,
    "source_api" "text",
    "source_api_id" "text",
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_meal_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "saved_meal_id" "uuid" NOT NULL,
    "food_id" "uuid" NOT NULL,
    "quantity" integer NOT NULL,
    "unit" "text" DEFAULT 'g'::"text",
    "swap_options" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."saved_meal_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."saved_meal_items"."swap_options" IS 'JSON array of allowed swap options for this template item: [{food_id,name,calories,protein_g,carbs_g,fats_g,serving_size,serving_unit}]';



CREATE TABLE IF NOT EXISTS "public"."saved_meals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."saved_meals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_event_id" "text",
    "provider_checkout_id" "text",
    "provider_status" "text",
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."subscription_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."template_meal_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_meal_id" "uuid" NOT NULL,
    "saved_meal_id" "uuid" NOT NULL,
    "order_index" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."template_meal_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."template_meals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "day_of_week" smallint,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "template_meals_day_of_week_check" CHECK ((("day_of_week" IS NULL) OR (("day_of_week" >= 1) AND ("day_of_week" <= 7))))
);


ALTER TABLE "public"."template_meals" OWNER TO "postgres";


COMMENT ON COLUMN "public"."template_meals"."day_of_week" IS 'Día de la semana (1=Lun … 7=Dom). NULL = aplica todos los días.';



CREATE TABLE IF NOT EXISTS "public"."workout_blocks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "order_index" integer DEFAULT 0 NOT NULL,
    "sets" integer DEFAULT 3 NOT NULL,
    "reps" "text" DEFAULT '8-10'::"text" NOT NULL,
    "rir" "text",
    "rest_time" "text" DEFAULT '90s'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "target_weight_kg" numeric,
    "tempo" "text",
    "superset_group" "text",
    "progression_type" "text",
    "progression_value" numeric,
    "section" "text" DEFAULT 'main'::"text" NOT NULL,
    "is_override" boolean DEFAULT false NOT NULL,
    CONSTRAINT "workout_blocks_progression_type_check" CHECK (("progression_type" = ANY (ARRAY['weight'::"text", 'reps'::"text"]))),
    CONSTRAINT "workout_blocks_section_check" CHECK (("section" = ANY (ARRAY['warmup'::"text", 'main'::"text", 'cooldown'::"text"])))
);


ALTER TABLE "public"."workout_blocks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."workout_blocks"."section" IS 'warmup | main | cooldown — grouping within a day';



COMMENT ON COLUMN "public"."workout_blocks"."is_override" IS 'If true, block is skipped when syncing from source_template';



CREATE TABLE IF NOT EXISTS "public"."workout_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "block_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "set_number" integer NOT NULL,
    "weight_kg" numeric(6,2),
    "reps_done" integer,
    "rpe" integer,
    "logged_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plan_name_at_log" "text",
    "target_reps_at_log" "text",
    "target_weight_at_log" numeric,
    "exercise_name_at_log" "text",
    "rir" integer,
    CONSTRAINT "workout_logs_rir_check" CHECK ((("rir" >= 0) AND ("rir" <= 10))),
    CONSTRAINT "workout_logs_rpe_check" CHECK ((("rpe" >= 1) AND ("rpe" <= 10)))
);


ALTER TABLE "public"."workout_logs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."workout_logs"."plan_name_at_log" IS 'Nombre del plan de entrenamiento en el momento del log';



CREATE TABLE IF NOT EXISTS "public"."workout_plans" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "client_id" "uuid",
    "coach_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "assigned_date" "date" DEFAULT CURRENT_DATE,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "group_name" "text",
    "program_id" "uuid",
    "day_of_week" integer,
    "week_variant" "text" DEFAULT 'A'::"text",
    CONSTRAINT "workout_plans_day_of_week_check" CHECK ((("day_of_week" >= 1) AND ("day_of_week" <= 7))),
    CONSTRAINT "workout_plans_week_variant_check" CHECK (("week_variant" = ANY (ARRAY['A'::"text", 'B'::"text"])))
);


ALTER TABLE "public"."workout_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "coach_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "weeks_to_repeat" integer DEFAULT 1 NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "duration_type" "text" DEFAULT 'weeks'::"text",
    "duration_days" integer,
    "program_notes" "text",
    "start_date_flexible" boolean DEFAULT false,
    "ab_mode" boolean DEFAULT false,
    "program_structure_type" "text" DEFAULT 'weekly'::"text",
    "cycle_length" integer,
    "program_phases" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "source_template_id" "uuid",
    CONSTRAINT "workout_programs_duration_type_check" CHECK (("duration_type" = ANY (ARRAY['weeks'::"text", 'calendar_days'::"text", 'async'::"text"]))),
    CONSTRAINT "workout_programs_program_structure_type_check" CHECK (("program_structure_type" = ANY (ARRAY['weekly'::"text", 'cycle'::"text"])))
);


ALTER TABLE "public"."workout_programs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."workout_programs"."duration_type" IS 'How program duration is defined: weeks, exact days, or indefinite';



COMMENT ON COLUMN "public"."workout_programs"."duration_days" IS 'Number of exact days when duration_type = days';



COMMENT ON COLUMN "public"."workout_programs"."program_notes" IS 'Global notes visible to the client';



COMMENT ON COLUMN "public"."workout_programs"."start_date_flexible" IS 'If true, client can start the program whenever they want';



COMMENT ON COLUMN "public"."workout_programs"."program_phases" IS 'JSON array: [{name, weeks, color}] — visual macrocycle metadata';



COMMENT ON COLUMN "public"."workout_programs"."source_template_id" IS 'Template this client program was assigned from; used for sync';



CREATE TABLE IF NOT EXISTS "public"."workout_sessions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "plan_id" "uuid",
    "date_completed" "date" DEFAULT CURRENT_DATE NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workout_sessions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_audit_logs"
    ADD CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."beta_invite_registrations"
    ADD CONSTRAINT "beta_invite_registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."check_ins"
    ADD CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_food_preferences"
    ADD CONSTRAINT "client_food_preferences_pkey" PRIMARY KEY ("client_id", "food_id");



ALTER TABLE ONLY "public"."client_intake"
    ADD CONSTRAINT "client_intake_client_id_key" UNIQUE ("client_id");



ALTER TABLE ONLY "public"."client_intake"
    ADD CONSTRAINT "client_intake_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_payments"
    ADD CONSTRAINT "client_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_email_drip_events"
    ADD CONSTRAINT "coach_email_drip_events_coach_id_template_key_key" UNIQUE ("coach_id", "template_key");



ALTER TABLE ONLY "public"."coach_email_drip_events"
    ADD CONSTRAINT "coach_email_drip_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_onboarding_events"
    ADD CONSTRAINT "coach_onboarding_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coaches"
    ADD CONSTRAINT "coaches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coaches"
    ADD CONSTRAINT "coaches_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."daily_habits"
    ADD CONSTRAINT "daily_habits_client_id_log_date_key" UNIQUE ("client_id", "log_date");



ALTER TABLE ONLY "public"."daily_habits"
    ADD CONSTRAINT "daily_habits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_nutrition_logs"
    ADD CONSTRAINT "daily_nutrition_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_nutrition_logs"
    ADD CONSTRAINT "daily_nutrition_logs_unique_date" UNIQUE ("client_id", "plan_id", "log_date");



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."food_items"
    ADD CONSTRAINT "food_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."food_swap_groups"
    ADD CONSTRAINT "food_swap_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."foods"
    ADD CONSTRAINT "foods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news_items"
    ADD CONSTRAINT "news_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news_reads"
    ADD CONSTRAINT "news_reads_coach_id_news_item_id_key" UNIQUE ("coach_id", "news_item_id");



ALTER TABLE ONLY "public"."news_reads"
    ADD CONSTRAINT "news_reads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutrition_meal_food_swaps"
    ADD CONSTRAINT "nutrition_meal_food_swaps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutrition_meal_food_swaps"
    ADD CONSTRAINT "nutrition_meal_food_swaps_unique_per_meal_food" UNIQUE ("daily_log_id", "meal_id", "original_food_id");



ALTER TABLE ONLY "public"."nutrition_meal_logs"
    ADD CONSTRAINT "nutrition_meal_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutrition_meal_logs"
    ADD CONSTRAINT "nutrition_meal_logs_unique_meal" UNIQUE ("daily_log_id", "meal_id");



ALTER TABLE ONLY "public"."nutrition_meals"
    ADD CONSTRAINT "nutrition_meals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutrition_plan_cycles"
    ADD CONSTRAINT "nutrition_plan_cycles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutrition_plan_history"
    ADD CONSTRAINT "nutrition_plan_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutrition_plan_templates"
    ADD CONSTRAINT "nutrition_plan_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutrition_plans"
    ADD CONSTRAINT "nutrition_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personal_gastos"
    ADD CONSTRAINT "personal_gastos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_client_id_endpoint_key" UNIQUE ("client_id", "endpoint");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_meal_items"
    ADD CONSTRAINT "saved_meal_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_meals"
    ADD CONSTRAINT "saved_meals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_events"
    ADD CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_events"
    ADD CONSTRAINT "subscription_events_provider_event_id_key" UNIQUE ("provider_event_id");



ALTER TABLE ONLY "public"."template_meal_groups"
    ADD CONSTRAINT "template_meal_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."template_meals"
    ADD CONSTRAINT "template_meals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_blocks"
    ADD CONSTRAINT "workout_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_logs"
    ADD CONSTRAINT "workout_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_plans"
    ADD CONSTRAINT "workout_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_programs"
    ADD CONSTRAINT "workout_programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "beta_invite_registrations_email_uidx" ON "public"."beta_invite_registrations" USING "btree" ("lower"(TRIM(BOTH FROM "email")));



CREATE UNIQUE INDEX "beta_invite_registrations_ip_uidx" ON "public"."beta_invite_registrations" USING "btree" ("ip_address");



CREATE UNIQUE INDEX "clients_email_norm_uidx" ON "public"."clients" USING "btree" ("lower"(TRIM(BOTH FROM "email")));



CREATE INDEX "coach_email_drip_events_coach_id_idx" ON "public"."coach_email_drip_events" USING "btree" ("coach_id", "created_at" DESC);



CREATE INDEX "coach_onboarding_events_coach_id_idx" ON "public"."coach_onboarding_events" USING "btree" ("coach_id", "created_at" DESC);



CREATE INDEX "foods_name_search_idx" ON "public"."foods" USING "btree" ("name_search");



CREATE INDEX "idx_admin_audit_logs_action" ON "public"."admin_audit_logs" USING "btree" ("action");



CREATE INDEX "idx_admin_audit_logs_admin_email" ON "public"."admin_audit_logs" USING "btree" ("admin_email");



CREATE INDEX "idx_admin_audit_logs_created_at" ON "public"."admin_audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_check_ins_client_id" ON "public"."check_ins" USING "btree" ("client_id");



CREATE INDEX "idx_check_ins_client_id_created_at" ON "public"."check_ins" USING "btree" ("client_id", "created_at" DESC);



CREATE INDEX "idx_check_ins_date" ON "public"."check_ins" USING "btree" ("date");



CREATE INDEX "idx_client_food_prefs_client" ON "public"."client_food_preferences" USING "btree" ("client_id");



CREATE INDEX "idx_client_food_prefs_food" ON "public"."client_food_preferences" USING "btree" ("food_id");



CREATE INDEX "idx_client_payments_coach_id_payment_date" ON "public"."client_payments" USING "btree" ("coach_id", "payment_date" DESC);



CREATE INDEX "idx_clients_coach_archived" ON "public"."clients" USING "btree" ("coach_id", "is_archived");



CREATE INDEX "idx_clients_coach_id" ON "public"."clients" USING "btree" ("coach_id");



CREATE INDEX "idx_clients_coach_id_created_at" ON "public"."clients" USING "btree" ("coach_id", "created_at" DESC);



CREATE INDEX "idx_coaches_expired_period" ON "public"."coaches" USING "btree" ("current_period_end") WHERE (("subscription_status" = ANY (ARRAY['canceled'::"text", 'expired'::"text"])) AND ("current_period_end" IS NOT NULL));



CREATE INDEX "idx_coaches_free_tier" ON "public"."coaches" USING "btree" ("subscription_tier") WHERE ("subscription_tier" = 'free'::"text");



CREATE INDEX "idx_coaches_growth_tier" ON "public"."coaches" USING "btree" ("subscription_tier") WHERE ("subscription_tier" = 'growth'::"text");



CREATE INDEX "idx_coaches_marketing_consent" ON "public"."coaches" USING "btree" ("id") WHERE ("marketing_consent" = true);



CREATE INDEX "idx_coaches_payment_provider_period" ON "public"."coaches" USING "btree" ("payment_provider", "current_period_end");



CREATE INDEX "idx_coaches_slug" ON "public"."coaches" USING "btree" ("slug");



CREATE INDEX "idx_coaches_updated_at_status" ON "public"."coaches" USING "btree" ("updated_at" DESC) WHERE ("subscription_status" = ANY (ARRAY['canceled'::"text", 'expired'::"text", 'trialing'::"text"]));



CREATE INDEX "idx_daily_habits_client_date" ON "public"."daily_habits" USING "btree" ("client_id", "log_date" DESC);



CREATE INDEX "idx_daily_nutrition_logs_client_date" ON "public"."daily_nutrition_logs" USING "btree" ("client_id", "log_date" DESC);



CREATE INDEX "idx_daily_nutrition_logs_client_id_log_date_desc" ON "public"."daily_nutrition_logs" USING "btree" ("client_id", "log_date" DESC);



CREATE INDEX "idx_exercises_coach_id" ON "public"."exercises" USING "btree" ("coach_id");



CREATE INDEX "idx_exercises_coach_muscle_name" ON "public"."exercises" USING "btree" ("coach_id", "muscle_group", "name") WHERE ("coach_id" IS NOT NULL);



CREATE INDEX "idx_exercises_equipment" ON "public"."exercises" USING "btree" ("equipment");



CREATE INDEX "idx_exercises_global_muscle_name" ON "public"."exercises" USING "btree" ("muscle_group", "name") WHERE ("coach_id" IS NULL);



CREATE INDEX "idx_exercises_muscle_group" ON "public"."exercises" USING "btree" ("muscle_group");



CREATE INDEX "idx_food_items_meal_id" ON "public"."food_items" USING "btree" ("meal_id");



CREATE INDEX "idx_food_swap_groups_coach" ON "public"."food_swap_groups" USING "btree" ("coach_id");



CREATE INDEX "idx_foods_category" ON "public"."foods" USING "btree" ("category");



CREATE INDEX "idx_foods_coach_id" ON "public"."foods" USING "btree" ("coach_id");



CREATE INDEX "idx_news_items_pinned" ON "public"."news_items" USING "btree" ("is_pinned") WHERE ("is_pinned" = true);



CREATE INDEX "idx_news_items_status_published" ON "public"."news_items" USING "btree" ("status", "published_at" DESC);



CREATE INDEX "idx_news_reads_coach" ON "public"."news_reads" USING "btree" ("coach_id");



CREATE INDEX "idx_news_reads_news" ON "public"."news_reads" USING "btree" ("news_item_id");



CREATE INDEX "idx_nutrition_meal_food_swaps_client_date" ON "public"."nutrition_meal_food_swaps" USING "btree" ("client_id", "daily_log_id");



CREATE INDEX "idx_nutrition_meal_food_swaps_meal" ON "public"."nutrition_meal_food_swaps" USING "btree" ("meal_id");



CREATE INDEX "idx_nutrition_meals_plan_dow" ON "public"."nutrition_meals" USING "btree" ("plan_id", "day_of_week");



CREATE INDEX "idx_nutrition_plan_cycles_client" ON "public"."nutrition_plan_cycles" USING "btree" ("client_id", "created_at" DESC);



CREATE INDEX "idx_nutrition_plan_cycles_last_applied" ON "public"."nutrition_plan_cycles" USING "btree" ("is_active", "last_applied_week");



CREATE INDEX "idx_nutrition_plan_history_plan_created" ON "public"."nutrition_plan_history" USING "btree" ("nutrition_plan_id", "created_at" DESC);



CREATE INDEX "idx_push_subscriptions_client" ON "public"."push_subscriptions" USING "btree" ("client_id");



CREATE INDEX "idx_subscription_events_coach_id" ON "public"."subscription_events" USING "btree" ("coach_id");



CREATE INDEX "idx_workout_blocks_plan_id" ON "public"."workout_blocks" USING "btree" ("plan_id");



CREATE INDEX "idx_workout_logs_block_id" ON "public"."workout_logs" USING "btree" ("block_id");



CREATE INDEX "idx_workout_logs_client_id_logged_at" ON "public"."workout_logs" USING "btree" ("client_id", "logged_at" DESC);



CREATE INDEX "idx_workout_logs_client_id_logged_at_desc" ON "public"."workout_logs" USING "btree" ("client_id", "logged_at" DESC);



CREATE INDEX "idx_workout_logs_logged_at" ON "public"."workout_logs" USING "btree" ("logged_at" DESC);



CREATE INDEX "idx_workout_plans_client_id" ON "public"."workout_plans" USING "btree" ("client_id");



CREATE INDEX "idx_workout_plans_coach_id" ON "public"."workout_plans" USING "btree" ("coach_id");



CREATE INDEX "idx_workout_plans_group_name" ON "public"."workout_plans" USING "btree" ("group_name");



CREATE INDEX "idx_workout_programs_coach_active_end_date" ON "public"."workout_programs" USING "btree" ("coach_id", "is_active", "end_date") WHERE (("is_active" = true) AND ("end_date" IS NOT NULL));



CREATE INDEX "idx_workout_programs_source_template_id" ON "public"."workout_programs" USING "btree" ("source_template_id");



CREATE INDEX "idx_workout_sessions_client_id" ON "public"."workout_sessions" USING "btree" ("client_id");



CREATE INDEX "idx_workout_sessions_date_completed" ON "public"."workout_sessions" USING "btree" ("date_completed");



CREATE UNIQUE INDEX "nutrition_plan_cycles_one_active_per_client" ON "public"."nutrition_plan_cycles" USING "btree" ("client_id") WHERE ("is_active" = true);



CREATE OR REPLACE TRIGGER "clients_updated_at" BEFORE UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "coaches_updated_at" BEFORE UPDATE ON "public"."coaches" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."client_intake" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."workout_programs" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "workout_plans_updated_at" BEFORE UPDATE ON "public"."workout_plans" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



ALTER TABLE ONLY "public"."beta_invite_registrations"
    ADD CONSTRAINT "beta_invite_registrations_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."check_ins"
    ADD CONSTRAINT "check_ins_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_food_preferences"
    ADD CONSTRAINT "client_food_preferences_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_food_preferences"
    ADD CONSTRAINT "client_food_preferences_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_intake"
    ADD CONSTRAINT "client_intake_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_payments"
    ADD CONSTRAINT "client_payments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_payments"
    ADD CONSTRAINT "client_payments_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_email_drip_events"
    ADD CONSTRAINT "coach_email_drip_events_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_onboarding_events"
    ADD CONSTRAINT "coach_onboarding_events_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coaches"
    ADD CONSTRAINT "coaches_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_habits"
    ADD CONSTRAINT "daily_habits_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_nutrition_logs"
    ADD CONSTRAINT "daily_nutrition_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_nutrition_logs"
    ADD CONSTRAINT "daily_nutrition_logs_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."nutrition_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_items"
    ADD CONSTRAINT "food_items_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id");



ALTER TABLE ONLY "public"."food_items"
    ADD CONSTRAINT "food_items_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "public"."nutrition_meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_swap_groups"
    ADD CONSTRAINT "food_swap_groups_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."foods"
    ADD CONSTRAINT "foods_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id");



ALTER TABLE ONLY "public"."news_items"
    ADD CONSTRAINT "news_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."news_reads"
    ADD CONSTRAINT "news_reads_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."news_reads"
    ADD CONSTRAINT "news_reads_news_item_id_fkey" FOREIGN KEY ("news_item_id") REFERENCES "public"."news_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_meal_food_swaps"
    ADD CONSTRAINT "nutrition_meal_food_swaps_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_meal_food_swaps"
    ADD CONSTRAINT "nutrition_meal_food_swaps_daily_log_id_fkey" FOREIGN KEY ("daily_log_id") REFERENCES "public"."daily_nutrition_logs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_meal_food_swaps"
    ADD CONSTRAINT "nutrition_meal_food_swaps_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "public"."nutrition_meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_meal_food_swaps"
    ADD CONSTRAINT "nutrition_meal_food_swaps_original_food_id_fkey" FOREIGN KEY ("original_food_id") REFERENCES "public"."foods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_meal_food_swaps"
    ADD CONSTRAINT "nutrition_meal_food_swaps_swapped_food_id_fkey" FOREIGN KEY ("swapped_food_id") REFERENCES "public"."foods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_meal_logs"
    ADD CONSTRAINT "nutrition_meal_logs_daily_log_id_fkey" FOREIGN KEY ("daily_log_id") REFERENCES "public"."daily_nutrition_logs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_meal_logs"
    ADD CONSTRAINT "nutrition_meal_logs_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "public"."nutrition_meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_meals"
    ADD CONSTRAINT "nutrition_meals_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."nutrition_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_plan_cycles"
    ADD CONSTRAINT "nutrition_plan_cycles_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_plan_cycles"
    ADD CONSTRAINT "nutrition_plan_cycles_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_plan_cycles"
    ADD CONSTRAINT "nutrition_plan_cycles_last_applied_template_id_fkey" FOREIGN KEY ("last_applied_template_id") REFERENCES "public"."nutrition_plan_templates"("id");



ALTER TABLE ONLY "public"."nutrition_plan_history"
    ADD CONSTRAINT "nutrition_plan_history_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_plan_history"
    ADD CONSTRAINT "nutrition_plan_history_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_plan_history"
    ADD CONSTRAINT "nutrition_plan_history_nutrition_plan_id_fkey" FOREIGN KEY ("nutrition_plan_id") REFERENCES "public"."nutrition_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_plan_templates"
    ADD CONSTRAINT "nutrition_plan_templates_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_plans"
    ADD CONSTRAINT "nutrition_plans_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_plans"
    ADD CONSTRAINT "nutrition_plans_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id");



ALTER TABLE ONLY "public"."nutrition_plans"
    ADD CONSTRAINT "nutrition_plans_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."nutrition_plan_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_meal_items"
    ADD CONSTRAINT "saved_meal_items_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_meal_items"
    ADD CONSTRAINT "saved_meal_items_saved_meal_id_fkey" FOREIGN KEY ("saved_meal_id") REFERENCES "public"."saved_meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_meals"
    ADD CONSTRAINT "saved_meals_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id");



ALTER TABLE ONLY "public"."subscription_events"
    ADD CONSTRAINT "subscription_events_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."template_meal_groups"
    ADD CONSTRAINT "template_meal_groups_saved_meal_id_fkey" FOREIGN KEY ("saved_meal_id") REFERENCES "public"."saved_meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."template_meal_groups"
    ADD CONSTRAINT "template_meal_groups_template_meal_id_fkey" FOREIGN KEY ("template_meal_id") REFERENCES "public"."template_meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."template_meals"
    ADD CONSTRAINT "template_meals_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."nutrition_plan_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_blocks"
    ADD CONSTRAINT "workout_blocks_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."workout_blocks"
    ADD CONSTRAINT "workout_blocks_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."workout_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_logs"
    ADD CONSTRAINT "workout_logs_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "public"."workout_blocks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_logs"
    ADD CONSTRAINT "workout_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_plans"
    ADD CONSTRAINT "workout_plans_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_plans"
    ADD CONSTRAINT "workout_plans_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_plans"
    ADD CONSTRAINT "workout_plans_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."workout_programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_programs"
    ADD CONSTRAINT "workout_programs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_programs"
    ADD CONSTRAINT "workout_programs_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_programs"
    ADD CONSTRAINT "workout_programs_source_template_id_fkey" FOREIGN KEY ("source_template_id") REFERENCES "public"."workout_programs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."workout_plans"("id") ON DELETE SET NULL;



CREATE POLICY "Anyone can read global or coach exercises" ON "public"."exercises" FOR SELECT USING (true);



CREATE POLICY "Anyone can view global foods" ON "public"."foods" FOR SELECT USING (("coach_id" IS NULL));



CREATE POLICY "Client can manage their own check-ins" ON "public"."check_ins" USING (("auth"."uid"() = "client_id"));



CREATE POLICY "Client can manage their own daily nutrition logs" ON "public"."daily_nutrition_logs" USING (("auth"."uid"() = "client_id"));



CREATE POLICY "Client can manage their own intake" ON "public"."client_intake" USING (("auth"."uid"() = "client_id"));



CREATE POLICY "Client can manage their own meal logs" ON "public"."nutrition_meal_logs" USING ((EXISTS ( SELECT 1
   FROM "public"."daily_nutrition_logs"
  WHERE (("daily_nutrition_logs"."id" = "nutrition_meal_logs"."daily_log_id") AND ("daily_nutrition_logs"."client_id" = "auth"."uid"())))));



CREATE POLICY "Client can manage their own workout logs" ON "public"."workout_logs" USING (("auth"."uid"() = "client_id"));



CREATE POLICY "Client can update their own profile" ON "public"."clients" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Client can view their own profile" ON "public"."clients" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Client can view their own workout blocks" ON "public"."workout_blocks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."workout_plans"
  WHERE (("workout_plans"."id" = "workout_blocks"."plan_id") AND ("workout_plans"."client_id" = "auth"."uid"())))));



CREATE POLICY "Client can view their own workout plans" ON "public"."workout_plans" FOR SELECT USING (("auth"."uid"() = "client_id"));



CREATE POLICY "Clients can insert own intake" ON "public"."client_intake" FOR INSERT WITH CHECK (("auth"."uid"() = "client_id"));



CREATE POLICY "Clients can see their own food items" ON "public"."food_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."nutrition_meals"
     JOIN "public"."nutrition_plans" ON (("nutrition_plans"."id" = "nutrition_meals"."plan_id")))
  WHERE (("nutrition_meals"."id" = "food_items"."meal_id") AND ("nutrition_plans"."client_id" = "auth"."uid"())))));



CREATE POLICY "Clients can see their own nutrition meals" ON "public"."nutrition_meals" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."nutrition_plans"
  WHERE (("nutrition_plans"."id" = "nutrition_meals"."plan_id") AND ("nutrition_plans"."client_id" = "auth"."uid"())))));



CREATE POLICY "Clients can see their own nutrition plans" ON "public"."nutrition_plans" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "Clients can update own intake" ON "public"."client_intake" FOR UPDATE USING (("auth"."uid"() = "client_id"));



CREATE POLICY "Clients can view own intake" ON "public"."client_intake" FOR SELECT USING (("auth"."uid"() = "client_id"));



CREATE POLICY "Clients can view their coach's custom foods" ON "public"."foods" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clients"
  WHERE (("clients"."id" = "auth"."uid"()) AND ("clients"."coach_id" = "foods"."coach_id")))));



CREATE POLICY "Clients can view their own programs" ON "public"."workout_programs" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "client_id"));



CREATE POLICY "Coach can delete their own exercises" ON "public"."exercises" FOR DELETE USING (("auth"."uid"() = "coach_id"));



CREATE POLICY "Coach can insert their own exercises" ON "public"."exercises" FOR INSERT WITH CHECK (("auth"."uid"() = "coach_id"));



CREATE POLICY "Coach can manage their own clients" ON "public"."clients" USING (("auth"."uid"() = "coach_id"));



CREATE POLICY "Coach can manage workout blocks" ON "public"."workout_blocks" USING ((EXISTS ( SELECT 1
   FROM "public"."workout_plans"
  WHERE (("workout_plans"."id" = "workout_blocks"."plan_id") AND ("workout_plans"."coach_id" = "auth"."uid"())))));



CREATE POLICY "Coach can manage workout plans for their clients" ON "public"."workout_plans" USING (("auth"."uid"() = "coach_id"));



CREATE POLICY "Coach can update their own exercises" ON "public"."exercises" FOR UPDATE USING (("auth"."uid"() = "coach_id"));



CREATE POLICY "Coach can update their own profile" ON "public"."coaches" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Coach can view their clients' check-ins" ON "public"."check_ins" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."clients"
  WHERE (("clients"."id" = "check_ins"."client_id") AND ("clients"."coach_id" = "auth"."uid"())))));



CREATE POLICY "Coach can view their clients' daily nutrition logs" ON "public"."daily_nutrition_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."clients"
  WHERE (("clients"."id" = "daily_nutrition_logs"."client_id") AND ("clients"."coach_id" = "auth"."uid"())))));



CREATE POLICY "Coach can view their clients' intake" ON "public"."client_intake" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."clients"
  WHERE (("clients"."id" = "client_intake"."client_id") AND ("clients"."coach_id" = "auth"."uid"())))));



CREATE POLICY "Coach can view their clients' meal logs" ON "public"."nutrition_meal_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."daily_nutrition_logs"
     JOIN "public"."clients" ON (("clients"."id" = "daily_nutrition_logs"."client_id")))
  WHERE (("daily_nutrition_logs"."id" = "nutrition_meal_logs"."daily_log_id") AND ("clients"."coach_id" = "auth"."uid"())))));



CREATE POLICY "Coach can view their clients' workout logs" ON "public"."workout_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."clients"
  WHERE (("clients"."id" = "workout_logs"."client_id") AND ("clients"."coach_id" = "auth"."uid"())))));



CREATE POLICY "Coaches can insert their own custom foods" ON "public"."foods" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "coach_id"));



CREATE POLICY "Coaches can manage meal groups of their templates" ON "public"."template_meal_groups" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."template_meals" "tm"
     JOIN "public"."nutrition_plan_templates" "npt" ON (("tm"."template_id" = "npt"."id")))
  WHERE (("tm"."id" = "template_meal_groups"."template_meal_id") AND ("npt"."coach_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."template_meals" "tm"
     JOIN "public"."nutrition_plan_templates" "npt" ON (("tm"."template_id" = "npt"."id")))
  WHERE (("tm"."id" = "template_meal_groups"."template_meal_id") AND ("npt"."coach_id" = "auth"."uid"())))));



CREATE POLICY "Coaches can manage meals of their templates" ON "public"."template_meals" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."nutrition_plan_templates"
  WHERE (("nutrition_plan_templates"."id" = "template_meals"."template_id") AND ("nutrition_plan_templates"."coach_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."nutrition_plan_templates"
  WHERE (("nutrition_plan_templates"."id" = "template_meals"."template_id") AND ("nutrition_plan_templates"."coach_id" = "auth"."uid"())))));



CREATE POLICY "Coaches can manage their own food items" ON "public"."food_items" USING ((EXISTS ( SELECT 1
   FROM ("public"."nutrition_meals"
     JOIN "public"."nutrition_plans" ON (("nutrition_plans"."id" = "nutrition_meals"."plan_id")))
  WHERE (("nutrition_meals"."id" = "food_items"."meal_id") AND ("nutrition_plans"."coach_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."nutrition_meals"
     JOIN "public"."nutrition_plans" ON (("nutrition_plans"."id" = "nutrition_meals"."plan_id")))
  WHERE (("nutrition_meals"."id" = "food_items"."meal_id") AND ("nutrition_plans"."coach_id" = "auth"."uid"())))));



CREATE POLICY "Coaches can manage their own nutrition meals" ON "public"."nutrition_meals" USING ((EXISTS ( SELECT 1
   FROM "public"."nutrition_plans"
  WHERE (("nutrition_plans"."id" = "nutrition_meals"."plan_id") AND ("nutrition_plans"."coach_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."nutrition_plans"
  WHERE (("nutrition_plans"."id" = "nutrition_meals"."plan_id") AND ("nutrition_plans"."coach_id" = "auth"."uid"())))));



CREATE POLICY "Coaches can manage their own nutrition plans" ON "public"."nutrition_plans" USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



CREATE POLICY "Coaches can manage their own nutrition templates" ON "public"."nutrition_plan_templates" USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



CREATE POLICY "Coaches can manage their own programs" ON "public"."workout_programs" TO "authenticated" USING (("auth"."uid"() = "coach_id")) WITH CHECK (("auth"."uid"() = "coach_id"));



CREATE POLICY "Coaches can manage their own template meal groups" ON "public"."template_meal_groups" USING ((EXISTS ( SELECT 1
   FROM ("public"."template_meals"
     JOIN "public"."nutrition_plan_templates" ON (("nutrition_plan_templates"."id" = "template_meals"."template_id")))
  WHERE (("template_meals"."id" = "template_meal_groups"."template_meal_id") AND ("nutrition_plan_templates"."coach_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."template_meals"
     JOIN "public"."nutrition_plan_templates" ON (("nutrition_plan_templates"."id" = "template_meals"."template_id")))
  WHERE (("template_meals"."id" = "template_meal_groups"."template_meal_id") AND ("nutrition_plan_templates"."coach_id" = "auth"."uid"())))));



CREATE POLICY "Coaches can manage their own template meals" ON "public"."template_meals" USING ((EXISTS ( SELECT 1
   FROM "public"."nutrition_plan_templates"
  WHERE (("nutrition_plan_templates"."id" = "template_meals"."template_id") AND ("nutrition_plan_templates"."coach_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."nutrition_plan_templates"
  WHERE (("nutrition_plan_templates"."id" = "template_meals"."template_id") AND ("nutrition_plan_templates"."coach_id" = "auth"."uid"())))));



CREATE POLICY "Coaches can manage their own templates" ON "public"."nutrition_plan_templates" TO "authenticated" USING (("auth"."uid"() = "coach_id")) WITH CHECK (("auth"."uid"() = "coach_id"));



CREATE POLICY "Coaches can update their own clients" ON "public"."clients" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "coach_id")) WITH CHECK (("auth"."uid"() = "coach_id"));



CREATE POLICY "Coaches can view intakes of their clients" ON "public"."client_intake" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."clients"
  WHERE (("clients"."id" = "client_intake"."client_id") AND ("clients"."coach_id" = "auth"."uid"())))));



CREATE POLICY "Coaches can view their own custom foods" ON "public"."foods" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "coach_id"));



CREATE POLICY "Coaches manage own client payments" ON "public"."client_payments" USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



CREATE POLICY "Coaches pueden borrar sus ejercicios" ON "public"."exercises" FOR DELETE TO "authenticated" USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "Coaches pueden crear ejercicios" ON "public"."exercises" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IN ( SELECT "coaches"."id"
   FROM "public"."coaches")));



CREATE POLICY "Coaches pueden editar sus ejercicios" ON "public"."exercises" FOR UPDATE TO "authenticated" USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



CREATE POLICY "Enable all access for recipe owners" ON "public"."recipes" TO "authenticated" USING (("auth"."uid"() = "coach_id")) WITH CHECK (("auth"."uid"() = "coach_id"));



CREATE POLICY "Enable all access for recipe owners via recipe" ON "public"."recipe_ingredients" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."recipes"
  WHERE (("recipes"."id" = "recipe_ingredients"."recipe_id") AND ("recipes"."coach_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."recipes"
  WHERE (("recipes"."id" = "recipe_ingredients"."recipe_id") AND ("recipes"."coach_id" = "auth"."uid"())))));



CREATE POLICY "Enable delete access for authenticated users" ON "public"."check_ins" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Enable delete access for authenticated users" ON "public"."workout_sessions" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Enable insert access for authenticated users" ON "public"."check_ins" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable insert access for authenticated users" ON "public"."workout_sessions" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."check_ins" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."recipe_ingredients" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."recipes" FOR SELECT TO "authenticated" USING ((("coach_id" IS NULL) OR ("auth"."uid"() = "coach_id")));



CREATE POLICY "Enable read access for authenticated users" ON "public"."workout_sessions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable update access for authenticated users" ON "public"."check_ins" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Enable update access for authenticated users" ON "public"."workout_sessions" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Public read access to coaches" ON "public"."coaches" FOR SELECT USING (true);



CREATE POLICY "Todos pueden ver ejercicios" ON "public"."exercises" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."admin_audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_audit_logs_service_role_insert" ON "public"."admin_audit_logs" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "admin_audit_logs_service_role_select" ON "public"."admin_audit_logs" FOR SELECT TO "service_role" USING (true);



ALTER TABLE "public"."beta_invite_registrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."check_ins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "check_ins_client" ON "public"."check_ins" TO "authenticated" USING (("client_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("client_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "check_ins_coach" ON "public"."check_ins" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "check_ins"."client_id") AND ("c"."coach_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "check_ins"."client_id") AND ("c"."coach_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "client own habits" ON "public"."daily_habits" USING (("auth"."uid"() = "client_id")) WITH CHECK (("auth"."uid"() = "client_id"));



CREATE POLICY "client own meal food swaps" ON "public"."nutrition_meal_food_swaps" USING (("auth"."uid"() = "client_id")) WITH CHECK (("auth"."uid"() = "client_id"));



CREATE POLICY "client own prefs" ON "public"."client_food_preferences" USING (("auth"."uid"() = "client_id")) WITH CHECK (("auth"."uid"() = "client_id"));



CREATE POLICY "client read coach swap groups" ON "public"."food_swap_groups" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "auth"."uid"()) AND ("c"."coach_id" = "food_swap_groups"."coach_id")))));



ALTER TABLE "public"."client_food_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_intake" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_intake_client" ON "public"."client_intake" TO "authenticated" USING (("client_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("client_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "client_intake_coach" ON "public"."client_intake" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "client_intake"."client_id") AND ("c"."coach_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "client_intake"."client_id") AND ("c"."coach_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "client_manage_checkins" ON "public"."check_ins" USING (("client_id" = "auth"."uid"())) WITH CHECK (("client_id" = "auth"."uid"()));



CREATE POLICY "client_manage_logs" ON "public"."workout_logs" USING (("client_id" = "auth"."uid"())) WITH CHECK (("client_id" = "auth"."uid"()));



ALTER TABLE "public"."client_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_read_self" ON "public"."clients" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "client_update_self" ON "public"."clients" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clients_coach_all" ON "public"."clients" TO "authenticated" USING (("coach_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("coach_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "clients_read_blocks" ON "public"."workout_blocks" FOR SELECT USING (("plan_id" IN ( SELECT "workout_plans"."id"
   FROM "public"."workout_plans"
  WHERE ("workout_plans"."client_id" = "auth"."uid"()))));



CREATE POLICY "clients_read_coach_branding" ON "public"."coaches" FOR SELECT USING (("id" IN ( SELECT "clients"."coach_id"
   FROM "public"."clients"
  WHERE ("clients"."id" = "auth"."uid"()))));



CREATE POLICY "clients_read_coach_exercises" ON "public"."exercises" FOR SELECT USING (("coach_id" IN ( SELECT "clients"."coach_id"
   FROM "public"."clients"
  WHERE ("clients"."id" = "auth"."uid"()))));



CREATE POLICY "clients_read_own_plans" ON "public"."workout_plans" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "clients_self_select" ON "public"."clients" FOR SELECT TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "clients_self_update" ON "public"."clients" FOR UPDATE TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "coach own swap groups" ON "public"."food_swap_groups" USING (("auth"."uid"() = "coach_id")) WITH CHECK (("auth"."uid"() = "coach_id"));



CREATE POLICY "coach read client habits" ON "public"."daily_habits" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "daily_habits"."client_id") AND ("c"."coach_id" = "auth"."uid"())))));



CREATE POLICY "coach read client meal food swaps" ON "public"."nutrition_meal_food_swaps" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "nutrition_meal_food_swaps"."client_id") AND ("c"."coach_id" = "auth"."uid"())))));



CREATE POLICY "coach read client prefs" ON "public"."client_food_preferences" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "client_food_preferences"."client_id") AND ("c"."coach_id" = "auth"."uid"())))));



ALTER TABLE "public"."coach_email_drip_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_email_drip_events_coach_read_own" ON "public"."coach_email_drip_events" FOR SELECT USING (("auth"."uid"() = "coach_id"));



ALTER TABLE "public"."coach_onboarding_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_onboarding_events_coach_insert_own" ON "public"."coach_onboarding_events" FOR INSERT WITH CHECK (("auth"."uid"() = "coach_id"));



CREATE POLICY "coach_onboarding_events_coach_read_own" ON "public"."coach_onboarding_events" FOR SELECT USING (("auth"."uid"() = "coach_id"));



ALTER TABLE "public"."coaches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coaches_delete_own" ON "public"."coaches" FOR DELETE USING (("id" = "auth"."uid"()));



CREATE POLICY "coaches_insert_own" ON "public"."coaches" FOR INSERT WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "coaches_manage_blocks" ON "public"."workout_blocks" USING (("plan_id" IN ( SELECT "workout_plans"."id"
   FROM "public"."workout_plans"
  WHERE ("workout_plans"."coach_id" = "auth"."uid"()))));



CREATE POLICY "coaches_manage_clients" ON "public"."clients" USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



CREATE POLICY "coaches_manage_exercises" ON "public"."exercises" USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



CREATE POLICY "coaches_manage_plans" ON "public"."workout_plans" USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



CREATE POLICY "coaches_read_checkins" ON "public"."check_ins" FOR SELECT USING (("client_id" IN ( SELECT "clients"."id"
   FROM "public"."clients"
  WHERE ("clients"."coach_id" = "auth"."uid"()))));



CREATE POLICY "coaches_read_logs" ON "public"."workout_logs" FOR SELECT USING (("client_id" IN ( SELECT "clients"."id"
   FROM "public"."clients"
  WHERE ("clients"."coach_id" = "auth"."uid"()))));



CREATE POLICY "coaches_select_anon" ON "public"."coaches" FOR SELECT TO "anon" USING (true);



CREATE POLICY "coaches_select_authenticated" ON "public"."coaches" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."coach_id" = "coaches"."id"))))));



CREATE POLICY "coaches_select_own" ON "public"."coaches" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "coaches_update_own" ON "public"."coaches" FOR UPDATE TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."daily_habits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_nutrition_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_nutrition_logs_client" ON "public"."daily_nutrition_logs" TO "authenticated" USING (("client_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("client_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "daily_nutrition_logs_client_all" ON "public"."daily_nutrition_logs" TO "authenticated" USING (("client_id" = "auth"."uid"())) WITH CHECK (("client_id" = "auth"."uid"()));



CREATE POLICY "daily_nutrition_logs_coach" ON "public"."daily_nutrition_logs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "daily_nutrition_logs"."client_id") AND ("c"."coach_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "daily_nutrition_logs"."client_id") AND ("c"."coach_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "daily_nutrition_logs_coach_select" ON "public"."daily_nutrition_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."nutrition_plans" "np"
  WHERE (("np"."id" = "daily_nutrition_logs"."plan_id") AND ("np"."coach_id" = "auth"."uid"())))));



ALTER TABLE "public"."exercises" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "exercises_read" ON "public"."exercises" FOR SELECT TO "authenticated" USING ((("coach_id" IS NULL) OR ("coach_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "exercises_write_own" ON "public"."exercises" TO "authenticated" USING (("coach_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("coach_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."food_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "food_items_access" ON "public"."food_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."nutrition_meals" "m"
     JOIN "public"."nutrition_plans" "p" ON (("p"."id" = "m"."plan_id")))
  WHERE (("m"."id" = "food_items"."meal_id") AND (("p"."coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("p"."client_id" = ( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."nutrition_meals" "m"
     JOIN "public"."nutrition_plans" "p" ON (("p"."id" = "m"."plan_id")))
  WHERE (("m"."id" = "food_items"."meal_id") AND (("p"."coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("p"."client_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "food_items_client_select" ON "public"."food_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."nutrition_meals" "m"
     JOIN "public"."nutrition_plans" "p" ON (("p"."id" = "m"."plan_id")))
  WHERE (("m"."id" = "food_items"."meal_id") AND ("p"."client_id" = "auth"."uid"())))));



CREATE POLICY "food_items_coach_all" ON "public"."food_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."nutrition_meals" "m"
     JOIN "public"."nutrition_plans" "p" ON (("p"."id" = "m"."plan_id")))
  WHERE (("m"."id" = "food_items"."meal_id") AND ("p"."coach_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."nutrition_meals" "m"
     JOIN "public"."nutrition_plans" "p" ON (("p"."id" = "m"."plan_id")))
  WHERE (("m"."id" = "food_items"."meal_id") AND ("p"."coach_id" = "auth"."uid"())))));



ALTER TABLE "public"."food_swap_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."foods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "foods_coach_delete" ON "public"."foods" FOR DELETE TO "authenticated" USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "foods_coach_insert" ON "public"."foods" FOR INSERT TO "authenticated" WITH CHECK (("coach_id" = "auth"."uid"()));



CREATE POLICY "foods_coach_update" ON "public"."foods" FOR UPDATE TO "authenticated" USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



CREATE POLICY "foods_read" ON "public"."foods" FOR SELECT TO "authenticated" USING ((("coach_id" IS NULL) OR ("coach_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "foods_select_client_coach_catalog" ON "public"."foods" FOR SELECT TO "authenticated" USING ((("coach_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "auth"."uid"()) AND ("c"."coach_id" = "foods"."coach_id"))))));



CREATE POLICY "foods_select_global" ON "public"."foods" FOR SELECT TO "authenticated" USING (("coach_id" IS NULL));



CREATE POLICY "foods_select_own_coach" ON "public"."foods" FOR SELECT TO "authenticated" USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "foods_write_own" ON "public"."foods" TO "authenticated" USING ((("coach_id" IS NOT NULL) AND ("coach_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((("coach_id" IS NOT NULL) AND ("coach_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."news_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "news_items_select_published" ON "public"."news_items" FOR SELECT USING ((("status" = 'published'::"text") AND ("published_at" <= "now"())));



ALTER TABLE "public"."news_reads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "news_reads_own" ON "public"."news_reads" USING (("coach_id" = "auth"."uid"()));



ALTER TABLE "public"."nutrition_meal_food_swaps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nutrition_meal_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nutrition_meal_logs_access" ON "public"."nutrition_meal_logs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."daily_nutrition_logs" "d"
  WHERE (("d"."id" = "nutrition_meal_logs"."daily_log_id") AND (("d"."client_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
           FROM "public"."clients" "c"
          WHERE (("c"."id" = "d"."client_id") AND ("c"."coach_id" = ( SELECT "auth"."uid"() AS "uid")))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."daily_nutrition_logs" "d"
  WHERE (("d"."id" = "nutrition_meal_logs"."daily_log_id") AND (("d"."client_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
           FROM "public"."clients" "c"
          WHERE (("c"."id" = "d"."client_id") AND ("c"."coach_id" = ( SELECT "auth"."uid"() AS "uid"))))))))));



CREATE POLICY "nutrition_meal_logs_client_all" ON "public"."nutrition_meal_logs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."daily_nutrition_logs" "d"
  WHERE (("d"."id" = "nutrition_meal_logs"."daily_log_id") AND ("d"."client_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."daily_nutrition_logs" "d"
  WHERE (("d"."id" = "nutrition_meal_logs"."daily_log_id") AND ("d"."client_id" = "auth"."uid"())))));



CREATE POLICY "nutrition_meal_logs_coach_select" ON "public"."nutrition_meal_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."daily_nutrition_logs" "d"
     JOIN "public"."nutrition_plans" "np" ON (("np"."id" = "d"."plan_id")))
  WHERE (("d"."id" = "nutrition_meal_logs"."daily_log_id") AND ("np"."coach_id" = "auth"."uid"())))));



ALTER TABLE "public"."nutrition_meals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nutrition_meals_access" ON "public"."nutrition_meals" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."nutrition_plans" "p"
  WHERE (("p"."id" = "nutrition_meals"."plan_id") AND (("p"."coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("p"."client_id" = ( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."nutrition_plans" "p"
  WHERE (("p"."id" = "nutrition_meals"."plan_id") AND (("p"."coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("p"."client_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "nutrition_meals_client_select" ON "public"."nutrition_meals" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."nutrition_plans" "p"
  WHERE (("p"."id" = "nutrition_meals"."plan_id") AND ("p"."client_id" = "auth"."uid"())))));



CREATE POLICY "nutrition_meals_coach_all" ON "public"."nutrition_meals" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."nutrition_plans" "p"
  WHERE (("p"."id" = "nutrition_meals"."plan_id") AND ("p"."coach_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."nutrition_plans" "p"
  WHERE (("p"."id" = "nutrition_meals"."plan_id") AND ("p"."coach_id" = "auth"."uid"())))));



ALTER TABLE "public"."nutrition_plan_cycles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nutrition_plan_cycles coach all" ON "public"."nutrition_plan_cycles" USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



ALTER TABLE "public"."nutrition_plan_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nutrition_plan_history coach all" ON "public"."nutrition_plan_history" USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



ALTER TABLE "public"."nutrition_plan_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nutrition_plan_templates_coach" ON "public"."nutrition_plan_templates" TO "authenticated" USING (("coach_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("coach_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."nutrition_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nutrition_plans_client" ON "public"."nutrition_plans" FOR SELECT TO "authenticated" USING (("client_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "nutrition_plans_client_select" ON "public"."nutrition_plans" FOR SELECT TO "authenticated" USING (("client_id" = "auth"."uid"()));



CREATE POLICY "nutrition_plans_coach" ON "public"."nutrition_plans" TO "authenticated" USING (("coach_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("coach_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "nutrition_plans_coach_all" ON "public"."nutrition_plans" TO "authenticated" USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



CREATE POLICY "public_read_coach_branding" ON "public"."coaches" FOR SELECT USING (true);



ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "push_subscriptions client own" ON "public"."push_subscriptions" USING (("client_id" = "auth"."uid"())) WITH CHECK (("client_id" = "auth"."uid"()));



CREATE POLICY "read_global_exercises" ON "public"."exercises" FOR SELECT USING (("coach_id" IS NULL));



ALTER TABLE "public"."recipe_ingredients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recipe_ingredients_delete" ON "public"."recipe_ingredients" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."recipes" "r"
  WHERE (("r"."id" = "recipe_ingredients"."recipe_id") AND ("r"."coach_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "recipe_ingredients_insert" ON "public"."recipe_ingredients" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."recipes" "r"
  WHERE (("r"."id" = "recipe_ingredients"."recipe_id") AND ("r"."coach_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "recipe_ingredients_select" ON "public"."recipe_ingredients" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."recipes" "r"
  WHERE (("r"."id" = "recipe_ingredients"."recipe_id") AND (("r"."coach_id" IS NULL) OR ("r"."coach_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "recipe_ingredients_update" ON "public"."recipe_ingredients" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."recipes" "r"
  WHERE (("r"."id" = "recipe_ingredients"."recipe_id") AND ("r"."coach_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."recipes" "r"
  WHERE (("r"."id" = "recipe_ingredients"."recipe_id") AND ("r"."coach_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."recipes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recipes_read" ON "public"."recipes" FOR SELECT TO "authenticated" USING ((("coach_id" IS NULL) OR ("coach_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "recipes_write_own" ON "public"."recipes" TO "authenticated" USING ((("coach_id" IS NOT NULL) AND ("coach_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((("coach_id" IS NOT NULL) AND ("coach_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."saved_meal_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "saved_meal_items_access" ON "public"."saved_meal_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."saved_meals" "s"
  WHERE (("s"."id" = "saved_meal_items"."saved_meal_id") AND ("s"."coach_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."saved_meals" "s"
  WHERE (("s"."id" = "saved_meal_items"."saved_meal_id") AND ("s"."coach_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "saved_meal_items_coach_all" ON "public"."saved_meal_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."saved_meals" "s"
  WHERE (("s"."id" = "saved_meal_items"."saved_meal_id") AND ("s"."coach_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."saved_meals" "s"
  WHERE (("s"."id" = "saved_meal_items"."saved_meal_id") AND ("s"."coach_id" = "auth"."uid"())))));



ALTER TABLE "public"."saved_meals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "saved_meals_coach" ON "public"."saved_meals" TO "authenticated" USING (("coach_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("coach_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "saved_meals_coach_all" ON "public"."saved_meals" TO "authenticated" USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



ALTER TABLE "public"."subscription_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subscription_events_coach" ON "public"."subscription_events" FOR SELECT TO "authenticated" USING (("coach_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."template_meal_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "template_meal_groups_access" ON "public"."template_meal_groups" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."template_meals" "tm"
     JOIN "public"."nutrition_plan_templates" "t" ON (("t"."id" = "tm"."template_id")))
  WHERE (("tm"."id" = "template_meal_groups"."template_meal_id") AND ("t"."coach_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."template_meals" "tm"
     JOIN "public"."nutrition_plan_templates" "t" ON (("t"."id" = "tm"."template_id")))
  WHERE (("tm"."id" = "template_meal_groups"."template_meal_id") AND ("t"."coach_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."template_meals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "template_meals_access" ON "public"."template_meals" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."nutrition_plan_templates" "t"
  WHERE (("t"."id" = "template_meals"."template_id") AND ("t"."coach_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."nutrition_plan_templates" "t"
  WHERE (("t"."id" = "template_meals"."template_id") AND ("t"."coach_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."workout_blocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workout_blocks_access" ON "public"."workout_blocks" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workout_plans" "wp"
  WHERE (("wp"."id" = "workout_blocks"."plan_id") AND (("wp"."coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("wp"."client_id" IS NOT NULL) AND ("wp"."client_id" = ( SELECT "auth"."uid"() AS "uid")))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."workout_plans" "wp"
  WHERE (("wp"."id" = "workout_blocks"."plan_id") AND (("wp"."coach_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("wp"."client_id" IS NOT NULL) AND ("wp"."client_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



ALTER TABLE "public"."workout_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workout_logs_client" ON "public"."workout_logs" TO "authenticated" USING (("client_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("client_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "workout_logs_coach" ON "public"."workout_logs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "workout_logs"."client_id") AND ("c"."coach_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "workout_logs"."client_id") AND ("c"."coach_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."workout_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workout_plans_client_read" ON "public"."workout_plans" FOR SELECT TO "authenticated" USING ((("client_id" IS NOT NULL) AND ("client_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "workout_plans_coach" ON "public"."workout_plans" TO "authenticated" USING (("coach_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("coach_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."workout_programs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workout_programs_client_read" ON "public"."workout_programs" FOR SELECT TO "authenticated" USING ((("client_id" IS NOT NULL) AND ("client_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "workout_programs_coach" ON "public"."workout_programs" TO "authenticated" USING (("coach_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("coach_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."workout_sessions" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_platform_email_availability"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_platform_email_availability"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_platform_email_availability"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_platform_email_availability"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_audit_logs_paginated"("p_action" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_target" "text", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_audit_logs_paginated"("p_action" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_target" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_audit_logs_paginated"("p_action" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_target" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_coaches_paginated"("p_search" "text", "p_status" "text", "p_tier" "text", "p_beta" boolean, "p_sort" "text", "p_dir" "text", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_coaches_paginated"("p_search" "text", "p_status" "text", "p_tier" "text", "p_beta" boolean, "p_sort" "text", "p_dir" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_coaches_paginated"("p_search" "text", "p_status" "text", "p_tier" "text", "p_beta" boolean, "p_sort" "text", "p_dir" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_client_current_streak"("p_client_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_client_current_streak"("p_client_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_client_current_streak"("p_client_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_clients_last_workout_date"("p_client_ids" "uuid"[], "p_since" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_clients_last_workout_date"("p_client_ids" "uuid"[], "p_since" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_clients_last_workout_date"("p_client_ids" "uuid"[], "p_since" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_coach_client_signups_last_6_months"("p_coach_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_coach_client_signups_last_6_months"("p_coach_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_coach_client_signups_last_6_months"("p_coach_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_coach_clients_streaks"("p_coach_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_coach_clients_streaks"("p_coach_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_coach_clients_streaks"("p_coach_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_coach_clients_streaks"("p_coach_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_coach_workout_sessions_30d"("p_coach_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_coach_workout_sessions_30d"("p_coach_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_coach_workout_sessions_30d"("p_coach_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_coach_workout_sessions_30d"("p_coach_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_platform_checkins_7d"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_platform_checkins_7d"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_platform_checkins_7d"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_platform_churn_last_30d"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_platform_churn_last_30d"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_platform_churn_last_30d"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_platform_churn_monthly"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_platform_churn_monthly"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_platform_churn_monthly"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_platform_clients_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_platform_clients_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_platform_clients_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_platform_coach_signups_last_6_months"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_platform_coach_signups_last_6_months"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_platform_coach_signups_last_6_months"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_platform_coaches_by_tier"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_platform_coaches_by_tier"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_platform_coaches_by_tier"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_platform_coaches_by_tier_monthly"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_platform_coaches_by_tier_monthly"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_platform_coaches_by_tier_monthly"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_platform_coaches_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_platform_coaches_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_platform_coaches_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_platform_mrr_12_months"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_platform_mrr_12_months"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_platform_mrr_12_months"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_platform_revenue_by_cycle"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_platform_revenue_by_cycle"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_platform_revenue_by_cycle"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_platform_revenue_by_tier"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_platform_revenue_by_tier"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_platform_revenue_by_tier"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_platform_subscription_events_series"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_platform_subscription_events_series"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_platform_subscription_events_series"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_platform_trial_conversion_rate"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_platform_trial_conversion_rate"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_platform_trial_conversion_rate"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_platform_workout_sessions_30d"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_platform_workout_sessions_30d"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_platform_workout_sessions_30d"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_workout_program_planned_set_totals"("p_program_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_workout_program_planned_set_totals"("p_program_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_workout_program_planned_set_totals"("p_program_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."immutable_unaccent"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."immutable_unaccent"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."immutable_unaccent"("text") TO "service_role";



GRANT ALL ON TABLE "public"."foods" TO "anon";
GRANT ALL ON TABLE "public"."foods" TO "authenticated";
GRANT ALL ON TABLE "public"."foods" TO "service_role";



GRANT ALL ON FUNCTION "public"."search_foods"("search_term" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_foods"("search_term" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_foods"("search_term" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_coach_activity"("p_coach_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."touch_coach_activity"("p_coach_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_coach_activity"("p_coach_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."admin_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."admin_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."beta_invite_registrations" TO "anon";
GRANT ALL ON TABLE "public"."beta_invite_registrations" TO "authenticated";
GRANT ALL ON TABLE "public"."beta_invite_registrations" TO "service_role";



GRANT ALL ON TABLE "public"."check_ins" TO "anon";
GRANT ALL ON TABLE "public"."check_ins" TO "authenticated";
GRANT ALL ON TABLE "public"."check_ins" TO "service_role";



GRANT ALL ON TABLE "public"."client_food_preferences" TO "anon";
GRANT ALL ON TABLE "public"."client_food_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."client_food_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."client_intake" TO "anon";
GRANT ALL ON TABLE "public"."client_intake" TO "authenticated";
GRANT ALL ON TABLE "public"."client_intake" TO "service_role";



GRANT ALL ON TABLE "public"."client_payments" TO "anon";
GRANT ALL ON TABLE "public"."client_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."client_payments" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."coach_email_drip_events" TO "anon";
GRANT ALL ON TABLE "public"."coach_email_drip_events" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_email_drip_events" TO "service_role";



GRANT ALL ON TABLE "public"."coach_onboarding_events" TO "anon";
GRANT ALL ON TABLE "public"."coach_onboarding_events" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_onboarding_events" TO "service_role";



GRANT ALL ON TABLE "public"."coaches" TO "anon";
GRANT ALL ON TABLE "public"."coaches" TO "authenticated";
GRANT ALL ON TABLE "public"."coaches" TO "service_role";



GRANT ALL ON TABLE "public"."daily_habits" TO "anon";
GRANT ALL ON TABLE "public"."daily_habits" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_habits" TO "service_role";



GRANT ALL ON TABLE "public"."daily_nutrition_logs" TO "anon";
GRANT ALL ON TABLE "public"."daily_nutrition_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_nutrition_logs" TO "service_role";



GRANT ALL ON TABLE "public"."exercises" TO "anon";
GRANT ALL ON TABLE "public"."exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."exercises" TO "service_role";



GRANT ALL ON TABLE "public"."exercises_backup_20260405" TO "anon";
GRANT ALL ON TABLE "public"."exercises_backup_20260405" TO "authenticated";
GRANT ALL ON TABLE "public"."exercises_backup_20260405" TO "service_role";



GRANT ALL ON TABLE "public"."food_items" TO "anon";
GRANT ALL ON TABLE "public"."food_items" TO "authenticated";
GRANT ALL ON TABLE "public"."food_items" TO "service_role";



GRANT ALL ON TABLE "public"."food_swap_groups" TO "anon";
GRANT ALL ON TABLE "public"."food_swap_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."food_swap_groups" TO "service_role";



GRANT ALL ON TABLE "public"."nutrition_meal_logs" TO "anon";
GRANT ALL ON TABLE "public"."nutrition_meal_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."nutrition_meal_logs" TO "service_role";



GRANT ALL ON TABLE "public"."meal_completions" TO "anon";
GRANT ALL ON TABLE "public"."meal_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_completions" TO "service_role";



GRANT ALL ON TABLE "public"."news_items" TO "anon";
GRANT ALL ON TABLE "public"."news_items" TO "authenticated";
GRANT ALL ON TABLE "public"."news_items" TO "service_role";



GRANT ALL ON TABLE "public"."news_reads" TO "anon";
GRANT ALL ON TABLE "public"."news_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."news_reads" TO "service_role";



GRANT ALL ON TABLE "public"."nutrition_meal_food_swaps" TO "anon";
GRANT ALL ON TABLE "public"."nutrition_meal_food_swaps" TO "authenticated";
GRANT ALL ON TABLE "public"."nutrition_meal_food_swaps" TO "service_role";



GRANT ALL ON TABLE "public"."nutrition_meals" TO "anon";
GRANT ALL ON TABLE "public"."nutrition_meals" TO "authenticated";
GRANT ALL ON TABLE "public"."nutrition_meals" TO "service_role";



GRANT ALL ON TABLE "public"."nutrition_plan_cycles" TO "anon";
GRANT ALL ON TABLE "public"."nutrition_plan_cycles" TO "authenticated";
GRANT ALL ON TABLE "public"."nutrition_plan_cycles" TO "service_role";



GRANT ALL ON TABLE "public"."nutrition_plan_history" TO "anon";
GRANT ALL ON TABLE "public"."nutrition_plan_history" TO "authenticated";
GRANT ALL ON TABLE "public"."nutrition_plan_history" TO "service_role";



GRANT ALL ON TABLE "public"."nutrition_plan_templates" TO "anon";
GRANT ALL ON TABLE "public"."nutrition_plan_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."nutrition_plan_templates" TO "service_role";



GRANT ALL ON TABLE "public"."nutrition_plans" TO "anon";
GRANT ALL ON TABLE "public"."nutrition_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."nutrition_plans" TO "service_role";



GRANT ALL ON TABLE "public"."personal_gastos" TO "anon";
GRANT ALL ON TABLE "public"."personal_gastos" TO "authenticated";
GRANT ALL ON TABLE "public"."personal_gastos" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."recipe_ingredients" TO "anon";
GRANT ALL ON TABLE "public"."recipe_ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."recipe_ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."recipes" TO "anon";
GRANT ALL ON TABLE "public"."recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."recipes" TO "service_role";



GRANT ALL ON TABLE "public"."saved_meal_items" TO "anon";
GRANT ALL ON TABLE "public"."saved_meal_items" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_meal_items" TO "service_role";



GRANT ALL ON TABLE "public"."saved_meals" TO "anon";
GRANT ALL ON TABLE "public"."saved_meals" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_meals" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_events" TO "anon";
GRANT ALL ON TABLE "public"."subscription_events" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_events" TO "service_role";



GRANT ALL ON TABLE "public"."template_meal_groups" TO "anon";
GRANT ALL ON TABLE "public"."template_meal_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."template_meal_groups" TO "service_role";



GRANT ALL ON TABLE "public"."template_meals" TO "anon";
GRANT ALL ON TABLE "public"."template_meals" TO "authenticated";
GRANT ALL ON TABLE "public"."template_meals" TO "service_role";



GRANT ALL ON TABLE "public"."workout_blocks" TO "anon";
GRANT ALL ON TABLE "public"."workout_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_blocks" TO "service_role";



GRANT ALL ON TABLE "public"."workout_logs" TO "anon";
GRANT ALL ON TABLE "public"."workout_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_logs" TO "service_role";



GRANT ALL ON TABLE "public"."workout_plans" TO "anon";
GRANT ALL ON TABLE "public"."workout_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_plans" TO "service_role";



GRANT ALL ON TABLE "public"."workout_programs" TO "anon";
GRANT ALL ON TABLE "public"."workout_programs" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_programs" TO "service_role";



GRANT ALL ON TABLE "public"."workout_sessions" TO "anon";
GRANT ALL ON TABLE "public"."workout_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_sessions" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







