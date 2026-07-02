# 3. Pestana Analisis (entrenamiento)

> Esta seccion cubre los paneles de **entrenamiento** de la ficha del alumno (vista coach): records de fuerza por ejercicio (1RM/PRs), volumen por grupo muscular, tonelaje por dia e historial de sesiones. Codigo: `TrainingTabB4Panels`, `TrainingStrengthCards` y el modulo puro de calculo `profileTrainingAnalytics.ts`.

---

## 3.0 De donde llegan los datos (backend)

Toda la pestana se alimenta de **dos props base** que el dashboard de la ficha (`ClientProfileDashboard.tsx`) recibe del servidor via `getClientProfileData(clientId)` (server action → `getClientProfileDataService`, `services/client/client-detail.service.ts`, envuelta en `React.cache`):

- **`workoutHistory`** = `data.workoutHistory` (en el servicio se llama `workoutLogs`). Es una consulta a **`workout_plans`** del alumno, anidando hacia abajo:
  ```
  workout_plans: id, title, assigned_date
    └ workout_blocks: id, exercise_id, order_index, section, superset_group,
                      target_weight_kg, reps, sets
        ├ exercises: id, name, muscle_group
        └ workout_logs: id, set_number, weight_kg, reps_done, rpe, logged_at
  ```
  Filtros: `client_id = clientId`, `assigned_date >= hoy - 548 dias` (ventana `WORKOUT_HISTORY_WINDOW_DAYS = 548`, ~18 meses — corta el full-scan ilimitado que saturaba memoria), `ORDER BY assigned_date DESC`. Esta es la materia prima de **todas** las curvas de fuerza, los PRs de la semana y el tonelaje por dia (se reagregan en el cliente).
- **`muscleVolumeByGroup`** = `data.muscleVolumeByGroup`. **NO** se calcula en JS sobre los logs: viene de la RPC de Postgres **`get_client_muscle_volume`** (`p_client_id`, `p_days_back = 30`), mapeada por `mapMuscleVolumeRpc`. Devuelve `{ muscleGroup, volume }` ya agregado por grupo (Σ peso×reps de los ultimos 30 dias), filtrado a `volume > 0` y ordenado por volumen DESC. Es la fuente del radar de balance muscular y de la deteccion de desequilibrios.

> Existe tambien `data.personalRecords` (RPC `get_client_exercise_prs`, PR de peso maximo por ejercicio, mapeado por `mapExercisePrsRpc`) que se muestra en otra tarjeta del dashboard ("Records personales") fuera de `TrainingTabB4Panels`. Las funciones puras `buildPersonalRecordsFromLogs` / `buildMuscleVolumeFromLogs` (en `profileDataHelpers.ts`) son la version JS legacy equivalente, hoy sustituidas por esas RPCs.

Ademas, el panel hace **dos llamadas server propias** para el historial de sesiones (no usa `workoutHistory` para esto):

- `getClientWorkoutActivityDates(clientId)` → RPC `get_client_activity_dates` (`p_days_back = 90`): lista de dias `YYYY-MM-DD` (zona Santiago) con logs en los ultimos 90 dias. Se carga al montar (`useEffect`) y alimenta el calendario/heatmap de fechas activas.
- `getClientWorkoutForDate(clientId, date)`: trae los `workout_logs` de un dia concreto (`set_number, weight_kg, reps_done, rpe, logged_at` + `workout_blocks` con `exercises(name, muscle_group)` y `workout_plans(title, day_of_week)`), filtrando por los limites UTC del dia en Santiago (`getSantiagoUtcBoundsForDay`). Se dispara al elegir una fecha.

Ambas pasan por `assertCoachClientReadAccess` (RLS coach-scoped); identidad via `getClaims()` (JWT local ES256).

Props auxiliares (solo presentacion de las graficas, no datos): `chartGridColor`, `chartAxisColor`, `tooltipBgColor`, `tooltipBorderColor`, `tooltipTextColor`, `santiagoTodayIso` (= `data.todayIso`).

---

## 3.1 `profileTrainingAnalytics.ts` — motor de metricas

Modulo puro (sin Supabase, sin React) que transforma `workoutHistory`/`muscleVolumeByGroup` en las series que pintan las graficas. Recorre la estructura `plan → workout_blocks → workout_logs`.

### 1RM estimado — Epley (`epleyOneRM`)
Formula unica de fuerza, alineada con el dashboard del alumno:

`1RM = peso_kg × (1 + reps / 30)`

Devuelve `0` si peso o reps ≤ 0.

### Series de fuerza por ejercicio (`buildExerciseStrengthSeriesMap`)
Construye un `Map<exerciseId, ExerciseStrengthSeries>`. Por cada `workout_log` valido (peso > 0, reps > 0, con `logged_at`):
- **Clave de ejercicio:** `block.exercise_id` → `block.exercises.id` → fallback `name:<nombre>`.
- **Por dia natural** (`logged_at.slice(0,10)`) guarda el **mejor 1RM Epley** del dia; si empata el 1RM, gana el de **mayor peso**. Redondea el 1RM a 1 decimal.
- **`totalVolume`** = Σ (peso × reps) de TODOS los sets del ejercicio (no por dia).
- Salida por ejercicio: `series` ordenada por fecha ASC, cada punto = `{ dateKey, label (dd mmm es-ES), oneRm, weightKg, reps }`, mas `exerciseName`, `muscleGroup` (trim, o `—`) y `totalVolume`. Descarta ejercicios sin puntos.

Equivalente en Postgres: RPC `get_client_strength_series` (filas planas 1-por-(ejercicio,dia), ya con `one_rm` y `total_volume`) → `mapStrengthSeriesRpc`. Produce el mismo `Map`; hoy el componente usa la version JS.

### Seleccion de tarjetas de fuerza (`selectStrengthCardExercises`, default 4)
De todas las series, ordena y toma las top-N priorizando:
1. **Lifts compuestos clave** primero (`isKeyCompoundLift`: nombre contiene banca/bench/press, sentadilla/squat, o muerto/deadlift).
2. Luego **mayor `totalVolume`**.
3. Desempate: **mas puntos** en la serie.

### Tendencia y pico de una serie
- `strengthTrendDeltaKg(series)`: `1RM(ultimo) − 1RM(primero)`, 1 decimal; `null` si <2 puntos. Es el "+X kg en el periodo".
- `maxOneRMIndex(series)`: indice del 1RM mas alto (el pico marcado en la grafica).

### PRs de la semana (`findWeeklyWeightPRs`)
Detecta records de **1RM Epley logrados en la semana calendario actual** (lunes → hoy, `startOfWeek weekStartsOn:1`). Por ejercicio compara:
- **Mejor 1RM dentro de la semana** vs **mejor 1RM antes de la semana** (todo el historial previo de la ventana).
- Solo cuenta sets de **fuerza**: reps en `1..30` (excluye resistencia). Empate de 1RM → gana mayor peso.
- Reporta un PR solo si hay ambos valores (`>0`) y el nuevo 1RM **supera** al anterior.
- `pctChange` = variacion % del 1RM, 1 decimal. Salida ordenada por 1RM nuevo DESC.

Cada PR (`WeeklyWeightPR`): ejercicio, grupo, peso/reps/1RM nuevos, peso/reps/1RM previos, `pctChange`. RPC equivalente: `get_client_weekly_prs` → `mapWeeklyWeightPRsRpc`.

### Tonelaje por dia (`buildDailyTonnageSeries`, default 21 dias)
Agrupa **Σ (peso × reps)** por dia natural del log; toma los ultimos `maxDays` con actividad. Cada punto: `{ dateKey, label, tonnage (redondeado), sessions: 1, movingAvg }`. La **media movil** es de **7 sesiones** (ventana hacia atras, no centrada): promedio del tonelaje de la sesion actual y las 6 previas. RPC equivalente: `get_client_daily_tonnage` (con `moving_avg`/`sessions` calculados en Postgres) → `mapDailyTonnageRpc`.

### Desequilibrios de volumen (`detectVolumeImbalances`, take 6, minRatio 2)
Sobre `muscleVolumeByGroup`: toma los top-6 grupos por volumen; el grupo #1 (mayor volumen) es el "fuerte". Para cada otro grupo, si `volumen_fuerte / volumen_grupo ≥ 2`, emite una alerta `{ stronger, weaker, ratio (1 decimal) }`. Devuelve `[]` si hay <2 grupos con volumen.

---

## 3.2 `TrainingTabB4Panels` — orquestador de la pestana

Componente cliente. Calcula con `useMemo` (sobre `workoutHistory`/`muscleVolumeByGroup`): `weeklyPRs` (`findWeeklyWeightPRs`), `tonnageSeries` (`buildDailyTonnageSeries`, 21d), `imbalances` (`detectVolumeImbalances`), `radarData`, `strengthCards` (4), `allExerciseSeries` (mapa completo), `muscleGroupOptions` (grupos con ejercicios + conteo), `filteredStrengthExercises` y `recentWorkoutDates`.

Si **no hay** radar, ni barras, ni PRs de la semana, ni fuerza → el panel **no renderiza nada** (`return null`).

Orden de bloques renderizados:

### A. Banner de record de la semana (`WeeklyPRBanner`)
Solo si `weeklyPRs.length > 0`. Muestra el **PR top** de la semana: ejercicio, peso×reps nuevos, **1RM nuevo**, linea "Antes" (peso×reps + 1RM previo), `+X% 1RM`, y "+N ejercicios mas" si hay otros PRs. Al montar **dispara confetti** una sola vez (salvo `prefers-reduced-motion`).

### B. Fuerza — 1RM estimado (Epley)
Solo si `allExerciseSeries.size > 0` (`hasStrength`). Encabezado "Fuerza — 1RM estimado (Epley)".
- **Filtro por grupo muscular** (si hay >1 grupo): chips "Todos" + un chip por grupo con su conteo de ejercicios. Sin filtro → muestra las 4 tarjetas seleccionadas (`strengthCards`). Con grupo seleccionado → muestra **todos** los ejercicios de ese grupo ordenados por `totalVolume` (limite `maxCards = 20`).
- Renderiza `TrainingStrengthCards` con `filteredStrengthExercises`.

### C. Balance muscular (30d) — Radar
Solo si `radarData.length ≥ 3` (`hasRadar`). `radarData` = top-8 grupos de `muscleVolumeByGroup` con volumen > 0, **normalizados** al maximo del periodo: cada grupo → `pct = round(volume / maxVolume × 100)` (0–100).
- **Que mide:** volumen relativo (Σ peso×reps, ultimos 30d) por grupo muscular, como % del grupo de mayor volumen.
- **Ejes:** angular = grupo muscular (etiqueta truncada a 9+`…` si es larga); radial = 0–100 (% del maximo). Tooltip: nombre completo + "X% del maximo del periodo".
- Debajo: hasta 2 **alertas de desequilibrio** (`imbalances`): "Posible desequilibrio: <fuerte> ~Nx mas volumen que <debil>".

### D. Tonelaje por dia — barras + linea
Solo si `tonnageSeries.length > 0` (`hasBars`). `ComposedChart`:
- **Que mide:** Σ (peso × reps) agrupado por fecha de registro, ultimos 21 dias con actividad.
- **Ejes:** X = fecha (`label` dd mmm); Y = tonelaje (formateado en "k", miles). **Barras** = tonelaje del dia; **linea punteada** = media movil de 7 sesiones (`movingAvg`).
- Tooltip: fecha, "Tonelaje: N kg·rep", "Media 7 ses.: N kg·rep".

### E. Historial de entrenamientos
Tarjeta con:
- **Tiles de sesiones recientes:** `recentWorkoutDates` = ultimas 10 fechas de `activityDates` (de `getClientWorkoutActivityDates`), mas reciente primero. Cada tile = dia/num/mes; al pulsarlo carga esa sesion.
- **Buscador por fecha** (`DayNavigator`): navega por fecha; `adherenceDates = activityDates` marca los dias con entreno; `isLoading` durante la transicion.
- **Detalle de sesion** (`WorkoutDayReadOnly`): al elegir una fecha ≠ hoy, llama `getClientWorkoutForDate(clientId, date)` dentro de `useTransition` y muestra:
  - Estados: "Cargando sesion…" (pending), "Sin entrenamiento registrado para este dia" (cargado y vacio), o el detalle.
  - **Meta de la sesion:** titulo del plan (`workout_plans.title`), nº de ejercicios, nº de sets totales (= nº de logs), y **volumen total** Σ(peso×reps) en kg·rep.
  - **Lista de ejercicios:** agrupa logs por nombre de ejercicio; muestra grupo muscular y, por cada set ordenado por `set_number`: `#set`, `peso kg × reps`, y **RPE** si existe.

Seleccionar la fecha de **hoy** (`santiagoTodayIso`) limpia el detalle (no consulta).

---

## 3.3 `TrainingStrengthCards` / `StrengthExerciseCard` — tarjeta de fuerza por ejercicio

`TrainingStrengthCards` recibe `exercises` ya filtrados desde el padre (o, si no, los calcula con `selectStrengthCardExercises`). No renderiza nada si la lista esta vacia. Pinta una grilla de `StrengthExerciseCard`.

Cada **tarjeta de ejercicio** (`StrengthExerciseCard`) muestra, a partir de su `ExerciseStrengthSeries`:
- **Cabecera:** nombre del ejercicio + grupo muscular.
- **Valor grande:** `latest.oneRm` (1RM del ultimo punto) en kg, etiqueta "1RM est.".
- **Tendencia del periodo** (`strengthTrendDeltaKg`): "+X kg" (subio), "−X kg" (bajo), o "Sin cambio en el periodo" / `null`.
- **Grafica de area (1RM en el tiempo):**
  - **Que mide:** evolucion del 1RM estimado (Epley) por dia de ese ejercicio.
  - **Ejes:** X = fecha (`dateKey` formateado dd/mm); Y = 1RM (kg, dominio auto). Area + linea del 1RM. Un **`ReferenceDot` ambar** marca el **pico** (`maxOneRMIndex`).
  - Tooltip: fecha (`label`), "1RM est. N kg", "Serie: peso kg × reps".
- **Pie:** "Pico N kg (fecha)" y "Ultima: peso kg × reps" (el ultimo punto de la serie).

---

## 3.4 Resumen funcional (que se guarda / que se calcula)

- **No escribe nada.** Toda la pestana es **lectura/analitica**; no hay mutaciones a la DB. Las unicas escrituras de la ficha (pagos, peso objetivo, marcar check-in) viven en otros paneles.
- **Calculo en cliente (JS):** series de 1RM por ejercicio, PRs de la semana, tonelaje diario + media movil 7, normalizacion del radar y deteccion de desequilibrios — todo derivado de `workoutHistory` (de `workout_plans/blocks/logs`, ventana 548d).
- **Calculo en Postgres (RPC):** volumen por grupo 30d (`get_client_muscle_volume`), PRs de peso por ejercicio (`get_client_exercise_prs`), dias con actividad 90d (`get_client_activity_dates`), y la sesion de un dia (`getClientWorkoutForDate`). Existen RPCs paralelas (`get_client_strength_series`, `get_client_weekly_prs`, `get_client_daily_tonnage`) con mappers listos para migrar el calculo de cliente a servidor.
- **Metrica de fuerza canonica:** 1RM Epley `peso × (1 + reps/30)`, consistente entre coach y alumno.
