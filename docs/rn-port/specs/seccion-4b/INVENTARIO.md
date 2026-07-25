# Ola 4B — Inventario: Nutrición V2 del COACH + catálogos (web responsive → RN)

> Fuente de verdad: la superficie **V2 VIVA** del coach en web responsive:
> `apps/web/src/app/coach/nutrition-v2/**` (hub `page.tsx` + `_components` + `_lib` + `_actions`),
> el tab V2 de la ficha `apps/web/src/app/coach/nutrition-v2/[clientId]/**` (detalle + `_quick-edit` +
> `builder`), y `apps/web/src/app/coach/meal-groups/**`. Read-models, schema, scope y métricas salen de
> `@eva/nutrition-v2`; macros de `@eva/nutrition-engine`.
> Homólogos RN: `apps/mobile/app/coach/nutrition-v2/**` (`index.tsx` hub huérfano, `[clientId].tsx`
> detalle, `builder/[clientId].tsx`), `apps/mobile/components/nutrition-v2/quick-edit/QuickEditMode.tsx`,
> `apps/mobile/app/coach/meal-groups.tsx`, libs `nutrition-v2-builder.ts` / `nutrition-v2-quick-edit.ts` /
> `nutrition-v2-pro.ts` / `nutrition-v2-hub.ts` / `nutrition-v2-catalog.api.ts` / `meal-groups.ts`.
>
> **Filtro de alcance vinculante (DECISIONES-OWNER 4B).** V1 **al olvido** (decisión 1): ni web/PWA ni RN
> usan V1; el shell V1 RN (`(tabs)/nutricion.tsx` con `FoodsTab`/`FoodForm`/`RecipesTab`/`TemplatesTab`/
> `ClientsTab`) y `nutrition-builder.tsx` V1 quedan fuera de paridad (solo rollback técnico tras el flag).
> Recetas **fuera** (decisión 3). RN-extras del coach = **retirar/gatear estricto** (decisión 4). La
> **referencia de catálogo de alimentos NO es `FoodLibrary.tsx`** (vive en el hub V1, muere con la decisión
> 1): la referencia canónica es **`FoodCatalogBrowser.tsx` + `FoodDetailSheet.tsx`** del hub V2 (verificado:
> `nutrition-v2/page.tsx:93` monta `NutritionHubTabs`, y `FoodCatalogBrowser` solo lo importa
> `NutritionHubTabs.tsx:5,61`). Los hallazgos transferibles de `foods.md` (ficha `FoodDetailSheet`,
> paginación, atribución OFF) se re-anclan a esa superficie; los NO transferibles (alta de alimento custom,
> pills de categoría, selector de scope, orden, editar/borrar) pertenecían a la V1 y quedan fuera —
> **verificado en código**: `FoodCatalogBrowser` es un buscador read-only (sin alta, sin pills, sin scope,
> sin orden); el alta de alimento custom del coach vive en **`CurationQueue.tsx`** (crear+vincular).

---

## 0. Hallazgos P0 (contexto de toda la ola)

- **P0-A · El tab coach RN abre V1 sin check de flag (ruteo).** `apps/mobile/components/coach/CoachMobileChrome.tsx:30`
  (`path:'/coach/nutricion'`) abre `apps/mobile/app/coach/(tabs)/nutricion.tsx`, el **hub V1** completo
  (`nutricion.tsx:99,123-124,214-218`), **sin ninguna referencia a `nutritionV2Coach`/rollout** (grep: 0
  matches de `nutrition-v2`/`V2`). En web, "Nutrición" (`CoachTopBar.tsx:54` → `/coach/nutrition-plans`)
  evalúa `shouldSwapCockpitToNutritionV2` y **redirige a `/coach/nutrition-v2`** para el 100% (mode=on). El
  coach RN ve V1; el web ve V2. Espejo exacto del P0 de la Ola 4A.
- **P0-B · Hub V2 RN huérfano.** `apps/mobile/app/coach/nutrition-v2/index.tsx:81` existe y está gated
  (`entitlements.ready && isEnabled('nutritionV2Coach')`) pero **nadie lo enlaza desde la cápsula**: las
  únicas navegaciones a `/coach/nutrition-v2` (índice) son internas (self `index.tsx:304`, builder
  `builder/[clientId].tsx:221`, ficha `coach-nutrition-v2-tab-logic.ts:159-160`). El coach RN solo llega a
  V2 **por-alumno** desde la ficha (`NutricionTab.tsx:797-808` → `NutritionV2Summary`), nunca a un Centro V2
  global. Código muerto de navegación.
- **P0-C · Falta el swap espejo de `nutrition-v2-swap.ts`.** Web:
  `nutrition-plans/_lib/nutrition-v2-swap.ts:19-31` (`isNutritionV2Enabled({surface:'webCoach'})`) +
  `nutrition-plans/page.tsx:38-40` (redirect a V2). RN **no decide V1 vs V2 a nivel hub en ningún lado**.
  Es la pieza que cablea P0-A/P0-B.
- **P0-D · Write-path F-02 muerto en el builder RN.** El write-path de reemplazos YA existe
  (`nutrition-v2-builder.ts:596-664` `buildItemSubstitutionInsertRow`/`collectSubstitutionFoodIds` +
  inserción en `publishDraftRN:1036-1051`), pero **`BuilderItem` RN no tiene campo `substitutions`**
  (`nutrition-v2-builder.ts:56-68`) y **`BuilderAction` no tiene `ADD_ITEM_SUBSTITUTION`/
  `REMOVE_ITEM_SUBSTITUTION`** (`:147-161`). Por eso `item.substitutions ?? []` siempre resuelve `[]`: es un
  stub que jamás escribe un reemplazo porque la UI nunca lo puebla. El `TODO(F-02 P3)` está en
  `QuickEditMode.tsx:129-130`, pero el editor pertenece al **builder** (web solo edita reemplazos en
  `PlanBuilderClient.tsx:355-436` `SubstitutionsField`; el quick-edit los trata carry-over read-only, con
  paridad web↔RN).
- **P0-E · `SET_PERMISSION` inalcanzable en el builder RN.** El estado/acción existe
  (`nutrition-v2-builder.ts:155,194`) pero `TargetsStep` (`builder/[clientId].tsx:470-545`) **nunca renderiza
  el editor de permisos** que web sí tiene (`PlanBuilderClient.tsx:771-788`: `canRegisterFreely`/
  `canAdjustPrescribedQuantity`/`canSubstitute`). El coach RN no puede fijar permisos; publica
  `defaultPermissionsFor`.
- **P0-F · Macros de meal-groups duplicados y DIVERGENTES del engine.** Web usa
  `calculateFoodItemMacros` de `@eva/nutrition-engine` (`packages/nutrition-engine/macros.ts:120-135`;
  `MealGroupLibraryClient.tsx:30-48`, `MealGroupModal.tsx:56-71`): para unidad `un`, `factor = q×serving/100`.
  RN reimplementa a mano en `meal-groups.tsx:41-52` (`itemMacros`) y `lib/meal-groups.ts:163-184`
  (`mealGroupTotals`): para `un` usa `factor = q` **ignorando `serving_size`**. Caso huevo (serving 60,
  13 g P/100g, 2 un): web 15.6 g P; RN 26 g P. Números inflados y visibles en tarjeta y "Total estimado". El
  comentario `lib/meal-groups.ts:162` ("misma fórmula que la web") es falso. RN ya importa
  `@eva/nutrition-engine` en 10+ archivos. **[u01 / 4B-01 en ejecución.]**
- **P0-G · Lib `nutrition-pro` duplicada web/RN con drift de copy.** `filterHistoryDaysToBaseWindow` +
  `subtractIsoDays` + `NUTRITION_PRO_MODULE_KEY` + `NUTRITION_PRO_HISTORY_DAYS_BASE` copiados en
  `apps/web/src/app/coach/nutrition-v2/[clientId]/_lib/nutrition-pro.ts:71-92` y
  `apps/mobile/lib/nutrition-v2-pro.ts:26-45` (ambos "espejo RN del subconjunto"). Lógica PURA compartible que
  debería vivir en `@eva/nutrition-v2`; el drift ya es observable en el copy del banner upsell (ver §2, ruta
  `/coach/subscription` vs `/coach/modules` y tildes). **NO es P0 de seguridad** — el gate real (recorte de
  historial a ~30 días, Pro) es server-side (RPC `get_nutrition_client_detail_scoped_v2`) e íntegro en ambos.
  Es deuda transversal (toca web + packages), ver §5 y RANKING 4B-16.

---

## 1. Mapa de superficies (condensado, archivo:línea ambos lados)

### 1.1 Hub / acceso (Centro V2)

| Superficie web | Archivo web | Homólogo RN | Estado |
|---|---|---|---|
| Nav coach → nutrición | `CoachTopBar.tsx:54` (`/coach/nutrition-plans` → swap V2) | `CoachMobileChrome.tsx:30` (`/coach/nutricion` = V1) | **DELTA P0-A** de destino |
| Swap V1→V2 del cockpit | `nutrition-plans/page.tsx:38-40` + `_lib/nutrition-v2-swap.ts:19-31` | — | **FALTA (P0-C)** |
| Hub V2 (shell+tabs+roster+CTA) | `nutrition-v2/page.tsx:82-105` | `nutrition-v2/index.tsx:225-345` | EXISTE pero **HUÉRFANO (P0-B)**; sin tabs Alimentos/Curación |
| Shell/header | `page.tsx:86-92` (`NutritionPageShell`: backHref dashboard, "Centro de Nutrición", CTA "Nuevo plan") | `index.tsx:238-243` (`NutritionHeader`: eyebrow "Canary privado", sin backHref, sin CTA global) | Deltas de copy/estructura |
| Tabs del hub (Alumnos/Alimentos/Curación) | `NutritionHubTabs.tsx:10-14` | — (roster-only, sin tablist) | **FALTAN** Alimentos + Curación |
| Roster de alumnos (búsqueda+orden+filtros de atención) | `HubRoster.tsx:50+` (`CoachAttentionCard`, `PlanVersionBadge`) | `index.tsx:227-342` (`FlashList` + chips; **sin búsqueda ni orden**) | Deltas (falta search/sort) |
| Métrica de scope (con/sin plan, actividad hoy) | `page.tsx:80` `mapHubMetrics` + `HubMetrics` | `index.tsx:183-186,245-251` `mapNutritionHubMetrics` | **PARIDAD** (helpers `@eva/nutrition-v2`/`nutrition-v2-hub`) |
| CTA global "Nuevo plan" (picker roster→builder) | `NewPlanPickerButton.tsx:26+` + `page.tsx:91` | — (solo CTA por-fila `index.tsx:329-339`) | **FALTA** el picker global |
| Paginación roster (keyset) | `HubRoster` keyset por URL | `index.tsx:149-177,356-409` cursores in-memory + `PaginationBar` | Adaptación nativa (mismo keyset) |

### 1.2 Detalle del cliente (ficha V2 vista por el coach)

| Superficie web | Archivo web | Homólogo RN | Estado |
|---|---|---|---|
| Shell/header (eyebrow + back + CTA + aside "Nota profesional") | `[clientId]/page.tsx:145-183` | `[clientId].tsx:256-278` | EXISTE; aside→card inline; deltas CTA (D-01/D-02) |
| Badge estado del plan (strategy + versión + "desde") | `page.tsx:221-239` | `[clientId].tsx:280-289` | PARIDAD (`StrategyBadge`/`PlanVersionBadge`) |
| Banner "plan lag" | `page.tsx:241-246` | `[clientId].tsx:291-296` | PARIDAD (copy verbatim) |
| Adherencia del día (`MacroBudget`) | `page.tsx:248-267` | `[clientId].tsx:313-332` | PARIDAD (`createNutritionMacroValue`) |
| "Porciones de hoy" read-only (`PortionDayCoverageCard`) | `page.tsx:272` | `[clientId].tsx:337` | PARIDAD |
| Card "Plan vigente" (nombre + notas visibles) | `page.tsx:275-281` | `[clientId].tsx:339-354` | PARIDAD; RN mete "Editar plan" en la card (D-01) |
| Card "Hoy" (registros·franjas·kcal) | `page.tsx:282-290` | `[clientId].tsx:358-368` | PARIDAD (copy verbatim) |
| Estructura prescrita (variantes→franjas→ítems) | `page.tsx:293-339` | `[clientId].tsx:372-414` | PARIDAD |
| Nota profesional (privada, read-only) | `page.tsx:171-182` (aside) | `[clientId].tsx:416-425` (card final) | Deltas copy (D-07) + ubicación (D-02) |
| Historial "Últimos días" | `page.tsx:341-395` (grid) | `[clientId].tsx:427-498` (lista) | Layout/copy divergen (D-05) |
| Banner upsell Nutrición Pro | `page.tsx:343-351` (→ `/coach/subscription`) | `[clientId].tsx:429-439` (→ `/coach/modules`) | Ruta + copy divergen (D-06; drift P0-G) |
| **CTA "Asignar a otros alumnos"** | `page.tsx:228-238` (`AssignPlanToClientsDialog` + roster `page.tsx:91-114`) | — | **FALTA (D-03)** |
| **"Archivar plan vigente"** | `page.tsx:397-410` (`ArchivePlanButton`) | — | **FALTA (D-04)** |
| **Banner "plan convertido" V1→V2 (AC8)** | `page.tsx:215-217` (`ConvertedPlanBanner`) | — | **FALTA (D-08)** |
| Empty-state "Sin plan vigente" | `page.tsx:196-212` (illustration `sin-plan` + CTA) | `[clientId].tsx:298-310` (sin ilustración) | FALTA ilustración (D-09) |
| Carry-over reemplazos F-02 al quick-edit | `page.tsx:138-140` (`fetchItemSubstitutionsForVersion`) | `QuickEditMode.tsx:168-181` (`loadQuickEditSubstitutions`) | PARIDAD de resultado (republicar NO borra) |

### 1.3 Builder V2 (wizard 4 pasos)

| Superficie web | Archivo web | Homólogo RN | Estado |
|---|---|---|---|
| Shell wizard 4 pasos | `PlanBuilderClient.tsx:1340-1447` | `builder/[clientId].tsx:293-374` | EXISTE; paridad de flujo |
| Paso Estrategia (3 cards, badge Pro, lock híbrido) | `PlanBuilderClient.tsx:641-722` | `builder/[clientId].tsx:427-464` + `SelectableStrategyCard` | Deltas (upsell copy/route) |
| Paso Objetivos (nombre + 4 metas) | `PlanBuilderClient.tsx:724-792` | `builder/[clientId].tsx:470-545` | EXISTE |
| **Editor de permisos del alumno (3 checkboxes)** | `PlanBuilderClient.tsx:771-788` | — (`SET_PERMISSION` en `nutrition-v2-builder.ts:155,194` nunca renderizado) | **FALTA (P0-E)** |
| Paso Construcción (franjas+items+subtotales) | `PlanBuilderClient.tsx:831-884` + `SlotEditor:519-623` + `ItemRow:438-517` | `builder/[clientId].tsx:759-806` + `SlotEditor:669-757` + `ItemEditor:569-667` | EXISTE con deltas |
| Buscador de catálogo por franja (paginado "Más resultados") | `PlanBuilderClient.tsx:122-227` (`FoodSearch`) | `builder/[clientId].tsx:917-1043` (`FoodSearchModal`) | EXISTE; **FALTA paginación** (solo 1ª página) |
| Alimento libre + "Guardar en mi catálogo" + aviso kcal | `PlanBuilderClient.tsx:253-348` (`FreeFoodFields`, `macroEnergyMismatch`) | `builder/[clientId].tsx:637-660` | Parcial; **FALTA guardar + aviso mismatch** |
| **Reemplazos F-02 por ítem** | `PlanBuilderClient.tsx:355-436` (`SubstitutionsField`, tope 8) | — | **FALTA (P0-D)**; write-path listo |
| **Porciones a elección en builder** | `PlanBuilderClient.tsx:52-55,602,935,1391-1400` + `Portions*` + `portions-state.ts` | — (el quick-edit RN SÍ la tiene → asimetría) | **FALTA en builder RN** |
| Resumen del día (MacroBudget sticky) | `PlanBuilderClient.tsx:794-828` (`DaySummary`) | `builder/[clientId].tsx:798-803` (solo `MacroChipRow`) | Delta: MacroBudget ausente |
| Paso Revisión (resumen + vigente-desde + versión) | `PlanBuilderClient.tsx:886-965` | `builder/[clientId].tsx:812-911` (con `StudentPreview` extra) | EXISTE; extra RN (§3) |
| Conflicto de fecha: "Empezar mañana" + **"Archivar el actual y reemplazar"** | `PlanBuilderClient.tsx:1288-1338` + `PublishConflictDialog.tsx` | `builder/[clientId].tsx:241-246,885-902` (solo "Empezar mañana") | **FALTA "Archivar y reemplazar"** |
| **Respaldo local del wizard (autosave+Restaurar+guard)** | `PlanBuilderClient.tsx:1088-1130,1344-1364` (`nutrition-coach-draft-store`, `beforeunload`) | — | **FALTA en RN** |
| Idempotencia fresca + gate Pro híbrido | `PlanBuilderClient.tsx:1187-1195` + server `publishPlanAction` | `builder/[clientId].tsx:206-236` + `publishDraftRN` (`nutrition-v2-builder.ts:1097-1123`) | PARIDAD de contrato (RPC `publish_nutrition_plan_v2` barrera real) |

### 1.4 Quick-edit (edición in-place del plan vigente)

| Superficie web | Archivo web | Homólogo RN | Estado |
|---|---|---|---|
| Overlay full-screen | `QuickEditPlanView.tsx:23-170` | `QuickEditMode.tsx:435-606` | EXISTE; paridad de flujo |
| Card de metas por variante | `TargetsEditorCard.tsx` | `QuickEditMode.tsx:481-489` | PARIDAD aparente |
| Fila editable (cantidad+stepper, swap, eliminar+undo, macros vivas) | `EditableItemRow.tsx:26-179` | `EditableSlotCard.tsx`/`EditableItemRow.tsx` vía `QuickEditMode.tsx:491-542` | PARIDAD de acciones |
| Snackbar "Deshacer" (5 s) | `EditableItemRow.tsx:43-53` (`sonner`) | `QuickEditMode.tsx:60,222-234,569` (`UndoSnackbar`) | PARIDAD (adaptación) |
| Agregar franja | `QuickEditPlanView.tsx:172-250` (`AddSlotButton`) | `QuickEditMode.tsx:545-555` + reducer `ADD_SLOT` | EXISTE (verificar sheet nombre+hora) |
| Porciones a elección | `EditablePortionsCard.tsx` | `EditablePortionsSection.tsx` + `portions-state.ts` vía `QuickEditMode.tsx:500-511` | **PARIDAD** (asimétrica con builder) |
| Barra de publicación sticky (retry) | `PublishBar.tsx:19-82` | `quick-edit/PublishBar.tsx` `QuickEditMode.tsx:571-578` | PARIDAD |
| Confirm sheet + STALE_BASE + upsell Pro | `PublishConfirmSheet.tsx`/`StaleBaseDialog.tsx` `QuickEditProvider.tsx:281-328` | `QuickEditSheets.tsx` `QuickEditMode.tsx:588-603` | PARIDAD de códigos |
| **Notas + permisos read-only (pills)** | `QuickEditPlanView.tsx:123-159` (visibleNotes, protocolNotes, 3 pills) | `QuickEditMode.tsx:559-566` (solo `Info` + hint) | **DELTA** [u03 / 4B-03 en ejecución] |
| Reemplazos F-02 (carry-over) | `quick-edit-state.ts:34-40,238-240` | `QuickEditMode.tsx:126-181`, `nutrition-v2-quick-edit.ts:790-844` | **PARIDAD** (ambos preservan, no editan) |
| **Respaldo local del quick-edit** | `QuickEditProvider.tsx:213-251` + `QuickEditPlanView.tsx:74-98` | — (`QuickEditMode.tsx:108` "F2" diferido) | **FALTA en RN** |

### 1.5 Catálogo V2 (referencia canónica: `FoodCatalogBrowser` + `FoodDetailSheet`)

| Superficie web V2 | Archivo web | Homólogo RN | Estado |
|---|---|---|---|
| Buscador de catálogo read-only (nombre/marca, debounce 400ms, MIN 2) | `FoodCatalogBrowser.tsx:37-151` (`searchFoodCatalogHubAction`) | — (no hay pantalla de catálogo V2; solo el buscador embebido del builder vía `nutrition-v2-catalog.api.ts`) | **FALTA** como superficie del hub |
| Fila: miniatura/icono categoría, badge verificación, `MacroChipRow` | `FoodCatalogBrowser.tsx:170-231` (`foodCatalogItemToCardModel`) | — | **FALTA** |
| Paginación por cursor ("Cargar mas") | `FoodCatalogBrowser.tsx:97-111,233-243` | — | **FALTA** |
| Atribución Open Food Facts (ODbL) | `FoodCatalogBrowser.tsx:245-252` (`OPEN_FOOD_FACTS_GENERIC_ATTRIBUTION`) | — | **FALTA** (obligación de licencia) |
| **Ficha de alimento read-only** (GTIN/código de barras, micros fibra/azúcar/grasa sat/sodio, porción casera, envase, verificación, foto/icono, fuente OFF) | `FoodDetailSheet.tsx` (completo) montado en `FoodCatalogBrowser.tsx:254` | — | **FALTA por completo** |
| Estados invite (<2)/empty/error con ilustraciones | `FoodCatalogBrowser.tsx:153-168` (`NutritionStatePanel` illus `catalogo-vacio`/`sin-resultados`/`error-amable`) | — (illus `catalogo-vacio.webp` YA en assets RN) | **FALTA** el wiring |

> **Verificado**: `FoodCatalogBrowser` NO ofrece alta de alimento custom, pills de categoría, selector de
> scope (Catálogo/Mis) ni orden — esas afordancias eran de la V1 `FoodLibrary.tsx` (fuera de alcance). El
> catálogo V2 es un buscador+ficha read-only. El alta de alimento custom del coach en V2 vive en la
> **curación** (§1.6). RN ya tiene el contrato de búsqueda (`nutrition-v2-catalog.api.ts`) reusable.

### 1.6 Curación (cola de scans sin match)

| Superficie web V2 | Archivo web | Homólogo RN | Estado |
|---|---|---|---|
| Cola de códigos escaneados sin match (paginada 20, banner explicativo) | `CurationQueue.tsx:30-165` (`listMissingFoodCodesHubAction`) | — | **FALTA por completo** |
| Resolver: "Buscar existente" (picker catálogo → vincular) | `CurationQueue.tsx:279,298-406` (`resolveMissingFoodCodeHubAction`) | — | **FALTA** |
| Resolver: "Crear nuevo" (form name/marca/unidad g\|ml/macros por 100 → crear+vincular) | `CurationQueue.tsx:281,434-536` (`createCoachFoodForCurationAction`) | — | **FALTA** (aquí vive el alta de alimento custom V2) |

### 1.7 Meal-groups (grupos de comidas / `saved_meals`)

| Superficie web | Archivo web | Homólogo RN | Estado |
|---|---|---|---|
| Hub (fetch grupos, header, banner Info, buscar, botón "Grupo", lista) | `meal-groups/page.tsx:9-45` + `MealGroupLibraryClient.tsx:98-201` | `meal-groups.tsx:169-368` | EXISTE; **falta banner Info**; subtítulo distinto |
| Editor (nombre, ingredientes, totales, acciones) | `MealGroupModal.tsx:177-305` (Dialog) | `meal-groups.tsx:194-276` (inline = adaptación) | Deltas finos |
| Fila de ítem (macros, unidad, cantidad) | `MealGroupModal.tsx:233-282` | `meal-groups.tsx:218-261` | Deltas: hint "1 un ≈ Xg" falta, qty solo enteros, **macros P0-F** |
| Totales del editor / tarjeta | `MealGroupModal.tsx:287-294` / `MealGroupLibraryClient.tsx:30-48` | `meal-groups.tsx:263-270` / `:304,310-312` | Valores inflados **P0-F** |
| Validación guardar (qty > 0) | `MealGroupModal.tsx:151-154` (toast) | — (`meal-groups.tsx` no valida) | **FALTA** validación qty>0 |
| Swap de unidad basado en `serving_size` | `MealGroupModal.tsx:50-54,129-140` (`defaultQuantity`) | `meal-groups.tsx:124-135` (swap fijo 100↔1) | Delta (agrava P0-F) |
| Data layer (scope org, filtro `Internal_%`, RLS) | `_actions`/`_data` | `lib/meal-groups.ts:49-145` | Paridad de contrato + RLS |

---

## 2. Estados / gates (rollout, módulo, Pro server-side, white-label, offline)

| Aspecto | Web | RN | Veredicto |
|---|---|---|---|
| **Rollout V2 coach** | server `isNutritionV2Enabled({surface:'webCoach'})` + redirect (`nutrition-v2/page.tsx:35-42`) | `entitlements.ready && isEnabled('nutritionV2Coach')` (`index.tsx:81`; flag default `false` en `flags.ts:19`, solo Edge Config remoto abre) + StatePanel | **Ambos fail-closed**; delta de *modelo*: web hace swap, RN carece de él (P0-C) |
| **Gate de módulo / tier** | hub oculto server-side si no hay nutrición; detalle server (`page.tsx`) | tab V1 `canUseNutrition(tier)` (`nutricion.tsx:148,265`); cápsula oculta tile si `!nutritionEnabled` (`CoachMobileChrome.tsx:93`); hub V2 RN no re-chequea tier (moot por huérfano) | PARIDAD de intención; la UI no autoriza |
| **Scope de workspace (fail-closed)** | `nutritionV2CoachScopeFromWorkspace` server; RPC scoped niega 42501 fuera del pool | `nutritionV2CoachScope({kind,teamId,orgId})` con guard `workspaceReady`, no fetchea hasta resolver (`[clientId].tsx:85-113`, `index.tsx:73-79`) | **PARIDAD** (no mezcla pools) |
| **Nutrición Pro (barrera de dinero)** | recorte historial ~30 d por RPC `get_nutrition_client_detail_scoped_v2`; entitlement `hasNutritionProV2` (`page.tsx:81-84`) | mismo RPC; `entitlements.hasModule('nutrition_exchanges')` (`[clientId].tsx:97`); recorte cliente `filterHistoryDaysToBaseWindow` = defensa en profundidad | **PARIDAD** (servidor es la barrera); helper puro duplicado (P0-G, no de seguridad) |
| **Gate Pro híbrido (builder)** | card locked + badge Pro; server barrera `publishPlanAction` | `StrategyStep` lock + `UpsellSheet`; `publishDraftRN` UPGRADE_REQUIRED (`nutrition-v2-builder.ts:1120-1123`) + RPC `publish_nutrition_plan_v2` | PARIDAD de contrato; ruta CTA difiere (`/coach/subscription` vs `/coach/modules`) |
| **White-label / dark mode** | tokens EVA DS (`--theme-primary`, `--sport-*`, `surface-*`) | hub V2 + meal-groups usan tokens (`bg-surface-app`, `text-text-strong`, `theme.*`); sin acentos hardcodeados en V2 | PARIDAD; QA device pendiente |
| **Offline** | detalle sin cache offline (SSR); quick-edit `navigator.onLine` → `QE_COPY.offline`; foods/meal-groups sin cola | detalle lee cache stale + `offline=true` (`[clientId].tsx:121-133`); quick-edit `NetInfo.fetch()` (`QuickEditMode.tsx:343-348`); hub `readNutritionV2Cache`/chip `SyncOfflineState`; foods/meal-groups sin cola | Adaptaciones nativas legítimas YA construidas (sancionadas 4A); documentar |
| **Guard de salida con cambios** | `beforeunload` (builder `:1122-1130`; quick-edit `:199-207`) | quick-edit `BackHandler` (`QuickEditMode.tsx:214-220`) ✅; **builder: ninguno** | Delta: builder RN no advierte al salir |
| **Drafts locales (autosave/restaurar)** | builder + quick-edit (`nutrition-coach-draft-store`) | **ninguno** | FALTA (2 superficies) |

---

## 3. RN-extras a retirar / gatear estricto (decisión 4)

- **Editar alimento propio (RN, V1).** `nutricion.tsx:883,891,902-904,928` → `updateFood`
  (`nutrition-builder.ts:297-318`). Web V2 no permite editar alimentos. Vive en el shell V1 →
  **muere con la decisión 1** (no se porta, no se pule). Listado por completitud.
- **`StudentPreview` en el paso Revisión del builder RN** (`builder/[clientId].tsx:834-883`): "Vista del
  alumno" sin homólogo web. Retirar salvo excepción escrita del owner.
- **Eyebrow "Canary privado"** del hub V2 RN (`index.tsx:239`): copy RN-only sin homólogo web. Retirar al
  alcanzar paridad de header.
- **Copy "Sin registros en la ventana disponible."** en historial vacío del detalle
  (`[clientId].tsx:441-442`): web deja el grid vacío. Benigno; documentar (no bloqueante).
- **Botón "Nuevo grupo" en el empty-state de meal-groups** (`meal-groups.tsx:299`) y **dialog de
  confirmación de borrado** con nombre (`meal-groups.tsx:343-364`): extras benignos; el dialog es mejor que
  `window.confirm` web. Mantener salvo objeción del owner.
- **`UpsellSheet`/`ProUpsellSheet` como bottom-sheet nativo** (builder `:1049-1084`), **subtítulo offline
  "Mostrando la última copia disponible."** (`[clientId].tsx:275`), **celebraciones/cola offline**:
  adaptaciones nativas legítimas ya sancionadas; NO son extras a retirar.

---

## 4. Fuera de alcance (con razón)

- **V1 completo (decisión 1).** `apps/mobile/app/coach/(tabs)/nutricion.tsx` (shell V1: `FoodsTab`,
  `FoodForm`, `RecipesTab`, `TemplatesTab`, `ClientsTab`), `apps/mobile/app/coach/nutrition-builder.tsx`,
  `apps/mobile/lib/nutrition-builder.ts` (builder V1) — solo rollback técnico tras el flag; sin trabajo de
  paridad. **Excepción**: las queries `searchFoods`/`listCoachFoods` de `nutrition-builder.ts` las consume
  también la V2 (FoodSearchSheet del quick-edit/meal-groups y el buscador del builder V2) → el fix de scope
  org (4B-02) las toca legítimamente por el consumidor V2, no para pulir V1.
- **Recetas (decisión 3).** El `RecipesTab` RN muere con el shell V1; el hub V2 web no tiene tab de recetas
  (la biblioteca viva de recetas vive dentro del hub V1 `nutrition-plans`, que muere con la decisión 1). Sin
  unidad de recetas en 4B.
- **`/coach/recipes` web (residuo muerto).** `apps/web/src/app/coach/recipes/page.tsx:1-5` es solo
  `redirect('/coach/foods')`; `RecipeLibraryClient`/`RecipeModal`/`RecipeSearch`/`_actions/recipes.actions.ts`
  y `[recipeId]/**` están huérfanos. Modelo de datos obsoleto (macros propias, `source_api` Edamam) que no
  corresponde a la tabla viva `nutrition_recipes`. NO portar; su borrado es limpieza WEB de otra rama.
- **Página standalone `/coach/foods` web (secundaria).** `apps/web/src/app/coach/foods/page.tsx` +
  `FoodBrowser.tsx` + `AddFoodSheet.tsx`: variante más pobre del catálogo (sin ficha, sin paginación); RN ya
  redirige al hub (`apps/mobile/app/coach/foods.tsx:8-10`). No es la referencia canónica; no se replica.

---

## 5. Restricción de archivos para las waves (colisiones)

- **`app/coach/nutrition-v2/index.tsx`** — lo comparten **SWAP** (4B-04, cablea la entrada) y **HUB**
  (4B-05, header+picker+roster search/sort). NO en la misma wave → **secuenciales** (SWAP→HUB, decisión 5).
  SWAP además toca `app/coach/(tabs)/nutricion.tsx` (solo para gatearlo) y posible resolver nuevo en `lib/`.
- **`app/coach/nutrition-v2/builder/[clientId].tsx`** — monolito (~1085 líneas) que concentra F-02
  (4B-10), porciones (4B-11), permisos+guardar-catálogo+archivar-y-reemplazar (4B-12) y drafts (4B-13). Las
  **4 unidades editan el mismo archivo** → **secuenciales** (nunca dos en la misma wave). 4B-10 y 4B-12
  además tocan `nutrition-v2-builder.ts`.
- **`app/coach/nutrition-v2/[clientId].tsx`** (detalle) — lo comparten **detalle-acciones** (4B-08,
  asignar/archivar), **detalle-copy+upsell+banner-convertido** (4B-09). NO en la misma wave → secuenciales
  (sugerido 4B-08 → 4B-09). 4B-09 toca `lib/nutrition-v2-pro.ts` (copy del upsell) → colisiona con la deuda
  4B-16 si se ejecuta en paralelo; mover el fix de copy D-06 dentro de 4B-16 si ambas corren.
- **`components/nutrition-v2/quick-edit/QuickEditMode.tsx`** — lo comparten **notas+permisos** (4B-03, en
  ejecución) y **quickedit-drafts** (4B-14). Secuenciales entre sí, pero **paralelos** a las del builder y
  del detalle.
- **`app/coach/meal-groups.tsx`** — lo comparten **macros** (4B-01, en ejecución) y **editor+chrome**
  (4B-15). Secuenciales; 4B-01 además toca `lib/meal-groups.ts` (que ninguna otra unidad de la superficie
  modifica).
- **Superficies nuevas en archivos propios (paralelizables):** catálogo V2 en
  `app/coach/nutrition-v2/foods.tsx` (4B-06) y curación en `app/coach/nutrition-v2/curation.tsx` (4B-07) —
  montar como archivos separados (NO como tabs dentro de `index.tsx`) para no colisionar con SWAP/HUB. 4B-07
  depende de 4B-06 (reusa el picker/creación de food).
- **Libs compartidas:** la nueva lib de drafts RN (equivalente a `nutrition-coach-draft-store`,
  AsyncStorage) la consumen 4B-13 y 4B-14 → una unidad dueña, la otra consumidora. La consolidación de
  `nutrition-pro` puro en `@eva/nutrition-v2` (4B-16) toca `packages/*` + ambos `nutrition-pro` (web + RN) →
  deuda transversal, se abre como unidad propia / rama web.
