# TASKS — Nutrición por intercambios + PDF branded

**Spec:** `specs/movida-intercambios/SPEC.md` · **Plan:** `specs/movida-intercambios/PLAN.md`
**Last updated:** 2026-06-11

Leyenda: `[ ]` pendiente · `[x]` hecho. **DoD global por tanda:** `pnpm typecheck` + `pnpm test`
(vitest) verdes; modo gramos byte-identical (baselines F0); strings con `t()` +
`nutrition.exchange.*` en `es.json` Y `en.json`; sin Supabase remota fuera de F1 (branch MCP) y
del gate autorizado. Commit + push por fase cuando el usuario lo pida.

> **Bitácora de implementación 2026-06-11 (agente movida-intercambios):** F2-F6 implementadas en
> una tanda (typecheck + vitest verdes en los archivos del contrato). Desvíos del PLAN por
> contrato del orquestador: (1) cálculo puro en `services/nutrition-exchanges/exchange-calc.ts`
> en vez de `packages/calc` (otro agente ocupa ese package; extracción = move 1:1);
> (2) repository NUEVO `infrastructure/db/exchanges.repository.ts` en vez de extender
> `nutrition.repository.ts`; (3) Zod en `packages/schemas/nutrition-exchanges.ts` (export en
> `index.ts` lo cablea el orquestador; mientras tanto subpath `@eva/schemas/nutrition-exchanges`
> vía tsconfig paths). T2.3 (kill-switch en `entitlements.service.ts`) DIFERIDO: archivo
> compartido entre agentes paralelos — patch sugerido en el reporte del agente.
>
> **MustFix del review aplicados 2026-06-11 (2/2):**
> - **R1 (corrupción de datos):** el guardado del plan en modo exchanges matcheaba comidas
>   por `order_index` (in-place por POSICIÓN) y `meal_exchange_targets`/`day_variant_id`
>   quedaban pegados al ROW ID ⇒ reordenar/borrar comidas + guardar barajaba la
>   prescripción. Fix opción (a): el builder envía el id de DB de cada comida persistida
>   (solo `exchangeActive`; `ExchangesMealSchema.id` opcional con `z.guid()`) y la action
>   reconcilia por ID vía helper PURO `services/nutrition-exchanges/meal-reconcile.ts`
>   (8 unit tests: reorden, borrado intermedio, mixto, id duplicado/huérfano, vacíos).
>   Modo gramos byte-identical: sin id en payload ⇒ rama legacy intacta (AC1).
> - **R2 (seguridad/AC2):** `logExchangePdfGenerated` ahora llama
>   `assertExchangesModuleForPlan` ANTES del insert — módulo OFF/kill-switch ⇒ el catch
>   degrada a no-op (fire-and-forget intacto, sin filas `pdf_generate` falseando la
>   bitácora 21.719). 4 unit tests nuevos con deps mockeadas
>   (`nutrition-exchanges.service.gating.test.ts`).
> - Follow-up anotado (fuera del alcance del mustFix): `restoreClientNutritionPlanFromHistory`
>   valida con `ClientPlanSchema` (sin plan_mode) ⇒ snapshots de planes exchanges con
>   comidas vacías se rechazan (sin corrupción); un plan exchanges cuyo snapshot pase la
>   validación restauraría por la rama legacy — restore + exchanges queda para v2.

## F0 — Baselines anti-regresión

- [ ] T0.1 — Baseline unit del PDF diario actual.
  - PARCIAL 2026-06-11: la paleta EVA quedó baselineada en `lib/nutrition-pdf-brand.test.ts`
    (rama `poweredByEva` ⇒ emerald-500 + slate-900 + footer exacto). Falta el baseline con
    mock de jspdf del documento completo (subtotales con fixtures).
  - Scope: `apps/web/src/lib/nutrition-day-pdf.test.ts` — contrato de `NutritionPdfParams`,
    cálculo de subtotales/totales con fixtures, y constantes de paleta EVA (para preservarlas
    exactas en la rama free/fallback tras el refactor de marca). Mock de `jspdf` (import dinámico).
  - Verificación: vitest verde ANTES de tocar `nutrition-day-pdf.ts`.
- [ ] T0.2 — Baseline del render gramos del alumno.
  - Scope: test de `MealCard`/helpers de `NutritionShell` en modo actual (macros por comida,
    visibilidad de swaps). Solo lógica extraíble — no snapshot DOM frágil.
  - Verificación: vitest verde; lista de asserts que F4 debe mantener.
- [x] T0.3 — Mapa de call sites (espejo `specs/movida-areas/CALLSITES.md`).
  - HECHO 2026-06-11: `specs/movida-intercambios/CALLSITES.md`.
  - Scope: `CALLSITES.md` en este spec: consumidores de `downloadNutritionDayPdf`, puntos de
    inserción en `PlanBuilder/*` (`MealBlock`, `PlanBuilderSidebar`, `types.ts`, mappers
    `plan-builder-mappers.ts`), queries del alumno que traerán targets, y dónde se resuelve la
    marca (headers proxy / workspace query).
  - Verificación: archivo creado; revisado contra grep.

## F1 — DB aditiva (branch MCP — protocolo director §3 completo)

> Estado 2026-06-11: DDL+RLS (`20260611093001_nutrition_exchanges.sql`), seed
> (`_POST_DEPLOY_20260611093002_nutrition_exchanges_seed.sql`), suite SQL
> (`tests/team/exchanges-isolation.sql`) y `database.types.ts` YA autorados por el
> orquestador. La aplicación a Supabase remota (branch MCP → merge → db pull) corre
> esta noche — PROHIBIDO para este agente. T1.1-T1.5 se sellan en esa corrida.

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

- [x] T2.1 — Tipos de dominio.
  - HECHO 2026-06-11: `domain/nutrition/exchange.types.ts` (sin imports de Next/Supabase/lib).
  - Scope: `apps/web/src/domain/nutrition/exchange.types.ts`: `ExchangeGroup`,
    `MealExchangeTarget`, `DayVariant`, `PdfBrand { brandName, primaryColor, logoDataUrl?, poweredByEva }`,
    `ExchangePdfFormat = 'compact'|'equivalences'|'full'`. Sin imports de Next/Supabase/lib.
  - Verificación: typecheck; regla de importación de domain respetada.
- [x] T2.2 — Cálculo puro (DESVÍO de ubicación: `services/nutrition-exchanges/exchange-calc.ts`).
  - HECHO 2026-06-11: `expandComposedGroups`, `macrosForTargets`, `dayTotals`,
    `dayTotalsByVariant`, `portionsSummaryLabel`, `hasUnconfirmedMacros`, paleta fallback.
    18 golden tests verdes (`exchange-calc.test.ts`): simples, LEG, 0.5, variante NULL,
    orden, redondeo. `packages/calc` quedó ocupado por otro agente del run paralelo —
    mover a `@eva/calc` es un move 1:1 futuro (API idéntica, cero IO).
  - Scope: package workspace (espejo de `packages/schemas`): `expandComposedGroups`,
    `macrosForTargets`, `dayTotals`, `dayTotalsByVariant`, `portionsSummaryLabel`. Sin IO ni
    `server-only`. Registrar en `pnpm-workspace.yaml` si hace falta (sin postinstall).
  - Verificación: `exchange.test.ts` golden tests ≥10 (simples, LEG, 0.5, variante NULL, orden,
    redondeo) verdes con `npx vitest run`.
- [ ] T2.3 — Kill-switch de plataforma en entitlements. **DIFERIDO 2026-06-11**:
  `entitlements.service.ts` es archivo COMPARTIDO entre los agentes paralelos del run
  (todos los módulos lo consumen) — lo cablea el orquestador. Patch sugerido: en
  `hasModule()`, antes de cualquier query:
  `if ((process.env.EVA_DISABLED_MODULES ?? '').split(',').map(s => s.trim()).includes(key)) return false`
  + unit tests + documentar env en MANUAL_TASKS §MT-25 / CLAUDE.md.
  - Scope: `entitlements.service.ts`: `EVA_DISABLED_MODULES` (CSV env, runtime) consultado al
    inicio de `hasModule`/`assertModule` (antes de cualquier query). Documentar la env en
    `docs/operations/MANUAL_TASKS.md` §MT-25 / CLAUDE.md tabla de envs.
  - Verificación: unit tests — módulo killed ⇒ `hasModule=false` aunque el entitlement esté ON;
    env vacía ⇒ comportamiento actual intacto.
- [x] T2.4 — Repository + service.
  - HECHO 2026-06-11 (DESVÍO: repo NUEVO `infrastructure/db/exchanges.repository.ts`, no se
    tocó `nutrition.repository.ts` — contrato del orquestador). Service en
    `services/nutrition-exchanges/nutrition-exchanges.service.ts`: assertModule por contexto
    del RECURSO (`moduleCtxForPlan`, pool manda), coerción de grupos visibles
    (`verifyGroupsVisibleToActor`, RLS como techo del SELECT), awareness, bitácora AC7,
    bundle del alumno con service-role acotado + `groupMatchesTenant`. Unit tests de los
    helpers puros verdes (13).
  - Scope: extender `infrastructure/db/nutrition.repository.ts` (`findExchangeGroups(scope)`,
    `findExchangeFoodsByGroup`, `findMealExchangeTargetsByPlan`, `upsertMealExchangeTargets`,
    `setPlanMode`, CRUD variants — user-scoped, RLS techo); crear
    `services/nutrition-exchanges.service.ts` (assertModule por contexto del RECURSO, coerción de
    `exchangeGroupId` a grupos visibles, `last_edited_by_coach_id`, `logTeamClientAccess` para
    `pdf_generate` — invocado SOLO desde el flujo del coach en contexto team, alcance AC7).
  - Verificación: typecheck; unit tests del service con repo mockeado (gating, coerción, awareness).
- [x] T2.5 — Server actions + Zod.
  - HECHO 2026-06-11: `_actions/exchange.actions.ts` (setPlanMode, saveMealExchangeTargets,
    create/rename/deleteDayVariant, assignMealVariant, logNutritionPdfGenerated). Zod en
    `packages/schemas/nutrition-exchanges.ts` con `z.guid()` (gotcha Zod 4) + 12 unit tests.
    Export en `packages/schemas/index.ts` pendiente del orquestador (subpath tsconfig mientras).
  - Scope: `app/coach/nutrition-plans/_actions/exchange.actions.ts` (tabla del PLAN §Server
    actions). `z.guid()` para ids (gotcha Zod 4 `.uuid()` estricto del F3 de áreas — los UUID seed
    pueden no ser RFC 9562). `revalidatePath` por mutación.
  - Verificación: typecheck; unit tests de schemas (payloads inválidos rechazados).

## F3 — Builder del coach

- [x] T3.1 — Datos + toggle de modo.
  - HECHO 2026-06-11 (datos en archivo NUEVO `_data/exchange.queries.ts`, sin tocar
    `nutrition-coach.queries.ts`): grupos por scope 3-vías + `hasModule` espejo + marca por
    workspace. Toggle en `ExchangeModePanel` (módulo OFF ⇒ builder byte-identical: el prop
    `exchange` ni se construye). Switch no destructivo. Plan nuevo ⇒ toggle deshabilitado
    con hint "guarda primero" (limitación v1 anotada).
  - Scope: `_data/nutrition-coach.queries.ts` carga grupos por scope 3-vías (system + propios +
    team activo) y `hasModule` del contexto; `setPlanModeAction` cableada a un switch
    "Gramos ↔ Porciones" (visible solo con módulo ON; switch no destructivo, conserva food_items
    y targets).
  - Verificación: typecheck + vitest; con módulo OFF el builder es byte-identical (baseline F0).
- [x] T3.2 — `ExchangeTargetsEditor` (steppers + chips + macros vivos).
  - HECHO 2026-06-11: steppers 44px (step 1, prop `step` lista para 0.5), chips de color,
    totales por comida y por día/variante (`exchange-calc`), debounce 700ms de
    `saveMealExchangeTargetsAction` con estado guardando/guardado/error, badge "macros
    referenciales", dark mode, i18n `nutrition.exchange.*` (es+en). Round-trip
    guardar→recargar cubierto por el spec E2E del gate (test B round-trip);
    QA manual diferido al gate. Comidas sin id de DB: edición bloqueada con hint (v1).
  - Scope: componente route-local en `PlanBuilder/`; stepper por grupo (step 1; preparar prop para
    0.5 pendiente de Fran), chips de color (color del grupo o paleta por `sort_order`), totales
    por comida y día (`@eva/calc`) con `useOptimistic` + debounce de persistencia
    (`saveMealExchangeTargetsAction`); badge "macros referenciales" si `macros_confirmed=false`;
    `EditedByBadge` existente. Targets 44px; dark mode; i18n.
  - Verificación: vitest de la lógica de estado; round-trip guardar→recargar→idéntico (manual);
    typecheck.
- [x] T3.3 — Awareness + revalidate.
  - HECHO 2026-06-11: toda mutación del módulo setea `last_edited_by_coach_id` (service) y
    revalida `/coach/nutrition-plans`, perfil del alumno y `/c/{slug}/nutrition`. El
    `EditedByBadge` existente del pool lo refleja sin cambios. QA manual con 2 sesiones ⇒ gate.
  - Scope: verificar `last_edited_by_coach_id` actualizado al guardar targets y reflejado en la UI
    del pool; `revalidatePath` de la vista del alumno.
  - Verificación: unit test del service; QA manual con 2 sesiones de coach.

## F4 — App del alumno

- [x] T4.1 — Query del alumno con targets + grupos.
  - HECHO 2026-06-11: `_data/nutrition-exchanges.queries.ts` (nuevo) →
    `getStudentExchangeBundle` (service). Targets/variantes con el cliente del ALUMNO
    (RLS `met_client_select`/`npdv_client_select`); grupos vía `createServiceRoleClient()`
    acotado a ids del plan + filtro SQL de tenant + doble check puro `groupMatchesTenant`
    (unit test: id cross-team jamás resuelve). Módulo resuelto server-side fail-closed.
    Edición mínima a `nutrition.queries.ts`: + columna `plan_mode` (anotada).
  - Scope: `_data/nutrition.queries.ts` trae `meal_exchange_targets` del plan activo; nombres/
    colores/equivalencias de los grupos referenciados vía `createServiceRoleClient()` ACOTADO a
    los ids del plan + filtro de tenant (system / coach del plan / team del alumno) — patrón F5 de
    áreas (NO `createRawAdminClient`; data minimization). Módulo del contexto resuelto server-side
    (pool manda) y bajado como flag.
  - Verificación: typecheck; unit test del filtro de tenant (un id cross-team jamás resuelve).
- [x] T4.2 — Chips + `ExchangeEquivalencesSheet`.
  - HECHO 2026-06-11: `ExchangeMealChips` + `ExchangeEquivalencesSheet` (nuevos; sheet
    bottom mobile-first con búsqueda local, `max-h-[80dvh]`, `pb-safe`, 44px,
    `useReducedMotion`). `MealCard` con props opcionales aditivas (`macroOverride`,
    `exchangeContent`) — módulo OFF ⇒ byte-identical (props ausentes). Completar comida =
    flujo existente intacto (offline-queue sin cambios). QA manual offline/viewport ⇒ gate.
  - Scope: `MealCard` modo exchanges renderiza `portionsSummaryLabel`; tap en chip abre bottom
    sheet con equivalencias (alimento + medida casera + gramos, búsqueda local); completar comida
    usa el flujo existente (offline-queue intacto). Fallback módulo OFF: sin chips, descripción
    visible, cero crash con targets presentes.
  - Verificación: vitest de helpers; baseline F0 del modo gramos intacta; QA manual offline
    (DevTools) + viewport móvil; typecheck.

## F5 — PDF branded (hito M1)

- [x] T5.1 — Fix transversal de marca en `nutrition-day-pdf.ts`.
  - HECHO 2026-06-11: param opcional `brand?: PdfBrand`; paleta vía `derivePdfPalette`
    (`lib/nutrition-pdf-brand.ts`, nuevo y unit-tested): rama `poweredByEva`/omitida ⇒
    EVA EXACTO (emerald-500 + slate-900 + "EVA FITNESS" + footer legacy). Marca del alumno
    desde headers del proxy (`pdfBrandFromProxyHeaders`) en el RSC; free tier ⇒ EVA.
  - Scope: firma con `brand: PdfBrand`; paleta derivada de `brand.primaryColor` (mezcla manual
    estilo `macroChip`); header con `brandName`/logo; footer "Generado con {brand}" + disclaimer;
    rama `poweredByEva` (free tier) reproduce la paleta EVA EXACTA de la baseline T0.1. Marca
    resuelta SERVER-SIDE: alumno desde headers del proxy en el RSC; nunca elegida por el cliente.
  - Verificación: unit tests de threading (team ⇒ marca team; free ⇒ EVA); baseline T0.1 verde en
    la rama EVA; typecheck.
- [x] T5.2 — `nutrition-exchange-pdf.ts` formatos `compact` y `equivalences`.
  - HECHO 2026-06-11: `buildExchangePdfModel` PURO (9 unit tests: secciones por variante,
    sin variantes idéntico, lista de compras con máx/día×7, nomenclatura, full lanza) +
    render jsPDF (badges circulares de color, comidas con códigos, agua + nomenclatura,
    disclaimer + footer multipágina). Logo fetch→dataURL con fallback inicial+color.
    `full` = stub v2. Checklist visual contra el PDF real de Fran ⇒ manual (gate/demo).
  - Scope: layout clon de la pauta de Fran (PLAN §Arquitectura punto 1): encabezado branded →
    objetivos → requerimientos → comidas por horario con badges de color y códigos → agua +
    nomenclatura → disclaimer. `equivalences` agrega por grupo usado la tabla alimento/medida/
    gramos + lista de compras (agregado semanal por grupo con ejemplos). Logo fetch→dataURL con
    fallback inicial+color. `full` queda como stub deshabilitado (v2).
  - Verificación: unit tests de armado de secciones con fixtures; checklist visual contra el PDF
    real de Fran (los 2 formatos, dark logo sobre fondo claro); typecheck.
- [x] T5.3 — Botones de descarga + access log (solo coach) + métrica.
  - HECHO 2026-06-11: botón coach en `ExchangeModePanel` (radio compacto/equivalencias +
    preview de marca + `useTransition` + import async); botón alumno en `NutritionShell`
    (reemplaza la celda "Exportar PDF" solo en modo exchanges). `logNutritionPdfGeneratedAction`
    fire-and-forget SOLO desde el builder del coach (`shouldLogExchangePdf` unit-tested:
    team activo + alumno de ESE pool ⇒ log; standalone/enterprise/alumno ⇒ no-op). Grep
    verificado: `app/c/` NO importa `exchange.actions.ts`. Analytics
    `nutrition_exchange_pdf_{ok,error}` en ambos flujos (union extendida en
    `lib/product-analytics.ts`). QA manual 3 contextos ⇒ gate.
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

- [x] T6.1 — CRUD de variantes + selector por comida.
  - HECHO 2026-06-11: actions create/rename/delete/assign (rename SIN UI v1 — action lista,
    diferida la edición inline); presets Descanso/Entreno AM/Entreno PM + input libre;
    selector de variante por comida en `ExchangeTargetsEditor`; `dayTotalsByVariant` en la
    barra de totales (comida sin variante cuenta en todas). Plan sin variantes ⇒ una sola
    fila "Día completo" (byte-identical, unit-tested).
  - Scope: actions del PLAN; UI en el builder (presets Descanso/Entreno AM/Entreno PM, editables);
    comidas sin variante = todas; `dayTotalsByVariant` en la barra de totales.
  - Verificación: vitest calc por variante; round-trip; plan sin variantes byte-identical.
- [x] T6.2 — Variantes en PDF y app del alumno.
  - HECHO 2026-06-11: secciones por variante en ambos formatos del PDF (fixture con 3
    variantes ⇒ 3 secciones, unit-tested; sin variantes ⇒ layout F5 idéntico). Alumno:
    etiqueta de variante sobre los chips (solo display v1).
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
  - Spec ESCRITO 2026-06-11 (matriz A-D: módulo OFF byte-identical, flujo coach pool +
    PDF marca team, alumno chips/equivalencias/offline/PDF, standalone con su marca).
    Precondición de seed documentada en el header del spec (módulo ON para team Vortex y
    solo-coach + plan exchanges del alumno pool). NO ejecutado (regla 2026-06-10).
  - Matriz: módulo ON/OFF por contexto (pool manda) · flujo Fran (pauta → PDF marca team, NO EVA)
    · alumno pool (chips → equivalencias → completar offline) · standalone con su marca · free ⇒
    EVA. 1 corrida `--workers=1` contra build prod; personas e2e permanentes.
- [ ] TG.2 — `tests/team/exchanges-isolation.sql` + suites de separación existentes en verde.
- [ ] TG.3 — Access log verificado (`pdf_generate` del COACH en team con metadata; el flujo del
  alumno NO deja fila — AC7) + advisors sin críticos nuevos.
- [ ] TG.4 — Actualizar `docs/archive/movida/00-DIRECTOR.md` (bitácora + DoD M1),
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
