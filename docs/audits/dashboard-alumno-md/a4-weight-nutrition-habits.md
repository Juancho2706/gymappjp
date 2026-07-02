# 4. Peso, nutricion del dia, habitos y bienvenida

Esta seccion cubre los bloques del **sidebar** del dashboard del alumno (`/c/[coach_slug]/dashboard`) relacionados con peso, nutricion del dia, habitos, mas la seccion de grafico de peso completo (fuera del sidebar) y el modal de bienvenida del coach. El sidebar lo ensambla `DashboardSidebarBlocks` y se monta **2 veces** (una version mobile, una desktop), por eso todas las queries usan `React.cache` para deduplicar lecturas dentro del mismo request.

Orden de bloques en el sidebar (`DashboardSidebarBlocks`): `ComplianceScoresCard` → `WeightWidget` → `NutritionDailySummary` (condicional) → `HabitsTrackerWidget` → `PersonalRecordsBanner`. Cada uno va envuelto en `Suspense` con su skeleton y en `RevealItem` dentro de `RevealStagger` (cascada de entrada, reduced-motion aware).

---

## 4.1 PESO

### 4.1.1 Fuente de datos comun: `getCheckInHistory30Days`

Tanto `WeightWidget` (sidebar) como `WeightFullChartSection` (cuerpo principal) leen del **mismo** query deduplicado:

`getCheckInHistory30Days(clientId)` (en `dashboard.queries.ts`):

- Tabla: `check_ins`. Columnas: `id, weight, energy_level, date, created_at`.
- Filtro: `client_id = clientId`.
- Ventana: `date >= thirtyDaysAgoStr`, donde `thirtyDaysAgoStr = format(subDays(parseISOAnchor(iso), 30), 'yyyy-MM-dd')`. El ancla es **hoy en Santiago** (`getTodayInSantiago().iso`) parseado a mediodia local (`parseISOAnchor` => `new Date(y, m-1, d, 12, 0, 0, 0)`) para evitar off-by-one de zona horaria. **La ventana se computa sobre el dia de medicion (`date`, YYYY-MM-DD), NO sobre el instante UTC de insercion.**
- Orden: `date ASC, created_at ASC` (mas antiguo primero).
- `React.cache` => 1 sola lectura por request aunque la consuman 2 componentes (widget sidebar + grafico full) en mobile y desktop.

> Decision de diseño clave: el "peso" del alumno **no es una tabla aparte** — vive en `check_ins.weight`. El log rapido de peso del dashboard inserta una fila de `check_ins` solo-con-peso (energia null). El check-in completo (`/check-in`) es la otra via de entrada de la misma columna.

### 4.1.2 `WeightWidget` (server component)

Recibe `{ userId, coachSlug }`. Flujo:

1. Resuelve `base = await getClientBasePath(coachSlug)` (prefijo de ruta `/c/...` o `/t/...` segun contexto).
2. Lee `rows = getCheckInHistory30Days(userId)` y filtra a las que tienen peso: `withW = rows.filter(r => r.weight != null)`.
3. Obtiene `todayIso = getTodayInSantiago().iso`.

**Estado vacio** (`withW.length === 0`): renderiza una `GlassCard` con icono `Scale`, texto "Aun sin registros de peso", un link "Check-in completo →" hacia `${base}/check-in`, y **igual monta `WeightQuickLog`** (para que pueda registrar su primer peso desde aqui).

**Estado con datos**:
- `last = withW[withW.length - 1]` (la ultima medicion, por orden ASC). `current = last.weight`.
- `lastDay = last.date.slice(0, 10)` — normaliza a `YYYY-MM-DD` (el `date` puede venir con componente horario tipo timestamp; corrige off-by-one de TZ etiquetando por el dia de medicion, no por el instante UTC de insercion).
- `{ trend, delta } = computeTrend(withW)` (algoritmo abajo).
- `spark = withW.slice(-14).map(...)` — ultimas **14** mediciones con peso, mapeadas a `{ iso: r.date.slice(0,10), weight }`.

Render (GlassCard):
- Header: etiqueta "Peso" + link "Registrar" → `${base}/check-in`.
- `WeightHeadline value={current}` (peso actual con count-up) + `TrendArrow trend deltaKg={delta}`.
- Fecha relativa: `formatRelativeDate(lastDay, todayIso)` ("Hoy", "Ayer", "Hace N dias", "Hace 1 semana", "Hace N semanas", "Hace 1 mes", o `d MMM yyyy`).
- `WeightSparkline data={spark}` (mini grafico de area de 14 puntos).
- `WeightQuickLog coachSlug` (formulario de registro rapido).

### 4.1.3 Algoritmo de tendencia: `computeTrend` (dentro de `WeightWidget.tsx`)

Entrada: `weights: { date; weight }[]` (ya filtrados a no-null internamente otra vez). Logica:

- `pts = weights.filter(w => w.weight != null)`. Si `pts.length < 2` → `{ trend: 'stable', delta: 0 }`.
- `last7 = pts.slice(-7)` (ultimas 7 mediciones). `prev7 = pts.slice(-14, -7)` (las 7 anteriores). **Atencion: son las ultimas 7 y 7 MEDICIONES, no 7 dias calendario** — depende de cuantas mediciones existan, no de fechas.
- Si `last7.length === 0` o `prev7.length === 0` → `stable, 0`.
- `avgLast = promedio(last7.weight)`, `avgPrev = promedio(prev7.weight)`, `delta = avgLast - avgPrev`.
- Umbral / banda muerta de **0.3 kg**:
  - `delta > 0.3` → `{ trend: 'up', delta }` (subio).
  - `delta < -0.3` → `{ trend: 'down', delta: Math.abs(delta) }` (bajo; delta se reporta en positivo).
  - en otro caso → `{ trend: 'stable', delta: 0 }`.

> El `delta` que se pasa a `TrendArrow` siempre es la magnitud (el signo se decide por el trend). Para `stable`, delta es 0 y no se muestra cifra.

### 4.1.4 `WeightHeadline` (client component)

`{ value: number }`. Muestra el peso actual con animacion count-up.
- Patron: `useMotionValue(0)` + `useSpring(mv, { stiffness: 60, damping: 20 })` + `useMotionValueEvent(spring, 'change', ...)` (mismo patron que `ComplianceRing`).
- `useReducedMotion()`: si el usuario prefiere reduced-motion, salta directo al valor final (sin animacion).
- Render: `{display.toFixed(1)} kg` (1 decimal). Funcional: solo muestra el numero, no abre nada ni dispara acciones.

### 4.1.5 `TrendArrow` (client component)

`{ trend: 'up' | 'down' | 'stable'; deltaKg: number }`. Indicador visual + cifra de delta.
- Icono: `up` → `ArrowUp` (rojo, semantica: subir de peso = alerta); `down` → `ArrowDown` (verde esmeralda, bajar = bien); `stable` → `Minus` (gris).
- Animacion de rebote (`y: [0,-4,0]` para up, `[0,4,0]` para down) en loop infinito; desactivada con reduced-motion.
- Cifra: si `trend !== 'stable'`, muestra `{deltaKg > 0 ? '+' : ''}{deltaKg.toFixed(1)} kg`.
- Funcional: indicador puro, sin interaccion.

> Nota semantica: la "buena" direccion esta cableada como **bajar peso** (verde). No depende del objetivo del alumno (deficit/superavit); es una heuristica fija.

### 4.1.6 `WeightSparkline` (client component)

`{ data: { iso; weight }[] }`. Mini grafico de area de las ultimas 14 mediciones.
- Usa `recharts` `AreaChart` + `Area type="monotone" dataKey="w"`, sin ejes/tooltip/dots — solo el trazo.
- Color del trazo y gradiente via `var(--theme-primary)` (branding por coach, nunca hex fijo).
- Mide su ancho con `ResizeObserver` (render `width` explicito de recharts, no `ResponsiveContainer`).
- Animacion desactivable con reduced-motion. Funcional: visual, sin interaccion.

### 4.1.7 `WeightQuickLog` (client component) — registrar peso desde el dashboard

`{ coachSlug }`. Formulario inline para loguear peso sin ir al check-in completo.
- `useActionState(quickLogWeightAction, { })`.
- Campos: hidden `coach_slug`, input `weight` (`type=number`, `step=0.1`, `min=20`, `max=400`, required, placeholder "72.5", id `dash-quick-weight`), boton "Guardar" (muestra "…" mientras `pending`).
- Al exito (`state.success`): un `useEffect` limpia el input (`el.value = ''`). Muestra "Registrado." en verde.
- Al error: muestra `state.error` en color destructivo.

**Server action `quickLogWeightAction`** (`dashboard.actions.ts`, `'use server'`):
1. Valida con `QuickWeightSchema` (`@eva/schemas`): `{ weight: z.coerce.number().min(20).max(400), coach_slug: z.string().min(1) }`. Si falla → `{ error }` con el primer mensaje de issue.
2. `getUser()`; si no hay user → `{ error: 'No autenticado.' }`.
3. `todayIso = getTodayInSantiago().iso`.
4. **INSERT** en `check_ins`: `{ client_id: user.id, weight, energy_level: null, notes: null, date: todayIso }`. No es upsert — cada guardado crea una **fila nueva** de check-in (puede haber varias el mismo dia; el widget toma la ultima por `date DESC, created_at DESC` cuando lee).
5. Si error de insert → `{ error: insertError.message }`.
6. Al exito: `revalidatePath` de `/c/${coach_slug}/dashboard`, `/c/${coach_slug}/check-in`, y `revalidatePath('/c', 'layout')`. Devuelve `{ success: true }`.

> Importante: el peso se guarda con `client_id = user.id` (RLS coach-scoped: el alumno solo escribe su propia fila). La fecha es el dia en Santiago, no UTC.

### 4.1.8 `WeightFullChartSection` + `WeightProgressChart` (grafico de peso completo)

Va en el cuerpo principal (`afterSidebar` en `page.tsx`), no en el sidebar.

`WeightFullChartSection` (server): lee `getCheckInHistory30Days(userId)` (mismo cache que el widget), filtra `weight != null`, y mapea a `{ date: ${r.date.slice(0,10)}T12:00:00, weight }` (ancla a **mediodia local** para que `new Date` no corra el dia al parsear) y `.reverse()` (mas reciente primero). Pasa a `WeightProgressChart`.

`WeightProgressChart` (client) `{ data: { date; weight }[]; coachSlug }`:
- Estado no-montado → skeleton; sin data → tarjeta vacia con icono `Scale`, "Realiza tu primer check-in…" + boton "Registrar Peso Hoy" → `${base}/check-in`.
- Con data: `recharts` `AreaChart` con ejes, `CartesianGrid`, `Tooltip`. `formattedData` invierte de nuevo (`[...data].reverse()`) y formatea `displayDate` con `toLocaleDateString('es-ES', { day:'numeric', month:'short' })`.
- Eje Y con dominio dinamico: `[minWeight - domainPadding, maxWeight + domainPadding]`, donde `domainPadding = (maxWeight - minWeight) * 0.2 || 5` (20% del rango, fallback 5 kg). Tick formateado `${val.toFixed(1)}kg`.
- Color del trazo/gradiente via `var(--theme-primary)`. Animacion reduced-motion aware.
- Funcional: solo lectura/hover-tooltip; el unico CTA es el del estado vacio.

> Doble reverse intencional: el query devuelve ASC, `WeightFullChartSection` hace `.reverse()` (DESC), y el chart vuelve a `.reverse()` para dibujar cronologico. Resultado final: cronologico ascendente en el eje X.

---

## 4.2 NUTRICION DEL DIA

### 4.2.1 Gate de dominio: `getDashboardNutritionDomainEnabled`

Antes de renderizar nada de nutricion, `DashboardSidebarBlocks` (y el propio `NutritionDailySummary`) consultan `getDashboardNutritionDomainEnabled(userId)` (en `heroComplianceBundle.ts`, `React.cache`):
- Lee de `clients` (`coach_id, team_id, org_id`) la fila del propio alumno (RLS techo: `clients.id = auth.uid()`).
- Llama `resolveNutritionDomainEnabled({ coachId, clientId, clientTeamId, clientOrgId })` (de `feature-prefs.service`) — master switch del dominio Nutricion por scope (coach/team/org), plan §4.8.
- Fail-OPEN: si el flag `FEATURE_PREFS_ENABLED` esta OFF, devuelve `true` (comportamiento de hoy, nada se oculta).
- Si devuelve `false`: el `RevealItem` del resumen **no se monta** en `DashboardSidebarBlocks` (evita slot vacio con gap colgando) y `NutritionDailySummary` retorna `null`. El anillo de Nutricion en `ComplianceScoresCard` se oculta por su cuenta.

### 4.2.2 `NutritionDailySummary` (server component)

`{ userId, coachSlug }`. Resumen de macros del dia + comidas marcables.

Flujo de datos:
1. Gate de dominio (arriba). Si OFF → `null`.
2. `base = getClientBasePath(coachSlug)`; `today = getTodayInSantiago().iso`.
3. `plan = getActiveNutritionPlan(userId)` — query `React.cache`: `nutrition_plans` columnas `id, name, daily_calories, protein_g, carbs_g, fats_g` donde `client_id = userId AND is_active = true` (`maybeSingle`).
   - **Sin plan** → `GlassCard` con icono `Apple`, "Sin plan nutricional / Pidele un plan a tu coach". Fin.
4. `{ dailyLog, meals } = getTodayNutritionBundle(userId, plan.id, today)` — query `React.cache` con 2 lecturas en `Promise.all`:
   - `daily_nutrition_logs` (la del dia): `id, log_date, target_calories_at_log, target_protein_at_log, target_carbs_at_log, target_fats_at_log` + anidados `nutrition_meal_logs ( id, is_completed, meal_id, consumed_quantity )` y `nutrition_meal_food_swaps ( meal_id, original_food_id, swapped_food_id, swapped_quantity, swapped_unit )`. Filtro `client_id, plan_id, log_date = today` (`maybeSingle`).
   - `nutrition_meals` del plan: `id, name, order_index, day_of_week` + `food_items ( id, quantity, unit, swap_options, foods ( id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit ) )`, ordenado por `order_index ASC`.

Procesamiento (todo en el server, funciones puras de `@eva/nutrition-engine` re-exportadas via `@/lib/nutrition-utils`):
- `mealLogs` = `dailyLog.nutrition_meal_logs ?? []`; `mealSwaps` = `dailyLog.nutrition_meal_food_swaps ?? []`.
- `doneByMeal` = `Map(meal_id → is_completed)`.
- `mealsToday` = meals filtradas por `nutritionMealAppliesOnIsoYmdInSantiago(m, today)` — una comida aplica hoy si `day_of_week == null` (todos los dias) o coincide con el dia de semana de hoy en Santiago (1=Lun..7=Dom). `totalMeals = mealsToday.length`.
- Objetivos del dia: `tCal = plan.daily_calories ?? 0`, `tP = protein_g`, `tC = carbs_g`, `tF = fats_g` (objetivos **vivos** del plan, no los congelados `*_at_log`).
- `completedIds` = set de `meal_id` con `is_completed`.
- **Aplicacion de swaps** (intercambios de alimentos del alumno): por cada comida, `normalizeMealForMacros(meal)`, luego por cada `food_item` busca un swap en `nutrition_meal_food_swaps` por `${meal.id}:${original_food_id}`; si existe y hay una `swap_option` que matchee `swapped_food_id`, construye el alimento reemplazado (macros + cantidad/unidad del swap) y aplica `applyMealFoodSwaps`. Resultado: `mealsWithSwaps` = `mealsForMacros`.
- `portionMap = portionPctMapFromMealLogs(mealLogs)` — mapa `meal_id → %` (0–100) solo para comidas completadas con `consumed_quantity` explicito (ajuste parcial de porcion).
- `realConsumed = calculateConsumedMacrosWithCompletionFallback(mealsForMacros, completedIds, { calories:tCal, protein:tP, carbs:tC, fats:tF }, portionMap)`:
  - Suma macros de las comidas en `completedIds`, multiplicando cada comida por su `portion multiplier` (% / 100, clamp 0–1; ausencia de clave = 100% = modo binario).
  - **Fallback**: si NINGUNA comida del plan tiene macros (sumas 0 en todo), cae a un modelo proporcional por conteo: `ratio = (suma de multiplicadores de comidas completadas) / totalMeals`, y devuelve `goals * ratio`. Asi un plan sin macros detallados aun muestra avance al marcar comidas.
- `consumedCal = round(realConsumed.calories)`, `consumedP/C/F = realConsumed.protein/carbs/fats`.

Calculo de macros por item (`calculateFoodItemMacros`, motor canonico):
- Macros en BD son por 100 g/ml. `factor` segun unidad:
  - `g` / `ml` → `factor = quantity / 100` (proporcion directa).
  - `un` (contable) → `factor = (quantity * serving_size) / 100`.
- Cada macro = `round(foods.macro * factor * 10) / 10`.

Render (GlassCard, `space-y-4`):
- Header: icono `Apple` (verde) + nombre del plan (`plan.name`) + etiqueta "Hoy" + link "Ver todo →" → `${base}/nutrition`.
- Si `!dailyLog && totalMeals > 0`: hint "¡Registra tu primera comida desde nutricion!".
- **Barra de calorias** (no es `MacroBar`, es inline): label "Calorias", cifra `${consumedCal} / ${tCal} kcal`, barra con ancho `min(100, consumed/target*100)%` y color `var(--theme-primary)`.
- 3 `MacroBar`: Proteina (`tP`, delay 0), Carbos (`tC`, delay 1), Grasas (`tF`, delay 2). Colores via `var(--color-macro-protein|carbs|fats)`.
- Lista de `MealCompletionRow` por cada `m` en `mealsToday` (filas toggleables).
- CTA pulsante "Ver plan completo con macros →" → `${base}/nutrition`.

> Donde lleva: todo apunta a `/c/[coach_slug]/nutrition` (la pagina de plan alimenticio). El dashboard es solo el resumen del dia + accion rapida de marcar comidas.

### 4.2.3 `MacroBar` (client component)

`{ label, consumed, target, unit: 'g'|'kcal', colorClass, delayIndex }`. Barra de progreso de un macro.
- `pct = target > 0 ? min(100, consumed/target*100) : 0`.
- `over = target > 0 && consumed > target` — si se paso del objetivo: muestra icono `AlertTriangle` rojo junto a la cifra y la barra se marca en rojo (alerta de exceso) en vez de su color normal.
- Cifra: `{round(consumed)}/{round(target)}{unit}`.
- Animacion: la barra crece de 0% a `pct%` con `useInView` (once, margin -10%) + spring `springs.lazy` con delay escalonado `delayIndex * 0.08`.
- Funcional: visual, sin interaccion.

### 4.2.4 `MealCompletionRow` (client component) — marcar comida del dia

`{ mealId, name, completed, clientId, planId, dailyLogId, coachSlug }`. Toggle de comida completada.
- `useOptimistic(completed)` + `useTransition`.
- Al click (`onToggle`): `next = !optimistic`, `targetDate = getTodayInSantiago().iso`. Set optimista inmediato, luego llama el server action `toggleMealCompletion(clientId, planId, mealId, next, dailyLogId, coachSlug, targetDate)` (del modulo nutrition).
  - Si `!res.success` → toast "No se pudo registrar la comida".
  - Si exito → `trackNutritionEvent('nutrition_meal_toggled', { source:'dashboard', completed: 0|1, date_is_today: 1 })`.
- **Offline-safe**: si el error es de red (`isLikelyOfflineError`), encola `enqueueNutritionOfflineToggle({ userId, planId, mealId, completed:next, logId:dailyLogId, coachSlug, date })`, trackea `nutrition_meal_toggle_queued`, y toast "Sin conexion — se sincronizara al volver la senal". Otro error → `console.error` + toast "Error al registrar comida" (el optimistic revierte al fallar la transition).
- Render: checkbox cuadrado con check animado (path SVG con `pathLength`) o `Loader2` mientras pending; nombre con tachado/atenuado cuando completada. Funcional: dispara el toggle, no navega.

> El persistir de la comida vive en `toggleMealCompletion` (modulo nutrition, no en este archivo). El dashboard solo invoca esa accion y maneja optimismo + cola offline + analytics.

---

## 4.3 HABITOS

### 4.3.1 `HabitsTrackerWidget` (server wrapper)

`{ userId, coachSlug }`. Lee y delega:
- `today = getTodayInSantiago().iso`.
- `getTodayHabits(clientId, today)` — query local `React.cache` (definida en el mismo archivo): `daily_habits` columnas `water_ml, steps, sleep_hours, fasting_hours, supplements, notes` donde `client_id = clientId AND log_date = today` (`maybeSingle`). Devuelve la fila o `null`.
- Renderiza `HabitsTracker` con `clientId, coachSlug, logDate=today, isToday=true, initialData=data`.

> El widget del dashboard SIEMPRE es del dia de hoy y editable (`isToday=true`). El mismo `HabitsTracker` se reusa en la pagina de nutricion para dias pasados (read-only).

### 4.3.2 `HabitsTracker` (client component) — los 5 habitos

Reusado de `/c/[coach_slug]/nutrition/_components`. Habitos rastreados (5 dimensiones):

| Habito | Tipo de input | Opciones / rango | Campo DB |
|--------|---------------|------------------|----------|
| Agua | Botones (chips toggle) | `WATER_OPTIONS = [250, 500, 750, 1000, 1500, 2000, 2500, 3000]` ml | `water_ml` |
| Pasos | Input numerico (texto, solo digitos) | libre, parseInt; `<0` o NaN → null | `steps` |
| Sueno | Botones | `SLEEP_OPTIONS = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]` h | `sleep_hours` |
| Ayuno intermitente | Botones | `FASTING_OPTIONS = [12, 14, 16, 18, 20, 24]` h | `fasting_hours` |
| Suplementos | Botones multi-select | `SUPPLEMENT_OPTIONS = ['Creatina','Proteina','Omega-3','Vitamina D','Multivit.','Magnesio','Zinc','Cafeina','BCAA']` | `supplements` (array texto) |

Comportamiento:
- Header colapsable (toggle `open`), accesible (role=button, tabIndex, Enter/Espacio). Muestra "Habitos del dia" + `InfoTooltip` ("opcionales… contexto para tu coach… no reemplazan valoracion clinica").
- **Contador de completitud** `filled/total`: `filled = [waterMl, steps, sleepHours, fastingHours, (hasSupplements||null)].filter(v=>v!=null).length`, `total = 5`. Resumen one-line cuando `filled>0`: ej "2L agua · 8.000 pasos · 8h sueno · 16h ayuno · 3 supl.".
- Estado inicial desde `initialData`; ademas un `useEffect` re-fetch via `getDailyHabits(clientId, logDate)` al montar (refresca por si cambio).
- **Autosave por interaccion** (no hay boton guardar): cada handler (`handleWater`, `handleSleep`, `handleFasting`, `handleSupplement`) hace toggle del valor (volver a tocar el mismo lo pone en `null`) y llama `save(patch)`. Pasos guarda en `onBlur` (`handleStepsBlur`).
- `save(patch)`: solo si `isToday`. Construye el objeto completo (mezcla patch + estado actual + `notes` preservado) y en `startTransition` llama `upsertDailyHabits({ clientId, logDate, coachSlug, waterMl, steps, sleepHours, fastingHours, supplements, notes })`. Si falla → toast de error. Muestra "Guardando…" mientras `isPending`.
- Si `!isToday`: botones deshabilitados + "Solo se puede editar el dia de hoy".

### 4.3.3 Persistencia: `upsertDailyHabits` (server action)

`'use server'` en `nutrition/_actions/habits.actions.ts`:
1. Valida con `UpsertHabitsSchema` (`@eva/schemas`):
   - `clientId: uuid`, `logDate: regex YYYY-MM-DD`, `coachSlug: min(1)`,
   - `waterMl: int 0–10000 nullable`, `steps: int 0–100000 nullable`, `sleepHours: 0–24 nullable`, `fastingHours: int 0–72 nullable`, `supplements: array(string max 50) max 20 nullable`, `notes: string max 500 nullable`.
2. `getUser()`; **autorizacion**: `user.id === clientId` (solo edita sus propios habitos), si no → `{ success:false, error:'No autorizado' }`.
3. **UPSERT** en `daily_habits` con `onConflict: 'client_id,log_date'` (1 fila por alumno por dia): `{ client_id, log_date, water_ml, steps, sleep_hours, fasting_hours, supplements: supplements ?? null, notes, updated_at: now }`.
4. `revalidatePath('/c/${coachSlug}/nutrition')`. (Nota: revalida la pagina de nutricion, **no** el dashboard — el widget del dashboard refresca su propio estado via el `useEffect` de `getDailyHabits`.)

`getDailyHabits(clientId, logDate)` (mismo archivo): lectura server con la misma autorizacion `user.id === clientId`; select `daily_habits` por `client_id, log_date`.

> Modelo de datos: `daily_habits` es 1 fila por `(client_id, log_date)`, scope alumno. No hay tabla de definicion de habitos — las 5 dimensiones son columnas fijas + un array de suplementos. Los habitos son **opcionales y orientativos** (contexto para el coach).

---

## 4.4 `DashboardSidebarBlocks` (ensamblador del sidebar)

`{ userId, coachSlug }` (server). Arma la columna lateral. Se monta 2 veces (mobile + desktop) — la deduplicacion la garantiza `React.cache` en cada query.

1. Computa `nutritionEnabled = getDashboardNutritionDomainEnabled(userId)` una vez (cacheado).
2. Renderiza un `RevealStagger` con `RevealItem` por bloque (cascada de entrada CSS transform/opacity, barata, reduced-motion aware), cada uno en `Suspense` con su skeleton:
   - `ComplianceScoresCard` (anillos de cumplimiento — fuera de esta seccion).
   - `WeightWidget` (4.1).
   - `NutritionDailySummary` (4.2) — **solo si `nutritionEnabled`** (si no, ni se monta el `RevealItem`, evita gap colgando).
   - `HabitsTrackerWidget` (4.3).
   - `PersonalRecordsBanner` (records — fuera de esta seccion).

> Decision: el master switch de Nutricion se evalua aqui Y dentro de `NutritionDailySummary` (defensa en profundidad). El anillo de Nutricion de `ComplianceScoresCard` se oculta por su propia cuenta — la tarjeta de compliance sigue con Entrenos + Check-ins.

---

## 4.5 `WelcomeModal` (mensaje/video de bienvenida del coach)

### 4.5.1 De donde salen los datos (montaje en `page.tsx`)

El branding del coach llega anidado en `getClientProfile` → `findDashboardClientById`, que trae `clients` + `coaches (brand_name, primary_color, logo_url, welcome_message, welcome_modal_enabled, welcome_modal_content, welcome_modal_type, welcome_modal_version)` (tipo `CoachBrand` en `dashboard.queries.ts`).

En `page.tsx` se resuelve el contexto de marca:
- `isTeamContext = headers['x-workspace-brand-source'] === 'organization' || basePath.startsWith('/t')`.
- `welcomeModalEnabled = isTeamContext ? false : (coachBranding.welcome_modal_enabled ?? false)`.

Props pasadas a `<WelcomeModal>`:
- `brandName = (isTeamContext ? headerTeamBrandName : coachBranding.brand_name) ?? 'Tu Coach'`.
- `welcomeModalEnabled` (false en team).
- `welcomeModalContent = isTeamContext ? null : (coachBranding.welcome_modal_content ?? null)`.
- `welcomeModalType = coachBranding.welcome_modal_type ?? 'text'`.
- `welcomeModalVersion = coachBranding.welcome_modal_version ?? 0`.

> **Supresion en team**: en contexto team/pool el modal de bienvenida PERSONAL del coach se suprime (`welcomeModalEnabled=false`, `content=null`). Razon: la marca del coach asignado no debe filtrarse al alumno de pool; la bienvenida la gestiona el dueño del team, no el coach individual. La fila `coaches` anidada trae la marca personal pero se ignora en este caso. Standalone (`/c`) → comportamiento normal.

El coach configura estos campos en `/coach/settings` (`BrandSettingsForm`): toggle "mostrar mensaje/video", tipo (texto/video), y contenido (texto libre o URL YouTube/Vimeo). El mismo modelo existe en mobile (`apps/mobile/components/WelcomeModal.tsx`).

### 4.5.2 Comportamiento (one-time + "no mostrar de nuevo")

`WelcomeModal` (client) `{ brandName, welcomeModalEnabled, welcomeModalContent, welcomeModalType, welcomeModalVersion }`.

- `STORAGE_KEY = 'eva:welcome-dismissed-version'` en `localStorage`.
- **Como sabe que es la primera vez** (`useEffect`): si `!welcomeModalEnabled` o contenido vacio → no hace nada. Si no, lee `dismissedVersion = parseInt(localStorage[STORAGE_KEY] || '0')`. Si `dismissedVersion < welcomeModalVersion` → abre el modal tras un delay de **800ms** (deja cargar el dashboard). Si localStorage falla → catch silencioso (no abre).
- **Que persiste**: solo el **numero de version** descartada. El coach, al editar el mensaje, incrementa `welcome_modal_version`; eso hace que `dismissedVersion < version` vuelva a ser true y el modal reaparezca (mensaje nuevo = se vuelve a mostrar). Es por-version, no por-vez.
- **Cerrar** (`handleClose`): solo cierra (`setIsOpen(false)`), **no persiste** — reaparecera en el proximo render hasta que pase el delay otra vez (cierre temporal).
- **"No mostrar de nuevo hasta que haya un mensaje nuevo"** (`handleDontShowAgain`): escribe `localStorage[STORAGE_KEY] = String(welcomeModalVersion)` y cierra. Asi `dismissedVersion === version` y no reaparece hasta que el coach suba la version.
- El boton "Entendido" llama `handleDontShowAgain` si el checkbox "No mostrar de nuevo…" esta marcado, si no `handleClose`.

### 4.5.3 Render (funcional)

- Overlay full-screen (click en backdrop = `handleClose`). Header "Mensaje de {brandName}" + boton X (close).
- **Tipo video**: extrae el id con `extractYouTubeId` (regex youtube.com/watch, youtu.be, youtube.com/embed — 11 chars) o `extractVimeoId` (vimeo.com/digits). Renderiza `iframe` embebido (YouTube o Vimeo) con `autoplay=1`, controles ocultos, `playsinline`. Boton mute/unmute (`isMuted`, default muted) que recrea el iframe via `key` (cambia `mute`). Si la URL no es valida → placeholder "URL de video no valida".
- **Tipo texto**: muestra `welcomeModalContent` con saltos de linea preservados (`whitespace-pre-wrap`).
- Footer: checkbox "No mostrar de nuevo hasta que haya un mensaje nuevo" + boton "Entendido".

> Limitacion de diseño: el dismiss es client-side puro (`localStorage`), por dispositivo/navegador — no se sincroniza entre dispositivos del alumno. Un alumno que entra desde otro telefono vera el modal de nuevo. El versionado lo controla el coach incrementando `welcome_modal_version`.
