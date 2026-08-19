# Mapa de deprecacion fisica — codigo V1 de nutricion

Fecha: 2026-07-18 · Autor: worker Tarea D (solo MAPA, cero borrados)
Rama base: `fix/qa-nav-anchos` (== master)

> Este documento es un MAPA. No borra ni edita nada fuera de si mismo. Autoriza el borrado
> posterior en una wave aparte. Marcas `(verificar)` = no confirmado con certeza en esta pasada.

---

## 0. Insight central — V1 NO es codigo muerto, es el camino de ROLLBACK

Aunque el rollout de Nutricion V2 esta `mode=on` para todos, **el codigo V1 sigue siendo la
ruta fail-closed de rollback**. Cada superficie decide V1 vs V2 con el MISMO gate
`isNutritionV2Enabled(...)` (`@/services/nutrition-v2-rollout.service`) y **renderiza V1 cuando
el flag esta OFF**:

- Alumno web: `c/[coach_slug]/nutrition/page.tsx` — `if (nutritionV2StudentEnabled) redirect(.../nutrition-v2)`; si no, renderiza el shell V1 completo.
- Coach web (cockpit): `coach/nutrition-plans/page.tsx` — `if (await shouldSwapCockpitToNutritionV2(coachId)) redirect('/coach/nutrition-v2')`; si no, renderiza el hub V1.
- Coach web (ficha alumno): `coach/clients/[clientId]/page.tsx` — gate por `isNutritionV2Enabled(surface:'webCoach')` que elige `NutritionTabB5` (V1) vs `nutritionTabV2` (V2).

**Consecuencia para el borrado fisico:** eliminar V1 = renunciar al rollback por flag. Eso es
una decision de negocio (gate CEO), no un delete mecanico. Este mapa distingue:
- lo que es **inequivocamente huerfano** (borrable sin renunciar a nada), de
- lo que solo es borrable **tras renunciar al rollback** de esa superficie, de
- lo que esta **fisicamente acoplado a codigo vivo** (hay que desacoplar antes de tocar V1).

El driver de conversion `scripts/nutrition-v2-conversion/*` LEE tablas V1 (`nutrition_plans`,
`exchange_groups`, `coaches`) y **se queda** hasta que el retiro fisico de tablas se decida aparte.

---

## 1. INVENTARIO del codigo V1 (archivo -> LOC)

### 1.1 Web — Shell alumno V1 `apps/web/src/app/c/[coach_slug]/nutrition/` (45 archivos, ~7.187 LOC)
Entrada: `page.tsx` (redirige a V2 si flag ON; si no, shell V1). `add/page.tsx`, `add/AddFoodClient.tsx`, `loading.tsx`, `add/loading.tsx`.
- `_actions/`: `habits.actions.ts`, `intake.actions.ts`, `nutrition-notes.actions.ts`, `nutrition.actions.ts`, `pdf-logo.actions.ts`, `shopping.actions.ts`
- `_components/` (26): `AdherenceStrip`, `DayNavigator`, `EmptyNutritionState`, `ExchangeEquivalencesSheet`, `ExchangeMealChips`, `MacroRingSummary(.tsx/.test)`, `MealCard`, `MealIngredientRow`, `MicrosPanel`, `NutritionDailyOverview`, `NutritionDomainOff`, `NutritionGuidanceProgress`, `NutritionIntakeLedger`, `NutritionNoPlanFromServer`, `NutritionShell`, `NutritionStreakBanner`, `NutritionV2Banner`, `OffPlanLogger`, `PlatePanel`, `PushNotificationBanner`, `RecipeIdeasSection`, `ShoppingListView`, `WeeklyRecapCard`, `WorkoutContextBanner`
- `_data/` (10): `client-scope.queries`, `intake.queries`, `nutrition-auth.queries`, `nutrition-exchanges.queries`, `nutrition-notes.queries`, `nutrition.queries`, `recap.queries`, `recipes.queries`, `sections.queries`, `shopping.queries`

### 1.2 Web — Cockpit coach V1 `apps/web/src/app/coach/nutrition-plans/` (58 archivos, ~12.999 LOC)
Entrada `page.tsx` (swap a V2 si flag ON). Sub-rutas: `[templateId]/edit/*`, `client/[clientId]/*`, `exchanges/page.tsx` (redirect/aviso de modulo), `new/*`, `loading.tsx`, `SuccessWaveOverlay.tsx`.
- `_actions/` (8): `curation`, `exchange`, `food-detail`, `food-library`, `guidance`, `nutrition-coach`, `recipe-photo`, `recipes`
- `_components/`: `ActivePlansBoard`, `AssignModal`, `CoachNutritionGuideDialog`, `FoodCatalogCurationQueue`, `FoodLibrary`, `NutritionGuidanceDialog`, `NutritionHub`, `NutritionOnboarding`, `NutritionProfessionalOverview`, `NutritionRosterMasterDetail`, `OrgTemplatesSection`, `TemplateLibrary`, `nutrition-onboarding-shared`, `nutrition-surfaces`, `recipes/*` (4)
- `_components/PlanBuilder/` (11): `ExchangeModePanel`, `ExchangeTargetsEditor`, `FoodItemRow`, `FoodSearchDrawer`, `MacroCalculator`, `MealBlock`, `MealCanvas`, `PlanBuilder`, `PlanBuilderSidebar`, `index.ts`, `types.ts`
- `_data/`: `exchange.queries`, `nutrition-coach.queries`, `nutrition-oversight.queries`, `nutrition-page.queries`, `plan-builder-mappers`, `recipes.queries`, `[templateId]/edit/_data/edit-template.queries`, `client/[clientId]/_data/client-plan-page.queries`, `new/_data/new-template.queries`
- `_lib/`: `nutrition-v2-swap.ts` — **NO es V1**: es el gate de swap V1->V2, se queda mientras exista rollback.

### 1.3 Web — Catalogo/librerias coach V1
- `apps/web/src/app/coach/foods/` (6 archivos, ~632 LOC): `FoodSearch`, `_components/AddFoodSheet`, `_components/FoodBrowser`, `_data/foods.queries`, `page`, `loading`
- `apps/web/src/app/coach/meal-groups/` (6 archivos, ~702 LOC): `MealGroupLibraryClient`, `MealGroupModal`, `_actions/meal-groups.actions`, `_data/meal-groups.queries`, `page`, `loading`
- `apps/web/src/app/coach/nutrition-builder/[clientId]/page.tsx` (11 LOC) — **redirect legacy** a `/coach/nutrition-plans/client/[clientId]`.

### 1.4 Web — Servicio V1 de intercambios `apps/web/src/services/nutrition-exchanges/`
- `nutrition-exchanges.service.ts` (410 LOC) — 18 exports; ver §2.
- `exchange-calc.ts` (198) + `.test` (186); `meal-reconcile.ts` (55) + `.test` (117)
- `nutrition-exchanges.service.test.ts` (71), `.gating.test.ts` (104)

### 1.5 Web — Repositorios infra
- `apps/web/src/infrastructure/db/exchanges.repository.ts` (304 LOC) — vivo via feature-prefs (`findPlanModuleContext`) + service V1.
- `apps/web/src/infrastructure/db/nutrition.repository.ts` (62 LOC) — **sin consumidor de feature**; solo re-export por barrel `index.ts`/`interfaces.ts` (verificar que ninguna funcion se invoca).

### 1.6 Web — API movil V1 `apps/web/src/app/api/mobile/nutrition/` (~1.634 LOC; exchanges ~556)
`_shared.ts`, `micros/route`, `notes/route`, `off-plan/route`, `recap/route`, `shopping/route` y `exchanges/`: `_shared`, `meal-variant`, `set-mode`, `student-bundle`, `targets`, `variants`. (Los `nutrition-v2/*` son V2, NO tocar.)

### 1.7 RN (`apps/mobile`) — equivalentes V1
- Tab alumno V1: `app/alumno/(tabs)/nutricion.tsx` (710 LOC) — usa `useStudentExchanges` + componentes exchange V1; **sin redirect a V2 dentro del tab** (verificar routing nativo).
- Componentes alumno V1: `components/alumno/nutrition/` (~3.915 LOC): `ExchangeChips`, `ExchangeEquivalencesSheet`, `ExchangeMealSection`, `ExchangeModeToggle`, `NutritionDomainOff`, `NutritionEmpty`, `NutritionGuidanceCard`, `NutritionHeader`, `NutritionIntakeSection`, `NutritionStreakBanner`
- Coach V1: `app/coach/nutrition-builder.tsx` (886 LOC), `components/coach/ExchangeModePanel.tsx` (240), `components/coach/ExchangeTargetsEditor.tsx` (222)
- Libs V1: `lib/nutrition-exchanges.queries.ts` (166), `lib/nutrition-exchanges.coach.ts` (221), `lib/nutrition-exchanges.dict.ts` (52), y `lib/nutrition-utils.ts`, `lib/nutrition-reconcile.ts`, `lib/nutrition-swaps.ts`, `lib/nutrition-exchange-pdf.ts`, `lib/nutrition-templates.ts`, `lib/nutrition.queries.ts`, `lib/nutrition-intake.queries.ts`, `lib/nutrition-shopping.api.ts`, `lib/nutrition-notes.api.ts`, `lib/nutrition-day-export.ts` (verificar cuales son compartidos con V2)
- Home widgets: `components/alumno/home/NutritionDailySummary.tsx` (V1) vs `NutritionDailySummaryV2.tsx` (V2).

### 1.8 Lib web nutrition-* (clasificacion mixta — verificar por archivo)
V1-ligado: `nutrition-exchange-pdf.ts` (usa `exchange-calc`), `nutrition-day-pdf.ts`, `nutrition-day-plain-text.ts`. Neutro/compartido (probable): `nutrition-utils`, `nutrition-schemas`, `nutrition-pdf-brand`, `nutrition-plan-cycle-*`, `nutrition-coach-alerts`, `nutrition-checkin-coach-copy`, `nutrition-offline-queue`, `nutrition-plan-snapshot`, `nutrition-plan-local-cache`. `nutrition-portions-copy.ts` = V2.

---

## 2. GRAFO DE USO — quien importa cada pieza HOY (grep real)

### 2.1 Servicio V1 `nutrition-exchanges.service.ts` — consumidores (import real)
Exports: `NUTRITION_EXCHANGES_MODULE`, `moduleCtxForPlan`, `assertExchangesModuleForPlan`,
`hasExchangesModuleForClientContext`, `getExchangeGroupsForCoach`, `verifyGroupsVisibleToActor`,
`saveMealExchangeTargets`, `setNutritionPlanMode`, `getPlanExchangeEditorData`,
`getExchangeEquivalences`, `createPlanDayVariant`, `renamePlanDayVariant`, `deletePlanDayVariant`,
`assignMealDayVariant`, `shouldLogExchangePdf`, `logExchangePdfGenerated`, `groupMatchesTenant`,
`getStudentExchangeBundle`, tipos `PlanModuleContext`/`StudentExchangeBundle`.

Importadores:
- **[VIVO no-V1] `@/services/feature-prefs.service.ts`** -> `hasExchangesModuleForClientContext`. CORE, se ejecuta para TODOS. **BLOQUEA borrar el service completo.**
- **[VIVO V2] `coach/nutrition-v2/[clientId]/builder/_components/PortionsGroupsAction.ts`** -> `getExchangeGroupsForCoach`. El builder de PORCIONES reutiliza los grupos de intercambio V1. **BLOQUEA borrar el service completo.**
- `coach/nutrition-plans/exchanges/page.tsx` -> `NUTRITION_EXCHANGES_MODULE` (ruta viva de aviso de modulo).
- Resto: V1 puro — shell alumno (`nutrition-exchanges.queries`, `sections.queries`, `ExchangeEquivalencesSheet`, `ExchangeMealChips`, `NutritionShell`), cockpit coach (`exchange.actions`, `nutrition-coach.actions`, `exchange.queries`, `PlanBuilder`, `ExchangeTargetsEditor`), API movil `exchanges/student-bundle`, `lib/nutrition-exchange-pdf.ts`, `exchange-calc.ts` (interno).

### 2.2 Cross-imports que PINCHAN el shell alumno V1 desde codigo vivo/V2
(grep de imports a `c/[coach_slug]/nutrition/_*` desde fuera del dir)
- `_data/sections.queries` <- **`api/mobile/nutrition/micros/route.ts`** (movil vivo)
- `_data/recap.queries` <- **`api/mobile/nutrition/recap/route.ts`** (movil vivo)
- `_actions/nutrition.actions` (`toggleMealCompletion`) <- **`c/[coach_slug]/_components/OfflineNutritionQueueSync.tsx`** + **`dashboard/_components/nutrition/MealCompletionRow.tsx`** (dashboard vivo)
- `_actions/habits.actions` <- **`dashboard/_components/habits/HabitsCard.tsx`** (dashboard vivo)
- `_components/AdherenceStrip` (type `DayAdherence`) + `_components/DayNavigator` <- **`coach/clients/[clientId]/NutritionTabB5.tsx`** (ficha coach viva)
- `coach/nutrition-v2/_components/ConvertedPlanBanner.tsx`: **solo COMENTARIO** referencia `NutritionV2Banner` V1 — NO import. (verificado: no es blocker)

### 2.3 Falsos positivos verificados (NO son blockers)
- **`PortionEquivalencesSheet.tsx` (V2)** importa de `./portion-marks.logic`, NO del `ExchangeEquivalencesSheet` V1. Solo lo nombra en comentario. Confirmado: **se inspiro, no importa.**
- `nutrition-v2-swap.ts` vive bajo `nutrition-plans/` pero es infraestructura del gate; se queda con el rollback.

### 2.4 Clasificacion por pieza
| Pieza | Clasificacion | Consumidor / motivo |
|---|---|---|
| `nutrition-builder/[clientId]/page.tsx` | **[BORRABLE-YA] (verificar quien linkea)** | redirect legacy; confirmar que ningun link/nav apunta aun |
| `infrastructure/db/nutrition.repository.ts` | **[BORRABLE-YA] (verificar)** | solo barrel re-export, sin caller de feature detectado |
| Shell alumno V1 `page.tsx` + `_components`/`_data`/`_actions` NO pinchados | **[RUTA-VIVA / ROLLBACK]** | renderiza V1 si flag OFF |
| `sections.queries`, `recap.queries`, `nutrition.actions`, `habits.actions`, `AdherenceStrip`, `DayNavigator` | **[BLOQUEADO-POR-X]** | consumidos por movil/dashboard/ficha coach (ver 2.2) |
| Cockpit coach V1 `nutrition-plans/*` (UI) | **[RUTA-VIVA / ROLLBACK]** | swap a V2 por flag; V1 si OFF |
| `nutrition-exchanges.service.ts` (2 exports) | **[BLOQUEADO-POR-X]** | feature-prefs + portions builder V2 |
| `nutrition-exchanges.service.ts` (resto 16 exports) | **[RUTA-VIVA / ROLLBACK]** | solo V1 los usa |
| `exchanges.repository.ts` (`findPlanModuleContext`) | **[BLOQUEADO-POR-X]** | feature-prefs (vivo) |
| API movil `nutrition/*` (V1 + exchanges) | **[RUTA-VIVA via RN V1]** | el tab RN `nutricion.tsx` los consume |
| RN tab `nutricion.tsx` + `components/alumno/nutrition/*` | **[RUTA-VIVA / ROLLBACK]** | tab V1 sin redirect a V2 (verificar gate nativo) |
| RN coach exchange comps + `nutrition-builder.tsx` | **[RUTA-VIVA]** | coach RN sigue en flujo exchange V1 (verificar) |
| `exchanges/page.tsx` (coach) | **[RUTA-VIVA]** | aviso/redirect de modulo `nutrition_exchanges` |
| `coach/foods/*`, `coach/meal-groups/*` | **[RUTA-VIVA] (verificar nav)** | librerias del cockpit V1; confirmar si V2 las reemplaza |

---

## 3. TABLAS V1 de DB — lectores de codigo (retiro fisico = decision APARTE)

Tablas referenciadas por el codigo V1. Clasificacion segun lectores FUERA de V1/conversion:

| Tabla | Lectores no-V1 vivos | Huerfana tras borrar V1? |
|---|---|---|
| `nutrition_plans` | dashboard.queries, client(.service/-detail.service), org.repository, org nutrition-templates, admin coach-actions, nutrition-plan-snapshot, nutrition.service, nutrition-shopping.service, API movil | **NO — muy viva. Se queda.** |
| `nutrition_meals` | dashboard.queries, client-detail.service, nutrition.service, nutrition-plan-snapshot, API movil meal-variant | **NO — viva. Se queda.** |
| `exchange_groups` | **`coach/nutrition-v2/_actions/plan-persistence.ts` (portions V2)** + conversion driver | **NO — reutilizada por PORCIONES. Se queda.** |
| `exchange_foods` | ninguno fuera de V1/conversion (verificar) | **CANDIDATA a huerfana** tras borrar V1 + archivar conversion |
| `meal_exchange_targets` | solo API movil V1 `exchanges/targets` + V1 | **CANDIDATA** tras retirar API movil V1 exchanges |
| `nutrition_plan_day_variants` | solo API movil V1 `exchanges/variants` + V1 | **CANDIDATA** tras retirar API movil V1 exchanges |
| `nutrition_plan_templates`, `org_nutrition_templates` | plantillas coach/org (verificar si V2 migra a otra tabla) | **verificar** — probablemente vivas |
| `client_food_preferences`, `saved_meals` | aparecen en queries V1 (verificar lectores vivos) | **verificar** |
| `nutrition_intake_entries`, `daily_nutrition_logs` | compartidas con intake V2 (verificar) | **NO tocar sin verificar** |

Nota: `nutrition_plans`/`nutrition_meals`/`exchange_groups` estan tejidas en codigo vivo no-V1,
asi que aunque se borre TODO el shell V1, esas tablas NO quedan sin lectores. El retiro fisico de
tablas se limita, como mucho, a `exchange_foods` + `meal_exchange_targets` +
`nutrition_plan_day_variants`, y SOLO tras las tandas 4-5 de codigo. Decision de tablas = aparte.

---

## 4. PLAN de borrado en tandas seguras

Gate de verificacion (correr en CADA tanda, debe pasar verde antes de commitear):
1. `pnpm typecheck` (`tsc --noEmit`, filtra `@eva/web`) — imports rotos = falla dura.
2. `pnpm test` (vitest) — suites de nutrition/exchanges/portions.
3. `pnpm lint` (`eslint apps/web/src tests scripts`) — reglas de boundaries/imports restringidos.
4. Grep de imports rotos hacia las rutas borradas: `grep -rn "<ruta-borrada>" apps/web/src apps/mobile` == vacio.
5. (RN) `apps/mobile`: `tsc` + build/export si la tanda toca movil.

### Tanda 0 — Inequivoco (sin renunciar a nada)
- `coach/nutrition-builder/[clientId]/page.tsx` (redirect legacy) — **solo si** ningun link/nav interno lo usa (verificar grep de `nutrition-builder`).
- `infrastructure/db/nutrition.repository.ts` + su re-export en `index.ts`/`interfaces.ts` — **solo si** grep confirma cero callers de sus funciones (verificar).
- Tests huerfanos asociados.

### Tanda 1 — Desacoplar los 6 pinchazos del shell alumno (prepara borrado)
NO borra shell aun; RELOCALIZA a homes neutros los simbolos que codigo vivo importa desde V1:
- `toggleMealCompletion` (`nutrition.actions`) -> service/action neutro (lo usan OfflineNutritionQueueSync + dashboard).
- `habits.actions` -> home de habitos del dashboard.
- `sections.queries` (micros) y `recap.queries` -> `_data` de la API movil o un service compartido.
- `AdherenceStrip` (type `DayAdherence`) + `DayNavigator` -> `components/nutrition/` neutro (los usa la ficha coach).
Gate: typecheck + tests verdes con los imports ya apuntando al home nuevo.

### Tanda 2 — Borrar shell alumno web V1 (**requiere GATE CEO: renunciar rollback alumno web**)
- Borra `c/[coach_slug]/nutrition/page.tsx` render V1, `_components`, `_data`, `_actions` restantes.
- **CONSERVAR el redirect** a `/nutrition-v2` (mover la logica de redirect a un `page.tsx` minimo o a middleware; la URL `/nutrition` debe seguir sirviendo trafico -> V2).
- Ajustar `nutrition/page.tsx` para que quede solo como redirect fail-open a V2.

### Tanda 3 — Borrar cockpit coach V1 (**GATE CEO: renunciar rollback coach web**)
- Borra `coach/nutrition-plans/_components` (incl. `PlanBuilder/*`), `_data`, `_actions`, sub-rutas `[templateId]`, `client/[clientId]`, `new`, `foods`, `meal-groups`.
- CONSERVAR: `page.tsx` reducido a redirect a `/coach/nutrition-v2`; `exchanges/page.tsx` (aviso modulo) si el modulo sigue existiendo; `nutrition-v2-swap.ts` solo si se conserva algun canary (si no, tambien va).
- Borra `NutritionTabB5` V1 de la ficha coach y deja solo `nutritionTabV2`.

### Tanda 4 — Adelgazar el servicio V1 de intercambios
Tras tandas 2-3, el service solo tiene 2 consumidores vivos:
- `hasExchangesModuleForClientContext` (feature-prefs) y `getExchangeGroupsForCoach` (portions V2).
Accion: extraer esos 2 (+ deps `moduleCtxForPlan`, `groupMatchesTenant`, `PlanModuleContext`,
`findPlanModuleContext` de `exchanges.repository`) a un modulo slim (p.ej.
`services/exchange-groups/` o dentro del dominio de porciones). Borrar los 16 exports V1 restantes,
`exchange-calc.ts` (si `nutrition-exchange-pdf` V1 ya se fue), `meal-reconcile.ts` y sus tests.
Gate estricto: portions builder + feature-prefs deben typecheckear/test verde contra el home nuevo.

### Tanda 5 — RN V1 (**requiere BUILD NATIVA + GATE: renunciar rollback movil**)
- Borra tab `app/alumno/(tabs)/nutricion.tsx` V1 y apunta el tab a la experiencia V2, o redirige.
- Borra `components/alumno/nutrition/*` V1, `components/coach/ExchangeModePanel|ExchangeTargetsEditor`, `app/coach/nutrition-builder.tsx`, libs `nutrition-exchanges.{queries,coach,dict}.ts`, `nutrition-exchange-pdf.ts` (verificar cuales comparten con V2).
- Borra API movil V1 `apps/web/src/app/api/mobile/nutrition/{exchanges/*, micros, recap, off-plan, shopping, notes}` SOLO cuando ningun cliente RN publicado las consuma (native rollout completo).

### Tanda 6 — Tablas V1 (decision DB aparte, tras tandas 4-5)
- Candidatas a DROP: `exchange_foods`, `meal_exchange_targets`, `nutrition_plan_day_variants` — solo cuando grep confirme cero lectores de codigo Y el driver `scripts/nutrition-v2-conversion` este archivado.
- **NO** dropear `nutrition_plans`, `nutrition_meals`, `exchange_groups` (lectores vivos no-V1 / reuso porciones).
- `nutrition_plan_templates`, `org_nutrition_templates`, `client_food_preferences`, `saved_meals`, `nutrition_intake_entries`, `daily_nutrition_logs`: **verificar lectores V2 antes de cualquier accion**.
- Metodo DB: snapshot + tx-rollback + advisors en LIVE (aditivo), nunca branches Supabase.

---

## 5. Pendientes de verificacion (marcados en el mapa)
1. `nutrition.repository.ts`: confirmar cero callers de sus funciones exportadas (solo barrel).
2. RN: el tab `nutricion.tsx` no tiene redirect a V2 en su cabecera — confirmar si el routing nativo/tab-layout ya lo desvia o si sigue siendo la experiencia alumno por defecto en la build publicada.
3. `coach/foods` y `coach/meal-groups`: confirmar que V2 (catalogo `FoodCatalogBrowser`/`CurationQueue`) los reemplaza y que ningun nav vivo los enlaza.
4. Libs `apps/mobile/lib/nutrition-*` y `apps/web/src/lib/nutrition-*`: separar por archivo cuales son V1-only vs compartidas con V2 antes de borrar.
5. Tablas `exchange_foods`, `meal_exchange_targets`, `nutrition_plan_day_variants`, `client_food_preferences`, `saved_meals`: correr grep de lectores en TODO el repo (incl. edge functions / SQL) antes de declararlas huerfanas.
6. `nutrition-v2-swap.ts` y `exchanges/page.tsx`: decidir si el canary/aviso de modulo sobreviven al retiro de V1.
