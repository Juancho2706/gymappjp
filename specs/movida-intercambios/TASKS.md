# TASKS — Nutrición por intercambios + PDF branded

**Spec:** `specs/movida-intercambios/SPEC.md` · **Plan:** `specs/movida-intercambios/PLAN.md`
**Last updated:** 2026-06-11

Leyenda: `[ ]` pendiente · `[x]` hecho. **DoD global por tanda:** `pnpm typecheck` + `pnpm test`
(vitest) verdes; modo gramos byte-identical (baselines F0); strings con `t()` +
`nutrition.exchange.*` en `es.json` Y `en.json`; sin Supabase remota fuera de F1 (branch MCP) y
del gate autorizado. Commit + push por fase cuando el usuario lo pida.

## F0 — Baselines anti-regresión

- [ ] T0.1 — Baseline unit del PDF diario actual.
  - Scope: `apps/web/src/lib/nutrition-day-pdf.test.ts` — contrato de `NutritionPdfParams`,
    cálculo de subtotales/totales con fixtures, y constantes de paleta EVA (para preservarlas
    exactas en la rama free/fallback tras el refactor de marca). Mock de `jspdf` (import dinámico).
  - Verificación: vitest verde ANTES de tocar `nutrition-day-pdf.ts`.
- [ ] T0.2 — Baseline del render gramos del alumno.
  - Scope: test de `MealCard`/helpers de `NutritionShell` en modo actual (macros por comida,
    visibilidad de swaps). Solo lógica extraíble — no snapshot DOM frágil.
  - Verificación: vitest verde; lista de asserts que F4 debe mantener.
- [ ] T0.3 — Mapa de call sites (espejo `specs/movida-areas/CALLSITES.md`).
  - Scope: `CALLSITES.md` en este spec: consumidores de `downloadNutritionDayPdf`, puntos de
    inserción en `PlanBuilder/*` (`MealBlock`, `PlanBuilderSidebar`, `types.ts`, mappers
    `plan-builder-mappers.ts`), queries del alumno que traerán targets, y dónde se resuelve la
    marca (headers proxy / workspace query).
  - Verificación: archivo creado; revisado contra grep.

## F1 — DB aditiva (branch MCP — protocolo director §3 completo)

- [ ] T1.1 — Migración DDL `<ts>_nutrition_exchanges.sql` (DDL del PLAN §Modelo de datos).
  - Scope: `exchange_groups` + columnas `foods.*` + `plan_mode` (plans y templates, CHECK con
    guard) + `nutrition_plan_templates.team_id` + `nutrition_plan_day_variants` +
    `nutrition_meals.day_variant_id` + `meal_exchange_targets` + índices + **hardening de grants
    de las 3 tablas nuevas** (PLAN §Modelo de datos punto 6: `REVOKE ALL FROM anon,
    authenticated; GRANT SELECT/INSERT/UPDATE/DELETE a authenticated; GRANT ALL a service_role`
    — gotcha default-priv del proyecto: sin esto anon nace con ALL incluido TRUNCATE, que RLS NO
    filtra; patrón `20260609062017_workout_section_templates.sql` líneas 44-46). Idempotente
    (`IF NOT EXISTS`, guards `pg_constraint`), forward-only, cero DROP.
  - Verificación: en branch efímero `MIGRATIONS_PASSED`; re-aplicable sin error (idempotencia);
    `information_schema.role_table_grants` de las 3 tablas: anon = 0 filas, authenticated sin
    TRUNCATE/REFERENCES/TRIGGER.
- [ ] T1.2 — RLS `xg_*` / `met_*` / `npdv_*` (misma migración).
  - Scope: policies del PLAN §RLS — reusar `current_user_team_ids()`,
    `current_user_pool_meal_ids()`, `current_user_pool_nutrition_plan_ids()` y el helper de
    gestores del CRUD de áreas; las ramas coach/alumno usan las formas NO correlacionadas
    ESCRITAS en el PLAN §RLS (`meal_id IN (SELECT m.id FROM nutrition_meals m JOIN
    nutrition_plans p ON p.id = m.plan_id WHERE p.coach_id = (select auth.uid()))` y su espejo
    `client_id`; `plan_id IN (SELECT ...)` para variants) — PROHIBIDO copiar la forma `EXISTS`
    correlacionada de `food_items`/`nutrition_meals` del baseline.sql (líneas 3038-3061: es el
    anti-patrón del incidente 2026-06-09); `(select auth.uid())` siempre; NUNCA SECURITY DEFINER
    per-row ni EXISTS correlacionado.
  - Verificación: en branch, seed sintético 2 teams + standalone; asserts impersonando
    `authenticated`+claims (team A ≠ team B, alumno solo su plan, system read-only);
    `EXPLAIN ANALYZE` sobre `meal_exchange_targets` y `exchange_groups` con `loops=1`;
    `get_advisors` security+performance 0 críticos.
- [ ] T1.3 — Seed `_POST_DEPLOY_nutrition_exchanges_seed.sql`.
  - Scope: 8 grupos system + LEG compuesto (`macros_confirmed=false`, valores provisorios
    SMAE/UDD del PLAN) + equivalencias de la guía de Fran sobre foods system (UPDATE + INSERT
    faltantes, idempotente con guards).
  - Verificación: re-ejecutable sin duplicados; conteo esperado de grupos (9) y spot-check de 5
    equivalencias contra el PDF de Fran.
- [ ] T1.4 — Merge + sincronización local.
  - Scope: snapshot prod `_bak_*` de `foods`, `nutrition_plans`, `nutrition_plan_templates`,
    `nutrition_meals` → `merge_branch` → vigilar `get_logs` → `supabase db pull` (versionar .sql)
    → regenerar `src/lib/database.types.ts` → **`delete_branch` el MISMO día**.
  - Verificación: `pnpm typecheck` + `pnpm build` verdes con types nuevos; `list_branches` vacío.
- [ ] T1.5 — Suite SQL `tests/team/exchanges-isolation.sql` (se ESCRIBE ahora, corre en el gate).
  - Scope: asserts T1.2 portados a suite re-ejecutable con env (no hardcode), patrón
    `tests/team/areas-isolation.sql`.
  - Verificación: revisión estática; ejecución diferida al gate autorizado.

## F2 — Dominio + cálculo puro + service + gating

- [ ] T2.1 — Tipos de dominio.
  - Scope: `apps/web/src/domain/nutrition/exchange.types.ts`: `ExchangeGroup`,
    `MealExchangeTarget`, `DayVariant`, `PdfBrand { brandName, primaryColor, logoDataUrl?, poweredByEva }`,
    `ExchangePdfFormat = 'compact'|'equivalences'|'full'`. Sin imports de Next/Supabase/lib.
  - Verificación: typecheck; regla de importación de domain respetada.
- [ ] T2.2 — `packages/calc` (package nuevo `@eva/calc`) con `exchange.ts`.
  - Scope: package workspace (espejo de `packages/schemas`): `expandComposedGroups`,
    `macrosForTargets`, `dayTotals`, `dayTotalsByVariant`, `portionsSummaryLabel`. Sin IO ni
    `server-only`. Registrar en `pnpm-workspace.yaml` si hace falta (sin postinstall).
  - Verificación: `exchange.test.ts` golden tests ≥10 (simples, LEG, 0.5, variante NULL, orden,
    redondeo) verdes con `npx vitest run`.
- [ ] T2.3 — Kill-switch de plataforma en entitlements.
  - Scope: `entitlements.service.ts`: `EVA_DISABLED_MODULES` (CSV env, runtime) consultado al
    inicio de `hasModule`/`assertModule` (antes de cualquier query). Documentar la env en
    `docs/operations/MANUAL_TASKS.md` §MT-25 / CLAUDE.md tabla de envs.
  - Verificación: unit tests — módulo killed ⇒ `hasModule=false` aunque el entitlement esté ON;
    env vacía ⇒ comportamiento actual intacto.
- [ ] T2.4 — Repository + service.
  - Scope: extender `infrastructure/db/nutrition.repository.ts` (`findExchangeGroups(scope)`,
    `findExchangeFoodsByGroup`, `findMealExchangeTargetsByPlan`, `upsertMealExchangeTargets`,
    `setPlanMode`, CRUD variants — user-scoped, RLS techo); crear
    `services/nutrition-exchanges.service.ts` (assertModule por contexto del RECURSO, coerción de
    `exchangeGroupId` a grupos visibles, `last_edited_by_coach_id`, `logTeamClientAccess` para
    `pdf_generate` — invocado SOLO desde el flujo del coach en contexto team, alcance AC7).
  - Verificación: typecheck; unit tests del service con repo mockeado (gating, coerción, awareness).
- [ ] T2.5 — Server actions + Zod.
  - Scope: `app/coach/nutrition-plans/_actions/exchange.actions.ts` (tabla del PLAN §Server
    actions). `z.guid()` para ids (gotcha Zod 4 `.uuid()` estricto del F3 de áreas — los UUID seed
    pueden no ser RFC 9562). `revalidatePath` por mutación.
  - Verificación: typecheck; unit tests de schemas (payloads inválidos rechazados).

## F3 — Builder del coach

- [ ] T3.1 — Datos + toggle de modo.
  - Scope: `_data/nutrition-coach.queries.ts` carga grupos por scope 3-vías (system + propios +
    team activo) y `hasModule` del contexto; `setPlanModeAction` cableada a un switch
    "Gramos ↔ Porciones" (visible solo con módulo ON; switch no destructivo, conserva food_items
    y targets).
  - Verificación: typecheck + vitest; con módulo OFF el builder es byte-identical (baseline F0).
- [ ] T3.2 — `ExchangeTargetsEditor` (steppers + chips + macros vivos).
  - Scope: componente route-local en `PlanBuilder/`; stepper por grupo (step 1; preparar prop para
    0.5 pendiente de Fran), chips de color (color del grupo o paleta por `sort_order`), totales
    por comida y día (`@eva/calc`) con `useOptimistic` + debounce de persistencia
    (`saveMealExchangeTargetsAction`); badge "macros referenciales" si `macros_confirmed=false`;
    `EditedByBadge` existente. Targets 44px; dark mode; i18n.
  - Verificación: vitest de la lógica de estado; round-trip guardar→recargar→idéntico (manual);
    typecheck.
- [ ] T3.3 — Awareness + revalidate.
  - Scope: verificar `last_edited_by_coach_id` actualizado al guardar targets y reflejado en la UI
    del pool; `revalidatePath` de la vista del alumno.
  - Verificación: unit test del service; QA manual con 2 sesiones de coach.

## F4 — App del alumno

- [ ] T4.1 — Query del alumno con targets + grupos.
  - Scope: `_data/nutrition.queries.ts` trae `meal_exchange_targets` del plan activo; nombres/
    colores/equivalencias de los grupos referenciados vía `createServiceRoleClient()` ACOTADO a
    los ids del plan + filtro de tenant (system / coach del plan / team del alumno) — patrón F5 de
    áreas (NO `createRawAdminClient`; data minimization). Módulo del contexto resuelto server-side
    (pool manda) y bajado como flag.
  - Verificación: typecheck; unit test del filtro de tenant (un id cross-team jamás resuelve).
- [ ] T4.2 — Chips + `ExchangeEquivalencesSheet`.
  - Scope: `MealCard` modo exchanges renderiza `portionsSummaryLabel`; tap en chip abre bottom
    sheet con equivalencias (alimento + medida casera + gramos, búsqueda local); completar comida
    usa el flujo existente (offline-queue intacto). Fallback módulo OFF: sin chips, descripción
    visible, cero crash con targets presentes.
  - Verificación: vitest de helpers; baseline F0 del modo gramos intacta; QA manual offline
    (DevTools) + viewport móvil; typecheck.

## F5 — PDF branded (hito M1)

- [ ] T5.1 — Fix transversal de marca en `nutrition-day-pdf.ts`.
  - Scope: firma con `brand: PdfBrand`; paleta derivada de `brand.primaryColor` (mezcla manual
    estilo `macroChip`); header con `brandName`/logo; footer "Generado con {brand}" + disclaimer;
    rama `poweredByEva` (free tier) reproduce la paleta EVA EXACTA de la baseline T0.1. Marca
    resuelta SERVER-SIDE: alumno desde headers del proxy en el RSC; nunca elegida por el cliente.
  - Verificación: unit tests de threading (team ⇒ marca team; free ⇒ EVA); baseline T0.1 verde en
    la rama EVA; typecheck.
- [ ] T5.2 — `nutrition-exchange-pdf.ts` formatos `compact` y `equivalences`.
  - Scope: layout clon de la pauta de Fran (PLAN §Arquitectura punto 1): encabezado branded →
    objetivos → requerimientos → comidas por horario con badges de color y códigos → agua +
    nomenclatura → disclaimer. `equivalences` agrega por grupo usado la tabla alimento/medida/
    gramos + lista de compras (agregado semanal por grupo con ejemplos). Logo fetch→dataURL con
    fallback inicial+color. `full` queda como stub deshabilitado (v2).
  - Verificación: unit tests de armado de secciones con fixtures; checklist visual contra el PDF
    real de Fran (los 2 formatos, dark logo sobre fondo claro); typecheck.
- [ ] T5.3 — Botones de descarga + access log (solo coach) + métrica.
  - Scope: botón en builder del coach (radio de formato, preview de marca, `useTransition`) y en
    la app del alumno; `logNutritionPdfGeneratedAction` fire-and-forget vive en
    `app/coach/nutrition-plans/_actions/exchange.actions.ts` y SOLO la invoca el botón del COACH
    (contexto team activo ⇒ inserta `pdf_generate` con `actor_coach_id = auth.uid()` y metadata
    `{format, plan_id}`; standalone/enterprise ⇒ no-op). El botón del ALUMNO genera el PDF 100%
    client-side con la marca ya resuelta server-side y NO llama ninguna action de log (AC7: el
    titular descargando su propia pauta no genera bitácora; además `team_access_logs` lo impide
    por esquema — sin import cross-route desde `app/c/` hacia `_actions` del coach). Analytics
    `nutrition_exchange_pdf_{ok,error}` en AMBOS flujos (client-side, patrón
    `trackNutritionEvent`).
  - Verificación: unit test de la action (coach en team loguea, coach standalone no-op); grep de
    que `app/c/` no importa `exchange.actions.ts`; QA manual de descarga en los 3 contextos;
    typecheck + vitest.
- [ ] T5.4 — Demo M1 preparada.
  - Scope: pauta real de Fran replicada en el team de prueba (datos sintéticos), guion de 5 min
    (crear pauta → PDF Movida → alumno ve chips).
  - Verificación: dry-run del guion; screenshots para Ani.

## F6 — Variantes de día

- [ ] T6.1 — CRUD de variantes + selector por comida.
  - Scope: actions del PLAN; UI en el builder (presets Descanso/Entreno AM/Entreno PM, editables);
    comidas sin variante = todas; `dayTotalsByVariant` en la barra de totales.
  - Verificación: vitest calc por variante; round-trip; plan sin variantes byte-identical.
- [ ] T6.2 — Variantes en PDF y app del alumno.
  - Scope: secciones por variante en ambos formatos de PDF; selector/etiqueta de variante en la
    vista del alumno (solo display v1).
  - Verificación: fixture con 3 variantes renderiza 3 secciones; sin variantes ⇒ layout F5
    idéntico.

## F7 — Templates team + grupos custom (post-M1)

- [ ] T7.1 — Templates de pauta team-owned.
  - Scope: `nutrition_plan_templates.team_id` en queries/actions de templates (scope 3-vías:
    team activo ⇒ templates del team; compartidos en el pool por decisión 2.1); `plan_mode` se
    propaga al asignar template (targets de template = copiar de un plan origen v1; modelado
    `template_meal_exchange_targets` solo si Fran lo pide).
  - Verificación: typecheck + vitest; aislamiento cubierto en la suite SQL del gate.
- [ ] T7.2 — CRUD de grupos custom.
  - Scope: espejo del CRUD de áreas (`/coach/settings/areas`): crear/editar/soft-delete grupos
    custom (coach standalone propias; team solo gestores), `ref_*` y color editables, system
    read-only con `macros_confirmed` actualizable SOLO vía seed/admin.
  - Verificación: typecheck + vitest; RLS ya cubierta por suite SQL.

## GATE FINAL (SOLO con autorización explícita del usuario — regla 2026-06-10)

- [ ] TG.1 — E2E `tests/separation/nutrition-exchanges.spec.ts` (escrito durante F3-F5, corre acá).
  - Matriz: módulo ON/OFF por contexto (pool manda) · flujo Fran (pauta → PDF marca team, NO EVA)
    · alumno pool (chips → equivalencias → completar offline) · standalone con su marca · free ⇒
    EVA. 1 corrida `--workers=1` contra build prod; personas e2e permanentes.
- [ ] TG.2 — `tests/team/exchanges-isolation.sql` + suites de separación existentes en verde.
- [ ] TG.3 — Access log verificado (`pdf_generate` del COACH en team con metadata; el flujo del
  alumno NO deja fila — AC7) + advisors sin críticos nuevos.
- [ ] TG.4 — Actualizar `docs/plans/movida/00-DIRECTOR.md` (bitácora + DoD M1),
  `docs/testing/TEST_STATUS.md`, `docs/status/NEXT_STEPS.md`.

## Definition of Done universal

- [ ] `pnpm typecheck` + `pnpm test` verdes por fase; build verde en F1/F5/gate.
- [ ] Sin Supabase directo en `_data` (siempre `_data → services → repository`).
- [ ] Server actions con Zod v4 + `assertModule` al tope + `revalidatePath`.
- [ ] `dvh`/safe-areas/dark mode en toda UI nueva; cero `<img>` crudo.
- [ ] i18n completo (`es.json` + `en.json`) por commit.
- [ ] Migraciones aditivas/idempotentes; branch MCP borrado el mismo día; `db pull` + types
      regenerados versionados.
- [ ] Docs canónicas + bitácora del director actualizadas al cerrar cada hito.
