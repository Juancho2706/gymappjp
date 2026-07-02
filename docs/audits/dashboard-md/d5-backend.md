# 5. Backend: metricas, attention score, pulso e ingresos

Esta es la seccion mas tecnica del dashboard del coach (`/coach/dashboard`). Cubre a fondo el motor de datos que lo alimenta. Los archivos canonicos son:

- `apps/web/src/services/dashboard.service.ts` — el motor por-alumno: `DashboardService`, `calculateAttentionScore`, `DirectoryPulseRow`, mappers, y todos los algoritmos de calculo (1RM Epley, adherencia, plan meta, nutricion).
- `apps/web/src/app/coach/dashboard/_data/dashboard.queries.ts` — la orquestacion de TODO el dashboard: `getCoachDashboardDataV2`, `getCoachDashboardDataInner`, ingresos/MRR, agenda, riesgo, charts.
- `apps/web/src/app/coach/dashboard/_actions/dashboard.actions.ts` — server actions delgadas que re-exponen adherencia/nutricion.
- `apps/web/src/app/coach/dashboard/_actions/onboarding-guide.actions.ts` — persistencia del estado del guia de onboarding.
- `apps/web/src/lib/coach/directory-pulse-cache.ts` — el wrapper `React.cache` que evita recomputar el pulse dos veces por request.

Dependencias que se siguieron: `@eva/nutrition-engine` (`computeNutritionAdherence`, `macros.ts`), `apps/web/src/services/auth/workspace.service.ts` (scope org), `apps/web/src/infrastructure/db/coach.repository.ts` (queries de `clients`/`coaches`), `apps/web/src/lib/date-utils.ts` (zona Santiago) y las RPC de Postgres en `supabase/migrations/`.

---

## 5.1 Mapa de capas y flujo de datos

El dashboard respeta el data-flow obligatorio (`_data` → `services` → repository/RPC → Supabase). No hay accesos directos a Supabase desde la pagina.

1. **RSC / page** llama a `getCoachDashboardDataV2(userId)` (o a la variante `WithClient`).
2. `getCoachDashboardDataV2` resuelve el **scope org** del coach (`resolveCoachDashboardOrgScope`), corre `getCoachDashboardDataInner` (la macro-query) y obtiene el **pulse** cacheado (`getCachedDirectoryPulse`).
3. `getCachedDirectoryPulse` (`React.cache`) construye `new DashboardService(supabase).getDirectoryPulse(coachId, orgId)`.
4. `DashboardService.getDirectoryPulse` calcula **todas las metricas por alumno** (`DirectoryPulseRow[]`) y de ahi se derivan KPIs agregados, attention score, agenda y top de riesgo.

El `getCoachDashboardDataInner` ya recibe el pulse (via `pulseOverride` o `getCachedDirectoryPulse`) para no recalcularlo. Es la pieza clave anti-doble-computo: el pulse es caro (multiples queries por chunk de alumnos) y `React.cache` garantiza **una sola carga por request** aunque lo pidan el bloque de stats, el directorio y las server actions.

> Nota de cache: el comentario en `directory-pulse-cache.ts` aclara que **no se usa `unstable_cache`** porque el pulse depende de `cookies()` via Supabase SSR y eso rompe el RSC en prod. Solo se usa `React.cache` (dedup por request, no persistente). Existe `DIRECTORY_PULSE_CACHE_TAG = 'directory-pulse'` reservado para futuras invalidaciones con `revalidateTag`, hoy no cableado.

---

## 5.2 `DirectoryPulseRow`: la fila canonica por alumno

`DirectoryPulseRow` (en `dashboard.service.ts`) es el contrato unico de "todo lo que sabemos de un alumno para el War Room". Campos y su origen:

| Campo | Tipo | Que es | De donde sale |
|---|---|---|---|
| `clientId` | `string` | UUID del alumno | `clients.id` |
| `clientName` | `string` | Nombre | `clients.full_name` |
| `percentage` | `number` | Adherencia de entreno (semana actual, %) | `workout_logs` 7d / sets planificados |
| `lastPlan` | `string` | Nombre del plan del ultimo log de la semana | `workout_logs.plan_name_at_log` |
| `completedSets` | `number` | Conteo de logs de la ultima semana | `workout_logs` 7d |
| `totalSets` | `number` | Sets planificados del programa activo | RPC `get_workout_program_planned_set_totals` |
| `consumed` | `{cal,prot,carb,fat}` | Macros consumidos (rango) | motor `computeNutritionAdherence` |
| `target` | `{cal,prot,carb,fat}` | Macros objetivo (rango) | snapshots `target_*_at_log` |
| `nutritionPercentage` | `number` | Adherencia de nutricion (%) | `computeNutritionAdherence.compliancePct` |
| `lastWorkoutDate` | `string \| null` | Ultimo entreno | RPC `get_clients_last_workout_date` (MAX server-side) |
| `lastCheckinDate` | `string \| null` | Ultimo check-in | `check_ins.created_at` |
| `currentWeight` | `number \| null` | Peso mas reciente | `check_ins.weight` |
| `weightDelta7d` | `number \| null` | Delta de peso vs ~7d atras | `check_ins.weight` |
| `weightHistory30d` | `{date,value}[]` | Serie de peso 30d | `check_ins` |
| `adherenceHistory4w` | `number[]` (len 4) | Adherencia de entreno por semana, ultimas 4 | `workout_logs` 35d |
| `oneRMDelta` | `number \| null` | Tendencia de fuerza (%) | `workout_logs` (Epley) |
| `planDaysRemaining` | `number \| null` | Dias restantes del programa | `workout_programs` (meta) |
| `planCurrentWeek` | `number \| null` | Semana en curso del plan | `workout_programs.start_date` |
| `planTotalWeeks` | `number \| null` | Semanas totales | `workout_programs.weeks_to_repeat` |
| `attentionScore` | `number` | Puntaje de riesgo | `calculateAttentionScore` |
| `attentionFlags` | `AttentionFlag[]` | Banderas de riesgo | `calculateAttentionScore` |
| `streak` | `number` | Racha de actividad (dias) | RPC `get_coach_clients_streaks` / `get_clients_streaks_by_ids` |
| `latestEnergyLevel` | `number \| null` | Energia del ultimo check-in | `check_ins.energy_level` |

Esta fila es la **fuente unica** del directorio, las stats de adherencia, las stats de nutricion, la agenda y el top de riesgo — todos son proyecciones de esto (ver mappers en 5.7).

---

## 5.3 `calculateAttentionScore` — EL algoritmo de riesgo

Es la pieza estrella. Funcion pura: dado `ClientDataForAttention`, devuelve `{ score, flags }`. No toca DB. Vive en `dashboard.service.ts`.

### Inputs (`ClientDataForAttention`)

```
lastCheckinDate: string | null
lastWorkoutDate: string | null
hasActiveWorkoutProgram: boolean
nutritionCompliance: number          // 0..100, el nutritionPercentage del pulse
planDaysRemaining: number | null
oneRMDelta: number | null            // % de cambio de 1RM (puede ser negativo)
```

Estos seis inputs se arman en `getDirectoryPulseInner` por alumno y se pasan tal cual (ver 5.4 al final).

### Constantes (umbrales fijos, top del archivo)

```
CHECKIN_OVERDUE_AFTER_DAYS = 30   // check-ins son mensuales
WORKOUT_INACTIVE_AFTER_DAYS = 7
```

### Senales, umbrales y ponderacion

El score arranca en 0 y se suma por cada bandera disparada. **No hay cap superior**; el maximo teorico es 100 (25+25+20+15+15) — los dos sub-casos de plan (15 vencido vs 8 por-vencer) son mutuamente excluyentes.

| # | Senal | Condicion | Flag | Puntos |
|---|---|---|---|---|
| 1 | **Sin check-in** | `lastCheckinDate` existe **y** `differenceInDays(hoy, lastCheckinDate) > 30` | `SIN_CHECKIN_1M` | +25 |
| 2 | **Sin ejercicio** | tiene programa activo **y** (no hay `lastWorkoutDate`) **o** `differenceInDays(hoy, lastWorkoutDate) >= 7` | `SIN_EJERCICIO_7D` | +25 |
| 3 | **Nutricion en riesgo** | `nutritionCompliance < 60` | `NUTRICION_RIESGO` | +20 |
| 4a | **Programa vencido** | `planDaysRemaining !== null` **y** `<= 0` | `PROGRAMA_VENCIDO` | +15 |
| 4b | **Programa por vencer** | `planDaysRemaining !== null` **y** `<= 3` (else del 4a) | `PROGRAMA_POR_VENCER` | +8 |
| 5 | **Fuerza cayendo** | `oneRMDelta !== null` **y** `< -5` | `FUERZA_CAYENDO` | +15 |

Detalles finos que importan para feature parity:

- **Check-in (#1):** solo dispara si el alumno **ya tuvo al menos un check-in** (`lastCheckinDate` no nulo). Un alumno que nunca hizo check-in NO suma este flag — decision explicita (comentario: "alertar solo si ya hubo al menos un check-in"). El umbral es **estrictamente mayor a 30** (`> 30`).
- **Ejercicio (#2):** condicionado a `hasActiveWorkoutProgram`. Si no hay programa activo, no se evalua (no penaliza al que no tiene plan asignado). Sin programa activo → este flag jamas se dispara. Con programa: si nunca entreno (`lastWorkoutDate` nulo) suma directo; si entreno, umbral `>= 7` (mayor-o-igual, no estricto).
- **Nutricion (#3):** umbral `< 60`. Ojo: si el alumno no tiene plan de nutricion, `nutritionPercentage` cae a 0 (ver 5.5), asi que un alumno sin nutricion configurada **siempre** dispara `NUTRICION_RIESGO`. Es un sesgo conocido del calculo de pulse.
- **Plan (#4):** `else if` — vencido (≤0) tiene prioridad sobre por-vencer (≤3). Requiere `planDaysRemaining` calculado (no nulo); programas sin fecha de fin ni duracion ni semanas → `null` → no dispara.
- **Fuerza (#5):** dispara solo con caida real `< -5%`. Subidas o caidas leves no penalizan. `oneRMDelta` nulo (datos insuficientes) → no dispara.

### Como se ordena el foco de riesgo

El ordenamiento del "foco" NO esta en `calculateAttentionScore` (esa solo puntua). Vive en `getCoachDashboardDataInner` → `topRiskClients`:

```
const criticalFlags = ['SIN_CHECKIN_1M', 'SIN_EJERCICIO_7D']
topRiskClients = pulse
  .filter(row => row.attentionFlags.some(flag => criticalFlags.includes(flag)))
  .sort((a, b) => b.attentionScore - a.attentionScore)   // score descendente
  .slice(0, 5)
  .map(row => ({ clientId, clientName, attentionScore, flags, label }))
```

Reglas de negocio del top de riesgo:

- **Solo entran** alumnos con al menos un flag **critico** (`SIN_CHECKIN_1M` o `SIN_EJERCICIO_7D`). Un alumno que solo tiene `NUTRICION_RIESGO` o `FUERZA_CAYENDO` **no** aparece en el top de riesgo (aunque su score sea > 0).
- Se **ordena por `attentionScore` descendente** y se cortan los **5 primeros**.
- El `label` se toma del **primer flag** del alumno via `FLAG_LABELS` (mapa en `dashboard.queries.ts`). Si no hubiera flags (no ocurre por el filtro), cae a `'Seguimiento recomendado'`.

`FLAG_LABELS` (texto exacto que viaja al frontend):

| Flag | Label |
|---|---|
| `SIN_CHECKIN_1M` | `Adherencia critica · sin check-in en 1 mes` |
| `SIN_EJERCICIO_7D` | `Adherencia critica · sin ejercicio en 7 dias` |
| `NUTRICION_RIESGO` | `Nutricion en riesgo` |
| `PROGRAMA_VENCIDO` | `Programa vencido` |
| `PROGRAMA_POR_VENCER` | `Programa por vencer` |
| `FUERZA_CAYENDO` | `Fuerza cayendo` |

El KPI `riskCount` que muestra el dashboard es `base.topRiskClients.length` (es decir, **0..5**, no el total de alumnos en riesgo). Esto se calcula en `getCoachDashboardDataV2` (`const riskCount = base.topRiskClients.length`).

---

## 5.4 `DirectoryPulseRow`: como se COMPUTA cada metrica (a fondo)

Todo se computa en `DashboardService.getDirectoryPulseInner(coachId, orgId)`. El metodo publico `getDirectoryPulse` solo lo envuelve en `measureServer(...)` para instrumentacion de performance.

### 5.4.0 Carga de datos (paralelismo + chunking)

Constantes anti-limite de URL/PostgREST:

```
CLIENT_ID_IN_CHUNK = 120     // trocea .in(client_ids) para no reventar el largo de URL
PROGRAM_ID_RPC_CHUNK = 80    // trocea program_ids al RPC de sets planificados
WORKOUT_LOGS_ROW_CAP = 2000  // tope anti-runaway de filas de workout_logs por chunk
```

Ventanas de tiempo base:

```
now       = new Date()
lastWeekStr = now - 7d        (ISO)   → adherencia "semana actual"
logsFrom    = now - 35d       (ISO)   → ventana de logs (cubre 4 semanas + colchon)
```

Secuencia de carga (mezcla de `Promise.all` por chunk + algunos pasos secuenciales):

1. **`clients`** — `select('id, full_name').eq('coach_id', coachId)` con scope org aplicado (ver 5.8). Si no hay clientes → `[]` (corte temprano).
2. **`workout_logs` (35d)** — por chunk de 120: `select('client_id, logged_at, weight_kg, reps_done, plan_name_at_log').in(client_ids).gte('logged_at', logsFrom).limit(2000)`. Estos logs alimentan adherencia, 1RM y nombre de plan. NO se usan para `lastWorkoutDate` (eso es por RPC, para no depender del `limit`).
3. **RPC `get_clients_last_workout_date(p_client_ids, p_since)`** — por chunk: devuelve `MAX(logged_at)` por alumno via `GROUP BY` server-side. Esto **bypasea** el cap de filas de PostgREST: la fecha de ultimo entreno es exacta aunque un chunk hubiera truncado filas. Resultado en `lastWorkoutDateMap`.
4. **`check_ins` (35d)** — por chunk: `select('client_id, created_at, date, weight, energy_level').gte('created_at', logsFrom)`. Alimenta peso, delta, historial, ultimo check-in y energia.
5. **`workout_programs` activos** — por chunk: `select(... is_active, start_date, end_date, weeks_to_repeat, duration_days ...).eq('is_active', true).order('created_at' desc)`. Alimenta plan meta y sets planificados.
6. Se mergean los chunks (`flatMap`) y se indexan en `Map` por `client_id`: `logsByClient`, `checksByClient`, y `programByClient` (el **programa activo mas reciente** por alumno; se ordena por `created_at` desc y se queda con el primero por cliente).
7. **RPC `get_workout_program_planned_set_totals(p_program_ids)`** — por chunk de 80 program_ids unicos: suma `workout_blocks.sets` de todos los planes del programa. Resultado en `plannedSetTotals`.
8. **`daily_nutrition_logs` (desde `lastWeek`)** — por chunk: select DENORMALIZADO que trae anidado `nutrition_meal_logs → nutrition_meals → food_items → foods`, mas los snapshots de target (`target_calories_at_log`, etc.) y `plan_name_at_log`. Filtra `log_date >= logDateCutoff` (= la fecha YMD de `lastWeekStr`). Resultado en `nutritionMap`.
9. **Streaks** — dos RPC (ver 5.6): primero batch por coach, fallback batch-by-ids para los que falten.

Toda esta carga produce mapas indexados por `client_id` antes del bucle de calculo, por lo que el bucle final **no hace ningun query** (cero N+1).

### 5.4.1 Adherencia de entreno — `percentage` y `completedSets`/`totalSets`

```
logsLastWeek = logs.filter(l => new Date(l.logged_at) >= new Date(lastWeekStr))   // ultimos 7d
logsCount    = logsLastWeek.length                                                 // = completedSets
totalPlannedSets = plannedSetTotals.get(activeProgram.id)
                   ?? plannedSetsFromProgram(activeProgram)   // fallback en memoria
                   (0 si no hay programa activo)
percentage = totalPlannedSets > 0
             ? min(round(logsCount / totalPlannedSets * 100), 100)
             : 0
```

- `completedSets` = numero de **filas** de `workout_logs` en los ultimos 7 dias (cada log = un set registrado).
- `totalSets` = suma de `workout_blocks.sets` del programa activo (via RPC, o `plannedSetsFromProgram` que recorre `workout_plans[].workout_blocks[].sets` si el RPC no respondio).
- `percentage` = `completed/total`, **cap a 100%**. Si no hay programa o no hay sets, es 0.

`lastPlan`: nombre del plan del **ultimo** log de la semana (`logsLastWeek[last].plan_name_at_log`), o `'Plan Actual'` si el campo es nulo, o `'Sin actividad reciente'` si no hubo logs en la semana.

### 5.4.2 `lastWorkoutDate`

```
lastWorkoutDate = lastWorkoutDateMap.get(id)   // RPC: MAX exacto server-side
                  ?? (logs.length > 0 ? reduce(max logged_at) : null)  // fallback en memoria
```

La fuente preferida es el RPC (MAX exacto sin truncamiento). El reduce en memoria solo aplica si el RPC no devolvio nada para ese alumno.

### 5.4.3 Check-ins: `lastCheckinDate`, peso, delta, historial, energia

Se ordenan los check-ins por `created_at` desc (`sortedChecks`).

- `lastCheckinDate` = `sortedChecks[0].created_at` (o null).
- `latestEnergyLevel` = `sortedChecks[0].energy_level` (o null).
- `currentWeight` = peso del check-in mas reciente **que tenga peso** (`withWeight = sortedChecks.filter(c.weight != null)`, primer elemento). Un check-in sin peso no rompe la metrica.
- `weightHistory30d` = check-ins con peso de los ultimos 30d, **ascendente por fecha**, mapeados a `{ date: c.date || c.created_at.slice(0,10), value: c.weight }`. Prefiere `check_ins.date` (la fecha logica del alumno) y cae a la fecha del `created_at`.
- `weightDelta7d` = diferencia de peso vs el **primer** check-in con peso que tenga **≥7 dias de antiguedad** (`withWeight.find(c => differenceInDays(now, created_at) >= 7)`), redondeado a 1 decimal. Si no hay referencia de ≥7d, queda `null`.

### 5.4.4 `adherenceHistory4w` (sparkline de 4 semanas)

```
for w = 3..0:
   windowEnd   = now - w*7
   windowStart = now - (w+1)*7
   push( adherenceForWindow(logs, windowStart, windowEnd, totalPlannedSets) )
```

`adherenceForWindow` cuenta logs en `[windowStart, windowEnd)` y aplica `min(round(count/totalPlannedSets*100), 100)` (0 si no hay sets). El array sale **del mas antiguo al mas reciente** (semana -4 → semana actual). La ventana de 35d de carga garantiza cobertura completa de las 4 semanas.

### 5.4.5 `oneRMDelta` — tendencia de fuerza (Epley)

Algoritmo (funciones `epley1RM`, `avgDailyMaxEpley`, `computeOneRMDelta`):

- **1RM estimado** por set: `epley1RM(weight, reps) = weight * (1 + reps/30)`.
- **Promedio de 1RM diario maximo** en un rango `[start, end)` (`avgDailyMaxEpley`): filtra logs con `weight_kg` y `reps_done` no nulos y `weight_kg > 0`; por **dia** se queda con el **maximo** Epley (mejor set del dia); promedia esos maximos diarios. `null` si no hay datos en el rango.
- **Delta** (`computeOneRMDelta`): compara dos ventanas de 7 dias:
  - `thisAvg` = avg sobre `[now-7, now)`
  - `prevAvg` = avg sobre `[now-14, now-7)`
  - si alguna es `null` o `prevAvg <= 0` → `null`
  - si no: `round((thisAvg - prevAvg) / prevAvg * 100)` (% entero, con signo)

Este delta alimenta la senal `FUERZA_CAYENDO` (dispara si `< -5`).

### 5.4.6 Plan meta — `planDaysRemaining`, `planCurrentWeek`, `planTotalWeeks`

Funcion `planMeta(program, now)`. Se resuelve la **fecha de fin** del programa por prioridad:

1. `program.end_date` (si existe) → `endDate = parseDay(end_date)`.
2. else si `start_date` + `weeks_to_repeat > 0` → `endDate = start + weeks*7 dias`.
3. else si `start_date` + `duration_days > 0` → `endDate = start + duration_days`.
4. else → sin fecha de fin → `planDaysRemaining = null`.

Luego:

- `planDaysRemaining = differenceInDays(endDate, now)` (puede ser negativo = vencido).
- `planTotalWeeks = program.weeks_to_repeat` (si es number, si no `null`).
- `planCurrentWeek`: con `start_date`, `daysIn = max(0, differenceInDays(now, start))`, `week = floor(daysIn/7) + 1`, capado a `planTotalWeeks` si existe (`min(week, planTotalWeeks)`).

`parseDay` ancla fechas YMD a mediodia (`${d}T12:00:00`) para evitar saltos por timezone.

### 5.4.7 Nutricion — `consumed`, `target`, `nutritionPercentage`

Es el calculo mas elaborado (ver 5.5 completo). En resumen: se reconstruyen las entradas del motor canonico desde el select denormalizado y se delega TODO a `computeNutritionAdherence`. El resultado:

```
consumed = { cal, prot, carb, fat }  = summary.consumedMacros
target   = { cal, prot, carb, fat }  = summary.targetMacros
nutritionPercentage = round(summary.compliancePct)
```

### 5.4.8 Cierre del bucle: armado del attention score

Al final de cada alumno, con todo computado, se llama:

```
const { score, flags } = calculateAttentionScore({
  lastCheckinDate,
  lastWorkoutDate,
  hasActiveWorkoutProgram: activeProgram != null,
  nutritionCompliance: nutritionPercentage,
  planDaysRemaining,
  oneRMDelta,
})
```

y se hace `rows.push({ ...todas las metricas..., attentionScore: score, attentionFlags: flags, streak: streakMap.get(id) ?? 0 })`.

---

## 5.5 Nutricion: del select denormalizado al motor canonico

Esta es la parte que el documento de backend debe dejar clarisima porque hubo un bug historico (el calculo manual ignoraba unidades g/ml/un). Hoy se delega al motor `@eva/nutrition-engine`.

### Reconstruccion de las entradas del motor

Por alumno se recorren sus `daily_nutrition_logs` (`dailyLogs = nutritionMap.get(id)`) y se arman tres estructuras:

- **`mealsById`** (`Map<string, AdherenceMeal>`): comidas del plan **deduplicadas por id**. Por cada `nutrition_meal_logs.nutrition_meals` se normaliza con `normalizeMealForMacros(nm)` (convierte `food_items`+`foods` al shape de macros) y se adjunta `day_of_week` para el filtro por dia de semana.
- **`logsByDate`** (`Map<fecha, MealLogRow[]>`): por cada `daily_nutrition_logs.log_date`, las filas `{ meal_id, is_completed, consumed_quantity }`.
- **`targetByDate`** (`Map<fecha, MacroTarget>`): snapshot de objetivos por dia tomado de las columnas `target_calories_at_log`, `target_protein_at_log`, `target_carbs_at_log`, `target_fats_at_log` (numerizadas, 0 si nulas). Esto significa que el target es el **congelado al momento del log**, no el target vivo del plan actual.
- `liveTarget = { 0,0,0,0 }` — fallback vacio cuando una fecha no tiene snapshot.

### Llamada al motor

```
computeNutritionAdherence({
  meals: [...mealsById.values()],
  logsByDate,
  targetByDate,
  liveTarget,
  range: { startIso: logDateCutoff, endIso: nutritionEndIso },   // ~7 dias (lastWeek → hoy Santiago)
  dayOfWeekResolver: getNutritionDayOfWeekFromIsoYmdInSantiago,
  mealAppliesOn: (meal, isoYmd) => nutritionMealAppliesOnIsoYmdInSantiago(meal, isoYmd),
})
```

- `range.startIso = logDateCutoff` = la parte YMD de `lastWeekStr` (≈ hoy-7d).
- `range.endIso = nutritionEndIso = getTodayInSantiago(now).iso` (hoy en zona America/Santiago).
- El **dia de semana** se resuelve en zona Santiago (convencion 1=Lun…7=Dom). `day_of_week == null` en una comida = aplica todos los dias.

### Que hace el motor por dentro (`packages/nutrition-engine/adherence.ts`)

Invariantes criticas (documentadas en el propio archivo):

- **Compliance diario** = `mealsDone / applicableMeals` (comidas aplicables ese dia segun `day_of_week`).
- **Compliance de RANGO** = `sum(mealsDone) / sum(applicableMeals)` × 100 — **NUNCA** el promedio de los % diarios (evita sesgo por dias con pocas comidas). Este es el `compliancePct` que termina en `nutritionPercentage` (redondeado).
- **`consumedMacros`** via `calculateConsumedMacrosWithCompletionFallback`:
  - Suma macros de las comidas **completadas y aplicables**, escaladas por `consumed_quantity` (porcion %, 0..1) si esta presente; ausencia de % = 100% (modo binario).
  - Las macros por item usan `calculateFoodItemMacros` (en `macros.ts`), que maneja correctamente las unidades: `g`/`ml` → `factor = qty/100`; `un` (contables) → `factor = (qty × serving_size)/100`. Este es justamente el fix del bug que el calculo manual previo ignoraba.
  - **Fallback** si las comidas no tienen datos de macros (`hasAnyMealMacroData` falso): reparte el target (`goals`) proporcional a `comidas completadas / total comidas` (ponderado por porcion). Esto permite que la adherencia funcione incluso con planes que no tienen macros cargados.
- **`targetMacros`** del rango = suma de los target por dia (snapshot o liveTarget).
- **`loggingEngagementPct`** = `daysWithLog / rangeDays` × 100 — campo separado, no fusionado en compliance (no se usa en el pulse del dashboard pero existe en el output).
- **streak de nutricion** (`computeStreak`): cuenta dias con `mealsDone >= applicableMeals` (100%); dias sin comidas aplicables son neutros. **Este streak del motor NO es el `streak` del pulse** — el pulse usa el RPC de Postgres (ver 5.6).

### Proyeccion al pulse

```
consumed = { cal: summary.consumedMacros.calories, prot: ..., carb: ..., fat: ... }
target   = { cal: summary.targetMacros.calories, ... }
nutritionPercentage = round(summary.compliancePct)
```

> Consecuencia para riesgo: si un alumno no tiene comidas aplicables / sin plan de nutricion, `compliancePct = 0` → `nutritionPercentage = 0` → `< 60` → siempre dispara `NUTRICION_RIESGO`.

---

## 5.6 Streak (racha) — RPC batch + fallback

El `streak` del pulse mide **dias consecutivos de actividad** (entreno o nutricion completada) y se calcula en Postgres, no en JS.

### Estrategia de dos pasos (en `getDirectoryPulseInner`)

1. **Batch por coach** — `rpc('get_coach_clients_streaks', { p_coach_id: coachId })`. RPC `SECURITY DEFINER` con **guard**: `auth.uid() = p_coach_id`. Funciona solo en sesion `authenticated` (web/RSC). Bajo `service_role` (ruta mobile) el guard hace `RETURN` vacio. Resultado a `streakMap`.
2. **Fallback batch-by-ids** — si `streakMap.size < clientIds.length`, junta los `missing` y llama `rpc('get_clients_streaks_by_ids', { p_client_ids: missing })` en **un solo round-trip**. Guard multi-via: `auth.uid() IS NULL` (service_role) **o** coach dueño **o** el propio cliente **o** pool team. Esto elimina el viejo N+1 (una llamada por alumno) y garantiza que **todos** reciban su streak real.

`streak` final del alumno = `streakMap.get(id) ?? 0`.

### Como Postgres computa la racha (`get_client_current_streak`)

`SECURITY DEFINER`, `plpgsql`:

- Junta (UNION) las **fechas de actividad** del alumno: `DATE(workout_logs.logged_at)` ∪ `daily_nutrition_logs.log_date` donde el `nutrition_meal_logs.is_completed = true`.
- Ordena las fechas descendente (array).
- Si la fecha mas reciente es **anterior a ayer** (`< CURRENT_DATE - 1 day`), la racha es **0** (se rompio).
- Si no, arranca en 1 y recorre hacia atras sumando 1 por cada dia **consecutivo** (`v_date = v_last_date - 1 day`); corta cuando hay un hueco.

Las RPC `get_coach_clients_streaks` y `get_clients_streaks_by_ids` simplemente envuelven a `get_client_current_streak` por alumno, server-side.

---

## 5.7 Mappers: `mapDirectoryPulseToClientStats` / Adherence / Nutrition

Los tres mappers son **proyecciones puras** del `DirectoryPulseRow[]` — re-encuadran el pulse para distintos consumidores sin recalcular nada.

### `baseClientStatFields(p)`

Campos comunes que ambos mappers heredan: `clientId, clientName, lastPlan, lastWorkoutDate, lastCheckinDate, currentWeight, weightDelta7d, weightHistory30d, adherenceHistory4w, oneRMDelta, planDaysRemaining, planCurrentWeek, planTotalWeeks, attentionScore, attentionFlags, streak, latestEnergyLevel`.

### `mapDirectoryPulseToAdherenceStats(pulse)`

Vista **centrada en entreno**. Agrega sobre la base:

- `percentage` = `p.percentage` (adherencia de entreno)
- `completedSets` = `p.completedSets`
- `totalSets` = `p.totalSets`
- `nutritionCompliance` = `p.nutritionPercentage` (la nutricion entra como campo secundario)

### `mapDirectoryPulseToNutritionStats(pulse)`

Vista **centrada en nutricion**. Agrega sobre la base:

- `percentage` = `p.nutritionPercentage` (aqui el % principal es el de nutricion)
- `consumed` = `p.consumed`
- `target` = `p.target`
- `adherence` = `p.percentage` (la adherencia de entreno entra como campo secundario)

### `mapDirectoryPulseToClientStats(pulse, mode)`

Overload despachador: `mode === 'adherence'` → `mapDirectoryPulseToAdherenceStats`; `mode === 'nutrition'` → `mapDirectoryPulseToNutritionStats`. Tipado con sobrecargas para devolver el shape correcto.

> Nota de simetria: en la vista de adherencia, `percentage` = entreno y la nutricion es secundaria (`nutritionCompliance`); en la vista de nutricion, `percentage` = nutricion y el entreno es secundario (`adherence`). El frontend elige el mapper segun la pestana.

Estos mappers tambien alimentan los promedios globales del dashboard:

```
avgAdherence = round(mean(adherenceStats[].percentage))   // 0 si no hay alumnos
avgNutrition = round(mean(nutritionStats[].percentage))    // 0 si no hay alumnos
```

(calculados en `getCoachDashboardDataInner`). Las server actions `getAdherenceStats()` / `getNutritionStats()` (`dashboard.actions.ts`) son **thin wrappers**: validan `auth.getUser()`, toman el pulse cacheado del usuario y devuelven el mapper correspondiente — no recomputan.

---

## 5.8 Scoping por contexto (org/team/standalone)

El scope org es transversal y se resuelve **siempre desde la identidad del usuario**, nunca desde el body del request (regla de seguridad del proyecto).

### Resolucion del scope (`resolveCoachDashboardOrgScope`)

```
workspace = resolvePreferredWorkspace(db, userId)
return workspace?.type === 'enterprise_coach' ? workspace.orgId : null
```

`resolvePreferredWorkspace` (en `workspace.service.ts`) combina la preferencia guardada (`findWorkspacePreference`) con la lista de workspaces del usuario (`listUserWorkspaces`) y elige el activo (`pickPreferredWorkspace`: 1 workspace → ese; N con preferencia que matchea → ese; si no → null). Un coach standalone resuelve `orgId = null`; un coach actuando como enterprise_coach resuelve el `orgId` de su org.

### Como se aplica el scope

- En `getDirectoryPulseInner`: `if (orgId !== undefined) clientsQuery = orgId ? .eq('org_id', orgId) : .is('org_id', null)`. Es decir: `orgId` definido y truthy → filtra esa org; `orgId = null` → solo clientes **standalone** (`org_id IS NULL`); `orgId = undefined` → **sin filtro** (todos los del coach, ruta usada por mappers/actions que no pasan org).
- En `getCoachDashboardDataInner`: helper `applyOrgScope(query, column, orgId)` con la misma semantica (`eq` vs `is null`). Se aplica a `check_ins`, `workout_programs`, `workout_logs`, `client_payments`, `clients` (via repo). Para joins se scopea por la columna del join (`clients.org_id`).
- **Excepcion documentada:** `workout_plans` NO tiene columna `org_id` (el scope org va por el cliente, no por la tabla). Aplicar `applyOrgScope(...,'org_id')` ahi daba **400** para coaches enterprise. El conteo de planes se acota solo por `coach_id`.

Las RPC tambien respetan el scope/seguridad via sus guards `SECURITY DEFINER` (`auth.uid() = coach`, o multi-via en las batch-by-ids).

---

## 5.9 Ingresos / MRR del dashboard

El "MRR" del dashboard del coach **no** es el MRR de la plataforma (eso es del panel admin). Aqui es el **revenue que el coach registra de sus alumnos** via `client_payments`. Todo el calculo vive en `getCoachDashboardDataInner` + helpers.

### Fuente de datos

Query (parte del `Promise.all`):

```
client_payments
  .select('client_id, payment_date, amount, status, period_months, clients!inner(org_id)')
  .eq('coach_id', userId)
  .gte('payment_date', clientPaymentsLookbackStart)   // = inicio del mes (hoy - 13 meses)
+ applyOrgScope sobre clients.org_id
```

El lookback de 13 meses hacia atras es deliberado: incluye filas antiguas con `period_months` largos que **todavia reparten** ingresos al mes actual.

### Que cuenta como ingreso

`isClientPaymentCountedForRevenue(status)`: solo `status` ∈ `{ 'paid', 'pagado', 'completed' }` (case-insensitive). Alineado con `BillingTabB8`. Cualquier otro estado (pending, refunded, etc.) se ignora.

### Reparticion por mes calendario (`allocatePaymentToMonthKeys`)

Cada pago se reparte en meses calendario del coach:

1. `parsePaymentYmd(payment_date)` extrae `{y,m,d}` del prefijo `YYYY-MM-DD`.
2. `total = round(parsePaymentAmount(amount))`; si `<= 0` → `{}` (no aporta).
3. `pm = max(1, period_months ?? 1)` (meses cubiertos por el pago).
4. **Regla de fin de mes:** si el pago cae el **ultimo dia del mes** (`isLastDayOfCalendarMonth`), el primer mes de servicio se considera el **siguiente** (ej. 31-mar + mensualidad de abril → todo el monto cuenta en abril). Esto evita inflar el mes en que se cobra.
5. Reparto: `base = floor(total/pm)`, el `remainder` se suma al **ultimo** mes; se generan claves `YYYY-MM` consecutivas desde el mes de inicio.

Se acumula en `revenueByMonth[key] += slice`.

### KPIs de ingresos

```
currentMonthKey = `YYYY-MM` del mes actual
prevMonthKey    = mes anterior (addWholeMonths(-1))
mrrCurrentMonth = revenueByMonth[currentMonthKey] ?? 0
mrrPreviousMonth = revenueByMonth[prevMonthKey] ?? 0
```

Y el delta (en `getCoachDashboardDataV2`):

```
mrrDeltaPct = mrrPreviousMonth > 0
              ? round((mrrCurrentMonth - mrrPreviousMonth) / mrrPreviousMonth * 100)
              : mrrCurrentMonth > 0 ? 100 : 0
```

(si el mes previo fue 0 y el actual > 0, el delta es +100%; si ambos 0, 0%).

### Resumen de pagos por alumno (`buildClientPaymentSummary`)

A partir de las mismas filas crudas (`_rawClientPayments`) y el pulse:

- Por alumno se queda con el **ultimo pago pagado** (`paid/pagado/completed`, mayor `payment_date`): `{ payment_date, amount (redondeado), period_months }`.
- `nextRenewalDate` = `last.payment_date + period_months` meses (YMD), si hay `period_months > 0`.
- `hasRecentPayment` = `last.payment_date` dentro de los **ultimos 35 dias**.
- La lista se ordena poniendo **primero los que NO tienen pago reciente** (`hasRecentPayment` false adelante) — es decir, prioriza a quien hay que cobrar/renovar.

### Exclusion de cuentas de prueba de finanzas

> Punto importante y matizado. En el dashboard del **coach**, `client_payments` esta scopeado por `coach_id` (los pagos que **ese** coach registro de **sus** alumnos), asi que no se mezcla con otros coaches y no aplica el filtro de cuentas test aqui. La exclusion de cuentas de prueba (`lib/test-accounts.ts`, `isTestCoachEmail` para `@evatest.cl` + `juanmvr2706`) vive en los **RPC/servicios de finanzas globales del CEO** (`getAddonMetrics`, `getFinanzasData`, los 3 RPC de MRR de plataforma) — esos sí excluyen las cuentas test del MRR agregado. El dashboard del coach reporta el revenue de ese coach especifico; no es el agregado de plataforma. (Ver memoria del proyecto: "Cuentas de prueba excluidas de finanzas CEO".)

---

## 5.10 Otros datos que arma `getCoachDashboardDataInner`

Para completitud (no son "metricas/score/pulso/ingresos" puros pero salen de la misma macro-query):

- **`totalClients`** = `countCoachClients(supabase, userId, orgId)` (`COUNT head:true` con scope org).
- **`activePlans`** = count de `workout_plans` por `coach_id` (sin scope org, ver 5.8).
- **`hasStudentSignal30d`** = `hasCheckinLast30d || hasWorkoutLast30d` — al menos un check-in **o** un workout_log en los ultimos 30d (senal de onboarding "alumno activo"). El check-in se chequea con un select `.gte('created_at', thirtyDaysAgo).limit(1)`.
- **`recentActivities`** (feed, top 8): union ordenada por fecha desc de:
  - `nuevo alumno` (de `findCoachRecentClients`, top 5; subtitulo segun `onboarding_completed`),
  - `check-in` (de `check_ins` con join a `clients`, top 5; incluye `photoUrl` firmada via `createServiceRoleClient()` + `resolveCheckinPhotoUrl` — el coach no tiene policy de SELECT en storage, las filas ya estan scoped por coach),
  - `workout` (de `workout_logs`, top 50, **deduplicado por `client_id|dia`** → una actividad por sesion-dia).
- **`expiringPrograms`**: `workout_programs` activos con `end_date` en `[hoy-14d, hoy+30d]`, mapeados a `daysLeft` (diff vs medianoche local) y **filtrados a `daysLeft <= 3`** (vencidos recientes + por vencer). Alimenta la agenda.
- **`areaData`** (chart de sesiones 30d): preferente via RPC `get_coach_workout_sessions_30d` (sesiones **unicas por dia** en zona Santiago, `SECURITY DEFINER` guard `auth.uid()=coach`); fallback JS sobre `workout_logs` de 30d deduplicando por `client+dia`. Solo se exponen dias con `sesiones > 0`.
- **`barData`** (chart de nuevos alumnos por mes, ultimos 6): via RPC `get_coach_client_signups_last_6_months` (cuenta `clients` por mes, zona UTC); fallback `findCoachClientSignupDates` agregando en JS si el RPC falla/vacio.
- **`agenda`** (`buildAgendaFromPulse`, top 8): combina `expiringPrograms` (kind `programa_vence`) con items derivados del pulse: `SIN_CHECKIN_1M` → `checkin_pendiente`, sino `SIN_EJERCICIO_7D` → `sin_ejercicio`. Cada item lleva `href` a `/coach/clients/[id]` y un `dueAt`.
- **Suscripcion del coach** (`findCoachById`): `subscriptionStatus`, `currentPeriodEnd`, `trialEndsAt` (para banners de estado del plan).

El objeto `kpi` final que consume el frontend: `{ mrrCurrentMonth, mrrPreviousMonth, mrrDeltaPct, totalClients, riskCount, avgAdherence, avgNutrition }`.

---

## 5.11 Server actions

### `dashboard.actions.ts` (`'use server'`)

Dos acciones, ambas **read-only** y delgadas (no persisten nada):

- `getAdherenceStats()`: `auth.getUser()` → si no hay user, `throw 'No autorizado'` → `getCachedDirectoryPulse(user.id)` → `mapDirectoryPulseToAdherenceStats`.
- `getNutritionStats()`: igual pero `mapDirectoryPulseToNutritionStats`.

Reutilizan el pulse cacheado, asi que llamarlas tras el render del dashboard **no** re-paga el costo del pulse en el mismo request.

### `onboarding-guide.actions.ts` (`'use server'`)

Persisten estado del **guia de onboarding** en `coaches.onboarding_guide` (jsonb). Las unicas escrituras del dashboard.

- **`persistOnboardingGuideAction(payload)`**:
  - Valida con Zod (`onboardingGuideSchema`): `{ dismissed?, completed?: { profile_branding?, first_client?, first_plan?, first_checkin? } (strict), ahaMomentSent? }`. Payload invalido → `{ ok: false, error }`.
  - `auth.getUser()`; sin user → `{ ok: false, error: 'No autenticado' }`.
  - **Patron MERGE, no replace**: lee `onboarding_guide` actual, hace `{ ...existing, ...parsed.data }`. Esto es critico — un replace total pisaba otras keys del mismo jsonb (`invite_code_confirmed`, `brand_tour_seen`), lo que hacia reaparecer el modal del codigo corto en cada carga.
  - `update({ onboarding_guide: merged, updated_at: now })` por `id = user.id`.
  - `revalidatePath('/coach/dashboard')`.
- **`markBrandTourSeenAction()`**:
  - Mismo patron merge: `{ ...existing, brand_tour_seen: true }`.
  - `revalidatePath('/coach/settings')`.

> Gotcha de columnas (memoria del proyecto): `coaches` tiene GRANT de columna; `onboarding_guide` esta en la allowlist editable por `authenticated` (a diferencia de `enabled_modules`/billing que son compra-only service-role). Por eso estas dos acciones pueden hacer el `update` con la sesion del coach.

---

## 5.12 Invariantes y garantias de diseño

- **Scope por contexto**: el `orgId` se deriva SIEMPRE de la identidad (`resolvePreferredWorkspace`), nunca del request. Standalone = `org_id IS NULL`; enterprise_coach = su `orgId`; `undefined` = sin filtro (rutas internas). Semantica uniforme via `applyOrgScope` (`eq` vs `is null`).
- **Cero N+1 en el bucle de pulse**: toda la carga es por chunk con `Promise.all` y se indexa en `Map` antes del bucle. El bucle final no hace ningun query. Los streaks pasaron de N+1 (una llamada por alumno) a **dos** RPC batch como maximo.
- **Una sola carga de pulse por request**: `getCachedDirectoryPulse` (`React.cache`) deduplica entre stats, directorio y server actions.
- **Exactitud de `lastWorkoutDate` independiente de limites de PostgREST**: se resuelve por RPC con `MAX` server-side (`get_clients_last_workout_date`), no por el reduce sobre filas que el `limit(2000)` podria truncar. El cap de filas solo afecta adherencia/1RM (ventanas cortas), nunca la fecha de ultimo entreno.
- **Chunking anti-URL**: `.in()` troceado a 120 client_ids y 80 program_ids para no reventar el largo de URL de PostgREST.
- **Nutricion correcta por unidad**: se delega al motor canonico (`computeNutritionAdherence` + `calculateFoodItemMacros`) que maneja g/ml/un; el calculo manual previo (q=(qty/serving_size)*mult) ignoraba unidades y esta erradicado.
- **Compliance de rango = suma/suma**, jamas promedio de % diarios (invariante del motor).
- **Seguridad de RPC**: todas las RPC del dashboard son `SECURITY DEFINER` con guard de `auth.uid()` (coach dueño / propio cliente / pool team / service_role en mobile). `anon` fue revocado (`revoke_anon_definer_read_rpcs`). El fix IDOR (`20260616165712`) endurecio `get_clients_last_workout_date` y `get_clients_streaks_by_ids` para que un `authenticated` no pueda leer datos de alumnos ajenos.
- **Ingresos = revenue del coach (no MRR de plataforma)**: `client_payments` scopeado por `coach_id`, solo estados `paid/pagado/completed`, repartido por `period_months` con regla de fin-de-mes. La exclusion de cuentas test aplica al MRR **global** del CEO, no a este dashboard por-coach.
- **Onboarding guide**: escrituras siempre con **merge** del jsonb, nunca replace (evita borrar `invite_code_confirmed`/`brand_tour_seen`).
- **Performance instrumentada**: `getDirectoryPulse`, `getCoachDashboardDataV2` y variantes estan envueltos en `measureServer(...)`.
