# 1. Vision general, arquitectura, carga y flujo de ejecucion

## 1.1 Que es esta pantalla y su rol

La ruta `/c/[coach_slug]/workout/[planId]` (archivo `apps/web/src/app/c/[coach_slug]/workout/[planId]/page.tsx`) es **la pantalla de ejecucion de la rutina del alumno**: el momento en que el alumno *consume* lo que el coach armo en el builder de entrenamiento y registra cada serie mientras entrena. Es el punto de mayor friccion fisica de toda la app (registrar con el celular en la mano, entre serie y serie), y es el espejo de consumo del builder: cada `workout_block` que el coach prescribio aparece aca como una tarjeta de ejercicio con sus objetivos (series x reps, peso, descanso, tempo, RIR — o, para bloques no-fuerza, duracion / distancia / zona FC / hold / pasadas) y una tabla de registro por serie.

Es la **misma pantalla** para el alumno standalone (`/c/[coach_slug]/...`) y para el alumno de un team de pool (servido bajo `/e/[org_slug]/...` o `/t/[team_slug]/...` y *reescrito* por el proxy a `/c/[coach_slug]/...`). La unica diferencia es el prefijo de los links internos, resuelto via `getClientBasePath` / `useBasePath` (header `x-client-base-path`); el render del arbol es byte-identico.

## 1.2 Las capas: page (RSC) -> queries -> Supabase

El flujo respeta el data-flow obligatorio del proyecto pero con un detalle: la query vive en `_data/` y habla **directo a Supabase** (no pasa por `services/` ni por un repository), salvo para cardio que si delega en `getClientZonesForContext` (services). Las capas concretas:

1. **`page.tsx` (React Server Component, `WorkoutExecutionPage`)**
   - `async` server component. Recibe `params: Promise<{ coach_slug, planId }>`.
   - `const base = await getClientBasePath(coach_slug)` — resuelve el prefijo de links (`x-client-base-path` o `/c/${coach_slug}`).
   - `const data = await getWorkoutExecutionData(planId)` — UNA sola llamada que trae todo.
   - Guards de redireccion (ver 1.6):
     - `if (!user) redirect(\`${base}/login\`)`
     - `if (!plan) redirect(\`${base}/dashboard\`)`
   - Renderiza `<WorkoutExecutionClient>` pasando: `plan`, `program`, `logs`, `previousHistory`, `coachSlug`, `exerciseMaxes`, `activeWeekVariant`, `areas`, `cardio`.
   - `metadata = { title: 'Rutina | EVA' }`.

2. **`_data/workout-execution.queries.ts` (`getWorkoutExecutionData`, envuelto en `React.cache`)**
   - Es el orquestador de lectura. Capa de presentacion-datos que ejecuta multiples queries a Supabase (algunas user-scoped via RLS, otras con service-role para datos que el alumno no puede leer por RLS). Detalle exhaustivo en 1.3.

3. **Supabase (PostgreSQL + RLS)**
   - Tablas leidas: `workout_plans`, `workout_blocks`, `exercises` (join anidado), `workout_programs`, `workout_logs`, `clients`, `workout_section_templates` (areas). El gating de cardio lee `enabled_modules` de `teams`/`coaches` via service-role.

> Nota arquitectonica: el comentario del CLAUDE.md exige `_data → services → repository → Supabase`. Esta query NO sigue eso estrictamente — usa `createClient()` (user-scoped) y `createServiceRoleClient()` directos. Para un rediseno con feature parity hay que preservar este comportamiento (no romper RLS ni los dos clientes), aunque idealmente se mueva a un repository/service.

## 1.3 QUE DATOS LLEGAN (carga completa en `getWorkoutExecutionData`)

`getWorkoutExecutionData(planId)` corre estos pasos en orden:

### a) Autenticacion (local, sin /user)
```ts
const supabase = await createClient()
const { data: __cl } = await supabase.auth.getClaims()   // verifica JWT ES256 localmente
const user = __cl?.claims?.sub ? { id: __cl.claims.sub } : null
if (!user) return { user: null, plan: null }
```
Usa `getClaims()` (no `getUser()`): verificacion local del JWT, el proxy ya valido/refresco la sesion. `user.id` = `claims.sub` = el `id` del alumno (que es tambien `clients.id`).

### b) El plan del dia + sus bloques + ejercicios (query principal, anidada)
```ts
supabase.from('workout_plans').select(`
  id, title, assigned_date, day_of_week, week_variant, program_id, coach_id,
  workout_blocks (
    id, order_index, sets, reps, target_weight_kg, tempo, rir, rest_time, notes,
    section, section_template_id, superset_group, progression_type, progression_value, is_override,
    exercise_type_override, side_mode, reps_value, reps_unit, load_value, load_unit,
    distance_value, distance_unit, duration_sec, target_pace_sec_per_km, hr_zone,
    instructions, interval_config,
    exercises ( id, name, muscle_group, video_url, video_start_time, video_end_time, gif_url, instructions, exercise_type )
  )
`)
.eq('id', planId)
.eq('client_id', user.id)   // GUARD de propiedad — el alumno solo lee SU plan
.maybeSingle()
```
- Trae el **plan** (campos en `PlanType`): `id`, `title`, `assigned_date`, `day_of_week`, `week_variant` (`'A'|'B'|null`), `program_id`, `coach_id`.
- Trae **todos los bloques** del plan (`workout_blocks`) embebidos, con su **prescripcion completa** — incluida la **prescripcion polimorfica** (campos `exercise_type_override`, `side_mode`, `reps_value/unit`, `load_value/unit`, `distance_value/unit`, `duration_sec`, `target_pace_sec_per_km`, `hr_zone`, `instructions`, `interval_config`). Los campos polimorficos son `null` en planes legacy (AC3).
- Trae el **ejercicio** de cada bloque embebido (`exercises`): `id`, `name`, `muscle_group`, multimedia (`video_url`, `video_start_time`, `video_end_time`, `gif_url`), `instructions[]` (pasos de tecnica) y `exercise_type` (tipo del catalogo: strength/cardio/mobility/roller; null en snapshots legacy).
- `if (!rawPlan) return { user, plan: null }` — dispara el redirect a dashboard.

> El join `exercises` viene como objeto o array segun PostgREST; el cliente lo normaliza con `getExercise(block)` = `Array.isArray(block.exercises) ? block.exercises[0] : block.exercises`. El modelo asume **un ejercicio por bloque** (`exercises[0]`).

### c) Validacion del programa activo (segunda guard, si el plan pertenece a un programa)
```ts
if (plan.program_id) {
  const { data: activeProgramForUser } = await supabase.from('workout_programs')
    .select('id').eq('client_id', user.id).eq('id', plan.program_id).eq('is_active', true).maybeSingle()
  if (!activeProgramForUser) return { user, plan: null }   // programa inactivo => redirect dashboard
}
```
Si el plan es parte de un programa, ese programa debe estar **activo** para el alumno; si no, se trata como inexistente (redirect). Planes sueltos (sin `program_id`) saltan este chequeo.

### d) Metadatos del programa (para el header)
```ts
program = supabase.from('workout_programs')
  .select('id, name, program_phases, program_structure_type, cycle_length, ab_mode, start_date, weeks_to_repeat')
  .eq('id', plan.program_id).eq('client_id', user.id).maybeSingle()
```
`ProgramType`: `name`, `program_phases[]` (`{name, weeks, color?}`), `program_structure_type` (`'weekly'|'cycle'`), `cycle_length`, `ab_mode`, `start_date`, `weeks_to_repeat`. Se usa para decidir el subtitulo del header (`Dia X de Y` vs `Programa semanal`) y la variante A/B activa.

### e) Variante de semana A/B efectiva
```ts
const activeWeekVariant = program?.ab_mode ? resolveActiveWeekVariantForDisplay(program) : null
```
- Si el programa es A/B (`ab_mode`), calcula que microciclo toca *ahora* (`resolveActiveWeekVariantForDisplay` en `apps/web/src/lib/workout/programWeekVariant.ts`): semana 1,3,5… => `A`; 2,4,6… => `B`. El indice de semana sale de `start_date` + `weeks_to_repeat` (formula `programWeekIndex1Based`). Es **solo para mostrar** el chip "Semana A/B" en el header — esta query no filtra ni cae a la otra variante (eso lo hace el dashboard al elegir que plan abrir, via `resolveEffectiveWeekVariant`/`effectiveWeekVariantFromPlans`, que existen en el mismo lib para arreglar el dead-end de A/B mal armado — ver commit `e4567bf4`).

### f) Logs PREVIOS de HOY (autollenado / estado de series ya registradas)
```ts
const blockIds = plan.workout_blocks.map(b => b.id)
const { iso: todayStr } = getTodayInSantiago()
const { startIso: todayStartUtc, endIso: todayEndUtc } = getSantiagoUtcBoundsForDay(todayStr)
supabase.from('workout_logs')
  .select('block_id, set_number, weight_kg, reps_done, rpe, rir, actual_duration_sec, actual_distance_m, actual_hold_sec, actual_avg_hr')
  .in('block_id', blockIds)
  .gte('logged_at', todayStartUtc).lt('logged_at', todayEndUtc)
```
- Son los logs **del dia de HOY** (ventana UTC de la fecha de Santiago) para los bloques de ESTE plan. Permiten:
  - precargar los inputs (`defaultValue={existingLog?.weight_kg}` etc.),
  - marcar la serie como "Completada",
  - calcular el % de progreso de la sesion.
- Trae los ejes strength (`weight_kg`, `reps_done`, `rpe`, `rir`) **y** los ejes polimorficos (`actual_duration_sec`, `actual_distance_m`, `actual_hold_sec`, `actual_avg_hr`).
- **Importante:** es scoped por `logged_at` de hoy, no por sesion. Re-entrar al plan mas tarde el mismo dia recupera el progreso; al dia siguiente la pantalla arranca vacia (los de ayer pasan a `previousHistory`).

### g) `previousHistory` — referencia de la sesion anterior (chips "Sesion anterior")
```ts
const exerciseIds = plan.workout_blocks.map(b => exercise.id).filter(Boolean)
supabase.from('workout_logs')
  .select(`weight_kg, reps_done, logged_at, set_number, workout_blocks!inner(exercise_id)`)
  .eq('client_id', user.id)
  .in('workout_blocks.exercise_id', exerciseIds)   // join inner por ejercicio
  .not('block_id', 'in', `(${blockIds.join(',')})`) // EXCLUYE los bloques de hoy
  .order('logged_at', { ascending: false })
  .limit(200)
```
- Indexado por `exercise_id` (no por bloque): junta el historial de ese ejercicio aunque venga de otro bloque/plan.
- La logica `forEach` arma `previousHistory[exId]` quedandose **solo con la fecha mas reciente** de cada ejercicio: agrega el primer log (el mas nuevo) y luego solo agrega logs cuya `logDate` ya este en la lista (es decir, todos los sets del mismo dia mas reciente). Resultado: un array de series `{weight_kg, reps_done, date}` de la ultima vez que hizo ese ejercicio.
- Se muestra como chips "S1: 80kg x 8" + fecha relativa, **solo en bloques strength** (`effType === 'strength' && previousHistory[exercise.id]`).
- Cap defensivo: `.limit(200)`.

### h) `areas` — nombres/orden de las areas no-clasicas del plan (service-role)
```ts
const areaIds = [...new Set(plan.workout_blocks.map(b => b.section_template_id)
  .filter(id => !!id && !classicSlugForAreaId(id)))]   // descarta warmup/main/cooldown
if (areaIds.length > 0) {
  const { data: clientRow } = await supabase.from('clients').select('team_id').eq('id', user.id).maybeSingle()
  const tenantFilters = ['is_system.eq.true']
  if (plan.coach_id) tenantFilters.push(`coach_id.eq.${plan.coach_id}`)
  if (clientRow?.team_id) tenantFilters.push(`team_id.eq.${clientRow.team_id}`)
  const serviceDb = createServiceRoleClient()   // service-role PURO (sin cookies)
  areas = serviceDb.from('workout_section_templates')
    .select('id, name, slug, sort_order, is_system, coach_id, team_id')
    .in('id', areaIds)
    .or(tenantFilters.join(','))   // SOLO system, coach del plan, o team del alumno
    .is('deleted_at', null)
}
```
- Las areas custom del coach/team no son legibles por el alumno via RLS (`wst_select`), por eso se resuelven con **service-role puro** (`createServiceRoleClient`, sin cookies — NO `createRawAdminClient`, que heredaria la sesion del alumno y correria como el => bypass falso).
- Doble acotamiento (data minimization): solo ids ya presentes en el plan + solo areas del tenant del plan (system / coach del plan / team del alumno). Un id cross-context copiado por assign/duplicate **no se resuelve** y el bloque cae al bucket legacy. Soft-deleted excluidas.
- Los 3 clasicos (warmup/main/cooldown, ids `0000a5ec-*`) NO se resuelven aca (se titulan por la via legacy).

### i) `exerciseMaxes` — max all-time de peso por ejercicio (para detectar PR en el resumen)
```ts
const { data: maxData } = exerciseIds.length === 0 ? { data: [] } : await supabase.from('workout_logs')
  .select('block_id, weight_kg, workout_blocks!inner(exercise_id)')
  .eq('client_id', user.id).not('weight_kg', 'is', null)
  .in('workout_blocks.exercise_id', exerciseIds).limit(5000)
// forEach: ignora los bloques de ESTE plan (blockIdsSet.has) y se queda con el MAX por exercise_id
```
- Calcula el **peso maximo historico** por ejercicio (excluyendo los bloques de la sesion actual, para que el resumen detecte si HOY se rompio el record).
- Acotado a los ejercicios del plan (`.in(... exerciseIds)`) + cap `.limit(5000)` (antes traia todo el historial sin techo — optimizacion documentada en el comentario del codigo).

### j) `cardio` — zonas FC personalizadas del alumno (service-role, gateado por modulo)
```ts
let cardio = { enabled: false, zones: null }
const planHasCardioFields = plan.workout_blocks.some(b => b.hr_zone != null || (b.duration_sec ?? 0) > 0 || b.interval_config != null)
if (planHasCardioFields) {
  const result = await getClientZonesForContext(supabase, user.id, createServiceRoleClient())
  cardio = { enabled: result.enabled, zones: result.zones?.zones ?? null }
}
```
- Solo se calcula si el plan tiene bloques con campos cardio (optimizacion).
- `getClientZonesForContext` (en `services/cardio-zones.service.ts`): lee el perfil cardio del alumno (own-row via RLS) y resuelve si el **modulo `cardio`** esta ON para el CONTEXTO del recurso (team del alumno manda; si no, su coach). El flag de modulo vive en `teams.enabled_modules`/`coaches.enabled_modules`, que el alumno NO puede leer por RLS => se pasa un client service-role como `entitlementsDb`. Si esta ON y el perfil permite derivar bpm, devuelve las zonas (`HrZoneRange[]` = `{zone, minBpm, maxBpm}`); si no, `{enabled:false, zones:null}`.
- Uso en UI: los chips de zona FC pasan de `"Z4"` (modulo OFF) a `"Z4 · 150–168 bpm"` (modulo ON con zonas).

### k) Return
```ts
return { user, plan, program, logs, previousHistory, exerciseMaxes, activeWeekVariant, areas, cardio }
```

> Todas estas queries corren **secuenciales** dentro de `getWorkoutExecutionData` (no hay `Promise.all` para los pasos independientes f/g/i — oportunidad de optimizacion en el rediseno). Toda la funcion va envuelta en `React.cache` (dedup por request).

## 1.4 Como se navega la sesion (`WorkoutExecutionClient`)

`WorkoutExecutionClient.tsx` (`'use client'`) es el orquestador de la ejecucion. Estructura y flujo:

### Orden de bloques / agrupacion (consumo de la estructura del builder)
1. **Orden base por `order_index`:**
   `const blocks = useMemo(() => [...plan.workout_blocks].sort((a,b) => a.order_index - b.order_index), ...)`.
2. **Agrupacion por AREA + secciones (`sectioned`, useMemo):**
   `executionAreaGroupsFor(blocks, areas)` (en `lib/workout-areas.ts`) agrupa los bloques por su area efectiva:
   - `section_template_id` es la fuente preferente; los 3 clasicos (warmup/main/cooldown por id) van por la via legacy con sus titulos/subtitulos de siempre.
   - Areas resueltas (system extra o custom visibles) agrupan por su `name` y `sort_order`.
   - Ids no resueltos (area soft-deleted o de otro contexto) caen a la seccion legacy del bloque (`block.section` => warmup/main/cooldown/other).
   - Orden de grupos: `sortOrder` (legacy warmup=0, main=10, cooldown=20, other=9999; areas por su `sort_order`), desempate por nombre.
   - Cada grupo recibe: `title` (nombre del area o `WORKOUT_SECTION_TITLE[legacySection]`), `subtitle` (subtitulo legacy por seccion, o `SYSTEM_AREA_SUBTITLE[slug]` para areas system, o null para custom), `muted` (true en warmup/cooldown).
3. **Superseries contiguas dentro de cada area/seccion (`groupContiguousSupersetRuns` en `lib/workout-block-grouping.ts`):**
   Agrupa en una "Superserie" solo tramos *consecutivos* con el mismo `superset_group` y `order_index` contiguo (+1). Lo demas son ejercicios `single`. Devuelve `{key, type:'superset'|'single', supersetLetter?, blocks[]}`.
4. **Render:** secciones (`<section>` por area) -> grupos (tarjeta por grupo, "Superserie (grupo X)" o "Ejercicio N") -> bloques (tarjeta por ejercicio) -> filas de set (`LogSetForm` por cada serie `1..block.sets`).

### Avanzar / auto-scroll al siguiente bloque
- No hay un "wizard" paso a paso: la sesion es **una lista vertical scrolleable** con todos los bloques visibles. El alumno registra serie por serie en cualquier orden.
- `blockRefs` (`useRef<Map<string, HTMLDivElement>>`) guarda el DOM de cada bloque.
- Al **completar un bloque** (transicion incompleto -> completo, detectada en `handleLogged`), tras 350ms se hace `scrollIntoView({behavior:'smooth', block:'start'})` al **siguiente bloque incompleto** (`blocks.find(b => !isBlockComplete(b, next))`). Es el unico "avance" automatico.

### Marcar serie (`handleLogged`) y estado local de la sesion
- `const [sessionLogs, setSessionLogs] = useState(logs)` — el estado vivo de la sesion arranca de los `logs` de hoy del servidor.
- `handleLogged(payload)` (lo invoca `LogSetForm` al registrar/editar) hace **upsert optimista en memoria**: filtra el log previo de ese `(block_id, set_number)` y empuja el nuevo (`weight_kg`, `reps_done`, `rpe`, `rir`). Tambien dispara el auto-scroll si el bloque acaba de completarse. El guardado real en DB lo hace `LogSetForm` (server action — ver doc del backend de guardado).
- `isSetLogged(blockId, setNumber)` y `isBlockCompleted(block)` (`isBlockComplete`: todas las series `1..sets` tienen log) derivan el estado visual (chip "Completado", checkmark, fade).

### Progreso de la sesion (header)
```ts
const requiredSets = blocks.reduce((acc, b) => acc + b.sets, 0)
const completedSetCount = countUniqueLoggedSets(blocks, sessionLogs)
const completionPct = requiredSets === 0 ? 0 : min(100, round(completedSetCount / requiredSets * 100))
```
- `requiredSets` = suma de `sets` de todos los bloques (incluye warmup/cooldown/areas — el contador suma TODO).
- `countUniqueLoggedSets`: cuenta `(block_id, set_number)` **unicos** dentro del rango planificado de cada bloque (1..sets), descartando duplicados y sets fuera de rango. Barra de progreso animada + `"X/Y series · Z%"`.

### Ocultar el nav durante el entreno
- La navegacion (`ClientNav`) se renderiza en el layout padre `c/[coach_slug]/layout.tsx`. `ClientNav` detecta `isWorkout = pathname.includes('/workout/')` y aplica `isWorkout && "hidden md:flex"` al `<aside>` => **oculta el bottom-nav mobile** durante la ejecucion (en desktop el sidebar permanece). Comentario en codigo: *"Solo ejecucion de plan (/workout/[planId]); no ocultar rutas tipo /workout-history"*.
- El `<main>` del layout ademas usa `has-[.is-workout-page]:pb-0` para anular el padding inferior reservado al nav. (Nota: el JSX de `WorkoutExecutionClient` que leimos no emite explicitamente la clase `.is-workout-page` en su contenedor raiz — el ocultamiento efectivo del nav lo garantiza `ClientNav` por `pathname`.)
- La barra inferior **propia** de la pantalla (fija) reemplaza al nav: contiene el boton "Descanso (90s)" (`ManualTimerButton`) y "Finalizar entrenamiento".

### Header sticky de la sesion
- Boton volver (`ArrowLeft` -> `${base}/dashboard`), titulo del plan, chip "Semana A/B" (si `activeWeekVariant`), subtitulo (`Dia X de Y` para programas `cycle`, sino "Programa semanal"), `InfoTooltip`, boton de ajustes de timer (tuerca -> `WorkoutTimerSettingsPanel`), `ThemeToggle`, y la barra de progreso descrita arriba.

### Estado offline (banner)
- `const [isOffline, setIsOffline]` se actualiza con listeners `online`/`offline` de `window`. Cuando offline, muestra un banner sticky "Sin conexion — los datos se guardaran al reconectar" (con `WifiOff`). Esto es la cara visible de la cola offline (detalle del backend de la cola en su doc).

### Empty state
- Si `!blocks.length` (plan sin ejercicios): pantalla "Rutina sin ejercicios" + link "Volver al Dashboard". (El plan inexistente ya fue redirigido en la page.)

## 1.5 El modelo POLIMORFICO de bloques que se ejecuta

El builder produce bloques **polimorficos** (specs/movida-entrenamiento, M2). La ejecucion resuelve el **tipo efectivo** y renderiza una variante por tipo, manteniendo strength byte-identico al historico (AC3/AC4 — anti-regresion).

### Tipo efectivo del bloque
`effectiveExerciseType(block, exercise)` (en `lib/workout-exercise-type.ts`):
```
block.exercise_type_override ?? exercise.exercise_type ?? 'strength'
```
- Tipos: `'strength' | 'cardio' | 'mobility' | 'roller'`.
- Un bloque legacy (sin override, ejercicio sin tipo) SIEMPRE resuelve `'strength'`.

### Variantes de render por tipo
| Aspecto | strength | cardio | mobility | roller |
|---|---|---|---|---|
| Grid de objetivos | Inline en el cliente: Series x reps, Peso, Descanso, Tempo, RIR | `TypedTargetGrid`: Intervalos (`repeats× work / rec`), Duracion, Distancia, Pace objetivo, Zona FC (chip con bpm si cardio.enabled), Rondas | `TypedTargetGrid`: Hold (`duration_sec`s), Series, Respiraciones (si `reps_unit==='breaths'`) | `TypedTargetGrid`: Pasadas (si `reps_unit==='passes'`) o Duracion; ademas Lado / Carga / Descanso comunes |
| Boton de timer del bloque | (ninguno propio; usa "Descanso" global) | `TypedBlockTimerButton`: "Iniciar intervalos" (si `interval_config` cronometrable) o "Cronometro" | "Timer de hold (Ns)" (si `duration_sec>0`) | "Timer (Ns)" (si `duration_sec>0`) |
| Header de la tabla de log | Set / Kg / Reps | `TypedLogHeader`: Set / Min / Metros / FC | Set / Seg de hold | Set / Seg / Pasadas |
| Fila de registro | `StrengthLogSetForm` (peso, reps, RPE, RIR) | `TypedLogSetRow` mode cardio (min->seg, metros, FC prom, RPE) | `TypedLogSetRow` mode mobility (seg de hold, RPE) | `TypedLogSetRow` mode roller (seg, pasadas, RPE) |
| Instrucciones del bloque | (no se muestra `block.instructions`) | muestra `block.instructions` si existe | idem | idem |
| Chips "Sesion anterior" | si (`previousHistory`) | no | no | no |

- El switch de render esta en `WorkoutExecutionClient`: `effType === 'strength' ? <grid+tabla clasica> : <TypedTargetGrid + TypedBlockTimerButton + TypedLogHeader>`. La fila siempre es `LogSetForm` con `mode={effType}`, que internamente bifurca a `StrengthLogSetForm` o `TypedLogSetRow`.
- **Campos polimorficos del bloque** (todos `null` en legacy): `exercise_type_override`, `side_mode` (`bilateral|per_side|alternating`, etiquetas "Por lado"/"Alternado"), `reps_value`/`reps_unit` (`reps|passes|breaths`), `load_value`/`load_unit` (`kg|lb|sec`), `distance_value`/`distance_unit` (`m|km`), `duration_sec`, `target_pace_sec_per_km`, `hr_zone` (1–5), `instructions`, `interval_config` (jsonb).
- **`interval_config`** (shape validado por `IntervalConfigSchema` en `packages/schemas/workout.ts`): `{warmup_sec?, cooldown_sec?, repeats, work:{duration_sec?|distance_m?, target?}, recovery?:{duration_sec?, distance_m?, mode?}}`. El timer de intervalos (`buildIntervalPhases` en `lib/workout-interval.ts`) genera fases warmup -> (work->recovery)×(repeats×sets) -> cooldown; solo pasos CON `duration_sec` son cronometrables (`isTimeableInterval`); un work por distancia muestra la distancia y deshabilita el timer ("usa el cronometro").

### Timers (un solo timer activo a la vez)
`WorkoutTimerProvider` expone `startRest` / `startHold` / `startInterval` / `startStopwatch`. Renderiza `RestTimer` / `HoldTimer` / `IntervalTimer` / `Stopwatch`. `replaceWith` garantiza UN solo timer; si reemplaza otro tipo, toast "Temporizador anterior reemplazado". `parseRestTime` acepta `"01:30"`, `"90s"`, `"1 min"`, `"90"`.

## 1.6 Guards de acceso (el alumno es dueno del plan)

La proteccion es **defensa en capas**:

1. **Proxy/middleware** (fuera de estos archivos): valida la sesion del alumno y setea `x-coach-id`, `x-client-base-path`, branding, etc. El layout `c/[coach_slug]/layout.tsx` ademas `redirect('/not-found')` si falta `x-coach-id`.
2. **Auth en la query:** `getClaims()` => sin `sub` => `{user:null}` => la page hace `redirect(\`${base}/login\`)`.
3. **Propiedad del plan (la guard central):** la query del plan filtra `.eq('client_id', user.id)`. Si el `planId` no es del alumno, `rawPlan` es `null` => `{plan:null}` => `redirect(\`${base}/dashboard\`)`. **No se filtra solo por RLS** — el `client_id` explicito hace de doble cerrojo (y RLS de `workout_plans` lo refuerza).
4. **Programa activo:** si el plan tiene `program_id`, debe haber un `workout_programs` con `id=program_id`, `client_id=user.id`, `is_active=true`; si no, se trata como inexistente => redirect dashboard. Esto evita que el alumno ejecute un plan de un programa que ya fue desactivado/reemplazado.
5. **Areas / cardio con service-role:** aunque se usa service-role (bypass RLS), el acceso se acota manualmente por tenant (`is_system` + `coach_id` del plan + `team_id` del alumno) y por ids ya presentes en el plan (data minimization), evitando filtrar areas/zonas de terceros.

## 1.7 Resumen del arbol de archivos y dependencias (mapa para el rediseno)

- `page.tsx` -> `getWorkoutExecutionData` (`_data/workout-execution.queries.ts`) -> Supabase + `getClientZonesForContext` (`services/cardio-zones.service.ts`) + `createServiceRoleClient`.
- `page.tsx` -> `getClientBasePath` (`lib/client/base-path.ts`).
- `WorkoutExecutionClient.tsx` (cliente) usa:
  - `LogSetForm` (registro de serie) -> `logSetAction` (`_actions/workout-log.actions.ts`, server action) + `enqueueWorkoutLog` (`lib/workout-offline-queue.ts`) + `useWorkoutTimer`.
  - `WorkoutTimerProvider` / `useWorkoutTimer` -> `RestTimer`/`HoldTimer`/`IntervalTimer`/`Stopwatch` + `buildIntervalPhases`/`isTimeableInterval` (`lib/workout-interval.ts`).
  - `WorkoutTimerSettingsPanel`, `WorkoutSummaryOverlay` (resumen final + deteccion de PR via `epleyOneRM` + confetti).
  - Helpers puros: `executionAreaGroupsFor`/`classicSlugForAreaId` (`lib/workout-areas.ts`), `groupContiguousSupersetRuns` (`lib/workout-block-grouping.ts`), `effectiveExerciseType`/`compactDistance`/`compactDuration` (`lib/workout-exercise-type.ts`), `formatPace` (`domain/cardio/pace`), `extractYoutubeVideoId` (`lib/youtube`), `formatRelativeDate` (`lib/date-utils`).
- Cola offline consumida por `OfflineWorkoutQueueSync` (montado en el layout `c/[coach_slug]/layout.tsx`) -> reenvia cada item via `logSetAction` al reconectar.
- `c/[coach_slug]/layout.tsx` -> `ClientNav` (oculta nav mobile durante `/workout/`) + `OfflineWorkoutQueueSync` + branding/tema.

### Tablas tocadas en la ejecucion
- Lectura: `workout_plans`, `workout_blocks`, `exercises`, `workout_programs`, `workout_logs`, `clients`, `workout_section_templates`, `teams`/`coaches` (flag de modulo cardio via service-role).
- Escritura (en el guardado de serie, detallado en otro doc): `workout_logs` (insert/update/delete de duplicados), via `logSetAction`.

### Adherencia (donde se consume lo registrado)
La pantalla en si **no calcula adherencia**; solo persiste `workout_logs`. Tras guardar, `logSetAction` hace `revalidatePath('/c','layout')` y `revalidatePath('/coach/clients/${user.id})` para refrescar dashboards/compliance del alumno y del coach (que computan adherencia desde `workout_logs` aguas abajo — fuera de esta pantalla).
