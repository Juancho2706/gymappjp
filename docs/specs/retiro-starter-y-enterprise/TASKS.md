---
status: draft
owner: product-engineering
last_verified: "2026-09-05"
canonical: false
---

# TASKS — Retiro de Starter «como tal» + demolición gradual de Enterprise

Desglose ejecutable de [PLAN](PLAN.md) (nombres canónicos = PLAN §1, no inventar variantes) bajo las
decisiones de [SPEC §5](SPEC.md). Cada tarea es atómica: archivo(s):línea, qué cambia, criterio de verde
verificable, estimación en fracción de día-agente (d-a), etiqueta VISIBLE/INVISIBLE, decisión de la que
depende, worker sugerido. **Nada de esto está ejecutado** (05-09): ningún gate corrió, ninguna migración
se aplicó, ningún archivo de producto se tocó. Los gates se acumulan en las secciones «Gates acumulados» y
los corre el owner desde Claude Code web al cierre de cada tren.

Escrito por dos writers Opus a partir de 9 informes de lectura y corregido con el juicio del jefe sobre la
crítica adversarial (3 críticos, 30 hallazgos, 27 sobrevivieron a la refutación): ver § «Juicio del jefe»
al final. Índice: **Frente S** (S0 → S1 → S2 → S3 → Gates S → Checklist S) · **Frente E** (E0 → E1 → E2 →
E3 → E4 → Gates E → Checklist E) · **Juicio del jefe**.

---

# FRENTE S — Starter


> Al mergear en `docs/specs/retiro-starter-y-enterprise/TASKS.md`: los enlaces a SPEC/PLAN van como `[SPEC](SPEC.md)` / `[PLAN](PLAN.md)` (relativos, los valida `scripts/check-docs.mjs:166-186`).

Desglose ejecutable del frente S de `SPEC.md` §2.1 y `PLAN.md` §2. Nombres canónicos = PLAN §1 (no inventar variantes: `parseSubscriptionTier`, `LEGACY_TIER_ALIASES`, `2026MMDDHHMMSS_retire_starter_default_and_last_row.sql`).

Convención de cada tarea: **id · archivo(s):línea · qué cambia (texto exacto en los swaps) · verde verificable · d-a (fracción de día-agente) · VISIBLE/INVISIBLE · decisión D* de la que depende · worker sugerido**. Todas las rutas y líneas de abajo fueron verificadas con `git grep`/`sed` en HEAD `4e3f139b` de la rama `rnmobiledenuevo`.

**Regla dura heredada:** ningún gate corre durante la escritura; se acumulan en [§ Gates acumulados (S)](#gates-acumulados-s), que tiene dos bloques: **Verificación por tanda (opcional)** —cortes baratos que el owner decide cuándo correr, salteables— y el **Tren de cierre**, obligatorio, UNA vez, antes del push.

Orden obligado: **S0 (dato) → S1 (red) → S2.0 (mockup-lote aprobado) → S2 (retiro) → S3 (superficies) → tren de cierre → push → deploy → OTA**. S1 vale por sí solo aunque S2 se posponga.

Total: **41 tareas** · ~3,5 d-a.

---

## S0 · DB aditiva

INVISIBLE en su totalidad (nadie ve el DEFAULT ni la fila QA). Requiere **D1** cerrada antes de empezar. Branching NO existe ⇒ protocolo aditivo-en-LIVE: **tx-rollback → advisors antes → `apply_migration` → advisors después → espejo local**.

### S0.1 · Verificación LIVE previa (4 SELECT)
- **Archivo(s):** ninguno (MCP Supabase, solo lectura).
- **Qué:** correr los 4 SELECT y pegar la salida en el registro de la tanda.
  ```sql
  -- (a) conteo por tier/status
  select subscription_tier, subscription_status, count(*)
    from public.coaches group by 1,2 order by 1,2;
  -- (b) identidad de la única fila starter
  select id, slug, max_clients, payment_provider, subscription_mp_id,
         subscription_provider_external_id, provider_plan_id
    from public.coaches where subscription_tier = 'starter';
  -- (c) DEFAULT vigente de las DOS columnas que toca S0.2
  select column_name, column_default from information_schema.columns
   where table_schema='public' and table_name='coaches'
     and column_name in ('subscription_tier', 'max_clients');
  -- (d) cupones con scope starter — precondición de S2.10 (re-verificar el DÍA de ejecutar,
  --     no vale la foto del 05-09: un cupón nuevo con scope starter revive el guard)
  select count(*) from public.coupons where applies_to_scope::text ilike '%starter%';
  ```
- **Verde:** (a) exactamente **1** fila `starter/active`; (b) `slug='qa-e2e-coach'`, `payment_provider='admin'`, `subscription_mp_id` y `subscription_provider_external_id` **null**, `provider_plan_id` null; (c) `subscription_tier` ⇒ `'starter'::text` y `max_clients` ⇒ `10` (el DEFAULT del baseline, `00000000000001_baseline.sql:908`); (d) **0**.
- **Si (d) devuelve >0:** PARAR **S2.10** (no el tren): el guard de cupones solo-starter sigue teniendo materia viva y no se borra. El resto de S0–S3 sigue igual.
- **Si (a) devuelve >1 fila:** PARAR y volver al jefe — el UPDATE de S0.2 tiene predicado por slug y dejaría filas afuera.
- **d-a:** 0,05 · **INVISIBLE** · **D1** · **jefe**

### S0.2 · Redactar el archivo de migración (SQL completo, dos variantes de D1)
- **Archivo:** `supabase/migrations/2026MMDDHHMMSS_retire_starter_default_and_last_row.sql` (timestamp ISO real al aplicar; archivo **nuevo**, cero edición de migraciones aplicadas).
- **Qué:** escribir exactamente este cuerpo. La variante **A** de D1 queda activa; la **B** queda comentada abajo (se intercambian sin tocar el resto).
  ```sql
  -- ═══════════════════════════════════════════════════════════════════════════
  -- Retiro de Starter (SDD docs/specs/retiro-starter-y-enterprise, owner 2026-09-05)
  --
  -- QUÉ HACE:
  --   (1) coaches.subscription_tier deja de nacer 'starter' → nace 'free'.
  --   (2) coaches.max_clients deja de nacer 10 (cupo de Starter) → nace 1 (cupo de Free en v3).
  --   (3) La ÚNICA fila starter viva (qa-e2e-coach, persona QA de CI) pasa a pro/25 (D1=A).
  --   (4) get_platform_coaches_by_tier_monthly() deja de contar cuentas @evatest.cl.
  --
  -- ADITIVA / IDEMPOTENTE / FORWARD-ONLY:
  --   - ALTER COLUMN ... SET DEFAULT no reescribe la tabla ni valida filas (pg_attrdef):
  --     ACCESS EXCLUSIVE de microsegundos sobre 101 filas.
  --   - El UPDATE lleva predicado doble (tier + slug): una 2.ª corrida no toca ninguna fila.
  --   - CERO DROP, cero rename, cero cambio de tipo. La ÚNICA función tocada es
  --     get_platform_coaches_by_tier_monthly() por CREATE OR REPLACE, con la MISMA firma
  --     (sin argumentos) y el MISMO tipo de retorno TABLE(ym text, tier text, coach_count bigint).
  --   - NO se toca el CHECK coaches_subscription_tier_check (baseline:938) — D3=A.
  --   - NO se toca admin_tier_monthly_price_clp (20260805211332:17-27): su rama 'starter'
  --     es historia contable viva (billing_snapshots tiene 1 cobro Flow de 19.990, 2026-07-09).
  --
  -- PRECONDICIÓN VERIFICADA EN LIVE (2026-09-05, solo lectura):
  --   free 89 · pro 11 active · starter 1 active = qa-e2e-coach
  --   (19fc07a3-3080-4006-9325-9970de8cf55e, payment_provider 'admin', 0 alumnos, 0 cobros).
  --
  -- ROLLBACK:
  --   alter table public.coaches alter column subscription_tier set default 'starter'::text;
  --   alter table public.coaches alter column max_clients set default 10;
  --   update public.coaches c
  --      set subscription_tier = b.tier_prev, max_clients = b.max_clients_prev
  --     from public._bak_starter_retire_2026MMDD b
  --    where b.coach_id = c.id;
  --   -- y re-aplicar el cuerpo de get_platform_coaches_by_tier_monthly() tal como está en
  --   -- supabase/migrations/00000000000001_baseline.sql:438-459 (INVOKER, search_path 'public',
  --   -- sin JOIN a auth.users) + grant execute ... to anon, authenticated (baseline:3478-3479).
  -- ═══════════════════════════════════════════════════════════════════════════

  -- ── (1) DEFAULT de las DOS columnas del plan: tier Y cupo ──────────────────
  -- Nadie en el código depende del DEFAULT: los 7 INSERT de apps/web y los de scripts/ escriben
  -- subscription_tier explícito, no hay INSERT INTO public.coaches en SQL y ninguno de los 3
  -- triggers de coaches (coaches_updated_at, coaches_org_managed_guard,
  -- coaches_invite_code_set_once) toca la columna.
  -- La trampa del insert distraído se cierra por TIER **Y** POR CUPO: con el DEFAULT viejo,
  -- una fila creada sin columnas explícitas nacía 'starter' con max_clients 10 (baseline:908).
  -- Cambiar solo el tier dejaría un coach 'free' con cupo 10 — el cupo de Starter, no el de Free
  -- (TIER_CONFIG.free.maxClients = 1 desde pricing v3). Por eso van juntos.
  alter table public.coaches
      alter column subscription_tier set default 'free'::text;

  alter table public.coaches
      alter column max_clients set default 1;

  comment on column public.coaches.subscription_tier is
      'Plan del coach. Valores en venta: free/pro/elite. starter/growth/scale son LEGACY '
      'fuera de venta, conservados por el CHECK y por el histórico de billing_snapshots. '
      'DEFAULT free desde el retiro de Starter (2026-09-05).';

  comment on column public.coaches.max_clients is
      'Cupo de alumnos del coach. DEFAULT 1 (cupo de Free en pricing v3) desde el retiro de '
      'Starter (2026-09-05); antes era 10, el cupo de Starter. Las filas vivas conservan su valor.';

  -- ── (2) Respaldo en la MISMA transacción (patrón 20260821153527_pricing_v3_free_limits) ──
  create table if not exists public._bak_starter_retire_2026MMDD as
    select c.id            as coach_id,
           c.slug,
           c.subscription_tier as tier_prev,
           c.max_clients   as max_clients_prev,
           now()           as backed_up_at
    from public.coaches c
    where c.subscription_tier = 'starter';

  -- Una tabla _bak sin RLS ya fue hallazgo de auditoría en este repo (05-08): RLS on + revoke.
  alter table public._bak_starter_retire_2026MMDD enable row level security;
  revoke all on table public._bak_starter_retire_2026MMDD from anon, authenticated;

  -- ── (3) La última fila starter ─────────────────────────────────────────────
  -- D1 = A (RECOMENDADA): coach QA a pro/25. Los smokes abren paneles; un smoke futuro que cree
  -- 1 alumno no choca con cupo 1. max_clients 25 = TIER_CONFIG.pro.maxClients.
  update public.coaches
     set subscription_tier = 'pro',
         max_clients       = 25
   where subscription_tier = 'starter'
     and slug = 'qa-e2e-coach';

  -- D1 = B (alternativa, si el owner prefiere cobertura de Free): reemplaza el UPDATE de arriba.
  -- Condición explícita: ningún smoke puede crear alumnos (cupo 1) y /c/qa-e2e-coach pasa a
  -- mostrar el sello «Hecho con EVA».
  -- update public.coaches
  --    set subscription_tier = 'free',
  --        max_clients       = 1        -- TIER_CONFIG.free.maxClients
  --  where subscription_tier = 'starter'
  --    and slug = 'qa-e2e-coach';

  -- ── (4) La serie «coaches por tier» deja de contar cuentas de prueba ───────
  -- Sin esto, D1=A mete al coach QA en la barra 'pro' del panel admin (hoy contamina la de
  -- 'starter'): el gráfico se recalcula EN VIVO desde public.coaches, no hay serie histórica.
  -- Cuerpo VERBATIM de baseline.sql:438-459 + la MISMA exclusión de cuentas de prueba que ya
  -- usan las RPC de MRR (20260805211332_fix_platform_mrr_net_flow_coupons.sql:98-103).
  -- OJO (verificado, no es cosmético): la versión del baseline es INVOKER con
  -- search_path 'public' y NO puede leer auth.users. Para el JOIN hay que copiar también el
  -- modo de la RPC de MRR (20260805211332:75-76): STABLE SECURITY DEFINER + search_path
  -- 'public','auth'. Misma firma, mismo retorno.
  -- NO se copia la 2.ª exclusión de la RPC de MRR (lower(u.email) <> 'juanmvr2706@gmail.com'):
  -- fuera del alcance de esta ola; acá solo se excluyen las cuentas @evatest.cl.
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

  -- Al pasar a SECURITY DEFINER, el GRANT ALL a anon/authenticated del baseline (:3478-3479)
  -- dejaría a cualquier sesión anónima leyendo un agregado que ahora nace de auth.users.
  -- El ÚNICO llamador es el panel admin con service_role
  -- (admin/(panel)/dashboard/_data/admin.queries.ts:46 createServiceRoleClient + :72 la RPC);
  -- mismo patrón «helpers internos del panel» de 20260805211332:67-69.
  revoke execute on function public.get_platform_coaches_by_tier_monthly()
    from anon, authenticated;

  -- ── (5) Verificación en la misma sesión ────────────────────────────────────
  -- select count(*) from public.coaches where subscription_tier = 'starter';        -- → 0
  -- select column_name, column_default from information_schema.columns
  --  where table_schema='public' and table_name='coaches'
  --    and column_name in ('subscription_tier', 'max_clients');
  --                                                       -- → 'free'::text  y  1
  -- select count(*) from public._bak_starter_retire_2026MMDD;                        -- → 1
  -- select * from public.get_platform_coaches_by_tier_monthly();   -- → sin el coach QA
  ```
- **Verde:** el archivo existe, tiene bloque `ROLLBACK:` en el encabezado (patrón `20260905190100_sec01_phase3_revoke_invite_code_anon.sql:33`) y **cero** `drop`/`alter constraint`. El único `create or replace function` es `get_platform_coaches_by_tier_monthly()` (bloque 4), con firma y retorno idénticos a `baseline.sql:438` — verificable con `grep -c "create or replace function" <archivo>` ⇒ **1**.
- **d-a:** 0,12 · **INVISIBLE** · **D1**, **D3** · **jefe**

### S0.3 · Ensayo tx-rollback en LIVE
- **Qué:** `begin;` + el cuerpo completo de S0.2 + los 4 SELECT de verificación (bloque 5) + **`rollback;`**, todo en UNA llamada.
- **Verde:** dentro de la transacción → `count(starter)=0`, `column_default` de `subscription_tier` = `'free'::text` **y** de `max_clients` = `1`, `_bak` con **1** fila, y `get_platform_coaches_by_tier_monthly()` **sin** el coach QA (ninguna fila lo cuenta en ningún `ym`); y tras el `rollback` el SELECT (c) de S0.1 vuelve a devolver `'starter'::text` y `10`.
- **d-a:** 0,05 · **INVISIBLE** · **D1** · **jefe**

### S0.4 · Advisors ANTES
- **Qué:** `get_advisors` (security + performance) y guardar la foto base.
- **Verde:** foto guardada; se usa solo para comparar en S0.6.
- **d-a:** 0,02 · **INVISIBLE** · — · **jefe**

### S0.5 · `apply_migration`
- **Qué:** `apply_migration` con `name` = el nombre del archivo de S0.2. **Nunca `db push` ciego.**
- **Verde:** sin error; la versión aparece en `supabase_migrations.schema_migrations`.
- **d-a:** 0,02 · **INVISIBLE** · **D1** · **jefe**

### S0.6 · Verificación posterior + advisors DESPUÉS
- **Qué:** repetir S0.1 (a) y (c), más `select count(*) from public._bak_starter_retire_2026MMDD;`, `select * from public.get_platform_coaches_by_tier_monthly();`, y `get_advisors` de nuevo.
- **Verde:** 0 filas starter · `column_default` `'free'::text` (tier) y `1` (max_clients) · 1 fila de respaldo · la serie por tier **sin** el coach QA · **sin críticos nuevos**. Avisos esperables y aceptados: `rls_enabled_no_policy` sobre `_bak_starter_retire_…` (igual que `_bak_pricing_v3_free_limits_20260821`) y, si aparece, `function_search_path_mutable`/`security_definer` sobre `get_platform_coaches_by_tier_monthly` — es el **mismo** perfil que ya tiene `get_platform_mrr_12_months` (`search_path` fijado a `'public','auth'`, EXECUTE revocado a anon/authenticated). Si el advisor la marca y **no** marca a la de MRR, PARAR y volver al jefe.
- **d-a:** 0,03 · **INVISIBLE** · — · **jefe**

### S0.7 · Espejo local de la migración
- **Archivo:** `supabase/migrations/<version aplicada>_retire_starter_default_and_last_row.sql`.
- **Qué:** commitear el archivo con **exactamente** el SQL aplicado (renombrando `2026MMDDHHMMSS`/`_2026MMDD` al timestamp real en el nombre del archivo **y** en el nombre de la tabla `_bak`). Sin regen de `database.types.ts`: la columna sigue `text` y el archivo no contiene `starter` (0 hits verificados); la firma (sin args) y el retorno de `get_platform_coaches_by_tier_monthly` tampoco cambian, así que su entrada en el bloque `Functions` (`apps/web/src/lib/database.types.ts`) queda idéntica.
- **Verde:** `git status` muestra 1 archivo nuevo; el nombre de la tabla `_bak` del archivo coincide byte a byte con la que existe en LIVE.
- **d-a:** 0,05 · **INVISIBLE** · — · **Opus**

### S0.8 · Único escritor de starter del repo
- **Archivo:** `scripts/qa-seed-team-movida.mjs:274`.
- **Qué:** `subscription_tier: 'starter',` → `subscription_tier: 'scale',` (es lo que escriben los otros dos caminos de coach de team: `teams.actions.ts:85`, `team.actions.ts:92`, y es coherente con el `subscription_status: 'team_managed'` que el propio script escribe en `:273`).
- **Verde:** `git grep -n "subscription_tier: 'starter'" -- scripts` ⇒ 0. **No** re-correr el script (`--up` genera `scripts/qa-seed-team-movida.json`, ruta prohibida por `scripts/check-docs.mjs:41-46`).
- **d-a:** 0,02 · **INVISIBLE** · — · **Sonnet**

---

## S1 · Blindaje

INVISIBLE, **commit propio**, vale por sí solo aunque S2 se posponga. Contrato único que este bloque escribe en el JSDoc del paquete: **«un tier fuera del catálogo se trata como `free`: precio 0, capabilities de free, ciclos `[]`, rank 0; `isBrandingAllowed` y `showsEvaBadge` conservan su semántica propia (fail-closed / fail-open) porque leen `TIER_CAPABILITIES` directo»**.

### S1.1 · `getTierPriceClp` con red
- **Archivo:** `packages/tiers/index.ts:272-273`.
- **Qué:** `const monthly = TIER_CONFIG[tier].monthlyPriceClp` → `const monthly = TIER_CONFIG[tier]?.monthlyPriceClp ?? 0`.
- **Por qué:** lo llaman `api/payments/subscription-status/route.ts:72`, `webhook-pipeline.ts:307`, `cron/mp-reconcile`, `cron/flow-reconcile` y `addons/_lib/coach-context.ts:132` — money-path.
- **Verde:** test nuevo de S1.11 «tier desconocido ⇒ 0 en los 3 ciclos» verde.
- **d-a:** 0,03 · **INVISIBLE** · — · **Opus**

### S1.2 · `getTierCapabilities` con red
- **Archivo:** `packages/tiers/index.ts:377-378`.
- **Qué:** `return TIER_CAPABILITIES[tier]` → `return TIER_CAPABILITIES[tier] ?? TIER_CAPABILITIES.free`.
- **Consecuencia declarada (2.º orden):** los azúcares de `apps/mobile/lib/coach-tiers.ts:44-56` (`canUseNutrition`/`canUseBranding`/`canCreateCustomExercises`/`canImportClients`) hoy son fail-closed por el `?.` sobre `undefined`; con el fallback a `free` pasan a **fail-open** para un tier corrupto (free tiene las 4 en `true` desde pricing v3). Es inalcanzable en la práctica porque `apps/mobile/lib/coach.ts:35` normaliza antes con `parseSubscriptionTier` (S1.10), pero **hay que declararlo**. `isBrandingAllowed:392-393` y `showsEvaBadge:404-405` NO cambian (leen el Record directo, conservan fail-closed / fail-open).
- **Verde:** test nuevo «tier desconocido ⇒ capabilities de free» + `packages/tiers/pricing-v3.test.ts` verde.
- **d-a:** 0,03 · **INVISIBLE** · — · **Opus**

### S1.3 · `getTierAllowedBillingCycles` con red
- **Archivo:** `packages/tiers/index.ts:471-472`.
- **Qué:** `return TIER_ALLOWED_BILLING_CYCLES[tier]` → `return TIER_ALLOWED_BILLING_CYCLES[tier] ?? []`.
- **Verde:** test «tier desconocido ⇒ `[]`».
- **d-a:** 0,02 · **INVISIBLE** · — · **Opus**

### S1.4 · `isBillingCycleAllowedForTier` con red
- **Archivo:** `packages/tiers/index.ts:475-479`.
- **Qué:** `return TIER_ALLOWED_BILLING_CYCLES[tier].includes(cycle)` → `return (TIER_ALLOWED_BILLING_CYCLES[tier] ?? []).includes(cycle)`.
- **Por qué:** es el que revienta el retorno del checkout cuando un `external_reference` legacy trae un tier fuera del catálogo (`confirm-subscription/route.ts:122`).
- **Verde:** test «tier desconocido ⇒ false en los 3 ciclos».
- **d-a:** 0,02 · **INVISIBLE** · — · **Opus**

### S1.5 · `getDefaultBillingCycleForTier` + `getTierBillingCycleSummary` con red
- **Archivos:** `packages/tiers/index.ts:483-484` y `:488-489`.
- **Qué:** `:484` `return TIER_ALLOWED_BILLING_CYCLES[tier][0] ?? 'monthly'` → `return TIER_ALLOWED_BILLING_CYCLES[tier]?.[0] ?? 'monthly'` (el `??` de hoy no salva: `[tier]` ya es `undefined`). `:489` `const cycles = TIER_ALLOWED_BILLING_CYCLES[tier]` → `const cycles = TIER_ALLOWED_BILLING_CYCLES[tier] ?? []`.
- **Verde:** test «tier desconocido ⇒ `'monthly'`» y «summary no lanza».
- **d-a:** 0,03 · **INVISIBLE** · — · **Opus**

### S1.6 · `getTierRank` con red
- **Archivo:** `packages/tiers/index.ts:554-555`.
- **Qué:** `return TIER_RANK[tier]` → `return TIER_RANK[tier] ?? 0`.
- **Consecuencia declarada:** un tier desconocido cuenta como free en `comparePlanDirection` y en `services/billing/sales-emails.service.ts:276` (⇒ el correo de cupo lleno recomienda **Pro**, no Elite). Es el comportamiento deseado; sin esto el bug es **silencioso** (`undefined < 2` es `false`).
- **Verde:** test «`getTierRank('basura') === 0`» + `packages/tiers/plan-direction.test.ts` verde.
- **d-a:** 0,02 · **INVISIBLE** · — · **Opus**

### S1.7 · Contrato de fallback en JSDoc
- **Archivo:** `packages/tiers/index.ts`, bloque de doc de cada uno de los **7** helpers de S1.1–S1.6 (S1.5 blinda dos) (+ el encabezado del archivo).
- **Qué:** agregar en cada uno la línea exacta: `Un tier fuera del catálogo se trata como free (precio 0, capabilities de free, ciclos [], rank 0).` En el encabezado del archivo, la excepción: `isBrandingAllowed sigue fail-closed y showsEvaBadge fail-open: leen TIER_CAPABILITIES directo, no pasan por getTierCapabilities.`
- **Verde:** `pnpm exec eslint packages/tiers/index.ts` sin errores; revisión del jefe.
- **d-a:** 0,05 · **INVISIBLE** · — · **Opus**

### S1.8 · Lectores de tier sin red (5)
Corre **después de S1.9** (necesita el export). Los 5 son casts crudos de la fila de DB al union, sin `?? 'free'`, y los 5 alimentan money-path (`getTierPriceClp` / contexto de add-ons).

| # | Archivo:línea | ANTES | DESPUÉS |
|---|---|---|---|
| 1 | `apps/web/src/app/api/payments/subscription-status/route.ts:63` | `const tier = coach.subscription_tier as SubscriptionTier` | `const tier = parseSubscriptionTier(coach.subscription_tier)` — alimenta `getTierPriceClp` en `:72` |
| 2 | `apps/web/src/app/api/mobile/coach/subscription-status/route.ts:90` | `const tier = coach.subscription_tier as SubscriptionTier` | ídem (gemelo RN del anterior) |
| 3 | `apps/web/src/app/api/payments/addons/_lib/coach-context.ts:87` | `tier: row.subscription_tier as SubscriptionTier,` | `tier: parseSubscriptionTier(row.subscription_tier),` (contexto de alta de add-on) |
| 4 | `apps/web/src/app/api/payments/addons/_lib/coach-context.ts:103` | `tier: row.subscription_tier as SubscriptionTier,` | ídem (`buildCancelContext`) |
| 5 | `apps/web/src/app/api/payments/confirm-addon/route.ts:136` | `tier: coach.subscription_tier as SubscriptionTier,` | `tier: parseSubscriptionTier(coach.subscription_tier),` |

- **Import:** los 4 archivos ya importan del alias del monorepo (`@/lib/constants`, p. ej. `subscription-status/route.ts:13`), no de `@eva/tiers` directo ⇒ sumar `parseSubscriptionTier` a ese mismo import (S1.9 lo re-exporta ahí) y borrar `type SubscriptionTier` solo si queda sin usos.
- **Verde:** `pnpm vitest run apps/web/src/app/api/payments/` verde; `git grep -n "subscription_tier as SubscriptionTier" -- apps/web/src/app/api` ⇒ **0**.
- **Fuera de alcance, verificado (los 5 hits que el grep sigue devolviendo en `apps/web/src`):** `coach/subscription/_components/SubscriptionContent.tsx:201,639,989,1017` (superficie de UI, con `?.`/fallback propio; `:639` es el caso «tier desconocido se pinta crudo» de S2.11) y `lib/payments/webhook-pipeline.ts:1312` (`… as SubscriptionTier | undefined) ?? tier`, ya tiene red). `app/coach/layout.tsx:188` **no aparece** en este grep (usa `(coach.subscription_tier ?? 'free') as SubscriptionTier`) y **no se toca** — ver S1.10.
- **d-a:** 0,08 · **INVISIBLE** · — · **Opus**

### S1.9 · `parseSubscriptionTier` + `LEGACY_TIER_ALIASES` (fuente única)
- **Archivos:** `packages/tiers/index.ts` (nuevos exports, junto a `isSaleTier:87`); `apps/web/src/lib/constants.ts` (bloque de re-export de valores, hoy `:85-…`); `apps/mobile/lib/coach-tiers.ts` (bloque `export { … }`).
- **Qué:**
  ```ts
  /**
   * Parser tolerante ÚNICO del valor crudo de `coaches.subscription_tier`.
   * 'free'|'pro'|'elite'|'growth'|'scale' ⇒ el mismo; cualquier otra cosa
   * ('starter', 'starter_lite', null, basura) ⇒ 'free'. Reemplaza las 5 copias.
   */
  export function parseSubscriptionTier(raw: unknown): SubscriptionTier {
      const v = String(raw ?? 'free').toLowerCase()
      if (v === 'free' || v === 'pro' || v === 'elite' || v === 'growth' || v === 'scale') return v
      return 'free'
  }

  /**
   * SOLO para deep-links de VENTA viejos (`?tier=`) en TRES pantallas: reactivate, processing
   * y flow-processing. `register` queda FUERA a propósito: ahí un tier fuera de venta degrada
   * a 'free' ((auth)/register/page.tsx:247-253, «ante un tier que ya no existe, el default
   * seguro es el que no cobra»); mapearlo a 'pro' le inventaría un cobro al que se registra.
   * NUNCA para filas de DB (para eso está parseSubscriptionTier).
   */
  export const LEGACY_TIER_ALIASES: Record<string, SaleTier> = {
      starter: 'pro',
      starter_lite: 'pro',
  }
  ```
  Re-exportar ambos desde `apps/web/src/lib/constants.ts`. **Consumidores de `LEGACY_TIER_ALIASES`: exactamente 3** (`ReactivateClient.tsx:128` en S2.6; `processing/page.tsx:118` y `flow-processing/page.tsx:59` en S2.7). `(auth)/register/page.tsx:250-253` **NO se toca**: conserva `isSaleTier(rawTier) ? rawTier : 'free'`. En `apps/mobile/lib/coach-tiers.ts` re-exportar **solo `parseSubscriptionTier`** (`LEGACY_TIER_ALIASES` es de venta y RN no vende: regla de tiendas). **Prohibido** re-exportar `TIER_CONFIG` a mobile — lo bloquea `tools/eslint-rules/rules/no-prices-in-mobile.mjs:21`.
- **Verde:** `pnpm vitest run packages/tiers` verde con los casos de S1.11; `pnpm exec eslint --config eslint.mobile.config.mjs apps/mobile/lib/coach-tiers.ts` sin errores.
- **d-a:** 0,1 · **INVISIBLE** · — · **Opus**

### S1.10 · Adopción: borrar las 5 copias del parser
- **Archivos y líneas exactas (las 5 copias son la MISMA función):**
  | # | Archivo | Función local a borrar | Línea con `'starter'` |
  |---|---|---|---|
  | 1 | `apps/web/src/app/coach/dashboard/page.tsx` | `normalizeCoachSubscriptionTier` `:16-22` | `:20` |
  | 2 | `apps/web/src/app/coach/guia/page.tsx` | `normalizeCoachSubscriptionTier` `:31-36` | `:34` |
  | 3 | `apps/web/src/app/coach/layout.tsx` | `normalizeCoachTier` `:51-57` | `:54` |
  | 4 | `apps/web/src/app/api/mobile/coach/dashboard/route.ts` | `normalizeSubscriptionTier` `:50-56` | `:54` |
  | 5 | `apps/mobile/lib/coach.ts` | `normalizeSubscriptionTier` `:35-41` | `:39` |
- **Qué:** borrar las 5 funciones (con su comentario `LEGACY (plan 04)…`) y reemplazar cada llamada por `parseSubscriptionTier(...)`: `dashboard/page.tsx:45`, `guia/page.tsx:60`, `layout.tsx` (uso del `normalizeCoachTier`), `api/mobile/coach/dashboard/route.ts:140`, `apps/mobile/lib/coach.ts` (uso en el mapeo de `CoachProfile`).
- **`apps/web/src/app/coach/layout.tsx:188` NO se toca** (juicio del jefe, J-S5): `isBrandingAllowed((coach.subscription_tier ?? 'free') as SubscriptionTier)` se queda con el cast crudo. Es el fail-closed deliberado y documentado de marca (`:176-179`: «tier inválido/stale ⇒ panel EVA»), y su poda pertenece a la ola «solo cupo + sello» ([SPEC §4.2](SPEC.md), **D4**).
- **Consecuencia declarada (2.º orden) de NO adoptarlo acá:** si se metiera `parseSubscriptionTier` en `:188`, todo valor crudo aterrizaría dentro del union y —tras S2.2— los 5 tiers vivos tienen `canUseBranding: true` (`packages/tiers/index.ts:222` free, `:237` pro, `:243` elite, `:251` growth, `:259` scale) ⇒ `isBrandingAllowed(parseSubscriptionTier(x))` sería **constante `true`**: el fail-closed pasaría a ser código muerto sin que ningún test lo note. Por eso el cast crudo se conserva a propósito y es el único hit legítimo de su forma en `app/coach/`.
- **Verde:** `git grep -n "normalizeCoachSubscriptionTier\|normalizeCoachTier\|normalizeSubscriptionTier" -- apps packages` ⇒ 0; `pnpm --filter @eva/web typecheck` verde; `pnpm vitest run apps/web/src/app/api/mobile/coach/dashboard/route.test.ts` verde tras S3.6.
- **Ojo:** esta tarea **cambia comportamiento hoy mismo** para una fila starter residual (pasaría a `'free'`). Es inobservable porque S0 dejó 0 filas starter — por eso S0 va antes.
- **d-a:** 0,15 · **INVISIBLE** · — · **Opus**

### S1.11 · Tests nuevos del blindaje
- **Archivo nuevo:** `packages/tiers/parse-subscription-tier.test.ts`.
- **Qué:** dos `describe`.
  1. «tier fuera del catálogo ⇒ free en los 7 helpers blindados»: para el input `'legacy_unknown' as SubscriptionTier` ⇒ `getTierPriceClp` 0 en los 3 ciclos · `getTierCapabilities` `toEqual(TIER_CAPABILITIES.free)` (vía `getTierCapabilities('free')`) · `getTierAllowedBillingCycles` `[]` · `isBillingCycleAllowedForTier` false ×3 · `getDefaultBillingCycleForTier` `'monthly'` · `getTierBillingCycleSummary` no lanza · `getTierRank` 0. Más el pin de la excepción: `isBrandingAllowed('legacy_unknown')` **false** (fail-closed) y `showsEvaBadge('legacy_unknown')` **true** (fail-open).
  2. «`parseSubscriptionTier`»: `'free'|'pro'|'elite'|'growth'|'scale'` ⇒ el mismo · `'starter'`, `'starter_lite'`, `'STARTER'`, `null`, `undefined`, `''`, `42`, `{}` ⇒ `'free'` · y `LEGACY_TIER_ALIASES.starter === 'pro'`, `LEGACY_TIER_ALIASES.starter_lite === 'pro'`.
- **Verde:** `pnpm vitest run packages/tiers/parse-subscription-tier.test.ts` verde.
- **d-a:** 0,1 · **INVISIBLE** · — · **Opus**

---

## S2 · Retiro del tipo

INVISIBLE salvo lo marcado. Precondición dura: **S0 aplicado** (0 filas starter en LIVE), **S1 mergeado** (los 7 helpers con red) y **S2.0 aprobado por el owner**.

### S2.0 · Mockup-lote S (precondición de S2)
Regla heredada ([SPEC §6](SPEC.md)): cada tren abre con un mockup-lote que fija la **lista cerrada** de superficies visibles. Nada de S2/S3 se ejecuta antes de que el owner apruebe este lote.

- **Qué:** juntar en el artifact del 05-09 (el mismo que abre el tren; el jefe pega su URL acá al aprobarlo) el ANTES/DESPUÉS de **estas 4 superficies y ninguna más**:

  | # | Superficie | ANTES | DESPUÉS |
  |---|---|---|---|
  | 1 | Chip de plan de `processing` (`processing/page.tsx:492` y `:701`) al volver de MP **sin `?tier`** | «Starter · Mensual» | **3 variantes de D2**: A sin chip · B «Pro · Mensual» · C plan real tras el poll |
  | 2 | Pantalla de error de `processing` con `from=register` **sin tier** (solo si D2=A) | hoy no existe: se hace el POST con `'starter'` | copy de `resolveCheckoutError` + salida a `/pricing` |
  | 3 | Chip de plan de `flow-processing` (`flow-processing/page.tsx:237-241`) | «Starter · Mensual» (teórico: el retorno Flow siempre trae `tier`) | igual que #1, solo display |
  | 4 | Copy de ayuda del panel admin (`admin/(panel)/coaches/page.tsx:19`, S3.2) | «Tier — plan del coach (starter, pro, elite, scale)…» | «…(free, pro, elite; growth/scale son legacy grandfathered)…» |

- **Lo que NO entra al lote (y por qué):** todo lo demás marcado VISIBLE en este TASKS es **inobservable en LIVE tras S0** (0 filas starter) ⇒ etiqueta «VISIBLE en teoría, declarada», sin mockup: **S2.6** (`/coach/reactivate?tier=starter`), **S2.10** (copy del cupón solo-starter, 0 cupones con ese scope) y **S3.1** (labels/colores de admin y RN, todos con fallback escrito).
- **Única condición que agrega una 5.ª superficie:** si el owner elige **D1=B** (coach QA a `free`/1), `/c/qa-e2e-coach` pasa a mostrar el sello «Hecho con EVA» ⇒ esa vista entra al lote antes de S0.5.
- **Verde:** el owner responde D1 y D2 sobre el lote, y su elección queda escrita en este TASKS (S0.2 bloque 3 para D1, S2.7 para D2).
- **d-a:** 0,05 · **VISIBLE (coach/admin)** · **D1**, **D2** · **jefe**

### S2.1 · `SubscriptionTier` y `SaleTier` sin `'starter'`
- **Archivo:** `packages/tiers/index.ts:43` y `:51`.
- **Qué:**
  - `:43` `export type SubscriptionTier = 'free' | 'starter' | 'pro' | 'elite' | 'growth' | 'scale'` → `export type SubscriptionTier = 'free' | 'pro' | 'elite' | 'growth' | 'scale'`
  - `:51` `export type SaleTier = 'free' | 'starter' | 'pro' | 'elite'` → `export type SaleTier = 'free' | 'pro' | 'elite'`
  - Reescribir los comentarios `:18-19`, `:30`, `:47-49`, `:68`, `:78-79`, `:95`, `:210-214`, `:287`, `:313`, `:328`, `:346`, `:386`, `:398`, `:542` (la mención a starter muere; growth/scale conservan su `LEGACY — NO borrar`).
- **Verde:** `pnpm --filter @eva/web typecheck` falla **solo** en los sitios de S2.2/S2.4/S2.5/S2.6 (lista cerrada); nada más.
- **d-a:** 0,1 · **INVISIBLE** · — · **Opus**

### S2.2 · Las 8 claves `starter` de los `Record` del paquete
- **Archivo:** `packages/tiers/index.ts`.
  | Record | Declarado en | Clave a borrar |
  |---|---|---|
  | `TIER_STUDENT_RANGE_LABEL` | `:117` | `:121` `starter: '1–10 alumnos',` |
  | `TIER_LABELS` | `:145` | `:147` `starter: 'Starter',` |
  | `TIER_CONFIG` | `:157` | `:167-173` (bloque `starter: { … }` completo, incluido `isMostAffordable: true` de `:171`) |
  | `TIER_CAPABILITIES` | `:217` | `:227-233` (bloque completo) |
  | `PRE_CUTOVER_TIER_MAX_CLIENTS` | `:316` | `:318` `starter: 10,` |
  | `V2_TIER_MAX_CLIENTS` | `:330` | `:332` `starter: 10,` |
  | `TIER_ALLOWED_BILLING_CYCLES` | `:460` | `:462` `starter: ['monthly', 'quarterly', 'annual'],` |
  | `TIER_RANK` | `:543` | `:545` `starter: 1,` |
- **Ojo con `TIER_RANK`:** al borrar el `1`, **no** re-numerar pro/elite/growth/scale — el orden total solo necesita ser creciente y `plan-direction.test.ts:38` compara la lista de claves, no los valores. Dejar el hueco documentado en el comentario `:542`.
- **Verde:** `pnpm --filter @eva/web typecheck` verde; `pnpm vitest run packages/tiers` verde tras S3.4.
- **d-a:** 0,15 · **INVISIBLE** · — · **Opus**

### S2.3 · Campo y constante muertos
- **Archivos:** `packages/tiers/index.ts:58`, `:84`; `apps/web/src/lib/constants.ts:87`.
- **Qué:** borrar `isMostAffordable?: boolean` de `TierConfig` (`:58`) — su único seteo era `:171`, ya borrado en S2.2, y tiene **cero lectores** (`git grep isMostAffordable` = 2 hits, ambos en el paquete). Borrar `LEGACY_TIERS` (`:84`) y su re-export (`apps/web/src/lib/constants.ts:87`) — **cero consumidores** verificados (`git grep -n "LEGACY_TIERS" -- apps packages tests scripts` ⇒ solo esas 2 líneas).
- **Verde:** `git grep -n "isMostAffordable\|LEGACY_TIERS" -- apps packages tests scripts` ⇒ 0; typecheck verde.
- **d-a:** 0,05 · **INVISIBLE** · — · **Sonnet**

### S2.4 · Borrar el módulo muerto `tier-display`
- **Archivos:** `apps/web/src/app/coach/subscription/_lib/tier-display.ts` (3 `Record<SubscriptionTier,…>` en `:11`, `:14`, `:18` + `TIER_BADGE` parcial en `:23`) y `apps/web/src/app/coach/subscription/_lib/tier-display.test.ts`.
- **Qué:** **borrar los dos archivos**. Verificado: el único importador es su propio test; `SubscriptionContent.tsx:36` tiene su copia local de `TIER_BADGE`.
- **Verde:** `git grep -n "tier-display" -- apps packages tests scripts` ⇒ 0; typecheck y `pnpm vitest run` verdes sin ese archivo. `scripts/check-qa-test-lint.mjs:37` **no** lo lista en `LEGACY_ALLOWLIST` ⇒ `pnpm qa:lint` no se ve afectado.
- **d-a:** 0,05 · **INVISIBLE** · — · **Sonnet**

### S2.5 · `Record` exhaustivo de RN
- **Archivo:** `apps/mobile/components/coach/directory/guided-invite.ts:339-346`.
- **Qué:** borrar la línea `:341` `starter: true,` del `const SUBSCRIPTION_TIER_FLAGS: Record<SubscriptionTier, true>`. Es obligatorio: el Record es exhaustivo a propósito (`:336-337` lo documenta) y sin esto `tsc` de mobile falla con TS2353.
- **Efecto runtime declarado:** `isSubscriptionTier('starter') === false` ⇒ en `CreateClientModal.tsx:663-665` un `brandingTier='starter'` cae a `'free'` ⇒ `showsEvaBadge('free') === true`, **el mismo sello que hoy**. Cero cambio visual.
- **Verde:** `tsc` de mobile verde (corre en GitHub, `mobile-integration-ci.yml`); `pnpm vitest run tests/mobile/guided-invite.test.ts` verde tras S3.6.
- **d-a:** 0,03 · **INVISIBLE** · — · **Sonnet**

### S2.6 · `ReactivateClient` — borrar la comparación contra el tipo, conservar el cerco de string
- **Archivo:** `apps/web/src/app/coach/reactivate/ReactivateClient.tsx`.
- **Qué:**
  - `:128` **CONSERVAR el comportamiento**, reapuntándolo al nombre canónico: `const queryTier = raw === 'starter_lite' || raw === 'starter' ? 'pro' : raw` → `const queryTier = (raw && LEGACY_TIER_ALIASES[raw]) ?? raw` (import de `@/lib/constants`). Compara **strings crudos del query**: sobrevive al retiro del union y es el cerco de los deep-links viejos.
  - `:129-131` borrar el comentario que explica el TS2367.
  - `:135-136` borrar las dos líneas `: currentTier === 'starter'` / `? 'pro'` (TS2367 con el union nuevo). El `: isSaleTier(currentTier) ? currentTier : 'elite'` de `:137-139` queda intacto.
- **Riesgo cubierto por S0:** sin la rama, un coach en `starter` caería a **elite** (porque `isSaleTier('starter')` es false). Con 0 filas starter en LIVE eso es inalcanzable, y el deep-link viejo sigue anclando a `'pro'` por `:128`.
- **Verde:** typecheck verde; abrir `/coach/reactivate?tier=starter` en el preview ⇒ preselección **Pro** (QA del owner).
- **d-a:** 0,08 · **INVISIBLE tras S0** — «VISIBLE en teoría, declarada»: con 0 filas starter en LIVE ningún coach puede entrar por la rama borrada, y el deep-link viejo `?tier=starter` sigue anclando a **Pro** por `:128`. Sin mockup (fuera del lote S2.0) · — · **Opus**

### S2.7 · `processing` / `flow-processing` — el bug visible de checkout (D2)
- **Archivos:** `apps/web/src/app/coach/subscription/processing/page.tsx:117-127,138,158-163,492,701` y `apps/web/src/app/coach/subscription/flow-processing/page.tsx:58-64,74,77-83,237-241`.
- **Estado hoy (bug vivo, independiente del retiro):** cuando la URL de vuelta llega **sin `?tier`**, `tierFromUrl` cae al literal `'starter'` (`processing:126`, `flow-processing:63`) y la pantalla pinta «Starter · Mensual» a un coach que está pagando Pro/Elite. El propio archivo lo confiesa en `processing:158-159` y `flow-processing:77-78`. **Alcance real (verificado):** desde A5 el `back_url` de MercadoPago ya lleva `tier|cycle` (`api/payments/create-preference/route.ts:531-537`) y los dos redirects del alta también (`(auth)/register/_actions/register.actions.ts:474`, `coach/onboarding/complete/_actions/complete.actions.ts:296`); en Flow el retorno **propaga** `tier`/`cycle` al redirigir cuando vienen en la URL de vuelta (`flow/retorno/route.ts:35-40`), y el alta siempre los pone. O sea: el caso sin tier queda para **preapprovals anteriores a A5 y URLs armadas a mano**.
- **Las 3 variantes de D2 (las de [SPEC §5](SPEC.md)) y qué hace cada una:**
  | D2 | Qué se escribe | Qué ve el coach | Costo | Riesgo |
  |---|---|---|---|---|
  | **A (recomendada)** | Sin `?tier` válido **no se pinta el chip**; y si además `from=register` (hay que iniciar el checkout), **no se hace el POST con un tier inventado**: se pinta el error de `resolveCheckoutError` con salida a `/pricing` | Nada de plan mientras confirma; si venía a comprar, un error honesto con dónde elegir plan | Medio: separa display de checkout en `processing` | Bajo: el camino feliz (con tier en la URL) no cambia en nada |
  | **B** | Fallback visual `'pro'` en vez de `'starter'` | «Pro · Mensual» aunque esté pagando Elite | Mínimo | **Sigue mintiendo**, solo que menos seguido |
  | **C** | Leer la fila del coach después de que el poll confirme | El plan real, tarde | 1 fetch extra | **Descartada por los críticos:** durante el poll la fila **todavía trae el plan anterior** — `confirm-subscription/route.ts:134-155` no muta al coach mientras el estado no es paid-like, y el poll de `processing/page.tsx:396-401` re-llama a ese mismo endpoint, no a `subscription-status` |
- **Qué escribe D2=A, en concreto:**
  1. **`processing/page.tsx` — separar dos conceptos que hoy son una sola variable.** `tierForDisplay: SubscriptionTier | null` (solo el chip) y `tierForCheckout: SubscriptionTier | null` (todo lo que viaja al server o al funnel). Ambos salen del query: `LEGACY_TIER_ALIASES[raw] ?? raw`, validado con `in TIER_CONFIG`; sin match ⇒ `null`.
  2. **Los 5 consumidores de `tierFromUrl` en `processing/page.tsx`** (lista cerrada, verificada): `:55` (`CheckoutPreview.tier`) · `:195` (`captureCheckoutStarted({ tier })`) · `:205-213` (body del `POST /api/payments/create-preference`) · `:244` (fallback del `tier` que devuelve ese POST) · `:253` (`captureCheckoutFailed({ tier })`). Los 5 pasan a `tierForCheckout`. El chip (`:138` `tierLabel`, render en `:492` y `:701`) pasa a `tierForDisplay` y **no se pinta** cuando es `null`.
  3. **Rama de error sin tier con `from=register`** (`fromRegister` ya existe en `:115`): no se dispara el POST **ni** `captureCheckoutStarted`/`captureCheckoutFailed` (un funnel con tier inventado es peor que uno sin evento). Se hace `setErrorCopy(resolveCheckoutError({ code: 'CHECKOUT_TIER_MISSING', message: 'No pudimos saber qué plan estabas contratando.' }))` — mismo patrón que `:262-263` — y la salida a `/pricing` se pinta **en la página**, no en el módulo: `lib/payments/checkout-errors.ts:20` dice explícito que el módulo es puro y «la UI decide cómo pintar las acciones». **No** se agrega un `kind` nuevo a `CheckoutErrorAction` (`:34-40`).
  4. **`flow-processing/page.tsx` es SOLO display** (verificado: no tiene `create-preference`, ni `from=register`, ni `captureCheckoutStarted`; sus únicos usos de `tierFromUrl` son `:74` el label y `:237` la condición del chip). Ahí alcanza con `tierForDisplay` y con cambiar la condición `{(tierFromUrl || cycleFromUrl) && (…)}` (`:237`) por una que exija tier. **No** existe rama de checkout que atender.
  5. **`processing:117-119` y `flow-processing:58-59`** (`rawTierParam === 'starter_lite' ? 'starter' : …`) pasan a `LEGACY_TIER_ALIASES` (S1.9): si no se reapuntan, mapean a un valor que ya no está en `TIER_CONFIG` y la pantalla imprimiría la cadena cruda `starter`. Reescribir los comentarios `processing:121-124,158-159` y `flow-processing:60-61,77-78`.
  6. **`tierForFunnel` no se toca** (`processing:160-163`, `flow-processing:80-83`): ya es `null` honesto y `lib/posthog/events.ts:488` lo documenta. Con D2=A pasa a ser el mismo valor que `tierForCheckout` — se puede unificar, pero es opcional y no cambia comportamiento.
- **Lo que NO se escribe (corregido por el juicio):** la afirmación «`subscription-status` ya devuelve `tier`» es **falsa** — ese endpoint devuelve el objeto `coach` completo (`api/payments/subscription-status/route.ts:102-103`) y en D2=A no se lo consulta para esto.
- **Verde:** `pnpm --filter @eva/web typecheck` verde · test «MP sin `?tier` + preapproval `pending` ⇒ sin chip y sin POST a `create-preference`» · test «`from=register` sin tier ⇒ copy de error con salida a `/pricing`, sin `captureCheckoutStarted`» · `git grep -n "'starter'" -- apps/web/src/app/coach/subscription` ⇒ **0** · QA del owner en el preview: volver de un checkout MP sin `?tier` ⇒ la pantalla **no** dice «Starter».
- **d-a:** 0,2 (A) / 0,05 (B) · **VISIBLE (coach)** — entra en el mockup-lote de **S2.0** · **D2** · **Opus**

### S2.8 · Los 3 `z.enum` que todavía aceptan starter
- **Archivos y swaps exactos:**
  | Archivo:línea | ANTES | DESPUÉS |
  |---|---|---|
  | `packages/schemas/coach.ts:121` | `subscription_tier: z.enum(['free', 'starter', 'pro', 'elite']),` | `subscription_tier: z.enum(['free', 'pro', 'elite']),` |
  | `apps/web/src/app/admin/(panel)/coaches/_actions/coach-actions.ts:121` | `subscription_tier: z.enum(['free', 'starter', 'pro', 'elite', 'growth', 'scale']).optional(),` | `subscription_tier: z.enum(['free', 'pro', 'elite', 'growth', 'scale']).optional(),` |
  | `apps/web/src/app/admin/(panel)/coaches/_actions/coach-actions.ts:357` | `const tierSchema = z.enum(['free', 'starter', 'pro', 'elite', 'growth', 'scale'])` | `const tierSchema = z.enum(['free', 'pro', 'elite', 'growth', 'scale'])` |
- **Por qué:** hoy el server admite crear/actualizar un coach starter aunque la UI ya no lo ofrezca (`CoachCreateSheet.tsx:188` pinta `SALE_TIERS`). Es la única palanca manual que puede reintroducir el problema después de S0.
- **Verde:** `pnpm vitest run "apps/web/src/app/admin/(panel)/coaches/_components/CoachCreateSheet.default-tier.test.ts"` verde; `git grep -n "'starter'" -- packages/schemas apps/web/src/app/admin` ⇒ 0.
- **d-a:** 0,05 · **INVISIBLE** (el select del panel ya no lo ofrece) · — · **Sonnet**

### S2.9 · `checkout-external-reference` — documentar y testear el comportamiento resultante
- **Archivo:** `apps/web/src/lib/payments/checkout-external-reference.ts:55`.
- **Qué:** el código **no cambia** (`if (!(tierRaw in TIER_CONFIG)) return { coachId, tier: null, billingCycle: null, addons }`). Cambia el **efecto**: un `external_reference` legacy `uuid|starter|monthly` pasa de parsear `tier:'starter'` a `tier: null`. Agregar arriba del `if` el comentario: `Un tier retirado del catálogo (p. ej. el legacy 'starter') parsea a tier:null a propósito: confirm-subscription:117 conserva el tier del coach row y :122 valida el ciclo contra ése. Nunca degrada al coach.`
- **Verde:** el test reescrito de S3.5 (`checkout-external-reference.test.ts:53-58`) verde; `pnpm vitest run apps/web/src/app/api/payments/confirm-subscription/route.test.ts` verde.
- **d-a:** 0,05 · **INVISIBLE** · — · **Opus**

### S2.10 · Guard de cupones solo-starter
- **Archivos:** `apps/web/src/services/billing/coupons.service.ts:144-155` y `apps/web/src/services/billing/coupons.service.test.ts:128-148`.
- **Qué:** borrar el bloque `if (scopeTiers.length > 0 && scopeTiers.every((t) => t === 'starter')) { … }` (`:149-155`) junto con su comentario (`:144-148`), y borrar los **2** tests que lo cubren (`:131` «cupón histórico SOLO-starter → NOT_ELIGIBLE…» y `:144` «cupón mixto starter+pro canjeado para pro»). El check genérico de scope (`:156-158`) sigue cubriendo el caso: un cupón solo-starter caerá en `NOT_ELIGIBLE` con el mensaje genérico «El código no aplica a tu plan actual.».
- **Base de la decisión:** **0 cupones con scope starter en LIVE** (SELECT sobre `coupons.applies_to_scope` del 05-09). Era el único texto con la palabra «Starter» que llegaba a un coach.
- **Verde:** `pnpm vitest run apps/web/src/services/billing/coupons.service.test.ts` verde con 2 casos menos; `git grep -n "Starter" -- apps/web/src/services/billing` ⇒ 0.
- **Si el owner prefiere conservarlo:** el guard compila igual sin el union (trabaja sobre `string[]` del JSONB) ⇒ la tarea se cae sola y solo se reescribe su comentario.
- **d-a:** 0,08 · **INVISIBLE tras S0** — «VISIBLE en teoría, declarada»: desaparece un copy dedicado, pero con **0 cupones de scope starter** en LIVE (re-verificado el día de ejecutar en S0.1 (d)) ningún coach puede recibirlo; el caso cae en el `NOT_ELIGIBLE` genérico. Sin mockup (fuera del lote S2.0) · — · **Opus**

### S2.11 · Gates de nutrición: quedan como defensa, con el comentario corregido
- **Archivos:** `apps/web/src/app/api/payments/create-preference/route.ts:441-465` (`NUTRITION_ADDON_ON_DOWNGRADE`) y `apps/web/src/app/coach/subscription/_components/SubscriptionContent.tsx:827-833` (`nutritionBlocks`), más `SubscriptionContent.tsx:492`.
- **Qué:** **no se borra lógica.** Corregir los 3 comentarios, que hoy nombran a Starter como el caso real:
  - `create-preference:441` `// NUTRITION_ADDON_ON_DOWNGRADE: si el tier destino no admite nutrición (Starter) y el` → `… no admite nutrición (hoy ningún tier del catálogo: queda como defensa ante un tier corrupto) y el`
  - `SubscriptionContent:492` `// sin nutrición (Starter) hasta quitarlo — espejo del 409 …` → `// sin nutrición (hoy ninguno: defensa ante tier corrupto) hasta quitarlo — espejo del 409 …`
  - `SubscriptionContent:827` `// P1-3: bajar a un tier sin nutrición (Starter) con un add-on de nutrición vivo.` → `// P1-3: bajar a un tier sin nutrición (hoy ninguno: defensa) con un add-on de nutrición vivo.`
  Además `SubscriptionContent:637`: el comentario `// Un tier desconocido (ni venta ni legacy) NO colapsa a 'starter' (mentiría con su label).` → `// Un tier desconocido (ni venta ni legacy) se pinta crudo: NO se le inventa un label del catálogo.`
- **Por qué no se borran:** la poda real de esos gates es la ola §4.2 de la SPEC («solo cupo + sello»), que es **VISIBLE en el alta** y pide mockup (**D4**). Acá solo se deja `TIER_CAPABILITIES` consistente y se anota la deuda.
- **Verde:** `pnpm vitest run apps/web/src/app/api/payments/create-preference/route.test.ts` verde; diff sin cambios de lógica (solo comentarios).
- **d-a:** 0,05 · **INVISIBLE** · **D4** (solo para la deuda anotada) · **Sonnet**

---

## S3 · Superficies, scripts, tests, docs

### S3.1 · Labels y colores — tabla ANTES → DESPUÉS (textual)

Worker **Sonnet**, un commit. Ninguna de estas ediciones es observable tras S0 (0 filas starter); las 10 filas tienen fallback escrito. **d-a:** 0,15 · **INVISIBLE tras S0** — «VISIBLE en teoría, declarada», sin mockup (fuera del lote S2.0) · — ·
- **Verde:** `pnpm --filter @eva/web typecheck` verde · `git grep -in "starter" -- "apps/web/src/app/admin/(panel)/_components/AdminStatusBadge.tsx" "apps/web/src/app/admin/(panel)/dashboard/_components/ChartSection.tsx" "apps/web/src/app/admin/(panel)/finanzas/_components/FinanzasCharts.tsx" apps/web/src/app/coach/settings/page.tsx "apps/mobile/app/coach/(tabs)/settings.tsx"` ⇒ **0** (los 5 archivos que sí se editan; `apps/mobile/lib/plan-change.ts:43` se CONSERVA y por eso queda fuera del grep) · `pnpm vitest run tests/mobile/plan-change.test.ts` verde (es lo que protege la fila #9).

| # | Archivo:línea | Superficie | ANTES (texto real) | DESPUÉS (texto exacto) |
|---|---|---|---|---|
| 1 | `apps/web/src/app/admin/(panel)/_components/AdminStatusBadge.tsx:25` | Chip de tier del panel admin (`coaches/[id]/page.tsx:129`, `CoachCommandPanel.tsx:221,293`, `CoachTable.tsx:413,578`, `RecentActivity.tsx:281`) | `    starter: { label: 'Starter', tone: 'neutral' },` | **borrar la línea.** Un valor desconocido cae al fallback `:49` `map[value] ?? { label: value, tone: 'neutral' }` ⇒ misma píldora gris con el texto crudo en minúscula |
| 2 | `apps/web/src/app/admin/(panel)/dashboard/_components/ChartSection.tsx:52` | Orden del apilado «Coaches por tier» | `const TIER_ORDER = ['free', 'starter', 'pro', 'elite', 'growth', 'scale']` | `const TIER_ORDER = ['free', 'pro', 'elite', 'growth', 'scale']` |
| 3 | `…/ChartSection.tsx:59` | Color de la serie | `    starter: 'var(--viz-4)',` | **borrar la línea** (fallback `:71` `?? 'var(--viz-6)'`) |
| 4 | `…/ChartSection.tsx:67` | Leyenda / tooltip / `aria-label` (`:230-232`) | `    free: 'Free', starter: 'Starter', pro: 'Pro',` | `    free: 'Free', pro: 'Pro',` |
| 5 | `…/ChartSection.tsx:200` | Comentario del reshape | `/* Reshape tier series → [{ ym, starter, pro, ... }].` | `/* Reshape tier series → [{ ym, free, pro, ... }].` |
| 6 | `apps/web/src/app/admin/(panel)/finanzas/_components/FinanzasCharts.tsx:36` | Barra «Revenue por tier» | `    starter: 'var(--viz-4)',` | **borrar la línea** (fallback `:43` `FALLBACK_COLOR`) |
| 7 | `apps/web/src/app/coach/settings/page.tsx:30` | Badge «Plan …» de Ajustes web (uso `:340` `` `Plan ${TIER_LABEL[tier] ?? 'Gratis'}` ``) | `    starter: 'Starter',` | **borrar la línea** ⇒ un starter residual leería `Plan Gratis` |
| 8 | `apps/mobile/app/coach/(tabs)/settings.tsx:64` | Badge del hero de «Opciones» RN (uso `:340`) | `  starter: 'Starter',` | **borrar la línea** ⇒ `Plan Gratis` |
| 9 | `apps/mobile/lib/plan-change.ts:43` | Celebración `tier_up` RN | `const TIER_ORDER: readonly string[] = ['free', 'starter', 'pro', 'growth', 'scale', 'elite']` | **CONSERVAR tal cual.** Es `readonly string[]`, no `SubscriptionTier[]`: no rompe `tsc` y sacarlo mataría `tests/mobile/plan-change.test.ts:55-56`. Solo se toca el comentario `:52` (ver S3.8) |
| 10 | `apps/web/src/services/billing/sales-emails.service.ts:276` | Correo «límite de alumnos alcanzado» | `        tierLabel: TIER_LABELS[tier] ?? TIER_LABELS.free,` | **sin cambio.** Sin la clave starter degrada a `Gratis`; el `??` ya está |

**Se limpian solos (NO editar):** `CoachCommandPanel.tsx:39` (`ALL_TIERS = Object.keys(TIER_CONFIG)`, select de edición de tier `:446`) y `CoachFilterBar.tsx:19` (`TIER_OPTIONS`, filtro de la tabla) — pintan las claves de `TIER_CONFIG` ⇒ al borrar la clave en S2.2 la opción `starter (10 alumnos)` / `Starter` desaparece sin tocar el archivo. `CoachCreateSheet.tsx:188` ya usa `SALE_TIERS`.

### S3.2 · Copy del panel admin
- **Archivo:** `apps/web/src/app/admin/(panel)/coaches/page.tsx:19` (texto de ayuda que el admin **lee**).
- **Qué:** dentro del `body`, el fragmento
  `Tier — plan del coach (starter, pro, elite, scale) con su límite de alumnos.`
  → `Tier — plan del coach (free, pro, elite; growth/scale son legacy grandfathered) con su límite de alumnos.`
  **No** tocar el resto del bloque (el renglón `Provider` está desactualizado por otra razón: ya maneja `flow`/`admin`/`internal`/`stripe` — hallazgo aparte, fuera de esta ola).
- **Verde:** `git grep -n "starter, pro, elite, scale" -- apps/web` ⇒ 0.
- **d-a:** 0,02 · **VISIBLE (admin)** · — · **Sonnet**

### S3.3 · Scripts — tabla

Worker **Sonnet**, un commit (junto con S3.1 si el jefe quiere). `scripts/qa-seed-team-movida.mjs:274` ya se hizo en **S0.8** (dato antes que código). Ninguno de estos scripts corre en CI. **d-a:** 0,08 · **INVISIBLE** · — ·

| Archivo:línea | ANTES | DESPUÉS | Nota |
|---|---|---|---|
| `scripts/seed-e2e-personas.mjs:71` | `const TIER_MAX = { starter: 10, pro: 30, elite: 60, scale: 500 }` | `const TIER_MAX = { pro: 30, elite: 60, scale: 500 }` | Entrada muerta: las 5 personas usan `elite` (`:677,834,899,963`) y `scale` (`:771`). Uso en `:180` con `?? 30`. **Hallazgo aparte (no de esta ola):** `pro: 30` está desalineado con `TIER_CONFIG.pro.maxClients = 25` |
| `scripts/e2e/seed-pool-fixture.mjs:96` | `const TIER_MAX = { starter: 10, pro: 30, elite: 60, scale: 500 }` | `const TIER_MAX = { pro: 30, elite: 60, scale: 500 }` | Mismo caso; las 2 personas del fixture usan `elite` (`:422,446`), uso en `:209` |
| `scripts/create-coach-account.mjs:8` | `--tier starter\|pro\|elite\|scale   (default: pro)` | `--tier pro\|elite\|scale   (default: pro)` | Texto de `--help` |
| `scripts/create-coach-account.mjs:22` | `const TIER_MAX = { starter: 10, pro: 30, elite: 60, scale: 500 }` | `const TIER_MAX = { pro: 30, elite: 60, scale: 500 }` | — |
| `scripts/create-coach-account.mjs:71` | `if (!['starter', 'pro', 'elite', 'scale'].includes(tier)) {` | `if (!['pro', 'elite', 'scale'].includes(tier)) {` | **El único punto del repo donde un humano puede crear una fila starter nueva por CLI** |
| `scripts/qa-seed-team-movida.mjs:274` | `subscription_tier: 'starter',` | `subscription_tier: 'scale',` | **Ya hecho en S0.8** — no repetir |
| `scripts/seed-enterprise-demo-local.mjs:88` | `subscription_tier: 'scale'` | — | **NO tocar** (frente E, se borra en E1) |

- **Verde:** `git grep -in "starter" -- scripts` ⇒ 0.

### S3.4 · Tests — bloque «paquete y catálogo»
- **Verde:** `pnpm vitest run packages/tiers packages/schemas apps/web/src/lib/constants.test.ts` verde (bloque 1+2 de la verificación por tanda) y `git grep -n "'starter'" -- packages/tiers apps/web/src/lib/constants.test.ts` devuelve **solo** los pines declarados: `LEGACY_TIER_ALIASES` + su JSDoc y `parse-subscription-tier.test.ts` (S1.9/S1.11), `isSaleTier('starter')` de `constants.test.ts:135`, el `it` nuevo del CHECK (`:169-187`) y el `TIER_CONFIG.starter` `toBeUndefined()` de `pricing-v2.test.ts:179-182`.
- **d-a:** 0,25 · **INVISIBLE** · — · **Opus**

| Archivo | Líneas | Qué aserción | Acción |
|---|---|---|---|
| `packages/tiers/pricing-v2.test.ts` | `:49` | fila `['starter', 10, 10, 10]` del array `CASES` de `tierMaxClientsFor` | **borrar la fila** |
| | `:123,125` | `it('free 1 … / starter 10 / …')` + `getTierMaxClients('starter')).toBe(10)` | **reescribir** el título a `free 1 (pricing v3) / pro 25 / elite 60; growth/scale intactos` y borrar `:125` |
| | `:135,138` | `it('tier fuera del union → cupo de FREE, nunca starter ni un throw')` + `.not.toBe(TIER_CONFIG.starter.maxClients)` | **reescribir** `:138` contra `TIER_CONFIG.pro.maxClients` (el sujeto es el fail-safe, no starter); conservar el título cambiando «nunca starter» por «nunca el cupo de un tier pago» |
| | `:145` | `TIER_CONFIG.starter.monthlyPriceClp).toBe(19990)` | **borrar** |
| | `:163-172` | `describe`/`it` «starter (fuera de venta) conserva su set histórico grandfathered» | **borrar el bloque entero** |
| | `:174` | `describe('SALE_TIERS — starter fuera de venta (P1)')` | **renombrar** a `describe('SALE_TIERS — la venta es free/pro/elite')` |
| | `:179-182` | `it('isSaleTier rechaza starter pero starter SIGUE en el union/TIER_CONFIG (histórico)')` — **el guard explícito que hoy PROHÍBE este retiro** | **reescribir**: `it('starter salió del union y del catálogo (retiro 2026-09)')` con `expect(isSaleTier('starter')).toBe(false)` + `expect((TIER_CONFIG as Record<string, unknown>).starter).toBeUndefined()` |
| | `:185` | `it('getRecommendedTier ya no recomienda starter…')` | **conservar** (título y aserción siguen valiendo) |
| `packages/tiers/pricing-v3.test.ts` | `:48,50` | `it('free y starter llevan el sello…')` + `showsEvaBadge('starter')).toBe(true)` | **borrar `:50`**, renombrar el `it` a `'free lleva el sello; pro/elite/growth/scale no'` |
| | `:70-71` | `isBrandingAllowed('starter')).toBe(false)` — hoy la ÚNICA aserción de que puede dar `false` | **reescribir** a `expect(isBrandingAllowed('legacy_unknown' as SubscriptionTier)).toBe(false)` con el comentario «fail-closed ante tier corrupto». **No borrar**: se pierde la cobertura del fail-closed |
| `packages/tiers/plan-direction.test.ts` | `:13` | `const ALL_TIERS: SubscriptionTier[] = ['free','starter','pro','elite','growth','scale']` | → `['free','pro','elite','growth','scale']` |
| | `:23,25` | título «rangos … free<starter<pro<…» + `getTierRank('starter')).toBe(1)` | **reescribir** título a `free<pro<elite<growth<scale` y **borrar** `:25` |
| | `:38` | `['elite','free','growth','pro','scale','starter']` (claves ordenadas de `TIER_RANK`) | → `['elite','free','growth','pro','scale']` |
| | `:45-46,52-53` | 4 casos de `comparePlanDirection` con starter | **borrar los 4**; agregar 1 caso nuevo `comparePlanDirection('legacy_unknown' as SubscriptionTier, 'pro')` ⇒ `'upgrade'` (rank 0 tras S1.6) |
| `apps/web/src/lib/constants.test.ts` | `:23-25,34,43,47-50,59,75-78` | 13 aserciones directas (precios ×3, cupo, capabilities ×2, `isBrandingAllowed`, ciclos ×3) | **borrar** |
| | `:125,135` | `it('SALE_TIERS has exactly the 3 tiers on sale (starter fuera de venta — pricing v2)')` + `isSaleTier('starter')).toBe(false)` | **conservar** (es string crudo, pin del retiro); solo actualizar el título quitando «pricing v2» |
| | `:146,149,162` | comentarios y `it('never recommends starter nor a legacy tier')` | **conservar**, ajustando el comentario `:149` |
| | `:169-187` (bloque completo: comentario `:169-176`, `describe` `:177`, `ALL_CHECK_TIERS` `:178`, loop `:180-186`) | contrato «los **6 valores del CHECK** de DB (baseline.sql:938) tienen label y display», con `ALL_CHECK_TIERS: SubscriptionTier[] = ['free','starter','pro','elite','growth','scale']` | **cambiar el contrato, no borrarlo** (J-S9): (1) `ALL_CHECK_TIERS` → `const ALL_UNION_TIERS: SubscriptionTier[] = ['free','pro','elite','growth','scale']` y el título del `describe` a «los 5 valores del union tienen label y display (web + mobile vía @eva/tiers)»; (2) reescribir el comentario `:169-176` explicando que el union quedó **más chico** que el CHECK a propósito (D3=A); (3) **sumar un `it` nuevo** en el mismo `describe`: «un valor del CHECK fuera del union (`'starter'`) no crashea ningún helper y cae a free» ⇒ `getTierPriceClp`/`getTierRank` 0, `getTierCapabilities` `toEqual(getTierCapabilities('free'))`, `getTierAllowedBillingCycles` `[]`, `getDefaultBillingCycleForTier` `'monthly'`, con el input casteado `'starter' as unknown as SubscriptionTier`. Es el único lugar donde el CHECK y el union se miran de frente |
| `packages/schemas/coupon.test.ts` | `:15-49` (12 hits) | 4 casos de que la emisión rechaza starter | **conservar tal cual** — strings crudos contra el enum, pin anti-regresión |
| `packages/tiers/discount.test.ts` | — | no menciona starter | **conservar**; corre igual por vecindad en `pnpm vitest run packages/tiers` |

### S3.5 · Tests — bloque «billing, pagos y alta»
- **Verde:** `pnpm vitest run apps/web/src/services/billing apps/web/src/lib/payments apps/web/src/app/api/payments apps/web/src/app/flow/retorno/route.test.ts` verde (bloque 3) **y** `pnpm vitest run "apps/web/src/app/(auth)/register/actions.test.ts" "apps/web/src/app/join/[invite_code]/_lib/join-capacity.test.ts" apps/web/src/app/coach/clients/actions.test.ts` verde (parte del bloque 4). Los montos reescritos de `tier-upgrade-proration.service.test.ts` se recalculan con `getTierPriceClp`, **no** se copian de los viejos.
- **d-a:** 0,3 · **INVISIBLE** · — · **Opus**

| Archivo | Líneas | Qué aserción | Acción |
|---|---|---|---|
| `apps/web/src/services/billing/tier-upgrade-proration.service.test.ts` | `:21,24,28,29,50,53,59,60,68,69,76,90,96,97,99` | 10 aserciones con `getTierPriceClp('starter', …)` como base de la prorrata; montos **hardcodeados** (`13500`, `12500`, `300`, `27000`) | **reescribir el archivo entero** con los pares `pro→elite` (upgrade) y `elite→pro` (`:90`, downgrade ⇒ 0). **Recalcular los montos a mano** a partir de `TIER_CONFIG.pro/elite` y verificar que ningún `expect` numérico quedó del par viejo. Es el archivo con más cambio mecánico de toda la ola |
| `apps/web/src/services/billing/addons.service.test.ts` | `:261` | `for (const tier of ['starter','pro','elite'] as const)` | → `['free','pro','elite'] as const` |
| | `:275-278` | `it('starter + cardio → permitido …')` con `subscriptionTier: 'starter'` | **borrar el `it`** (el loop `:261` ya cubre el catálogo) |
| `apps/web/src/services/billing/coupons.service.test.ts` | `:128-148` | 2 tests del guard solo-starter | **borrar** (van con S2.10) |
| `apps/web/src/services/billing/mrr.service.test.ts` | `:24` | `netMonthlyClpForCoach('starter','monthly', cupón fixed 999999) === 0` | → `'pro'`. El sujeto es el clamp a 0, no el tier |
| `apps/web/src/lib/payments/checkout-external-reference.test.ts` | `:53-58` | `it('parses starter with the newly allowed quarterly cycle')` esperando `tier:'starter'` | **invertir**: `it('un tier retirado del catálogo parsea a tier:null (boundary legacy)')`, mismo input `'uuid-4\|starter\|quarterly'`, `expect(r).toEqual({ coachId:'uuid-4', tier:null, billingCycle:null, addons:[] })`. Agregar el caso positivo equivalente con `'uuid-4\|pro\|quarterly'` para no perder la cobertura del ciclo trimestral |
| `apps/web/src/lib/payments/subscription-state.test.ts` | `:45` | `resolveTerminalEvent({ …, subscriptionTier: 'starter' })` | → `'pro'` (higiene; el guard solo compara `=== 'free'`) |
| `apps/web/src/lib/payments/providers/mercadopago.snapshot.test.ts` | `:46` | `external_reference: 'coach-1\|starter\|monthly'` | → `'coach-1\|pro\|monthly'`. **Es snapshot**: si el string aparece inline en el `expect`, cambiarlo en el mismo commit |
| `apps/web/src/app/api/payments/confirm-subscription/route.test.ts` | `:403` | `external_reference: 'coach-1\|starter\|monthly', // tier menor (downgrade)` | → `'coach-1\|free\|monthly'` (conserva la semántica «tier menor»; la rama SLASH-EARLY depende de `start_date`, no del tier) |
| `apps/web/src/app/flow/retorno/route.test.ts` | `:11,18` | `?tier=starter` como passthrough del query | → `?tier=pro` en `:11` y en el `expect` de `:18` (el sujeto es la propagación, no el tier) |
| `apps/web/src/app/(auth)/register/actions.test.ts` | `:185-189` | «rejects starter (fuera de venta desde pricing v2)» | **conservar el runtime**, castear el literal: `subscription_tier: 'starter' as unknown as SaleTier`. Renombrar a «rechaza un tier retirado ('starter') — cerco de deep-link viejo» |
| `apps/web/src/app/api/payments/create-preference/route.test.ts` | `:425-444` (10 hits) | 2 tests de que `tier:'starter'` da **400 de Zod** | **conservar** con el string crudo (el enum ya no lo tiene: el 400 sigue valiendo) |
| `apps/web/src/app/api/payments/flow/confirm-enrollment/route.test.ts` | `:510-514,592-596` (7 hits) | coach row starter → 409; intent starter residual → 409 | **conservar**; castear las fixtures tipadas si `tsc` lo pide |
| `apps/web/src/app/admin/(panel)/coaches/_components/CoachCreateSheet.default-tier.test.ts` | `:38-40` (4 hits) | `expect(tierDefault).not.toBe('starter')` | **conservar** como regresión histórica; reescribir el bloque de comentario `:7-20` que narra el bug |
| `apps/web/src/app/coach/clients/actions.test.ts` | `:77,105,157,258,308` | 5 fixtures `subscription_tier:'starter'`; `:105` afirma `result.currentTier).toBe('starter')` | **cambiar los 5 fixtures a `'pro'`** (el `max_clients` explícito manda en el cupo) y `:105` a `'pro'` |
| `apps/web/src/app/join/[invite_code]/_lib/join-capacity.test.ts` | `:128,140` | `it('tier ilegible + fecha null → mundo viejo de free (3), jamás starter (P5)')` con fixture `'starter'` | **conservar el título** (es la memoria de por qué el fallback es free) y cambiar la fixture `:140` a `subscription_tier: 'legacy_unknown'` |

### S3.6 · Tests — bloque «marca, correos y mobile»
- **Verde:** `pnpm vitest run apps/web/src/lib/email apps/web/src/lib/nutrition-pdf-brand.test.ts tests/brand-settings-standalone-whitelist.test.ts tests/mobile-aura-theme.test.ts` verde (bloque 5) **y** `pnpm vitest run tests/mobile/guided-invite.test.ts tests/mobile/plan-change.test.ts tests/mobile/nutrition-export-brand.test.ts apps/web/src/app/api/mobile/coach/dashboard/route.test.ts` verde (bloque 6 + la ruta del `it` borrado). Chequeo de que no se perdió cobertura: sigue habiendo **al menos un** test que afirma `isBrandingAllowed(<tier fuera del catálogo>) === false` (`packages/tiers/pricing-v3.test.ts:70-71` tras S3.4) y **al menos uno** que afirma el sello fail-open.
- **d-a:** 0,2 · **INVISIBLE** · — · **Opus**

| Archivo | Líneas | Qué aserción | Acción |
|---|---|---|---|
| `apps/web/src/lib/email/email-brand.test.ts` | `:27-29` | «starter standalone ⇒ header EVA sin white-label pero CON sello» | **castear el sujeto**: `tier: 'legacy_unknown' as SubscriptionTier`, título → «tier fuera del catálogo standalone ⇒ header EVA (sin white-label) pero CON sello». Sigue verde: `isBrandingAllowed` es fail-closed y `showsEvaBadge` fail-open |
| `apps/web/src/lib/nutrition-pdf-brand.test.ts` | `:47-53` | «starter ⇒ EVA (sin white-label, tier legacy) + sello» | Ídem: `subscriptionTier: 'legacy_unknown'`, `brandName: 'Coach Legacy'`, título reescrito |
| `tests/brand-settings-standalone-whitelist.test.ts` | `:150-152` | «coach starter (legacy sin white-label): identidad y welcome persisten; nada de branding visual» | Ídem: `makeSupabase({ tier: 'legacy_unknown' })`, título → «coach con tier fuera del catálogo…». **Conservar el caso**: es la única cobertura viva del gate fail-closed en web |
| `tests/mobile-aura-theme.test.ts` | `:27,69` | fixtures `subscriptionTier: 'starter'` | → `'legacy_unknown'` en ambas (el tema colapsa al color de sistema por el mismo fail-closed) |
| `tests/mobile/nutrition-export-brand.test.ts` | `:64-65` | «starter (legacy, sin white-label) ⇒ EVA exacto CON sello» | → `source('legacy_unknown')`, título reescrito |
| `tests/mobile/guided-invite.test.ts` | `:367` | `for (const tier of ['free','starter','pro','elite','growth','scale'])` contra `isSubscriptionTier` | → `['free','pro','elite','growth','scale']`. Opcional: mover `'starter'` al `describe` de rechazos (`:372-379`), junto a `'enterprise'` |
| `tests/mobile/plan-change.test.ts` | `:55-56` | «starter → pro también es tier_up» | **conservar tal cual**: `TIER_ORDER` de `plan-change.ts:43` NO se toca (S3.1 #9) ⇒ el test sigue verde sin editarlo |
| `apps/web/src/app/api/mobile/coach/dashboard/route.test.ts` | `:243-251` | «tier sin white-label (starter legacy)»: URLs gateadas + `expect(body.coach.subscriptionTier).toBe('starter')` | **borrar el `it` completo.** Con `parseSubscriptionTier` (S1.10) la ruta normaliza a `'free'` **antes** de gatear ⇒ el escenario deja de ser alcanzable por esta ruta. La cobertura del fail-closed sobrevive en `proxy.ts` (que no normaliza) y en los 3 tests de arriba |
| `apps/web/src/lib/email/sales-templates.test.ts` | `:73-78` | «el copy y el CTA apuntan a Pro y nunca a Starter» + `expect(html).not.toContain('Starter')` | **conservar tal cual** — protege el retiro |
| | `:198,209` | `tierLabel: 'Starter'` como dato de entrada del caller + `expect(html).toContain('Starter')` | → `tierLabel: 'Pro'` y `expect(html).toContain('Pro')`. **Ojo**: `:78` y `:209` conviven en tests distintos, no se pisan |

### S3.7 · Playwright — actualizar, **NO correr**
- **Verde:** `pnpm exec playwright test --list tests/payment-flow-mock.spec.ts tests/sprint3-register-pricing.spec.ts` (solo pnpm: `@playwright/test` es devDependency de la raíz, `package.json:93`). **Lista y compila, no corre**: valida que los specs reescritos siguen siendo TypeScript válido y que los títulos quedaron como dicen las 2 filas. **Nota obligatoria en el registro de la tanda:** «sin verde real hasta una corrida `chromium` autorizada por el owner». **Prohibido** dejarlos con `test.skip` para simular verde.
- **d-a:** 0,15 · **INVISIBLE** · — · **Opus**
- Regla del owner: E2E solo al cierre y por GitHub. Estos 2 specs **ya están desalineados** con `/pricing` desde pricing v2 y **no corren en CI** (el job e2e usa `--project=prod-suave`). Se actualizan para no dejar un spec mintiendo; su corrida es decisión aparte.

| Archivo | Líneas | Qué asevera hoy | Acción |
|---|---|---|---|
| `tests/payment-flow-mock.spec.ts` | `:24,51,58,71,99` | flujo mock con `tier:'starter'` mensual (`:24,51`) y trimestral (`:58,71,99`), navegando a `/coach/subscription/processing?...&tier=starter` | **reescribir a `pro`** en los 5 puntos (`:24`, `:71` en el body del mock; `:51`, `:99` en la URL; `:58` en el título del test) |
| `tests/sprint3-register-pricing.spec.ts` | `:38-39,47,58-67,85,110,133` | `/pricing` debe mostrar el heading **«Starter»** (`:47`); fila «Trimestral» para starter y pro (`:58-63`); `?tier=growth` **normaliza a `starter`** (`:67,85`); registro con `?tier=starter` (`:110,133`) | **reescribir contra `free/pro/elite`**: `:47` heading `'Pro'`; `:58-63` «Trimestral para pro y elite» con el mismo `≥3`; `:67,85` el caso pasa a «`?tier=growth` degrada a `free`» (es lo que hace `register/page.tsx:248-252` vía `isSaleTier`); `:110,133` `?tier=pro`. Reescribir el comentario de cabecera `:38-39` |

### S3.8 · Comentarios — LISTA CERRADA para un worker Sonnet

**Un solo commit, cero cambios de lógica, corre DESPUÉS de que S1 y S2 estén mergeados** (varios de estos archivos ya fueron tocados por tareas anteriores; secuencial ⇒ sin conflicto). **41 archivos · 62 líneas.** Regla general del swap: `free/starter` ⇒ `free` · `Free y Starter` ⇒ `Free` · `Free/Starter` ⇒ `Free` · «tier inválido/stale **o starter legacy**» ⇒ «tier inválido/stale» · «(Starter)» ⇒ «(hoy ninguno)».

- **d-a:** 0,2 · **INVISIBLE** · — · **Sonnet**
- **Verde:** el diff no toca ninguna línea de código ejecutable (solo `//`, `/* */`, `/** */` y texto JSX de comentario); `pnpm --filter @eva/web typecheck` y `pnpm exec eslint` de los tocados, verdes.

| # | Archivo:línea | Texto viejo (fragmento) | Texto nuevo (fragmento) |
|---|---|---|---|
| 1 | `apps/web/src/app/coach/layout.tsx:178` | `(tier inválido/stale o starter legacy ⇒ panel` | `(tier inválido/stale ⇒ panel` |
| 2 | `apps/web/src/app/coach/layout.tsx:256` | `Free/Starter conservan el logo en DB` | `Free conserva el logo en DB` |
| 3 | `apps/web/src/app/api/mobile/coach/dashboard/route.ts:139` | `solo caen el starter legacy y un tier corrupto).` | `solo cae un tier corrupto).` |
| 4 | `apps/web/src/app/coach/dashboard/_components/BrandQuickCard.tsx:62` | `Free y Starter llevan el sello` | `Free lleva el sello` |
| 5 | `apps/web/src/app/coach/clients/_components/AddStudentStepper.tsx:71` | `Free y Starter llevan el sello` | `Free lleva el sello` |
| 6 | `apps/web/src/components/upgrade/UpsellGate.tsx:72` | `(starter salio de la venta — jamas ofrecer un plan muerto).` | `(jamas ofrecer un plan que no esta a la venta).` |
| 7 | `apps/web/src/components/coach/CoachBrandAvatar.tsx:34` | `sin white-label visible (Free/Starter).` | `sin white-label visible (tier sin marca).` |
| 8 | `apps/web/src/lib/brand-loaders.ts:9` | `Lo ven free/starter + Pro que no eligen.` | `Lo ven free + Pro que no eligen.` |
| 9 | `apps/web/src/components/ui/EvaRouteLoader.tsx:144` | `'eva' (default + free/starter) sigue` | `'eva' (default + free) sigue` |
| 10 | `apps/web/src/app/c/[coach_slug]/layout.tsx:185` | `distingue a Free/Starter es el sello` | `distingue a Free es el sello` |
| 11 | `apps/web/src/app/c/[coach_slug]/layout.tsx:507` | `el sello «Hecho con EVA» lo llevan Free/Starter` | `el sello «Hecho con EVA» lo lleva Free` |
| 12 | `apps/web/src/app/c/[coach_slug]/login/page.tsx:67` | `separa a Free/Starter de Pro` | `separa a Free de Pro` |
| 13 | `apps/web/src/domain/nutrition/exchange.types.ts:88` | `true en free/starter y en el fallback EVA` | `true en free y en el fallback EVA` |
| 14 | `apps/web/src/lib/nutrition-pdf-brand.ts:139` | `sello «Hecho con EVA» en free/starter` | `sello «Hecho con EVA» en free` |
| 15 | `apps/web/src/lib/email/sales-templates.ts:44` | `'Gratis' \| 'Starter' \| 'Pro' \| …` | `'Gratis' \| 'Pro' \| 'Elite'` |
| 16 | `apps/web/src/lib/email/sales-templates.ts:51` | `starter, que salió de la venta). 'Pro' para free/starter, 'Elite' para pro` | `'Pro' para free, 'Elite' para pro` |
| 17 | `apps/web/src/lib/email/email-brand.ts:14` | `true en free/starter (fail-open ante tier corrupto)` | `true en free (fail-open ante tier corrupto)` |
| 18 | `apps/web/src/lib/email/base-layout.ts:13` | `distingue a free/starter es \`brand.showsEvaBadge\`` | `distingue a free es \`brand.showsEvaBadge\`` |
| 19 | `apps/web/src/lib/email/base-layout.ts:97` | `Solo free/starter standalone.` | `Solo free standalone.` |
| 20 | `apps/web/src/lib/email/transactional-templates.ts:16` | `(free/starter standalone).` | `(free standalone).` |
| 21 | `apps/web/src/lib/email/transactional-templates.ts:112` | ídem | ídem |
| 22 | `apps/web/src/lib/email/transactional-templates.ts:470` | ídem | ídem |
| 23 | `apps/web/src/lib/email/transactional-templates.ts:528` | ídem | ídem |
| 24 | `apps/web/public/sw.js:279` | `(coach free/starter o sin logo).` | `(coach free o sin logo).` |
| 25 | `apps/web/src/lib/posthog/events.ts:488` | `el fallback visual ('starter'/'monthly') envenenaria el` | `el fallback visual de la pantalla envenenaria el` |
| 26 | `apps/web/src/services/billing/addons.service.ts:47` | `«starter NO compra nutrition_exchanges (Pro+)» murió` | `«el tier chico NO compra nutrition_exchanges (Pro+)» murió` |
| 27 | `apps/web/src/app/join/[invite_code]/_lib/join-capacity.ts:20` | `jamás \`?? 'starter'\`)` | `jamás el cupo de un tier pago)` |
| 28 | `apps/web/src/app/pricing/page.tsx:65` | `starter fuera de venta ya no se emite como Offer.` | `solo los tiers de \`SALE_TIERS\` se emiten como Offer.` |
| 29 | `apps/web/src/app/pricing/page.tsx:169-170` | bloque «Pricing v2 — starter FUERA de venta (patrón growth/scale…)» | **borrar el bloque** (queda sin sujeto) |
| 30 | `apps/web/src/app/pricing/page.tsx:229` | `El agrupado viejo (starter+pro) murió con starter fuera de venta.` | **borrar la frase** del bloque JSX de comentario |
| 31 | `apps/web/src/components/landing/LandingPricingPreview.tsx:31` | `(primer plan pago a la venta; starter salió de venta).` | `(primer plan pago a la venta).` |
| 32 | `apps/web/src/components/landing/LandingPricingPreview.tsx:67` | `Pricing v2 — starter FUERA de venta (patrón growth/scale)` | `La venta es free/pro/elite; growth/scale son legacy` |
| 33 | `apps/web/src/components/landing/LandingPricingPreview.tsx:839` | `3 tiers a la venta (pricing v2: sin starter)` | `3 tiers a la venta (free/pro/elite)` |
| 34 | `apps/web/src/components/landing/LandingPricingPreview.tsx:846` | `starter/growth/scale recortados (fuera de venta).` | `growth/scale recortados (fuera de venta).` |
| 35 | `apps/web/src/components/landing-v2/PreciosSection.tsx:12` | `Elite 26–60; starter fuera de venta).` | `Elite 26–60).` |
| 36 | `apps/web/src/components/landing-v2/PreciosSection.tsx:46` | `Pro ya no arranca «después de starter» (fuera de venta): su rango` | `Pro arranca en 2: su rango` |
| 37 | `apps/web/src/components/landing-v2/PreciosSection.tsx:532` | `nada de starter/growth/scale acá.` | `nada de growth/scale acá.` |
| 38 | `apps/web/src/components/landing-v2/copy.ts:120` | `no starter/growth/scale here.` | `no growth/scale here.` |
| 39 | `apps/web/src/app/admin/(panel)/coaches/_components/CoachCreateSheet.tsx:177` | `el default es 'free' — 'starter' salió de venta en v2 y` | `el default es 'free' y las opciones salen de SALE_TIERS;` |
| 40 | `apps/web/src/app/admin/(panel)/codigos/_components/CouponMintForm.tsx:240-241` | `starter fuera de venta — la emisión nueva solo ofrece pro/elite … el server rechaza starter igual` | `la emisión solo ofrece pro/elite (espejo de COUPON_TIERS en @eva/schemas)` |
| 41 | `apps/web/src/app/(auth)/register/page.tsx:248` | `?tier=starter/starter_lite/growth/scale (fuera de venta) degrada a 'free'` | `?tier fuera de SALE_TIERS (starter/starter_lite legacy, growth/scale) degrada a 'free'` |
| 42 | `apps/web/src/app/(auth)/register/_components/PlanStep.tsx:20` | `(free/pro/elite — pricing v2). starter salió de venta;` | `(free/pro/elite).` |
| 43 | `apps/web/src/app/(auth)/register/_actions/register.actions.ts:56` | `Solo se vende free/starter/pro/elite.` | `Solo se vende free/pro/elite.` |
| 44 | `apps/web/src/app/coach/onboarding/complete/_actions/complete.actions.ts:41` | `Solo se vende free/starter/pro/elite.` | `Solo se vende free/pro/elite.` |
| 45 | `apps/web/src/proxy.ts:1149` | `(o el starter legacy, fuera de venta) cae al skin EVA` | `cae al skin EVA` |
| 46 | `apps/web/src/proxy.ts:1183` | `(tier inválido/stale o starter legacy) → TODO EVA system` | `(tier inválido/stale) → TODO EVA system` |
| 47 | `apps/web/src/services/billing/sales-emails.service.ts:268` | `(starter salió de la venta) — free/starter reciben` | `— free recibe` |
| 48 | `apps/web/src/app/api/payments/create-preference/route.ts:39,41,43` | bloque «starter SALIÓ de la venta — mismo trato que growth/scale (LEGACY)…» | reescribir a «growth/scale son LEGACY: quedan en el union/TIER_CONFIG/CHECK pero no se compran. NO reintroducirlos acá» (sin mención a starter) |
| 49 | `apps/web/src/app/api/payments/create-preference/route.ts:157` | `Pricing v2: con starter fuera del enum, pro/elite siempre tienen nutrición` | `pro/elite siempre tienen nutrición` |
| 50 | `apps/web/src/app/api/payments/flow/confirm-enrollment/route.ts:230` | `starter salio de la venta — un intent starter (residual de un checkout viejo) ya no es` | `un intent con un tier retirado (residual de un checkout viejo) ya no es` |
| 51 | `apps/web/src/app/api/payments/flow/confirm-enrollment/route.ts:247` | `starter/growth/scale: la compra nueva de un tier fuera de venta` | `growth/scale: la compra nueva de un tier fuera de venta` |
| 52 | `apps/web/src/app/coach/subscription/_components/SubscriptionContent.tsx:158` | `Pricing v2: starter salió de la venta — el default es Pro` | `El default es Pro (el pago más económico de la lista).` |
| 53 | `apps/web/src/app/coach/subscription/_components/SubscriptionContent.tsx:206` | `starter (grandfathered) a 'pro' — sin esto un grandfathered abriria con un` | `un tier legacy a 'pro' — sin esto un grandfathered abriria con un` |
| 54 | `apps/web/src/app/coach/subscription/_components/SubscriptionContent.tsx:727` | `el server solo acepta starter/pro/elite` | `el server solo acepta pro/elite` |
| 55 | `packages/schemas/coupon.ts:13-14` | `Pricing v2 (specs/pricing-v2, C2): starter salió de la VENTA — la EMISIÓN nueva ya no lo ofrece … y el CANJE de un cupón starter HISTÓRICO` | `Tiers pagos a los que un cupón puede aplicar: pro/elite. Un cupón histórico con un scope retirado cae en el check genérico de scope (\`coupons.service.ts\`)` |
| 56 | `apps/mobile/app/(auth)/login.tsx:132` | `caché vieja del device o el legacy starter ⇒ branding EVA` | `caché vieja del device ⇒ branding EVA` |
| 57 | `apps/mobile/app/(auth)/login.tsx:436` | `free/starter lo llevan, pro/elite no.` | `free lo lleva, pro/elite no.` |
| 58 | `apps/mobile/app/alumno/(tabs)/perfil.tsx:465` | `(tier inválido o el legacy starter).` | `(tier inválido).` |
| 59 | `apps/mobile/app/alumno/(tabs)/perfil.tsx:752` | `(free/starter sí, pro/elite no)` | `(free sí, pro/elite no)` |
| 60 | `apps/mobile/app/coach/(tabs)/settings.tsx:319` | `que sigue sin marca propia es \`starter\` (fuera de venta, histórico grandfathered).` | `sin marca propia no existe hoy: el flag queda como fail-closed de tier corrupto.` |
| 61 | `apps/mobile/app/coach/settings/brand.tsx:495` | `(«branding es starter+») y con él la pantalla` | `(«branding es de pago») y con él la pantalla` |
| 62 | `apps/mobile/components/brand/EvaBadge.tsx:8` | `Free/starter lo llevan en las superficies del ALUMNO` | `Free lo lleva en las superficies del ALUMNO` |
| 63 | `apps/mobile/components/coach/directory/CreateClientModal.tsx:659` | `(free/starter sí).` | `(free sí).` |
| 64 | `apps/mobile/lib/brand-fonts.ts:116` | `(\`isBrandingAllowed\` false ⇒ tier inválido o el legacy starter)` | `(\`isBrandingAllowed\` false ⇒ tier inválido)` |
| 65 | `apps/mobile/lib/branding.ts:24` | `hoy solo cae a EVA un tier invalido o el legacy starter.` | `hoy solo cae a EVA un tier invalido.` |
| 66 | `apps/mobile/lib/branding.ts:25` | `(free/starter si,` | `(free si,` |
| 67 | `apps/mobile/lib/coach-brand.ts:211` | `(o el legacy starter, que sigue sin` | `(que sigue sin` |
| 68 | `apps/mobile/lib/coach-brand.ts:294` | `fail-closed para tier inválido / legacy starter` | `fail-closed para tier inválido` |
| 69 | `apps/mobile/lib/coach.ts:6` | `fail-closed de \`isBrandingAllowed\` — tier inválido o legacy starter.` | `fail-closed de \`isBrandingAllowed\` — tier inválido.` |
| 70 | `apps/mobile/lib/nutrition-day-export.ts:79` | `(free/starter sí, pro/elite no), FAIL-OPEN.` | `(free sí, pro/elite no), FAIL-OPEN.` |
| 71 | `apps/mobile/lib/nutrition-day-export.ts:115` | `inválido y al legacy starter.` | `inválido.` |
| 72 | `apps/mobile/lib/plan-change.ts:52` | `(free/starter → pro/elite es el caso real de venta).` | `(free → pro/elite es el caso real de venta).` |

> Los comentarios de `apps/mobile/lib/coach.ts:38` y de los 4 parsers web mueren con su función en **S1.10**; los de `packages/tiers/index.ts` en **S2.1**; los de `processing`/`flow-processing` en **S2.7**; los de `ReactivateClient` en **S2.6**; los de `create-preference:441` y `SubscriptionContent:492,827,637` en **S2.11**. No repetirlos acá.

### S3.9 · Docs — tabla

- **Verde:** `pnpm docs:check` verde (valida frontmatter, enlaces relativos y el tope de 16 KB de `CURRENT.md`; **imprimir el tamaño** que reporta el script, hoy 13.249 B) · `git grep -in "starter" -- docs/product docs/operations` ⇒ solo las menciones nuevas con fecha de retiro · `git grep -in "starter" -- specs` ⇒ los 4 hits históricos + las 4 notas de superación (residual declarado en el grep de cierre) · las 2 líneas de `docs/status/CURRENT.md` (`:93`, `:101`) desaparecen y el archivo **pesa menos** que antes del tren.

**d-a:** 0,2 · **INVISIBLE** · — · **Opus** (los canónicos exigen frontmatter bien formado; `docs:check` los valida).

| Archivo:línea | Qué dice hoy | Edición exacta | Ojo |
|---|---|---|---|
| `docs/product/PRODUCT_OVERVIEW.md:92` | `…Pro (25) y Elite (60); Starter, Growth y Scale permanecen solo por compatibilidad con cuentas legacy;` | → `…Pro (25) y Elite (60); Growth y Scale permanecen solo por compatibilidad con cuentas legacy (Starter se retiró del producto el 2026-09-XX);` | **Canónico** (`status: active`, `canonical: true`): actualizar `last_verified` a la fecha del tren |
| `docs/specs/pricing-v3/TASKS.md:50` | `- [x] F4.8 \`docs/legal\` sin cambios (genérico); \`PRODUCT_OVERVIEW.md:92\` quitar «Starter».` | Agregar al final de la línea: ` (marcada hecha sin hacer — se ejecuta de verdad en el SDD retiro-starter-y-enterprise, S3.9)` | Hallazgo de higiene del informe S4 §0.6 |
| `docs/specs/pricing-v3/SPEC.md:52,58,118` | `Starter fuera de venta` · `showsEvaBadge … free/starter true` · alcance excluye Starter | **Nota de superación** al pie del documento (no reescribir el cuerpo): `> Superada en la parte de Starter por docs/specs/retiro-starter-y-enterprise (2026-09-XX): starter salió del union, del catálogo y de la DB por defecto.` | `status: done` — patrón ya usado por `pricing-v2/SPEC.md` |
| `docs/specs/embudo-free-pro/SPEC.md:24` | `5. \`starter\` no se toca. El cobro coach→alumno es otro plan (artifact «La escalera del cobro» \`49fd620e\`).` | → `5. \`starter\` se retiró del proyecto el 2026-09-XX (docs/specs/retiro-starter-y-enterprise). El cobro coach→alumno es otro plan (artifact «La escalera del cobro» \`49fd620e\`).` | **Es la única spec VIVA (`status: active`) que declara lo contrario de lo que el owner pide.** Actualizar `last_verified` |
| `docs/specs/cobros-coach-alumno/SPEC.md:42` | `de ese tren: «\`starter\` no se toca. El cobro coach→alumno es otro plan». No existe ninguna spec` | Agregar una línea a continuación: `(Esa premisa cambió: ver docs/specs/retiro-starter-y-enterprise, 2026-09-XX.)` | `status: draft`, frente distinto: **una línea, no se reescribe el plan** |
| `docs/specs/nutrition-flows-redesign/SPEC.md:66` | `… · pricing \`?? 'starter'\` · enterprise (congelada) …` | → `… · pricing \`?? 'starter'\` (**absorbido** por retiro-starter-y-enterprise, 2026-09-XX) · enterprise (congelada) …` | — |
| `specs/nutrition-exchange-lists/SPEC.md:50` | `\`canUseNutrition\` es **false en Free y Starter** (\`packages/tiers/index.ts\`), es decir nutricion es Pro+ hoy` | **Nota de superación de UNA línea** al pie (mismo trato que `docs/specs/pricing-v3`): `> Superada en 2026-09-XX (docs/specs/retiro-starter-y-enterprise): starter salió del catálogo y \`canUseNutrition\` es true en Free desde pricing v3.` | Árbol **raíz** `specs/` (SDD viejo, **sin frontmatter**): `docs:check` no lo valida ⇒ no hay `last_verified` que tocar. Entra igual al grep de cierre |
| `specs/coupon-redeem-free/SPEC.md:20` · `PLAN.md:7` · `TASKS.md:18` | `el server solo acepta \`starter\|pro\|elite\`` (`PLAN:7`) · `La rama free exige \`previewTier\` (\`starter\|pro\|elite\`)` (`SPEC:20`) · `filtrado a \`starter\|pro\|elite\`` (`TASKS:18`) | **Una** nota de superación al pie de **cada** archivo, sin reescribir el cuerpo: `> Superada en 2026-09-XX (docs/specs/retiro-starter-y-enterprise): el enum del server es free/pro/elite; starter ya no se acepta.` | Ídem: sin frontmatter, histórico ejecutado. **No** tocar las 3 menciones inline (son el acta de lo que el server aceptaba en 08-2026) |
| `docs/specs/whitelabel-color-consolidation/SPEC.md:38,62` + `TASKS.md:11` | `un coach starter deja…` · `PDF: test de gating starter → sin marca.` | **Nota al pie**, sin reescribir: `> Los tests de gating que usaban starter como «tier sin marca» pasaron a un string fuera del catálogo (retiro-starter-y-enterprise, S3.6). El gate isBrandingAllowed sigue fail-closed.` | W4.2 ya está HECHA con QA verde: histórico ejecutado |
| `docs/operations/MANUAL_TASKS.md:123-130` | ficha del coach QA: «Sin alumnos, persona \`strength\`, correo verificado» | Sumar al bloque: `Tier: pro / max_clients 25 desde el 2026-09-XX (retiro de Starter, D1=A). Si hay que recrear la cuenta, NO nace starter (el DEFAULT de la columna es 'free').` | **Canónico**: actualizar `last_verified` |
| `docs/testing/TEST_STATUS.md` § corridas | conteos de la última corrida | Sumar una línea de corrida nueva con fecha, SHA y **resultado real** de los gates de esta ola (el doc lo exige) | **Canónico**: `last_verified` con formato `YYYY-MM-DD` o `YYYY-MM-DD @ sha` |
| `docs/status/CURRENT.md:93` | `(2) fallback a starter: \`CoachCreateSheet\` arranca en \`free\` y \`getTierMaxClients\` cae a Free en vez de…` | **Cerrar el ítem** de la prioridad 10 | **Tope de 16 KB** (`scripts/check-docs.mjs:116-128`; hoy **13.249 B**, ~3,2 KB de holgura). La crónica va a la SDD, **no acá**: estas dos ediciones deben **restar** bytes, no sumar |
| `docs/status/CURRENT.md:101` | `\`flow-processing\` muestran «Starter» cuando \`?tier=\` es ilegible (solo label).` | **Cerrar el ítem** (lo resuelve S2.7) | ídem |
| `docs/specs/pricing-v2/**` · `docs/specs/ola-de-orden/SPEC.md:408` · `docs/archive/**` · `docs/audits/**` · `docs/research/**` · `docs/design-source/**` · `docs/rn-port/**` | historia | **NO tocar.** `pricing-v2/SPEC.md` es el acta de la decisión del 17-08 («Starter fuera de venta» está en el título): se le suma la nota de superación de la fila anterior, no se reescribe. **Nunca borrar una spec**: `docs:check` valida enlaces relativos (`check-docs.mjs:166-186`) | — |

### S3.10 · Entrega mobile (OTA)
- **Qué:** `eas update` sobre el piso vigente **1.1.2**, canal `production`, **android + ios** (publicar las dos plataformas). Todo lo tocado en `apps/mobile` + `packages/tiers` es **TypeScript puro**: sin módulo nativo, sin cambios de `app.json`, permisos ni plugins ⇒ **no hace falta rebuild ni subida a tiendas**.
- **Verde:** los 2 ids de update (android e ios) anotados en la SDD y en `docs/mobile/MOBILE_RELEASES_OTA.md`; smoke del owner en device: hero de «Opciones» del coach QA muestra `Plan Pro`, la ficha del alumno abre y la marca del coach se pinta igual que antes.
- **Rollout sin estado intermedio roto:** un device con caché previa donde `subscriptionTier='starter'` sigue evaluando `isBrandingAllowed('starter')` ⇒ `false` (el helper usa `?.` sobre `TIER_CAPABILITIES`, S1.2 no lo cambia) — **el mismo valor de hoy**. No se necesita invalidación de caché.
- **d-a:** 0,05 · **VISIBLE (coach RN)** · — · **jefe**

---

## Gates acumulados (S)

Runner: vitest en la **raíz** con 4 projects (`vitest.config.ts`) — **no existe** `pnpm --filter @eva/tiers test` (el paquete no tiene script `test`): siempre `pnpm vitest run <rutas>` desde la raíz. Todas las rutas de test citadas abajo fueron verificadas con `git ls-files` (34/34 existen). Nada de esto corre durante la escritura de las tandas.

### Verificación por tanda (opcional)

**No son el tren de cierre.** Son cortes baratos para mirar una tanda cuando el owner tenga CPU libre; se pueden saltear enteros, porque el `pnpm vitest run` completo del tren los cubre a todos. Si se corre alguno, se anota su resultado **real**.

```bash
# (S1 · paquete y catálogo)
pnpm vitest run packages/tiers packages/schemas

# (S2 · catálogo y display en web)
pnpm vitest run apps/web/src/lib/constants.test.ts "apps/web/src/app/admin/(panel)/coaches/_components/CoachCreateSheet.default-tier.test.ts"

# (S3 · billing y pagos)
pnpm vitest run apps/web/src/services/billing apps/web/src/lib/payments apps/web/src/app/api/payments apps/web/src/app/flow/retorno/route.test.ts

# (S4 · alta, cupo, ficha y API mobile)
pnpm vitest run "apps/web/src/app/(auth)/register/actions.test.ts" "apps/web/src/app/join/[invite_code]/_lib/join-capacity.test.ts" apps/web/src/app/coach/clients/actions.test.ts apps/web/src/app/api/mobile/coach/dashboard/route.test.ts

# (S5 · marca, correos y PDF)
pnpm vitest run apps/web/src/lib/email apps/web/src/lib/nutrition-pdf-brand.test.ts tests/brand-settings-standalone-whitelist.test.ts tests/mobile-aura-theme.test.ts

# (S6 · mobile; project propio, timeout 15 s)
pnpm vitest run tests/mobile/guided-invite.test.ts tests/mobile/plan-change.test.ts tests/mobile/nutrition-export-brand.test.ts

# (lint de mobile con su config propia — incluye no-prices-in-mobile; es el «Verde» de S1.9 y S2.5.
#  El eslint del tren de cierre corre con la config raíz sobre el diff y NO aplica esta regla)
pnpm exec eslint --config eslint.mobile.config.mjs apps/mobile
```

### Tren de cierre (obligatorio · UNA vez · antes del push)

Exactamente el orden de [PLAN §5](PLAN.md), sin repetir nada del bloque anterior. `pnpm test:changed` y el eslint de árbol entero (`apps/web/src scripts tests`) **quedan fuera**: los cubren la suite completa y el eslint del diff. `pnpm --filter @eva/web build` **no** es del frente S (es del tren E2).

```bash
pnpm docs:check                                                      # incluye el tope de 16 KB de CURRENT.md
pnpm --filter @eva/web typecheck
pnpm exec eslint $(git diff --name-only <base> -- '*.ts' '*.tsx')    # lista REAL del diff del tren
pnpm vitest run                                                      # suite completa, UNA sola vez
git grep -in "starter" -- apps packages scripts tests supabase specs | grep -viE "startError|STARTER SET"
```

El último comando es el **grep de cierre**: no es un gate del repo, es el criterio de cierre de la ola.

**Expectativa exacta del grep de cierre.** No puede dar 0 absoluto: hay residuales legítimos (todos fuera de migraciones aplicadas deben estar en esta lista). La lista es **cerrada** — cualquier hit fuera de ella es un pendiente de la ola.

| Residual permitido | Por qué |
|---|---|
| `supabase/migrations/00000000000001_baseline.sql` (5) · `20260612130000_…` (4) · `20260614130000_…` (3) · `20260805211332_…` (1) | migraciones **aplicadas**: no se editan nunca. `admin_tier_monthly_price_clp('starter') → 19990` es historia contable viva (D3=A) |
| `supabase/migrations/<version>_retire_starter_default_and_last_row.sql` | la migración de S0, que por definición nombra a starter |
| `packages/tiers/index.ts` | `LEGACY_TIER_ALIASES` (`starter` y `starter_lite` como **claves de string**, S1.9) + su JSDoc |
| `packages/tiers/parse-subscription-tier.test.ts` | inputs `'starter'`/`'starter_lite'` del parser (S1.11) |
| `apps/web/src/app/coach/reactivate/ReactivateClient.tsx` | **0 hits** tras S2.6 (el literal se va a `LEGACY_TIER_ALIASES`) — si queda alguno, es un pendiente |
| Tests-pin (strings crudos que deben seguir siendo rechazados): `apps/web/src/app/(auth)/register/actions.test.ts` · `apps/web/src/app/api/payments/create-preference/route.test.ts` · `apps/web/src/app/api/payments/flow/confirm-enrollment/route.test.ts` · `packages/schemas/coupon.test.ts` · `apps/web/src/app/admin/(panel)/coaches/_components/CoachCreateSheet.default-tier.test.ts` · `apps/web/src/lib/email/sales-templates.test.ts:73-78` · `apps/web/src/app/join/[invite_code]/_lib/join-capacity.test.ts` (título) · `apps/web/src/lib/constants.test.ts` (`isSaleTier('starter')`) · `apps/web/src/lib/payments/checkout-external-reference.test.ts` (boundary invertido) | son la red de seguridad del retiro |
| `apps/web/src/domain/org/types.ts:5` (`OrgPlan`) · `apps/web/src/app/enterprise/_data/enterprise-pricing.ts` (5) · `enterprise-content.ts:225` · `EnterpriseProblemStatement.tsx:127` | **otro namespace**: «Starter Gym», plan de organización. Muere con **Enterprise E0/E2**, no con este frente |
| `apps/mobile/lib/plan-change.ts:43` | `TIER_ORDER` se conserva a propósito (S3.1 #9) |
| `specs/nutrition-exchange-lists/SPEC.md:50` (1) · `specs/coupon-redeem-free/{SPEC.md:20, PLAN.md:7, TASKS.md:18}` (3) | árbol raíz `specs/` = SDD **ejecutados**: el cuerpo es acta histórica y no se reescribe; S3.9 solo les cuelga la nota de superación (que también dice «starter»). Es el único motivo por el que `specs` entra al grep |
| Ya excluidos por el `grep -vi`: `apps/mobile/components/alumno/home/HeroSection.tsx` y `apps/web/src/app/c/[coach_slug]/dashboard/_components/hero/WorkoutHeroCard.tsx` (`startError`, 5+5) · `supabase/migrations/_POST_DEPLOY_20260611093002_nutrition_exchanges_seed.sql:54` («STARTER SET») | falsos positivos verificados |

**Después del push (no son parte de la tanda local):**

```bash
gh workflow run CI --ref master     # job e2e manual (los secrets E2E_* viven en GitHub); ahí corren también sherif y actionlint
pnpm qa:prod:suave                  # Playwright contra prod, 1 navegador, 1 worker
```

- `tsc` de mobile corre **en GitHub** (`mobile-integration-ci.yml`) al pushear `apps/mobile/**` o `packages/**` — no se corre localmente.
- **Playwright NO se corre en esta tanda**: `tests/payment-flow-mock.spec.ts` y `tests/sprint3-register-pricing.spec.ts` se **actualizan** (S3.7) y quedan para la decisión del owner; ninguno de los dos está en el dispatch de CI.
- **OTA (S3.10)** va después del deploy web verde.

---

## Checklist de cierre (S)

- [ ] **C1 · DB.** `select count(*) from public.coaches where subscription_tier='starter';` ⇒ **0**. `column_default` de `coaches.subscription_tier` ⇒ `'free'::text` **y** de `coaches.max_clients` ⇒ `1`. `public._bak_starter_retire_<fecha>` existe, tiene **1** fila, RLS **on** y 0 policies.
- [ ] **C1b · Serie del admin.** `select * from public.get_platform_coaches_by_tier_monthly();` no cuenta al coach QA en ningún `ym`, la función quedó `SECURITY DEFINER` con `search_path` `'public','auth'` y **sin** EXECUTE para `anon`/`authenticated`; el dashboard admin (`/admin/dashboard`, service_role) sigue pintando las barras.
- [ ] **C2 · Advisors.** `get_advisors` después de S0.5 sin críticos nuevos respecto de la foto de S0.4 (único aviso aceptado: RLS-enabled-no-policy sobre la `_bak`).
- [ ] **C3 · Espejo.** El archivo de `supabase/migrations/` versionado coincide con el SQL aplicado, incluido el nombre real de la tabla `_bak`.
- [ ] **C4 · Nadie escribe starter.** `git grep -n "subscription_tier: 'starter'" -- apps packages scripts` ⇒ 0 · `git grep -n "'starter'" -- packages/schemas apps/web/src/app/admin` ⇒ 0 · `scripts/create-coach-account.mjs:71` ya no lo acepta.
- [ ] **C5 · Tipo.** `git grep -n "'starter'" -- packages/tiers/index.ts` ⇒ solo las 2 claves de `LEGACY_TIER_ALIASES`. `SubscriptionTier` tiene 5 miembros y `SaleTier` 3.
- [ ] **C6 · Fuente única del parser.** `git grep -n "normalizeCoachSubscriptionTier\|normalizeCoachTier\|normalizeSubscriptionTier" -- apps packages` ⇒ **0**; los 5 call sites usan `parseSubscriptionTier`.
- [ ] **C7 · Blindaje.** Los 7 helpers de `packages/tiers/index.ts` (`:272`, `:377`, `:471`, `:475`, `:483`, `:488`, `:554`) indexan con `?.`/`??`; `packages/tiers/parse-subscription-tier.test.ts` verde.
- [ ] **C8 · Muertos.** `git grep -n "tier-display\|isMostAffordable\|LEGACY_TIERS" -- apps packages tests scripts` ⇒ **0**.
- [ ] **C0 · Mockup-lote.** S2.0 aprobado por el owner (D1 y D2 elegidas y escritas en el TASKS) **antes** de tocar S2. Las 4 superficies del lote son las únicas VISIBLES del tren; el resto quedó etiquetado «VISIBLE en teoría, declarada».
- [ ] **C9 · Checkout.** Volver de un checkout MP **sin `?tier`** no muestra «Starter» (D2 aplicada); con D2=A, además, no se pinta chip y un `from=register` sin tier **no** dispara el POST a `create-preference` ni los eventos de funnel: muestra el error con salida a `/pricing`. `/coach/reactivate?tier=starter` preselecciona **Pro**.
- [ ] **C10 · Gates.** Los **5** comandos del § Tren de cierre corrieron con su resultado **real** anotado (no «verde por inspección»), y el grep de cierre no devuelve nada fuera de la lista cerrada de residuales. Los bloques de «Verificación por tanda» son opcionales: si se corrió alguno, va con su resultado real; si no, se anota «no corrido».
- [ ] **C11 · Docs.** `pnpm docs:check` verde **y** `docs/status/CURRENT.md` ≤ 16 KB (imprimir el tamaño que reporta el script). `embudo-free-pro/SPEC.md:24` derogado. `PRODUCT_OVERVIEW.md:92` sin «Starter».
- [ ] **C12 · Entrega.** Deploy web READY con el SHA del tren; OTA 1.1.2 android + ios publicada con sus 2 ids anotados; QA del owner en device sobre el hero de «Opciones» y `/coach/subscription`.
- [ ] **C13 · Deuda anotada.** La ola §4.2 de la SPEC («solo cupo + sello», **D4**) queda registrada con sus 8 gates muertos y sus 3 filas «Branding: Incluida / No incluida»; el CHECK `coaches_subscription_tier_check` (**D3**) queda documentado como divergente del union a propósito.

---

# FRENTE E — Enterprise


> Fragmento para fusionar en `docs/specs/retiro-starter-y-enterprise/TASKS.md` (la mitad S — Starter —
> la escribe el otro writer; el front-matter YAML lo pone el jefe al fusionar).
> Formato: `docs/specs/ola-de-orden/TASKS.md`. Nombres canónicos = [PLAN §1](PLAN.md) (no inventar
> variantes). Cada tarea es atómica: id, archivo(s):línea, qué cambia, criterio de verde verificable,
> estimación en fracción de día-agente (d-a), etiqueta VISIBLE/INVISIBLE, decisión de [SPEC §5](SPEC.md)
> de la que depende, worker sugerido.
> Repo `D:\Proyectos\Antigravity\gymappjp`, rama `rnmobiledenuevo`, HEAD `4e3f139b`, árbol limpio.
> **Ningún gate corrió al escribir esto**: se acumulan en [§ Gates acumulados (E)](#gates-acumulados-e)
> y corren UNA vez por tren, antes del push.
> Origen de cada `archivo:línea`: informes E1–E5 de la sesión (`tmp/study/`), y lo marcado
> **«verificado hoy»** se releyó en el código en esta sesión de escritura.
> **Este fragmento ya incorpora el juicio del jefe del 05-09 (J-E1…J-E14)**: E0 sin `DROP INDEX`,
> revokes repartidos entre E0 / E2-bis / E3-bis, E2 = 145 archivos, `proxy.ts:197`, `CoachSidebar`,
> D15, E2.pre y los mockup-lotes. Cero «preguntas abiertas» pendientes.

Orden de trenes: **E0 → E1 → (push + deploy) → E2.pre → E2 → E2-bis → E3 → E3-bis → (E4 solo si el owner lo pide)**.
Starter (frente S) va en paralelo a E0/E1: archivos disjuntos.

---

## E0 · Regalos + congelamiento

Código muerto sin consumidores + crons huérfanos + congelamiento DB **reversible sin un solo DROP de
datos**. Requiere **D5** (congelamiento DB) y **D7** (cron `audit-checksum`). Riesgo ~0.
Todo INVISIBLE salvo E0.11 (deja de llegar el correo semanal al owner).

### E0.A · Verificaciones read-only en LIVE (informe E4 §7) — bloquean la migración

Ninguna es una tarea de código: son SELECT en LIVE (solo lectura) cuyo resultado **cancela la fase** si
no da el criterio. Se corren en la sesión del jefe, con el MCP de Supabase, antes de escribir la migración.

**E0.1 — V1 · ¿alguna tabla con `org_id` tiene filas de negocio?**
SQL exacto (informe E4 §7):
```sql
select 'clients' t, count(*) from public.clients where org_id is not null
union all select 'exercises',            count(*) from public.exercises            where org_id is not null
union all select 'foods',                count(*) from public.foods                where org_id is not null
union all select 'saved_meals',          count(*) from public.saved_meals          where org_id is not null
union all select 'food_swap_groups',     count(*) from public.food_swap_groups     where org_id is not null
union all select 'exchange_group_foods', count(*) from public.exchange_group_foods where org_id is not null
union all select 'workout_programs',     count(*) from public.workout_programs     where org_id is not null
union all select 'nutrition_plans',      count(*) from public.nutrition_plans      where org_id is not null
union all select 'nutrition_plan_templates',    count(*) from public.nutrition_plan_templates    where org_id is not null
union all select 'nutrition_plan_templates_v2', count(*) from public.nutrition_plan_templates_v2 where org_id is not null
union all select 'nutrition_plans_v2',   count(*) from public.nutrition_plans_v2   where org_id is not null
union all select 'client_memberships',   count(*) from public.client_memberships   where org_id is not null
union all select 'client_imports',       count(*) from public.client_imports       where org_id is not null
union all select 'coach_client_assignments', count(*) from public.coach_client_assignments
union all select 'body_composition_measurements', count(*) from public.body_composition_measurements where org_id is not null
union all select 'coach_leads',          count(*) from public.coach_leads          where org_id is not null
union all select 'subscription_events',  count(*) from public.subscription_events  where org_id is not null
union all select 'payment_exceptions',   count(*) from public.payment_exceptions
union all select 'purge_audit',          count(*) from public.purge_audit
union all select 'coaches.active_org_id',count(*) from public.coaches where active_org_id is not null
union all select 'workspace_preferences.last_org_id', count(*) from public.workspace_preferences where last_org_id is not null
order by 1;
```
Criterio de paso: **todo en 0** salvo `coach_client_assignments`/`organization_members` si el owner
conserva `org-prueba`. Cualquier fila inesperada **cancela la fase**.
Verde: la consulta corre y devuelve el criterio de arriba; el resultado queda guardado en `tmp/` de la sesión.
Estimación: 0.1 d-a · INVISIBLE · D5 · worker: **jefe** (MCP Supabase, solo lectura).

**E0.2 — V2 · ¿alguien con `org_managed` o workspace `enterprise_*`?**
```sql
select subscription_status, count(*) from public.coaches group by 1 order by 2 desc;
select last_workspace_type, count(*) from public.workspace_preferences group by 1 order by 2 desc;
```
Criterio: **0** en `'org_managed'`; **0** en `'enterprise_coach'`/`'enterprise_staff'`/`'student_enterprise'`.
(La segunda consulta se contrapone con el dato del informe E4 §0: hay **1** `workspace_preferences` tipo
`enterprise_staff` con `last_org_id` ⇒ si vuelve a salir 1, **no cancela E0**, pero se registra: es lo
que hay que borrar ANTES del UPDATE de E2-bis por el CHECK `workspace_preferences_shape`, y es lo que
borra **E2.pre** antes del deploy de E2 para que ese usuario no caiga en 404.)
Verde: las 2 consultas corren; `org_managed` = 0 y el conteo de tipos `enterprise_*` queda registrado
(1 esperado, y esa fila la borra E2.pre).
Estimación: 0.1 d-a · INVISIBLE · D5 · worker: **jefe**.

**E0.3 — V3 · ACL previa de las 4 funciones a revocar — 2 en E0, 2 en E2-bis (foto para el rollback)**
```sql
select p.proname, pg_get_function_identity_arguments(p.oid) args, p.proacl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public'
   and p.proname in ('assign_org_client_to_coach','bulk_reassign_clients',
                     'bulk_reassign_clients_with_audit','bulk_assign_selected_clients');
```
Criterio: 4 filas. El `proacl` de cada una **se pega literal en el encabezado de la migración**, como
hizo `20260905190100:14-17`. Sin esta foto no hay rollback verificable.
**Reparto (J-E2)**: las 2 primeras (`assign_org_client_to_coach`, `bulk_reassign_clients`) se revocan en
**E0** (sin llamador desplegado); `bulk_reassign_clients_with_audit` y `bulk_assign_selected_clients`
tienen llamador desplegado con service role (`app/org/[slug]/_actions/org.actions.ts:814` y `:861`,
**verificado hoy**) ⇒ su `proacl` va al encabezado de la migración de **E2-bis**, no a la de E0.
Verde: la consulta devuelve 4 filas y los 4 `proacl` quedan copiados en `tmp/`, repartidos entre los dos
encabezados (2 en E0.13, 2 en E2.3.6).
Estimación: 0.1 d-a · INVISIBLE · D5 · worker: **jefe**.

**E0.4 — V4 · ¿0 llamadas a esas RPC en 7 días?**
Logs Explorer de Supabase, filtrar `path ~ '/rest/v1/rpc/(assign_org_client_to_coach|bulk_)'`, ventanas
diarias de los últimos 7 días. Es el **mismo gate** que usó SEC-01 fase 3 (`20260905190100:5-9`).
Criterio: **0 llamadas en 7 días**. Si hay una sola, se cancela el revoke de esa función.
Verde: las 7 ventanas diarias corren y dan 0 para las 4 RPC; el resultado se cita en el encabezado de la
migración que revoca cada una (E0.13 para las 2 de E0, E2.3.6 para las 2 de E2-bis).
Estimación: 0.2 d-a · INVISIBLE · D5 · worker: **jefe**.

**E0.5 — V5 · foto de las 77 policies ANTES de tocar nada**
```sql
select c.relname, p.polname, p.polcmd, p.polpermissive,
       pg_get_expr(p.polqual, p.polrelid)      as using_expr,
       pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
  from pg_policy p join pg_class c on c.oid=p.polrelid
  join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public'
   and (pg_get_expr(p.polqual,p.polrelid) ilike '%org%'
     or pg_get_expr(p.polwithcheck,p.polrelid) ilike '%org%')
 order by 1,2;
```
Criterio: **77 filas**. El resultado se guarda en `tmp/` de la sesión: es la línea base del diff de
equivalencia de E4-3a. E0 no toca una sola policy, pero sin esta foto E4 no es auditable.
Verde: 77 filas guardadas en `tmp/` de la sesión, con fecha.
Estimación: 0.1 d-a · INVISIBLE · D5 · worker: **jefe**.

### E0.B · Código muerto sin consumidores

**E0.6 — Borrar `EnterpriseCoachLoginSchema`**
Archivo: `packages/schemas/auth.ts:15-20` (`export const EnterpriseCoachLoginSchema = z.object({…})` +
`export type EnterpriseCoachLoginInput`). **Verificado hoy**: `git grep EnterpriseCoachLogin -- apps packages tests scripts`
devuelve solo esas 2 líneas ⇒ **0 consumidores**.
Verde: `pnpm --filter @eva/web typecheck` verde + `git grep -c EnterpriseCoachLogin` = 0.
Estimación: 0.1 d-a · INVISIBLE · sin decisión · worker: **Sonnet**.

**E0.7 — Borrar `apps/web/src/domain/org/types.ts`**
Archivo completo (13 líneas, **verificado hoy**): `OrgMemberStatus:1`, `OrgBillingStatus:3`,
`OrgPlan:5` (= `'starter' | 'pro' | 'enterprise'`, la **tercera** definición de tier del repo, cruce con
el frente S), `OrgContext:7-13`. **Cero importadores en todo el repo** (informe E2 §1.3 y §6.2).
Ojo: NO se toca `domain/org/permissions.ts` (tiene 4 importadores vivos fuera de `app/org`: `proxy.ts:50`,
`lib/auth/post-login-redirect.ts:3`, `post-login-redirect.server.ts:6`, `services/auth/workspace.service.ts:4`).
Verde: `typecheck` verde; `git grep -n "domain/org/types"` = 0.
Estimación: 0.1 d-a · INVISIBLE · sin decisión · worker: **Sonnet**.

**E0.8 — Borrar `TrustStrip` (componente huérfano)**
Archivos: `apps/web/src/components/auth/TrustStrip.tsx` (archivo completo; `variant = 'enterprise'` por
defecto, `:20`) y `apps/web/src/components/auth/index.ts:7-8` (**verificado hoy**:
`export { TrustStrip } from './TrustStrip'` + `export type { TrustItem } from './TrustStrip'`).
**Verificado hoy**: los únicos hits de `TrustStrip` en `apps/` + `tests/` son el propio archivo y esas
2 líneas del barrel ⇒ 0 consumidores.
Verde: `typecheck` verde; `pnpm exec eslint apps/web/src/components/auth` sin `no-unused-vars` nuevos.
Estimación: 0.1 d-a · INVISIBLE · sin decisión · worker: **Sonnet**.

**E0.9 — Borrar `apps/web/scripts/enterprise-isolation-test.mjs`**
Archivo completo (104 LOC). Escribe contra Supabase **REMOTO** (`admin.auth.admin.createUser`), con el
id de Jose Fit hardcodeado (`503412d0…`) y password literal — exactamente lo que prohíbe
`tests/e2e-accounts.ts:72` (`FORBIDDEN_E2E_SUBSTRINGS` incluye `josefit`). **Nadie lo invoca** (informe E1 §1.4:
`git grep enterprise-isolation-test` = solo su propio docstring). Borrarlo es ganancia neta de seguridad.
Verde: `git grep -c "enterprise-isolation-test"` = 0; `pnpm docs:check` verde (no hay enlace markdown a él).
Estimación: 0.1 d-a · INVISIBLE · sin decisión · worker: **Sonnet**.

### E0.C · Crons huérfanos (ruta + scheduler + scripts + docs)

Los 3 hallazgos nuevos de esta sección quedaron **confirmados por el juicio (J-E12-b)** y ya están en el
[PLAN §3-E0](PLAN.md): `package.json:41,44,45`, `scripts/run-audit-checksum-manual.mjs` y
`docs/operations/RUNBOOK.md:91`. No son opcionales: si el script o el `package.json` sobreviven, quedan
apuntando a rutas borradas.

**E0.10 — Borrar los 4 crons org SIN scheduler + el template de correo que solo ellos usan**
Archivos a borrar (los 4 existen y **ninguno figura en `vercel.json`** — verificado hoy leyendo el bloque
`crons` completo):
```
apps/web/src/app/api/cron/org-health-alert/route.ts      (338 LOC)
apps/web/src/app/api/cron/payment-reminder/route.ts      (153 LOC)
apps/web/src/app/api/cron/weekly-report-email/route.ts   (182 LOC)
apps/web/src/app/api/cron/weekly-snapshot/route.ts       ( 94 LOC)
```
Ediciones en el mismo commit:
| Archivo:línea | Edición |
|---|---|
| `apps/web/src/lib/email/transactional-templates.ts:604-653` | borrar `type OrgInactiveClientsContext` (`:604`) + `export function buildOrgInactiveClientsEmail` (`:611-653`) — **verificado hoy**; su único llamador es `org-health-alert/route.ts:4` |
| `apps/web/src/lib/email/transactional-templates.test.ts:11` | quitar `buildOrgInactiveClientsEmail,` del import (**verificado hoy**) |
| `apps/web/src/lib/email/transactional-templates.test.ts:105-…` | borrar el `it('alerta de alumnos inactivos (org)', …)` completo (**verificado hoy**, abre en `:105`, llama en `:107`) |
| `package.json:44` | borrar `"cron:weekly-snapshot": …` (**hallazgo nuevo, no está en los informes**: apunta a `/api/cron/weekly-snapshot`) |
| `package.json:45` | borrar `"cron:weekly-email": …` (**hallazgo nuevo**: apunta a `/api/cron/weekly-report-email`) |
Verde: `pnpm vitest run apps/web/src/lib/email/transactional-templates.test.ts` verde; `typecheck` verde;
`git grep -n "org-health-alert\|weekly-report-email\|weekly-snapshot\|payment-reminder" -- apps package.json vercel.json` = 0
(quedan solo hits en `docs/specs/**` cerradas, que NO se tocan).
Estimación: 0.4 d-a · INVISIBLE · sin decisión · worker: **Opus** (guiado por informe E2 §1.2).

**E0.11 — Desprogramar y borrar `audit-checksum` (lo único VISIBLE de E0)**
| Archivo:línea | Edición |
|---|---|
| `apps/web/src/app/api/cron/audit-checksum/route.ts` | **borrar el archivo** (91 LOC; lee `org_audit_logs` en `:24-28`, inserta en `audit_log_checksums` `:41-48`, manda correo a `ADMIN_EMAILS` `:54-60`) |
| `vercel.json:42-45` | borrar la entrada `{ "path": "/api/cron/audit-checksum", "schedule": "0 2 * * 0" }` — **verificado hoy** (el bloque son exactamente las líneas 42 a 45, con su coma) |
| `scripts/run-audit-checksum-manual.mjs` | **borrar el archivo** — **hallazgo nuevo, no está en ningún informe**: hace `fetch('/api/cron/audit-checksum')` y queda huérfano |
| `package.json:41` | borrar `"audit:checksum:manual": "node scripts/run-audit-checksum-manual.mjs"` — **hallazgo nuevo** |
| `docs/operations/RUNBOOK.md:91` | borrar la fila `| /api/cron/audit-checksum | 0 2 * * 0 | integridad semanal de auditoría |` — **hallazgo nuevo** (verificado hoy: es el único hit de `audit-checksum` en `docs/`) |
Efecto: el owner deja de recibir el correo semanal de checksum sobre 23 filas muertas.
Verde: `git grep -c "audit-checksum" -- apps scripts docs package.json vercel.json` = 0; `pnpm docs:check` verde;
`typecheck` verde.
Estimación: 0.25 d-a · **VISIBLE-owner** (correo semanal) · **D7-A** · worker: **Opus**.

**E0.12 — Corregir la retención falsa del RUNBOOK**
Archivo: `docs/operations/RUNBOOK.md:115` — hoy dice `| org_audit_logs | 90 días | vía RPC purge_old_audit_logs |`
(**verificado hoy**). Ese RPC **no existe** (informe E4 §6.2: 0 hits en `supabase/migrations/`, ausente de
`functions.txt`) y `purge-data/route.ts:224-231` silencia el error con un `console.warn` — por eso los 23
logs de junio siguen ahí. Qué cambia: la fila pasa a decir que **no hay retención automática** y que la
tabla se demuele en E4 (`purge-data` deja de intentarlo en E2, tarea E2.2.h).
No se crea la función: el objetivo es borrar la tabla.
Verde: `pnpm docs:check` verde; la fila ya no afirma un RPC inexistente.
Estimación: 0.1 d-a · INVISIBLE · sin decisión · worker: **Sonnet**.

### E0.D · Migración `enterprise_freeze_e0` (DB, reversible)

**E0.13 — Escribir `supabase/migrations/2026MMDDHHMMSS_enterprise_freeze_e0.sql`**
Nombre canónico: [PLAN §1](PLAN.md). Patrón exacto de encabezado + `ROLLBACK:` = `20260905190100`
(SEC-01 fase 3, aplicada el 05-09). **D5-A = revoke (2 RPC) + `DISABLE TRIGGER`, nada más**: no hay
`DROP INDEX` en esta migración (J-E1) y no hay policy `enterprise_freeze_deny` (J-E12-c). Cuerpo
propuesto (los `proacl` reales de E0.3 se pegan en el encabezado antes de aplicar):

```sql
-- ============================================================================
-- Enterprise E0 — congelamiento reversible (SDD retiro-starter-y-enterprise, fase E0).
-- Gate de la fase (verificaciones V1-V5, informe E4 §7, corridas el 2026-MM-DD):
--   V1 = 0 filas de negocio con org_id · V2 = 0 coaches org_managed
--   V3 = ACL previa (pegar acá el proacl de LAS 2 funciones que se revocan en E0)
--   V4 = 0 llamadas a esas RPC en 7 días (Logs Explorer, mismo criterio que 20260905190100:5-9)
--   V5 = 77 policies fotografiadas (línea base de E4-3a)
-- Nada del hot path del proxy se toca acá: get_org_branding e is_coach_active_org_member corren en
-- /c/* (proxy.ts:99,1252,1303,1306,1324,1358, verificado hoy) y se revocan en E3-bis; y
-- get_enterprise_alumno_context corre en /e/* y se revoca en E2-bis, DESPUÉS del deploy de E2
-- (lección 20260805182248:6-8).
-- Los 6 índices sobre org_id NO se tocan: son cobertura de FK creada por la auditoría 20260617031230
-- y el advisor unindexed_foreign_keys los volvería a pedir; mueren en E4 con las columnas.
--
-- ROLLBACK:
--   grant execute on function public.assign_org_client_to_coach(uuid, uuid) to authenticated, service_role;
--   grant execute on function public.bulk_reassign_clients(uuid, uuid, uuid) to service_role;
--   alter table public.coaches enable trigger coaches_org_managed_guard;
--   (los GRANT exactos salen del proacl de E0.3, no se inventan)
-- ============================================================================

-- 1. Revoke EXECUTE de las 2 RPC solo-org SIN llamador desplegado.
--    Firmas verificadas hoy contra las migraciones que las crearon:
--      assign_org_client_to_coach      → 20260612135000:100-101
--      bulk_reassign_clients           → 20260521110000:29-30
--    Las otras 2 (bulk_reassign_clients_with_audit, bulk_assign_selected_clients) SÍ tienen llamador
--    desplegado con service role (app/org/[slug]/_actions/org.actions.ts:814 y :861) ⇒ E2-bis.
revoke execute on function public.assign_org_client_to_coach(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.bulk_reassign_clients(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

comment on function public.assign_org_client_to_coach(uuid, uuid) is
  'Enterprise E0 (2026-MM-DD): sin EXECUTE. Su único llamador era apps/enterprise/lib/org-admin.ts:175, borrado en E1.';
comment on function public.bulk_reassign_clients(uuid, uuid, uuid) is
  'Enterprise E0 (2026-MM-DD): sin EXECUTE. Sin llamador de producción: su única mención viva era apps/web/scripts/enterprise-isolation-test.mjs:88, borrado en E0.9.';

-- 2. Apagar el trigger solo-org que corre en CADA alta/edición de coach.
--    Su propio rollback está escrito en 20260608190000:7-9.
alter table public.coaches disable trigger coaches_org_managed_guard;
```

Y **nada más**: la migración termina ahí. Todo lo que sigue quedó **descartado por el juicio del 05-09**,
sin preguntas abiertas:

> **Descartados a propósito (no se escriben):**
> 1. **Los 6 `DROP INDEX` sobre `org_id`** (`idx_workout_programs_org_id`, `idx_nutrition_plans_org_id`,
>    `idx_nutrition_plan_templates_org_id`, `idx_subscription_events_org_id`, `coach_leads_org_id_idx`,
>    `idx_payment_exceptions_org_id`). Son **cobertura de FK vigente** creada por la auditoría
>    `20260617031230`: al borrarlos, el advisor `unindexed_foreign_keys` los vuelve a pedir en el mismo
>    paso 6 de E0.14. Mueren en **E4**, junto con las columnas. De paso desaparece el problema de que
>    `DROP INDEX CONCURRENTLY` no puede correr dentro de la transacción que arma `apply_migration`.
> 2. El bloque `DO $$ … enterprise_freeze_deny …` del informe E4 §3-FASE1.4 (policy RESTRICTIVE de
>    negación en 10 tablas): el nombre canónico del PLAN §1 no lo incluye y D5-A tampoco; agrega
>    superficie de RLS nueva para congelar tablas que ya tienen 0 filas útiles.

Verde de la tarea (solo escritura del archivo): el SQL parsea; el encabezado trae `ROLLBACK:` y los
`proacl` de E0.3 de **las 2** funciones revocadas acá; el archivo **no contiene** la palabra
`index` ni `enterprise_freeze_deny`.
Estimación: 0.5 d-a · INVISIBLE · **D5-A** · worker: **Opus** (guiado por informe E4 §3-FASE1).

**E0.14 — Protocolo Supabase de la migración (tx-rollback → apply → advisors → espejo)**
Pasos, en orden, con criterio de paso propio (sin paso de índices: E0 no toca `pg_indexes`):
1. **tx-rollback**: `begin;` + cuerpo completo (los 2 revokes + `disable trigger`) + las comprobaciones
   (`has_function_privilege` de `assign_org_client_to_coach` y `bulk_reassign_clients` para
   `authenticated`/`service_role` = false; `tgenabled` del trigger = `'D'`) + `rollback;`. Criterio:
   todas dan lo esperado y el `rollback` deja `proacl`/`tgenabled` como en E0.3.
2. `get_advisors(type='security')` **antes**.
3. `apply_migration` con el nombre canónico.
4. `get_advisors(type='security')` y `type='performance'` **después**. Criterio: **sin hallazgos nuevos**
   (no se crean tablas ni policies, y los índices de FK siguen en su lugar ⇒ no aparece
   `unindexed_foreign_keys`).
5. Espejo local en `supabase/migrations/` con el SQL **exacto** aplicado. Sin regen de `database.types.ts`
   (no cambia ninguna columna).
Verde: pasos 1, 2 y 4 con su criterio; `list_migrations` muestra la migración; `alter table … enable trigger`
del rollback probado en tx-rollback aparte.
Estimación: 0.5 d-a · INVISIBLE · **D5-A** · worker: **jefe** (protocolo Supabase, no delegable).

**Total E0: ≈ 2,7 d-a** (1,1 en jefe: verificaciones + protocolo DB; 1,6 en workers).

---

## E1 · Demolición sin runtime

Borrado de la app Expo congelada, sus specs y sus scripts. **Cero imports cruzados** (informe E1 §3.1:
`git grep @eva/enterprise` solo devuelve `ci.yml:132,145`, el propio `package.json` y un doc).
Requiere **D6** (`pnpm install --lockfile-only`) y **D13** (AASA). Todo INVISIBLE salvo el AASA
(archivo servido en producción; no cambia ninguna pantalla).

**E1.1 — Borrar los 41 archivos versionados**
Lista EXACTA (informe E1 §2.1; los 26 de `apps/enterprise` y los 11 de `tests/enterprise`
**verificados hoy** con `git ls-files`, que devuelve 26 y 11 respectivamente):

```
apps/enterprise/                                   (26 archivos versionados)
  .env.example
  .gitignore
  app.json
  eas.json
  package.json
  tsconfig.json
  app/_layout.tsx
  app/index.tsx
  app/(auth)/_layout.tsx
  app/(auth)/login.tsx
  app/org/_layout.tsx
  app/org/index.tsx
  app/org/(tabs)/_layout.tsx
  app/org/(tabs)/clientes.tsx
  app/org/(tabs)/coaches.tsx
  app/org/(tabs)/configuracion.tsx
  app/org/(tabs)/dashboard.tsx
  app/org/coach/[coachId].tsx
  context/OrgContext.tsx
  lib/org-admin.ts
  lib/supabase.ts
  assets/adaptive-icon.png
  assets/favicon.png
  assets/icon.png
  assets/notification-icon.png
  assets/splash-icon.png

tests/enterprise/                                  (11 specs, 1.830 LOC)
  enterprise-coach-flags.spec.ts
  export-cross-tenant.spec.ts
  happy-path-enterprise.spec.ts
  invite-flow.spec.ts
  journey-e2e.spec.ts
  mobile-visual-audit.spec.ts
  multi-role-access.spec.ts
  org-user-auth.spec.ts
  rls-isolation.spec.ts
  storage-cross-tenant.spec.ts
  workspace-revocation-cache.spec.ts

tests/enterprise-login.spec.ts
tests/archive/enterprise-archive.spec.ts
scripts/seed-enterprise-demo-local.mjs
apps/web/scripts/enterprise-isolation-test.mjs     ← si no se borró ya en E0.9
```
26 + 11 + 2 + 2 = **41**. En disco quedan sin versionar `apps/enterprise/node_modules/` (8,4 MB medidos) y,
si existieran, `.expo/`, `dist/`, `expo-env.d.ts`: se van con el directorio (higiene local, no del repo).
`pnpm-workspace.yaml:2` (`- 'apps/*'`) **no se edita**: al desaparecer el directorio el glob deja de
resolverlo solo.
Verde: `git status` muestra 41 borrados y nada más; `git grep -c "apps/enterprise" -- apps packages tests scripts` = 0.
Estimación: 0.2 d-a · INVISIBLE · **D6** (el lock viene después) · worker: **Sonnet**.

**E1.2 — Las 13 ediciones versionadas + 2 locales (tabla EXACTA)**
Todas van en el **mismo commit** que E1.1: #5 y #7 son las que ponen gates en rojo si se olvidan.

| # | Archivo | Líneas | Edición | Etiqueta |
|---|---|---|---|---|
| 1 | `pnpm-lock.yaml` | 246-303 + snapshots | **regenerado por pnpm**, jamás a mano (E1.3) | INVISIBLE |
| 2 | `package.json` | 38, 42, 43 | borrar `seed:enterprise-demo:local` (`:38`), `test:e2e:enterprise-rls` (`:42`), `test:e2e:enterprise-roles` (`:43`) — **verificado hoy**. **NO tocar `:40`** (`audit:org-sensitive-actions`): muere en E2 con `app/org/**` | INVISIBLE |
| 3 | `.github/workflows/ci.yml` | 12, 121-123, **145**, 132-134, 227-229 | **`:145`** borrar la línea `-p @eva/enterprise` del `pnpm dlx sherif@1.13.0` (**verificado hoy**); `:12` comentario del filtro de paths; `:121-123` corregir el comentario de `pnpm dedupe --check` (**el doble `expo-constants 18.0.13 vs 18.0.14` desaparece; el de `@expo/prebuild-config 54.0.8 vs 54.0.9` NO**, conviven contra `expo@54.0.37` de mobile); `:132-134` borrar el comentario del ignore; `:227-229` «congelada» ⇒ «eliminada» | INVISIBLE |
| 4 | `.github/workflows/mobile-build.yml` | 11-12 | actualizar el comentario «enterprise retirada del picker 2026-07-29…» (el `options: [mobile]` ya está limpio) | INVISIBLE |
| 5 | `scripts/check-qa-test-lint.mjs` | 37 | `const LEGACY_ALLOWLIST = new Set(['tests/enterprise/journey-e2e.spec.ts'])` ⇒ `new Set([])` (**verificado hoy**). Sin esto `pnpm qa:lint` **sale exit 1**: `:102-107` agrega una violación cuando un allowlisted deja de tener `networkidle`, y «desaparecer» cuenta | INVISIBLE (si no, `qa:lint` rojo) |
| 6 | `apps/web/public/.well-known/apple-app-site-association` | 24-29 + 35 | borrar el objeto `{ "appID": "5GKWMMZ46Q.cl.evaapp.eva-enterprise", "paths": ["/org/*"] }` — **verificado hoy: son las líneas 24 a 29**, y hay que quitar la coma que queda colgando al final de `:23` — y la entrada `"5GKWMMZ46Q.cl.evaapp.eva-enterprise"` de `webcredentials.apps` (**`:35`**, quitando la coma de `:34`). `assetlinks.json` **no se toca** (Android nunca reclamó la app) | **VISIBLE-técnico** (archivo servido en prod) · **D13-A** |
| 7 | `tests/mobile/applinks-claims.test.ts` | 17, 142-145 | borrar `const ENTERPRISE_APP_ID = '5GKWMMZ46Q.cl.evaapp.eva-enterprise'` y el `it('el appID enterprise queda intacto', …)`. **Corre en el job `unit` de CI**: sin esto, CI rojo | INVISIBLE (si no, **CI rojo**) |
| 8 | `docs/testing/TEST_STATUS.md` | 87, 107 | `:87` «app congelada, cuarentena 2026-08-06» ⇒ app **eliminada**; `:107` sacar `@eva/enterprise` de la fila «TypeScript móvil/enterprise» | INVISIBLE |
| 9 | `docs/operations/QA_PLAYWRIGHT.md` | 167 | borrar el bullet «Cualquier cosa contra `apps/enterprise`, congelada desde el 2026-08-06» de la lista «qué NO correr» | INVISIBLE |
| 10 | `docs/operations/MANUAL_TASKS.md` | 120-121 | reescribir «… el paso de RLS de `apps/enterprise` (app congelada, B15) se eliminó» | INVISIBLE |
| 11 | `docs/operations/MOBILE_RELEASES_OTA.md` | 19 (y 28 opcional) | borrar el párrafo «`apps/enterprise` no está cubierto por esta guía…»; `:28` es entrada de changelog fechada ⇒ **dejar** o anotar el borrado | INVISIBLE |
| 12 | `docs/status/CURRENT.md` | fila Enterprise | pasar de «ELIMINADO, la demolición es el backlog B15» a «E0+E1 hechas; E2/E3 planificadas en el SDD». **Tope duro ≤ 16 KB** (hoy 13.249 B, `check-docs.mjs` `MINIMAL_VIEW_FILES`): la crónica va al SDD, no ahí | INVISIBLE |
| 13 | `docs/specs/ola-de-orden/TASKS.md` | 68 | marcar el avance de B15 (una línea, sin reescribir la spec cerrada) | INVISIBLE |
| L1 | `AGENTS.md` *(gitignored, `.gitignore:2`)* | 20, 30, 71, 107, 141 | `:20` borrar el bullet de la app congelada; `:30` borrar la fila «Enterprise \| Expo ~54.0.36»; `:71` «Para mobile/enterprise:» ⇒ «Para mobile:»; `:107` quitar «o enterprise»; `:141` quitar «/enterprise» | INVISIBLE |
| L2 | `CLAUDE.md` *(gitignored, `.gitignore:3`)* | 7 | borrar el bullet «`apps/enterprise` está congelada: no desarrollar ni correr sus gates…» | INVISIBLE |

Verde: `pnpm vitest run tests/mobile/applinks-claims.test.ts` verde · `pnpm qa:lint` exit 0 ·
`pnpm docs:check` verde · `git grep -n "@eva/enterprise"` = 0 · **`actionlint` y `sherif` se verifican en
CI después del push** (no hay binario local de `actionlint`; el `>-` del step de sherif es sensible a la
indentación, así que el job de CI es el que lo firma).
Estimación: 0.75 d-a (0.5 código/CI + 0.25 docs) · **D13-A** para #6-#7 · worker: **Opus** para #3/#6/#7,
**Sonnet** para #2/#4/#5 y los docs #8-#13.

**E1.3 — Regenerar `pnpm-lock.yaml` (procedimiento del lock)**
Comando, una sola vez, en la raíz, **con permiso explícito del owner (D6-A)**:
```
pnpm install --lockfile-only
```
Sin `--force`, sin tocar versiones. `--lockfile-only` no baja paquetes ni toca `node_modules`: solo
reescribe el lock (el `node_modules` local queda con el árbol viejo hasta el próximo install real;
inocuo para `apps/web` y `apps/mobile`, cuyas resoluciones no cambian).

**Qué DEBE aparecer en el diff** (informe E1 §4.1):
- se va el importer `apps/enterprise:` (`pnpm-lock.yaml:246-303`, 15 deps + 2 devDeps);
- se podan las resoluciones **exclusivas** de ese importer: `expo@54.0.36` (~50 líneas, con su cadena de
  peers `(expo@54.0.36)`: `@expo/cli`, `@expo/metro-config@54.0.17`, `@expo/prebuild-config@54.0.9(expo@54.0.36)`,
  `expo-asset`, `expo-font`, `expo-keep-awake`, `expo-manifests`, `babel-preset-expo`),
  `expo-constants@18.0.13` (`:5365,14502`), `expo-updates@29.0.19` (`:5581,14853`),
  `@react-native-async-storage/async-storage@2.2.0` (`:2854,11606`) y la variante propia de
  `expo-router@6.0.24(19a90bde…)` (`:14726`).

**Qué NO debe aparecer**: ningún bump ni cambio de resolución de `apps/web`, `apps/mobile` o `packages/*`
(`expo@54.0.37`, `expo-constants@18.0.14`, `expo-updates@29.0.20`, `async-storage@3.1.1` siguen igual).
**Si aparece cualquier bump de web o mobile ⇒ parar, no commitear y revisar antes.**

Por qué es obligatorio y no opcional: CI corre `pnpm install --frozen-lockfile --ignore-scripts` en 4 jobs
(`ci.yml:53,93,213,297`) **y `vercel.json` (raíz) usa `"installCommand": "pnpm install --frozen-lockfile"`**
⇒ un lock desincronizado no es solo un gate rojo, es el **deploy de producción** rojo.
Editar el YAML a mano es inviable (hay que decidir cuáles de las ~50 apariciones de `expo@54.0.36` quedan
huérfanas): **jamás a mano**.
Verde: `git diff --stat pnpm-lock.yaml` toca solo el lock; revisión ocular del diff contra la lista de
arriba; después, en el tren de gates, `pnpm install --frozen-lockfile` local sale limpio.
Estimación: 0.25 d-a · INVISIBLE · **D6-A** · worker: **jefe** (el owner autoriza; el diff lo juzga el jefe).

### Lo que se CONSERVA en E1 (y por qué)

| Qué | Por qué se queda |
|---|---|
| `docs/legal/enterprise-contract-template.md` | Es **documento canónico** (`scripts/check-docs.mjs:30`) y está enlazado desde `docs/README.md:48`. Borrarlo obliga a editar los dos o `docs:check` falla dos veces («canónico ausente» + «enlace relativo roto»). Y `docs/specs/cobros-coach-alumno/TESTING-LEGAL.md:1045` dice que **LEGAL-03** (DPA coach↔EVA, Ley 21.719 vigente el 01-12-2026) se arma **clonando y podando ese template**. Se conserva y se re-etiqueta «insumo de LEGAL-03», no «producto Enterprise» |
| `scripts/check-docs.mjs:30` | Ídem: la fila del canónico se queda porque el template se queda |
| `docs/README.md:48` | Ídem: el enlace relativo al template sigue vivo |
| `scripts/seed-e2e-personas.mjs` (bloque enterprise: `:44-46`, `:55`, `:236-260`, `:699-800`, `:983`) | 994 LOC con los 3 flujos entrelazados (solo/enterprise/team): `ensureMembership` tiene el `scope==='enterprise'` adentro y el resumen imprime `orgs`. Además **apunta a PRODUCCIÓN a propósito** (doble gate `--allow-remote` + `E2E_SEED_CONFIRM=yes`). Podarlo es cirugía sobre un script que escribe en LIVE ⇒ **muere en E2**, en el mismo commit que la allowlist y el doc de personas |
| `tests/e2e-accounts.ts:19,26,43-45,61` | Allowlist atada al seed de arriba: si se poda antes, queda inconsistente ⇒ **E2** |
| `scripts/check-org-sensitive-actions-audit.mjs` + `package.json:40` | Es el guardián de auditoría de `apps/web/src/app/org/[slug]`: mientras esa área exista, se queda. Muere en E2 (y **debe** morir en el mismo commit: hace `readdirSync` sin guard, `:24`, ⇒ ENOENT) |
| `docs/legal/tos.md` §3.2/§12 (`:49,58,128,148-157`) | Texto legal **publicado**; LEGAL-01 pendiente de revisión jurídica (`MANUAL_TASKS.md:107`). Fuera de alcance del SDD |
| `supabase/migrations/20260612135000:3` y `20260612140001:19` | Comentarios que nombran `apps/enterprise` dentro de **migraciones aplicadas** ⇒ prohibido editarlas |
| `docs/archive/**`, `docs/audits/**`, `docs/design-source/**`, `docs/research/**` y las specs cerradas | Registros fechados: reescribirlos es falsificar historial y dispara ruido en `docs:check`. **Solo se editan los 6 docs de E1.2 #8-#13** |
| `tests/landing-teams.spec.ts:30,138-142` | **Afirma que la landing NO dice «enterprise»** ⇒ este test *protege* la demolición |
| `.github/skills/impeccable/**` (3 hits «enterprise-grade») | Falso positivo de copy |

**Total E1: ≈ 1,2 d-a.**

---

## E2 · Islas web (tren aparte, después del push de E0+E1)

Borra las tres superficies de ruta (islas de import: **nadie fuera las importa**) más los módulos que
quedan huérfanos, y poda `proxy.ts`. Requiere **D8** (purga de `org-prueba`), **D9**
(`/legal/contrato-enterprise`) y **D15** (`requires_password_change` de Teams).
Riesgo medio: toca `proxy.ts` y el hot path del alumno. Gate distintivo: **`pnpm --filter @eva/web build`**
(typed routes: `CoachSidebar.tsx:421` apunta a `/org/…`, **verificado hoy**; la tarea que lo desarma es
E2.2.i).
Orden interno: **E2.pre (LIVE) → E2.pre-mockup → E2.0 → E2.1 → E2.2 → deploy → E2-bis**.

### E2.pre · Antes del deploy — la fila `workspace_preferences` `enterprise_staff` (LIVE)

**E2.pre.1 — Borrar con respaldo la única fila `enterprise_staff` (J-E9)**
Por qué antes y no en E2-bis: esa fila es del usuario owner de `org-prueba`; su `workspaceHome()` devuelve
`/org/{slug}` (`app/workspace/select/workspace-home.ts:4`, **verificado hoy**) y `defaultWorkspaceHome()`
lo mismo (`services/auth/workspace-route-guard.service.ts:48`, **verificado hoy**). Si el deploy de E2 sale
con la fila viva, ese usuario entra a un **404**. Además el CHECK `workspace_preferences_shape`
(`20260609240000:15-16,19`) exige `last_org_id NOT NULL` para ese tipo ⇒ el `update … set last_org_id = null`
de E2-bis fallaría si la fila sigue ahí (V7).
SQL (LIVE, con respaldo primero, patrón `_bak` con RLS de la lección «_bak sin RLS»):
```sql
create table public._bak_workspace_preferences_enterprise_<fecha> as
  select * from public.workspace_preferences
   where last_workspace_type in ('enterprise_coach','enterprise_staff','student_enterprise');
alter table public._bak_workspace_preferences_enterprise_<fecha> enable row level security;
revoke all on public._bak_workspace_preferences_enterprise_<fecha> from public, anon, authenticated;

delete from public.workspace_preferences
 where last_workspace_type in ('enterprise_coach','enterprise_staff','student_enterprise');
```
`ROLLBACK:` `insert into public.workspace_preferences select * from public._bak_workspace_preferences_enterprise_<fecha>;`
Verde: la `_bak` tiene el mismo conteo que V2/E0.2 (1 fila esperada), con RLS on y 0 policies; el SELECT de
V7 pasa a **0**; el usuario afectado entra por `/workspace/select` (o su home standalone) tras el deploy.
Estimación: 0.15 d-a · **VISIBLE-usuario** para ese único usuario (deja de tener home `/org/…`) · **D8** ·
worker: **jefe** (MCP Supabase, escritura acotada).

### E2.pre-mockup · Mockup-lote E2 (precondición de E2.2)

**E2.pre-mockup.1 — Lista cerrada de superficies visibles de E2, con ANTES/DESPUÉS**
Lo que ya trae el artifact del 05-09: **«Organizaciones»** desapareciendo del panel del CEO
(`AdminSidebar.tsx:18` nav desktop y `:44` nav móvil «más», tarea E2.2.b).
**Falta sumar al artifact**: el ANTES/DESPUÉS de `/admin/auditoria` con las 5 acciones `org.*` de
`admin-action-catalog.ts:94-99` (tarea E2.2.f) — al borrar sus labels, una fila histórica cae al **string
crudo** por el fallback de `:114`; el mockup muestra cómo se ve esa fila.
El resto de E2 se etiqueta **«VISIBLE en teoría, declarada»** y no exige mockup: `/org`, `/e`,
`/enterprise` y `/admin/orgs` tienen 0 usuarios reales (LIVE: 1 org de prueba, 0 clients con `org_id`),
y `CoachSidebar` (E2.2.i) solo se ve con un coach `org_managed`, de los que hay **0** en LIVE.
Verde: artifact actualizado y **aprobado por el owner** antes de abrir E2.2; la lista de superficies
visibles de E2 queda cerrada en 2 (AdminSidebar, labels de auditoría).
Estimación: 0.25 d-a · precondición VISIBLE · sin decisión · worker: **jefe**.

### E2.0 · Paso 0 — mover los 3 símbolos compartidos (bloquea todo lo demás)

**E2.0.1 — Crear `apps/web/src/services/coach/coach-identity.service.ts`**
Contenido: `slugify`, `generateTempPassword`, `generateUniqueCoachSlug` copiados **verbatim** de
`apps/web/src/services/org/org.service.ts:17-39`. Sin cambios de firma ni de comportamiento.
Verde: `typecheck` verde; diff textual de las 3 funciones idéntico al origen.
Estimación: 0.2 d-a · INVISIBLE · sin decisión · worker: **Opus**.

**E2.0.2 — Repuntar los 2 importadores de Teams y matar el TERCER importador (`writeWorkspaceAuditEvent`)**
| Archivo:línea | Edición |
|---|---|
| `apps/web/src/app/admin/(panel)/teams/_actions/teams.actions.ts:7` | el import pasa de `@/services/org/org.service` a `@/services/coach/coach-identity.service` (uso real en `:79`, `generateUniqueCoachSlug`) |
| `apps/web/src/app/coach/team/_actions/team.actions.ts:6` | ídem (usos en `:63` `generateTempPassword` y `:78` `generateUniqueCoachSlug`) |
| `apps/web/src/services/auth/workspace.service.ts:267-291` | **borrar la función `writeWorkspaceAuditEvent` completa** (**verificado hoy**: declara en `:267`, cierra en `:291`, y su primera línea es `if (!('orgId' in workspace) \|\| !workspace.orgId) return` ⇒ hoy es un **no-op** para standalone y team) |
| `apps/web/src/services/auth/workspace.service.ts:230` | borrar la línea `await writeWorkspaceAuditEvent(db, workspace, previous)` (**verificado hoy**; queda `if (result.error) return result` + `return {}`) |
| `apps/web/src/services/auth/workspace.service.ts:11` | borrar `import { writeOrgAuditEvent } from '@/services/org/org.service'` (**verificado hoy**) — es el **tercer** importador de `org.service` y sin él nada fuera de `app/org/**` lo toca |
| `apps/web/src/app/api/org/[orgSlug]/client-history/route.ts` | **borrar el archivo en este mismo paso** (es 1 de los 2 de `api/org/**`; ya está contado en los 145 de E2.1.1, no suma) |
Ojo: el `previous: WorkspacePreferenceRow` que quedaba solo para el audit puede volverse una variable sin
uso ⇒ revisar `no-unused-vars` en el mismo commit.
Verde: `typecheck` verde; `pnpm exec eslint apps/web/src/services/auth/workspace.service.ts` sin
`no-unused-vars` nuevos; **`git grep -n "services/org/org.service" -- apps/web/src` = 0 hits fuera de
`app/org/**`** (que se borra en E2.1).
Estimación: 0.2 d-a · INVISIBLE (la función ya no escribía nada: 0 workspaces con `orgId` en LIVE) · sin decisión · worker: **Opus**.

### E2.1 · Borrados por grupo (conteos verificados hoy con `git ls-files`)

**E2.1.1 — Superficies de ruta**
| Grupo | Archivos | Verificación |
|---|---:|---|
| `apps/web/src/app/org/**` | **98** | `git ls-files 'apps/web/src/app/org' \| wc -l` = 98 |
| `apps/web/src/app/enterprise/**` | **30** | ídem = 30 |
| `apps/web/src/app/e/**` | **5** | ídem = 5 (`[org_slug]/dashboard/page.tsx`, `[org_slug]/login/{page.tsx,EnterpriseLoginForm.tsx,_actions/login.actions.ts,_data/login.queries.ts}`) |
| `apps/web/src/app/admin/(panel)/orgs/**` | **5** | ídem = 5 |
| `apps/web/src/app/api/org/**` | **2** | `[orgSlug]/client-history/route.ts` + `clear-password-requirement/route.ts` |
| **subtotal rutas** | **140** | |
Nota: dentro de `app/org/**` viaja `_actions/org-actions.helpers.test.ts` (único test del árbol) y con él
el **único escritor de producción de `subscription_status='org_managed'`** (`org.actions.ts:347`).
**Conservar** los redirects `next.config.ts:45-46` (`/enterprise` y `/enterprise/:path*` → `/pricing`, 308
permanentes): si se borran, la ruta pasa de 308 a 404 y se pierde la consolidación SEO hacia `/pricing`.
Verde: `git status` muestra exactamente **140** borrados en esos 5 árboles (98+30+5+5+2, conteos
**verificados hoy** con `git ls-files`); `typecheck` verde; `pnpm --filter @eva/web build` verde (typed
routes ya no conoce `/org/…` — requiere E2.2.i hecha en el mismo commit).
Estimación: 0.3 d-a · INVISIBLE (0 usuarios reales alcanzan esas rutas) salvo `/admin/orgs` (E2.2.b) · **D9** para `/legal/contrato-enterprise` · worker: **Sonnet**.

**E2.1.2 — Módulos huérfanos tras el borrado de rutas** (9 archivos + 1 símbolo)
```
apps/web/src/services/org/org.service.ts            (91 LOC; sus 3 símbolos compartidos ya migraron en E2.0)
apps/web/src/infrastructure/db/org.repository.ts    (1.020 LOC, 30 exports; todos sus consumidores están en app/org/**)
apps/web/src/lib/enterprise/domain.ts               (17 LOC; getEnterpriseUrl e isEnterpriseDomain ya son código muerto)
apps/web/src/app/legal/contrato-enterprise/page.tsx (206 LOC, noindex, sin enlaces vivos)  ← D9
scripts/check-org-sensitive-actions-audit.mjs       (41 LOC; readdirSync sin guard ⇒ ENOENT si sobrevive)
```
Más, **en E2 pero parcial**: `apps/web/src/domain/org/permissions.ts` (149 LOC) queda **solo** con
`ENTERPRISE_STAFF_ROLES` e `isEnterpriseStaffRole` (4 importadores vivos: `proxy.ts:50`,
`lib/auth/post-login-redirect.ts:3`, `post-login-redirect.server.ts:6`, `services/auth/workspace.service.ts:4`)
y se borran sus otros exports (`orgRoleCan`, `orgRoleCanAny`, `rolesWithOrgPermission`, `orgRoleLabel`,
`isOrgRole`, `OrgPermission`, `OrgRole`: 19 imports, **todos** bajo `app/org/[slug]/`). El archivo muere
entero en **E3-b**. `domain/org/types.ts` ya murió en E0.7.
Símbolo: `getCoachEnterpriseContext` de `apps/web/src/app/coach/_data/layout.queries.ts:4-40` **NO** se
borra acá — el archivo sigue vivo por `getCoachTeamContext` y el símbolo muere en **E3-b** con `layout.tsx`.
Verde: `typecheck` verde; `pnpm --filter @eva/web build` verde (typed routes).
Estimación: 0.3 d-a · INVISIBLE · **D9** · worker: **Opus**.

**E2.1.3 — Tests y personas E2E del árbol enterprise**
- `apps/web/src/app/org/[slug]/_actions/org-actions.helpers.test.ts` se va con E2.1.1 (56 LOC).
- `scripts/seed-e2e-personas.mjs`: podar el bloque enterprise — `:44-46` (emails `orgOwner`/`orgCoach`/`orgAlumno`),
  `:55` (`const ORG = { slug: 'e2e-performance-lab' }`), `:236-260` (`scope === 'enterprise'` en
  `ensureMembership`), `:699-~800` («Flujo 2: enterprise»), `:983` (`orgs: […]` del resumen).
- `tests/e2e-accounts.ts:19,26,43-45,61`: quitar las 3 personas enterprise de la allowlist.
- `docs/testing/E2E_PERSONAS.md:10,26-28`: quitar el flujo enterprise.
Los tres van en **el mismo commit** o la allowlist queda inconsistente con el seed.
**No se corre el seed**: escribe en LIVE con doble gate; el flujo enterprise nunca corrió contra prod
(LIVE tiene 1 org y es `org-prueba`, no `e2e-performance-lab`).
Verde: `pnpm vitest run tests/e2e-accounts.test.ts` verde; `pnpm docs:check` verde;
`node --check scripts/seed-e2e-personas.mjs` sin error de sintaxis.
Estimación: 0.4 d-a · INVISIBLE · sin decisión · worker: **Opus** (es cirugía sobre un script que escribe en prod).

**Conteo de E2.1**: 140 (rutas) + 5 (módulos y script) = **145 archivos borrados**, más 1 test dentro de
`app/org/**` ya contado. El conteo cerrado es **145** (juicio J-E12-d; el PLAN §3-E2 ya dice 145): el «165»
del borrador anterior sumaba los 13 specs de `tests/enterprise/**` (**ya borrados en E1**) y los 5 crons
(**ya borrados en E0**). No queda nada abierto acá.

### E2.2 · Ediciones archivo:línea

**E2.2.a — `proxy.ts` (1.637 LOC), bloque por bloque**
Todas las líneas **verificadas hoy** salvo donde se indica:
| Rango | Qué es | Acción |
|---|---|---|
| `:39` | `import { getEnterpriseDomain } from '@/lib/enterprise/domain'` | borrar la línea |
| `:50` | `import { ENTERPRISE_STAFF_ROLES }` | **dejar hasta E3-b** (lo usa `resolveOrgRouteWorkspace`… que muere acá ⇒ verificar con `typecheck`: si queda sin uso, borrar en el mismo commit) |
| `:192` | `pathname === '/org/login' ||` dentro del rate-limit de POST de auth | borrar **la línea**, no el bloque |
| `:197` | `/^\/e\/[^/]+\/login$/.test(pathname) \|\|` | borrar **la línea**. **Verificado hoy: es `:197`** (`:193-194` son el comentario F4 del login del CEO y `:195` el `pathname === '/admin/login'`); el PLAN §3-E2 ya quedó corregido a `:197`. **NO tocar `:196`** (`/^\/c\/[^/]+\/login$/`) ni la regex de `/t/` de más abajo: son de standalone y Teams |
| `:254-284` | Rewrite del subdominio `enterprise.eva-app.cl` (`if (host === getEnterpriseDomain())`, `:255`), incluida la condición muerta de `/invite` (`:268`, ruta que no existe en `app/`) | borrar el bloque entero. Efecto: el subdominio pasa a servir la app normal (login de coach), **estrictamente más seguro que hoy** |
| `:286-291` | Comentario + guard `if (pathname.startsWith('/org/') && !isLocalDev) return NextResponse.redirect('/login')` | borrar el bloque (el árbol `/org` ya no existe) |
| `:358` | `const needsFullUser = pathname.startsWith('/admin') || pathname.startsWith('/org/')` | quitar **solo** `|| pathname.startsWith('/org/')`; **dejar `/admin`** |
| `:448-493` | Bloque «0. PROTECT /org/* routes» completo (público `/org/login` + `/org/setup-account`, `requires_password_change` ⇒ `/org/[slug]/setup-password`, `requires_mfa_setup` ⇒ `/org/[slug]/setup-mfa`, llamada a `resolveOrgRouteWorkspace`) | borrar el bloque. **Ojo (informe E2 §6.3, ahora resuelto por D15)**: `requires_password_change` de Teams solo se lee acá (`proxy.ts:463,468`, **verificado hoy**) y solo lo limpia `/api/org/clear-password-requirement` (que muere en E2.1.1) ⇒ tras E2 el flag quedaría estampado y sin lector. **Lo resuelve E2.2.k (D15-A)**: se deja de estampar en el mismo commit y se limpian los ya estampados en E2-bis |
| `:622-645` | En `/coach/dashboard`: si el workspace activo es `enterprise_staff` ⇒ redirect a `/org/[slug]`; si no hay workspace, `resolvePostLoginRedirect` y redirect si devuelve `/org/…`. Incluye el comentario de `:623` | borrar el bloque (deja `/coach/dashboard` sin redirect) |
| `:647-663` | `org_managed || team_managed` bloquean `/coach/subscription` y `/coach/settings` | **NO borrar el bloque**: quitar **solo** el término `org_managed`. Es un punto de riesgo Teams (E3, punto 8 de la lista) ⇒ **se hace en E3-b, no acá** |
| `:822-930` | Área alumno `/e/[org_slug]/*` (109 líneas): RPC `get_enterprise_alumno_context` (`:837,856`), headers de white-label, rewrite a `/c/[coach_slug]` + `x-client-base-path` (fin verificado hoy: `:930` es el `}` de cierre) | borrar el bloque. **NO tocar `:932-1050`** (`/t/[team_slug]`, espejo de Teams) |
| `:1550-1551` | Comentario del rewrite `/org` sobre assets Lottie | borrar el comentario |
| `:1600-1637` | `async function resolveOrgRouteWorkspace(...)` completa (**verificado hoy**: declara en `:1600`, cierra en `:1637`; su único llamador es el bloque `:449-493`) | borrar la función |
| `:88-105`, `:1242-1252`, `:1283-1370` | `isCoachActiveOrgMember()` (declara en `:94`, RPC `is_coach_active_org_member` en `:99`, usada en `:1252,1303,1306`) y el branding org dentro de `/c/[coach_slug]` (`get_org_branding` en `:1324,1358`, huérfano B-9) — **las 5 líneas verificadas hoy** | **NO se tocan en E2**: son el hot path del alumno standalone/team. El código muere en **E3-b.9** y las 2 RPC se revocan recién en **E3-bis** (J-E5) |
Verde: `typecheck` verde · `pnpm --filter @eva/web build` verde · `pnpm qa:prod:suave` (1 navegador) verde al cierre.
Estimación: 0.75 d-a · INVISIBLE · sin decisión · worker: **Opus** (bloque por bloque, con el rango citado).

**E2.2.b — `AdminSidebar` (única edición VISIBLE de E2)**
Archivo: `apps/web/src/app/admin/(panel)/AdminSidebar.tsx:18` (nav desktop) y `:44` (nav móvil «más») —
**verificado hoy**: las dos líneas son `{ href: '/admin/orgs', label: 'Organizaciones', icon: Building2 }`.
Qué cambia: borrar las 2 entradas y, si `Building2` queda sin uso, su import.
Verde: `typecheck` + `eslint` sin `no-unused-vars`; `build` verde (typed routes ya no conoce `/admin/orgs`).
Estimación: 0.1 d-a · **VISIBLE-admin** (desaparece «Organizaciones» del panel del CEO) · sin decisión · worker: **Sonnet**.

**E2.2.c — `infrastructure/db/index.ts:5`**
Borrar `export * from './org.repository'` (**verificado hoy**: es la línea 5 del barrel). De los 8
importadores de `@/infrastructure/db`, **ninguno** consume un símbolo de org (informe E2 §1.3, verificado
uno por uno).
Verde: `typecheck` verde.
Estimación: 0.05 d-a · INVISIBLE · sin decisión · worker: **Sonnet**.

**E2.2.d — `lib/auth/fail-counter.ts` + su test**
`apps/web/src/lib/auth/fail-counter.ts:9` — `export type AuthFailFeature = 'coach' | 'org'` ⇒ `'coach'`
(**verificado hoy**); `:18` — borrar la entrada `org: { name: 'eva_org_auth_fails', path: '/org/login' }`
del `Record<AuthFailFeature, FeatureConfig>` (**verificado hoy**). `apps/web/src/lib/auth/fail-counter.test.ts:75`
— borrar el assert sobre `path === '/org/login'`.
Verde: `pnpm vitest run apps/web/src/lib/auth/fail-counter.test.ts` verde.
Estimación: 0.1 d-a · INVISIBLE · sin decisión · worker: **Sonnet**.

**E2.2.e — `app/robots.ts:10`**
Quitar `'/e/'` y `'/org/'` del array `disallow` (**verificado hoy**: los 12 prefijos están todos en la
línea 10). **Dejar** `/coach/`, `/c/`, `/t/`, `/admin/`, `/workspace/`, `/join/`, `/api/`, `/payments/`,
`/auth/`, `/flow/`.
Verde: `typecheck`; `GET /robots.txt` en el deploy no lista `/e/` ni `/org/`.
Estimación: 0.05 d-a · INVISIBLE · sin decisión · worker: **Sonnet**.

**E2.2.f — `admin-action-catalog.ts:94-99`**
Archivo: `apps/web/src/app/admin/(panel)/_components/admin-action-catalog.ts` — borrar el comentario
`:94` («Automáticas: organizaciones enterprise») y las 5 entradas `:95-99`
(`org.trial_expired_auto_suspended`, `org.trial_expiry_alert`, `org.invoice_overdue_verified`,
`org.payment_reminder_sent`, `org_owner.setup_account`) — **verificado hoy**. El Record tiene fallback
en `:114`: una fila histórica con esas acciones cae al label crudo, no rompe.
Verde: `typecheck`; `/admin/auditoria` sigue renderizando (fallback) y las filas históricas se ven como en
el DESPUÉS del mockup de E2.pre-mockup.
Estimación: 0.1 d-a · **VISIBLE-admin** si existen filas históricas con esas acciones (caen al string crudo) ⇒ **entra en el mockup-lote E2.pre-mockup** · sin decisión · worker: **Sonnet**.

**E2.2.g — `cron/mp-reconcile` (podar SOLO el barrido de `org_invoices`)**
Archivo: `apps/web/src/app/api/cron/mp-reconcile/route.ts` — **verificado hoy**:
- borrar `:427-452`: el comentario «Also flag org_invoices pending > 10 days», el `const tenDaysAgo`, el
  `select` sobre `org_invoices` y el `for (const invoice of overdueInvoices ?? [])` que inserta
  `admin_audit_logs` con `action: 'org.invoice_overdue_verified'`;
- borrar `:503`: la línea del correo «También hay N factura(s) enterprise vencida(s)…».
**PROHIBIDO tocar** `:129-130` y `:338-339` (`.not('subscription_status','eq','org_managed')` seguido de
`.not(…,'team_managed')`): son dos líneas consecutivas y borrar el bloque metería a los coaches
`team_managed` en la reconciliación de cobros. Esa poda es **E3-b**, término por término.
Verde: `typecheck`; el cron sigue compilando y el correo a `ADMIN_EMAILS` conserva divergencias + add-ons.
Estimación: 0.2 d-a · **VISIBLE-owner** (cambia el correo de reconciliación que recibe) · sin decisión · worker: **Opus**.

**E2.2.h — `cron/purge-data` (3 bloques org, no 2)**
Archivo: `apps/web/src/app/api/cron/purge-data/route.ts` — **verificado hoy**:
- `:224-231`: el `try` que llama `admin.rpc('purge_old_audit_logs' as never)` — el RPC **no existe** y el
  `catch` lo degrada a `console.warn`. Borrar el bloque completo.
- `:233-246`: purga de `organization_members` soft-deleted (>30 días). Borrar.
- `:248-261`: purga de `coach_client_assignments` soft-deleted — **hallazgo nuevo, no está en los informes**:
  `coach_client_assignments` es una tabla **solo-org** (informe E4 §2.1), así que este bloque también es
  enterprise puro. **Decidido (J-E12-a): se poda acá, en E2, con los otros dos bloques org.** La *tabla*
  sobrevive hasta E4; lo que muere ahora es el barrido del cron, que hoy corre sobre 0 filas útiles.
- `apps/web/src/app/api/cron/purge-data/route.test.ts`: ajustar los casos de los bloques borrados.
- `docs/operations/RUNBOOK.md:116-117`: borrar las filas `organization_members` y (si se poda)
  `coach_client_assignments` de la tabla de retención (**verificado hoy**; la fila `:115` ya se corrigió en E0.12).
Verde: `pnpm vitest run apps/web/src/app/api/cron/purge-data/route.test.ts` verde; `docs:check` verde.
Estimación: 0.25 d-a · INVISIBLE · sin decisión · worker: **Opus**.

**E2.2.i — `CoachSidebar`: el prop `enterpriseContext` (la razón REAL del gate de typed routes)**
Archivo: `apps/web/src/components/coach/CoachSidebar.tsx` — **todas las líneas verificadas hoy**:
| Línea | Qué es | Acción |
|---|---|---|
| `:51-55` | `enterpriseContext?: { orgSlug: string; orgName: string; orgRole: string } \| null` en `CoachSidebarProps` | borrar el campo |
| `:158` | el prop en el destructuring de `export function CoachSidebar({ …, enterpriseContext, … })` | quitar `enterpriseContext,` |
| `:215` | `const isOrgAdmin = enterpriseContext?.orgRole === 'org_owner' \|\| … === 'org_admin'` | borrar la constante (queda sin lectores tras el punto siguiente) |
| `:401-405` | badge «Gestionado por {enterpriseContext.orgName}» (`{enterpriseContext && (` en `:401`, el `<p>` en `:402`, el texto en `:403`, `</p>` en `:404`, `)}` en `:405`) | borrar el bloque |
| `:419-435` | el `<Link>` «Panel empresa», dentro de `{enterpriseContext && isOrgAdmin && ( … )}` — **`:421` es el `href` con el template literal a `/org/[orgSlug]`, el que rompe `next build` con typed routes cuando `app/org/**` deja de existir**. ⚠️ El borrador decía `:419-437`; **verificado hoy el bloque abre en `:419` y cierra en `:435`** (`:436` ya es el `navSections.map`) | borrar el bloque |
| `:20` | `Building2,` del import de `lucide-react` | borrar: tras lo anterior queda **sin uso** (los 2 únicos hits eran `:20` y `:431`) |
Y en el llamador: `apps/web/src/app/coach/layout.tsx:369` — borrar `enterpriseContext={enterpriseContext}`
(**verificado hoy**).
**NO tocar** en esta tarea `layout.tsx:146,171,184,190-196,360,362-368,392` (la variable `enterpriseContext`
sigue viva ahí y alimenta los puntos 5-8 de riesgo Teams): eso es **E3-b**, término por término. Tras esta
tarea `layout.tsx` sigue compilando porque la variable conserva sus otros 7 lectores.
Verde: `typecheck` verde · `pnpm exec eslint apps/web/src/components/coach/CoachSidebar.tsx` sin
`no-unused-vars` (`Building2`, `isOrgAdmin`) · **`pnpm --filter @eva/web build` verde** (es el gate
distintivo de E2) · `git grep -n "enterpriseContext" -- apps/web/src/components` = 0.
Estimación: 0.2 d-a · **VISIBLE en teoría, declarada** (el badge y el link solo aparecen con un coach
`org_managed` y rol `org_owner`/`org_admin`: **0 en LIVE**, V2 de E0.2) ⇒ sin mockup · sin decisión ·
worker: **Opus**.

**E2.2.j — Ramas `enterprise_staff` del ruteo (mismo commit que `proxy.ts`)**
| Archivo:línea | Edición |
|---|---|
| `apps/web/src/app/workspace/select/workspace-home.ts:4` | borrar la línea entera del `if (workspace.type === 'enterprise_staff')`, que devuelve el template literal a `/org/[slug]` o, sin slug, `'/org/login'` (**verificado hoy**). **NO tocar `:5`**, que agrupa `coach_standalone`/`enterprise_coach`/`coach_team` ⇒ `/coach/dashboard`: el término `enterprise_coach` sale en **E3-b**, no acá |
| `apps/web/src/services/auth/workspace-route-guard.service.ts:48` | ídem para `defaultWorkspaceHome` (**verificado hoy**: misma forma, con el `'slug' in workspace &&` adelante). **NO tocar `:49`** (mismo motivo) ni `:50` (`student_team` ⇒ `/t/[slug]`, invariante I-11) |
Van en el **mismo commit** que E2.2.a: si `/org` deja de existir y estas dos funciones lo siguen
devolviendo, un `enterprise_staff` cae en 404. La fila que podría hacerlo ya la borró **E2.pre**.
Verde: `typecheck` verde · `pnpm vitest run apps/web/src/services/auth/workspace-routing.test.ts` verde
(I-11 intacta) · `git grep -n "'/org/login'" -- apps/web/src` = 0.
Estimación: 0.1 d-a · INVISIBLE (0 filas `enterprise_staff` tras E2.pre) · sin decisión · worker: **Sonnet**.

**E2.2.k — D15-A: dejar de estampar `requires_password_change` (Teams)**
Contexto (D15, [SPEC §5](SPEC.md)): el flag lo estampa Teams al crear coaches con clave temporal, su único
lector es el bloque `/org` del proxy (`proxy.ts:463,468`) y su único limpiador es
`api/org/clear-password-requirement` — los dos mueren en E2 ⇒ sin esta tarea el flag queda estampado,
sin lector y **sin forma de limpiarlo por producto**.
| Archivo:línea | Edición |
|---|---|
| `apps/web/src/app/admin/(panel)/teams/_actions/teams.actions.ts:72` | borrar `app_metadata: { requires_password_change: true },` del `createUser` (**verificado hoy**) |
| `apps/web/src/app/coach/team/_actions/team.actions.ts:69` | ídem (**verificado hoy**) |
Si queda un `app_metadata: {}` vacío, borrar la clave entera del objeto, no dejar el literal huérfano.
La limpieza de los ya estampados va en **E2.3.7** (E2-bis), con respaldo.
**Si el owner elige D15-B** (reimplementar el forzado de cambio de clave en `/coach/*`): esta tarea NO se
hace, se abre un estudio aparte y el flag se conserva hasta tener lector nuevo.
Verde: `typecheck` verde · `git grep -n "requires_password_change" -- apps/web/src` = 0 tras E2 (el resto
de los hits viven en `app/org/**` y `api/org/**`, borrados en E2.1.1) · alta de coach de team a mano en el
deploy: se crea, entra con la clave temporal y **no** queda en loop de cambio de clave.
Estimación: 0.15 d-a · INVISIBLE (hoy el flag ya no fuerza nada fuera de `/org`) · **D15-A** · worker: **Sonnet**.

**E2.2.l — Docs que E2 deja falsos**
`README.md:18,20,21,79` · `docs/architecture/PROJECT_STRUCTURE.md:148,150,162` ·
`docs/architecture/FLOWS_AND_COMPONENTS.md:17,20,21,33,99,121,187,203,215,217-236` ·
`docs/product/PRODUCT_OVERVIEW.md` (15 hits) · `docs/operations/RUNBOOK.md:132-133` ·
`docs/operations/RN-PARITY-DB-CHECKLIST.md:16,65` · `docs/status/MOBILE_PARITY.md:851` ·
`docs/status/CURRENT.md` (fila Enterprise, **≤ 16 KB**).
Una sola pasada, un solo commit, **sin tocar lógica** y sin entrar a `docs/archive/**`, `docs/audits/**`
ni specs cerradas.
Verde: `pnpm docs:check` verde; `CURRENT.md` sigue bajo 16 KB.
Estimación: 0.4 d-a · INVISIBLE · sin decisión · worker: **Sonnet** (lista cerrada).

### E2.3 · E2-bis — DB, **después del deploy de E2** (nunca antes)

Razón del orden (lección explícita en `20260805182248:6-8`): `get_org_branding`,
`is_coach_active_org_member` y `get_enterprise_alumno_context` corren en el hot path anon/authenticated
del proxy; revocarlas antes de que E2 borre sus llamadas **tumba `/c/*` y `/e/*`**.
**Reparto del juicio (J-E5)**: E2 borra el área `/e/*` ⇒ en E2-bis se revoca **solo**
`get_enterprise_alumno_context` (más las 2 `bulk_*` con llamador en `org.actions.ts:814,861`, que muere con
`app/org/**`). `get_org_branding` e `is_coach_active_org_member` **siguen llamándose** desde el área
`/c/[coach_slug]` (`proxy.ts:99,1252,1303,1306,1324,1358`, **verificado hoy**) ⇒ se revocan en **E3-bis**,
después de E3-b.9. Hoy no rompen nada porque están condicionadas a `clients.org_id` no nulo y **V1 dice
0 filas**: es un dato de LIVE, no una garantía del código, y por eso el revoke espera al borrado real.

**E2.3.1 — V6 · equivalencia del archive gate y de los sets de nutrición V2 (bloquea la migración)**
Reusar tal cual `supabase/tests/student_gate_equivalence.sql` y
`supabase/tests/nutrition_v2_sets_equivalence.sql`, con la definición **nueva** de las funciones, en
transacción con `ROLLBACK`. Criterio de paso (el del runbook `20260805041843:10-14`): **0 diferencias**.
**El fixture se carga DENTRO de la misma transacción** (J-E7): `supabase/tests/student_gate_org_fixture.sql`
monta una org sintética justo para poblar las ramas que se van; sin él, LIVE tiene 0 filas org y el gate
compararía dos conjuntos vacíos — verde falso. Orden dentro del `begin;`: fixture → definición nueva →
los 2 scripts de equivalencia → `rollback;`.
El fixture **NO se jubila acá**: sigue siendo el único generador de filas org para probar E3/E4 ⇒ muere
recién en **E4**, con las tablas.
Verde: los 2 scripts devuelven **0 diferencias** con el fixture cargado; el `rollback` deja las funciones
con su cuerpo anterior (`pg_get_functiondef` idéntico al de antes de la transacción).
Estimación: 0.4 d-a · INVISIBLE · sin decisión · worker: **jefe**.

**E2.3.2 — V7 · ¿el CHECK `workspace_preferences_shape` bloquea el UPDATE?**
```sql
select count(*) from public.workspace_preferences
 where last_workspace_type in ('enterprise_coach','enterprise_staff','student_enterprise');
```
Criterio: **0**. Hoy da **1** (la fila `enterprise_staff` con `last_org_id` del informe E4 §0), y esa fila
**ya la borró E2.pre.1 antes del deploy de E2** ⇒ acá V7 es la *re-verificación* de que el DELETE quedó
hecho. Si volviera a dar ≥ 1, **se cancela la migración**: el CHECK `workspace_preferences_shape`
(`20260609240000:15-16,19`) **exige** `last_org_id NOT NULL` para esos tres tipos y el
`update … set last_org_id = null` de E2.3.7 fallaría.
Verde: la consulta devuelve **0**.
Estimación: 0.1 d-a · INVISIBLE · **D8** · worker: **jefe**.

**E2.3.3 — V8 · grafo real de FKs hacia `organizations`**
```sql
select con.conname, src.relname as tabla_origen, con.confdeltype as on_delete
  from pg_constraint con
  join pg_class tgt on tgt.oid = con.confrelid
  join pg_class src on src.oid = con.conrelid
 where con.contype='f' and tgt.relname='organizations'
 order by 2;
-- confdeltype: a=NO ACTION, r=RESTRICT, c=CASCADE, n=SET NULL
```
Criterio: el `DELETE` de la org solo corre después de vaciar **todas** las `a` y `r`. No confiar en el
inventario del repo.
Verde: la lista de FKs medida en LIVE coincide una a una con el orden de borrado escrito en E2.3.7; si
aparece una FK que no está en ese orden, se reescribe la migración **antes** de aplicarla.
Estimación: 0.1 d-a · INVISIBLE · **D8** · worker: **jefe**.

**E2.3.4 — V9 · foto exacta de lo que se va a borrar**
```sql
select o.id, o.slug, o.name, o.plan, o.status, o.created_at,
       (select count(*) from public.organization_members m where m.org_id=o.id) members,
       (select count(*) from public.org_audit_logs      l where l.org_id=o.id) audit_logs,
       (select count(*) from public.clients             c where c.org_id=o.id) clients
  from public.organizations o;
```
Criterio: 1 fila (`org-prueba`), `members=1`, `audit_logs=23`, `clients=0`. El resultado alimenta el
`rows_deleted` de `purge_audit`.
Verde: la foto queda guardada en `tmp/` y sus conteos son exactamente los que después tienen las tablas
`_bak_*` (E2.3.7). Cualquier `clients > 0` **cancela la purga**.
Estimación: 0.1 d-a · INVISIBLE · **D8** · worker: **jefe**.

**E2.3.5 — V10 · forma REAL de los claims del JWT (decide si el hook se poda a ciegas)**
Desde un cliente autenticado como coach: `supabase.auth.getClaims()` y volcar el payload completo.
Criterio: confirmar si `coach_id`/`org_id` caen en la **raíz** de `claims` o dentro de `app_metadata`. Si
caen en la raíz, `apps/web/src/lib/coach-context.ts:19-24` **nunca los ve** y el fallback de DB
(`:51-80`) es el camino real ⇒ podar las ramas org del hook no cambia nada observable. **Esto es lectura
de código en el informe E4 §4.1, no medición: sin V10 no se afirma.**
Verde: el payload de `getClaims()` de un coach real queda volcado en `tmp/` y responde la pregunta con un
sí/no explícito; si `coach_id` cae en la raíz de `claims`, se escribe esa conclusión en el encabezado de la
migración E2.3.6 antes de aplicarla.
Estimación: 0.2 d-a · INVISIBLE · sin decisión · worker: **jefe**.

**E2.3.6 — Migración `2026MMDDHHMMSS_enterprise_e2bis_hook_and_sets.sql`**
Nombre canónico: [PLAN §1](PLAN.md). Tres piezas, con encabezado + bloque `ROLLBACK:` (patrón
`20260905190100`), y el cuerpo VERBATIM de la definición vigente menos las ramas org:

*(a) Hook sin ramas org, conservando `coach_id`* (base: `20260522000000:4-74`):
```sql
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql security definer set search_path = 'public' as $$
declare uid uuid := (event->>'user_id')::uuid; claims jsonb;
begin
  claims := event->'claims';
  if exists (select 1 from coaches where id = uid) then
    claims := jsonb_set(claims, '{coach_id}', to_jsonb(uid));
  end if;
  return jsonb_set(event, '{claims}', claims);
end; $$;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
```
Salen: la rama de coach con membresía activa (`org_id`/`org_role`, `:38-39`), la de staff puro
(`org_id`/`org_role`/`is_org_user`, `:53-55`) y la de MFA (`requires_mfa_setup`, `:63-65`). **El hook NO se
apaga** (`supabase/config.toml:274-276` queda igual) y **el MFA de admin no depende de él**: `proxy.ts:463,475`
lee el `app_metadata` persistido que escribe `org.actions.ts:318-321,1309` (informe E4 §4.2).

*(b) `private.student_readable_client_ids()` — de 6 ramas UNION a 4* (base VERBATIM de `20260805040810:37-74`,
**releído hoy**; salen **solo** las ramas 4 y 5 —las dos `c.org_id IS NOT NULL`—, y la rama de coach
standalone **conserva `c.org_id is null`**: es parte de la identidad de standalone y el gate contra LIVE
—0 filas org— no vería el ensanchamiento del conjunto si se lo quitara, J-E7):
```sql
create or replace function private.student_readable_client_ids()
returns setof uuid language sql stable security definer set search_path = '' rows 30 as $fn$
  select c.id from public.clients c
   where c.id = auth.uid() and c.is_archived is not true and c.is_active is not false
  union
  select c.id from public.clients c
   join public.client_memberships cm on cm.client_id = c.id
   where cm.account_id = auth.uid() and cm.deleted_at is null and cm.status = 'active'
     and c.is_archived is not true and c.is_active is not false
  union
  select c.id from public.clients c
   where c.org_id is null and c.team_id is null and c.coach_id = auth.uid()  -- ← VERBATIM, no se toca
  union
  select c.id from public.clients c
   where c.team_id is not null and exists (
     select 1 from public.teams t
      where t.id = c.team_id and t.deleted_at is null and (
        t.owner_coach_id = auth.uid() or exists (
          select 1 from public.team_members tm
           where tm.team_id = t.id and tm.coach_id = auth.uid()
             and tm.status = 'active' and tm.deleted_at is null)))
$fn$;
```

*(c) `private.nutrition_v2_manageable_client_ids()` — de 4 ramas UNION a 2* (base VERBATIM de
`20260805041843:41-70`, **releída hoy**): **quedan solo las ramas 1 y 4**; salen las 2 ramas org
(`:46-60`, las dos con `c.org_id IS NOT NULL`). La rama 1 **conserva** su
`where c.org_id is null and c.team_id is null and c.coach_id = auth.uid()` **tal cual** (mismo motivo
que en (b)).

*(d) Revoke de las RPC que E2 acaba de dejar sin llamador* — **solo las que ya no se llaman**:
```sql
revoke execute on function public.get_enterprise_alumno_context(text)
  from public, anon, authenticated, service_role;
revoke execute on function public.bulk_reassign_clients_with_audit(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.bulk_assign_selected_clients(uuid, uuid[], uuid, uuid)
  from public, anon, authenticated, service_role;
```
`get_enterprise_alumno_context` se revoca acá porque E2.2.a borró el área `/e/*` del proxy
(`:822-930`). Las 2 `bulk_*` llegan desde E0 (J-E2): su llamador desplegado era
`app/org/[slug]/_actions/org.actions.ts:814` y `:861` con service role (**verificado hoy**), y ese árbol
muere en E2.1.1. **`get_org_branding` e `is_coach_active_org_member` NO se tocan acá: van a E3-bis.**
(Las firmas salen de `20260608220000:15-30,42-75`, `20260608230000`, `20260523224600:89-90` y
`20260601000700:65-66`; **antes de escribirlas se confirma con `pg_get_function_identity_arguments`** y se
pega el `proacl` de E0.3, igual que en E0.13.)
Bloque `ROLLBACK:`: el `create or replace` con el cuerpo **anterior** del hook y de las 2 funciones
`private.*` (copiado de sus migraciones originales) + los `grant execute` inversos de las 3 RPC, con el
`proacl` de E0.3 como fuente.
Verde: V6 (0 diferencias, con el fixture cargado) antes de aplicar; tx-rollback con `has_function_privilege`
= false para las 3 RPC y `pg_get_functiondef` de las 2 `private.*` conteniendo **`c.org_id is null`** en sus
ramas standalone; advisors antes/después sin hallazgos nuevos; espejo local del SQL exacto.
Estimación: 0.75 d-a · INVISIBLE · **D5/D8** · worker: **Opus** (redacción) + **jefe** (aplicación).

**E2.3.7 — Migración `2026MMDDHHMMSS_enterprise_e2bis_purge_org_prueba.sql`**
Nombre canónico: [PLAN §1](PLAN.md). Requiere **D8-A** (respaldo `_bak_*` + purga). Orden obligatorio por
las FKs `NO ACTION` del informe E4 §2.2.B:
```sql
-- 0) respaldo primero, SIEMPRE (lección «_bak sin RLS»: RLS on + revoke)
create table public._bak_organizations_<fecha>        as select * from public.organizations;
create table public._bak_organization_members_<fecha> as select * from public.organization_members;
create table public._bak_org_audit_logs_<fecha>       as select * from public.org_audit_logs;
create table public._bak_audit_log_checksums_<fecha>  as select * from public.audit_log_checksums;
alter table public._bak_organizations_<fecha>        enable row level security;
alter table public._bak_organization_members_<fecha> enable row level security;
alter table public._bak_org_audit_logs_<fecha>       enable row level security;
alter table public._bak_audit_log_checksums_<fecha>  enable row level security;
revoke all on public._bak_organizations_<fecha>, public._bak_organization_members_<fecha>,
              public._bak_org_audit_logs_<fecha>, public._bak_audit_log_checksums_<fecha>
  from public, anon, authenticated;

-- 1) ⚠️ La fila de workspace_preferences tipo enterprise_staff YA la borró E2.pre.1 (antes del deploy
--    de E2, para que ese usuario no cayera en 404) y V7 lo re-verificó en 0. Este DELETE queda como
--    red idempotente: el CHECK workspace_preferences_shape (20260609240000:15-16,19) EXIGE
--    last_org_id NOT NULL para 'enterprise_coach'/'enterprise_staff'/'student_enterprise' ⇒ el UPDATE
--    a NULL del paso 2 falla si alguna fila así reapareció.
delete from public.workspace_preferences
 where last_workspace_type in ('enterprise_coach','enterprise_staff','student_enterprise');

-- 2) desatar los punteros NO ACTION / SET NULL
update public.coaches               set active_org_id = null where active_org_id is not null;
update public.workspace_preferences set last_org_id   = null where last_org_id   is not null;

-- 3) hijas, en orden de FK
delete from public.org_audit_logs           where org_id = '<uuid org-prueba>';
delete from public.organization_members     where org_id = '<uuid org-prueba>';
delete from public.coach_client_assignments where org_id = '<uuid org-prueba>';
delete from public.organization_invites     where org_id = '<uuid org-prueba>';
delete from public.org_invoices             where org_id = '<uuid org-prueba>';
delete from public.payment_exceptions       where org_id = '<uuid org-prueba>';
delete from public.org_announcements        where org_id = '<uuid org-prueba>';

-- 4) rastro (para eso se creó la tabla, 20260517130006:28-36)
insert into public.purge_audit (org_id, org_slug, rows_deleted, initiated_by)
values ('<uuid>', 'org-prueba', '{"org_audit_logs":23,"organization_members":1}'::jsonb,
        'demolicion-enterprise-2026-09');

-- 5) la org
delete from public.organizations where slug = 'org-prueba';

-- 6) D15-A: limpiar la bandera muerta que Teams estampaba (E2.2.k dejó de escribirla).
--    Respaldo primero: sin esto no hay rollback posible sobre auth.users.
create table public._bak_requires_password_change_<fecha> as
  select id, raw_app_meta_data from auth.users
   where raw_app_meta_data ? 'requires_password_change';
alter table public._bak_requires_password_change_<fecha> enable row level security;
revoke all on public._bak_requires_password_change_<fecha> from public, anon, authenticated;

update auth.users
   set raw_app_meta_data = raw_app_meta_data - 'requires_password_change'
 where raw_app_meta_data ? 'requires_password_change';
```
Bloque `ROLLBACK:`: `insert into … select * from public._bak_*_<fecha>` en orden inverso de FK, más el
`update auth.users u set raw_app_meta_data = u.raw_app_meta_data || b.raw_app_meta_data from
public._bak_requires_password_change_<fecha> b where b.id = u.id` para el paso 6.
Verde: V9 antes; después, `select count(*) from public.organizations` = 0, las 4 `_bak_*` con el conteo
exacto de V9, `select count(*) from auth.users where raw_app_meta_data ? 'requires_password_change'` = 0
con su `_bak` cargado, y un login real de coach de team **sin** loop de cambio de clave; advisors después
(esperable: `_bak` con RLS y 0 policies, igual que `_bak_pricing_v3_free_limits_20260821`).
Estimación: 0.6 d-a · INVISIBLE · **D8-A**, **D15-A** · worker: **Opus** (redacción) + **jefe** (aplicación).

**Total E2: ≈ 6,3 d-a** (E2.pre + mockup ≈ 0,4 · código ≈ 3,8 · E2-bis ≈ 2,1). Sube ≈ 1,1 d-a respecto del
borrador por las tareas que agregó el juicio: `writeWorkspaceAuditEvent` + `client-history` (E2.0.2),
`CoachSidebar` (E2.2.i), ramas `enterprise_staff` de ruteo (E2.2.j), D15-A (E2.2.k + paso 6 de E2.3.7) y
el DELETE previo con respaldo (E2.pre.1).

---

## E3 · Colapso de tipos (tren propio, después de E2)

Requiere **D10** (tren propio con QA de device), **D12** (`NutricionTabV1` en RN) y **D14** (copy del switcher).
Riesgo **alto para Teams** (Movens en producción): en los 12 puntos de la lista de abajo el edit correcto
es **«borrar el término», nunca «borrar el bloque»**.
Regla de oro del tren: `packages/coach-nav/nav.ts` es la **única** frontera de tipos web↔mobile
⇒ cambia en el **MISMO commit** que la fase web; el resto de mobile va en su propio OTA.

> **Regla de apertura del tren (J-E10)**: los informes E1–E5 son del **05-09** y E3 arranca después de dos
> trenes de borrado. Antes de repartir tareas, **re-grepear contra el HEAD del día**:
> `git grep -n "org_managed" -- apps packages scripts`, `git grep -n "active_org_id" -- apps packages scripts`
> y `git grep -n "'enterprise'" -- apps packages scripts`. Los conteos de las tablas de abajo (43 lectores,
> 20 archivos de constant-fold, 19 comparaciones RN) se **reemplazan** por los del día; si alguno subió,
> se busca al escritor nuevo antes de tocar nada.

### E3.0 · Mockup-lote E3 (precondición de E3-b, M1 y M2)

**E3.0.1 — Lista cerrada de superficies VISIBLES de E3, con ANTES/DESPUÉS aprobado**
Base: el artifact del 05-09. Lo que **tiene que estar dibujado antes de abrir E3-b/M1/M2**:
| Superficie | Archivo:línea (verificado hoy) | Qué cambia a la vista |
|---|---|---|
| Switcher de espacios (web) | `WorkspaceSwitcher.tsx:16-22,113` · `WorkspaceSwitchSheet.tsx:17-18,101` · `workspace/select/page.tsx:9-10` | **D14**: hoy el label sale de `ws.type.replace(/_/g,' ')` ⇒ «coach standalone»; el mockup fija el copy humano de los 3 tipos que sobreviven |
| Switcher de espacios (RN) | `apps/mobile/components/coach/WorkspaceSwitcherSheet.tsx:36,40` | desaparece la entrada `enterprise` de `KIND_META` y la rama «{org} - Coach» |
| Áreas del coach (RN) | `apps/mobile/app/coach/settings/areas.tsx:205-206` | **bug de copy vivo hoy**: `:206` dice «No disponible en cuentas gestionadas por una **organización**» ⇒ «…por un **equipo**» (un `team_managed` sin team visible ya lee el texto equivocado) |
| Perfil del coach (RN) | `apps/mobile/app/coach/(tabs)/perfil.tsx:163-168` (la `<Section title="Organizacion">` con «Nombre» y «Rol»), alimentada por `:10,43,72-78` | desaparece la sección entera |
| Copy de suscripción (RN) | `apps/mobile/lib/coach-subscription.ts:52` (`org_managed: 'Gestionada por tu organización'`) | muere la etiqueta; queda solo «Gestionada por tu equipo» (`:53`) |
| Candado de suscripción (API que pinta RN) | `api/mobile/coach/subscription-status/route.ts:73,76` (`if (status === 'org_managed' \|\| status === 'team_managed')` y `managedBy: … ? 'team' : 'org'`) | `managedBy` pasa a ser siempre `'team'` |
| Landing de invitación | `app/join/[invite_code]/page.tsx:69` | branding sin la rama org |
| Área del alumno | `app/c/[coach_slug]/layout.tsx:231` (B-9) | branding sin la rama org |
Todo lo demás de E3 que solo se vería con filas que LIVE no tiene (0 coaches `org_managed`, 0 clients con
`org_id`) se etiqueta **«VISIBLE en teoría, declarada»** y **no exige mockup**.
Verde: artifact actualizado con esas 8 superficies y **aprobado por el owner**; D14 y D12 resueltas por
escrito antes de la primera tarea de E3-b.
Estimación: 0.4 d-a · precondición VISIBLE · **D14**, **D12** · worker: **jefe**.

### E3-a · Un solo scope (sin cambio de comportamiento) — se puede hacer aunque E3-b se posponga

**E3-a.1 — Adoptar `resolveCoachScope` en los 5 resolvers duplicados**
Canónico: `apps/web/src/services/auth/coach-scope.service.ts:19-33` (**verificado hoy**:
`export async function resolveCoachScope(db, userId): Promise<CoachScope>`, con las 3 ramas
`coach_standalone` / `coach_team` / `enterprise_coach` y el `return { ok:false, … }` final).
Los **5** a reemplazar (informe E3 §2.2), todos con el **mismo** `switch` sobre `resolvePreferredWorkspace()`:
| # | Archivo:línea | Firma actual | Rama enterprise |
|---|---|---|---|
| 2 | `apps/web/src/services/client/client-scope.service.ts:13-28` | `getCoachClientScope` → `{orgId, activeTeamId}` | `:21-23` |
| 3 | `apps/web/src/services/workout/workout.service.ts:121-127` | `getCoachWorkoutScope` → `{ok, orgId, activeTeamId}` | `:125` |
| 4 | `apps/web/src/app/coach/nutrition-plans/_actions/nutrition-coach.actions.ts:125-133` | `requireCoachNutritionScope` (+ `supabase`) | `:131` |
| 5 | `apps/web/src/app/coach/dashboard/_data/dashboard.queries.ts:134-138` | `scopeFromWorkspace` → `{orgId, teamId}` | `:135` |
| 6 | `apps/web/src/services/nutrition-v2-read.service.ts:129-146` | `nutritionV2CoachScopeFromWorkspace` (**ya es 2 vías**: enterprise `throw` en `:138-139`) | `:138` — solo quitar el `case`, el `default` ya lanza |
**Fuera de esta tarea (J-E6)**: `apps/web/src/app/api/mobile/coach/clients/_mutation-auth.ts` **NO se
reemplaza por `resolveCoachScope`**. No resuelve por preferencia: resuelve por el workspace que **declara
el binario RN** en el body, vía `resolveExplicitScope` (`:35-88`, **verificado hoy**; `:87` devuelve
`{ type: 'enterprise', orgId }` solo si hay membresía). Cambiarlo por el resolver de preferencia sería un
**cambio de comportamiento** en un endpoint de mutación móvil. Lo único que se le hace es podar sus ramas
enterprise (`:87,:109,:137,:161,:174`) en **E3-b.5**.
**Contratos de error que el adaptador NO puede cambiar** (o el refactor deja de ser neutro):
- fila #2: `getCoachClientScope` termina en `throw new Error('Workspace not allowed for coach client operations')`
  (**verificado hoy**: es `client-scope.service.ts:27`, dentro de la función `:13-28`) ⇒ el llamador sigue
  recibiendo una excepción, no un `null`.
- fila #3: `getCoachWorkoutScope` termina en `return { ok: false, error: 'Workspace invalido para gestionar entrenamientos.' }`
  (**verificado hoy**: `workout.service.ts:126`) ⇒ sigue devolviendo `{ok:false}`, no lanza.
**Queda duplicado a propósito** el otro: `apps/web/src/services/client/client-archive.service.ts:57-70`
(`applyArchiveScope`) — el comentario `:53-55` dice explícitamente que la duplicación es intencional para
que el service-role no escape del workspace. En E3-b solo se le borra el `case 'enterprise'` (`:61-62`).
Criterio de verde: `typecheck` verde + las suites de scope (E3-a.3) verdes **sin cambiar un solo assert de
comportamiento** — si un test hay que reescribirlo, el refactor dejó de ser neutro.
Verde: `typecheck` verde + E3-a.3 verde sin editar asserts + `apps/web/src/app/api/mobile/coach/clients/_mutation-auth.ts`
**sin cambios en este commit** (`git diff --name-only` no lo lista).
Estimación: 0.6 d-a · INVISIBLE · **D10** · worker: **Opus**.

**E3-a.2 — Unificar las 9 copias locales de `applyOrgScope`**
El helper compartido es `apps/web/src/services/auth/coach-scope.service.ts:40` (**verificado hoy**:
`return orgId ? query.eq('org_id', orgId) : query.is('org_id', null)`), y hoy **es un export muerto**:
`git grep "from '@/services/auth/coach-scope.service'"` devuelve 4 imports y **ninguno** de `applyOrgScope`
(informe E3 §4.2). Las 9 copias locales, idénticas:
| Archivo:línea de la definición | Usos en ese archivo |
|---|---:|
| `apps/web/src/services/workout/workout.service.ts:129` | 14 (`:367,395,502,524,579,619,726,822,833,973,990,1292,1343,1432,1448,1532`) |
| `apps/web/src/app/coach/nutrition-plans/_actions/nutrition-coach.actions.ts:135` | 12 |
| `apps/web/src/app/coach/nutrition-plans/_data/nutrition-coach.queries.ts:25` | 4 |
| `apps/web/src/services/nutrition.service.ts:76` (método) | 6 |
| `apps/web/src/app/coach/builder/[clientId]/_data/builder.queries.ts:14` | 2 |
| `apps/web/src/infrastructure/db/coach.repository.ts:68` | 3 |
| `apps/web/src/infrastructure/db/client.repository.ts:39` | 1 |
| `apps/web/src/app/coach/dashboard/_data/dashboard.queries.ts:92` | 0 usos directos en el grep (**verificar en el refactor**) |
| `apps/web/src/app/api/mobile/coach/payments/route.ts:21` | 1 |
Qué cambia: cada archivo importa el compartido y borra su definición local. **Se conserva el predicado
`.is('org_id', null)`** mientras la columna exista: quitarlo es cambiar la query en 43 call-sites por cero
beneficio funcional.
Verde: `typecheck` verde; `git grep -c "orgId ? query.eq('org_id'"` = 1 (solo el compartido); las suites de
E3-a.3 sin cambios de assert.
Estimación: 0.75 d-a · INVISIBLE · **D10** · worker: **Sonnet** (lista cerrada de 9 archivos) con revisión del jefe.

**E3-a.3 — Suites que pinnean E3-a**
`pnpm vitest run apps/web/src/services/nutrition-v2-read.service.test.ts apps/web/src/services/client/client-archive.service.test.ts apps/web/src/services/search/coach-search.service.test.ts apps/web/src/app/api/mobile/coach/clients/_mutation-auth.test.ts`
(las 4 rutas **verificadas hoy** con `git ls-files`).
Verde: verdes **sin editar asserts**.
Estimación: 0.1 d-a · INVISIBLE · **D10** · worker: **jefe**.

### E3-b · Colapso a 2 vías (a nivel de grupo, con conteos)

Después de E3-a el diff «duro» son 5 archivos de tipos + los constant-folds mecánicos. Conteos del informe
E3 §5.1 y del `context.md` (85 archivos no-test fuera de los árboles ya borrados + 23 de test):

| # | Grupo | Archivos | Naturaleza | Worker |
|---|---|---:|---|---|
| E3-b.1 | Unions de tipos: `apps/web/src/domain/auth/types.ts:12-19` (`WorkspaceType`, salen `enterprise_coach`/`enterprise_staff`/`student_enterprise`), `:21` (`EnterpriseStaffRole`), `:23-63` (las 3 variantes de `ActiveWorkspace` con `orgId`), `:93-97` (5 permisos `org.*`) + `packages/coach-nav/nav.ts:41,47,88,255-267,284-290` | 2 | quirúrgico; **mismo commit web + packages** | Opus |
| E3-b.2 | Núcleo `services/auth` + repositorio: `workspace.service.ts:4,15-20,29-31,42-71,86-98,153-163,236-237,258-259,267-291` · `workspace-permissions.service.ts:3-14,36-37` · `workspace-route-guard.service.ts:10-13,35,40,48-49` · `workspace-brand.service.ts:10-33` · `mobile-student-workspace.service.ts:12-15,38-40,46-68` · `coach-scope.service.ts:15-16,29-31` · `client-scope.service.ts:21-22,56-57` · `infrastructure/db/workspace.repository.ts:89-94,116-132,158-166` (−1 query en el hot path) | 9 | quirúrgico, alto valor | Opus |
| E3-b.3 | Constant-fold de `orgId` (`const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null` ⇒ `null`, y en cascada `applyOrgScope(q, null)` ⇒ `q.is('org_id', null)`) **+ los lectores de `coaches.active_org_id`** (J-E10, **verificados hoy**): `api/cron/cap-nudge/route.ts:329` (`.is('active_org_id', null)` en el filtro de candidatos, con su comentario `:319`), `api/cron/checkout-abandoned/route.ts:127,130,367` (campo del tipo, `COACH_COLUMNS` y `if (coach.active_org_id)`), `api/mobile/coach/clients/route.ts:141,148` (columna del `select` y el cast `& { active_org_id?: string \| null }`), `coach/clients/_actions/clients.actions.ts:157,161` (ídem), `coach/nutrition-plans/new/page.tsx:65,69-70` (`select('active_org_id')` + `getCoachOrgNutritionTemplates`) | 20 + 5 | **mecánico, lista cerrada** (informe E3 §2.4-(c)); en `cap-nudge` el filtro se borra, **no** se invierte: sin org, «coach en su espacio propio» es todo coach | Sonnet |
| E3-b.4 | Ramas `if enterprise` con comportamiento real en `app/coach/**` (24 líneas / 17 archivos; en 15 de 17 el `if` es un early-return ⇒ borrar la rama deja standalone/team intactos) | 17 | mecánico con revisión | Opus |
| E3-b.5 | `app/api/**` (incluye `_mutation-auth.ts:9`: **dejar el miembro `'enterprise'` del `z.enum` de red** —es contrato con binarios publicados— y borrar solo las ramas `:87,109,137,161,174`) | 30 | mixto | Opus |
| E3-b.6 | `app/join/**` (`resolve-invite.ts:20,24,42,67-90` · `join-capacity.ts:22,40,55` · `join-referral.ts:97-98,129` · `join.actions.ts:36,59,123-…` · `page.tsx:69`) | 5 no-test | quirúrgico; `page.tsx:69` es **VISIBLE** (branding de la landing de invitación) | Opus |
| E3-b.7 | `app/c/**` (`login.actions.ts:146,151,182,187` · `layout.tsx:231` (B-9, **VISIBLE**) y `:323` · `nutrition-v2/_actions/{favorites,history,today,intake}.actions.ts:38,47,45,194` · `NutritionTodaySection.tsx:21-30`) | 11 no-test | mecánico | Opus |
| E3-b.8 | UI del switcher (`WorkspaceSwitcher.tsx:16-22,113` · `WorkspaceSwitchSheet.tsx:17-18,101` · `workspace/select/page.tsx:9-10` · `select.actions.ts:32-35`) | 4 | **VISIBLE** ⇒ **D14** (copy humano vs `ws.type.replace(/_/g,' ')`) | Opus + mockup |
| E3-b.9 | `proxy.ts` restante: `:50`, `:88-105` (`isCoachActiveOrgMember`), `:622-645` si sobrevivió, `:1242-1252`, `:1283-1370` (branding org de `/c`, con el huérfano B-9) | 1 | quirúrgico, hot path | Opus |
| E3-b.10 | Retiro de `org_managed` del código (43 lectores; **sin migración**: el CHECK es permisivo y el trigger ya quedó `DISABLE` en E0) + `domain/coach/types.ts:16`. **Suma (J-E10, verificado hoy)** los correos por comportamiento: `lib/email/behavior/behavior-triggers.ts:150` (`isOrgManaged: boolean` del snapshot), `:170` (miembro `'org_managed'` de `BehaviorTriggerReason`), `:199` (`if (snapshot.isOrgManaged) return 'org_managed'`) · `behavior-emails.ts:107` (`active_org_id` del tipo), `:111` (la columna dentro de `COACH_COLUMNS`), `:253` (`isOrgManaged: Boolean(coach.active_org_id)`), `:327` (contador `org_managed: 0` del reporte) · y su test `behavior-triggers.test.ts:295-297` (el caso «coach dentro de una organización: fuera»), que **se borra**, no se reescribe | ~17 | término, nunca bloque (§ 12 puntos) | Opus |
| E3-b.11 | Borrar `domain/org/permissions.ts` completo (ya sin los 4 importadores) | 1 | quirúrgico | Sonnet |
| E3-b.12 | Comentarios/docs (~85 líneas en `app/coach/**` + `nav.ts:18,36,44-45,92,271`): **pasada aparte, NUNCA en el mismo commit que la lógica** (ensucia el diff que el jefe juzga). **Suma (J-E10, verificado hoy)** el gate de corte de nutrición V2, que es lógica y va con su test en el mismo commit: `scripts/nutrition-v2-conversion/cutover-preflight.ts:7` (`CutoverWorkspace` incluye `'enterprise'`) y `:109` (`if (plan.workspace === 'enterprise')`), más `scripts/nutrition-v2-conversion/cutover-preflight.test.ts:79-85` (el caso «deja Enterprise fuera de este corte», con `workspace: 'enterprise'` en `:81`) | ~42 | mecánico | Sonnet |
Orden obligatorio de E3-b.10 (informe E3 §6.3): (1) retirar los lectores donde `org_managed` va acompañado
de `team_managed`; (2) confirmar que `app/org/**` ya no existe (E2 se llevó el único escritor,
`org.actions.ts:347`); (3) recién ahí sacar `'org_managed'` del union `domain/coach/types.ts:16` y de
`MANAGED_STATUSES`. Si se saca del union antes de (2), el escritor deja de compilar.
Verde de E3-b (web): `typecheck` verde · `pnpm --filter @eva/web build` verde ·
`pnpm vitest run` con los bloques de la fase E3 en verde **sin invertir un solo assert de Teams** ·
los 12 puntos de riesgo revisados uno a uno contra el texto exacto de abajo ·
`git grep -n "enterprise_coach\|enterprise_staff\|student_enterprise" -- apps/web/src packages` = 0 ·
`git grep -n "org_managed" -- apps/web/src packages` = 0 (los `team_managed` **siguen todos ahí**).
Estimación E3-b (web): **3,2 d-a** · INVISIBLE salvo E3-b.6/7/8 (los del mockup E3.0); el resto que solo se
vería con filas org es **«VISIBLE en teoría, declarada»** · **D10, D14** · workers según la tabla.

### E3-b · Los 12 puntos de riesgo Teams — con el TEXTO EXACTO a reemplazar

Regla no negociable: **se reemplaza el término, jamás se borra el bloque.** Todos los textos de abajo
fueron **releídos hoy** en el código.

**1 · `applyCoachClientScope`** — `apps/web/src/services/auth/coach-scope.service.ts:61-63`
```
    if (scope.activeTeamId) return query.is('org_id', null).eq('team_id', scope.activeTeamId)
    if (scope.orgId) return query.eq('org_id', scope.orgId).is('team_id', null)
```
⇒ borrar **solo** la segunda línea (`if (scope.orgId) …`). **NO tocar** el `.or('and(org_id.is.null,team_id.is.null)')`
de `:63`: si se borra el `.or()` entero, standalone empieza a ver alumnos de pool.

**2 · Directorio de alumnos** — `apps/web/src/app/coach/clients/_data/clients.queries.ts:32-38`
```
    if (scope.orgId) {
        query = query.eq('coach_id', coachId).eq('org_id', scope.orgId)
    } else if (scope.activeTeamId) {
        query = query.is('org_id', null).eq('team_id', scope.activeTeamId)
    } else {
        query = query.eq('coach_id', coachId).is('org_id', null).is('team_id', null)
    }
```
⇒ borrar la primera rama y promover `activeTeamId` a `if`. Si `activeTeamId` cae al `else` de standalone,
**el coach de team ve 0 alumnos**.

**3 · `client-scope.service.ts:56-57`**
```
    clientQuery = scope.orgId ? clientQuery.eq('org_id', scope.orgId) : clientQuery.is('org_id', null)
    if (!scope.orgId) clientQuery = clientQuery.is('team_id', null)
```
⇒ `clientQuery = clientQuery.is('org_id', null).is('team_id', null)`. El predicado de team estaba
**condicionado** a que no hubiera org: al colapsar tiene que quedar **incondicional**.

**4 · `client-archive.service.ts:58-68`** (`switch` exhaustivo sin `default`)
```
    case 'enterprise':
      return query.eq('org_id', actor.workspace.orgId).is('team_id', null)
```
⇒ borrar **solo** ese `case` **y** angostar el tipo `ClientArchiveActor['workspace']['type']` en el mismo
commit, o el `switch` sin `default` deja de compilar.

**5 · `app/coach/layout.tsx:184`**
```
    const isManaged = !!(enterpriseContext?.primaryColor || teamContext?.primaryColor)
```
⇒ `const isManaged = !!teamContext?.primaryColor`. Si `isManaged` queda `false` para team, **el coach de
team ve su marca personal en el panel del equipo**. VISIBLE y grave.

**6 · `app/coach/layout.tsx:188-196`** (cascada de color)
```
    const primaryColor =
        enterpriseContext?.primaryColor
            ? enterpriseContext.primaryColor
            : teamContext?.primaryColor
            ? teamContext.primaryColor
            : standaloneBrandOn
            ? (presetBrand.primary_color || BRAND_PRIMARY_COLOR)
            : SYSTEM_PRIMARY_COLOR
```
⇒ quitar los dos primeros escalones **conservando el orden** team → standalone → sistema.

**7 · `app/coach/layout.tsx:360` y `:392`**
```
                    coachBrand={enterpriseContext?.orgName ?? teamContext?.teamName ?? coach.brand_name}
                            coachBrand={enterpriseContext?.orgName ?? teamContext?.teamName ?? coach.brand_name ?? ''}
```
⇒ quitar `enterpriseContext?.orgName ??` en las dos, **sin alterar el resto del `??`** (`:392` conserva su `?? ''`).

**8 · `app/coach/layout.tsx:362-368`** (el `subscriptionStatus` **sintético**)
```
                    subscriptionStatus={
                        activeEnterpriseCoach
                            ? 'org_managed'
                            : activeTeamWorkspace
                            ? 'team_managed'
                            : coach.subscription_status
                    }
```
⇒ `subscriptionStatus={activeTeamWorkspace ? 'team_managed' : coach.subscription_status}`. Si se colapsa
mal, el nav del coach de team gana o pierde entradas.

**9 · `packages/coach-nav/nav.ts:286` y `:290`**
```
        ctx.activeWorkspaceType === 'enterprise_coach' || ctx.activeWorkspaceType === 'coach_team'
    const isManaged = status === 'org_managed' || status === 'team_managed'
```
⇒ `:286` queda `ctx.activeWorkspaceType === 'coach_team'`; `:290` queda `status === 'team_managed'`.
`isManaged` oculta `options` y `funciones` (`:294`): un error acá **cambia el menú del coach de team**.

**10 · Crons de reconciliación — dos `.not()` consecutivos, se borra UNO**
`apps/web/src/app/api/cron/flow-reconcile/route.ts:70-71`
```
        .not('subscription_status', 'eq', 'org_managed')
        .not('subscription_status', 'eq', 'team_managed')
```
`apps/web/src/app/api/cron/mp-reconcile/route.ts:129-130` y `:338-339`: **el mismo par, dos veces**.
⇒ borrar en los tres puntos **solo** la línea `'org_managed'`. Borrar el bloque metería a los coaches
`team_managed` en la reconciliación de cobros: **riesgo de negocio real**.
(También `api/cron/checkout-abandoned/route.ts:73,480,499`: sacar `org_managed` de `PAYING_STATUSES` y del
reporte `skipped.orgManaged`.)

**11 · `api/mobile/coach/subscription-status/route.ts:73` y `:76`**
```
    if (status === 'org_managed' || status === 'team_managed') {
            managedBy: status === 'team_managed' ? 'team' : 'org',
```
⇒ `:73` queda `if (status === 'team_managed') {`; `:76` queda `managedBy: 'team',`. Es **VISIBLE en RN**:
muere el copy «Gestionada por tu organización» (`apps/mobile/lib/coach-subscription.ts:52`) y queda solo
«por tu equipo».

**12 · `isManagedSubscription` / `isManagedCoach` — quitar el término, no la función**
`apps/web/src/lib/coach-subscription-gate.ts:23`
```
    return status === 'org_managed' || status === 'team_managed'
```
⇒ `return status === 'team_managed'`.
`apps/web/src/services/coach/persona.service.ts:70-76`
```
    return (
        subscriptionStatus === 'org_managed' ||
        subscriptionStatus === 'team_managed' ||
        workspaceType === 'enterprise_coach' ||
        workspaceType === 'coach_team'
    )
```
⇒ borrar las líneas 1.ª y 3.ª del `||`, **conservando** `team_managed` y `coach_team`.

### E3-bis · DB, **después del deploy de E3-b** (nunca antes)

**E3-bis.1 — Migración `2026MMDDHHMMSS_enterprise_e3bis_revoke_proxy_rpcs.sql`**
Nombre canónico: [PLAN §1](PLAN.md). Es la deuda que E2-bis dejó abierta a propósito (J-E5): las 2 RPC que
el proxy **seguía llamando** hasta E3-b.9.
```sql
revoke execute on function public.get_org_branding(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.is_coach_active_org_member(uuid, uuid)
  from public, anon, authenticated, service_role;
```
Encabezado obligatorio (patrón `20260905190100`), con esta frase textual: **la razón por la que estas dos
funciones no rompían nada entre E2 y E3 no es el código, es V1** — `clients.org_id` tiene **0 filas** en
LIVE, y las llamadas del proxy estaban condicionadas a `clientData.org_id`/`client.org_id` no nulo
(`proxy.ts:1252,1303,1306,1324,1358`, **verificado hoy**; el helper `isCoachActiveOrgMember` declara en
`:94` y hace el `rpc` en `:99`). Recién con E3-b.9 desplegado el llamador desaparece de verdad.
Precondición dura: `git grep -n "get_org_branding\|is_coach_active_org_member" -- apps` = **0** contra el
HEAD desplegado, y el deploy de E3-b **READY**.
Firmas: se confirman con `pg_get_function_identity_arguments` antes de escribirlas (`20260608220000:15-30,42-75`);
el `proacl` previo se re-fotografía como en E0.3 y se pega en el encabezado.
Bloque `ROLLBACK:`: los `grant execute` inversos según ese `proacl`.
Verde: tx-rollback con `has_function_privilege` = false para las 2 en `anon`/`authenticated`/`service_role`;
advisors antes/después sin hallazgos nuevos; `list_migrations` la muestra; espejo local idéntico; y un
smoke real de `/c/[coach_slug]` (alumno standalone y alumno de team) **200 después de aplicar**.
Estimación: 0.4 d-a · INVISIBLE · **D5/D10** · worker: **Opus** (redacción) + **jefe** (aplicación).

### E3 · Mobile (M1 / M2 / M3), por archivo:línea

Gate real de mobile: `pnpm --filter @eva/mobile exec tsc --noEmit`, que **corre solo en GitHub**
(`.github/workflows/mobile-integration-ci.yml:41-56`, push a `rnmobiledenuevo` con cambios en
`apps/mobile/**` o `packages/**`) ⇒ no quema la CPU del owner. Entrega por **OTA sobre el piso 1.1.2**
(TS puro, sin build nativo).

**M0 (regalo, ya hecho en E0.6):** `packages/schemas/auth.ts:15-20`.

**E3-M1 — Colapso del `kind` en RN (un commit, un OTA)** · INVISIBLE en producción
| Archivo:línea | Qué cambia |
|---|---|
| `apps/mobile/lib/workspace-core.ts:22` | `WorkspaceKind`: quitar `'enterprise'` |
| `…:26,32,34` | comentarios de `WorkspaceRef` (`enterprise:{orgId}`, «Set solo para enterprise») |
| `…:65` | `ACTIVE_PRIORITY` ⇒ `['standalone','team_owner','team_member']` |
| `…:67` | `WORKSPACE_KINDS` (valida la cache de AsyncStorage vía `isWorkspaceKind` ⇒ una cache vieja con kind enterprise se invalida sola) |
| `…:88-102` | `RawWorkspaceData.orgId` / `.orgName`: borrar los 2 campos |
| `…:205-213` | **LA PUERTA**: `if (orgId) refs.push({ kind:'enterprise', … })` ⇒ borrar el bloque entero |
| `…:267`, `…:302` | `applyActiveWorkspace` y `deriveWorkspaceContext`: `orgId` colapsa a `null` |
| `apps/mobile/lib/workspace.ts:9` | comentario «org se detecta por app_metadata.org_id» |
| `…:133-134` | deja de leer `app_metadata.org_id` |
| `…:139` | sacar `active_org_id` del `select` |
| `…:148-149` | borrar la query a `organizations` ⇒ **−1 round-trip por revalidación de foreground** |
| `…:159-160,178` | borrar `orgId`/`orgName` de `RawWorkspaceData` |
| `…:296,301-302` | `workspaceActionScope`: `orgId: null` o borrar el campo (decisión 1 del informe E5 §8) |
| `apps/mobile/components/coach/WorkspaceSwitcherSheet.tsx:36` | borrar la entrada `enterprise` de `KIND_META` (`Record<WorkspaceKind,…>` exhaustivo) — **VISIBLE** |
| `…:40` | borrar la rama `"{org} - Coach"` — **VISIBLE** |
| 19 comparaciones `=== 'enterprise'` / `!== 'enterprise'` en **15 archivos** | colapsar cada `if/else` a la rama team/standalone que ya existe (§4.2-4.5 del informe E5) |
| 6 unions literales duplicados: `lib/client-actions.ts:7` · `lib/clients-directory.ts:138` · `lib/nutrition-v2-scope.ts:14` · `components/coach/CoachDashboardSections.tsx:572` · `components/coach/directory/CreateClientModal.tsx:78` · `components/coach/directory/ImportClientsForm.tsx:68` | angostar; **idealmente** pasar a importar `WorkspaceKind` para que el próximo colapso sea 1 archivo |
| `apps/mobile/lib/nutrition-v2-scope.ts:33-34` | borrar `case 'enterprise': return null`; **el `default: return null` DEBE quedar** (fail-closed) |
| `apps/mobile/lib/profile-analytics-load-policy.ts:11-13` | colapsar a `hasCriticalError ? 'error' : 'rpc'`; el modo `'fallback'` desaparece del tipo |
| `apps/mobile/app/coach/settings/areas.tsx:55,60,64,76` | `isEnterprise = ws.kind==='enterprise' \|\| ws.isManaged` ⇒ **`ws.isManaged`, NO `false`** (invariante RN 11) |
| `apps/mobile/app/coach/settings/areas.tsx:205-206` | **bug de copy vivo hoy**: «No disponible en cuentas gestionadas por una **organización**» ⇒ «…por un **equipo**» (un coach `team_managed` sin team visible ya lee el texto equivocado) — **VISIBLE**, sale gratis porque la línea ya se toca |
Tests de M1 (rutas **verificadas hoy**): `tests/mobile/workspace.test.ts:68-77,115-120,152-158` ·
`tests/mobile-nutrition-v2-scope.test.ts:30` · `tests/mobile-profile-analytics-load-policy.test.ts:10-18` ·
`tests/mobile-builder-exercise-workspace.test.ts:33-40` (conservar `rechaza ids inválidos`, `:41`) ·
`tests/mobile-client-action-workspace.test.ts:13-20,28-40,70-82` · `tests/mobile-foods-scope.test.ts:8-16`.
⚠️ **`tests/**` no lo typechequea nadie** (no hay `tsconfig.json` en la raíz): estos tests **no fallan por
`tsc`, fallan en runtime** o —peor— pasan verdes probando una rama muerta. Hay que tocarlos a mano.
Verde: `tsc` mobile (GitHub) + los 6 vitest de arriba + QA de device del owner + los 3 puntos visibles
(switcher `:36,40` y copy de `areas.tsx:206`) idénticos al DESPUÉS aprobado en **E3.0**.
Estimación: 1,25 d-a · INVISIBLE en prod / **VISIBLE en 3 puntos, todos en el mockup-lote E3.0** · **D10** ·
worker: **Opus**.

**E3-M2 — Borrado de la superficie muerta de RN** · INVISIBLE tras M1
- Borrar `apps/mobile/lib/enterprise-profile-analytics.ts` (~160 LOC) + `lib/coach-client-detail.ts:607-676`
  (`ENTERPRISE_LOG_PAGE_SIZE`, `fetchEnterpriseLogPages`, `loadEnterpriseProfileAnalyticsFallback`),
  `:934-940` y los 9 usos de `enterpriseFallback?.…` (`:1022,1030,1086,1134,1137,1145,1148,1149,1178`)
  + `tests/mobile-enterprise-profile-analytics.test.ts` (126 LOC).
- Borrar `apps/mobile/lib/org.ts` (36 LOC) y repuntar sus **9 consumidores** (perfil, clientes, brand,
  coach-subscription, exercises, meal-groups, nutrition-templates, library-actions, nutrition-builder).
- Borrar `apps/mobile/lib/org-announcements.ts` + `components/alumno/home/OrgAnnouncementBanner.tsx` +
  `app/alumno/(tabs)/home.tsx:225,673` + `components/alumno/home/types.ts:10,93`.
- Quitar el gate `orgScoped` de `app/alumno/(tabs)/bodycomp.tsx:27,176-181,217-218` y
  `app/alumno/(tabs)/movement.tsx:36,129-144,186-187` — **VISIBLE en teoría, declarada**: solo lo verían
  alumnos de org y hay **0** en LIVE (V1) ⇒ sin mockup.
- `app/coach/(tabs)/perfil.tsx`: borrar la sección **«Organizacion»** — la `<Section title="Organizacion">`
  con «Nombre» y «Rol» está en **`:163-168`** (**verificado hoy**; el borrador decía `:163-167`), y con ella
  se van el import `:10` (`getCoachOrgContext, CoachOrgContext, orgRoleLabel` de `lib/org`), el estado
  `:43` y la carga `:72-78` (el `Promise.all` con `getCoachOrgContext()` y el `orgData.isOrgManaged` que
  decide si consulta la suscripción). Ojo: `:170` (`{!org?.isOrgManaged && coach ? …}`) pasa a ser
  incondicional ⇒ la sección «Suscripcion» se muestra siempre. **VISIBLE ⇒ está en E3.0.**
- `components/coach/clientDetail/nutrition/NutritionV2Summary.tsx:8,76-77,195`: `legacyWorkspace` es `false`
  constante ⇒ borrar el campo del gate.
- **Decisión D12**: `components/coach/clientDetail/NutricionTab.tsx:834` es la **única** línea que monta
  `NutricionTabV1` ⇒ borrarla deja ~790 de las 844 líneas del archivo inalcanzables. Conservar o borrar
  **lo decide el owner** (regla «V1 no se borra» del 03-08 se escribió pensando en la web).
- `org_managed` en `lib/workspace-core.ts:54-55` (`MANAGED_STATUSES`), `:114-116` (`isManagedSubscription`)
  y el label de `lib/coach-subscription.ts:52` (`org_managed: 'Gestionada por tu organización'`,
  **verificado hoy**; `:53` es el de team y **se queda**) — **VISIBLE ⇒ está en E3.0**. Invariante RN 3:
  `MANAGED_STATUSES` **conserva `team_managed`**.
Verde: `tsc` mobile (GitHub) + `pnpm vitest run tests/mobile-enterprise-profile-analytics.test.ts` **debe
quedar borrado** + QA de device + los 2 puntos visibles (perfil, copy de suscripción) iguales al DESPUÉS de E3.0.
Estimación: 1,0 d-a · INVISIBLE salvo 2 puntos (ambos en el mockup-lote E3.0) · **D10, D12** · worker: **Opus**.

**E3-M3 — Contratos compartidos** (coordinado)
- `packages/coach-nav/nav.ts:41,47,88,92,255-267,284-290` + `packages/coach-nav/nav.test.ts`
  (24 líneas: `:32,62-64,73,90-91,219-221,274,309-312,356-357,468-470,518,538-541,712-715,734,750`,
  ~10 casos + la constante `ENTERPRISE_FULL`) ⇒ **MISMO commit que E3-b.1** (web).
- `packages/schemas/program-assignment-notification.ts:4` (`kind: z.enum([…,'enterprise'])`): angostar
  **después** de que el piso OTA absorba M1.
- `apps/web/src/app/api/mobile/coach/clients/_mutation-auth.ts:9` y el resto de `z.enum` del borde: **dejar
  el miembro un release** (contrato con binarios publicados; quitarlo es un 400 nuevo para un body legacy).
- AASA + `tests/mobile/applinks-claims.test.ts`: **ya hechos en E1.2 #6-#7**.
- **NO TOCAR** (falsos positivos verificados en el informe E5 §7.4): `packages/tiers/pricing-v2.test.ts:116-138`
  y `tests/mobile/guided-invite.test.ts:377` — usan `'enterprise'` como string **fuera** del union de tiers.
- **NO TOCAR** el mecanismo de `apps/mobile/lib/db-compat.ts` (`selectWithFallback`, `isMissingColumnError`):
  no es enterprise, protege al APK contra una prod sin `org_id`/`reviewed_at`. Solo se reescriben sus 3 comentarios.
Verde: `pnpm vitest run packages/coach-nav/nav.test.ts` verde + `typecheck` web + `tsc` mobile, **los tres en
el mismo commit**.
Estimación: 0.75 d-a · INVISIBLE · **D10** · worker: **Opus**.

### CHECKLIST de invariantes de E3 (cierre del tren)

#### Web — I-1 … I-12 (copiado VERBATIM del informe E3 §7)

**I-1 — Standalone nunca ve alumnos de pool.**
`clients.coach_id = coachId AND team_id IS NULL` debe seguir aplicándose en: `coach-scope.service.ts:63` (el `.or('and(org_id.is.null,team_id.is.null)')`), `clients.queries.ts:36`, `client-scope.service.ts:57`, `client-archive.service.ts:68-70`, `mobile-nutrition-v2-workspace-context.ts:81-82`.
*Verificación*: los 5 sitios siguen conteniendo un predicado sobre `team_id` nulo tras el diff.

**I-2 — El coach de team ve el pool COMPLETO, sin filtro `coach_id`.**
`dashboard.queries.ts:364` (`if (!scope?.teamId) clientsQuery = clientsQuery.eq('coach_id', coachId)`), `dashboard.queries.ts:126-131` (`applyResourceOwnerScope`), `clients.queries.ts:34-35`, `client-scope.service.ts:39-48`.
*Verificación*: en contexto team, ninguna de esas queries agrega `.eq('coach_id', …)` sobre `clients`.

**I-3 — La marca del panel en contexto team es la del TEAM, nunca la personal.**
`layout.tsx:184` (`isManaged`), `:190-197` (cascada de color), `:360`/`:392` (`coachBrand`), `workspace-brand.service.ts:37-50` (`source: 'organization'` para `coach_team`).
*Verificación*: con `activeTeamWorkspace` presente y `enterpriseContext = null`, `isManaged` sigue siendo `true` y `primaryColor` sale de `teamContext`.

**I-4 — Aislamiento team ↔ organización al absorber coaches.**
`app/coach/team/_actions/team.actions.ts:157` y `api/mobile/team/add-coach/route.ts:83` leen `organization_members` para no absorber a un coach de una org.
*Verificación*: **mientras `organization_members` exista**, dejar el chequeo. Si la tabla se demuele (fase posterior, DB), borrar el chequeo **en el mismo commit** que la tabla, no antes.

**I-5 — `coaches.active_org_id` queda en `NULL` al elegir un workspace de team o standalone.**
`app/workspace/select/select.actions.ts:32-35` — y esto **refresca el JWT** (comentario `:29-31`: el auth hook lee `active_org_id`).
*Verificación*: tras el colapso, la acción sigue escribiendo `null` (o se remueve junto con la columna y el auth hook, nunca solo la mitad).

**I-6 — La preferencia de workspace de un coach de team no matchea nada más.**
`workspace.service.ts:256-265`: hoy `!('orgId' in workspace) && preference.last_org_id` fuerza no-match. Si se borra el chequeo de `last_org_id`, una preferencia vieja con `last_org_id` seteado empezaría a matchear un `coach_team`.
*Verificación*: `workspace-pick.test.ts:39-42` («preferencia que NO matchea ninguno → null») debe seguir verde. Si se colapsa, **agregar** un caso con `last_org_id` no nulo y workspace de team.

**I-7 — El nav del coach `team_managed` no muestra «Opciones» ni «Funciones».**
`packages/coach-nav/nav.ts:290,295` + cubierto por `nav.test.ts:315-318,577-578`.

**I-8 — Un coach `team_managed` no entra a `/coach/subscription` ni a `/coach/settings/preview`, pero SÍ a `/coach/settings`.**
`workspace-route-guard.service.ts:15-32` + `proxy.ts:648-661` (el `redirectUrl.searchParams.set('managed_by', …)`).
*Verificación*: `workspace-routing.test.ts:46-53` verde.

**I-9 — `team_managed` conserva acceso siempre y no entra en reconciliación de cobros.**
`coach-subscription-gate.ts:22-24,39,75`, `flow-reconcile/route.ts:71`, `mp-reconcile/route.ts:130,339`, `checkout-abandoned/route.ts:73`.
*Verificación*: los `.not('subscription_status','eq','team_managed')` siguen presentes en los 3 crons.

**I-10 — Nutrition V2 sigue siendo canónica para standalone y team.**
`nutrition-v2-read.service.ts:134-137`, `mobile-nutrition-v2-workspace-context.ts:24-26`, y los 6 `redirect('/coach/nutrition-plans')` de §2.4 deben **desaparecer**, no invertirse.

**I-11 — El alumno de pool rutea a `/t/[slug]`, nunca a `/c/[coach_slug]` directo.**
`workspace-route-guard.service.ts:50`, `workspace-home.ts:7`.
*Verificación*: `workspace-routing.test.ts:25-34` verde.

**I-12 — Los módulos del coach en contexto team salen del TEAM, no del coach.**
`layout.tsx:110-114` (`getTeamEnabledModules` vs `getCoachEnabledModules`), `entitlements.service.ts:113-118`.

#### RN — 1 … 14 (copiado VERBATIM del informe E5 §6)

1. `WorkspaceKind` conserva **dos** kinds de team: `team_owner` y `team_member` (se distinguen por
   `canManage`, `workspace-core.ts:216-227`). No colapsarlos «de paso».
2. `ACTIVE_PRIORITY` queda `['standalone','team_owner','team_member']` — standalone sigue siendo
   el «hogar» por default (`workspace-core.ts:65`).
3. `MANAGED_STATUSES` / `isManagedSubscription` **conservan `team_managed`**. El pool paga por sus
   coaches: `hasEffectiveAccess` devuelve `true` para managed antes de mirar fechas
   (`workspace-core.ts:126`). Romper esto bloquea a todos los coaches de un pool.
4. `applyActiveWorkspace` / `deriveWorkspaceContext`: `teamId` y `canManageTeam` se setean **solo**
   en contexto team; fuera de team van `null`/`false`.
5. `buildWorkspaceRefs`: el kill-switch `deletedAt`/`suspendedAt` (`workspace-core.ts:216`) y la
   regla «managed ⇒ no hay ref standalone» (`:189`) no se tocan.
6. **`org_id == null` es parte de la identidad de team y de standalone.** Mientras la columna exista
   en las 26 tablas, estos filtros se conservan tal cual:
   - `client-action-workspace.ts:44-51` (`team_id===teamId && org_id==null`; standalone: ambos null),
   - `client-action-workspace.ts:74-82` (`template.org_id == null` = pool portable),
   - `coach-client-detail.ts:715-724` y `:1196-1207`,
   - `coach-dashboard.ts:893-895,925-927`, `builder.tsx:201-203`,
   - `cardio-coach.ts` (`is('org_id',null).is('team_id',null)`), `coach-subscription.ts:82`,
   - `coach-access.ts:209` (cupo free).
7. La definición de **«ejercicio/área/alimento del sistema»** incluye `org_id IS NULL`:
   `exercise-workspace.ts:9-11,43` (`and(coach_id.is.null,org_id.is.null,team_id.is.null)`),
   `foods-scope.ts:20-26`, `workout/substitution.ts:87`. Si se borra ese término, los ejercicios de
   org (0 filas hoy, pero la columna sigue) pasarían a leerse como «system» para todos.
8. `nutritionV2CoachScope` es **fail-closed**: el `default: return null` (`nutrition-v2-scope.ts:35`)
   debe sobrevivir al borrado del `case 'enterprise'`. Un kind irreconocible NO puede caer a
   «standalone sin scope».
9. `resolveProfileAnalyticsLoadMode`: standalone y team deben seguir devolviendo `'error'` ante
   error crítico. **No convertir un fallo de RPC en KPIs en cero** (comentario explícito en
   `coach-client-detail.ts:942-944`).
10. `coach-client-detail.ts:1475-1499`: `useTeamBase` (pool manda sobre las prefs) y la rama
    «coach dueño» tienen que quedar las dos alcanzables tras sacar `orgId` de la condición.
11. `settings/areas.tsx`: `isEnterprise` colapsa a `ws.isManaged`, **no a `false`** — el edge
    «managed sin team visible» (`workspace-core.ts:290-299`) sigue existiendo y esa pantalla
    lo cubre a propósito.
12. `getVisibleNavItems`: `isManaged` (`team_managed`) sigue ocultando `options` y `funciones`
    (`nav.ts:305`); `settings_team` sigue siendo la entrada de team (`nav.ts:122`); `cardio` y
    `movement` siguen declarando `contexts: ['coach_standalone','coach_team']`.
13. `buildMobileBar` y `MORE_NAV_ITEM` no dependen del contexto: no se tocan.
14. El switcher se auto-oculta con `workspaces.length <= 1` (`WorkspaceSwitcherSheet.tsx:113`).
    Tras M1, un coach standalone **sin team** deja de tener sheet — comportamiento ya vigente hoy,
    pero conviene verificarlo en QA para no confundirlo con una regresión.

**Total E3: ≈ 8,5 d-a** (E3.0 mockup 0,4 · E3-a 1,45 · E3-b web 3,2 · E3-bis 0,4 · mobile 3,0).

---

## E4 · DROP en DB

**Precondición dura, no negociable:** cero lecturas de las **tres** columnas de tenant, medidas con **tres
greps separados** (J-E10), nunca con uno solo:
```
git grep -n "org_id"        -- apps packages scripts tests    # incluye el sufijo de las otras dos
git grep -n "active_org_id" -- apps packages scripts tests    # coaches.active_org_id
git grep -n "last_org_id"   -- apps packages scripts tests    # workspace_preferences.last_org_id
```
Los tres tienen que dar **0** (fuera de migraciones aplicadas) antes de abrir E4: `org_id` como patrón
también matchea `active_org_id`/`last_org_id`, así que un solo grep en 0 no prueba nada sobre las otras dos
y un grep en >0 no dice cuál falta.
Hoy **186 archivos** de
`apps/web/src` mencionan `org_id` (**verificado hoy**: `git grep -l "org_id" -- apps/web/src | wc -l` = 186;
**170** fuera de `app/org/**` y `app/enterprise/**`), incluido `proxy.ts:1289`, que hace
`select('… org_id …')` sobre `clients` en **cada request de `/c/*`**. Dropear la columna antes de que E2/E3
saquen esas lecturas ⇒ PostgREST devuelve 400 en toda el área alumno: **VISIBLE y catastrófico si se
invierte el orden**. El costo real es reescribir **35 policies mixtas** + 5 CHECK + 2 índices compuestos,
dropear 42 policies, 12 funciones, 1 trigger, 28 columnas y 12 tablas, y **regenerar `database.types.ts`**,
que arrastra la prioridad 10 de `CURRENT.md:105-106` (13 errores conocidos en 7 archivos V1) —
independiente de Enterprise, pero se paga en el mismo tren. Contra eso, la ganancia funcional es **cero**:
con las columnas en NULL y las policies mixtas ya reescritas, nada del producto vivo mejora.
**Recomendación (D11-A): postergar indefinidamente.** Las columnas `org_id` quedan como NULL muertos y el
predicado `.is('org_id', null)` sigue siendo parte de la identidad de standalone y team. Si el owner igual
lo pide, la secuencia está esbozada en el informe E4 §3-FASE 3 (3a→3g) y su TASKS fino se escribe al abrir
ese tren, con V11 y V12 como gate previo.

---

## Gates acumulados (E)

Ningún gate corre durante la escritura. Dos niveles, y **no se mezclan** (J-S7/J-E13):

1. **Verificación por tanda — OPCIONAL.** Los bloques `pnpm vitest run <rutas>` que aparecen abajo por fase
   son para que el worker o el jefe se aseguren de una tanda puntual **cuando hay CPU libre**. No son
   obligatorios y **no se repiten** en el cierre: la suite completa los cubre.
2. **Tren de cierre — OBLIGATORIO, una sola vez por fase, en este orden exacto** ([PLAN §5](PLAN.md)):
   ```
   pnpm docs:check
   pnpm --filter @eva/web typecheck
   pnpm exec eslint $(git diff --name-only <base> -- '*.ts' '*.tsx')     # lista REAL del diff, no el árbol
   pnpm vitest run                                                       # suite completa, UNA vez
   pnpm --filter @eva/web build                                          # SOLO en E2
   <grep de cierre de la fase>
   push
   gh workflow run CI --ref master                                       # e2e; acá corren sherif y actionlint
   pnpm qa:prod:suave                                                    # 1 navegador, al cierre de cada tren
   OTA (eas update, piso 1.1.2) — solo si la fase tocó apps/mobile
   ```
   Fuera de esa lista: **nada de `pnpm test:changed`**, nada de `pnpm run lint` sobre el árbol entero, y
   `tsc` de mobile **no se corre local** (lo corre GitHub al pushear `apps/mobile/**` o `packages/**`,
   `mobile-integration-ci.yml:41-56`).

Todas las rutas de vitest de abajo fueron **verificadas hoy** con `git ls-files`.

### Fase E0

Verificación por tanda (opcional):
```
pnpm vitest run apps/web/src/lib/email/transactional-templates.test.ts
pnpm exec eslint packages/schemas/auth.ts apps/web/src/components/auth apps/web/src/lib/email/transactional-templates.ts
```
Grep de cierre de E0:
```
git grep -c "EnterpriseCoachLogin\|TrustStrip\|domain/org/types\|enterprise-isolation-test" -- apps packages tests scripts
git grep -c "audit-checksum\|org-health-alert\|weekly-report-email\|weekly-snapshot\|payment-reminder" -- apps scripts docs package.json vercel.json
```
DB (fuera de la CPU del owner, MCP Supabase): V1-V5 → tx-rollback → `get_advisors(security)` antes →
`apply_migration` → `get_advisors(security)` y `get_advisors(performance)` después. **Sin paso de índices.**

### Fase E1

Verificación por tanda (opcional):
```
pnpm vitest run tests/mobile/applinks-claims.test.ts
```
Obligatorios propios de E1, **antes** del tren de cierre (no los cubre la lista genérica):
```
pnpm install --lockfile-only          # UNA vez, con D6-A; después revisar el diff del lock a ojo
pnpm install --frozen-lockfile        # el mismo modo que usan CI ×4 y el deploy de Vercel
pnpm qa:lint                          # exit 0 — rojo garantizado si falta check-qa-test-lint.mjs:37
```
Grep de cierre de E1: `git grep -c "@eva/enterprise" ` = 0 y `git grep -c "apps/enterprise" -- apps packages tests scripts` = 0.
**`sherif` y `actionlint` NO se corren local** (J-E11): no hay binario local de `actionlint`, y los dos
corren en CI después del push (`.github/workflows/ci.yml`) — ahí se firma que el `-p @eva/enterprise` salió
del step de sherif y que el YAML sigue bien indentado.
Playwright: **no correr nada** (los 13 specs borrados vivían en el project `chromium`, que no corre en CI:
`ci.yml:230` solo invoca `--project=prod-suave`).

### Fase E2 (tren aparte)

Verificación por tanda (opcional):
```
pnpm vitest run apps/web/src/lib/auth/fail-counter.test.ts apps/web/src/app/api/cron/purge-data/route.test.ts tests/e2e-accounts.test.ts apps/web/src/services/auth/workspace-routing.test.ts
pnpm exec eslint apps/web/src/proxy.ts apps/web/src/services/auth/workspace.service.ts apps/web/src/components/coach/CoachSidebar.tsx apps/web/src/infrastructure/db/index.ts "apps/web/src/app/admin/(panel)/AdminSidebar.tsx" apps/web/src/app/robots.ts apps/web/src/lib/auth/fail-counter.ts apps/web/src/app/api/cron/mp-reconcile/route.ts apps/web/src/app/api/cron/purge-data/route.ts
```
En el tren de cierre de E2, **`pnpm --filter @eva/web build` es obligatorio y es el gate distintivo**
(typed routes: `CoachSidebar.tsx:421` apuntaba a `/org/…`; lo desarma E2.2.i). Grep de cierre:
```
git grep -n "services/org/org.service\|infrastructure/db/org.repository\|lib/enterprise/domain" -- apps/web/src
git grep -n "requires_password_change\|'/org/login'" -- apps/web/src
```
(los dos con criterio **0**). **Sin `pnpm test:changed`**: lo cubre `pnpm vitest run`.
Post-deploy (owner, manual) — curls exactos contra `https://www.eva-app.cl`:
```
curl -sI https://www.eva-app.cl/enterprise                 # espera 308 → /pricing (next.config.ts:45-46 se CONSERVA)
curl -sI https://www.eva-app.cl/enterprise/precios         # espera 308 → /pricing
curl -sI https://www.eva-app.cl/e/org-prueba/login         # hoy 200 ⇒ espera 404
curl -sI https://www.eva-app.cl/org/login                  # hoy 307 → /login ⇒ espera 404
curl -sI https://www.eva-app.cl/legal/contrato-enterprise  # 200 si D9-A (dormida) · 404 si D9-B
curl -s  https://www.eva-app.cl/robots.txt | grep -E "/e/|/org/"   # espera vacío
curl -sI https://enterprise.eva-app.cl/login               # confirmar qué hace el dominio HOY (redirect de panel, fuera del repo)
```
Y a mano: login de coach standalone · login de coach de team · login de alumno de team · `/admin` sin
«Organizaciones» · alta de un coach de team **sin** loop de cambio de clave (D15-A, E2.2.k).
`pnpm qa:prod:suave` ya va en el tren de cierre: **no se repite acá**.
DB antes del deploy: **E2.pre.1** (respaldo + DELETE de la fila `enterprise_staff`).
E2-bis (DB, **después** del deploy de E2): V6-V10 → tx-rollback de cada migración (con el fixture org
cargado en V6) → advisors antes → `apply_migration` ×2 → advisors después → espejo local.

### Fase E3 (tren propio)

Verificación por tanda (opcional) — los 7 bloques de abajo son para asegurar tandas puntuales; en el cierre
los cubre `pnpm vitest run`:
```
pnpm vitest run apps/web/src/services/auth/workspace-pick.test.ts apps/web/src/services/auth/workspace-routing.test.ts apps/web/src/services/auth/mobile-student-workspace.service.test.ts packages/coach-nav/nav.test.ts
pnpm vitest run apps/web/src/lib/auth/post-login-redirect.test.ts apps/web/src/lib/coach-subscription-gate.test.ts apps/web/src/services/coach/persona.service.test.ts apps/web/src/lib/constants.test.ts
pnpm vitest run apps/web/src/services/search/coach-search.service.test.ts apps/web/src/services/nutrition-v2-read.service.test.ts apps/web/src/services/client/client-archive.service.test.ts
pnpm vitest run apps/web/src/app/coach/cardio/_data/cardio.queries.test.ts apps/web/src/app/coach/movement/_data/movement.queries.test.ts
pnpm vitest run apps/web/src/app/api/mobile/config/route.test.ts apps/web/src/app/api/mobile/coach/clients/_mutation-auth.test.ts apps/web/src/app/api/cron/checkout-abandoned/route.test.ts
pnpm vitest run "apps/web/src/app/join/[invite_code]/_actions/join.actions.test.ts" "apps/web/src/app/join/[invite_code]/_lib/join-capacity.test.ts"
pnpm vitest run tests/mobile/workspace.test.ts tests/mobile-client-action-workspace.test.ts tests/mobile-builder-exercise-workspace.test.ts tests/mobile-foods-scope.test.ts tests/mobile-nutrition-v2-scope.test.ts tests/mobile-profile-analytics-load-policy.test.ts tests/nutrition-v2-curation-actions.test.ts
pnpm vitest run scripts/nutrition-v2-conversion/cutover-preflight.test.ts apps/web/src/lib/email/behavior/behavior-triggers.test.ts
```
Grep de cierre de E3:
```
git grep -n "enterprise_coach\|enterprise_staff\|student_enterprise" -- apps packages
git grep -n "org_managed" -- apps packages scripts
git grep -n "kind === 'enterprise'\|kind !== 'enterprise'" -- apps/mobile
```
(los tres con criterio **0**; los `team_managed` **no** se tocan).
`tsc` de mobile: **en GitHub**, al pushear `apps/mobile/**` o `packages/**` (`mobile-integration-ci.yml`).
No se corre local, y `pnpm run lint` de árbol entero tampoco: el tren de cierre usa el `eslint` de la lista
real del diff. Al cierre: el tren de [§ Gates acumulados](#gates-acumulados-e), más
`pnpm --filter @eva/web build` — el PLAN lo marca «solo E2», pero E3 toca la frontera de tipos
`packages/coach-nav` y el layout del coach ⇒ **excepción declarada para esta fase** —, push,
`gh workflow run CI --ref master` (e2e), `pnpm qa:prod:suave`, **OTA** `eas update` sobre el piso 1.1.2
(android + ios) para M1/M2, y recién con el deploy READY la migración de **E3-bis**.

### Notas de gates (las tres que rompen si se olvidan)
1. **`pnpm qa:lint`** sale exit 1 si se borra `tests/enterprise/journey-e2e.spec.ts` y queda
   `check-qa-test-lint.mjs:37` (no está en CI, pero rompe la QA manual del owner).
2. **CI (job `unit`)** se pone rojo si se toca el AASA sin editar `tests/mobile/applinks-claims.test.ts:17,142-145`.
3. **CI ×4 y el deploy de Vercel** se ponen rojos si el lock no se regenera: `vercel.json` usa
   `pnpm install --frozen-lockfile`.

---

## Checklist de cierre (E) por fase

**E0 — cerrada cuando:**
- [ ] V1-V5 corridas y con su criterio (V1 todo en 0; V4 0 llamadas en 7 días; V5 = 77 filas guardadas).
- [ ] `git grep -c "EnterpriseCoachLogin\|TrustStrip\|domain/org/types\|enterprise-isolation-test"` = 0.
- [ ] `git grep -c "audit-checksum\|org-health-alert\|weekly-report-email\|weekly-snapshot\|payment-reminder" -- apps scripts package.json vercel.json` = 0.
- [ ] `vercel.json` sin la entrada de `audit-checksum` y `RUNBOOK.md:91` sin su fila.
- [ ] `RUNBOOK.md:115` ya no afirma un RPC `purge_old_audit_logs` inexistente.
- [ ] Migración `enterprise_freeze_e0` en LIVE con `ROLLBACK:` y los `proacl` previos en el encabezado; **solo 2 revokes** (`assign_org_client_to_coach`, `bulk_reassign_clients`); trigger en `tgenabled='D'`; **los 6 índices de FK sobre `org_id` siguen en `pg_indexes`** (mueren en E4); advisors sin hallazgos nuevos (en particular, **sin** `unindexed_foreign_keys`); espejo local idéntico.
- [ ] El archivo de la migración **no contiene** `DROP INDEX` ni `enterprise_freeze_deny`.
- [ ] Tren de cierre de E0 verde (docs:check → typecheck → eslint del diff → vitest completo → grep).

**E1 — cerrada cuando:**
- [ ] 41 archivos borrados (26+11+2+2), verificados con `git status`.
- [ ] Las 13 ediciones versionadas + las 2 locales hechas; `git grep -c "@eva/enterprise"` = 0.
- [ ] Lock regenerado con **una** corrida y el diff revisado: toca SOLO el importer `apps/enterprise:` y el subárbol `expo@54.0.36`/`expo-constants@18.0.13`/`expo-updates@29.0.19`/`async-storage@2.2.0`/variante de `expo-router`. **Ningún** bump de web o mobile.
- [ ] `pnpm install --frozen-lockfile` local sale limpio.
- [ ] `qa:lint` exit 0 · `vitest applinks-claims` verde · `docs:check` verde · **`sherif` y `actionlint` verdes EN CI después del push** (no hay corrida local).
- [ ] Conservados y justificados: template legal, `check-docs.mjs:30`, `docs/README.md:48`, `seed-e2e-personas.mjs`, `e2e-accounts.ts`, `check-org-sensitive-actions-audit.mjs`.
- [ ] `CURRENT.md` ≤ 16 KB.

**E2 — cerrada cuando:**
- [ ] **E2.pre.1** hecha ANTES del deploy: `_bak_workspace_preferences_enterprise_<fecha>` con RLS + la fila `enterprise_staff` borrada (V7 = 0).
- [ ] **E2.pre-mockup** aprobado por el owner (AdminSidebar + labels `org.*` de `/admin/auditoria`).
- [ ] `coach-identity.service.ts` creado con las 3 funciones verbatim, los 2 importadores de Teams repuntados y **`writeWorkspaceAuditEvent` borrado** (`workspace.service.ts:267-291` + llamada `:230` + import `:11`) ⇒ `git grep "services/org/org.service" -- apps/web/src` = 0 fuera de `app/org/**`.
- [ ] 145 archivos borrados por grupo (98+30+5+5+2 rutas + 5 módulos/script), conteos verificados con `git ls-files`.
- [ ] `proxy.ts` podado bloque por bloque (`:197` verificado, no `:194`), **sin tocar** `/t/`, `/c/`, `:647-663` ni el branding de `/c` (esos son E3).
- [ ] **`CoachSidebar`** sin `enterpriseContext` (`:51-55,158,215,401-405,419-435` + `Building2` de `:20`) y `layout.tsx:369` sin el prop; `layout.tsx:184,190-196,360,362-368` **intactas**.
- [ ] Ramas `enterprise_staff` fuera de `workspace-home.ts:4` y `workspace-route-guard.service.ts:48`.
- [ ] **D15** resuelta: si A, `teams.actions.ts:72` y `team.actions.ts:69` dejaron de estampar `requires_password_change` y E2-bis lo limpió con respaldo.
- [ ] `pnpm --filter @eva/web build` verde (typed routes).
- [ ] Los 7 curls post-deploy con su resultado esperado + los 5 chequeos manuales.
- [ ] `qa:prod:suave` verde.
- [ ] E2-bis: V6 con 0 diferencias **con el fixture org cargado dentro de la transacción**, V7 = 0, V8/V9/V10 corridas, las 2 migraciones en LIVE con `_bak_*` **con RLS y revoke**, fila en `purge_audit`, advisors antes/después.
- [ ] E2-bis revocó **solo** `get_enterprise_alumno_context` + las 2 `bulk_*`; `get_org_branding` e `is_coach_active_org_member` **siguen con EXECUTE** (van a E3-bis).
- [ ] Las 2 funciones `private.*` reescritas **conservan `c.org_id IS NULL`** en sus ramas standalone/team.
- [ ] Fuera del repo: decidido qué hace `enterprise.eva-app.cl` en el panel de Vercel.

**E3 — cerrada cuando:**
- [ ] **E3.0** aprobado por el owner (las 8 superficies visibles) y la regla de apertura corrida: los 3 greps contra el HEAD del día, con sus conteos escritos.
- [ ] E3-a: 1 solo resolver (`resolveCoachScope`) en los **5** que derivan de `resolvePreferredWorkspace` —`_mutation-auth.ts` **NO** se reemplazó— y 1 sola `applyOrgScope`; el `throw` de `getCoachClientScope` y el `{ok:false}` de `getCoachWorkoutScope` intactos; las suites de scope verdes **sin editar asserts**.
- [ ] Los 12 puntos de riesgo Teams revisados uno a uno contra el texto exacto de esta TASKS (término, no bloque).
- [ ] I-1 … I-12 (web) verificadas con su línea de verificación.
- [ ] Invariantes RN 1 … 14 verificadas.
- [ ] `packages/coach-nav/nav.ts` + `nav.test.ts` + web en el **mismo commit**; `typecheck` web y `tsc` mobile verdes a la vez.
- [ ] OTA 1.1.2 android + ios publicada para M1/M2.
- [ ] **E3-bis** aplicada DESPUÉS del deploy READY de E3-b: `get_org_branding` e `is_coach_active_org_member` sin EXECUTE, con `git grep` de sus nombres en `apps` = 0 y smoke de `/c/[coach_slug]` en 200.
- [ ] **QA de device del owner VERDE** (switcher, panel de coach de team con marca del team, nav del `team_managed` sin «Opciones»/«Funciones», suscripción del coach de pool, alta por invitación).
- [ ] D12 y D14 resueltas y aplicadas.

**E4 — cerrada cuando:** el owner decida explícitamente abrirla (D11-B). Con D11-A queda **postergada** y esta casilla no aplica.

---

## Juicio del jefe (2026-09-05)

Regla del owner: el jefe no aprueba un plan por haber sobrevivido a críticos y verificadores; lo lee y lo ataca.
Tres críticos (money path y DB de Starter · Teams y orden de demolición · reglas del owner y completitud)
produjeron 30 hallazgos; un refutador Opus por hallazgo, contra el código, descartó 3. Los 27 restantes se
juzgaron uno por uno y **todos se aplicaron** (ninguno se rechazó); el detalle con instrucción exacta está en
`JUICIO.md` de la sesión (job `c69fb9b6`). Lo que cambió del plan original, en orden de importancia:

### Lo que la crítica tumbó (BLOQUEA)
1. **D2 «leer el tier real del coach» era otra mentira más creíble.** Durante el poll de `processing` la fila del coach
   todavía tiene el plan anterior (`confirm-subscription/route.ts:134-155`; el propio poll lo documenta en
   `processing/page.tsx:396-401`). Además el tier de la URL viaja al POST de `create-preference` y a tres eventos de
   PostHog tipados no nulos (`processing/page.tsx:55,195,205-213,244,253`). D2 quedó redefinida: `tierForDisplay`
   nulo ⇒ sin chip; `tierForCheckout` nulo con `from=register` ⇒ sin POST y error honesto con salida a `/pricing`.
   Matiz que lo hace chico: desde A5 (`create-preference/route.ts:531-537`) el `back_url` de MercadoPago ya trae `tier|cycle`.
2. **`workspace.service.ts:11` importa `writeOrgAuditEvent` de `org.service`** y E2 borraba el módulo dos fases antes
   de podar `writeWorkspaceAuditEvent` (`:267-291`). Va a E2 paso 0.
3. **`CoachSidebar.tsx:421` enlaza a `/org/[slug]`**: typed routes rojo al borrar `app/org`, y ninguna tarea lo tocaba.
   Tarea propia en E2 paso 2, sin tocar las líneas de marca de Teams del layout (`184,189-196,360,362-368`).
4. **`_mutation-auth.ts` no es «el mismo switch»**: resuelve por el workspace que declara el binario RN
   (`resolveExplicitScope`, `:35-88`). Reemplazarlo por `resolveCoachScope` habría dejado que la preferencia de web pisara
   lo que declara la app. Sale de E3-a; solo se podan sus ramas enterprise.
5. **SPEC y PLAN enlazaban un `TASKS.md` inexistente** ⇒ `docs:check` nacía rojo. Este archivo es la corrección.
6. **Tareas VISIBLES sin mockup.** Cada tren abre con un «mockup-lote» (S2.0, E2.pre-mockup, E3.0). Lo que solo sería
   visible con filas que LIVE no tiene (0 starter tras S0, 0 coaches `org_managed`) queda «VISIBLE en teoría, declarada».

### Lo que la crítica mejoró (MEJORA)
- S0: `max_clients DEFAULT 10` (el cupo de Starter) también pasa a `DEFAULT 1`; la RPC `get_platform_coaches_by_tier_monthly`
  se reemite con la exclusión `@evatest.cl` que ya usan las RPC de MRR (con D1=A el coach QA habría contaminado la barra Pro;
  hoy contamina la de Starter); el SELECT de cupones con scope starter se re-verifica el día de ejecutar.
- S1: son 5 los lectores de tier con cast crudo sin red, no 1 (`api/mobile/coach/subscription-status:90`,
  `addons/_lib/coach-context.ts:87,103`, `confirm-addon:136`); `app/coach/layout.tsx:188` NO se toca (fail-closed deliberado,
  `:176-178`); el fallback de `getTierCapabilities` es `TIER_CAPABILITIES.free` con su consecuencia declarada en RN.
- `LEGACY_TIER_ALIASES` no aplica a `register` (degrada a Free a propósito, `register/page.tsx:245-252`).
- El árbol raíz `specs/` (4 archivos con Starter) entra en la limpieza de docs y en el grep de cierre.
- E0 no dropea los 6 índices `org_id`: son cobertura de FK creada por la auditoría `20260617031230` y el advisor
  `unindexed_foreign_keys` los volvería a pedir; mueren en E4 con las columnas. D5 = revoke + trigger OFF.
- E0 revoca solo las 2 RPC sin llamador desplegado; `bulk_reassign_clients_with_audit` y `bulk_assign_selected_clients`
  tienen llamador con service role en `org.actions.ts:814,861` y pasan a E2-bis.
- E2-bis revoca solo `get_enterprise_alumno_context`; `get_org_branding` e `is_coach_active_org_member` siguen llamadas por
  el proxy en `/c/*` (`:99,1252,1303,1306,1324,1358`, condicionadas a `clients.org_id`) y se revocan en E3-bis.
- Los sets `private.student_readable_client_ids` / `nutrition_v2_manageable_client_ids` conservan `c.org_id IS NULL` en
  las ramas standalone/team: quitarlo ensancha conjuntos y el ensayo contra LIVE (0 filas org) no lo vería. V6 corre con
  `student_gate_org_fixture.sql` cargado; el fixture no se jubila hasta E4.
- D15 nueva: `requires_password_change` que Teams estampa (`teams.actions.ts:72`, `team.actions.ts:69`) y cuyo único lector
  y limpiador mueren con `/org`.
- E2.pre: la única `workspace_preferences` tipo `enterprise_staff` se borra (con respaldo) ANTES del deploy de E2, y las
  ramas `enterprise_staff` de `workspace-home.ts:4` y `workspace-route-guard.service.ts:48` se podan en el mismo commit
  que el proxy, para que ese usuario no caiga en 404.
- E3-b suma lo que entró esta semana (W6, `bf252f2f`: `lib/email/behavior/*` con `org_managed`/`active_org_id`) y
  `cutover-preflight.ts`; regla de apertura de E3: re-grepear contra el HEAD del día.
- E4: la precondición se mide con tres greps separados (`org_id`, `active_org_id`, `last_org_id`).
- Gates: verificación por tanda opcional + tren de cierre único y deduplicado por fase; `actionlint`/`sherif` en CI tras el
  push (no hay binario local); Playwright de pricing se valida con `--list`.
- Conteos y referencias: E2 = 145 archivos (no 165); la regex de `/e/.../login` está en `proxy.ts:197`; la poda de
  `coach_client_assignments` en `purge-data` va en E2; `package.json:41,44,45` + `run-audit-checksum-manual.mjs` + `RUNBOOK:91` en E0.

### Lo que los fixers corrigieron del propio juicio (verificado contra el código)
- La RPC `get_platform_coaches_by_tier_monthly` reemitida con la exclusión `@evatest.cl` necesita `SECURITY DEFINER` +
  `search_path 'public','auth'` (el cuerpo del baseline es INVOKER y no puede leer `auth.users`) y `REVOKE EXECUTE` a
  `anon`/`authenticated` (el baseline daba GRANT ALL; único llamador = `admin.queries.ts:46` con service role). Escrito en S0.2/S0.6.
- El verde de S1.8 no es «1 hit en `layout.tsx:188`»: ese archivo usa `(… ?? 'free') as SubscriptionTier` y no cae en el
  grep; el criterio quedó acotado a `apps/web/src/app` = 0 hits (quedan 5 casts con red propia en `SubscriptionContent.tsx`
  y `webhook-pipeline.ts:1312`).
- Líneas ajustadas: `CoachSidebar` Link `:419-435`, badge `:401-405`; `throw` de `getCoachClientScope` en `:27`;
  test de `behavior-triggers` en `:295-297`; `flow-processing` es solo display (no tiene POST ni `from=register`).

### Refutados (no se aplican)
C1-6 (la semántica de ciclos de `free: []` ya es la vigente en prod), C1-7 (el dominio de `currentTier` está acotado por el
CHECK de DB), C3-5 (el normalizador de `api/mobile/coach/dashboard` ya existe hoy).

### Huecos que el jefe agrega por su cuenta (fuera de lo que vieron los críticos)
- **Segundo orden del retiro**: con Starter fuera, `TIER_CAPABILITIES` queda con 4 booleanos constantes y solo `showsEvaBadge`
  distingue algo. Es la regla del 31-08 hecha código, pero toca el alta (filas «Branding: Incluida / No incluida») ⇒ ola
  aparte con mockup (SPEC §4.2, D4). Este TASKS deja el tipo consistente y anota la deuda; no la resuelve.
- **n chico**: todo el frente E se apoya en «0 filas con `org_id`» y «1 org de prueba». Las verificaciones V1–V12 son
  bloqueantes por eso: cualquier fila inesperada cancela la fase, no se «migra al vuelo».
- **Lo que no vale la pena**: E4 (DROP) exige podar 186+ archivos que leen `org_id` como parte de la identidad de
  standalone/team. Recomendación firme: no hacerlo; las columnas quedan como NULL muertos y el CHECK de tiers sigue permisivo.
