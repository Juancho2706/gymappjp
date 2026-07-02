# 2. Comidas del dia: registro, porciones, intercambio de alimentos y off-plan

Esta seccion documenta el corazon del registro diario del alumno en `/c/[coach_slug]/nutrition`. Todo lo que el alumno marca, ajusta, intercambia o registra fuera de plan vive aqui. El enfasis es **backend**: que datos llegan, como se calculan los macros consumidos y la adherencia, como se persiste cada interaccion y como funciona la cola offline.

---

## 2.0 Arquitectura general del registro (data flow)

El registro de comidas se reparte entre dos sistemas paralelos que conviven en la misma pantalla:

1. **Plan del coach (comidas planificadas):** el alumno marca comidas como completas, ajusta porcion, da satisfaccion, intercambia alimentos. Persiste en `nutrition_meal_logs`, `nutrition_meal_food_swaps`, `client_food_preferences`. Orquestado por `nutrition.actions.ts`.
2. **Off-plan (lo que comio fuera del plan):** el alumno busca en el catalogo y registra algo extra. Persiste en `nutrition_intake_entries`. Orquestado por `intake.actions.ts` + `NutritionIntakeService`.

> Importante: los dos sistemas **NO se suman entre si** en los anillos de macros (`MacroRingSummary`). Los anillos solo reflejan el plan (comidas completadas + porcion). El off-plan se guarda como bitacora para el coach, pero `consumed` en los anillos NO incluye `nutrition_intake_entries` (ver §6 y §8, gap critico).

**Cadena de capas (pilar Clean Architecture):**

- Presentacion: `NutritionShell.tsx` (cliente, orquesta estado optimista) → `MealCard` / `MealIngredientRow` / `MacroRingSummary` / `PlatePanel` / `OffPlanLogger`.
- Server actions: `nutrition.actions.ts` (plan) + `intake.actions.ts` (off-plan).
- Servicios: `NutritionIntakeService` (off-plan). El plan NO tiene service dedicado: `nutrition.actions.ts` habla Supabase directo (excepcion al pilar — ver §8).
- Motor puro: `@eva/nutrition-engine` (re-exportado por `@/lib/nutrition-utils`) — toda la matematica de macros, swaps, porciones, household.
- Datos (queries): `intake.queries.ts` (off-plan), `nutrition.queries.ts` (plan + adherencia, fuera de scope de esta seccion pero alimenta el shell).

---

## 2.1 MealCard — la tarjeta de comida

Archivo: `apps/web/src/app/c/[coach_slug]/nutrition/_components/MealCard.tsx`. Cliente (`'use client'`).

### 2.1.1 Datos que recibe (props, interface `Props`)

| Prop | Tipo | Origen / significado |
|------|------|----------------------|
| `meal` | `MealCardMeal` (`id`, `name`, `description`, `food_items: FoodItemForMacros[]`) | Comida del plan, ya con swaps aplicados y normalizada en `NutritionShell` via `toMealCardMeal` → `normalizeMealForMacros` |
| `isCompleted` | `boolean` | `optimisticCompletions[meal.id]` del shell (estado optimista) |
| `partialPlanPct` | `number \| null` | `null` = modo binario 100%; `0–100` = % explicito de macros del plan. Viene de `optimisticPartialPct[meal.id]` |
| `isToday` | `boolean` | `selectedDate === today`. Si es dia historico, todo es solo-lectura |
| `isPending` | `boolean` | Cualquier transicion en vuelo en el shell (toggle/portion/satisfaction/swap/pdf/date) |
| `onToggle` | `(mealId, current) => void` | Handler de marcado completo/incompleto |
| `onPartialPlanPctChange` | `(mealId, pct \| null) => void` | Handler de ajuste de porcion |
| `satisfactionScore` | `1 \| 2 \| 3 \| null` | Score de satisfaccion persistido |
| `onSatisfactionChange` | `(mealId, score \| null) => void` | Handler de satisfaccion. Solo se pasa si `isToday` |
| `favoriteFoodIds` | `Set<string>` | IDs de alimentos favoritos del alumno (para el corazon en `MealIngredientRow`) |
| `onToggleFoodFavorite` | `(foodId) => void` | Handler de favorito |
| `onApplyFoodSwap` | `(mealId, originalFoodId, swappedFoodId) => void` | Handler de intercambio. Solo si `isToday` |
| `activeSwaps` | `Map<string, string>` | Mapa `mealId:foodId → swapped_food_id` para marcar la alternativa "Activo" |
| `macroOverride` | `{calories, protein, carbs, fats} \| null` | Modulo `nutrition_exchanges` (Nutricion Pro): macros derivados de porciones cuando la comida no tiene alimentos sino targets de intercambio |
| `exchangeContent` | `React.ReactNode` | Chips de codigos de intercambio ("2C · 1LAC") + nombre de variante, renderizados bajo los macros |

### 2.1.2 Calculo de macros mostrados en la tarjeta

- `mealMacros = macroOverride ?? sumMealMacros(meal)`.
  - Si hay `macroOverride` (Nutricion Pro / intercambios), usa esos valores.
  - Si no, suma los macros de todos los `food_items` via `sumMealMacros` (motor puro), que internamente llama `calculateFoodItemMacros` por item.
- `macroScale = partialPlanPct != null ? partialPlanPct / 100 : 1`. Es el multiplicador visual de porcion.
- La cabecera muestra `Math.round(mealMacros.calories * macroScale)` kcal, y si esta completa con `partialPlanPct < 100`, agrega el badge `(NN%)`.
- Los tres macros (P/C/G) se muestran tambien escalados: `Math.round(mealMacros.protein * macroScale)`, etc.

> Detalle backend del motor: `calculateFoodItemMacros` (`packages/nutrition-engine/macros.ts`) calcula el factor segun unidad:
> - `'g'` / `'ml'` → `factor = quantity / 100` (macros en BD son por 100g/ml).
> - `'un'` (contable) → `factor = (quantity × serving_size) / 100`.
> - Redondea a 1 decimal: `Math.round(valor * factor * 10) / 10`.
> Ejemplo del codigo: aceite 15 ml → `factor = 0.15` → grasas 15g (no 210g como hacia el bug legacy con serving_size).

### 2.1.3 Interaccion: expandir / colapsar

- Estado local `isExpanded` (`useState(false)`). Toggle al hacer click en la cabecera (`onClick={() => setIsExpanded(v => !v)}`).
- **No persiste** — es UI pura, vuelve a colapsado en cada render fresco.
- Expandido revela: lista de `MealIngredientRow` (alimentos), panel "Porcion del plan" (si `isToday && isCompleted`), panel "¿Como estuvo?" (satisfaccion, si `isCompleted`).

### 2.1.4 Interaccion: marcar comida COMPLETA / incompleta

- Boton circular (checkmark). `handleToggle`:
  - Guard: si `!isToday || isPending` → no hace nada.
  - Vibracion haptica: `navigator.vibrate(50)` si existe.
  - Llama `onToggle(meal.id, isCompleted)` (el shell calcula `next = !current`).
- **Persistencia (backend):** ver §2.7.1 (`toggleMealCompletion`). Escribe en `nutrition_meal_logs`.
- **Optimista:** el shell aplica `setOptimisticCompletion({ mealId, isCompleted: next })` ANTES del round-trip. Si falla, recarga el log real con `fetchLogForDate`.

### 2.1.5 Interaccion: ajuste de PORCION del plan (-25/50/75/100% o "Plan completo")

Panel "Porcion del plan", visible solo cuando `isToday && isCompleted && onPartialPlanPctChange`.

- Botones: `25`, `50`, `75`, `100` (porcentaje explicito) y **"Plan completo"** (envia `null`).
- Cada boton llama `onPartialPlanPctChange(meal.id, pct)` con `pct ∈ {25,50,75,100}` o `null`.
- **Semantica de `null` vs `100`:**
  - `null` (Plan completo) = modo binario, usa 100% de los macros del plan (comportamiento legacy). NO escribe `consumed_quantity`.
  - `100` = porcentaje explicito 100% (se persiste `consumed_quantity = 100`).
  - Visualmente equivalentes en macros (×1.0), pero distintos en BD: `null` borra el ajuste, `100` lo guarda como ajuste explicito.
- **Recalculo de macros consumidos:** el shell convierte el mapa de porciones (`optimisticPartialPct`) en `portionMapForMacros` (`Map<mealId, pct>`) y lo pasa a `calculateConsumedMacrosWithCompletionFallback`. El motor multiplica los macros de cada comida completada por `mealConsumedPortionMultiplier`:
  - Sin clave en el mapa → multiplicador `1` (100%).
  - Con clave → `Math.min(Math.max(pct/100, 0), 1)` (clamp 0–1).
- Texto de ayuda: «Plan completo» usa el 100% de macros del plan (igual que antes). Ajusta % si comiste menos.

> **Gotcha de semantica:** el campo `consumed_quantity` en `nutrition_meal_logs` se reutiliza como **porcentaje** (0–100), no como cantidad en gramos. El nombre de columna es engañoso. Al desmarcar la comida (`is_completed=false`), `toggleMealCompletion` pone `consumed_quantity: null` (resetea el ajuste de porcion).

### 2.1.6 Interaccion: SATISFACCION (emojis al coach)

Panel "¿Como estuvo?", visible cuando `isCompleted && onSatisfactionChange`.

- Tres botones de emoji (`SATISFACTION`):
  - `1` → 😕 "No me gusto"
  - `2` → 😐 "Regular"
  - `3` → 😋 "Muy rico"
- Toggle: si ya esta seleccionado ese score, vuelve a `null` (`satisfactionScore === score ? null : score`).
- Tooltip: "Tu coach puede ver este feedback para ajustar tu plan. Es opcional."
- **Persistencia:** ver §2.7.4 (`updateMealSatisfaction`). Escribe `satisfaction_score` en `nutrition_meal_logs`.
- El panel solo se pasa `onSatisfactionChange` cuando `isToday` (en el shell: `onSatisfactionChange={isToday ? handleSatisfactionChange : undefined}`), asi que en dias historicos los emojis se ven pero NO son editables.

### 2.1.7 Caso especial: comida sin alimentos

Si `meal.food_items.length === 0` y NO hay `exchangeContent`, muestra "Esta comida no tiene alimentos especificados". En ese caso `sumMealMacros` da todo cero, y el shell cae al **fallback de adherencia por completitud** (ver §2.6.2).

---

## 2.2 MealIngredientRow — alimentos de la comida y opciones de cambio (swap)

Archivo: `apps/web/src/app/c/[coach_slug]/nutrition/_components/MealIngredientRow.tsx`. Cliente.

### 2.2.1 Datos que recibe

| Prop | Tipo | Significado |
|------|------|-------------|
| `item` | `FoodItemForMacros` | El alimento (cantidad, unidad, `foods{}`, `swap_options[]`) |
| `isFavorite` | `boolean` | Si el `foods.id` esta en `favoriteFoodIds` |
| `onToggleFavorite` | `(foodId) => void` | Handler del corazon |
| `mealId` | `string` | Para construir la clave del swap |
| `activeSwapFoodId` | `string` | El `swapped_food_id` activo para este `mealId:foodId` (desde `activeSwaps`) |
| `onApplySwap` | `(mealId, originalFoodId, swappedFoodId) => void` | Handler de aplicar alternativa |

### 2.2.2 Como se muestra el alimento

- `macros = calculateFoodItemMacros(item)` — macros del alimento individual (motor puro).
- `resolvedUnit = item.unit || (item.quantity < 10 ? 'un' : 'g')` — fallback heuristico de unidad.
- `displayQty`: si unidad `'g'`, usa `gramsToHousehold(item.foods, item.quantity)` que rotula la masa con su equivalente casero ("120 g (1 taza)") si el alimento tiene `household_grams` + `household_label`; si no, degrada a "120 g". Para `'un'`/`'ml'` muestra la cantidad cruda.
  - `gramsToHousehold` (`packages/nutrition-engine/micros.ts`): calcula `count = grams / household_grams`, formatea con fracciones comunes (½, ⅓, ¼, ¾) o pluraliza el label (es-latam: vocal→+s, consonante→+es).
- Muestra P/C/G redondeados y kcal con icono Flame.

### 2.2.3 Corazon (favorito)

- Solo si hay `foodId && onToggleFavorite`. Click → `onToggleFavorite(foodId)`.
- **Persistencia:** ver §2.7.5 (`toggleClientFoodPreference`) → `client_food_preferences`.

### 2.2.4 Opciones de cambio / swap dejadas por el coach

- Visible solo si `swapOptions = item.swap_options ?? []` tiene elementos. Boton (icono ArrowLeftRight) abre/cierra `showSwaps` (estado local).
- Tooltip: "Tu coach dejo opciones de cambio para este alimento. Elige una y pulsa Aplicar."
- **Las opciones de swap las define el COACH** en `food_items.swap_options` (JSON). El alumno NO crea swaps, solo elige uno de los pre-aprobados.

**Preview de macros de cada alternativa (calculo en el cliente):**

- `isLiquid = swapOptionIsLiquid(f)` — true si `serving_unit === 'ml'` o `is_liquid === true`.
- `coachQty`: si `f.quantity` es finito y > 0 lo usa; si no, cae a `item.quantity`.
- `coachUnit = coerceSwapOptionUnit(f.unit ?? item.unit, isLiquid)` — fuerza a una unidad permitida (`g|un` para solidos, `ml|un` para liquidos).
- `previewMacros = calculateFoodItemMacros({ quantity: coachQty, unit: coachUnit, foods: {...f} })` — preview con los datos nutricionales de la alternativa.
- Muestra P/C/G/kcal de la alternativa + "Porcion del coach: {coachQty} {coachUnit}".
- Badge "Activo" si `activeSwapFoodId === f.food_id`.

### 2.2.5 Aplicar alternativa

- Boton "Aplicar" (solo si `mealId && foodId && onApplySwap`). Click → `onApplySwap(mealId, foodId, f.food_id)`.
- **Persistencia:** ver §2.7.3 (`applyMealFoodSwap`) → tabla `nutrition_meal_food_swaps`.
- **La cantidad/unidad del swap NO la elige el alumno** — se resuelve server-side desde las `swap_options` del coach via `resolveCoachSwapPortionFromSwapOptions`. El alumno solo elige y aplica.

---

## 2.3 MacroRingSummary — anillos de macros del dia

Archivo: `apps/web/src/app/c/[coach_slug]/nutrition/_components/MacroRingSummary.tsx`. Cliente.

### 2.3.1 Datos que recibe

```
calories: { consumed: number; target: number }
protein:  { consumed: number; target: number }
carbs:    { consumed: number; target: number }
fats:     { consumed: number; target: number }
isReadOnly?: boolean   // true en dias historicos
```

### 2.3.2 De donde viene cada numero

En `NutritionShell`:

- **`target`** (objetivo): viene de `goals` = `{ calories: plan.daily_calories, protein: plan.protein_g, carbs: plan.carbs_g, fats: plan.fats_g }` (campos del `nutrition_plans`).
- **`consumed`** (consumido): de `calculateConsumedMacrosWithCompletionFallback(mealsForMacros, completedIds, goals, portionMapForMacros)`:
  - `mealsForMacros` = comidas visibles del dia con swaps aplicados, normalizadas.
  - `completedIds` = set de `meal.id` cuyo `optimisticCompletions[id]` es true.
  - `portionMapForMacros` = mapa de % por comida (ajuste de porcion).
  - **Calculo (motor puro):** suma los macros de cada comida completada × multiplicador de porcion. Si NINGUNA comida tiene data de macros (`hasAnyMealMacroData` false), cae al **fallback proporcional**: `goals × (suma de multiplicadores de completadas / total de comidas)`.

> El anillo refleja SOLO el plan del coach. El off-plan (`nutrition_intake_entries`) NO se suma aqui — gap conocido (ver §6 y §8).

### 2.3.3 Que muestra

- **Energia diaria (barra superior):** kcal consumidas (count-up animado) `/ target kcal`, mas porcentaje grande. `calPct = min((consumed/target)*100, 100)`. Si `calOver` (consumed > target), barra y % en rojo.
- **3 anillos (Proteina / Carbos / Grasas):** cada `MacroRing`:
  - `pct = target > 0 ? min(consumed/target, 1.1) : 0`.
  - `over = consumed > target && target > 0` → muestra icono AlertTriangle en vez del numero, anillo en `stroke-destructive`.
  - Centro: count-up del valor consumido. Pie: `/ {target}g`.
  - ARIA: `macroRingAriaLabel` (exportado para tests) genera la etiqueta accesible.
- Cuando `isReadOnly` (dia historico), el header dice "Energia · Solo lectura" y baja opacidad.

> Todos los numeros se redondean para display. El calculo subyacente es float (motor redondea a 1 decimal por item).

---

## 2.4 PlatePanel — el "metodo del plato"

Archivo: `apps/web/src/app/c/[coach_slug]/nutrition/_components/PlatePanel.tsx`. Cliente. Tier base. **Presentacional puro.**

- Es una **guia proporcional** (como dividir el plato: verduras / proteina / carbohidrato), NO un indicador de "meta cumplida".
- Recibe `proportion: PlateProportion` (`{veg, protein, carb}` cada uno 0..1, suman ~1) y la pasa a `ProportionPlate` (`@/components/nutrition/ProportionPlate`).
- Tooltip: "Es una guia proporcional: como dividir el plato, no cantidades absolutas ni una meta cumplida."

### 2.4.1 De donde sale la proporcion (backend)

En `page.tsx`: `plateProportion = platePropFromMacros(plan.protein_g ?? 0, plan.carbs_g ?? 0)`.

`platePropFromMacros` (`sections.queries.ts`, funcion PURA):

- Verduras fijas en `VEG = 0.5` (~mitad del plato, guia MINSAL).
- El otro 50% se reparte entre proteina y carbohidrato segun su peso relativo en gramos: `protein = rest × (p / (p+c))`, `carb = rest × (c / (p+c))`.
- Si no hay macros (`denom <= 0`), cae a plato balanceado 50/25/25.

- Se renderiza solo si `sectionFlags.plate && plateProportion` (gating por feature-prefs).

---

## 2.5 OffPlanLogger — registrar comida FUERA DEL PLAN

Archivo: `apps/web/src/app/c/[coach_slug]/nutrition/_components/OffPlanLogger.tsx`. Cliente. Tier base.

### 2.5.1 Que es y cuando aparece

- Boton "Registrar algo mas" que abre un bottom-sheet (dialog modal). Permite registrar algo que el alumno comio que NO esta en el plan.
- En el shell se renderiza solo si `sectionFlags.off_plan_log && isToday` (solo el dia de hoy, gateado por feature-prefs).

### 2.5.2 Datos que recibe

| Prop | Significado |
|------|-------------|
| `recents` | `{id, name}[]` — alimentos del catalogo usados recientemente (quick-add). Vienen de `getRecentIntakeFoods(10)` |
| `coachSlug` | Para revalidar paths |
| `today` | Fecha YYYY-MM-DD a la que se imputa el registro |

### 2.5.3 Busqueda del catalogo (backend / query directo del cliente)

- Input con debounce de 300 ms (`SEARCH_DEBOUNCE_MS`), minimo 2 caracteres (`SEARCH_MIN_CHARS`).
- **Query directo desde el cliente** (excepcion: aqui SI se usa `createClient()` del navegador, no server action):
  ```
  supabase.from('foods')
    .select('id, name, brand, serving_size, serving_unit, is_liquid')
    .ilike('name_search', '%term%')
    .order('name')
    .limit(30)
  ```
- RLS de `foods`: el alumno ve catalogo global + el del coach propio. Por eso el query directo es seguro (RLS hace cumplir el scope).
- Se cancela la peticion previa (`cancelled` flag) si el termino cambia.

### 2.5.4 Recientes (quick-add)

- Chips de `recents` mostrados solo cuando no hay busqueda activa (`trimmed.length < 2`). Click → `logFood(id, name)`.

### 2.5.5 Que persiste al registrar (backend)

`logFood(foodId, name)`:

- Unidad fija `SEARCH_UNIT = 'g'`, cantidad fija `DEFAULT_QUANTITY = 100`.
- Llama `addIntakeEntryAction({ coachSlug, logDate: today, foodId, quantity: 100, unit: 'g', source: 'manual' })`.
- Toast de exito/error. Cierra el sheet en exito (dentro de `startTransition`).

> **Limitacion de diseño:** el alumno NO puede ajustar cantidad ni unidad en off-plan — siempre se registra 100 g, source `'manual'`. Tampoco hay registro por nombre libre (`customName`) desde esta UI, aunque el action lo soporta. Ver §6.

---

## 2.6 Calculo de macros consumidos y adherencia (backend / motor)

### 2.6.1 Macros consumidos del dia

Funcion canonica: `calculateConsumedMacrosWithCompletionFallback` (`packages/nutrition-engine/macros.ts`), invocada en `NutritionShell` (memo `consumed`).

Pipeline:

1. `calculateConsumedMacros(meals, completedMealIds, portionPctByMealId)`:
   - Filtra comidas en `completedMealIds`.
   - Por cada una: `mult = mealConsumedPortionMultiplier(meal.id, portionPctByMealId)`, suma `sumMealMacros(meal) × mult`.
2. Si `hasAnyMealMacroData(meals)` → devuelve esa suma directa.
3. **Fallback por completitud** (si NINGUNA comida tiene macros, p.ej. plan sin alimentos detallados):
   - `weighted = Σ multiplicadores de comidas completadas`.
   - `ratio = clamp(weighted / totalMeals, 0, 1)`.
   - Devuelve `goals × ratio` (proporcional a las metas del plan).

> Este fallback es la razon por la que un plan "vacio" (comidas sin alimentos) igual mueve los anillos al marcar comidas: usa las metas globales prorrateadas por # de comidas completadas.

### 2.6.2 Multiplicador de porcion

`mealConsumedPortionMultiplier(mealId, map)`:
- Sin clave → `1` (100%, modo binario).
- Con clave → `clamp(pct/100, 0, 1)`.

El shell construye el mapa server-side desde `mealLogs`: `serverPartialPct` solo incluye comidas con `is_completed && consumed_quantity != null`. Luego `useOptimistic` (`optimisticPartialPct`) lo combina con cambios optimistas.

### 2.6.3 Adherencia (fechas con comida completada)

En el shell, `adherenceDates`: por cada dia de `adherenceEffective` (de `getNutritionAdherence30d`), marca el dia si algun `nutrition_meal_logs.is_completed` corresponde a una comida aplicable ese dia (`nutritionMealAppliesOnIsoYmdInSantiago` filtra por `day_of_week`). Alimenta el `DayNavigator`, `NutritionStreakBanner`, `AdherenceStrip`.

### 2.6.4 Filtro de comidas por dia de la semana

`mealsVisible = mealsSorted.filter(m => nutritionMealAppliesOnIsoYmdInSantiago(m, selectedDate))`. Una comida con `day_of_week` fijado solo aplica ese dia. El shell avisa si hay comidas ocultas: "Hoy ves N de M comidas del plan...".

### 2.6.5 Aplicacion de swaps a los macros (backend en cliente)

`mealsVisibleWithSwaps`: para cada comida, construye `swapFoodsByOriginal` (Map `originalFoodId → {swappedFood, swappedQuantity, swappedUnit}`) buscando en `mealSwapLogs` (`nutrition_meal_food_swaps` del log del dia) y casando con la `swap_option` correspondiente. Luego `applyMealFoodSwaps(normalized, map)` (motor puro) reemplaza `foods`, `quantity`, `unit` del item. Asi los anillos y las tarjetas reflejan el alimento intercambiado, no el original.

---

## 2.7 intake.actions + nutrition.actions — server actions (ENFASIS BACKEND)

### 2.7.0 Resumen de tablas escritas

| Interaccion | Action | Tabla | Operacion |
|-------------|--------|-------|-----------|
| Marcar comida completa | `toggleMealCompletion` | `nutrition_meal_logs` (+`daily_nutrition_logs`) | insert/update |
| Ajustar porcion | `updateMealConsumedPortion` | `nutrition_meal_logs.consumed_quantity` | update |
| Satisfaccion | `updateMealSatisfaction` | `nutrition_meal_logs.satisfaction_score` | update |
| Aplicar swap | `applyMealFoodSwap` | `nutrition_meal_food_swaps` | upsert |
| Favorito alimento | `toggleClientFoodPreference` | `client_food_preferences` | insert/update/delete |
| Off-plan agregar | `addIntakeEntryAction` | `nutrition_intake_entries` | insert (via service) |
| Off-plan borrar | `deleteIntakeEntryAction` | `nutrition_intake_entries` | delete (via service) |

> **Patron de autorizacion comun:** todas las actions del plan (`nutrition.actions.ts`) usan `supabase.auth.getUser()` y verifican `user.id === clientId`. Las de intake (`intake.actions.ts`) derivan el `clientId` de la sesion via `resolveAuthedClientId` (getUser → tabla `clients`), NUNCA del body. RLS es la segunda capa.

### 2.7.1 `toggleMealCompletion` (nutrition.actions.ts)

Firma: `(clientId, planId, mealId, isCompleted, existingLogId, coachSlug, targetDate)`.

Pasos backend:
1. `getUser()` y verifica `user.id === clientId`.
2. Resuelve `dailyLogId`: si no viene `existingLogId`, llama `getOrCreateDailyNutritionLogId`.
   - **`getOrCreateDailyNutritionLogId`:** busca `daily_nutrition_logs` por `(client_id, plan_id, log_date)`; si no existe, lee el plan (`name`, macros) y hace **upsert idempotente** con `onConflict: 'client_id,plan_id,log_date'` (snapshot de metas: `plan_name_at_log`, `target_*_at_log`). El upsert evita el `23505` de dos toggles casi simultaneos en un dia nuevo.
3. Busca `nutrition_meal_logs` por `(daily_log_id, meal_id)`:
   - Si existe: update → `is_completed: true` o `{is_completed: false, consumed_quantity: null}` (desmarcar resetea la porcion).
   - Si no existe: insert `{daily_log_id, meal_id, is_completed}`.
4. `revalidatePath` de `/c/{slug}/nutrition` y `/c/{slug}/dashboard`.
5. Retorna `{success, logId}`.

**Optimista en el shell (`handleToggle`):** aplica `setOptimisticCompletion` antes; confetti chico (`canvas-confetti`) al completar la **ultima** comida del dia (1×/fecha, respeta reduce-motion); track `nutrition_meal_toggled`; tras exito recarga con `fetchLogForDate`. En error de red llama `enqueueNutritionOfflineToggle` (cola offline, §2.8) y track `nutrition_meal_toggle_queued`.

### 2.7.2 `updateMealConsumedPortion` (nutrition.actions.ts)

Schema Zod: `clientId/planId/mealId/dailyLogId` (uuid), `coachSlug` (min 1), `targetDate` (regex YYYY-MM-DD), `consumedPct: null | number(0–100)`.

Pasos:
1. Parse Zod + `getUser` + `user.id === clientId`.
2. Verifica que `daily_nutrition_logs` (por `dailyLogId`) pertenezca al cliente, plan y fecha (`logRow.client_id/plan_id/log_date`).
3. Busca el `nutrition_meal_logs` por `(daily_log_id, meal_id)` y exige `is_completed` (no se puede ajustar porcion de comida no completada).
4. Update `consumed_quantity = consumedPct == null ? null : consumedPct` (recordar: es **porcentaje**, no gramos).
5. revalida ambos paths.

**Optimista (`handlePartialPctChange`):** guard `dailyLogId && isToday`; `applyOptimisticPartial({mealId, pct})`; tras exito recarga; en error toast "No se pudo guardar la porcion" + recarga.

### 2.7.3 `applyMealFoodSwap` (nutrition.actions.ts)

Schema Zod: `clientId/planId` (uuid), `dailyLogId` opcional, `mealId/originalFoodId/swappedFoodId` (uuid), `coachSlug`, `targetDate`.

Pasos:
1. Parse + guard `originalFoodId !== swappedFoodId`.
2. `getUser` + ownership.
3. Resuelve/valida `dailyLogId` (si el incoming no casa cliente/plan/fecha, lo descarta y crea uno con `getOrCreateDailyNutritionLogId`).
4. **Valida que el swap sea legitimo:** lee `food_items.swap_options` por `(meal_id, food_id=originalFoodId)`; exige que `swappedFoodId` este en las opciones (`Swap no permitido por tu coach` si no).
5. Resuelve la porcion del coach: `resolveCoachSwapPortionFromSwapOptions(swap_options, swappedFoodId)` (motor puro) → `{quantity, unit}`. Si no hay porcion definida → error.
6. **Upsert** en `nutrition_meal_food_swaps` con `onConflict: 'daily_log_id,meal_id,original_food_id'`: guarda `client_id, daily_log_id, meal_id, original_food_id, swapped_food_id, swapped_quantity, swapped_unit, updated_at`.
7. revalida paths.

**Optimista (`handleApplySwap`):** guard `isToday`; toast exito/error; recarga.

### 2.7.4 `updateMealSatisfaction` (nutrition.actions.ts)

Schema Zod: `clientId/dailyLogId/mealId` (uuid), `score: 1 | 2 | 3 | null`.

Pasos: parse + `getUser`/ownership; busca el `nutrition_meal_logs` por `(daily_log_id, meal_id)` y exige `is_completed`; update `satisfaction_score = score`. **No revalida paths** (a diferencia de las otras — el shell recarga via `fetchLogForDate`).

### 2.7.5 `toggleClientFoodPreference` + `getClientFoodFavoritesForClient` (nutrition.actions.ts)

`toggleClientFoodPreference({clientId, foodId, preferenceType: 'favorite'|'dislike', clientProfileRevalidateId?})`:
- `getUser`/ownership.
- Lee `client_food_preferences` por `(client_id, food_id)`.
- **Safety A2:** si la fila existente es `'allergy'` o `'intolerance'` (puesta por el coach), el toggle del alumno es **no-op** (no puede pisar el marcador de alergia — la PK es `client_id,food_id` compartida; si lo pisara, el hard-block del builder dejaria de dispararse).
- Si existe con mismo tipo → delete (desactiva). Si existe con otro tipo → update. Si no existe → insert.
- Si pasan `clientProfileRevalidateId`, revalida `/coach/clients/{id}`.

`getClientFoodFavoritesForClient(clientId)`: `getUser`/ownership; lee `client_food_preferences` con `preference_type='favorite'`; devuelve `food_id[]`. El shell lo carga en `useEffect` y maneja el favorito de forma **optimista local** (set local + rollback en error).

### 2.7.6 `fetchLogForDate` (nutrition.actions.ts)

`(userId, planId, date)` → `{dailyLog, mealCompletions}`. Es el **re-fetch canonico** que el shell usa tras cada mutacion para sincronizar el estado real:
- `getUser`/ownership.
- Select de `daily_nutrition_logs` por `(client_id, plan_id, log_date)` con joins anidados: `nutrition_meal_logs(meal_id, is_completed, consumed_quantity, satisfaction_score)` y `nutrition_meal_food_swaps(meal_id, original_food_id, swapped_food_id, swapped_quantity, swapped_unit)`.
- Devuelve el log completo (de ahi el shell extrae `mealLogs`, `mealSwapLogs`, `serverPartialPct`, `satisfactionMap`).

### 2.7.7 `addIntakeEntryAction` (intake.actions.ts) — off-plan

Schema Zod `addIntakeEntrySchema`:
- `coachSlug` (min 1), `logDate` (regex YYYY-MM-DD), `foodId` (uuid nullable opcional), `customName` (trim 1–120 nullable opcional), `quantity` (positive ≤ 100000), `unit` (`'g'|'ml'|'un'`), `source` (`'manual'|'recipe'|'plan'` opcional).
- `.refine`: debe haber `foodId` **o** `customName` ("Debes indicar un alimento del catalogo o un nombre libre.").

Pasos backend:
1. Parse Zod (devuelve `error.issues[0].message` si falla).
2. `resolveAuthedClientId(supabase)`: `getUser` → busca `clients` por `id = user.id` → devuelve `clientRow.id`. **El clientId NUNCA viene del body.**
3. Si hay `foodId`, valida que el alimento sea visible (RLS de `foods`) antes de insertar — evita `food_id` colgante.
4. Instancia `NutritionIntakeService` y llama `insertIntakeEntry({clientId, logDate, foodId, customName, quantity, unit, source})`.
5. `revalidatePath` de `/c/{slug}/nutrition` y `/c/{slug}/dashboard`.
6. Retorna `{success, error?}`.

### 2.7.8 `deleteIntakeEntryAction` (intake.actions.ts) — off-plan

Schema `deleteIntakeEntrySchema`: `coachSlug`, `entryId` (uuid).
- Parse + `resolveAuthedClientId`.
- `service.deleteIntakeEntry(clientId, entryId)` → delete por `(id, client_id)` (RLS exige propiedad).
- revalida paths.

> **Nota:** `deleteIntakeEntryAction` existe en el backend pero **no hay UI que lo invoque** en los componentes auditados (`OffPlanLogger` solo agrega; no lista ni borra entradas off-plan). Las entradas se listan via `getIntakeEntriesForDate` pero esa query no se consume en `NutritionShell`/`page.tsx`. Gap de paridad (ver §6).

---

## 2.8 NutritionIntakeService — servicio off-plan

Archivo: `apps/web/src/services/nutrition-intake.service.ts`.

- Tabla `nutrition_intake_entries` (client-scoped por RLS: `client_id = auth.uid()`). Recibe el `SupabaseClient` del servidor (cookies de sesion). `clientId` se pasa para filtrar/insertar explicito pero NO es la fuente de autorizacion.
- Columnas de la tabla (`database.types.ts`): `id, client_id, created_at, food_id (nullable), custom_name (nullable), log_date, quantity, unit, source`. FKs a `clients` y `foods`.

Metodos:

1. **`insertIntakeEntry(input)`:** inserta `{client_id, log_date, food_id, custom_name, quantity, unit, source}` y devuelve con join `food:foods(...)`. Retorna `null` en error.
2. **`listIntakeEntriesForDate(clientId, isoDate)`:** select `*, food:foods(...)` por `(client_id, log_date)` ordenado por `created_at` asc.
3. **`listRecentIntakeFoods(clientId, limit=10)`:** select `food_id, created_at, food:foods(...)` con `food_id` no nulo, orden desc por `created_at`, limit `limit*4`; deduplica por `food_id` (Set) y corta en `limit`. Alimenta los "Recientes" del `OffPlanLogger`.
4. **`deleteIntakeEntry(clientId, entryId)`:** delete por `(id, client_id)`.

`FOOD_REF_SELECT` = `id, name, brand, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, household_grams, household_label, is_liquid`.

---

## 2.9 intake.queries — lectura del off-plan (React.cache)

Archivo: `apps/web/src/app/c/[coach_slug]/nutrition/_data/intake.queries.ts`.

- `getAuthedClientId` (cache): resuelve el alumno via `supabase.auth.getClaims()` (no `/user` — el proxy ya valido/refresco la sesion), `claims.sub` → tabla `clients`. NUNCA del body.
- `getIntakeEntriesForDate(isoDate)` (cache): `clientId` + `service.listIntakeEntriesForDate`. **No consumido por el shell** (gap).
- `getRecentIntakeFoods(limit=10)` (cache): `clientId` + `service.listRecentIntakeFoods`. **Si consumido** en `page.tsx` para alimentar `offPlanRecents` → `OffPlanLogger`.

> Detalle de paridad de auth: las queries usan `getClaims()` (rapido, sin round-trip) mientras las actions usan `getUser()` (mas estricto, lee de GoTrue). Asimetria intencional: lectura optimizada, escritura endurecida.

---

## 2.10 Cola offline (resiliencia)

Archivo: `apps/web/src/lib/nutrition-offline-queue.ts` + consumidor `apps/web/src/app/c/[coach_slug]/_components/OfflineNutritionQueueSync.tsx`.

### 2.10.1 Alcance

- **Solo el toggle de comida completa** (`toggleMealCompletion`) se encola offline. El ajuste de porcion, satisfaccion, swap y off-plan **NO** tienen cola — fallan con toast si no hay red (gap, ver §6).

### 2.10.2 Encolar

- Key localStorage: `eva_offline_toggle_queue` (`NUTRITION_OFFLINE_TOGGLE_QUEUE_KEY`).
- Item: `{userId, planId, mealId, completed, logId?, coachSlug, date}`.
- `enqueueNutritionOfflineToggle`: **dedupe por `mealId + date`** (ultimo estado gana). Si ya hay item para esa comida+fecha, lo reemplaza; si no, lo agrega.
- Detonante: en `handleToggle` (shell), si el catch detecta `isLikelyOfflineError(e)` (navegador offline o mensaje "failed to fetch"/"network..."), encola + toast "Sin conexion — se sincronizara automaticamente".

### 2.10.3 Drenar (flush)

`OfflineNutritionQueueSync` (montado en cualquier ruta `/c/[slug]`, dashboard + nutricion):
- En mount y en evento `'online'`, ejecuta `flushQueue`:
  - Guard `flushing.current` (no concurrente).
  - Por cada item: reintenta `toggleMealCompletion(...)`. Si `success` cuenta como flushed; si no o si throw, lo deja en `remaining`.
  - Reescribe la cola con `remaining`.
  - Si hubo flushed > 0: toast "N acciones sincronizadas" + `router.refresh()`.

### 2.10.4 Cache local del read-model (offline)

En `NutritionShell` (complementa la cola): `writeNutritionReadModelCache` / `readNutritionReadModelCache` (`@/lib/nutrition-plan-local-cache`) guardan una copia del plan + adherencia + `dailyLog` del dia actual, scoped por `coachSlug` + `plan.id` + `clientUserId`. Al cargar offline, si hay cache valido (`today` coincide, mismo usuario), hidrata `currentLog` y `adherenceBoost`. `handleDateChange` bloquea cambiar de dia si esta offline ("Sin conexion — no se puede cargar otro dia").

---

## 2.11 Modulo nutrition_exchanges (Nutricion Pro) en el registro

Cuando el modulo `nutrition_exchanges` esta ON y el plan es modo porciones:
- `MealCard` recibe `macroOverride` (de `macrosForTargets(mealTargets, exchange.groups)`) en vez de sumar `food_items` (la comida no tiene alimentos sino targets de codigos).
- `exchangeContent` = nombre de variante + `ExchangeMealChips` (chips "2C · 1LAC"); tap en un chip abre `ExchangeEquivalencesSheet` (equivalencias del grupo).
- Bundle resuelto server-side por `getStudentExchangeData`; si el modulo esta OFF o el plan es 'grams', el bundle es vacio/disabled → vista byte-identical al modo gramos (AC5).

---

## 2.12 Hallazgos / gaps para el rediseño (paridad y backend)

1. **Off-plan no entra en los anillos:** `MacroRingSummary.consumed` ignora `nutrition_intake_entries`. El alumno registra off-plan pero no ve impacto en sus macros del dia. Es bitacora pura para el coach. Decidir si el rediseño debe sumarlo.
2. **`consumed_quantity` = porcentaje, no cantidad:** nombre de columna engañoso; el motor lo trata como % (0–100). Documentar/renombrar conceptualmente en el rediseño.
3. **Off-plan sin cantidad/unidad/borrado en UI:** `OffPlanLogger` siempre registra 100 g `'manual'`. `customName` (nombre libre), ajuste de cantidad, listar y borrar entradas (`deleteIntakeEntryAction` + `getIntakeEntriesForDate` existen en backend) **no tienen UI**. Gran oportunidad de paridad.
4. **Cola offline solo cubre el toggle:** porcion, satisfaccion, swap y off-plan no se encolan; fallan en red caida. Inconsistencia de resiliencia.
5. **`nutrition.actions.ts` habla Supabase directo** (sin service/repository), violando el pilar Clean Architecture que SI respeta `intake.actions.ts` (via `NutritionIntakeService`). Considerar extraer un `NutritionMealLogService`.
6. **`updateMealSatisfaction` no hace `revalidatePath`** (las demas si) — depende del re-fetch del shell. Inconsistencia menor.
7. **Asimetria getClaims (queries) vs getUser (actions):** intencional pero a documentar para la paridad mobile (apps/mobile habla PostgREST directo).
8. **Swap: el alumno no elige porcion** — la define el coach en `swap_options`. Si el coach no configuro porcion, el swap falla con "pide a tu coach que la configure". UX a considerar.
