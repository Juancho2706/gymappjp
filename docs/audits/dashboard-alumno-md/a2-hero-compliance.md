# 2. Hero "que hago hoy", anillos de cumplimiento, calendario y check-in

Esta seccion cubre el bloque central del dashboard del alumno (`/c/[coach_slug]/dashboard`). En `page.tsx` estos cuatro componentes se montan en orden, cada uno envuelto en su propio `<Suspense>` con skeleton:

1. `WeekCalendar` (RSC) → `CalendarSkeleton`
2. `CheckInBanner` (RSC) → `CheckInSkeleton`
3. `HeroAndComplianceGroup` (RSC) → `HeroAndComplianceSkeleton`

Y la tarjeta de anillos `ComplianceScoresCard` se monta aparte (en otra parte del layout, fuera de este fragmento del `page.tsx`). Todos son **Server Components** que disparan queries en paralelo y pasan datos planos a componentes cliente (`'use client'`).

Hay **dos** fuentes de datos principales para todo este bloque:
- `getHeroComplianceBundle(userId, coachSlug)` — alimenta el hero (que hago hoy) **y** los anillos de cumplimiento. Esta `React.cache`-deduplicado, asi que `HeroAndComplianceGroup` y `ComplianceScoresCard` lo llaman ambos pero se ejecuta **una sola vez por request**.
- Queries sueltas de `dashboard.queries.ts` (`getLastCheckIn`, `getActiveProgram`, `getClientWorkoutPlans`, `getRecentWorkoutLogs`) para el calendario y el banner de check-in.

> Zona horaria canonica de toda la app: **America/Santiago**. Todos los calculos de "hoy", ventanas de 30 dias, dia de la semana y mapeo de instantes UTC a dia calendario pasan por helpers de `@/lib/date-utils` (`getTodayInSantiago`, `getSantiagoIsoYmdForUtcInstant`, `getNutritionDayOfWeekFromIsoYmdInSantiago`, `getSantiagoUtcBoundsForDay`). El alumno y el coach pueden estar en cualquier huso; el dia "real" siempre es el de Santiago.

---

## 2.1 HERO — "que hago hoy" (`HeroSection` → `WorkoutHeroCard` / `RestDayCard`)

### 2.1.1 Cadena de componentes

- **`HeroAndComplianceGroup`** (RSC, `_components/HeroAndComplianceGroup.tsx`): pide en paralelo `getHeroComplianceBundle(userId, coachSlug)` y `getDashboardNutritionDomainEnabled(userId)`. Solo usa la rama `hero` del bundle (los `scores` los consume `ComplianceScoresCard`). Pasa todo a `HeroSection`. El flag `nutritionEnabled` solo afecta al link "Ver nutricion →" del `RestDayCard`.
- **`HeroSection`** (`_components/hero/HeroSection.tsx`): es un **router de presentacion puro**. Decision:
  - Si `hasWorkout && planId && planTitle` → renderiza `WorkoutHeroCard`.
  - En cualquier otro caso → renderiza `RestDayCard` (dia de descanso o sin plan).

### 2.1.2 Datos que llegan al hero (campos del bundle `hero`)

Forma exacta de `HeroComplianceBundle.hero` (definida en `heroComplianceBundle.ts`):

| Campo | Tipo | Significado |
|---|---|---|
| `hasWorkout` | `boolean` | `true` si hay un plan asignado/del programa para HOY (`!!todayPlan`) |
| `planId` | `string \| null` | id del plan de hoy (CTA "Empezar entrenamiento" enlaza a `/c/{slug}/workout/{planId}`) |
| `planTitle` | `string \| null` | titulo del plan de hoy |
| `blocks` | `HeroBlock[]` | ejercicios del plan de hoy (id, sets, reps, nombre del ejercicio) |
| `isAlreadyLogged` | `boolean` | `true` si TODAS las series objetivo de hoy ya estan registradas |
| `totalSetsTarget` | `number` | suma de `sets` de todos los bloques de hoy |
| `totalSetsLogged` | `number` | series unicas ya registradas hoy para ese plan |
| `baseLoggedPerBlock` | `Record<string, number>` | series ya registradas hoy, por bloque (seed del QuickLogSheet) |
| `nextWorkoutTitle` | `string \| null` | titulo del proximo entreno (solo cuando hoy es descanso) |
| `nextWorkoutDayLabel` | `string \| null` | etiqueta del dia del proximo entreno ("Manana" o nombre del dia) |

### 2.1.3 BACKEND — como se resuelve el plan de hoy (`getHeroComplianceBundle`)

Esta es la pieza mas densa del hero. Vive en `_data/heroComplianceBundle.ts`, funcion `getHeroComplianceBundle` (envuelta en `cache()`). Pasos:

**Paso 0 — fetch paralelo (`Promise.all`):**
- `getActiveProgram(userId)` → fila `workout_programs` con `is_active = true` (maybeSingle), anidando `workout_plans` (id, title, day_of_week, week_variant, assigned_date) y sus `workout_blocks` (id, sets, reps, exercise_id + `exercises(id, name)`). Campos del programa usados: `start_date`, `weeks_to_repeat`, `ab_mode`, `program_phases`.
- `getClientWorkoutPlans(userId)` → TODOS los `workout_plans` del cliente (id, title, assigned_date, group_name, day_of_week, week_variant, program_id, created_at), ordenados por `assigned_date` desc. Incluye planes sueltos (sin programa) y de programa.
- `getRecentWorkoutLogs(userId)` → `workout_logs` de los ultimos 30 dias (ventana `logged_at >= hoy-30d` en UTC), seleccionando `id, logged_at, block_id, set_number, weight_kg, reps_done` + join `workout_blocks!inner(plan_id)`. `limit 200`, orden `logged_at` desc.
- (ademas trae `getCheckInHistory30Days`, `getNutritionLogDays30`, `getNutritionAdherenceInputs30d` para los anillos — ver §2.2)

**Paso 1 — filtrar planes activos:**
```
activePlans = allPlans.filter(p => !p.program_id || p.program_id === program?.id)
```
Es decir: planes sueltos (`program_id` null) + planes del programa activo. Descarta planes de programas viejos/inactivos.

**Paso 2 — contexto de hoy y variante de microciclo:**
- `todayCtx = getTodayInSantiago()` → `{ date: userLocalDate, iso: today, dayOfWeek: todayDow }` (dow: 1=Lun … 7=Dom).
- `abMode = !!program?.ab_mode`.
- `weekIdx = programWeekIndex1Based(program, userLocalDate)` → indice de semana 1-based dentro del programa. Formula (`programWeekVariant.ts`): si no hay `start_date` devuelve null; si no: `diffDays = ceil(|hoy - start_date| / 1 dia)`, `currentWeek = min(weeks_to_repeat, ceil(diffDays/7))`, acotado a >= 1.
- `activeVariant = resolveEffectiveWeekVariant(program, planesDelPrograma, weekIdx, userLocalDate)` → letra de variante **EFECTIVA** A o B.
  - Sin `ab_mode` → siempre `A`.
  - Con `ab_mode`: la variante del ciclo se calcula con `weekIndexToVariantLetter` (semana impar 1,3,5… → A; par 2,4,6… → B). PERO si la variante que toca por ciclo no tiene NINGUN plan y la otra si, **cae a la otra** (`effectiveWeekVariantFromPlans`). Esto arregla el dead-end de un programa A/B mal armado (`ab_mode=true` pero una sola semana cargada): sin este fix, las semanas "B" dejaban al alumno con el hero vacio (ver commit `e4567bf4`).

**Paso 3 — determinar `todayPlan` (el plan de hoy):**
1. Primero busca un plan con **`assigned_date === today`** (plan fechado explicitamente para hoy; gana sobre el del programa).
2. Si no hay y existe `program`: busca un plan del programa que coincida en `day_of_week === todayDow` Y `workoutPlanMatchesVariant(p, activeVariant, abMode)`.
   - `workoutPlanMatchesVariant`: sin A/B → solo planes con `week_variant` "A" (o sin variante); con A/B → solo la variante activa.

**Paso 4 — resolver bloques (ejercicios) de hoy:**
- Intenta usar los bloques anidados del programa (`program.workout_plans.find(...).workout_blocks`).
- **Fallback:** si `todayPlan` existe pero `blocksRaw` viene vacio, hace una query extra `getWorkoutPlanBlocksForHero(userId, todayPlan.id)` (selecciona `workout_blocks(id, sets, reps, exercise_id, exercises(id,name))` del plan). Esto cubre planes sueltos cuyos bloques no venian anidados en `getActiveProgram`.
- Mapea cada bloque a `HeroBlock`: `{ id, sets, reps, exercise: { name: b.exercises?.name ?? 'Ejercicio' } }`.

**Paso 5 — calcular series registradas hoy (`totalSetsLogged`, `baseLoggedPerBlock`, `isAlreadyLogged`):**
- `blockIdsToday` = set de ids de bloques de hoy; `blockById` = mapa id→bloque.
- `logsForPlanToday`: filtra los `logs` (de la query de 30d) que cumplan TODO:
  - `l.workout_blocks.plan_id === todayPlan.id` (el log es de un bloque de ESTE plan), Y
  - `getSantiagoIsoYmdForUtcInstant(l.logged_at) === today` (el log es de HOY en Santiago), Y
  - `blockIdsToday.has(l.block_id)` (el bloque pertenece a hoy).
- Cuenta **series unicas** por bloque, deduplicando por clave `block_id:set_number` (`seenSetKeys`). Ademas descarta sets fuera de rango (`set_number < 1` o `> b.sets`). Resultado: `setsPerBlock` (= `baseLoggedPerBlock`).
- `totalSetsTarget = sum(b.sets)` de todos los bloques de hoy.
- `totalSetsLogged = sum(setsPerBlock)`.
- `isAlreadyLogged = totalSetsTarget > 0 && totalSetsLogged >= totalSetsTarget`.

**Paso 6 — proximo entreno (solo si HOY es descanso, `!todayPlan && program`):**
- Candidatos: planes del programa con `day_of_week > todayDow` que matcheen la variante activa, ordenados ascendente por `day_of_week`.
- Toma el primero → `nextWorkoutTitle = next.title`.
- `nextWorkoutDayLabel`: si `day_of_week === todayDow + 1` → `'Manana'`; si no, el nombre del dia desde `DAY_NAMES = ['Lunes','Martes','Miercoles','Jueves','Viernes','Sabado','Domingo']` indexado por `(day_of_week - 1)`.
- Nota: solo mira dias **posteriores en la misma semana** (no salta a la semana siguiente).

### 2.1.4 `WorkoutHeroCard` (FRONTEND — hay entreno hoy)

Componente cliente (`_components/hero/WorkoutHeroCard.tsx`). Que **muestra/hace** funcionalmente:

- Calcula localmente `pct = min(100, totalSetsLogged/totalSetsTarget * 100)` para una barra de progreso de series.
- Muestra hasta **4 ejercicios** (`blocks.slice(0,4)`); si hay mas, una linea "+ N ejercicios mas".
- Por cada ejercicio muestra: nombre + `{sets} × {reps}`.
- Etiqueta "Hoy" + el `title` del plan.
- Texto `{totalSetsLogged}/{totalSetsTarget} series`.
- Overlay de **"Entrenamiento completado"** (icono Check) cuando `isAlreadyLogged === true`.
- `InfoTooltip` con texto i18n `t('section.workoutHero')`.
- **CTA principal:** boton/Link a `${base}/workout/${planId}` (donde `base = useBasePath('/c/{coachSlug}')`). Texto: `'Ver registro'` si ya esta logueado, `'Empezar entrenamiento'` si no. **Aqui es donde se va a ejecutar/registrar la rutina completa.**
- **CTA secundario "Rapido":** si `!isAlreadyLogged && blocks.length > 0`, monta `QuickLogSheet` (log rapido sin abrir la rutina — ver §2.1.6).

### 2.1.5 `RestDayCard` (FRONTEND — descanso o sin plan)

Componente cliente (`_components/hero/RestDayCard.tsx`). Que muestra:
- Emoji luna animado (flota) + titulo **"Dia de descanso"**.
- Si hay `nextWorkoutTitle`: "Proximo: {titulo} · {dayLabel}". Si no: "Recupera bien para la proxima sesion."
- Link **"Ver nutricion →"** a `${base}/nutrition`, **solo si** `showNutritionLink` (= `nutritionEnabled`, master switch del dominio nutricion del alumno). Si el coach apago el dominio nutricion, el link no aparece.

### 2.1.6 `QuickLogSheet` — log rapido de series desde el hero (BACKEND de escritura)

Componente cliente (`_components/hero/QuickLogSheet.tsx`). Permite registrar series **sin abrir la pantalla de la rutina**. Recibe `blocks`, `coachSlug`, `baseLoggedPerBlock`, `totalSetsTarget`.

**UI/funcional:**
- Trigger = boton "Rapido". Abre un `Sheet` (panel inferior, `side="bottom"`).
- Cabecera "Log rapido" + contador `{totalLogged}/{totalSetsTarget} series · {coachSlug}`.
- `totalLogged` (estado derivado): `base = sum(baseLoggedPerBlock[b.id])` + `extra = sum(loggedByBlock)` (lo registrado en esta sesion del sheet).
- Por cada bloque: nombre del ejercicio + `{done}/{b.sets} series hoy` (`done = base + extra`) + un boton circular `+` (icono Plus).
- El boton `+` se **deshabilita** cuando `pending` (transicion en curso) o `done >= b.sets` (serie ya completa).

**Que registra y como guarda (`logOne` → `logSetAction`):**
- Al tocar `+` en un bloque: `currentSets = base + extra`; si `>= maxSets` no hace nada; si no, `next = currentSets + 1`.
- Construye un `FormData` con SOLO tres campos: `block_id`, `set_number = next`, `weight_kg = '0'`. **Importante: el log rapido NO captura peso real (lo manda en 0), ni reps/RPE/RIR.** Es un toggle de "hice esta serie".
- Llama el server action **`logSetAction`** (importado de `workout/[planId]/_actions/workout-log.actions.ts` — el MISMO action que usa la pantalla de rutina completa).
- Si `res.success`: actualiza optimisticamente `loggedByBlock[blockId] += 1` y llama `router.refresh()` (re-fetch del RSC → recalcula `baseLoggedPerBlock`/anillos).

**`logSetAction` (server action `'use server'`) — detalle del guardado en DB:**
- Parsea el `FormData` con preprocesamiento: cambia comas por puntos en decimales; campos opcionales vacios → `undefined`. Campos aceptados: `block_id`, `set_number`, `weight_kg`, `reps_done`, `rpe`, `rir` + **espejo polimorfico** (cardio/movilidad): `actual_duration_sec`, `actual_distance_m`, `actual_pace_sec_per_km`, `actual_hold_sec`, `actual_avg_hr` (el QuickLogSheet no envia ninguno de estos).
- Valida con **`WorkoutLogSetSchema`** (Zod, `@eva/schemas`): `block_id` uuid; `set_number` int >= 1; `weight_kg` num >= 0 opcional; `reps_done` int >= 0 opcional; `rpe` 1–10; `rir` int 0–10; campos polimorficos con rangos (duration 0–86400, distance 0–1000000, pace 1–3600, hold 0–86400, avg_hr 25–250). Si falla, retorna `{ error }`.
- `auth.getUser()` → si no hay user, `{ error: 'No autenticado.' }`. El `client_id` SIEMPRE sale de `user.id` (nunca del body).
- **Upsert manual idempotente por dia:** calcula los limites UTC del dia de hoy en Santiago con `getSantiagoUtcBoundsForDay(todayStr)` → `[startTs, endTs)`. Busca `workout_logs` existentes con mismo `block_id`, `client_id = user.id`, `set_number`, dentro de `[startTs, endTs)`.
  - Si existe(n): hace `UPDATE` del primero con los valores nuevos; si hay duplicados, los `DELETE`.
  - Si no existe: hace `INSERT` con `{ block_id, client_id, set_number, ...payloadValues }`.
- `payloadValues` = `{ weight_kg, reps_done, rpe, rir, actual_*… }` (cada uno `?? null`).
- Tras escribir: `revalidatePath('/c', 'layout')` (refresca todas las superficies del alumno: hero, anillos, calendario) y `revalidatePath('/coach/clients/{user.id}')` (refresca la vista del coach).
- RLS: la tabla `workout_logs` es user-scoped (`client_manage_logs`) — el alumno solo escribe/borra los propios.

> Implicacion para rediseno: el QuickLogSheet escribe filas reales en `workout_logs` con `weight_kg = 0`. Estas filas cuentan para `totalSetsLogged`/`isAlreadyLogged` del hero, para el `isCompleted` del calendario y para `workoutScore` (anillo de entrenos), pero NO aportan peso para records personales (`getPersonalRecords` filtra `weight_kg not null`, y 0 nunca supera un maximo historico real). El log rapido es de cumplimiento, no de carga.

---

## 2.2 ANILLOS DE CUMPLIMIENTO (`ComplianceScoresCard` → `ComplianceRingCluster` → `ComplianceRing`)

### 2.2.1 Cadena de componentes y datos

- **`ComplianceScoresCard`** (RSC, `_components/ComplianceScoresCard.tsx`): pide en paralelo `getHeroComplianceBundle(userId, coachSlug)` (usa la rama `scores`) y `getDashboardNutritionDomainEnabled(userId)`. Pasa a `ComplianceRingCluster`: `workoutScore`, `nutritionEngagementScore`, `checkInScore`, `nutritionHasLogs`, `nutritionEnabled`.
- **`ComplianceRingCluster`** (cliente, dentro de `compliance/ComplianceRing.tsx`): tarjeta titulada **"Ultimos 30 dias"** + `InfoTooltip` (`t('section.compliance')`). Grilla de anillos:
  - 3 columnas si `nutritionEnabled`, 2 columnas si no.
  - Anillo **"Entrenos"** (`color="brand"`, valor `workoutScore`).
  - Anillo **"Nutricion"** (`color="emerald"`, valor `nutritionEngagementScore`) — solo si `nutritionEnabled`. Marca `empty` cuando `!nutritionHasLogs`.
  - Anillo **"Check-ins"** (`color="violet"`, valor `checkInScore`).
- **`ComplianceRing`** (cliente): un anillo circular (`react-circular-progressbar`) animado con `useSpring` (stiffness 60, damping 20; respeta `prefers-reduced-motion`). Props: `value` (0–100), `label`, `color`, `empty`. Si `empty` → muestra "—" en el centro y leyenda "Sin datos" (anillo gris).

> Importante: solo se muestran **DOS o TRES anillos** (Entrenos, Nutricion?, Check-ins). El `nutritionComplianceScore` (cumplimiento real de comidas) se **calcula** en el bundle pero NO se renderiza en este cluster: el anillo de Nutricion muestra `nutritionEngagementScore` (engagement de registro). El compliance real de comidas se usa en otras superficies del dashboard.

### 2.2.2 Anillo "Entrenos" — `workoutScore` (BACKEND: `computeWorkoutScore30d`)

Mide: **% de dias planificados (con entreno asignado/del programa) en los ultimos 30 dias en los que el alumno registro al menos una serie de ese plan.** Ventana = 30 dias calendario rodantes en Santiago, terminando HOY.

Vive en `@/lib/workout/workoutAdherence30d.ts`, funcion `computeWorkoutScore30d`. Input: `{ todaySantiagoIso, activePlans, program, logs }` (los mismos `activePlans`/`program`/`logs` del bundle).

Algoritmo (loop por 30 dias, `i = 0..29`, hacia atras desde hoy):
1. `instant = subDays(anchor, i)` (ancla = `today T12:00:00Z`); `iso = getSantiagoIsoYmdForUtcInstant(instant)`; `dow = getNutritionDayOfWeekFromIsoYmdInSantiago(iso)`.
2. Determinar `dayPlan` para ese dia:
   - `assignedPlan` = plan con `assigned_date === iso` (gana), si no:
   - `programPlan` = plan del programa con `day_of_week === dow` Y que matchee la **variante efectiva** de esa semana. La variante se recalcula **por dia** (cada `instant` tiene su `weekIdx` via `programWeekIndex1Based` y su `resolveEffectiveWeekVariant`), para alinear el conteo con lo que el alumno realmente veia ese dia (incluido el fix A/B mal armado).
3. Si no hay `dayPlan` → el dia NO es planificado (no cuenta).
4. Si hay `dayPlan` → `plannedDays++`; `done = logs.some(l => l.workout_blocks.plan_id === dayPlan.id && getSantiagoIsoYmdForUtcInstant(l.logged_at) === iso)`; si `done` → `completedDays++`.
5. `score = plannedDays > 0 ? min(100, round(completedDays/plannedDays * 100)) : 0`.

> Notas clave: (a) es **dia-binario** — un dia planificado "cuenta como hecho" con UNA sola serie registrada (no exige completar todas las series). (b) `plannedDays === 0` (sin entrenos planificados en 30d) → score `0` (no "sin datos"). (c) Usa la misma resolucion de variante/plan que el hero y el calendario, por consistencia.

### 2.2.3 Anillo "Nutricion" — `nutritionEngagementScore` (BACKEND: `getNutritionLogDays30`)

Mide: **ENGAGEMENT de registro = dias con al menos un `daily_nutrition_log` en los ultimos 30 dias / 30 × 100.** NO es cumplimiento de comidas.

- `nutritionDays = getNutritionLogDays30(userId)` → query a `daily_nutrition_logs` con `log_date >= hoy-30d` (Santiago, `format(subDays(...,30))`), y cuenta `dias unicos` (Set sobre `log_date`).
- `nutritionHasLogs = nutritionDays > 0`.
- `nutritionEngagementScore = nutritionHasLogs ? min(100, round(nutritionDays/30 * 100)) : 0`.
- Si `nutritionDays === 0` → el anillo se renderiza `empty` (gris, "—", leyenda "Sin datos") en lugar de 0%.

### 2.2.4 `nutritionComplianceScore` — cumplimiento real de comidas (BACKEND: motor canonico, NO renderizado en este cluster)

Aunque el cluster muestra el engagement, el bundle TAMBIEN calcula el cumplimiento real via el motor canonico `computeNutritionAdherence` (`@eva/nutrition-engine`). Funcion `computeNutritionComplianceScore` en `heroComplianceBundle.ts`:

- Inputs de `getNutritionAdherenceInputs30d(userId)`: plan activo (`nutrition_plans` con `is_active=true`, anidando `nutrition_meals` con `day_of_week` + `food_items` + `foods`) + logs de 30d (`daily_nutrition_logs` con `target_*_at_log` snapshot + `nutrition_meal_logs(meal_id, is_completed, consumed_quantity)`) + `{ startIso = hoy-30d, endIso = hoy }`. Devuelve `null` si no hay plan activo.
- Si `inputs` es null → `nutritionComplianceScore = null` (sin plan no hay adherencia que medir).
- Normaliza meals con `normalizeMealForMacros` + agrega `day_of_week`. Agrupa logs por fecha en `logsByDate`. Construye `targetByDate` desde el snapshot `target_*_at_log` (cuando existe) y `liveTarget` desde el plan (calorias/proteina/carbos/grasas).
- Llama `computeNutritionAdherence({ meals, logsByDate, targetByDate, liveTarget, range, dayOfWeekResolver: getNutritionDayOfWeekFromIsoYmdInSantiago })`.
- `nutritionComplianceScore = min(100, round(summary.compliancePct))`.

**Como calcula `computeNutritionAdherence` el `compliancePct` (invariante critica):**
- Enumera todas las fechas ISO del rango (`startIso..endIso`, ancladas a mediodia UTC para evitar saltos por DST).
- Por cada dia: `applicable` = comidas cuyo `day_of_week == null` (aplica todos los dias) o `== dayOfWeekResolver(fecha)`. `mealsDone` = comidas aplicables ese dia que estan `is_completed` en los logs. `compliancePct` diario = `mealsDone/applicableMeals * 100`.
- **`compliancePct` de RANGO = `sum(mealsDone) / sum(applicableMeals) × 100`** — NUNCA el promedio de los % diarios. Esta es la invariante documentada del motor.
- Tambien expone (no usado aqui) `loggingEngagementPct = daysWithLog/rangeDays × 100` y `streak` (racha de dias con compliance 100%, dias sin comidas aplicables = neutros).
- Macros consumidos: `calculateConsumedMacrosWithCompletionFallback` — si las comidas tienen datos de food_items reales usa esos (escalados por `consumed_quantity` % si es parcial); si el plan no tiene macros por comida, cae a un fallback proporcional sobre el target (`ratio = comidas completadas ponderadas / total comidas`).

### 2.2.5 Anillo "Check-ins" — `checkInScore` (BACKEND: `getCheckInHistory30Days`)

Mide: **cuantos check-ins se registraron en 30 dias, contra una meta implicita de 4** (≈ uno por semana).

- `checkInHistory = getCheckInHistory30Days(userId)` → filas de `check_ins` con `date >= hoy-30d` (ventana sobre el dia de medicion `date`, NO sobre `created_at`/instante UTC), ordenadas asc.
- `checkInsLast30 = checkInHistory.length`.
- `checkInScore = min(100, round(checkInsLast30 / 4 × 100))`.
- O sea: 0 check-ins = 0%, 1 = 25%, 2 = 50%, 3 = 75%, 4+ = 100%.

> Este anillo nunca entra en estado "sin datos" — 0 check-ins simplemente da 0%.

---

## 2.3 CALENDARIO SEMANAL (`WeekCalendar` → `CalendarDaysRow` → `CalendarDay`)

### 2.3.1 BACKEND — derivacion de los 7 dias (`WeekCalendar`, RSC)

Vive en `_components/calendar/WeekCalendar.tsx`. Fetch paralelo: `getActiveProgram`, `getClientWorkoutPlans`, `getRecentWorkoutLogs` (mismas queries que el hero, `React.cache`-deduplicadas). Usa los mismos `activePlans` (planes sueltos + del programa activo) y la misma resolucion de variante efectiva (`resolveEffectiveWeekVariant`) que el hero, por consistencia.

**Calculo del rango de la semana (lunes a domingo de la semana ACTUAL):**
- `curr = userLocalDate` (hoy en Santiago).
- `firstDay = curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1)` → el numero de dia del **lunes** de esta semana (corrige domingo, que en JS es `getDay()===0`).
- Genera 7 fechas: `Array.from({length:7})`, cada `d = new Date(curr); d.setDate(firstDay + i)`.

**Por cada uno de los 7 dias, deriva un `CalendarDayProps`:**
- `dStr` = la fecha en `YYYY-MM-DD` (construida a partir de los componentes locales del `Date`).
- `dDow` = dia de la semana 1=Lun…7=Dom (`d.getDay()===0 ? 7 : d.getDay()`).
- `dayPlan`:
  - `assignedPlan` = plan con `assigned_date === dStr` (gana), si no:
  - `programPlan` = plan del programa con `day_of_week === dDow` Y `workoutPlanMatchesVariant(p, activeVariant, abMode)`.
  - `dayPlan = assignedPlan ?? programPlan ?? null`.
- `hasWorkout = !!dayPlan`.
- `isToday = dStr === today`.
- `isPast = dStr < today`; `isFutureDay = dStr > today`.
- **`isCompleted`** = `!!dayPlan && !isFutureDay && logs.some(l => l.workout_blocks.plan_id === dayPlan.id && getSantiagoIsoYmdForUtcInstant(l.logged_at) === dStr)`. O sea: hay plan ese dia, no es futuro, y hay al menos un log de ese plan ese dia (mismo criterio dia-binario que `workoutScore`). **Limitacion intencional:** la variante efectiva se calcula UNA vez para la semana actual (a diferencia de `workoutScore` que la recalcula por dia), por lo que el calendario asume que toda la semana visible es de la misma variante.
- `dayLabel` = inicial del dia (`d.toLocaleDateString('es-ES',{weekday:'narrow'}).toUpperCase()`).
- `dayNumber` = `d.getDate()`.

### 2.3.2 FRONTEND — `CalendarDaysRow` / `CalendarDay`

Componente cliente (`_components/calendar/CalendarDay.tsx`). Renderiza una grilla de 7 columnas (con stagger animado salvo `prefers-reduced-motion`). Cada celda muestra:
- La inicial del dia (`dayLabel`).
- El numero del dia (`dayNumber`).
- Un **marcador de estado** debajo:
  - Si `isCompleted` → icono **Check** (verde esmeralda).
  - Si `hasWorkout` (y no completado) → un **punto** (color marca, tenue).
  - Si no hay entreno → nada.
- Estados visuales funcionales (sin detalle de estilo): el dia de **hoy** con entreno se resalta (fondo color marca), hoy sin entreno se resalta tenue; dias pasados sin completar se atenuan.

> El calendario es **solo lectura/visual** — no dispara ninguna accion ni navega. Es un resumen de "que dias entreno toca esta semana y cuales ya cumpli".

---

## 2.4 BANNER DE CHECK-IN (`CheckInBanner` → `CheckInBannerFrame`)

### 2.4.1 BACKEND — criterio de aparicion (`CheckInBanner`, RSC)

Vive en `_components/checkin/CheckInBanner.tsx`. Datos:
- `base = getClientBasePath(coachSlug)` (prefijo de ruta del alumno).
- `last = getLastCheckIn(userId)` → ultimo `check_ins` del alumno: selecciona `id, weight, energy_level, date, created_at`, ordenado por `date` desc luego `created_at` desc, `limit 1` (ordena por el dia de medicion `date`, no por el instante de insercion).
- `todayIso = getTodayInSantiago().iso`.

**Logica de aparicion / variante (criterio de fecha):**
1. **Sin ningun check-in** (`!last?.created_at`): muestra banner neutro de onboarding — "Registra tu primer check-in" / "Peso y energia en segundos", con boton **"Ir"** → `${base}/check-in`.
2. **Con check-in previo:**
   - `lastDay = last.created_at.split('T')[0]` (dia del ultimo check-in).
   - `daysSince = differenceInCalendarDays(parseISO(todayIso T12:00:00), parseISO(lastDay T12:00:00))`.
   - Si **`daysSince < 3`** → **`return null`** (NO se muestra banner; el alumno esta al dia).
   - Si `daysSince >= 3`:
     - `variant = daysSince > 7 ? 'overdue' : 'warning'`.
     - Mensaje:
       - `overdue` (> 7 dias): **"Check-in pendiente!"**
       - `warning` y `daysSince === 3`: **"Check-in proximo"**
       - `warning` y `daysSince` 4–7: **"Check-in proximo — hace N dias"**.
     - Subtexto: `Ultimo: {formatRelativeDate(lastDay, todayIso)}` (etiquetas "Hoy"/"Ayer"/"Hace N dias"/"Hace 1 semana"/etc.).
     - Boton **"Check-in"** → `${base}/check-in`.

Resumen del criterio temporal: oculto si el ultimo check-in fue hace **< 3 dias**; aviso (`warning`) entre **3 y 7 dias**; alerta (`overdue`) a partir de **> 7 dias**.

### 2.4.2 FRONTEND — `CheckInBannerFrame`

Componente cliente (`_components/checkin/CheckInBannerFrame.tsx`). Es solo un wrapper que aplica un **pulso suave** (animacion de box-shadow infinita) cuando `overdue === true`, respetando `prefers-reduced-motion` (si reduce o no es overdue → render estatico). Los dos primeros casos (onboarding y warning) no usan este frame; van en un `div` estatico.

> El banner es el unico componente de este bloque que empuja activamente al alumno a una accion de RETENCION (registrar peso/energia). Toda la navegacion va a `${base}/check-in`. El score de check-ins del anillo (§2.2.5) y este banner comparten la fuente `check_ins` pero NO la misma ventana/criterio: el anillo cuenta filas en 30d contra meta 4; el banner mira la distancia en dias al ultimo check-in.

---

## 2.5 Resumen de fuentes de datos y tablas

| Pieza | Funcion/servicio | Tabla(s) | Ventana | Que mide / guarda |
|---|---|---|---|---|
| Hero plan de hoy | `getHeroComplianceBundle` → `getActiveProgram`, `getClientWorkoutPlans`, `getWorkoutPlanBlocksForHero` | `workout_programs`, `workout_plans`, `workout_blocks`, `exercises` | hoy (Santiago) | que entreno toca hoy + ejercicios |
| Series logueadas hoy | `getHeroComplianceBundle` → `getRecentWorkoutLogs` | `workout_logs` (+ `workout_blocks`) | hoy | progreso de series, `isAlreadyLogged` |
| Log rapido (escritura) | `logSetAction` | `workout_logs` | hoy (bounds Santiago) | upsert idempotente de una serie (peso=0) |
| Anillo Entrenos | `computeWorkoutScore30d` | `workout_plans`, `workout_logs`, `workout_programs` | 30d rodantes | % dias planificados con ≥1 log |
| Anillo Nutricion (mostrado) | `getNutritionLogDays30` | `daily_nutrition_logs` | 30d | engagement: dias con log / 30 |
| Compliance nutricion (calculado, no mostrado en cluster) | `computeNutritionComplianceScore` → `computeNutritionAdherence` | `nutrition_plans`, `nutrition_meals`, `food_items`, `foods`, `daily_nutrition_logs`, `nutrition_meal_logs` | 30d | sum(comidas done)/sum(aplicables) |
| Anillo Check-ins | `getCheckInHistory30Days` | `check_ins` | 30d (sobre `date`) | count / meta 4 |
| Calendario semanal | `WeekCalendar` (mismas queries del hero) | `workout_plans`, `workout_logs`, `workout_programs` | semana lun–dom actual | que dias toca entreno + cuales cumplidos |
| Banner check-in | `getLastCheckIn` | `check_ins` | distancia al ultimo | recordatorio segun dias desde el ultimo |

### Notas transversales para el rediseno
- **Master switch nutricion (`getDashboardNutritionDomainEnabled`):** resuelve via `resolveNutritionDomainEnabled` con el scope (coach/team/org) leido de la fila `clients` del propio alumno. Si el coach apago el dominio nutricion, se ocultan el anillo de Nutricion (grilla pasa a 2 columnas) y el link "Ver nutricion →" del RestDayCard — nunca un hueco vacio. `React.cache` lo deduplica (1 query por request aunque lo llamen 2 componentes).
- **Consistencia de resolucion de plan/variante:** hero, `workoutScore` y calendario usan EXACTAMENTE los mismos helpers (`programWeekIndex1Based`, `resolveEffectiveWeekVariant`, `workoutPlanMatchesVariant`) y el mismo criterio `assignedPlan ?? programPlan`. El fix de A/B mal armado (`effectiveWeekVariantFromPlans`) es compartido. Cualquier rediseno debe preservar esta consistencia.
- **Dia-binario en cumplimiento de entreno:** tanto `isAlreadyLogged` del hero como `isCompleted` del calendario y `workoutScore` consideran un dia "hecho" con UNA serie registrada (el hero ademas requiere todas las series para el overlay de "completado", pero el calendario/score no).
