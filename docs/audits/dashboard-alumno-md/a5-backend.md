# 5. Backend: cumplimiento, registros rapidos y persistencia

Esta es la seccion mas tecnica de la auditoria del dashboard del alumno (`/c/[coach_slug]/dashboard`). Cubre como se calculan los anillos de cumplimiento, los motores de adherencia, todas las cargas de datos, todas las server actions que persisten lo que el alumno registra, el calculo de records (PRs) y racha, la cola offline y las invariantes de scoping/identidad/offline-safety.

> Convencion de fechas en TODO el dashboard: zona `America/Santiago` (`SANTIAGO_TZ` en `apps/web/src/lib/date-utils.ts`). Dia de semana `1=Lunes … 7=Domingo` (no el `0=Domingo` de JS). El "hoy" canonico lo da `getTodayInSantiago()` que devuelve `{ date, iso (YYYY-MM-DD), dayOfWeek }`.

> Invariante de identidad transversal: el `clientId` del alumno SIEMPRE sale de `auth.uid()` (via `getClientRootUser()` con `getClaims()` en lectura, o `supabase.auth.getUser()` en mutaciones), NUNCA del body del request. Las server actions reciben `clientId` por parametro en algunos casos, pero lo cruzan contra `user.id` antes de escribir (ver §5.4).

---

## 5.1 Orquestacion: que se carga y donde

El page server-component `apps/web/src/app/c/[coach_slug]/dashboard/page.tsx` arma el arbol y delega TODA la carga a queries `React.cache` montadas dentro de `<Suspense>`. El page directamente solo:

1. Resuelve `base` = `getClientBasePath(coach_slug)`.
2. `getClientDashboardUser()` (alias de `getClientRootUser`) → `{ id, email }` desde el JWT (`getClaims()`); si null → `redirect(${base}/login)`.
3. `getClientProfile(user.id)` → fila `clients` + marca del coach anidada (`findDashboardClientById`); si null → redirect login.
4. Si `client.org_id` existe → `getActiveOrgAnnouncements(client.org_id)` (anuncios de la org). Standalone (sin org) → `[]`, ni siquiera consulta.
5. Lee headers del proxy para contexto team: `x-client-use-brand-colors`, `x-client-base-path`, `x-workspace-brand-source`, `x-coach-brand-name`. En contexto team se suprime el modal de bienvenida PERSONAL del coach y el saludo usa el nombre del team.

Los bloques pesados se montan via `userId`/`coachSlug` y cargan sus propios datos:

- `HeroAndComplianceGroup` → `getHeroComplianceBundle()` (hero + anillos; §5.2).
- `DashboardSidebarBlocks` → compliance card, weight widget, nutrition daily summary (gated), habits, records.
- `WeekCalendar`, `CheckInBanner`, `ActiveProgramSection`, `RecentWorkoutsSection`, `WeightFullChartSection`.

> `React.cache` deduplica por request: el sidebar se monta DOS veces (mobile + desktop, `sidebarMobile` y `sidebarDesktop` apuntan al mismo componente) y aun asi cada query corre 1 sola vez. Igual `getCheckInHistory30Days` lo usan el WeightWidget y el bundle de compliance → 1 lectura compartida.

---

## 5.2 `heroComplianceBundle.ts` — EL calculo de los anillos de cumplimiento

`apps/web/src/app/c/[coach_slug]/dashboard/_data/heroComplianceBundle.ts`, funcion `getHeroComplianceBundle(userId, _coachSlug)` (envuelta en `React.cache`). Es el corazon del dashboard: produce tanto el "hero" del entreno de hoy como los 4 valores de cumplimiento.

### 5.2.1 Entradas (6 cargas en paralelo)

Un solo `Promise.all` dispara:

```
[program, allPlans, logs, checkInHistory, nutritionDays, nutritionAdherenceInputs] = await Promise.all([
  getActiveProgram(userId),               // workout_programs activo + planes anidados
  getClientWorkoutPlans(userId),          // todos los workout_plans del alumno
  getRecentWorkoutLogs(userId),           // workout_logs ultimos 30d (≤200 filas)
  getCheckInHistory30Days(userId),        // check_ins ultimos 30d
  getNutritionLogDays30(userId),          // # dias distintos con daily_nutrition_log en 30d
  getNutritionAdherenceInputs30d(userId), // plan activo + comidas + logs crudos 30d (o null)
])
```

`activePlans` = `allPlans` filtrados a `!p.program_id || p.program_id === program?.id` (planes sueltos + los del programa activo).

### 5.2.2 Hero "entreno de hoy"

1. Contexto de hoy via `getTodayInSantiago()`: `userLocalDate`, `today` (ISO), `todayDow`.
2. `abMode = !!program?.ab_mode`. `weekIdx = programWeekIndex1Based(program, userLocalDate)` (semana 1-based del ciclo, ver §5.7).
3. `activeVariant = resolveEffectiveWeekVariant(...)`: variante A/B que toca por ciclo, pero si esa variante no tiene NINGUN plan y la otra si, cae a la que tiene (fix del dead-end A/B mal armado).
4. Selecciona `todayPlan`:
   - Primero un plan con `assigned_date === today` (plan fechado puntual).
   - Si no hay y existe programa: plan con `program_id === program.id && day_of_week === todayDow && workoutPlanMatchesVariant(p, activeVariant, abMode)`.
5. Bloques (`blocksRaw`): toma `workout_blocks` del plan anidado en `getActiveProgram`; si vienen vacios pero hay `todayPlan.id`, hace una lectura extra `getWorkoutPlanBlocksForHero(userId, planId)`. Mapea a `HeroBlock { id, sets, reps, exercise.name }`.
6. **Series ya logueadas hoy** (`baseLoggedPerBlock`): filtra `logs` a los que cumplen `workout_blocks.plan_id === todayPlan.id` AND `getSantiagoIsoYmdForUtcInstant(logged_at) === today` AND el `block_id` esta en los bloques de hoy. Dedup por clave `block_id:set_number` (un set solo cuenta 1 vez) y descarta `set_number < 1 || > b.sets`.
   - `totalSetsTarget` = suma de `b.sets`.
   - `totalSetsLogged` = suma de series unicas registradas.
   - `isAlreadyLogged` = `totalSetsTarget > 0 && totalSetsLogged >= totalSetsTarget`.
7. **Proximo entreno** (cuando no hay plan hoy): entre planes del programa con `day_of_week > todayDow` y variante coincidente, el de menor `day_of_week`. Label "Mañana" si es `todayDow + 1`, si no el nombre del dia (`DAY_NAMES`).

### 5.2.3 Los 4 valores de cumplimiento (`scores`)

El bundle devuelve `scores` con 5 campos. Cada anillo se calcula asi:

| Score | Formula exacta | Ventana | Fuente |
|---|---|---|---|
| `workoutScore` | `computeWorkoutScore30d(...)` → `round(completedDays/plannedDays*100)`, cap 100 | rolling 30 dias Santiago | `workoutAdherence30d.ts` (§5.3) |
| `checkInScore` | `min(100, round((checkInsLast30 / 4) * 100))` | 30 dias (`getCheckInHistory30Days`) | `check_ins` |
| `nutritionEngagementScore` | `nutritionHasLogs ? min(100, round((nutritionDays/30)*100)) : 0` | 30 dias | # dias distintos con `daily_nutrition_log` |
| `nutritionComplianceScore` | `min(100, round(summary.compliancePct))` o `null` sin plan | 30 dias | `computeNutritionAdherence` (§5.4 motor) |
| `nutritionHasLogs` | `nutritionDays > 0` (bool) | 30 dias | gobierna anillo gris "Sin datos" (§10) |

Detalle clave:

- **Check-ins**: el "objetivo" implicito es ~4 check-ins en 30 dias (≈1/semana). `checkInsLast30 = checkInHistory.length` (cuenta TODAS las filas `check_ins` de 30d, incluso las de peso-rapido). 4 o mas check-ins = 100%.
- **Engagement de nutricion** vs **Cumplimiento de nutricion** son DOS metricas distintas y separadas a proposito (ver comentarios en el codigo):
  - *Engagement* = cuantos DIAS el alumno registro algo (dias con `daily_nutrition_log` / 30). Mide habito de registro.
  - *Cumplimiento* (`nutritionComplianceScore`) = de las comidas APLICABLES en 30d, cuantas marco completas. `sum(mealsDone) / sum(applicableMeals)`. Mide si comio lo planificado.
  - Si el alumno no tiene plan activo, `nutritionComplianceScore === null` (no se puede medir adherencia sin plan) — el anillo correspondiente cae a "Sin datos".

### 5.2.4 `computeNutritionComplianceScore(inputs)` (helper local del bundle)

Convierte la salida cruda de `getNutritionAdherenceInputs30d` al input del motor canonico:

- `meals`: `plan.nutrition_meals` normalizadas con `normalizeMealForMacros(m)` + se preserva `day_of_week`.
- `logsByDate`: `Map<log_date, MealLogRow[]>` desde `day.nutrition_meal_logs` (`{ meal_id, is_completed:!!, consumed_quantity }`).
- `liveTarget`: macros vigentes del plan (`daily_calories/protein_g/carbs_g/fats_g`, defaults 0).
- `targetByDate`: snapshot por dia desde `target_*_at_log` (solo si `target_calories_at_log != null`).
- Llama `computeNutritionAdherence({ meals, logsByDate, targetByDate, liveTarget, range:{startIso,endIso}, dayOfWeekResolver: getNutritionDayOfWeekFromIsoYmdInSantiago })` y devuelve `round(summary.compliancePct)`.

### 5.2.5 Gate del dominio Nutricion (`getDashboardNutritionDomainEnabled`)

Funcion aparte en el mismo archivo (`React.cache`). Resuelve si la nutricion esta PRENDIDA para este alumno:

- Lee `clients` (`coach_id, team_id, org_id`) por `id = userId` (RLS techo: el alumno solo se ve a si mismo).
- Llama `resolveNutritionDomainEnabled({ coachId, clientId, clientTeamId, clientOrgId })` (servicio feature-prefs).
- Usa el scope del ALUMNO (no el `coach_id` del plan) para cubrir el caso "sin plan todavia".
- **Fail-OPEN**: si el flag `FEATURE_PREFS_ENABLED` esta OFF → `true` (comportamiento de hoy, nada se oculta).

Cuando devuelve `false`, `DashboardSidebarBlocks` NO monta `NutritionDailySummary` y `ComplianceScoresCard` oculta el anillo de nutricion (la tarjeta sigue con Entrenos + Check-ins). Es el espejo del gate de la pagina `/c/[coach_slug]/nutrition`.

---

## 5.3 Motor de adherencia de ENTRENO — `workoutAdherence30d.ts`

`apps/web/src/lib/workout/workoutAdherence30d.ts`, funcion `computeWorkoutScore30d(input)`. PURE (solo `date-fns` + helpers de fecha + `programWeekVariant`).

### Que entra

```
{ todaySantiagoIso, activePlans, program, logs }
```

- `activePlans`: filas minimas `{ id, assigned_date, program_id, day_of_week, week_variant }`.
- `program`: `{ id, ab_mode, start_date, weeks_to_repeat }` o null.
- `logs`: `{ logged_at, workout_blocks:{plan_id} }`.

### Como calcula (rolling 30 dias)

Ancla `anchor = parseISO(${todaySantiagoIso}T12:00:00.000Z)` (mediodia para evitar saltos DST). Itera `i` de 0 a 29 (30 dias hacia atras):

1. `instant = subDays(anchor, i)`; `iso = getSantiagoIsoYmdForUtcInstant(instant)`; `dow = getNutritionDayOfWeekFromIsoYmdInSantiago(iso)`.
2. **¿Habia entreno planificado ese dia?**
   - `assignedPlan`: plan con `assigned_date === iso`.
   - `programPlan`: si hay programa, calcula `weekIdx` y `activeVariant` (EFECTIVA, igual que el hero) y busca plan con `program_id === prog.id && day_of_week === dow && workoutPlanMatchesVariant(...)`.
   - `dayPlan = assignedPlan ?? programPlan`. Si no hay → dia no planificado → `continue` (no cuenta).
3. `plannedDays++`. **¿Lo hizo?** `done = logs.some(l => l.workout_blocks.plan_id === dayPlan.id && getSantiagoIsoYmdForUtcInstant(l.logged_at) === iso)`. Si si → `completedDays++`.

### Que devuelve

```
{ plannedDays, completedDays, score }
score = plannedDays > 0 ? min(100, round((completedDays/plannedDays)*100)) : 0
```

> El denominador NO es 30 dias fijos: son solo los dias que TENIAN entreno planificado en la ventana. Si el plan es 3x/semana, el denominador en 30d es ~12-13, no 30. Esto evita penalizar dias de descanso planificados. Un dia sin log de ese plan exacto cuenta como fallado aunque el alumno haya entrenado otra cosa.

---

## 5.4 Motor de adherencia de NUTRICION — `computeNutritionAdherence`

`packages/nutrition-engine/adherence.ts`. Motor canonico PURE compartido web + mobile (sin Next/Supabase/React/RN; la convencion dia-semana se INYECTA via `dayOfWeekResolver`/`mealAppliesOn`).

### Input (`ComputeNutritionAdherenceInput`)

- `meals: AdherenceMeal[]` — comidas del plan con `food_items` normalizados + `day_of_week` opcional.
- `logsByDate: Map<YYYY-MM-DD, MealLogRow[]>` donde `MealLogRow = { meal_id, is_completed, consumed_quantity? }`.
- `targetByDate?: Map<fecha, MacroTarget>` (snapshot por dia).
- `liveTarget: MacroTarget` (fallback cuando no hay snapshot).
- `range: { startIso, endIso }`.
- `dayOfWeekResolver(isoYmd) → 1..7`.
- `mealAppliesOn?` opcional; default: `day_of_week == null` → aplica todos los dias, si no `day_of_week === resolver(fecha)`.

### Algoritmo (por dia del rango)

`enumerateDates(start, end)` genera las fechas inclusive (anclando a mediodia UTC, guard de rango invertido → solo el primer dia). Para cada fecha:

1. `applicable` = comidas que `appliesOn(meal, date)`. `applicableMeals = applicable.length`.
2. `logs` del dia; `hasLog = logs.length > 0`.
3. De los logs `is_completed`: arma `completedMealIds` y `portionPctByMealId` (si `consumed_quantity != null` y numerico).
4. `mealsDone` = cuantas comidas COMPLETADAS estan tambien APLICABLES ese dia (interseccion `completedMealIds ∩ applicableIds`).
5. `targetMacros = targetByDate.get(date) ?? liveTarget`.
6. `consumedMacros = calculateConsumedMacrosWithCompletionFallback(applicable, completedMealIds, targetMacros, portionPctByMealId)`.
7. `compliancePct DIARIO = applicableMeals > 0 ? (mealsDone/applicableMeals)*100 : 0`.

### Output (`summary`)

- **`compliancePct` de RANGO = `sumMealsDone / sumApplicable * 100`** — invariante critica: es suma/suma, NUNCA el promedio de los % diarios.
- `consumedMacros` / `targetMacros`: sumas a lo largo del rango.
- `loggingEngagementPct = daysWithLog / rangeDays * 100` — campo SEPARADO, jamas fusionado dentro de compliance.
- `streak` (`computeStreak`): un dia "cuenta" si tiene comidas aplicables y TODAS estan completas (`mealsDone >= applicableMeals && applicableMeals > 0`). Dias sin comidas aplicables son NEUTROS (ni rompen ni extienden). `current` = racha contando desde el final (saltando neutros); `longest` = maxima ventana.

> El dashboard usa SOLO `summary.compliancePct` para el anillo `nutritionComplianceScore`. La racha de nutricion del motor no alimenta la racha global del dashboard (esa sale del RPC, §5.6).

### Calculo de macros consumidas (`macros.ts`)

`packages/nutrition-engine/macros.ts`:

- `calculateFoodItemMacros(item)`: factor segun unidad — `g`/`ml` → `qty/100`; `un` (contable) → `(qty*serving_size)/100`. Los macros en BD son por 100g/ml. Redondeo a 1 decimal.
- `calculateConsumedMacros(meals, completedMealIds, portionPctByMealId)`: suma macros de comidas completadas, multiplicando por `mealConsumedPortionMultiplier` (0-1; ausencia de clave = 1 = 100%, modo binario; presencia = `pct/100` clamp 0-1).
- `calculateConsumedMacrosWithCompletionFallback(...)`: si las comidas tienen datos de macros reales → usa consumo real; si NO tienen ningun macro (`hasAnyMealMacroData` false) → estima por proporcion `weighted/totalMeals` aplicada a los `goals` (target del dia). Cubre planes "solo nombres de comida sin gramos".
- `normalizeMealForMacros`/`normalizeSwapOptions`: convierten la fila Supabase anidada al shape del motor (defaults 0, `unit ?? 'g'`, `serving_size ?? 100`).

---

## 5.5 `dashboard.queries.ts` — TODAS las cargas

`apps/web/src/app/c/[coach_slug]/dashboard/_data/dashboard.queries.ts`. Todas `React.cache`. Scoping en TODAS por `client_id/clients.id = userId` (el `userId` viene de `auth.uid()`); RLS encima garantiza que el alumno solo lea lo propio. No hay scoping por coach/team aqui — el techo es la identidad del alumno.

| Query | Tabla(s) | Que trae / ventana |
|---|---|---|
| `getClientDashboardUser` (= `getClientRootUser`) | JWT (`getClaims`) | `{ id, email }` del alumno. Cero round-trip a GoTrue. |
| `getClientProfile(userId)` | `clients` + `coaches` anidado | `findDashboardClientById`: `id, full_name, coach_id, org_id` + marca del coach (`brand_name, primary_color, logo_url, welcome_message, welcome_modal_*`). |
| `getDashboardStreak(clientId)` | RPC `get_client_current_streak` | racha actual (int); error → 0. (§5.6) |
| `getLastCheckIn(clientId)` | `check_ins` | ultimo check-in (`weight, energy_level, date, created_at`), orden por `date` desc luego `created_at` desc, limit 1. |
| `getCheckInHistory30Days(clientId)` | `check_ins` | 30d sobre `date` (no UTC); orden ascendente. Alimenta WeightWidget y `checkInScore`. |
| `getActiveProgram(clientId)` | `workout_programs` + `workout_plans` + `workout_blocks` + `exercises` | programa `is_active=true` con planes y bloques anidados. |
| `getClientWorkoutPlans(clientId)` | `workout_plans` | todos los planes (`id,title,assigned_date,group_name,day_of_week,week_variant,program_id,created_at`), orden `assigned_date` desc. |
| `getWorkoutPlanBlocksForHero(clientId, planId)` | `workout_plans`+`workout_blocks`+`exercises` | bloques de un plan puntual (cuando el anidado vino vacio). Doble scoping `id=planId && client_id=clientId`. |
| `getRecentWorkoutLogs(clientId)` | `workout_logs` + `workout_blocks!inner(plan_id)` | logs 30d, `logged_at >= hoy-30d`, orden desc, **limit 200**. |
| `getWorkoutHistoryLogsFull(clientId)` | `workout_logs` | logs 365d, **limit 8000** (pagina historial; ya casi reemplazada por RPC). |
| `getWorkoutHistoryDayCounts(clientId, daysBack)` | RPC `get_client_workout_day_counts` | conteo de series por dia agregado EN DB (zona Santiago). Reemplaza bajar 8000 filas. |
| `getActiveNutritionPlan(clientId)` | `nutrition_plans` | plan `is_active=true` (`id,name,daily_calories,protein_g,carbs_g,fats_g`). |
| `getTodayNutritionBundle(clientId, planId, todayISO)` | `daily_nutrition_logs` + `nutrition_meals`/`food_items`/`foods` | en paralelo: log del dia (con `nutrition_meal_logs` + `nutrition_meal_food_swaps`) + comidas del plan. Para el resumen diario. |
| `getPersonalRecords(clientId)` | `workout_logs` + `workout_blocks` + `exercises` | PRs recientes (§5.6). Medido con `measureServer`. |
| `getActiveOrgAnnouncements(orgId)` | `org_announcements` | hasta 5 anuncios `is_active`, `audience in (all,clients)`, `active_until` futuro o null, `published_at` pasado o null; orden `created_at` desc. |
| `getNutritionLogDays30(clientId)` | `daily_nutrition_logs` | # de `log_date` distintos en 30d (engagement de registro). |
| `getNutritionAdherenceInputs30d(clientId)` | `nutrition_plans`(+comidas/items/foods) + `daily_nutrition_logs`(+`nutrition_meal_logs`) | plan activo + logs crudos 30d para alimentar `computeNutritionAdherence`. Devuelve `null` si no hay plan activo. |

Helpers de transformacion (puros, no DB):

- `buildWorkoutLogDaySummaries(logs, {dayLimit})`: agrupa series por dia calendario Santiago (`logged_at` → fecha local), cuenta filas como "series", arma `dateLabel`/`subtitle`. (El RPC `getWorkoutHistoryDayCounts` replica esta salida pero agregando en DB.)
- `parseISOAnchor(iso)`: ancla `YYYY-MM-DD` a mediodia LOCAL para restar dias sin off-by-one.

> Paralelismo: el bundle hace 6 cargas en `Promise.all`; `getTodayNutritionBundle` y `getNutritionAdherenceInputs30d` paralelizan sus sub-queries internas. Las queries comparten `React.cache` entre componentes (ej. `getCheckInHistory30Days` la usan WeightWidget + bundle).

---

## 5.6 Records (PRs) y Racha en backend

### Records — `getPersonalRecords(clientId)` (en `dashboard.queries.ts`)

Calculo en TS (no RPC) sobre `workout_logs`:

1. Dos lecturas en paralelo (ambas `weight_kg IS NOT NULL`):
   - `recentLogs`: ultimos 14 dias (`logged_at >= hoy-14d`), orden desc, **limit 120**.
   - `histLogs`: historico completo (`weight_kg, block_id`), **limit 3000** (sin filtro de fecha).
2. Si `recent` vacio → `[]`.
3. Resuelve `block_id → exercise_id` leyendo `workout_blocks` por `in(blockIds)`, y `exercise_id → name` leyendo `exercises`.
4. `maxByExercise`: maximo `weight_kg` historico por ejercicio (sobre `histLogs`).
5. Un log RECIENTE es PR si `weight_kg >= histMax` de ese ejercicio (igualar el max tambien cuenta). Dedup por ejercicio (`seen`), un PR por ejercicio.
6. Ordena por `weightKg` desc, **devuelve top 5**: `{ exerciseId, exerciseName, weightKg, achievedAt }`.

> "Reciente" = logueado en los ultimos 14 dias; el max se compara contra TODO el historico (cap 3000 filas). Solo cuenta peso (`weight_kg`), no reps ni duracion/distancia de las variantes polimorficas.

### Racha — `getDashboardStreak(clientId)` → RPC `get_client_current_streak`

RPC `SECURITY DEFINER` (`supabase/migrations/20260616165712_...sql`). Logica:

1. **IDOR guard**: si `auth.uid() IS NOT NULL`, exige que `p_client_id` sea el propio usuario, O un alumno de su coach (`clients.coach_id = auth.uid()`), O del pool (`current_user_pool_client_ids()`); si no → `RETURN 0`. `auth.uid() IS NULL` (service-role) bypasea (mobile pulse path).
2. Junta fechas de actividad de los ultimos **730 dias** (`UNION`):
   - `DATE(logged_at)` de `workout_logs` del cliente.
   - `log_date` de `daily_nutrition_logs` donde exista `nutrition_meal_logs.is_completed = true`.
3. Ordena fechas desc. Si la mas reciente es anterior a `CURRENT_DATE - 1 day` → racha rota → `RETURN 0` (tolera "ayer").
4. Cuenta dias CONSECUTIVOS hacia atras (cada fecha debe ser exactamente `last - 1 day`; un hueco corta el loop).

> Una racha "cuenta" si ese dia hubo entreno O comida marcada completa. Ventana de mirada 730 dias (cap por la migracion `20260612053000_streak_cap_730d`). La racha del dashboard es DISTINTA de la racha del motor de nutricion (`computeStreak`), que solo mira comidas.

El RPC hermano `get_client_workout_day_counts(p_client_id, p_days_back)` (migracion `20260612051000`) replica las 3 policies de SELECT de `workout_logs` (cliente/coach/pool) y agrega `count(*)` por dia en zona Santiago — usado por la pagina de historial, no por el home.

---

## 5.7 Variante de semana A/B — `programWeekVariant.ts`

`apps/web/src/lib/workout/programWeekVariant.ts` (puro). Lo usan tanto el hero como `workoutAdherence30d`:

- `programWeekIndex1Based(program, now)`: requiere `start_date`; `diffDays = ceil(|now-start| / dia)`; `currentWeek = min(weeks_to_repeat, ceil(diffDays/7))`, min 1. Sin `start_date` → null.
- `weekIndexToVariantLetter`: semanas impares → A, pares → B.
- `workoutPlanMatchesVariant(plan, activeVariant, abMode)`: sin A/B → solo planes variante A (o sin variante); con A/B → solo la variante activa.
- `resolveEffectiveWeekVariant(...)`: variante del ciclo, pero si esa no tiene planes y la otra si, cae a la otra (corrige A/B mal armado donde el alumno quedaba con el programa vacio en semanas "B").

---

## 5.8 `dashboard.actions.ts` y demas server actions del dashboard

### `quickLogWeightAction` — log rapido de peso (`dashboard.actions.ts`)

`'use server'`. Firma `(prev: QuickWeightState, formData) → { error?, success? }` (usada con `useActionState`).

1. Valida con `QuickWeightSchema` (`packages/schemas/client.ts`): `weight` coerce numero `[20,400]`, `coach_slug` string min 1.
2. `user = supabase.auth.getUser()` (GoTrue, NO `getClaims` — es mutacion). Sin user → `{ error: 'No autenticado.' }`.
3. INSERT en `check_ins`: `{ client_id: user.id, weight, energy_level: null, notes: null, date: getTodayInSantiago().iso }`. Es un check-in solo-peso (energia/notas null).
4. `revalidatePath` de `/c/${slug}/dashboard`, `/c/${slug}/check-in`, y `('/c','layout')`. Devuelve `{ success: true }`.

> Identidad: `client_id = user.id` (auth.uid). El `coach_slug` del form solo se usa para revalidar rutas, NUNCA para scoping de la escritura.

UI: `WeightQuickLog.tsx` usa `useActionState`; al `success` limpia el input. Sin optimistic ni cola offline aqui (es una mutacion sincronica server-action).

### `logSetAction` — log rapido de SERIES (hero "Rápido")

Vive en `apps/web/src/app/c/[coach_slug]/workout/[planId]/_actions/workout-log.actions.ts` y lo INVOCA el `QuickLogSheet.tsx` del hero (no es un archivo del dashboard, pero es la persistencia del "log rapido de series").

1. Lee del FormData: `block_id`, `set_number`, opcionales `weight_kg, reps_done, rpe, rir` + espejo polimorfico `actual_duration_sec, actual_distance_m, actual_pace_sec_per_km, actual_hold_sec, actual_avg_hr` (normaliza coma→punto). Desde el hero solo se mandan `block_id`, `set_number` y `weight_kg='0'`.
2. Valida con `WorkoutLogSetSchema` (`packages/schemas/workout.ts`): `block_id` uuid, `set_number` int ≥1, resto opcionales con rangos (`weight_kg ≥0`, `reps_done` int ≥0, `rpe` 1-10, `rir` 0-10, duraciones/HR acotadas).
3. `user = getUser()`; sin user → error.
4. **Upsert idempotente por (block_id, client_id, set_number, dia)**: calcula `[startTs,endTs)` con `getSantiagoUtcBoundsForDay(todayStr)` (maneja DST correctamente). Busca filas existentes del mismo set ese dia:
   - Si existe → UPDATE de la primera; si hay duplicados, los borra (`delete in(duplicateIds)`).
   - Si no → INSERT `{ block_id, client_id: user.id, set_number, ...payload }`.
5. `revalidatePath('/c','layout')` + `revalidatePath('/coach/clients/${user.id}')`.

UI hero (`QuickLogSheet.tsx`): boton "+" por bloque dentro de un `Sheet`. Estado local optimista `loggedByBlock`; `useTransition`; tras `res.success` incrementa el contador y `router.refresh()`. Cap por `b.sets` (no deja loguear mas series que las del plan). No tiene cola offline.

### `upsertDailyHabits` / `getDailyHabits` — marcar habitos

Viven en `apps/web/src/app/c/[coach_slug]/nutrition/_actions/habits.actions.ts`. El widget `HabitsTrackerWidget` (sidebar del dashboard) las consume.

- `getDailyHabits(clientId, logDate)`: `getUser()`; **cruza `user.id !== clientId` → null** (defensa de identidad); lee `daily_habits` por `client_id+log_date`.
  - El widget realmente carga con `getTodayHabits` (`React.cache`, lee `daily_habits` con `select` de columnas, scoping `client_id=userId, log_date=hoy`).
- `upsertDailyHabits(raw)`: valida `UpsertHabitsSchema` (`clientId` uuid, `logDate` regex `YYYY-MM-DD`, `coachSlug`, `waterMl` int 0-10000, `steps` 0-100000, `sleepHours` 0-24, `fastingHours` 0-72, `supplements[]` ≤20, `notes` ≤500). `getUser()`; **rechaza si `user.id !== clientId`** → `'No autorizado'`. UPSERT en `daily_habits` con `onConflict: 'client_id,log_date'` (un registro por dia). `revalidatePath('/c/${coachSlug}/nutrition')`.

### `toggleMealCompletion` — marcar comida (resumen diario del dashboard)

Vive en `nutrition/_actions/nutrition.actions.ts`; el dashboard la usa via `MealCompletionRow.tsx`. Persiste el toggle de comida en `nutrition_meal_logs`/`daily_nutrition_logs`. ESTE flujo SI tiene cola offline (§5.9).

---

## 5.9 Cola offline (offline-safety)

Solo el toggle de COMIDA tiene cola offline. `apps/web/src/lib/nutrition-offline-queue.ts`:

- Cola en `localStorage` bajo `NUTRITION_OFFLINE_TOGGLE_QUEUE_KEY = 'eva_offline_toggle_queue'`.
- `enqueueNutritionOfflineToggle(item)`: dedup por `mealId + date` (ultimo estado gana). Item: `{ userId, planId, mealId, completed, logId?, coachSlug, date }`.
- `isLikelyOfflineError(err)`: true si `navigator.onLine === false` o el mensaje matchea `failed to fetch|networkerror|network request failed|load failed|fetch`.

`MealCompletionRow.tsx` (dashboard nutrition summary): `useOptimistic` para el check; en `startTransition` llama `toggleMealCompletion(...)`. Si falla con error de red (`isLikelyOfflineError`) → encola + toast "Sin conexion — se sincronizara al volver la señal" + analytics `nutrition_meal_toggle_queued`. Si falla por otra razon → toast de error. El optimismo se mantiene visualmente.

> El log rapido de peso (`quickLogWeightAction`) y el log rapido de series (`logSetAction`) NO tienen cola offline: son server actions sincronas; si fallan offline, fallan (el peso muestra `state.error`; el set no incrementa el contador). La unica superficie offline-safe del dashboard es el marcado de comidas.

Otro estado en `localStorage`: `WelcomeModal.tsx` guarda la version del modal dismisseado (`STORAGE_KEY`) para no re-mostrarlo.

---

## 5.10 Invariantes (resumen)

- **Identidad via `auth.uid()`**: lectura usa `getClientRootUser()` (`getClaims()`, JWT local, sin round-trip a GoTrue). Mutaciones usan `supabase.auth.getUser()`. El `clientId`/`coach_slug` del body se usa para revalidar rutas y para macros, NUNCA para scoping de escritura; donde llega `clientId` por parametro (`upsertDailyHabits`, `getDailyHabits`) se cruza `user.id !== clientId` y se rechaza.
- **Scoping de lectura**: todas las queries del dashboard filtran por `client_id/clients.id = userId`. RLS encima acota (el alumno solo ve lo propio; `clients.id = auth.uid()` techo).
- **RPCs `SECURITY DEFINER`** (`get_client_current_streak`, `get_client_workout_day_counts`, `get_clients_last_workout_date`): incluyen IDOR guard que valida ownership (self / coach / pool) y bypasea solo cuando `auth.uid() IS NULL` (service-role del mobile pulse).
- **Idempotencia del log de series**: upsert por `(block_id, client_id, set_number, dia-Santiago)` con limpieza de duplicados → re-tocar "+" no duplica filas; el conteo de series del hero dedup por `block_id:set_number`.
- **Habitos**: 1 fila por `(client_id, log_date)` via `onConflict`.
- **Peso rapido**: 1 INSERT en `check_ins` por toque (energia/notas null); puede generar multiples filas el mismo dia (no upsert) — el WeightWidget toma la ultima por `date`/`created_at`.
- **Zona horaria**: todo "hoy" / ventanas / agrupacion por dia es `America/Santiago`, con manejo de DST en `getSantiagoUtcBoundsForDay` (offset via `Intl.formatToParts`, no via TZ del host).
- **Offline-safety**: solo el toggle de comida persiste en cola `localStorage` (dedup por meal+fecha). El resto de registros rapidos son sincronos.
- **Adherencia rango = suma/suma** (nutricion) y **completados/planificados** (entreno): nunca promedio de % diarios.
- **Fail-OPEN del dominio nutricion**: con `FEATURE_PREFS_ENABLED` OFF nada se oculta; el gate resuelve por scope del alumno (cubre "sin plan").
