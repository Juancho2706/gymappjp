# PLAN — Nutrición por intercambios + PDF branded

**Status:** DRAFT (listo para implementación)
**Spec:** `specs/movida-intercambios/SPEC.md`
**Last updated:** 2026-06-11

---

## Estado actual (base sobre la que se construye — NO reinventar)

- **Módulo y gating:** key `nutrition_exchanges` YA está en `MODULE_KEYS`
  (`apps/web/src/services/entitlements.service.ts`); `assertModule(db, key, {teamId|coachId})`
  resuelve por contexto del recurso (pool manda). `teams.enabled_modules` /
  `coaches.enabled_modules` ya existen con UI de toggles en Settings>Módulos y panel CEO
  `/admin/teams`.
- **Nav:** NO se agrega ítem nuevo — el módulo vive DENTRO de "Nutrición"
  (`NAV_MODULES.nutrition`, contexts ALL, `components/coach/coach-nav.ts`). El entitlement gatea
  el MODO intercambios dentro del builder, no el ítem de menú.
- **Scoping 3-vías:** patrón `CoachClientScope = { orgId, activeTeamId }`
  (`app/coach/clients/_data/clients.queries.ts:13`) ya aplicado en
  `nutrition-coach.queries.ts` (`getActiveClientPlans`, `getCoachClients`, foods por contexto).
  Toda query nueva ramifica enterprise / team / standalone por workspace ACTIVO
  (`resolvePreferredWorkspace`), nunca por membresía.
- **RLS team ya optimizada (prod):** helpers set-returning STABLE SECURITY DEFINER sin parámetro
  de fila — `current_user_team_ids()`, `current_user_pool_client_ids()`,
  `current_user_pool_nutrition_plan_ids()`, **`current_user_pool_meal_ids()`** — usados como
  `col IN (SELECT helper())` (migración `20260609160000_team_rls_optimized.sql`). Las policies
  nuevas REUSAN estos helpers; PROHIBIDO `SECURITY DEFINER(rowcol)` o `EXISTS` correlacionado
  (incidente 2026-06-09).
- **Marca por tenant:** `teams` tiene el set white-label completo (= `organizations`:
  `primary_color`, `logo_url`, `accent_light/dark`, `loader_*`, `neutral_tint`). El proxy
  (`src/proxy.ts`) ya inyecta headers `x-coach-brand-name` / `x-coach-primary-color` /
  `x-coach-logo-url` / `x-coach-subscription-tier` para `/c`, `/e` y `/t` (RPC
  `get_team_alumno_context`); el layout del alumno los consume. Free tier fuerza marca EVA
  (`app/c/[coach_slug]/layout.tsx:124-131`).
- **Nutrición existente:** `nutrition_plans` (con `org_id`, `last_edited_by_coach_id` awareness),
  `nutrition_meals` (`day_of_week` 1-7/null), `food_items` (+`swap_options`), `foods`
  (`category`, `coach_id`, `org_id`), `nutrition_plan_templates` (coach/org, SIN team),
  `nutrition_meal_logs` (completado por comida), offline-queue del alumno
  (`OfflineNutritionQueueSync`), `food_swap_groups` (equivalencia visual modo gramos — NO tocar).
- **PDF existente:** `lib/nutrition-day-pdf.ts` (jsPDF client-side, import dinámico, branding EVA
  HARDCODEADO: header "EVA FITNESS", `C.accent` emerald, footer "Generado con EVA Fitness") —
  llamado solo desde `NutritionShell.tsx` (alumno) con `useTransition`. `PrintProgramDialog`
  (builder entreno) usa print CSS + `window.print` — precedente alternativo, NO se toca.
- **Access log:** `logTeamClientAccess(db, input)` en `services/team/team.service.ts` +
  tabla `team_access_logs (action, resource, metadata, client_id, team_id, actor_coach_id)`.
  Restricción dura: `actor_coach_id` es `NOT NULL REFERENCES coaches(id)` y la policy
  `team_access_logs_member_insert` exige `actor_coach_id = (select auth.uid())` + miembro del
  team ⇒ SOLO un coach autenticado puede insertar; un alumno no puede (y forzarlo vía
  service-role con el coach del plan como actor falsearía la bitácora Ley 21.719). Define el
  alcance de AC7: se registra solo la generación del COACH en contexto team.
- **Consentimiento:** el alumno de pool ya pasa por gate de consentimiento al entrar a `/t`
  (`client_consents`, `has_pool_consent` en el RPC). La pauta nutricional queda cubierta por ese
  consentimiento de pool; no se agrega gate adicional v1 (nota DPO en Open questions).

## Arquitectura

Data flow obligatorio (Clean Architecture):

```text
app/coach/nutrition-plans/_data/*.queries.ts   (React.cache, scope 3-vías)
app/c/[coach_slug]/nutrition/_data/*.queries.ts
  -> services/nutrition-exchanges.service.ts   (orquesta: assertModule + repo + calc + access log)
  -> infrastructure/db/nutrition.repository.ts (extensión: funciones exchange_*)
  -> Supabase (RLS = techo)

packages/calc/src/exchange.ts                  (cálculo PURO: Σ porciones × ref, sin IO/Next/Supabase)
packages/schemas/ (o junto a actions)          (Zod v4: ExchangeTargetSchema, PlanModeSchema)
lib/nutrition-exchange-pdf.ts                  (jsPDF client-side, marca por parámetro)
```

Decisiones clave:

1. **PDF client-side con jsPDF** (research SPEC §Research punto 4): cero servidor, cero Chromium,
   privacidad (el plan no viaja). Dos artefactos:
   - `lib/nutrition-day-pdf.ts` — **fix transversal**: firma extendida con
     `brand: { brandName, primaryColor, logoDataUrl?, poweredByEva: boolean }`; la paleta fija
     EVA pasa a derivarse de `brand.primaryColor` (mezcla manual como `macroChip` hace hoy).
     Aplica a TODOS los planes (con o sin módulo) — es corrección de white-label, no feature.
   - `lib/nutrition-exchange-pdf.ts` — **nuevo**, pauta de porciones multi-formato (clon del
     layout Canva de Fran): `compact` | `equivalences` (incluye lista de compras) | `full`
     (v2, placeholder). Badges circulares de color por grupo, comidas por horario con códigos,
     variantes de día como secciones, agua + nomenclatura, disclaimer + footer.
   - **Marca SIEMPRE resuelta server-side** (RSC lee headers del proxy en alumno; query de
     workspace en coach) y bajada como prop tipada `PdfBrand`; el cliente jamás elige la marca.
     Free tier ⇒ `poweredByEva: true` + marca EVA (misma regla del layout). Logo: fetch →
     canvas → dataURL con fallback a inicial + color (patrón `generateFaviconSvg`).
2. **Catálogo `exchange_groups` separado de `food_swap_groups`** (decisión default plan 03 §C):
   swap_group = lista visual de reemplazo del modo gramos; exchange_group = unidad de porción con
   macros de referencia. Sin FK entre ambas; mapping documentado en código. Patrón de ownership
   calcado de `workout_section_templates` (system + coach + team, soft-delete, RLS espejo `xg_*`).
3. **Targets por comida** (`meal_exchange_targets`) y NO por día: la pauta real de Fran asigna
   porciones por comida; los totales diarios se derivan. Macros del plan en modo exchanges =
   derivados (no se escriben en `nutrition_plans.daily_calories/protein_g/...`; esos campos quedan
   como objetivo/requerimiento que fija la nutri, igual que hoy).
4. **Variantes de día** normalizadas (`nutrition_plan_day_variants` + FK nullable en
   `nutrition_meals`): NULL = la comida aplica a todas las variantes ⇒ planes sin variantes y todo
   plan existente siguen idénticos. `day_of_week` NO se toca (coexisten; la variante es por TIPO de
   día, no por día de semana).
5. **Kill-switch de plataforma** (regla director §3): `entitlements.service.ts` consulta env
   `EVA_DISABLED_MODULES` (CSV de module keys, runtime) ANTES del entitlement en
   `hasModule`/`assertModule`. Apaga cualquier módulo para todos sin migración. (La suspensión de
   team `teams.suspended_at` ya existe y es ortogonal.)
6. **Awareness:** reusar patrón existente — `saveExchangeTargets` setea
   `nutrition_plans.last_edited_by_coach_id` en el service (no trigger), y la UI muestra el
   `EditedByBadge` ya cableado en nutrición.

## Modelo de datos — DDL ADITIVA (expand; contract diferido)

Una migración DDL + un backfill `_POST_DEPLOY_`. Idempotente (`IF NOT EXISTS` /
`CREATE OR REPLACE` / guards `pg_constraint`), forward-only, cero `DROP`/`ALTER` destructivo —
`merge_branch` re-ejecuta TODO el historial. Aplicar vía **branching MCP** (ventana Pro hasta
~2026-07-09), protocolo completo del director §3.

```sql
-- ============ 1) Catálogo de grupos de intercambio ============
CREATE TABLE IF NOT EXISTS public.exchange_groups (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text NOT NULL,
  code             text NOT NULL,        -- 'C','P','F','V','LAC','ARL','SP','G','LEG' (render del chip)
  name             text NOT NULL,        -- 'Carbohidratos/Cereales', 'Proteínas (bajo grasa)', ...
  coach_id         uuid REFERENCES public.coaches(id) ON DELETE CASCADE,
  team_id          uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  is_system        boolean NOT NULL DEFAULT false,
  ref_calories     numeric NOT NULL DEFAULT 0 CHECK (ref_calories >= 0),
  ref_protein_g    numeric NOT NULL DEFAULT 0 CHECK (ref_protein_g >= 0),
  ref_carbs_g      numeric NOT NULL DEFAULT 0 CHECK (ref_carbs_g >= 0),
  ref_fats_g       numeric NOT NULL DEFAULT 0 CHECK (ref_fats_g >= 0),
  color            text,                 -- hex del badge; NULL = paleta derivada por sort_order
  sort_order       integer NOT NULL DEFAULT 100,
  composed_of      jsonb,                -- grupo compuesto: [{"code":"P","portions":1},{"code":"C","portions":1}]
  macros_confirmed boolean NOT NULL DEFAULT false,  -- false hasta validar ref_* con Fran (badge "referencial")
  deleted_at       timestamptz,          -- soft-delete (patrón workout_section_templates)
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exchange_groups_owner_chk CHECK (
    (is_system AND coach_id IS NULL AND team_id IS NULL)
    OR (NOT is_system AND ((coach_id IS NULL) <> (team_id IS NULL)))
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS exchange_groups_system_slug_uq
  ON public.exchange_groups (slug) WHERE is_system AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS exchange_groups_coach_slug_uq
  ON public.exchange_groups (coach_id, slug) WHERE coach_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS exchange_groups_team_slug_uq
  ON public.exchange_groups (team_id, slug) WHERE team_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS exchange_groups_team_id_idx ON public.exchange_groups (team_id);
CREATE INDEX IF NOT EXISTS exchange_groups_coach_id_idx ON public.exchange_groups (coach_id);

-- ============ 2) Equivalencias en foods (aditivo, nullable) ============
ALTER TABLE public.foods ADD COLUMN IF NOT EXISTS exchange_group_id uuid REFERENCES public.exchange_groups(id);
ALTER TABLE public.foods ADD COLUMN IF NOT EXISTS exchange_portion_grams numeric;
ALTER TABLE public.foods ADD COLUMN IF NOT EXISTS exchange_portion_label text;  -- medida casera: '3/4 taza', '1 unidad chica'
CREATE INDEX IF NOT EXISTS foods_exchange_group_id_idx
  ON public.foods (exchange_group_id) WHERE exchange_group_id IS NOT NULL;

-- ============ 3) Modo de plan (default preserva TODO lo existente) ============
ALTER TABLE public.nutrition_plans ADD COLUMN IF NOT EXISTS plan_mode text NOT NULL DEFAULT 'grams';
ALTER TABLE public.nutrition_plan_templates ADD COLUMN IF NOT EXISTS plan_mode text NOT NULL DEFAULT 'grams';
ALTER TABLE public.nutrition_plan_templates ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id);
CREATE INDEX IF NOT EXISTS nutrition_plan_templates_team_id_idx
  ON public.nutrition_plan_templates (team_id) WHERE team_id IS NOT NULL;
-- CHECK con guard de idempotencia (ADD CONSTRAINT no soporta IF NOT EXISTS):
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nutrition_plans_plan_mode_chk') THEN
    ALTER TABLE public.nutrition_plans
      ADD CONSTRAINT nutrition_plans_plan_mode_chk CHECK (plan_mode IN ('grams','exchanges')) NOT VALID;
    ALTER TABLE public.nutrition_plans VALIDATE CONSTRAINT nutrition_plans_plan_mode_chk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nutrition_plan_templates_plan_mode_chk') THEN
    ALTER TABLE public.nutrition_plan_templates
      ADD CONSTRAINT nutrition_plan_templates_plan_mode_chk CHECK (plan_mode IN ('grams','exchanges')) NOT VALID;
    ALTER TABLE public.nutrition_plan_templates VALIDATE CONSTRAINT nutrition_plan_templates_plan_mode_chk;
  END IF;
END $$;

-- ============ 4) Variantes de día (NULL = aplica a todas ⇒ planes viejos intactos) ============
CREATE TABLE IF NOT EXISTS public.nutrition_plan_day_variants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id    uuid NOT NULL REFERENCES public.nutrition_plans(id) ON DELETE CASCADE,
  name       text NOT NULL,              -- 'Descanso' | 'Entreno AM' | 'Entreno PM' (presets editables)
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nutrition_plan_day_variants_plan_id_idx
  ON public.nutrition_plan_day_variants (plan_id);
ALTER TABLE public.nutrition_meals ADD COLUMN IF NOT EXISTS day_variant_id uuid
  REFERENCES public.nutrition_plan_day_variants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS nutrition_meals_day_variant_id_idx
  ON public.nutrition_meals (day_variant_id) WHERE day_variant_id IS NOT NULL;

-- ============ 5) Porciones por grupo por comida ============
CREATE TABLE IF NOT EXISTS public.meal_exchange_targets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id           uuid NOT NULL REFERENCES public.nutrition_meals(id) ON DELETE CASCADE,
  exchange_group_id uuid NOT NULL REFERENCES public.exchange_groups(id),
  portions          numeric NOT NULL CHECK (portions > 0 AND portions <= 99),  -- numeric: permite 0.5 (pendiente Fran)
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meal_id, exchange_group_id)
);
CREATE INDEX IF NOT EXISTS meal_exchange_targets_meal_id_idx ON public.meal_exchange_targets (meal_id);
CREATE INDEX IF NOT EXISTS meal_exchange_targets_group_id_idx ON public.meal_exchange_targets (exchange_group_id);

-- ============ 6) Hardening de grants (OBLIGATORIO en toda tabla nueva del proyecto) ============
-- GOTCHA propio del repo (bitácora M3 + 20260609054917_team_tables_harden_grants.sql): el
-- ALTER DEFAULT PRIVILEGES del baseline otorga ALL — incluido TRUNCATE, que RLS NO filtra —
-- a anon y authenticated sobre TODA tabla nueva. Sin este bloque, anon puede TRUNCATE las 3
-- tablas. Patrón canónico: 20260609062017_workout_section_templates.sql líneas 44-46
-- (REVOKE ALL FROM anon, authenticated; GRANT mínimo a authenticated; GRANT ALL a service_role).
REVOKE ALL ON public.exchange_groups             FROM anon, authenticated;
REVOKE ALL ON public.nutrition_plan_day_variants FROM anon, authenticated;
REVOKE ALL ON public.meal_exchange_targets       FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exchange_groups             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_plan_day_variants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_exchange_targets       TO authenticated;

GRANT ALL ON public.exchange_groups             TO service_role;
GRANT ALL ON public.nutrition_plan_day_variants TO service_role;
GRANT ALL ON public.meal_exchange_targets       TO service_role;
-- anon queda SIN privilegios (RLS es techo de filas, no de privilegios de tabla).
```

### RLS (regla dura del incidente 2026-06-09: helpers set-returning + `col IN (SELECT helper())`)

Nombres nuevos `xg_*` / `met_*` / `npdv_*`; nunca tocar policies existentes. `ENABLE ROW LEVEL
SECURITY` en las 3 tablas nuevas. `auth.uid()` SIEMPRE como `(select auth.uid())` (InitPlan).

- **`exchange_groups`** (catálogo chico, baja cardinalidad):
  - `xg_select`: `deleted_at IS NULL AND (is_system OR coach_id = (select auth.uid()) OR team_id IN (SELECT public.current_user_team_ids()))`.
  - `xg_insert/update/delete` (custom): coach sobre las suyas (`coach_id = (select auth.uid())`);
    team SOLO gestores — `team_id IN (SELECT public.current_user_managed_team_ids())` (helper ya
    existente del CRUD de áreas; si el nombre difiere, reusar el del módulo áreas). System
    inmutable (sin policy de write ⇒ negado).
  - **Lectura del ALUMNO**: NO se agrega policy (un alumno no debe enumerar el catálogo del team).
    El query de la app del alumno resuelve nombres/colores/equivalencias de los grupos
    REFERENCIADOS por su plan vía `createServiceRoleClient()` acotado a esos ids + **filtro de
    tenant** (system / coach del plan / team del alumno) — patrón PROBADO del F5 de
    `specs/movida-areas/TASKS.md` (gotcha: `createRawAdminClient` NO bypasea RLS con cookies).
- **`meal_exchange_targets`** (ligada al hot path del alumno):
  - Se replica el ALCANCE de acceso de `food_items` (coach dueño del plan / alumno del plan /
    pool), pero **NO su forma**: las policies de `food_items` en `baseline.sql` (líneas
    3038-3061: `food_items_access`, `food_items_client_select`, `food_items_coach_all`) son
    `EXISTS` CORRELACIONADO — exactamente el anti-patrón prohibido arriba. PROHIBIDO copiarlas.
    Formas finales NO correlacionadas (subquery autocontenida, sin referencia a la fila externa):
    - `met_coach_all` (ALL, USING = WITH CHECK):
      `meal_id IN (SELECT m.id FROM public.nutrition_meals m JOIN public.nutrition_plans p ON p.id = m.plan_id WHERE p.coach_id = (select auth.uid()))`.
    - `met_client_select` (SELECT, espejo por `client_id`):
      `meal_id IN (SELECT m.id FROM public.nutrition_meals m JOIN public.nutrition_plans p ON p.id = m.plan_id WHERE p.client_id = (select auth.uid()))`.
    - `team_met_member_all` (ALL): `meal_id IN (SELECT public.current_user_pool_meal_ids())`
      (helper YA en prod, migración `20260609160000`).
- **`nutrition_plan_day_variants`**: mismo alcance espejo pero por `plan_id`, también en forma
  NO correlacionada (jamás la forma `EXISTS` del baseline):
  - `npdv_coach_all` (ALL):
    `plan_id IN (SELECT p.id FROM public.nutrition_plans p WHERE p.coach_id = (select auth.uid()))`.
  - `npdv_client_select` (SELECT):
    `plan_id IN (SELECT p.id FROM public.nutrition_plans p WHERE p.client_id = (select auth.uid()))`.
  - `npdv_pool_all` (ALL): `plan_id IN (SELECT public.current_user_pool_nutrition_plan_ids())`
    (helper YA en prod, migración `20260609160000`).
- **Validación en branch (obligatoria antes de merge):** seed sintético 2 teams + standalone,
  asserts de aislamiento impersonando `authenticated`+claims (nunca `service_role`),
  `EXPLAIN ANALYZE` sobre `meal_exchange_targets` con `loops=1`, `get_advisors`
  security+performance 0 críticos (cubrir `auth_rls_initplan`), y assert de grants sobre las 3
  tablas nuevas vía `information_schema.role_table_grants` (anon = 0 privilegios; authenticated
  sin TRUNCATE/REFERENCES/TRIGGER).

### Seed (`_POST_DEPLOY_`, idempotente y re-ejecutable)

- 8 grupos system (nomenclatura Fran, valores SMAE/UDD provisorios, `macros_confirmed=false`):
  `C` Carbohidratos/Cereales (70/2/15/0) · `P` Proteínas bajo grasa (55/7/0/3) · `F` Frutas
  (60/0/15/0) · `V` Verduras (25/2/4/0) · `LAC` Lácteo (95/9/12/2, subdividir por % grasa cuando
  Fran confirme) · `ARL` Alimento rico en lípidos (45/0/0/5) · `SP` Scoop proteína
  (120/24/2/1, genérico) · `G` Grasa de cocina (45/0/0/5). Orden = orden de la guía de Fran.
- Grupo compuesto `LEG` Legumbres con `composed_of = [{"code":"P","portions":1},{"code":"C","portions":1}]`.
- Equivalencias alimento→porción desde `PORCIONES DE INTERCAMBIO.pdf` de Fran (productos
  chilenos, medida casera + gramos): `UPDATE` de foods system existentes donde el match es claro
  (`exchange_group_id`, `exchange_portion_grams`, `exchange_portion_label`) + `INSERT` de los
  faltantes como foods system (`coach_id NULL, org_id NULL`) con `ON CONFLICT DO NOTHING` /
  guard por nombre. `foods.category` queda como display (no se migra destructivamente).
- Convención `_POST_DEPLOY_` existente; separado de la DDL.

### Frontera con `food_swap_groups` (documentar, no tocar)

`food_swap_groups` sigue siendo la equivalencia visual del modo gramos (food_ids[]). Comentario en
`nutrition.repository.ts` + nota en `docs/architecture/FLOWS_AND_COMPONENTS.md`. Evaluar
consolidación en fase CONTRACT futura (fuera de este SPEC).

## Archivos

| Acción | Path | Notas |
|---|---|---|
| CREATE | `supabase/migrations/<ts>_nutrition_exchanges.sql` | DDL + RLS de arriba (vía branch MCP; `db pull` después del merge) |
| CREATE | `supabase/migrations/<ts>_POST_DEPLOY_nutrition_exchanges_seed.sql` | seed grupos + equivalencias Fran |
| CREATE | `packages/calc/` (package nuevo `@eva/calc`) + `src/exchange.ts` + `src/exchange.test.ts` | PRIMER ocupante del package mandatado por director §3 (cardio/FMS/ISAK llegarán acá); puro, sin `server-only`/Supabase |
| UPDATE | `apps/web/src/services/entitlements.service.ts` | kill-switch `EVA_DISABLED_MODULES` antes del entitlement + unit tests |
| UPDATE | `apps/web/src/infrastructure/db/nutrition.repository.ts` | `findExchangeGroups(scope)`, `findExchangeFoodsByGroup`, `upsertMealExchangeTargets`, `findMealExchangeTargetsByPlan`, `setPlanMode`, CRUD variants |
| CREATE | `apps/web/src/services/nutrition-exchanges.service.ts` | orquestación: assertModule + repo + calc + `last_edited_by_coach_id` + `logTeamClientAccess` |
| CREATE | `apps/web/src/domain/nutrition/exchange.types.ts` | `ExchangeGroup`, `MealExchangeTarget`, `PdfBrand`, `ExchangePdfFormat` — tipos puros |
| CREATE | `apps/web/src/app/coach/nutrition-plans/_actions/exchange.actions.ts` | server actions + Zod + `revalidatePath` |
| UPDATE | `apps/web/src/app/coach/nutrition-plans/_data/nutrition-coach.queries.ts` | grupos + targets + marca del tenant por scope (3-vías) |
| UPDATE | `apps/web/src/app/coach/nutrition-plans/_components/PlanBuilder/*` | toggle modo + `ExchangeTargetsEditor.tsx` (steppers, chips, macros vivos `useOptimistic`) |
| CREATE | `apps/web/src/app/coach/nutrition-plans/_components/PlanBuilder/ExchangeTargetsEditor.tsx` | route-local (no multi-domain) |
| CREATE | `apps/web/src/lib/nutrition-exchange-pdf.ts` | jsPDF pauta multi-formato, marca por parámetro |
| UPDATE | `apps/web/src/lib/nutrition-day-pdf.ts` | firma con `brand` (fix transversal white-label) |
| UPDATE | `apps/web/src/app/c/[coach_slug]/nutrition/page.tsx` + `_data/nutrition.queries.ts` | targets + grupos del plan (service-role acotado) + brand desde headers |
| UPDATE | `apps/web/src/app/c/[coach_slug]/nutrition/_components/{NutritionShell,MealCard}.tsx` | chips de grupos, sheet equivalencias, PDF con brand |
| CREATE | `apps/web/src/app/c/[coach_slug]/nutrition/_components/ExchangeEquivalencesSheet.tsx` | bottom sheet mobile-first |
| UPDATE | `apps/web/src/lib/i18n/{es,en}.json` | namespace `nutrition.exchange.*` (mismo commit que cada UI) |
| CREATE | `tests/team/exchanges-isolation.sql` | suite RLS (corre SOLO en gate autorizado) |
| CREATE | `tests/separation/nutrition-exchanges.spec.ts` | E2E personas (corre SOLO en gate autorizado) |
| UPDATE | `docs/plans/movida/00-DIRECTOR.md` | bitácora + §7 (bloqueantes nuevos ya agregados por este SDD) |
| UPDATE | `docs/architecture/FLOWS_AND_COMPONENTS.md` + `docs/status/NEXT_STEPS.md` | regla de docs canónicas |

## Server actions (todas: Zod v4 + `assertModule` al tope + revalidate)

| Action | Validación | Notas |
|---|---|---|
| `setPlanModeAction(planId, mode)` | `z.enum(['grams','exchanges'])` | cambia modo; no borra `food_items` ni targets (switch no destructivo) |
| `saveMealExchangeTargetsAction(mealId, targets[])` | array `{exchangeGroupId: z.guid(), portions: z.number().positive().max(99)}` | upsert + delete de los removidos; coerción server-side de `exchangeGroupId` a grupos VISIBLES para el actor (gotcha F4 áreas: payload client-controlled) |
| `createDayVariantAction / renameDayVariantAction / deleteDayVariantAction` | nombre 1-40 chars | delete ⇒ `day_variant_id` de meals queda NULL (ON DELETE SET NULL) |
| `assignMealVariantAction(mealId, variantId\|null)` | guid nullable | |
| `logNutritionPdfGeneratedAction(planId, format)` | enum format | fire-and-forget; vive en `_actions` del coach y SOLO la invoca el flujo del COACH; escribe `team_access_logs` únicamente si el contexto activo es team (`pdf_generate`, resource `nutrition_plan`, `actor_coach_id = auth.uid()`); standalone/enterprise ⇒ no-op. El alumno NO la llama (AC7: descargar su propia pauta no genera bitácora) ⇒ cero import cross-route desde `app/c/` |
| (futuro F7) CRUD grupos custom | espejo del CRUD de áreas (`/coach/settings/areas`) | gestor de team / coach standalone |

Revalidación: `revalidatePath('/coach/nutrition-plans/client/[clientId]', 'page')` y la ruta del
alumno afectada.

## Cálculo puro (`packages/calc/src/exchange.ts`)

- `expandComposedGroups(targets, groups)` — LEG ⇒ 1P+1C.
- `macrosForTargets(targets, groups)` — Σ porciones × `ref_*` (kcal, P, C, G), redondeo a 1 decimal.
- `dayTotals(meals)` / `dayTotalsByVariant(meals, variants)` — agregado por variante (meals con
  `day_variant_id NULL` cuentan en todas).
- `portionsSummaryLabel(targets, groups)` — "2C · 1LAC · 1F" (orden `sort_order`).
- Golden tests (≥10): grupos simples, compuesto, fracciones 0.5, variante NULL, orden de códigos.

## UI/UX

- **Coach (builder):** si `hasModule` ⇒ toggle "Gramos ↔ Porciones" en el plan; en modo porciones
  cada `MealBlock` muestra `ExchangeTargetsEditor` (stepper por grupo, chips de color, targets
  44px); barra de totales diarios derivados vs objetivo (`useOptimistic` + debounce de
  persistencia); badge "macros referenciales" si algún grupo `macros_confirmed=false`; selector de
  variante de día por comida (F6); botón "Descargar PDF" con radio de formato y preview de marca
  (`useTransition`, import jsPDF async).
- **Alumno:** `MealCard` en modo exchanges muestra chips "2C · 1LAC"; tap ⇒
  `ExchangeEquivalencesSheet` (lista alimento + medida casera + gramos del grupo, búsqueda local);
  marcar comida = flujo existente (offline-queue intacto). Módulo OFF ⇒ sin chips, descripción
  de la comida como fallback (sin romper).
- **Mobile:** `h-dvh`/`min-h-dvh`, `pb-safe` en sheet y barra fija, `overflow-x: clip`,
  `useReducedMotion` en transiciones del stepper.
- **Dark mode:** chips y badges con variantes dark; colores de grupo con contraste verificado
  (texto blanco/negro según luminancia, helper existente de brand-kit).
- **i18n:** `t()` + `nutrition.exchange.*` en `es.json` Y `en.json` mismo commit; códigos de grupo
  (C/P/F/...) son términos de dominio, NO se traducen.

## Observabilidad

- Errores de `nutrition-exchange-pdf` y de las server actions del módulo instrumentados con tag
  `module:nutrition_exchanges` (console.error estructurado + toast no destructivo).
- Métrica mínima (regla director §3): tasa de error de generación de PDF — contador de
  éxito/fallo en el catch del download (analytics `nutrition_exchange_pdf_{ok,error}` espejo de
  `trackNutritionEvent` existente).

## Fases (slices verticales con verificación por capa)

- **F0 — Baselines anti-regresión (½ día):** vitest baseline del PDF actual (contrato de params +
  snapshot de la paleta EVA para la rama free), de `calculateFoodItemMacros` y del render de
  `MealCard` modo gramos. Mapa de call sites de `downloadNutritionDayPdf` y de los puntos a tocar
  del PlanBuilder (espejo de `specs/movida-areas/CALLSITES.md`). Gate: typecheck + vitest verdes.
- **F1 — DB (1 día, branch MCP):** migración DDL + RLS + seed en branch efímero → seed sintético
  2 teams → asserts de aislamiento como `authenticated` → `EXPLAIN ANALYZE` (`loops=1`) →
  `get_advisors` 0 críticos → snapshot `_bak_*` → `merge_branch` → `db pull` + regenerar
  `database.types.ts` → `delete_branch` MISMO día. Gate: typecheck + build verdes con types nuevos.
- **F2 — Dominio + calc + service (1 día):** `domain/nutrition/exchange.types.ts`,
  `packages/calc` con golden tests, repo + service + actions + kill-switch en entitlements.
  Gate: vitest (calc + entitlements) verde.
- **F3 — Builder coach (1-2 días):** toggle de modo + `ExchangeTargetsEditor` + macros vivos +
  persistencia round-trip (guardar → recargar → idéntico). Gate: typecheck + vitest; QA manual
  modo gramos intacto (baseline F0).
- **F4 — Alumno (1 día):** query con targets + grupos (service-role acotado + filtro tenant),
  chips + sheet de equivalencias + fallback módulo OFF + offline OK. Gate: typecheck + vitest.
- **F5 — PDF branded (1-2 días):** fix transversal de `nutrition-day-pdf` (brand param) + nuevo
  `nutrition-exchange-pdf` formatos compacto/equivalencias + lista de compras + access log (solo
  coach en team, AC7) + botón coach y alumno. Checklist visual contra la pauta real de Fran. **Hito M1 demo-able.**
  Gate: typecheck + vitest (threading de marca unit-testeado).
- **F6 — Variantes de día (1 día):** CRUD variantes + selector por comida + secciones en PDF +
  `dayTotalsByVariant`. Gate: typecheck + vitest.
- **F7 — Templates team + CRUD grupos custom (1-2 días, post-M1):** `nutrition_plan_templates.team_id`
  en queries/actions de templates (scope 3-vías) + CRUD de grupos custom espejo de
  `/coach/settings/areas`. Gate: typecheck + vitest.
- **GATE FINAL (con autorización explícita del usuario, regla 2026-06-10):** 1 corrida
  `--workers=1` contra build prod de `tests/separation/nutrition-exchanges.spec.ts` +
  `tests/team/exchanges-isolation.sql` + suites existentes de separación. Personas e2e
  permanentes (`docs/e2e-personas.md`). E2E verifica: matriz módulo ON/OFF, PDF con marca del
  team (NO EVA), alumno equivalencias offline, aislamiento entre teams.

Esfuerzo total estimado: MVP visual (F0-F5 compacto) 2-3 días intensos; completo 2-3 semanas
(consistente con plan 03 §C).

## Test plan

- **Unit (por tanda, sin Supabase):** golden tests calc; entitlements + kill-switch; coerción de
  `exchangeGroupId`; threading de marca al PDF; `portionsSummaryLabel`; reducers/estado del editor.
- **SQL (solo gate):** `tests/team/exchanges-isolation.sql` — team A no ve grupos/targets de team
  B; coach standalone no ve custom de teams; alumno solo su plan; system read-only; seed visible.
- **E2E (solo gate):** flujo Fran completo (crear pauta exchanges → PDF marca team) + alumno pool
  (chips → equivalencias → completar offline) + módulo OFF (sin toggle, action falla).
- **Manual:** checklist visual PDF vs Canva de Fran; dark mode; viewport móvil real.

## Rollback

1. **Operador:** `EVA_DISABLED_MODULES=nutrition_exchanges` (env runtime) apaga el módulo para
   todos sin deploy de DB; o toggle OFF por team/coach (entitlement).
2. **Código:** revert del slice de UI — el modo `grams` nunca dejó de ser el default y no se tocó
   su flujo.
3. **DB:** NO se revierte (expand-contract): tablas/columnas nuevas quedan inertes (nullable /
   default `grams` / sin tráfico). `DROP` solo en una migración contract futura si el módulo se
   descarta definitivamente.

## Open questions

- [ ] DPO: ¿la pauta nutricional exige consentimiento por propósito ADICIONAL al de pool, o el
      gate de entrada a `/t` la cubre? (default v1: la cubre; revisar en DPIA).
- [ ] DPO: confirmar en la DPIA que la descarga del PDF por el ALUMNO (titular accediendo a su
      propia data) no requiere bitácora de acceso (decisión AC7: solo se registra al coach en
      contexto team; la bitácora Ley 21.719 cubre accesos de TERCEROS a data de salud).
- [ ] ¿`exchange_portion_grams` admite rangos (ej. "30-40 g") en la guía de Fran? (default v1:
      valor único + label de medida casera lleva el matiz).
- [ ] Formato `full` (recetas con imagen) — ¿lo usa Fran o se descarta? (v2 condicionado).
