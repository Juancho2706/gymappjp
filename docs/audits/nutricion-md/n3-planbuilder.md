# 3. PlanBuilder: el editor de planes (plantilla y plan de alumno)

El `PlanBuilder` es el corazon del menu de Nutricion del coach. Es **un solo componente** (`apps/web/src/app/coach/nutrition-plans/_components/PlanBuilder/PlanBuilder.tsx`, `'use client'`) que se monta desde tres paginas RSC distintas (`new/page.tsx`, `[templateId]/edit/page.tsx`, `client/[clientId]/page.tsx`) y se comporta de dos maneras segun el prop `mode`. Toda la edicion es client-state local (`useState` sobre `MealDraft[]`) que solo se persiste al apretar **Guardar** (excepto la capa Pro de intercambios, que tiene su propio guardado granular en vivo).

---

## 3.1 Los dos modos del MISMO PlanBuilder

El prop discriminante es `mode: 'template' | 'client-plan'`. La firma del componente:

```
PlanBuilder({ mode, coachId, clientId, initialData, clientProfile, exchange, sectionFlags })
```

| Aspecto | `mode: 'template'` (plantilla generica) | `mode: 'client-plan'` (plan de un alumno) |
|---|---|---|
| Origen | `new/page.tsx` y `[templateId]/edit/page.tsx` | `client/[clientId]/page.tsx` |
| `clientId` | **no se pasa** (undefined) | obligatorio (UUID del alumno) |
| `clientProfile` | no aplica | `{ weight_kg, height_cm }` desde `client_intake` |
| `exchange` | siempre `null` (no se calcula en plantillas) | `ExchangeBuilderData \| null` (si el modulo Pro esta ON) |
| Capa Pro intercambios | OFF a la fuerza (`exchangeEnabled` exige `mode === 'client-plan'`) | habilitable |
| Sidebar: panel "Macros sugeridos" | oculto (exige `mode === 'client-plan'` + peso/altura) | visible si hay peso/altura |
| Sidebar: panel "Objetivos por composicion corporal" (Pro) | oculto | visible si hay peso (gating `proBodyComp`) |
| Restricciones/favoritos/alergias del alumno en el buscador | no se cargan (no hay `clientId`) | se cargan via `getClientFoodFavorites` + `getClientFoodRestrictions` |
| Server action de guardado | `upsertCoachNutritionTemplate(coachId, payload)` | `upsertClientNutritionPlanJson(coachId, clientId, payload)` |
| Tablas destino | `nutrition_plan_templates` + `template_meals` + `saved_meals` + `saved_meal_items` + `template_meal_groups` | `nutrition_plans` + `nutrition_meals` + `food_items` (+ historial + intercambios) |
| Validacion (server) | `TemplateUpsertSchema` | `ClientPlanSchema` o `ExchangesClientPlanSchema` |
| Redireccion post-guardado | `router.push('/coach/nutrition-plans')` + `router.refresh()` | igual |

La diferencia conceptual: una **plantilla** es una receta reutilizable, coach-scoped (o org-scoped), sin alumno; un **plan de alumno** es la prescripcion concreta y activa de ESE alumno, con historial, adherencia, intercambios y objetivos por composicion corporal. La capa Pro de intercambios (`nutrition_exchanges`) **solo existe en modo `client-plan`** porque requiere un `planId` real persistido (las plantillas no tienen filas en `nutrition_plans`).

### El gate de la capa Pro en `client-plan`

Aunque `mode === 'client-plan'`, la capa de intercambios solo se enciende si confluyen tres condiciones (calculadas server-side y reflejadas en el cliente):

```
const microsAdvancedVisible = sectionFlags ? sectionFlags.micros_advanced === true : !!exchange
const exchangeEnabled = !!exchange && mode === 'client-plan' && microsAdvancedVisible
const exchangeActive   = exchangeEnabled && planMode === 'exchanges'
```

- `exchange` (objeto `ExchangeBuilderData`) llega **solo** si el server determino que el modulo `nutrition_exchanges` esta ON para el workspace activo (`getHasExchangesModule`).
- `sectionFlags.micros_advanced` es la visibilidad efectiva por seccion (entitlement AND preferencia coach/team/cliente), resuelta por `resolveFeaturePrefs`. Si `sectionFlags` es ausente, hay fail-OPEN al legacy `!!exchange`.
- `planMode === 'exchanges'`: el toggle de modo del plan tiene que estar en "porciones".

`exchangeEnabled` controla si se RENDERIZA el panel de modo; `exchangeActive` controla si la UI esta en modo porciones (oculta alimentos por gramos y muestra editores de porciones). Es render-only: un plan ya guardado en modo `exchanges` conserva sus datos en DB aunque el modulo se apague; solo se oculta la superficie de edicion.

---

## 3.2 Estructura del editor (frontend funcional)

Layout en dos columnas: sidebar (`PlanBuilderSidebar`) + canvas de comidas (`MealCanvas`). Arriba del todo, si la capa Pro esta activa, el `ExchangeModePanel`. Abajo, montado siempre, el `FoodSearchDrawer` (carga `dynamic` con `Skeleton`).

### Estado local raiz (en `PlanBuilder`)

- `planName` ← `initialData?.name`
- `goals` `{ calories, protein, carbs, fats }` ← `initialData.daily_calories/protein_g/carbs_g/fats_g`
- `instructions` ← `initialData?.instructions`
- `meals: MealDraft[]` ← `initialData?.meals ?? []` (la fuente de verdad de toda la edicion)
- `searchDrawer` `{ open, targetMealId, mode: 'add-food'|'add-swap', targetFoodIndex }`
- `autoSync` (boolean, default `true`)
- Sets de preferencias del alumno: `clientFavoriteIds`, `clientAllergyIds`, `clientIntoleranceIds`, `clientDislikeIds` (se mantienen SEPARADOS para no degradar el badge)
- Estado Pro: `planMode`, `exchangeTargets`, `dayVariants`, `variantByMealId`, `exchangeSaveState` + transiciones (`isModeToggling`, `isVariantPending`, `isExchangePdfPending`) + `targetSaveTimers` (debounce de guardado de porciones)

### MealCanvas

Lista de comidas. Header "Comidas del plan" con `InfoTooltip` y boton **+ Comida** (`onAddMeal`). Si `meals.length === 0` muestra placeholder "Anade comidas y arrastra para ordenar."; si no, mapea cada `MealDraft` a un `MealBlock`. Envuelve todo en `DndContext` + `SortableContext` (a nivel de `PlanBuilder`) para reordenar comidas por drag (handle = grip). Pasa `exchangeMode` y `renderMealExtra` (un render-prop que en modo Pro inyecta el `ExchangeTargetsEditor` dentro de cada bloque).

### MealBlock (una comida)

- **Sortable** por `meal.id` (handle `GripVertical`). Mientras se arrastra, anillo `--theme-primary`.
- **Input de nombre** de la comida (`onUpdateName`).
- **Boton borrar** comida (`Trash2`, `onRemove`).
- **Select "Dia del plan"**: opciones `Todos los dias` (valor centinela `__all__` → `null`), Lunes..Domingo (`1`..`7`). Mapea label explicito (quirk de Base UI Select). Nota: dia fijo = solo ese dia de la semana en zona Santiago.
- **`extraContent`**: slot donde en modo Pro se monta el `ExchangeTargetsEditor`.
- **Alimentos** (solo si NO `exchangeMode`): `DndContext`/`SortableContext` interno por `food-item-${i}` con un `FoodItemRow` por item. Aviso naranja "Comida vacia" si `foodItems.length === 0`.
- **Nota para el alumno** (textarea opcional, `maxLength={500}`, `onUpdateNotes`; vacio → `null`).
- **Boton "Agregar alimento"** (solo si NO `exchangeMode`) → `onOpenFoodSearch`.

En `exchangeMode`, `MealBlock` oculta toda la UI de alimentos por gramos (lista, aviso de vacio y boton agregar): la comida se prescribe por porciones, no por alimentos.

### FoodItemRow (un alimento dentro de una comida)

- **Sortable** por `sortableId` (handle grip).
- Nombre del alimento + marca (`item.food.brand`).
- **Input cantidad** (`type=number`, string local `qtyStr` para permitir vaciar; en blur normaliza a `>=0`).
- **Select unidad**: `['g','un']` para solidos, `['ml','un']` para liquidos (`item.food.is_liquid`). Default `g`/`ml`. `InfoTooltip` explica g/ml proporcional a 100g vs `un` segun porcion registrada.
- **Boton "Configurar cambios"** (`ArrowLeftRight`) → `onOpenSwapSearch(idx)`: abre el drawer en modo `add-swap` para agregar alternativas de intercambio a ESTE alimento (esto es el swap por-alimento, distinto del modulo Pro de grupos de intercambio).
- Si `swapOptions.length > 0`: lista de tarjetas de alternativa, cada una con su nombre, porcion base, input de cantidad (`SwapQtyInput`), select de unidad (`swapOptionAllowedUnits`), boton quitar (`X`), y un mini-bloque de macros calculado con `calculateFoodItemMacros` (P/C/G/kcal redondeados).

### FoodSearchDrawer (buscar / crear / cantidad)

Modal portaleado a `document.body` (`createPortal`), bottom-sheet en mobile, card centrado en desktop. Tres vistas (`view`: `search` | `create` | `quantity`). Atrapa Tab + Escape (focus trap). Props clave: `coachId`, `selectionMode` (`add-food`/`add-swap`), `excludedFoodIds`, y los sets `clientFavoriteIds`/`clientAllergyIds`/`clientIntoleranceIds`/`clientDislikeIds`.

**Vista search:**
- Input de busqueda por nombre (debounce 300ms) → `searchCoachFoodLibrary(coachId, { search, pageSize: 300, page: 0 })` (server action de la libreria de alimentos).
- **Pills de categoria** (cliente-side): Todos, Proteina, Carbos, Verdura, Fruta, Grasa, Lacteo, Legumbre, Bebida, Snack, Otro. Filtra por `normalizeCategory(f.category)`.
- **Lista virtualizada** (`@tanstack/react-virtual`) con boton "Crear alimento" al final.
- **Respeto a las preferencias del alumno (solo modo client):**
  - **Favorito** (`clientFavoriteIds`): corazon relleno.
  - **Alergia** (`clientAllergyIds`): badge rojo "Alergia" + fila tinte rojo. Al elegir, intercepta con **dialogo de confirmacion bloqueante** ("Posible alergeno", botones Cancelar / "Agregar igual"); foco al Cancelar, Escape cancela. Override deliberado obligatorio.
  - **Intolerancia** (`clientIntoleranceIds`): badge ambar (aviso blando, distinto de alergia).
  - **No le gusta** (`clientDislikeIds`): badge gris (aviso blando).
  - **Ranking de afinidad** (`affinityRank`): favorito +2 (arriba), alergia -2 (abajo), intolerancia/dislike -1. Reordena la lista.
  - `excludedFoodIds`: en modo swap, excluye el alimento base y sus swaps ya agregados.

**Vista create (crear alimento inline):**
- Campos: Nombre (pre-llenado con el termino buscado), Kcal/100g (obligatorio), Proteina/Carbos/Grasas (g/100g), Unidad (`g`/`un`), Porcion ref. / Gramos por 1 un, Categoria.
- Guarda con `addCoachCustomFood(coachId, {...})` → `INSERT` en `foods` con `coach_id`. Tras crear, construye una `FoodRow` sintetica, la inyecta a `results` y salta a la vista cantidad con el alimento ya seleccionado.

**Vista quantity:**
- Resumen del alimento (kcal/porcion + P/C/G).
- Input cantidad + selector de unidad (botones g/ml + un).
- **Preview de macros** en vivo via `previewMacrosForQuantity(food, qty, unit)` (delega en `calculateFoodItemMacros`).
- Boton "Agregar a la comida" → `onConfirm({ food_id, food, quantity, unit })` (en modo `add-swap` confirma directo via `onConfirmSwapFood` al elegir, sin paso de cantidad).

### MacroCalculator (`MacroCalculator.tsx`)

No es un componente visual; exporta tres funciones puras que delegan en `@eva/nutrition-engine` (via `@/lib/nutrition-utils`, que re-exporta verbatim el motor canonico compartido con mobile):

- `totalsFromMealDrafts(meals)` — suma de macros de todos los items de todas las comidas (`reduce` + `calculateFoodItemMacros`). Es la **suma real** del plan.
- `previewMacrosForQuantity(food, quantity, unit)` — preview de un solo item (usado por el drawer).
- `toMacrosItem` (interno) — adapta `FoodItemDraft` a la forma `FoodItemForMacros` del motor.

En `PlanBuilder`, `realTotals = totalsFromMealDrafts(meals)`. Si `autoSync` esta ON, un `useEffect` copia `realTotals` redondeado a `goals`. El "objetivo" (`goals`) vs "suma real" (`realTotals`) es la dualidad central del sidebar.

### PlanBuilderSidebar (lo que controla)

- **Nombre** del plan/plantilla (label cambia segun `mode`).
- **Metas** `{kcal, Proteina, Carbos, Grasas}` con `ClampedIntInput` (max 50000 kcal / 10000 g). Toggle **Auto** (`autoSync`): si ON, las metas se derivan en vivo de los alimentos y los inputs quedan deshabilitados; si OFF, edicion manual.
- **Suma real (alimentos)** con barra de progreso (`kcalPct`) + P/C/G reales.
- **Aviso de desajuste**: si `!autoSync` y la diferencia real vs meta supera 5% en cualquier macro (`overMacroMismatch`), muestra alerta ambar con boton "Sincronizar metas con lo calculado".
- **Macros sugeridos (Mifflin-St Jeor)** — solo `client-plan` con peso+altura: panel colapsable con Edad/Genero/Actividad/Objetivo. Calcula con `computeMifflinStJeor → computeTDEE → deriveCalorieTarget → deriveMacroTargets` (todo de `@eva/nutrition-engine`). Boton "Aplicar sugerencia" copia a `goals` (y apaga autoSync).
- **Objetivos por composicion corporal (Pro)** — solo `client-plan` con peso, gated por `proBodyComp` (= `sectionFlags.goals_bodycomp`, hornea `body_composition`; fail-OPEN a `!!exchange`). Si OFF: candado + texto "Funcion Pro". Si ON: selector de formula (Katch-McArdle / Cunningham), modo de entrada (% grasa o masa magra cruda), inputs, Actividad/Objetivo, y calcula con `computeKatchMcArdle`/`computeCunningham` desde la LBM (`leanBodyMassFromBodyFat` cuando es % grasa). Boton "Aplicar sugerencia".
- **Indicaciones** (textarea, `instructions`, visible para el alumno).
- **Boton Guardar** (`onSave`, deshabilitado sin nombre o guardando).

### ExchangeModePanel + ExchangeTargetsEditor (capa Pro, resumen)

`ExchangeModePanel` (arriba del builder, solo `exchangeEnabled`): toggle modo porciones/gramos (`handleToggleExchangeMode` → `setPlanModeAction`), gestion de variantes de dia (crear/borrar), totales por variante (`dayTotalsByVariant`), aviso "provisional" si hay macros sin confirmar (`hasUnconfirmedMacros`), y descarga de PDF (compacto / equivalencias). El `ExchangeTargetsEditor` se inyecta por comida (via `renderMealExtra`): edita las porciones por grupo de intercambio de esa comida (`handleExchangeTargetsChange`, debounce 700ms → `saveMealExchangeTargetsAction`) y la variante de dia asignada (`handleMealVariantChange` → `assignMealVariantAction`). Estos guardados son **granulares y en vivo** (no esperan al boton Guardar), pero solo se persisten para comidas con id de DB real (`isPersistedMealId`: id que NO empieza con `meal-`).

---

## 3.3 plan-builder-mappers: DB ↔ modelo del editor (BACKEND)

`apps/web/src/app/coach/nutrition-plans/_data/plan-builder-mappers.ts` traduce de la forma de DB a `PlanBuilderInitialData` (de entrada). La **ida** (editor → DB) NO vive aqui: la hace `PlanBuilder.handleSave` armando `payloadMeals` y la consumen las server actions. Aqui esta la **vuelta** (DB → editor):

- `mapSavedItemsToFoodDrafts(items)` — comun a ambos modos. Filtra items sin `food` (alimento borrado del catalogo se descarta), mapea a `FoodItemDraft`:
  - `food_id`, `quantity` (Number, fallback 0), `unit` (fallback `'g'`).
  - `swapOptions`: por cada `swap_option` resuelve `is_liquid` (si `serving_unit === 'ml'` o el flag) y coacciona la unidad con `coerceSwapOptionUnit`; cantidad = `quantity ?? serving_size ?? 100`.
  - `food`: snapshot de macros + `serving_size` + `serving_unit` (fallback `'g'`).

- `mapTemplateRowToInitialData(row)` — modo plantilla. Lee `row.template_meals` ordenadas por `order_index`. Cada `template_meal` aplana sus `template_meal_groups → saved_meals → saved_meal_items` a un array plano de items (un template_meal puede tener varios saved_meals, se concatenan). `notes` ← `description`. Devuelve `id` (de DB), nombre, macros del template y comidas. **Nota arquitectonica:** las plantillas guardan los alimentos en la cadena `saved_meals`/`saved_meal_items`/`template_meal_groups`, NO directamente en filas tipo `food_items`.

- `mapClientPlanRowToInitialData(row)` — modo plan de alumno. Lee `row.nutrition_meals` ordenadas por `order_index`. Cada `nutrition_meal` tiene `food_items` directos (con join `foods`). Mapea `food` desde `fi.foods`, `swap_options` desde la columna jsonb. `notes` ← `description`. Devuelve `id` del plan, macros y comidas.

La invariante: el editor SIEMPRE trabaja con `MealDraft`/`FoodItemDraft`; la diferencia de almacenamiento (cadena saved_meals para plantillas vs food_items para planes) queda encapsulada en estos dos mappers.

---

## 3.4 Como CARGA cada modo (pages + queries)

### new/page.tsx (modo template, plan en blanco o desde org-template)

1. `getNewNutritionTemplateUser()` (`new/_data/new-template.queries.ts`): `getClaims()` local del JWT (sin `/user`), devuelve `{ id }` o `null`. Sin user → `redirect('/login')`.
2. Resuelve workspace (`getPreferredWorkspaceForRender`) → `wsOrgId`/`wsTeamId`.
3. En paralelo: `resolveNutritionDomainEnabled(...)` (master switch del dominio; OFF → `redirect('/coach/dashboard')`) y `resolveFeaturePrefs({ domain: 'nutrition', ... })` → `sectionFlags`.
4. `searchParams.org_template`: si viene, lee `coaches.active_org_id`, trae `getCoachOrgNutritionTemplates(active_org_id)`, encuentra el template y construye `initialData` con comidas SIN alimentos (ids locales `meal-<order>-<idx>`, `foodItems: []`). Si no, `initialData = null`.
5. Monta `<PlanBuilder mode="template" coachId={user.id} initialData={initialData} sectionFlags={sectionFlags} />`. No pasa `clientId`, `clientProfile` ni `exchange` → capa Pro OFF.

### [templateId]/edit/page.tsx (modo template, editar plantilla existente)

1. `getEditNutritionTemplateUser()` (mismo patron `getClaims`).
2. Workspace → `orgId`/`teamId`; mismo gate de dominio + `sectionFlags`.
3. `getCoachTemplateById(user.id, templateId, orgId)`; si no existe → `notFound()`.
4. `initialData = mapTemplateRowToInitialData(row)`.
5. `<PlanBuilder mode="template" ... initialData={initialData} sectionFlags={sectionFlags} />`. Si `sectionFlags.micros_advanced === true`, el builder muestra un aviso azul: las porciones/equivalencias se configuran al ASIGNAR a un alumno, no en la plantilla.

### client/[clientId]/page.tsx (modo client-plan, con capa Pro)

1. `getClientNutritionPlanPageAuthData(clientId)` (`client/[clientId]/_data/client-plan-page.queries.ts`): `getClaims()` → user; resuelve workspace; **scopea el alumno por workspace ACTIVO** (team → `team_id` del pool + `org_id IS NULL`; standalone → `coach_id` propio + `org_id/team_id IS NULL`; enterprise → `coach_id` + `org_id`). En paralelo trae `client_intake` (`weight_kg`, `height_cm`). Devuelve `{ user, client, intake, orgId, activeTeamId }`. Sin user → login; sin client → `notFound()`.
2. Construye `featurePrefsInput` con `coachId` (del alumno, fallback al user), `clientId`, `clientTeamId`, `clientOrgId`.
3. `resolveNutritionDomainEnabled(featurePrefsInput)`; OFF → dashboard.
4. `getClientNutritionPlan(clientId, user.id, orgId, activeTeamId)` → plan activo. `initialData = plan ? mapClientPlanRowToInitialData(plan) : null`.
5. `sectionFlags = resolveFeaturePrefs({ domain: 'nutrition', ...featurePrefsInput, planId })`. El `planId` activa pool-wins del entitlement.
6. **Bundle de intercambios** (solo si `getHasExchangesModule(user.id, scope)` es true): en paralelo `getExchangeGroups`, `getPlanExchangeBundle(planId)` (o defaults `grams` si no hay plan), `getCoachPdfBrand`; luego `getExchangeEquivalencesForGroups`. Arma `exchange: ExchangeBuilderData` con `planId`, `planMode`, `groups`, `targetsByMealId`, `variants`, `variantByMealId`, `equivalences`, `brand`, `brandLogoUrl`, `clientName`. (Brand resuelta SERVER-SIDE — el alumno jamas la elige, AC4.)
7. **Badge "editado por"**: solo en pool si `last_edited_by_coach_id` es OTRO coach → `getCoachDisplayName`.
8. **Adherencia 30d**: `getClientAdherence(clientId, planId)` si hay comidas → render del `AdherenceStrip` lateral.
9. `intake` → `clientProfile = { weight_kg, height_cm }` que alimenta los paneles de macros sugeridos y composicion corporal del sidebar.
10. Monta `<PlanBuilder mode="client-plan" coachId clientId initialData clientProfile exchange sectionFlags />`.

Dentro de `PlanBuilder`, un `useEffect` ligado a `clientId` carga las preferencias del alumno: `getClientFoodFavorites(clientId)` y `getClientFoodRestrictions(clientId)` (parte alergias/intolerancias/dislikes en tres sets). Estos viajan al `FoodSearchDrawer`.

---

## 3.5 Como GUARDA (handleSave + server actions)

`handleSave` (en `PlanBuilder`) corre validaciones de cliente y arma el payload:

1. Nombre obligatorio (`planName.trim()`); en `client-plan` exige `clientId`; al menos 1 comida; y si NO `exchangeActive`, **ninguna comida vacia** (las vacias bloquean el guardado, con aviso naranja de "Reparacion asistida"). En modo porciones (`exchangeActive`) se permiten comidas sin alimentos (se prescriben por grupos).
2. `payloadMeals = meals.map((m, i) => ({ ... order_index: i ... }))`. El **`order_index` se asigna por la posicion actual** del array (que refleja el orden tras los drags). Cada comida:
   - `id` SOLO se incluye si `exchangeActive && isPersistedMealId(m.id)` (matching por ID en modo porciones, R1). En modo gramos/plantillas se OMITE → matching por posicion byte-identical (AC1).
   - `name`, `notes ?? null`, `order_index`, `day_of_week ?? null`.
   - `foodItems`: `food_id`, `quantity`, `unit`, y `swap_options` (snapshot completo de macros + `coerceSwapOptionUnit(opt.unit, isLiquid)` + `is_liquid`).

**Modo template** → `upsertCoachNutritionTemplate(coachId, { id?, name, daily_calories, protein_g, carbs_g, fats_g, instructions, meals: payloadMeals, propagateClientIds: [] })`:
- `requireCoachNutritionScope` → workspace (standalone/team/enterprise) y `orgId`.
- Valida con `TemplateUpsertSchema`.
- `NutritionService.createOrUpdateTemplateFromJson(id, templateData, meals)`: si hay `id`, UPDATE de `nutrition_plan_templates` + **DELETE de todos los `template_meals`** y reinsercion; si no, INSERT del template. Por cada comida con alimentos crea un `saved_meals` (`Internal_<name>_<ts>`), inserta `saved_meal_items` (con `swap_options`) y enlaza via `template_meal_groups` (`order_index: 0`). Comidas sin alimentos crean `template_meals` sin grupo.
- `propagateTemplateChanges(templateId, coachId, '[]', orgId)`: con `propagateClientIds: []`, propaga solo a los alumnos que YA tienen un plan SYNCED de esa plantilla (in-place, preservando `plan_id` y por ende `daily_nutrition_logs`/`nutrition_meal_logs`). El diff usa la pure-fn `reconcileMeals` (match por `order_index`, decision log-aware: solo borra comidas SIN logs) y se aplica atomicamente por alumno via RPC `apply_nutrition_template_to_client`.
- `revalidatePath('/coach/nutrition-plans')` + `/coach/clients`.

**Modo client-plan** → `upsertClientNutritionPlanJson(coachId, clientId, { id?, name, macros, instructions, meals: payloadMeals, plan_mode: exchangeActive ? 'exchanges' : 'grams' })`:
- `requireCoachNutritionScope` → `supabase`, `orgId`, `activeTeamId`.
- **Decision de schema**: si `plan_mode === 'exchanges'` Y hay `id`, hace un probe a `nutrition_plans.plan_mode` para CONFIRMAR en DB que el plan esta en `exchanges` (no confia en el cliente) → `allowEmptyMeals = true` → valida con `ExchangesClientPlanSchema` (permite comidas sin alimentos); si no, `ClientPlanSchema`. **El payload NO escribe `plan_mode`** (eso lo hace `setPlanModeAction`).
- Verifica pertenencia del alumno por workspace (team/standalone/enterprise).
- `planData`: `client_id`, `coach_id`, `org_id`, macros, `is_active: true`, `is_custom: true`, `last_edited_by_coach_id: coachId`.
- **Si hay `id` (update):**
  1. Snapshot a `nutrition_plan_history` (`fetchClientPlanSnapshotPayload`, source `'auto_before_save'`, label fecha) — versionado automatico antes de cada guardado.
  2. UPDATE de `nutrition_plans` (scoped por team o coach/org).
  3. Trae `nutrition_meals` existentes (id, order_index, day_of_week, description).
  4. **Reconciliacion segun modo:**
     - **Modo exchanges (`allowEmptyMeals`):** `reconcileMealsById(existingIds, sorted.map(dbId))` — matchea por **ID de DB** (el builder lo envia), NUNCA por posicion. Esto evita que `meal_exchange_targets` y `nutrition_meals.day_variant_id` (pegados al row id) se barajen al reordenar/borrar. `toDelete` → borra `food_items` + `nutrition_meals`; `toUpdate` → UPDATE in-place por id + reemplazo de `food_items`; `toInsert` → INSERT de comida + `food_items`.
     - **Modo gramos:** matching por `order_index` (mapa `existingByIndex`). Borra solo comidas cuya posicion ya no existe; UPDATE in-place de las que coinciden (preserva meal id → `nutrition_meal_logs` sobreviven); INSERT de las nuevas. En ambos casos los `food_items` se borran y reinsertan por comida.
- **Si NO hay `id` (insert):** desactiva planes activos del alumno (`is_active: false`), inserta `nutrition_plans`, e inserta comidas + `food_items` en orden.
- `revalidateClientNutritionPaths(coachId, clientId)` (revalida `/coach/clients/<id>` y `/c/<slug>/nutrition`) + `/coach/nutrition-plans`.

**Invariantes de seguridad de datos al guardar:**
- Las comidas se UPDATEan in-place (no delete+insert global) para conservar `nutrition_meal_logs` (relacion `meal_id → nutrition_meals(id)` es `ON DELETE CASCADE`: borrar una comida con historial destruye la adherencia del alumno).
- En modo porciones el match va por ID, no por posicion, para no corromper la prescripcion de intercambios.
- `last_edited_by_coach_id` registra el ultimo editor (awareness en pools de team).
- El gate de scope (team/standalone/enterprise) se reaplica en CADA query del save; nunca se confia en `clientId`/`org_id` del body para mover scope.

> Draft vacio: `createEmptyClientNutritionPlan(coachId, clientId)` crea un plan activo con 0 comidas (idempotente: reusa el plan activo si existe) para abrir el editor con un `planId` real desde el arranque — necesario porque el modo Porciones exige un plan persistido. Un plan con 0 comidas se trata como "sin plan" tanto en el board del coach como en la app del alumno, asi que un draft abandonado no le muestra un plan vacio al alumno.

---

## 3.6 Bifurcacion EJEMPLO a fondo

### Camino A: tap Nutricion → Nuevo → PlanBuilder modo template

1. El coach navega a `/coach/nutrition-plans/new`.
2. `new/page.tsx` autentica (`getClaims`), resuelve workspace, chequea dominio nutricion ON y resuelve `sectionFlags`. Sin `org_template`, `initialData = null`.
3. Monta `<PlanBuilder mode="template" coachId initialData={null} sectionFlags />`. **No** hay `clientId`, `clientProfile` ni `exchange`.
4. Consecuencias en el editor:
   - `exchangeEnabled = false` (porque `mode !== 'client-plan'` y `exchange === null`) → no hay `ExchangeModePanel` ni editores de porciones.
   - El `useEffect` de preferencias del alumno NO corre (sin `clientId`) → el `FoodSearchDrawer` no muestra badges de favorito/alergia/intolerancia/dislike ni el dialogo de alergeno.
   - El sidebar NO muestra "Macros sugeridos" ni "Objetivos por composicion corporal" (ambos exigen `mode === 'client-plan'` + peso).
   - Si `sectionFlags.micros_advanced === true`, el builder muestra el aviso azul de que porciones/equivalencias se configuran al asignar a un alumno.
5. El coach agrega comidas, busca/crea alimentos, define macros (Auto o manual) e indicaciones. Al Guardar → `upsertCoachNutritionTemplate`. La plantilla se persiste en la cadena `nutrition_plan_templates` → `template_meals` → `saved_meals`/`saved_meal_items` → `template_meal_groups`, y propaga in-place a alumnos ya sincronizados.

### Camino B: editar plan de alumno → modo client-plan con Pro

1. El coach abre `/coach/nutrition-plans/client/<clientId>`.
2. `client/[clientId]/page.tsx` autentica, scopea el alumno por workspace, trae `client_intake` (peso/altura), el plan activo, `sectionFlags` (con `planId`), y — si `getHasExchangesModule` es true — el bundle de intercambios (`groups`, `targetsByMealId`, `variants`, `variantByMealId`, `equivalences`, `brand`).
3. Monta `<PlanBuilder mode="client-plan" coachId clientId initialData clientProfile exchange sectionFlags />`.
4. Consecuencias en el editor:
   - El `useEffect` de `clientId` carga favoritos + restricciones → el `FoodSearchDrawer` muestra badges y el dialogo bloqueante de alergeno; reordena por afinidad.
   - El sidebar muestra "Macros sugeridos (Mifflin-St Jeor)" (peso+altura) y, si `proBodyComp` (= `sectionFlags.goals_bodycomp`), el panel Pro "Objetivos por composicion corporal" (Katch-McArdle/Cunningham).
   - Si `exchange` llego Y `micros_advanced` esta ON → `exchangeEnabled = true` → se renderiza el `ExchangeModePanel`. Si el coach activa el modo porciones (`exchangeActive`): `autoSync` se fuerza a OFF (las metas son el requerimiento de la nutri, no se autosincronizan con los gramos), `MealBlock` oculta los alimentos por gramos y monta el `ExchangeTargetsEditor` por comida (porciones por grupo + variante de dia), y los totales del sidebar pasan a derivarse de los targets (`dayTotalsByVariant`).
   - Los cambios de porciones/variantes se guardan en vivo (debounce / transicion) via `saveMealExchangeTargetsAction` / `assignMealVariantAction`, independientes del boton Guardar. El toggle de modo persiste con `setPlanModeAction`.
5. Al Guardar → `upsertClientNutritionPlanJson` con `plan_mode` reflejando `exchangeActive`. Se versiona en `nutrition_plan_history`, se reconcilia por ID (modo porciones) o por posicion (modo gramos) preservando `nutrition_meal_logs`, y se persiste en `nutrition_plans` → `nutrition_meals` → `food_items`.

**La diferencia de fondo:** el Camino A produce un objeto reutilizable y abstracto (sin alumno, sin historial, sin intercambios, almacenado en la cadena de plantillas). El Camino B edita la prescripcion concreta y viva de un alumno (con peso/altura para sugerencias, historial automatico, adherencia, capa Pro de intercambios con guardado granular, awareness de pool y revalidacion de la app del alumno). El mismo componente cambia de cara enteramente segun `mode` y la presencia de `clientId`/`clientProfile`/`exchange`/`sectionFlags`.
