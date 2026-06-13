-- ============================================================================
-- Plan 04 (consolidación de planes + ciclos) · F4.1 + F4.5
-- Fix de los 3 RPCs de MRR del admin + RPC de observabilidad legacy + bump de
-- techo de elite a 100 (F0-a, regalado).
--
-- ADITIVA / IDEMPOTENTE / FORWARD-ONLY:
--   - Solo CREATE OR REPLACE de funciones + UPDATE con predicado idempotente.
--   - Cero DROP, cero rename, cero cambio de firma/return type (los call sites del
--     admin no se tocan).
--   - El merge del branch re-ejecuta TODO el historial: este archivo debe poder
--     correr N veces sin efecto distinto al de correrlo 1 vez.
--
-- ⚠️ NO APLICAR AHORA. Esta migración se aplica en el BRANCH efímero de Supabase Pro
--    del gate Movida (Director Movida §3 · plan 04 F0-e), empaquetada con el resto de
--    las migraciones del gate y el UPDATE de la org de prueba — una sola ventana de
--    riesgo. Jamás `db push` directo a prod.
--
-- BUG pre-existente que cierra (baseline 00000000000001 :476-563):
--   el CASE de los 3 RPCs tenía `scale=64990` (desactualizado; real 190000) y
--   OMITÍA `growth` por completo (un growth activo computaba $0 de MRR).
--   CASE final (precios reales, decisión dueño 2026-06-11 — precios sin cambios):
--     starter 19990 · pro 29990 · elite 44990 · growth 84990 · scale 190000
--   Los tiers LEGACY (growth/scale) SE QUEDAN en el CASE a propósito: mientras exista
--   un grandfathered pagando, su MRR debe contarse. Las cuentas team/org-managed NO
--   contaminan: el filtro `subscription_status='active' AND subscription_mp_id IS NOT NULL`
--   ya las excluye (team_managed/org_managed ≠ active; managed sin mp_id propio — INV14).
--
-- Mismo patrón de seguridad/forma que los RPCs MRR originales del baseline:
--   LANGUAGE sql STABLE, SET search_path TO 'public', OWNER postgres (SECURITY INVOKER,
--   igual que el original — NO se promueve a SECURITY DEFINER). Las funciones corren
--   con service-role desde el admin (finanzas.queries.ts).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) get_platform_mrr_12_months — MRR mensual de los últimos 12 meses.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."get_platform_mrr_12_months"()
    RETURNS TABLE("ym" "text", "mrr_clp" numeric, "coach_count" bigint)
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
                WHEN 'growth'  THEN 84990   -- LEGACY: fuera de venta, grandfathered cuenta MRR
                WHEN 'scale'   THEN 190000  -- LEGACY: fuera de venta, grandfathered cuenta MRR
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

-- ----------------------------------------------------------------------------
-- (2) get_platform_revenue_by_cycle — MRR actual desglosado por ciclo de cobro.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."get_platform_revenue_by_cycle"()
    RETURNS TABLE("billing_cycle" "text", "mrr_clp" numeric, "coach_count" bigint)
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
                WHEN 'growth'  THEN 84990   -- LEGACY: fuera de venta, grandfathered cuenta MRR
                WHEN 'scale'   THEN 190000  -- LEGACY: fuera de venta, grandfathered cuenta MRR
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

-- ----------------------------------------------------------------------------
-- (3) get_platform_revenue_by_tier — MRR actual desglosado por tier.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."get_platform_revenue_by_tier"()
    RETURNS TABLE("tier" "text", "mrr_clp" numeric, "coach_count" bigint)
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
                WHEN 'growth'  THEN 84990   -- LEGACY: fuera de venta, grandfathered cuenta MRR
                WHEN 'scale'   THEN 190000  -- LEGACY: fuera de venta, grandfathered cuenta MRR
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

-- ----------------------------------------------------------------------------
-- (4) get_legacy_tier_counts — observabilidad de la extinción del grandfather
--     (plan 04 F4.1 mejora #5). Conteo de TODAS las filas con tier legacy
--     (growth/scale), desglosado por tier × status × ciclo, SIN filtrar status:
--     los placeholders team_managed/org_managed salen visibles y se distinguen
--     por su subscription_status (no son ventas; el operador los lee aparte).
--     Cuando los legacy reales (status='active') lleguen a 0, se puede planear
--     matar el union legacy.
--     Mismo patrón de seguridad/forma que los RPCs MRR de arriba.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."get_legacy_tier_counts"()
    RETURNS TABLE("tier" "text", "subscription_status" "text", "billing_cycle" "text", "coach_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
    SELECT
        subscription_tier AS tier,
        subscription_status,
        COALESCE(billing_cycle, 'monthly') AS billing_cycle,
        COUNT(id)::bigint AS coach_count
    FROM public.coaches
    WHERE subscription_tier IN ('growth', 'scale')
    GROUP BY subscription_tier, subscription_status, COALESCE(billing_cycle, 'monthly')
    ORDER BY subscription_tier, subscription_status, billing_cycle;
$$;

ALTER FUNCTION "public"."get_legacy_tier_counts"() OWNER TO "postgres";

-- Grants espejo de los RPCs platform existentes del baseline (authenticated/service_role).
-- (anon queda fuera por consistencia con la línea F15b 20260608120150; el caller real
--  es el admin con service-role.)
GRANT EXECUTE ON FUNCTION "public"."get_legacy_tier_counts"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_legacy_tier_counts"() TO "service_role";

-- ----------------------------------------------------------------------------
-- (5) F4.5 — Techo de elite a 100, bump REGALADO a los elite existentes (F0-a).
--     Idempotente por el predicado `max_clients = 60`: una 2ª corrida no toca
--     filas (ya están en 100) y respeta overrides manuales del admin (≠ 60).
--     Statuses definidos por el dueño: active/trialing/canceled + past_due/paused
--     (simplicidad; el webhook re-setea max_clients al reactivar, route.ts:173).
-- ----------------------------------------------------------------------------
UPDATE public.coaches
SET max_clients = 100
WHERE subscription_tier = 'elite'
  AND subscription_status IN ('active', 'trialing', 'canceled', 'past_due', 'paused')
  AND max_clients = 60;
