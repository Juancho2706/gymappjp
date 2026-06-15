-- ============================================================================
-- Excluir cuentas de coach de PRUEBA/internas de los 3 RPCs de MRR del admin.
--
-- PROBLEMA: las cuentas e2e (`…@evatest.cl`) y el coach de prueba del dueño
-- (`juanmvr2706@gmail.com`) son filas normales de `public.coaches` con tier pago,
-- así que los RPCs de MRR las contaban como ingreso real → MRR/ARR/ARPC del panel
-- /admin/finanzas inflados. Esto las saca del agregado en SQL (lado RPC), espejando
-- el filtro TS de `apps/web/src/lib/test-accounts.ts` (`isTestCoachEmail`).
--
-- ADITIVA / IDEMPOTENTE / FORWARD-ONLY:
--   - Solo CREATE OR REPLACE de funciones existentes (mismas firmas/return types).
--   - Cero DROP, cero rename, cero cambio de firma. Re-ejecutable N veces sin
--     efecto distinto al de correrla 1 vez. El merge del branch re-ejecuta todo el
--     historial — esto debe sobrevivir.
--   - Preserva EXACTAMENTE la lógica previa (migración 20260612130000), solo agrega
--     el LEFT JOIN a auth.users + la cláusula de exclusión de prueba.
--
-- ⚠️ NO APLICAR AHORA. La aplica el dueño a prod por separado (branch efímero de
--    Supabase Pro / protocolo aditivo-en-LIVE). Jamás `db push` directo a prod.
--
-- ── SINCRONÍA OBLIGATORIA ────────────────────────────────────────────────────
-- El predicado de exclusión de abajo es ESPEJO de `TEST_COACH_EMAILS` +
-- `TEST_COACH_EMAIL_DOMAINS` en `apps/web/src/lib/test-accounts.ts`. Si agregás un
-- email/dominio en un lado, agregalo en el otro:
--   · dominio  `evatest.cl`        → `u.email NOT ILIKE '%@evatest.cl'`
--   · explícito `juanmvr2706@gmail.com` → `lower(u.email) <> 'juanmvr2706@gmail.com'`
-- (al sumar más cuentas permanentes del dueño — p.ej. yolomon.2*/josefit* — agregá
--  otra línea `AND lower(u.email) <> '...'` con el email real, NO inventar.)
--
-- Seguridad/forma: se conserva LANGUAGE sql STABLE, SET search_path, OWNER postgres.
-- A diferencia de los RPCs originales (SECURITY INVOKER), estos PASAN A SECURITY
-- DEFINER porque ahora leen `auth.users` (no accesible para INVOKER). El callsite es
-- el admin con service-role (finanzas.queries.ts:42 + admin.queries.ts:46). El JOIN a
-- auth.users es de solo lectura del email y no expone filas nuevas (el agregado sigue
-- devolviendo el mismo shape: ym/cycle/tier × mrr_clp × coach_count).
-- search_path incluye `auth` para resolver `auth.users` bajo SECURITY DEFINER.
-- ⚠️ GRANTS RESTRINGIDOS (ver final del archivo): como ahora son DEFINER y devuelven el MRR de
-- TODA la plataforma, se REVOCA EXECUTE a anon/authenticated (un coach leería finanzas globales) y
-- se deja SOLO service_role — el caller admin. Esto difiere de los RPCs originales (INVOKER), que
-- eran RLS-safe aun ejecutables por authenticated.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) get_platform_mrr_12_months — MRR mensual de los últimos 12 meses.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."get_platform_mrr_12_months"()
    RETURNS TABLE("ym" "text", "mrr_clp" numeric, "coach_count" bigint)
    LANGUAGE "sql" STABLE
    SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
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
    -- Exclusión de cuentas de prueba (espejo de lib/test-accounts.ts — mantener en sincronía).
    LEFT JOIN auth.users u ON u.id = c.id
    WHERE c.id IS NULL      -- preservar los meses sin filas (LEFT JOIN del agregado)
       OR u.email IS NULL   -- coach real sin email en auth.users → NO es de prueba, cuenta (espejo TS: isTestCoachEmail(null)=false)
       OR (u.email NOT ILIKE '%@evatest.cl'
           AND lower(u.email) <> 'juanmvr2706@gmail.com')
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
    SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
    SELECT
        COALESCE(c.billing_cycle, 'monthly') AS billing_cycle,
        SUM(
            CASE c.subscription_tier
                WHEN 'starter' THEN 19990
                WHEN 'pro'     THEN 29990
                WHEN 'elite'   THEN 44990
                WHEN 'growth'  THEN 84990   -- LEGACY: fuera de venta, grandfathered cuenta MRR
                WHEN 'scale'   THEN 190000  -- LEGACY: fuera de venta, grandfathered cuenta MRR
                ELSE 0
            END
        )::numeric AS mrr_clp,
        COUNT(c.id)::bigint AS coach_count
    FROM public.coaches c
    -- Exclusión de cuentas de prueba (espejo de lib/test-accounts.ts — mantener en sincronía).
    LEFT JOIN auth.users u ON u.id = c.id
    WHERE c.subscription_status = 'active'
      AND c.payment_provider NOT IN ('beta', 'internal')
      AND c.subscription_mp_id IS NOT NULL
      -- NULL-safe: coach real sin email cuenta (espejo TS isTestCoachEmail(null)=false); solo se excluye email de prueba.
      AND (u.email IS NULL OR (u.email NOT ILIKE '%@evatest.cl' AND lower(u.email) <> 'juanmvr2706@gmail.com'))
    GROUP BY c.billing_cycle
    ORDER BY mrr_clp DESC;
$$;

ALTER FUNCTION "public"."get_platform_revenue_by_cycle"() OWNER TO "postgres";

-- ----------------------------------------------------------------------------
-- (3) get_platform_revenue_by_tier — MRR actual desglosado por tier.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."get_platform_revenue_by_tier"()
    RETURNS TABLE("tier" "text", "mrr_clp" numeric, "coach_count" bigint)
    LANGUAGE "sql" STABLE
    SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
    SELECT
        c.subscription_tier AS tier,
        SUM(
            CASE c.subscription_tier
                WHEN 'starter' THEN 19990
                WHEN 'pro'     THEN 29990
                WHEN 'elite'   THEN 44990
                WHEN 'growth'  THEN 84990   -- LEGACY: fuera de venta, grandfathered cuenta MRR
                WHEN 'scale'   THEN 190000  -- LEGACY: fuera de venta, grandfathered cuenta MRR
                ELSE 0
            END
        )::numeric AS mrr_clp,
        COUNT(c.id)::bigint AS coach_count
    FROM public.coaches c
    -- Exclusión de cuentas de prueba (espejo de lib/test-accounts.ts — mantener en sincronía).
    LEFT JOIN auth.users u ON u.id = c.id
    WHERE c.subscription_status = 'active'
      AND c.payment_provider NOT IN ('beta', 'internal')
      AND c.subscription_tier IS NOT NULL
      AND c.subscription_mp_id IS NOT NULL
      -- NULL-safe: coach real sin email cuenta (espejo TS isTestCoachEmail(null)=false); solo se excluye email de prueba.
      AND (u.email IS NULL OR (u.email NOT ILIKE '%@evatest.cl' AND lower(u.email) <> 'juanmvr2706@gmail.com'))
    GROUP BY c.subscription_tier
    ORDER BY mrr_clp DESC;
$$;

ALTER FUNCTION "public"."get_platform_revenue_by_tier"() OWNER TO "postgres";

-- SEGURIDAD (CRÍTICO): estos RPCs ahora son SECURITY DEFINER (corren como postgres, bypass RLS) y
-- devuelven el MRR/ingreso de TODA la plataforma. Por eso NO pueden ser ejecutables por anon/
-- authenticated — un coach autenticado leería las finanzas globales. El único caller real es el
-- panel admin con service-role (finanzas.queries.ts:42 + admin.queries.ts:46). Se revoca a todos
-- menos service_role. (idempotente: REVOKE/GRANT re-ejecutables sin efecto distinto.)
REVOKE EXECUTE ON FUNCTION "public"."get_platform_mrr_12_months"() FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "public"."get_platform_revenue_by_cycle"() FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "public"."get_platform_revenue_by_tier"() FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_platform_mrr_12_months"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_platform_revenue_by_cycle"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_platform_revenue_by_tier"() TO "service_role";
