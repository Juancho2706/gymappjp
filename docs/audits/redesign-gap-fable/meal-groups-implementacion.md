# Grupos de comidas en el builder de nutrición — implementación

Fecha: 2026-07-02
Branch: `feat/redesign-eva-design-system`

## Principio rector (respetado)

Insertar un grupo = **expandir sus alimentos como ítems normales de la comida** (copia).
- CERO nuevas filas `template_meal_groups`.
- CERO cambios al modelo de persistencia (`nutrition_meals` / `food_items`).
- CERO cambios a la propagación de plantillas / reconcile / CASCADE de nutrición.
- El plan persistido queda **byte-idéntico** a agregar los alimentos a mano: al guardar,
  `PlanBuilder` solo envía `{ food_id, quantity, unit, swap_options }` por ítem — el objeto
  `food` del draft es solo para preview/macros. La fuente (`foods`) y el mapeo
  (`toFoodDraftShape`) son los mismos que usa el alta manual, así que el snapshot coincide.

## Archivos tocados

1. `apps/web/src/app/coach/meal-groups/_data/meal-groups.queries.ts`
   - Filtro `Internal_%` en el query (Task 3): `.not('name', 'like', 'Internal\\_%')`. Solo
     lectura; no borra filas. Oculta los artefactos `Internal_<comida>_<ts>` que crea
     `nutrition.service.ts` al duplicar/propagar planes (2 call-sites confirmados).

2. `apps/web/src/app/coach/meal-groups/_actions/meal-groups.actions.ts`
   - Nuevo server action read-only `listCoachMealGroups(coachId)` con Zod (`z.string().uuid()`).
     Reusa el query canónico `getMealGroups` (ya filtra `Internal_*`) y deriva el scope de org
     del **workspace ACTIVO server-side** (mismo patrón que `saveMealGroup`), nunca del body.
   - `saveMealGroup` NO se modificó: su shape `{ name, items: [{food_id, quantity, unit?}] }`
     ya calza con "Guardar como grupo".

3. `apps/web/src/app/coach/nutrition-plans/_components/PlanBuilder/FoodSearchDrawer.tsx`
   - Tab **Alimentos / Grupos** (SegmentedControl DS) en el search view, solo cuando
     `groupsEnabled && selectionMode === 'add-food'`.
   - Lista de grupos: nombre, N ingredientes, ~kcal + P, chips de los primeros 3 alimentos,
     botón **Insertar** (≥44px, h-11). Empty-state con `Layers` + link a `/coach/meal-groups`
     ("Creá tu primer grupo"). Loader mientras carga.
   - `handleInsertGroup`: mapea `saved_meal_items` → `FoodItemDraft[]` y llama `onInsertGroup`
     (batch). Toast de éxito. Normaliza la unidad guardada a la convención del builder
     (`mealGroupUnitToMealUnit`): 'u'/'un'/'unidad(es)' → 'un'; líquidos → 'ml'; resto → 'g'.
   - `mealGroupTotals`: mismo cálculo aprox que la biblioteca `/coach/meal-groups` (paridad de
     label "~kcal" entre ambas superficies).
   - Props nuevas (ambas opcionales, no rompen otros callers): `groupsEnabled?`, `onInsertGroup?`.

4. `apps/web/src/app/coach/nutrition-plans/_components/PlanBuilder/PlanBuilder.tsx`
   - `addFoodsToMeal(mealId, items[])`: versión batch-local de `addFoodToMeal` (mismo path de
     estado — append a `foodItems` — sin tocar el resto del reducer). Cierra el drawer.
   - `groupsEnabled={!exchangeActive}` + `onInsertGroup` cableados al drawer (guardado a
     `add-food` + `targetMealId`).
   - "Guardar como grupo" (Task 2): estado `saveGroupState` + `handleConfirmSaveGroup` que
     **reusa `saveMealGroup`** con `meal.foodItems.map({food_id, quantity, unit})`. Dialog DS
     chico (nombre prefilled con el nombre de la comida, Enter confirma). Toast
     "Grupo guardado — disponible en Grupos".
   - Narrowing seguro del retorno de `saveMealGroup` con `in` (la rama de error no trae `success`).

5. `apps/web/src/app/coach/nutrition-plans/_components/PlanBuilder/MealCanvas.tsx`
   - Pasa `onSaveMealAsGroup(mealId)` → `MealBlock.onSaveAsGroup`.

6. `apps/web/src/app/coach/nutrition-plans/_components/PlanBuilder/MealBlock.tsx`
   - Menú de acciones de la comida (DropdownMenu DS, trigger `MoreVertical` 48px = par con la
     papelera existente `size="icon"`) con ítem **"Guardar como grupo"** (`Layers`).
   - `canSaveAsGroup = !exchangeMode && meal.foodItems.length > 0` → ítem **deshabilitado** si la
     comida está vacía o en modo porciones/intercambios (Task 2 + Task 4).

## Task 4 — modo porciones/intercambios

Doble gate, sin superficie de grupos en modo intercambios:
- El tab **Grupos** requiere `groupsEnabled={!exchangeActive}` Y `selectionMode==='add-food'`.
  Además, en modo intercambios `MealBlock` no renderiza "Agregar alimento", así que el drawer
  nunca abre en `add-food` ahí.
- "Guardar como grupo" queda **deshabilitado** (`canSaveAsGroup` false) en modo porciones.

## Gotchas / hallazgos

- **Shape de `saved_meals`**: la tabla NO guarda macros; guarda `saved_meal_items(food_id,
  quantity, unit, swap_options)` + `food:foods(*)` vía FK. SÍ guarda cantidades → el round-trip
  preserva cantidad y unidad. `swap_options` de los items del grupo se ignora al insertar (un
  grupo es una plantilla de alimentos base; los swaps son concepto por-plan) → consistente con
  "ítems normales".
- **Mismatch de unidad histórico**: el modal legacy de meal-groups guarda `'g' | 'u'` mientras el
  builder usa `'g' | 'ml' | 'un'`. `mealGroupUnitToMealUnit` reconcilia al insertar. Efecto
  colateral menor (fuera de scope): si un grupo guardado desde el builder trae `'un'`/`'ml'` y se
  edita luego en el modal legacy, su toggle G/U no muestra activo (cosmético; no rompe macros ni
  persistencia).
- **Cálculo de "~kcal" en la card**: se espeja el de la biblioteca (`factor = qty` para unidades
  contables), que difiere del motor real `calculateFoodItemMacros` (`qty * serving_size / 100`)
  solo para ítems por unidad. Es un label aproximado ("~") y se priorizó la **paridad visual**
  entre el tab y la página de grupos. Los macros REALES tras insertar los computa el motor.
- **`Internal_%` escape**: se usó `'Internal\\_%'` (underscore literal, escape default de LIKE).
  Aun si el backslash no round-tripeara por PostgREST, `Internal_%` con `_` wildcard igual oculta
  todos los artefactos `Internal_...` (peor caso: mayor falso-positivo sobre nombres "Internal…",
  irrelevante para nombres reales de grupos).

## Limitaciones conocidas / fuera de scope

- **Alérgenos en inserción de grupo**: el alta manual de UN alimento pide confirmación bloqueante
  si es alergia del alumno (A3). La inserción de grupo NO valida alérgenos por-ítem (acción bulk).
  No es regresión (el alta individual sigue igual), pero es un follow-up posible si se quiere
  extender la seguridad A3 al insertar grupos.
- No se tocó `apps/mobile` (paridad RN queda como follow-up).

## Verificación

- No se corrió typecheck/build/dev (gateado por el orquestador). Verificado releyendo:
  balance de JSX en drawer/dialog/menú, firmas de props (nuevas props del drawer opcionales;
  `MealCanvas` solo lo consume `PlanBuilder`), rutas de import relativas
  (`../../../meal-groups/_actions/meal-groups.actions`), y exports usados de `dialog`/
  `dropdown-menu`/`segmented-control`.
