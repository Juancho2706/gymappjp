# 3. Programa activo, entrenos recientes, records y racha

Esta seccion cubre cuatro superficies del dashboard del alumno (`/c/[coach_slug]/dashboard`) que rodean el entrenamiento: el **programa activo** (`ActiveProgramSection` + `ProgramPhaseBar` + `WorkoutPlanCard`), la **actividad reciente** (`RecentWorkoutsSection` + `WorkoutLogItem`), los **records personales** (`PersonalRecordsBanner` + `PRBadge`) y la **racha** (`StreakWidget`). El enfasis esta en el backend: que datos llegan, de que tablas/RPC salen y como se calculan.

Todas las queries viven en `apps/web/src/app/c/[coach_slug]/dashboard/_data/dashboard.queries.ts`, envueltas en `React.cache` (dedup por request). El timezone canonico de todo el calculo de fechas es **America/Santiago** (helpers en `apps/web/src/lib/date-utils.ts`). El dia de la semana usa la convencion DB **1=Lun ... 7=Dom** (no la de JS).

---

## 3.1 ActiveProgramSection — programa activo del alumno

Componente RSC (server): `apps/web/src/app/c/[coach_slug]/dashboard/_components/program/ActiveProgramSection.tsx`. Recibe `{ userId, coachSlug }`.

### Datos que llegan

Resuelve el base path con `getClientBasePath(coachSlug)` (para construir links `/c/.../workout/...` o el equivalente de team) y dispara **3 queries en paralelo** (`Promise.all`):

1. `getActiveProgram(userId)` — el programa activo del alumno (uno solo).
2. `getClientWorkoutPlans(userId)` — todos los planes del alumno (sueltos + de programa).
3. `getRecentWorkoutLogs(userId)` — logs de los ultimos 30 dias (para saber si ya entreno hoy).

#### `getActiveProgram(clientId)`

Tabla `workout_programs`, filtro `client_id = clientId AND is_active = true`, `.maybeSingle()`. SELECT explicito de columnas + join anidado de planes y bloques:

```
id, name, start_date, end_date, weeks_to_repeat, ab_mode, program_phases,
workout_plans ( id, title, day_of_week, week_variant, assigned_date,
  workout_blocks ( id, sets, reps, exercise_id, exercises ( id, name ) ) )
```

Tipo de retorno: `ActiveProgramRow` (= `Tables<'workout_programs'>` + `workout_plans[]` anidados con sus `workout_blocks[]` y el `exercises` de cada bloque). Devuelve `null` si no hay programa activo.

Campos clave del programa para el calculo:
- `start_date` — ancla del calculo de la semana actual.
- `weeks_to_repeat` — duracion del ciclo en semanas (default 1, minimo 1).
- `ab_mode` (bool) — si el programa alterna microciclos A/B por semana.
- `program_phases` (jsonb) — array de fases `{ name, weeks, color? }` para la barra de fases.

#### `getClientWorkoutPlans(clientId)`

Tabla `workout_plans`, filtro `client_id = clientId`, orden `assigned_date DESC`. SELECT: `id, title, assigned_date, group_name, day_of_week, week_variant, program_id, created_at`. Devuelve TODOS los planes del alumno (sueltos sin `program_id` y los de programa).

#### `getRecentWorkoutLogs(clientId)`

Tabla `workout_logs`, join `workout_blocks!inner(plan_id)`. Filtro `client_id = clientId AND logged_at >= hace 30 dias`, orden `logged_at DESC`, `limit 200`. SELECT: `id, logged_at, block_id, set_number, weight_kg, reps_done, workout_blocks!inner(plan_id)`. La ventana de 30 dias se ancla con `parseISOAnchor(iso)` (toma el ISO de hoy en Santiago, lo fija a mediodia local) menos 30 dias via `subDays`, convertido a `.toISOString()`.

### Empty states (orden de evaluacion)

1. **Sin programa activo** (`program == null`): GlassCard con icono `Calendar`, texto "Sin programa activo" + "Pidele a tu coach que te asigne uno".
2. **Sin dias visibles esta semana** (`programPlans.length === 0` tras filtrar por variante): GlassCard con "No hay dias visibles para esta semana del programa."

Estos son los unicos returns tempranos; el resto renderiza la card completa.

### Calculo de la semana actual del programa

`programWeekIndex1Based(program, userLocalDate)` (`apps/web/src/lib/workout/programWeekVariant.ts`):

1. Si falta `start_date` -> `null`.
2. `totalWeeks = max(1, weeks_to_repeat || 1)`.
3. `diffTime = |hoy - start_date|` (en ms).
4. `diffDays = ceil(diffTime / dia)`.
5. `currentWeek = min(totalWeeks, ceil(diffDays / 7))`, con piso de 1.

> Es la **misma formula** que usa el compliance del perfil del coach (comentario in-code: "misma formula que getClientProfileData / compliance"), para que la semana mostrada al alumno coincida con las metricas del coach.

En el componente: `currentWeek = weekIdx ?? 1` y `totalWeeks = max(1, weeks_to_repeat ?? 1)`. Se muestra como badge **"Semana {currentWeek} de {totalWeeks}"**. Si `ab_mode`, se anexa **" · Semana {activeVariant}"** (A o B).

### Resolucion de variante A/B (microciclos)

Cuando `ab_mode` esta activo, el programa alterna entre dos sets de planes (variante "A" semanas impares, "B" semanas pares). Logica en `programWeekVariant.ts`:

- `weekIndexToVariantLetter(week)`: `week % 2 === 1 ? 'A' : 'B'` (semana 1,3,5 -> A; 2,4,6 -> B).
- `resolveActiveWeekVariantForDisplay(program, planCurrentWeek, now)`: si `!ab_mode` -> siempre 'A'; si no, calcula la variante desde `planCurrentWeek` (compliance) o desde `start_date`.
- `workoutPlanMatchesVariant(plan, activeVariant, abMode)`: sin A/B -> solo planes con variante 'A' (o sin variante, default 'A'), para no mezclar plantillas B sueltas. Con A/B -> solo la variante activa.

**Variante EFECTIVA** (`resolveEffectiveWeekVariant`): es el corazon del fix del dead-end de A/B mal armado. Si la variante que toca por ciclo NO tiene ningun plan cargado y la otra SI, **cae a la que tiene planes** (`effectiveWeekVariantFromPlans`). Asi un programa con `ab_mode=true` pero una sola semana cargada (solo A) no deja al alumno con el dashboard vacio en semanas "B" (era un dead-end silencioso). Para A/B bien armado (ambas variantes presentes) devuelve exactamente la variante del ciclo -> cero cambio de comportamiento.

> Este fix es reciente: el commit mas nuevo del repo es `e4567bf4 fix(workout): alumno ve programa vacio en semanas "B" de A/B mal armado`.

En el componente, `activeVariant` se resuelve pasando `weekIdx` como el `planCurrentWeekFromCompliance` y `userLocalDate` como `now`, filtrando solo los planes del `program.id`.

### Filtro de planes a mostrar (dias del programa)

```
activePlans = allPlans.filter(p => !p.program_id || p.program_id === program?.id)
programPlans = activePlans
  .filter(p => p.program_id === program.id && workoutPlanMatchesVariant(p, activeVariant, abMode))
  .sort((a, b) => (a.day_of_week ?? 0) - (b.day_of_week ?? 0))
```

`programPlans` son los dias del programa de la variante activa, ordenados por `day_of_week`. Cada uno se renderiza como una card (ver `WorkoutPlanCard`).

### Calculo "entreno de hoy" (`todayPlan`) y "ya entreno hoy" (`workoutLoggedToday`)

`getTodayInSantiago()` devuelve `{ date: userLocalDate, iso: today, dayOfWeek: todayDow }`.

**Plan de hoy** (`todayPlan`), en orden de prioridad:
1. Plan con `assigned_date === today` (fecha exacta asignada).
2. Si no hay: plan del programa cuyo `day_of_week === todayDow` Y que matchee la variante activa.
3. Si no hay: `null`.

**Ya entreno hoy** (`workoutLoggedToday`):
1. Toma el plan de hoy anidado en el programa (`nestedPlan = program.workout_plans.find(p => p.id === todayPlan.id)`).
2. Construye `blockIds` = set de los `id` de los `workout_blocks` de ese plan.
3. `workoutLoggedToday = true` si existe un log en `logs` cuyo dia calendario en Santiago (`getSantiagoIsoYmdForUtcInstant(l.logged_at)`) sea `today` Y (`blockIds` vacio OR `blockIds.has(l.block_id)`).

> El matcheo por `block_id` asegura que el check "hecho" sea del plan de hoy especificamente, no de cualquier entreno suelto del dia. Si el plan no tiene bloques resueltos (`blockIds.size === 0`), se relaja a "cualquier log de hoy cuenta".

### Acciones / navegacion

- Cada `WorkoutPlanCard` linkea a `${base}/workout/${plan.id}` (ejecutar la rutina de ese dia).
- Al pie, si hay `todayPlan`: link **"Ver entreno de hoy →"** a `${base}/workout/${todayPlan.id}`.

---

## 3.2 ProgramPhaseBar — fases / semana actual

Componente client: `apps/web/src/app/c/[coach_slug]/dashboard/_components/program/ProgramPhaseBar.tsx`. Recibe `{ phases, currentWeek, totalWeeks }`.

### Datos que llegan

`phases` viene de `program.program_phases` (jsonb), casteado a `PhaseSeg[] | null`. Cada `PhaseSeg`:
```
{ name: string, weeks: number, color?: string }
```
`currentWeek` y `totalWeeks` vienen del calculo de seccion 3.1.

### Calculo

**Progreso (marcador):** `pct = totalWeeks > 0 ? min(100, (currentWeek / totalWeeks) * 100) : 0`. Es el porcentaje de avance del ciclo.

**Dos modos de render:**

1. **Sin fases** (`phases` null/vacio): barra simple cuyo ancho animado es `pct%`.
2. **Con fases:** segmentos contiguos, cada uno con ancho `(phase.weeks / totalWeeks) * 100 %`. Encima, un marcador circular posicionado en `left: pct%` que indica la semana actual dentro del ciclo.

> No hay calculo de "fase actual" explicito: la posicion del marcador (`pct`) sobre los segmentos comunica visualmente en que fase esta el alumno. La suma de `weeks` de las fases deberia coincidir con `totalWeeks` (responsabilidad del coach al armar el programa; no se valida en el cliente).

---

## 3.3 WorkoutPlanCard (WorkoutPlanCards) — dia del programa

Componente client: `apps/web/src/app/c/[coach_slug]/dashboard/_components/program/WorkoutPlanCard.tsx`. Export `WorkoutPlanCards`. Recibe `{ coachSlug, plans, todayDow, workoutLoggedToday }`.

### Datos que llegan

`plans`: `Array<{ id, title, day_of_week }>` (= `programPlans` de la seccion 3.1). `todayDow`: dia de hoy 1-7. `workoutLoggedToday`: bool calculado en `ActiveProgramSection`.

### Calculo por card

Para cada plan `p`:
- `dow = p.day_of_week ?? 1`.
- `isToday = dow === todayDow`.
- `done = isToday && workoutLoggedToday` (solo el card de HOY puede mostrarse completado).
- Label del dia: `DAYS[dow - 1]` donde `DAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']`.

### Frontend funcional

Cada card muestra: badge del dia (Lun..Dom), titulo del plan (`p.title`), subtitulo "Día {dow}", y a la derecha un icono `Check` (verde) si `done`, o `ChevronRight` si no. Toda la card es un `Link` a `${base}/workout/${p.id}` (base resuelto con `useBasePath(\`/c/${coachSlug}\`)`). El card de hoy se distingue visualmente (sin detallar estilos).

---

## 3.4 RecentWorkoutsSection — actividad reciente

Componente RSC: `apps/web/src/app/c/[coach_slug]/dashboard/_components/history/RecentWorkoutsSection.tsx`. Recibe `{ userId, coachSlug }`.

### Datos que llegan

- `getClientBasePath(coachSlug)` para el link.
- `getRecentWorkoutLogs(userId)` — la **misma query** que usa `ActiveProgramSection` (dedup por `React.cache`): `workout_logs` ultimos 30 dias, limit 200, ordenado `logged_at DESC`.

Si `logs.length === 0` -> retorna `null` (la seccion no se renderiza).

### Calculo — agrupacion por dia (`buildWorkoutLogDaySummaries`)

`buildWorkoutLogDaySummaries(logs, { dayLimit: 5 })` (funcion pura en `dashboard.queries.ts`):

1. Agrupa cada log por su **dia calendario en America/Santiago**. La clave de dia se computa con `new Date(log.logged_at).toLocaleString('en-US', { timeZone: 'America/Santiago' })` -> reconstruye `YYYY-MM-DD` local.
2. Ordena los dias `DESC` (mas reciente primero).
3. Aplica `dayLimit` (aqui 5 dias).
4. Por dia: `sets = cantidad de logs` (cada fila de `workout_logs` = una serie registrada). `dateLabel` = fecha localizada `es-CL` con `weekday: 'long', day: 'numeric', month: 'short'` (ancla a `T12:00:00` para evitar drift de TZ). `subtitle = "{sets} serie(s) registrada(s)"`.

Resultado: `Array<{ dayKey, dateLabel, sets, subtitle }>`.

> **Importante:** "sets" = numero de FILAS en `workout_logs` ese dia, es decir series logueadas (cada serie completada es una fila). No agrupa por ejercicio ni por plan; es un conteo crudo de series del dia.

### Items renderizados (`WorkoutLogItem` / `WorkoutLogItems`)

Componente client: `apps/web/src/app/c/[coach_slug]/dashboard/_components/history/WorkoutLogItem.tsx`. Export `WorkoutLogItems`. Recibe `items: Array<{ dayKey, dateLabel, sets, subtitle }>`.

Por item muestra: icono `Dumbbell`, `dateLabel` (ej. "lunes, 23 jun"), `subtitle` ("N series registradas") y a la derecha el conteo **"{sets} serie/series"** (singular/plural segun `sets === 1`). Animacion de entrada en cascada via `RevealStagger`/`RevealItem` (reduced-motion aware).

### Navegacion

Link al pie: **"Ver historial completo →"** a `${base}/workout-history` (con `prefetch`).

> La pagina de historial completo NO usa `buildWorkoutLogDaySummaries` sobre filas crudas; usa `getWorkoutHistoryDayCounts(clientId, daysBack)` que delega al RPC `get_client_workout_day_counts` (agrega en DB, zona Santiago) para no bajar hasta 8000 filas. El RPC valida ownership (cliente self / coach / pool), agrupa `timezone('America/Santiago', logged_at)::date` y devuelve `(day, sets)`. El map a `dateLabel`/`subtitle` es identico al de `buildWorkoutLogDaySummaries` (paridad validada: 38 dias / 751 sets identico al JS). `getWorkoutHistoryLogsFull` (ventana 365d, limit 8000) sigue existiendo pero es el patron legacy reemplazado por el RPC.

---

## 3.5 PersonalRecordsBanner + PRBadge — records personales

### PersonalRecordsBanner (RSC)

`apps/web/src/app/c/[coach_slug]/dashboard/_components/records/PersonalRecordsBanner.tsx`. Recibe `{ userId }`. Llama `getPersonalRecords(userId)`. Si vacio -> retorna `null`. Si no, renderiza un carrusel horizontal scrolleable de `PRBadge` (key `${pr.exerciseId}-${pr.achievedAt}`).

### Calculo — `getPersonalRecords(clientId)`

Funcion en `dashboard.queries.ts`, envuelta en `measureServer` (telemetria). Detecta records de peso **recientes** (que son el maximo historico del ejercicio). Algoritmo:

1. **Ventana reciente:** `fourteenAgo = hoy(Santiago, mediodia) - 14 dias`.
2. Dos queries en paralelo sobre `workout_logs` (filtro `client_id`, `weight_kg IS NOT NULL`):
   - `recentLogs`: `logged_at >= fourteenAgo`, orden `logged_at DESC`, **limit 120**. SELECT `weight_kg, block_id, logged_at`.
   - `histLogs`: TODO el historial (sin ventana), **limit 3000**. SELECT `weight_kg, block_id`.
3. Si `recentLogs` vacio -> retorna `[]` (sin actividad reciente, no hay PR que mostrar).
4. **Resolver ejercicio por bloque:** junta los `block_id` de ambos sets, consulta `workout_blocks (id, exercise_id)` con `.in('id', blockIds)`, arma `blockToEx` (block_id -> exercise_id). Luego consulta `exercises (id, name)` con `.in('id', exIds)`, arma `exName` (exercise_id -> nombre).
5. **Maximo historico por ejercicio:** recorre `allW` (histLogs) y arma `maxByExercise` (exercise_id -> mayor `weight_kg` visto en TODO el historial).
6. **Deteccion de PR:** recorre `recent` (recentLogs, ya ordenado DESC). Para cada fila resuelve su `exercise_id`. Es PR si `weight_kg >= maxByExercise[exercise_id]` (el peso reciente iguala o supera el maximo historico). Se ignoran ejercicios ya vistos (`seen` set -> un PR por ejercicio, el mas reciente por el orden DESC).
7. **Salida:** array de `PersonalRecordItem` `{ exerciseId, exerciseName, weightKg, achievedAt }`, ordenado por `weightKg DESC`, recortado a **top 5**.

> **Definicion operativa de PR:** un peso registrado en los ultimos 14 dias que es el maximo historico (entre las primeras 3000 filas de historial) para ese ejercicio. Es por PESO absoluto (`weight_kg`), no por 1RM estimado ni por volumen ni por reps. Limitaciones: (a) el limit 3000 del historial puede dejar fuera PRs muy antiguos en alumnos con historial gigante; (b) usa `>=` asi que igualar el record cuenta como PR; (c) no considera reps — levantar el mismo peso a menos reps cuenta igual.

### PRBadge (client)

`apps/web/src/app/c/[coach_slug]/dashboard/_components/records/PRBadge.tsx`. Recibe `{ exerciseName, weightKg, achievedAt, index }`.

- Muestra: icono `Trophy`, `exerciseName` y **"{weightKg} kg"**.
- **Confeti:** al montar, si el PR fue logrado hace **<= 24 horas** (`Date.now() - new Date(achievedAt) <= 24h`), dispara `canvas-confetti` UNA sola vez por sesion. Idempotencia via `sessionStorage` con key `pr-confetti-${exerciseName}-${achievedAt.slice(0,10)}`. `canvas-confetti` se importa dinamicamente (lazy).

---

## 3.6 StreakWidget — racha

### Origen del dato

El widget recibe `streak: number` ya calculado. Se renderiza desde `DashboardHeader` (`apps/web/src/app/c/[coach_slug]/dashboard/_components/DashboardHeader.tsx`), que llama `getDashboardStreak(userId)` y pasa el resultado a `<StreakWidget streak={streak} />`.

### Calculo — `getDashboardStreak(clientId)` -> RPC `get_client_current_streak`

`getDashboardStreak` (en `dashboard.queries.ts`) llama el RPC `get_client_current_streak(p_client_id)` via `supabase.rpc`. Si error -> 0; normaliza a numero finito (else 0).

El RPC (`SECURITY DEFINER`, PL/pgSQL — definicion vigente en `supabase/migrations/20260616165712_fix_idor_client_streak_lastworkout_guard.sql`, que agrega el guard IDOR sobre el cap de `20260612053000_streak_cap_730d.sql`):

1. **Guard IDOR:** si `auth.uid() IS NOT NULL` y el caller NO es el propio alumno (`p_client_id = auth.uid()`), ni su coach (`clients.coach_id = auth.uid()`), ni esta en el pool (`current_user_pool_client_ids()`) -> retorna 0. Service-role (`auth.uid() IS NULL`) bypasea el guard (lo usa el pulse path mobile / DashboardService admin).

2. **Recopila fechas de actividad** (`v_activity_dates`, array DESC) — UNION de dos fuentes, ambas acotadas a **730 dias** (cap de 2 años para evitar full-scan; rachas >2 años no existen en la practica):
   - `DATE(logged_at)` de `workout_logs` del cliente (entrenos).
   - `dnl.log_date` de `nutrition_meal_logs nml JOIN daily_nutrition_logs dnl` donde `nml.is_completed = true` (comidas completadas).

   > **Una racha la mantiene CUALQUIERA de las dos:** entrenar O completar al menos una comida ese dia. El UNION deduplica fechas, asi que un dia con ambas cuenta como un solo dia.

   > **Gotcha de TZ:** el RPC usa `DATE(logged_at)` y `CURRENT_DATE` del servidor Postgres (no `America/Santiago` explicito como el resto del dashboard). El dia de actividad de `workout_logs` se deriva de `DATE(logged_at)` en la TZ de la sesion DB. Esto puede divergir levemente del agrupamiento por Santiago de la actividad reciente (3.4), que si fuerza Santiago. El `nutrition` usa `log_date` (ya es una fecha local sin TZ).

3. **Sin actividad** (`v_activity_dates` null/vacio) -> 0.

4. **Racha rota si el ultimo dia de actividad es anterior a ayer:** `IF v_activity_dates[1] < CURRENT_DATE - 1 day THEN RETURN 0`. Es decir, la racha solo "vive" si hubo actividad **hoy o ayer** (un dia de gracia: no entrenar hoy todavia no rompe la racha si entrenaste ayer).

5. **Conteo de la racha:** parte en 1 con el ultimo dia. Recorre el array DESC: si el dia siguiente es exactamente `v_last_date - 1 dia`, incrementa y avanza; si hay un hueco (`v_date < v_last_date - 1 dia`), `EXIT` (corta). Dias iguales/duplicados se saltan sin romper.

> **Que rompe la racha:** un dia calendario sin NINGUNA actividad (ni entreno ni comida completada) entre dos dias activos -> corta el conteo ahi. Y globalmente, no tener actividad ni hoy ni ayer -> racha = 0.

### Frontend funcional

- `streak === 0`: texto **"Empieza tu racha"**.
- `streak > 0`: chip con icono `Flame` + numero + "dias".
- Umbrales de celebracion: `pulse = streak >= 3` (animacion de latido), `big = streak >= 7` (glow + icono mas grande). `streak >= 30` dispara confeti UNA vez por sesion (key `streak-confetti-${streak}` en `sessionStorage`), respetando `prefers-reduced-motion`.

---

## 3.7 Resumen backend (tablas, RPC, ventanas)

| Superficie | Fuente | Ventana / limite | Calculo clave |
|---|---|---|---|
| Programa activo | `workout_programs` (+ planes/bloques anidados), `workout_plans` | 1 programa `is_active` | semana = `ceil(diffDays/7)` cap `weeks_to_repeat`; variante A/B por paridad de semana con fallback a la variante con planes |
| "Ya entreno hoy" | `getRecentWorkoutLogs` (`workout_logs`) | 30d, limit 200 | log de hoy (Santiago) cuyo `block_id` pertenece al plan de hoy |
| Barra de fases | `workout_programs.program_phases` (jsonb) | — | ancho segmento = `weeks/totalWeeks`; marcador = `currentWeek/totalWeeks` |
| Actividad reciente | `getRecentWorkoutLogs` (`workout_logs`) | 30d, limit 200, dayLimit 5 | series/dia = filas por dia calendario Santiago |
| Historial completo | RPC `get_client_workout_day_counts` | `p_days_back` | agregado en DB, `timezone('America/Santiago', logged_at)::date` |
| Records (PR) | `workout_logs` (recent + hist), `workout_blocks`, `exercises` | recent 14d/limit 120; hist limit 3000; top 5 | PR = peso reciente `>=` max historico del ejercicio (por `weight_kg`) |
| Racha | RPC `get_client_current_streak` | 730d cap | dias consecutivos con entreno O comida completada; vive si hubo actividad hoy/ayer |

> Toda query del dashboard usa `React.cache` (dedup intra-request) y SELECT de columnas explicitas (nunca `SELECT *`). Los RPC de racha/historial/PR-guard son `SECURITY DEFINER` con guard IDOR (self / coach / pool) y bypass service-role para el path mobile.
