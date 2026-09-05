-- ═══════════════════════════════════════════════════════════════════════════
-- Retiro de Starter (SDD docs/specs/retiro-starter-y-enterprise, owner 2026-09-05, D1=A, D3=A)
--
-- QUÉ HACE:
--   (1) coaches.subscription_tier deja de nacer 'starter' → nace 'free'.
--   (2) coaches.max_clients deja de nacer 10 (cupo de Starter) → nace 1 (cupo de Free en v3).
--   (3) La ÚNICA fila starter viva (qa-e2e-coach, persona QA de CI) pasa a pro/25 (D1=A).
--   (4) get_platform_coaches_by_tier_monthly() deja de contar cuentas @evatest.cl.
--
-- ADITIVA / IDEMPOTENTE / FORWARD-ONLY:
--   - ALTER COLUMN ... SET DEFAULT no reescribe la tabla ni valida filas (pg_attrdef).
--   - El UPDATE lleva predicado doble (tier + slug): una 2.ª corrida no toca ninguna fila.
--   - CERO DROP, cero rename, cero cambio de tipo. La ÚNICA función tocada es
--     get_platform_coaches_by_tier_monthly() por CREATE OR REPLACE, con la MISMA firma
--     (sin argumentos) y el MISMO tipo de retorno TABLE(ym text, tier text, coach_count bigint).
--   - NO se toca el CHECK coaches_subscription_tier_check (baseline:938) — D3=A.
--   - NO se toca admin_tier_monthly_price_clp (20260805211332:17-27): su rama 'starter'
--     es historia contable viva (billing_snapshots tiene 1 cobro Flow de 19.990, 2026-07-09).
--
-- PRECONDICIÓN VERIFICADA EN LIVE (2026-09-05 21:28Z, solo lectura):
--   free 89 (85 active + 1 canceled + 3 pending_email) · pro 11 active · starter 1 active
--   = qa-e2e-coach (19fc07a3-3080-4006-9325-9970de8cf55e, payment_provider 'mercadopago' con
--   subscription_mp_id / subscription_provider_external_id / provider_plan_id NULL ⇒ fuera del
--   MRR y de la reconciliación; 0 alumnos, 0 cobros). 0 cupones con scope starter.
--   DEFAULT vigente: subscription_tier 'starter'::text · max_clients 10.
--   ACL previa de get_platform_coaches_by_tier_monthly (INVOKER):
--     {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   Ensayo tx-rollback (DO … RAISE EXCEPTION) corrido antes de aplicar.
--
-- ROLLBACK:
--   alter table public.coaches alter column subscription_tier set default 'starter'::text;
--   alter table public.coaches alter column max_clients set default 10;
--   update public.coaches c
--      set subscription_tier = b.tier_prev, max_clients = b.max_clients_prev
--     from public._bak_starter_retire_20260905 b
--    where b.coach_id = c.id;
--   -- y re-aplicar el cuerpo de get_platform_coaches_by_tier_monthly() tal como está en
--   -- supabase/migrations/00000000000001_baseline.sql:438-459 (INVOKER, search_path 'public',
--   -- sin JOIN a auth.users) + grant execute ... to public, anon, authenticated (ACL previa).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (1) DEFAULT de las DOS columnas del plan: tier Y cupo ──────────────────
-- Nadie en el código depende del DEFAULT: los INSERT de apps/web y de scripts/ escriben
-- subscription_tier y max_clients explícitos, no hay INSERT INTO public.coaches en SQL y ninguno
-- de los 3 triggers de coaches toca la columna. La trampa del insert distraído se cierra por
-- TIER **Y** POR CUPO: con el DEFAULT viejo una fila sin columnas explícitas nacía 'starter' con
-- max_clients 10 (baseline:908). Cambiar solo el tier dejaría un coach 'free' con cupo 10.
alter table public.coaches
    alter column subscription_tier set default 'free'::text;

alter table public.coaches
    alter column max_clients set default 1;

comment on column public.coaches.subscription_tier is
    'Plan del coach. Valores en venta: free/pro/elite. starter/growth/scale son LEGACY fuera de venta, conservados por el CHECK y por el histórico de billing_snapshots. DEFAULT free desde el retiro de Starter (2026-09-05).';

comment on column public.coaches.max_clients is
    'Cupo de alumnos del coach. DEFAULT 1 (cupo de Free en pricing v3) desde el retiro de Starter (2026-09-05); antes era 10, el cupo de Starter. Las filas vivas conservan su valor.';

-- ── (2) Respaldo en la MISMA transacción (patrón 20260821153527_pricing_v3_free_limits) ──
create table if not exists public._bak_starter_retire_20260905 as
  select c.id            as coach_id,
         c.slug,
         c.subscription_tier as tier_prev,
         c.max_clients   as max_clients_prev,
         now()           as backed_up_at
  from public.coaches c
  where c.subscription_tier = 'starter';

-- Una tabla _bak sin RLS ya fue hallazgo de auditoría en este repo (05-08): RLS on + revoke.
alter table public._bak_starter_retire_20260905 enable row level security;
revoke all on table public._bak_starter_retire_20260905 from anon, authenticated;

-- ── (3) La última fila starter → pro/25 (D1=A) ─────────────────────────────
-- Los smokes abren paneles; un smoke futuro que cree 1 alumno no choca con cupo 1.
-- max_clients 25 = TIER_CONFIG.pro.maxClients.
update public.coaches
   set subscription_tier = 'pro',
       max_clients       = 25
 where subscription_tier = 'starter'
   and slug = 'qa-e2e-coach';

-- ── (4) La serie «coaches por tier» deja de contar cuentas de prueba ───────
-- Sin esto, D1=A mete al coach QA en la barra 'pro' del panel admin (hoy contamina la de
-- 'starter'): el gráfico se recalcula EN VIVO desde public.coaches, no hay serie histórica.
-- Cuerpo VERBATIM de baseline.sql:438-459 + la MISMA exclusión de cuentas de prueba que ya
-- usan las RPC de MRR (20260805211332_fix_platform_mrr_net_flow_coupons.sql:98-103).
-- La versión del baseline es INVOKER con search_path 'public' y NO puede leer auth.users:
-- se copia el modo de la RPC de MRR (20260805211332:75-76): STABLE SECURITY DEFINER +
-- search_path 'public','auth'. Misma firma, mismo retorno.
create or replace function public.get_platform_coaches_by_tier_monthly()
 returns table(ym text, tier text, coach_count bigint)
 language sql
 stable security definer
 set search_path to 'public', 'auth'
as $function$
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
    LEFT JOIN auth.users u ON u.id = c.id
    WHERE u.email IS NULL
       OR u.email NOT ILIKE '%@evatest.cl'
    GROUP BY m.m, c.subscription_tier
    ORDER BY m.m, c.subscription_tier;
$function$;

-- Al pasar a SECURITY DEFINER, el EXECUTE de PUBLIC/anon/authenticated del baseline dejaría a
-- cualquier sesión anónima leyendo un agregado que ahora nace de auth.users. El ÚNICO llamador
-- es el panel admin con service_role (admin/(panel)/dashboard/_data/admin.queries.ts:46,72);
-- mismo patrón «helpers internos del panel» de 20260805211332:67-69.
revoke execute on function public.get_platform_coaches_by_tier_monthly()
  from public, anon, authenticated;

-- ── (5) Verificación en la misma sesión ────────────────────────────────────
-- select count(*) from public.coaches where subscription_tier = 'starter';        -- → 0
-- select column_name, column_default from information_schema.columns
--  where table_schema='public' and table_name='coaches'
--    and column_name in ('subscription_tier', 'max_clients');                      -- → 'free'::text y 1
-- select count(*) from public._bak_starter_retire_20260905;                        -- → 1
-- select * from public.get_platform_coaches_by_tier_monthly();                     -- → sin cuentas @evatest.cl
