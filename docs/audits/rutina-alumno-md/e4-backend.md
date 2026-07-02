# 4. Backend: persistencia de series, cola offline y adherencia

> Sección backend-first de la ejecución de rutina del alumno (`/c/[coach_slug]/workout/[planId]`). Cubre QUÉ datos llegan al consumir el plan, CÓMO se guarda cada serie, la COLA OFFLINE completa, y CÓMO se calcula la adherencia 30d. Las pantallas son idénticas para alumno standalone y team (mismo motor server, mismas RLS por `client_id`).

---

## 4.0 Mapa de archivos backend

| Pieza | Archivo | Rol |
|---|---|---|
| Server action de log | `apps/web/src/app/c/[coach_slug]/workout/[planId]/_actions/workout-log.actions.ts` | `logSetAction` — único punto de escritura de series |
| Query de ejecución | `apps/web/src/app/c/[coach_slug]/workout/[planId]/_data/workout-execution.queries.ts` | `getWorkoutExecutionData` — trae plan + bloques + logs de hoy + historial + maxes + cardio + áreas |
| Cola offline (storage) | `apps/web/src/lib/workout-offline-queue.ts` | `readWorkoutOfflineQueue` / `enqueueWorkoutLog` / `writeWorkoutOfflineQueue` (localStorage) |
| Drenaje offline | `apps/web/src/app/c/[coach_slug]/_components/OfflineWorkoutQueueSync.tsx` | `OfflineWorkoutQueueSync` — flush al reconectar (montado en layout `/c`) |
| Schema de validación | `packages/schemas/workout.ts` | `WorkoutLogSetSchema` (Zod v4) |
| Adherencia 30d | `apps/web/src/lib/workout/workoutAdherence30d.ts` | `computeWorkoutScore30d` (función pura) |
| Caller adherencia | `apps/web/src/app/c/[coach_slug]/dashboard/_data/heroComplianceBundle.ts` | `getHeroComplianceBundle` — alimenta dashboard/ficha/cards |
| Utilidades fecha TZ | `apps/web/src/lib/date-utils.ts` | `getTodayInSantiago`, `getSantiagoUtcBoundsForDay`, `getSantiagoIsoYmdForUtcInstant` |
| Tabla / migraciones | `supabase/migrations/00000000000001_baseline.sql`, `20260611090003_workout_logs_polymorphic_mirror.sql`, `20260612050000_workout_logs_perf_indexes.sql` | DDL + RLS de `workout_logs` |

**Nota de arquitectura:** este flujo NO pasa por la capa `services/` ni `infrastructure/db/*.repository.ts`. `logSetAction` y `getWorkoutExecutionData` hablan PostgREST directo (`supabase.from('workout_logs')`) desde `_actions`/`_data`, apoyándose en RLS por `client_id` como contención. Es una excepción al data-flow canónico del proyecto (justificada por ser la tabla más caliente: 1 insert por serie logueada).

---

## 4.1 Modelo de la tabla `workout_logs` (campos por tipo de serie e invariantes)

### Columnas (baseline + espejo polimórfico M3)

Definición base (`00000000000001_baseline.sql`):

```
workout_logs (
  id              uuid PK default uuid_generate_v4()
  block_id        uuid NOT NULL          -- FK lógica a workout_blocks(id)
  client_id       uuid NOT NULL          -- = auth.uid() del alumno (RLS)
  set_number      integer NOT NULL       -- 1..N (serie dentro del bloque)
  weight_kg       numeric(6,2)           -- strength
  reps_done       integer                -- strength + roller (pasadas)
  rpe             integer  CHECK (rpe >= 1 AND rpe <= 10)
  rir             integer  CHECK (rir >= 0 AND rir <= 10)
  logged_at       timestamptz NOT NULL default now()
  -- snapshot "at log" (para preservar prescripción aunque el coach edite el plan luego):
  plan_name_at_log       text
  target_reps_at_log     text
  target_weight_at_log   numeric
  exercise_name_at_log   text
)
```

Espejo polimórfico nullable agregado por `20260611090003_workout_logs_polymorphic_mirror.sql` (fase EXPAND, `ADD COLUMN IF NOT EXISTS` — metadata-only, sin rewrite):

```
  actual_duration_sec      integer    -- cardio / roller
  actual_distance_m        numeric    -- cardio
  actual_pace_sec_per_km   integer    -- cardio
  actual_hold_sec          integer    -- mobility (hold en seg)
  actual_avg_hr            smallint   -- cardio (FC promedio, ingreso manual; sin reloj/banda v1)
  metadata                 jsonb      -- libre (ej. lado L/R, reservado; logging por lado fuera de v1)
```

### Mapa de campos por tipo efectivo de serie

| Tipo (`LogSetMode`) | Campos que escribe el alumno | Columnas pobladas |
|---|---|---|
| `strength` | peso, reps, RPE, RIR | `weight_kg`, `reps_done`, `rpe`, `rir` |
| `cardio` | minutos→seg, metros, FC prom, RPE | `actual_duration_sec`, `actual_distance_m`, `actual_avg_hr`, `rpe` |
| `mobility` | segundos de hold, RPE | `actual_hold_sec`, `rpe` |
| `roller` | segundos, pasadas, RPE | `actual_duration_sec`, `reps_done` (pasadas), `rpe` |

> **Decisión de diseño:** NO se reusa `reps_done` para semántica nueva (roller sí lo usa como "pasadas", que es la misma semántica de conteo). El espejo `actual_*` es nullable; un log strength de hoy NO envía las keys cardio/mobility (AC4, retrocompatibilidad total con planes legacy).

### Invariantes (clave)

- **Sin CHECKs nuevos en el espejo polimórfico (decisión consciente):** la tabla es la más caliente de la app; la validación de rango vive en Zod (`WorkoutLogSetSchema`), igual que `weight_kg`/`rpe`/`rir`. Solo subsisten los 2 CHECKs de baseline (`rpe 1..10`, `rir 0..10`). Consecuencia: un valor fuera de rango que evada la capa app (p.ej. escritura directa a PostgREST con `actual_avg_hr` negativo) NO sería rechazado por la DB salvo por los 2 CHECKs viejos.
- **No hay UNIQUE constraint sobre `(block_id, client_id, set_number, día)`.** La idempotencia "una fila por serie por día" se garantiza **únicamente en código** (`logSetAction`, ver §4.2). Sin esa lógica, dos submits crearían dos filas. Esto es la raíz del manejo manual de duplicados.
- **Identidad:** `client_id` se setea SIEMPRE desde `auth.uid()` (server action) o desde el JWT `sub` (query), NUNCA del body. RLS lo refuerza con `WITH CHECK (client_id = auth.uid())`.
- **`logged_at` = `now()` por default** (timestamp de inserción real). El "día" del log se deriva mapeando `logged_at` (UTC) a calendario Santiago, no por prefijo de string.
- **Snapshot `*_at_log`:** existe en el schema pero `logSetAction` NO lo escribe en este flujo (queda NULL en inserts nuevos del ejecutor). Es deuda preexistente; los campos viven para preservar contexto histórico cuando el coach edita el plan.

### RLS de `workout_logs`

Políticas relevantes (consolidadas a lo largo de las migraciones):

- `client_manage_logs` — `USING (client_id = auth.uid()) WITH CHECK (client_id = auth.uid())` (FOR ALL). Esta es la que habilita al alumno a INSERT/UPDATE/DELETE sus propias filas (incluido el DELETE de duplicados de §4.2).
- `workout_logs_client` — `TO authenticated USING (client_id = (SELECT auth.uid())) WITH CHECK (...)` (versión optimizada con subselect anti-initplan).
- `coaches_read_logs` / `workout_logs_coach` / `Coach can view their clients' workout logs` — SELECT del coach sobre logs de sus clientes (no escritura).
- `team_workout_logs_member_all` — `USING (client_id IN (SELECT current_user_pool_client_ids())) WITH CHECK (...)` (FOR ALL) — habilita al pool de coaches de un team a ver/operar logs de los alumnos del pool. (La policy `team_workout_logs_member_all` original con EXISTS fue dropeada por incidente de RLS en tabla caliente — `20260609150000` — y reescrita con función set-returning en `20260609160000`.)

### Índices

- `idx_wl_client_logged_notnull` ON `(client_id, logged_at DESC) INCLUDE (weight_kg, reps_done, block_id) WHERE weight_kg IS NOT NULL` — covering parcial para PRs/volumen (Index-Only Scan, salta cardio/movilidad sin peso). `20260612050000`.
- Índices FK-covering adicionales en `20260617031230` y tuning de autovacuum para tabla caliente multitenant en `20260617170346`.

---

## 4.2 `workout-log.actions.ts` — server actions

Hay **una sola server action** en este archivo: `logSetAction`. NO existe acción separada de "actualizar", "borrar" ni "finalizar sesión": el upsert idempotente cubre crear+actualizar, el borrado solo ocurre como limpieza de duplicados, y NO hay concepto persistido de "sesión finalizada" (ver §4.6).

### `logSetAction(_prev: LogState, formData: FormData): Promise<LogState>`

Firma de `useActionState` (recibe estado previo + FormData; retorna `{ error?, success? }`).

**1. Lectura y normalización del FormData**

Helper `getOptional(key)`: lee la key; `null` o `''` → `undefined`; cualquier otro valor → string con coma decimal normalizada a punto (`.replace(',', '.')`, para locales es/pt donde "70,5" llega como coma).

Construye `raw` con:
- `block_id`, `set_number` (obligatorios)
- `weight_kg`, `reps_done`, `rpe`, `rir` (strength)
- Espejo polimórfico (solo presentes si la variante cardio/movilidad/roller del `LogSetForm` los envía): `actual_duration_sec`, `actual_distance_m`, `actual_pace_sec_per_km`, `actual_hold_sec`, `actual_avg_hr`

> Un log strength de hoy NO incluye las keys `actual_*` → no se setean → quedan `undefined` → no regresión (AC4).

**2. Validación Zod — `WorkoutLogSetSchema.safeParse(raw)`**

Si falla: `return { error: parsed.error.issues[0].message }` (primer issue). Reglas (de `packages/schemas/workout.ts`):

```
block_id                z.string().uuid()                          (obligatorio)
set_number              z.coerce.number().int().min(1)             (obligatorio)
weight_kg               z.coerce.number().min(0).optional()
reps_done               z.coerce.number().int().min(0).optional()
rpe                     z.coerce.number().min(1).max(10).optional()
rir                     z.coerce.number().int().min(0).max(10).optional()
actual_duration_sec     z.coerce.number().int().min(0).max(86400).optional()
actual_distance_m       z.coerce.number().min(0).max(1000000).optional()
actual_pace_sec_per_km  z.coerce.number().int().positive().max(3600).optional()
actual_hold_sec         z.coerce.number().int().min(0).max(86400).optional()
actual_avg_hr           z.coerce.number().int().min(25).max(250).optional()
```

Nota: `z.coerce` convierte strings a number → tras la normalización de coma decimal, "70.5" coacciona bien. `block_id` usa `.uuid()` estricto (a diferencia de los bloques que usan `.guid()` por los UUIDs seed no-RFC) — aquí es seguro porque `block_id` siempre es un id de fila real generado por `uuid_generate_v4()`.

**3. Identidad — vía `auth.getUser()`**

```ts
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return { error: 'No autenticado.' }
```

> A diferencia de la query de lectura (que usa `getClaims()` local), la **escritura usa `getUser()`** (round-trip a GoTrue). `client_id` se toma de `user.id`, NUNCA del body. RLS (`client_manage_logs`) re-acota cualquier operación.

**4. Ventana del día (Santiago) para el upsert idempotente**

```ts
const { iso: todayStr } = getTodayInSantiago()
const { startIso: startTs, endIso: endTs } = getSantiagoUtcBoundsForDay(todayStr)
```

`getSantiagoUtcBoundsForDay` deriva los límites UTC `[medianoche, medianoche+24h)` del día calendario de Santiago, manejando DST correctamente vía `Intl.DateTimeFormat` (NO `new Date(toLocaleString())`, que dependería de la TZ del host). Esto evita que logs de 20:00–24:00 hora local "desaparezcan" del día.

**5. Búsqueda de fila existente (upsert manual)**

```ts
const { data: existingRows } = await supabase
  .from('workout_logs')
  .select('id')
  .eq('block_id', parsed.data.block_id)
  .eq('client_id', user.id)
  .eq('set_number', parsed.data.set_number)
  .gte('logged_at', startTs)
  .lt('logged_at', endTs)
  .order('logged_at', { ascending: false })
```

Clave compuesta efectiva: **(block_id, client_id, set_number, día Santiago)**.

**6. Payload de valores** (todo `?? null` para que un campo ausente limpie la columna):

```ts
const payloadValues = {
  weight_kg, reps_done, rpe, rir,
  actual_duration_sec, actual_distance_m, actual_pace_sec_per_km,
  actual_hold_sec, actual_avg_hr,   // todos ?? null
}
```

**7. Rama UPDATE vs INSERT (idempotencia)**

- **Si `existingRows.length > 0`** → UPDATE de la fila más reciente (`existingRows[0].id`, por `order logged_at DESC`) con `payloadValues`. Esto convierte un "re-submit de la misma serie hoy" en una actualización in-place (NO crea fila nueva). Es el camino de los sliders de RPE/RIR (que re-submiten el form con peso/reps + el nuevo RPE/RIR).
  - **Limpieza de duplicados:** si `existingRows.length > 1` (carrera o flush offline duplicado), borra TODAS las filas extra: `delete().in('id', duplicateIds)` (duplicateIds = `slice(1)`). Esto auto-sana duplicados a "una fila por serie por día" en cada escritura. RLS (`client_manage_logs`) acota el DELETE a filas propias.
- **Si no hay fila** → INSERT con `{ block_id, client_id: user.id, set_number, ...payloadValues }`.

> **Idempotencia real:** el flush de la cola offline puede reproducir el mismo log N veces; cada reproducción cae en la rama UPDATE (no duplica). El primero inserta; los siguientes actualizan la misma fila. La limpieza de `length > 1` cubre el caso donde dos inserts alcanzaron a colarse antes del primer UPDATE.

**8. Manejo de error + revalidación**

```ts
if (dbError) return { error: dbError.message }
revalidatePath('/c', 'layout')
revalidatePath(`/coach/clients/${user.id}`)
return { success: true }
```

- `revalidatePath('/c', 'layout')` invalida TODO el subárbol del alumno (dashboard, ejecución, historial) → el siguiente render trae logs frescos.
- `revalidatePath('/coach/clients/${user.id}')` invalida la ficha del alumno en el panel del coach (su adherencia/última actividad). Nota: usa `user.id` (id del alumno) como segmento de la ruta del coach.

### Resumen de garantías de `logSetAction`

| Garantía | Cómo |
|---|---|
| Identidad no falsificable | `client_id` de `auth.uid()`, nunca del body; RLS `WITH CHECK` |
| Una fila por (bloque, serie, día) | Búsqueda previa + UPDATE-o-INSERT + DELETE de extras |
| Idempotente ante reintentos/flush | Re-submit cae en UPDATE de la fila existente |
| Validación dual | Zod en cliente (form) + Zod en servidor (`safeParse`) |
| Locale decimal | `replace(',', '.')` antes de coaccionar |
| TZ-correcta | Ventana día derivada con DST real (Santiago) |

---

## 4.3 Cola offline — `workout-offline-queue.ts` + `OfflineWorkoutQueueSync.tsx`

Pieza crítica: registrar mientras entrenas suele ser sin señal (gimnasio, subsuelo). El sistema es **optimista + cola persistente + drenaje al reconectar**.

### Storage — `lib/workout-offline-queue.ts`

- **Backend de persistencia:** `localStorage`, key fija `eva:workout-offline-queue` (constante `QUEUE_KEY`). NO IndexedDB. Estructura: array JSON de `WorkoutOfflineLog`.
- **Shape `WorkoutOfflineLog`:**

```ts
{
  blockId: string
  setNumber: number
  weightKg:  number | null
  repsDone:  number | null
  rpe:       number | null
  rir:       number | null
  planId:    string         // contexto, NO se reenvía al action
  coachSlug: string         // contexto, NO se reenvía al action
  timestamp: number         // Date.now() al encolar (orden + auditoría)
  // Espejo polimórfico (opcionales — colas legacy ya guardadas siguen parseando):
  actualDurationSec?: number | null
  actualDistanceM?:   number | null
  actualHoldSec?:     number | null
  actualAvgHr?:       number | null
}
```

- **API:**
  - `readWorkoutOfflineQueue()` → `JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]')` dentro de try/catch → `[]` si corrupto (fail-safe, nunca tira).
  - `enqueueWorkoutLog(log)` → lee, `push`, reescribe. **Append-only, sin dedup en el encolado** (puede haber 2 items para la misma serie si el alumno tocó ✓ dos veces offline; el dedup ocurre al drenar, vía el upsert de §4.2).
  - `writeWorkoutOfflineQueue(q)` → sobrescribe la key completa con `q` (usado para dejar solo los items que fallaron).

> **Campos ausentes en el shape:** NO se guarda `actual_pace_sec_per_km` ni `metadata`. El flush por tanto no puede reenviar pace offline (limitación menor: el cardio offline registra duración/distancia/FC pero no pace; en online sí se envía).

### ¿Qué se encola y cuándo? (productor — `LogSetForm.tsx`)

El gate offline está en `handleSubmit` de ambas variantes (`StrengthLogSetForm` y `TypedLogSetRow`):

```ts
if (typeof navigator !== 'undefined' && !navigator.onLine) {
  enqueueWorkoutLog({ ...campos del set... , planId, coachSlug, timestamp: Date.now() })
  addOptimisticLogged(true)                       // marca la serie como guardada (useOptimistic)
  toast.info('Sin conexión — el log se guardará al reconectar')
  return                                           // NO llama al server
}
```

- **Condición:** `!navigator.onLine` (heurística del browser).
- **Efecto:** encola, marca optimista (la serie se ve "guardada" verde), muestra toast, y **corta** (no invoca `logSetAction`, no inicia timer de descanso en la rama offline strength — el timer sí se inicia en la rama online).
- **Variantes:** strength encola peso/reps/rpe/rir; cardio/movilidad/roller encolan `actual_*`/`repsDone`/`rpe` (con `weightKg: null`, `rir: null`).
- **Solo cubre el submit principal.** Los re-submits de los sliders RPE/RIR (`submitMetricsUpdate` / `submitRpeUpdate`) NO tienen guard offline → si están offline, esos van directo a `formAction` y fallan silenciosamente (no se encolan). Limitación conocida.

### Drenaje — `OfflineWorkoutQueueSync.tsx` (consumidor)

Componente `'use client'` que **retorna `null`** (sin UI). Montado en el **layout `/c`** (`apps/web/src/app/c/[coach_slug]/layout.tsx`, junto a `OfflineNutritionQueueSync`) → vive en todo el subárbol del alumno, no solo en la pantalla de ejecución.

Mecánica (`useEffect` con dep `[router]`):

1. **Disparadores del flush:**
   - Al montar: `void flushQueue()` (intenta drenar lo pendiente al entrar a cualquier página `/c`).
   - `window.addEventListener('online', flushQueue)` → drena al recuperar conexión.
   - Cleanup: remueve el listener al desmontar.

2. **Guard de reentrada:** `flushing.current` (useRef boolean). Si ya hay un flush en curso, `return` inmediato → **evita flushes concurrentes** (p.ej. mount + evento `online` casi simultáneos).

3. **Algoritmo de drenaje (`flushQueue`):**

```ts
const q = readWorkoutOfflineQueue()
if (q.length === 0) return
flushing.current = true
const remaining = []
let flushed = 0
for (const item of q) {                  // ORDEN: secuencial, en orden de inserción (FIFO)
  try {
    const fd = new FormData()
    fd.set('block_id', item.blockId)
    fd.set('set_number', String(item.setNumber))
    if (item.weightKg  != null) fd.set('weight_kg', String(item.weightKg))
    if (item.repsDone  != null) fd.set('reps_done', String(item.repsDone))
    if (item.rpe       != null) fd.set('rpe', String(item.rpe))
    if (item.rir       != null) fd.set('rir', String(item.rir))
    if (item.actualDurationSec != null) fd.set('actual_duration_sec', String(item.actualDurationSec))
    if (item.actualDistanceM   != null) fd.set('actual_distance_m', String(item.actualDistanceM))
    if (item.actualHoldSec     != null) fd.set('actual_hold_sec', String(item.actualHoldSec))
    if (item.actualAvgHr       != null) fd.set('actual_avg_hr', String(item.actualAvgHr))
    const res = await logSetAction({}, fd)         // reusa la MISMA server action
    if (res.success) flushed++
    else remaining.push(item)                       // error de validación/DB → reintenta luego
  } catch {
    remaining.push(item)                            // excepción de red → reintenta luego
  }
}
writeWorkoutOfflineQueue(remaining)                  // deja solo los que fallaron
if (flushed > 0) {
  toast.success(`${flushed} set(s) sincronizado(s)`)
  router.refresh()                                   // re-fetch del RSC → UI con datos reales
}
finally { flushing.current = false }
```

### Propiedades de la cola offline

| Propiedad | Comportamiento |
|---|---|
| **Storage** | `localStorage` (no IndexedDB), key `eva:workout-offline-queue`, array JSON |
| **Orden de reproducción** | FIFO estricto, en orden de inserción (`for...of` sobre el array; `await` secuencial, NO `Promise.all`) |
| **Idempotencia (no duplicar series)** | Garantizada por `logSetAction`: cada item reproducido cae en UPDATE de la fila del día (no inserta otra). Items duplicados en la cola para la misma serie → la 2ª reproducción actualiza la misma fila |
| **Manejo de error** | Por-item try/catch. Éxito → cuenta `flushed` y NO se reencola. Fallo (validación/DB/excepción) → se conserva en `remaining` para el próximo intento. No hay límite de reintentos ni backoff |
| **Reentrada** | `flushing` ref previene flushes concurrentes |
| **Conflictos** | No hay resolución de conflictos explícita: "last write wins" vía el UPDATE (el último item reproducido de una serie sobrescribe). El timestamp se guarda pero NO se usa para ordenar por recencia ni como `logged_at` (el server usa `now()` al reproducir) |
| **Feedback** | Toast "N sets sincronizados" + `router.refresh()` solo si `flushed > 0` |
| **Limitación TZ** | El log se reproduce con `logged_at = now()` (momento de reconexión), NO con el `timestamp` original de cuando se entrenó offline. Si reconecta cruzado el límite de medianoche Santiago, el log cae en el día equivocado (deuda conocida) |
| **Limitación campos** | No se persiste `actual_pace_sec_per_km` ni `metadata`; los sliders RPE/RIR offline no se encolan |

---

## 4.4 `workout-execution.queries.ts` — qué datos llegan al consumir el plan

`getWorkoutExecutionData = cache(async (planId) => ...)` (`React.cache` para dedup por request). Es la query RSC que alimenta la pantalla de ejecución. Devuelve un objeto grande con plan, programa, logs de hoy, historial previo, maxes, variante de semana, áreas y contexto cardio.

### Identidad (lectura) — `getClaims()` local

```ts
const { data: __cl } = await supabase.auth.getClaims()
const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
if (!user) return { user: null, plan: null }
```

> Verificación **local del JWT (ES256)** sin round-trip a `/user` (el proxy ya validó/refrescó la sesión). Contrasta con `logSetAction` que usa `getUser()`. `user.id = claims.sub`.

### 1. Plan + bloques (scoping doble: `id` + `client_id`)

```ts
.from('workout_plans')
.select(`id, title, assigned_date, day_of_week, week_variant, program_id, coach_id,
  workout_blocks ( ...prescripción clásica + polimórfica M2...,
    exercises ( id, name, muscle_group, video_url, video_start_time, video_end_time, gif_url, instructions, exercise_type ) )`)
.eq('id', planId)
.eq('client_id', user.id)        // SCOPING: el plan debe ser del alumno autenticado
.maybeSingle()
```

`if (!rawPlan) return { user, plan: null }` → si el plan no es del alumno (o no existe), no muestra nada. RLS además lo refuerza, pero el `.eq('client_id', user.id)` es contención explícita en la query (defensa en profundidad).

Campos polimórficos de `workout_blocks` que llegan (prescripción M2, null en planes legacy): `exercise_type_override`, `side_mode`, `reps_value`, `reps_unit`, `load_value`, `load_unit`, `distance_value`, `distance_unit`, `duration_sec`, `target_pace_sec_per_km`, `hr_zone`, `instructions`, `interval_config` (jsonb). Más los clásicos: `sets`, `reps`, `target_weight_kg`, `tempo`, `rir`, `rest_time`, `notes`, `section`, `section_template_id`, `superset_group`, `progression_*`, `is_override`.

### 2. Guard de programa activo

Si `plan.program_id` existe, verifica que el programa esté **activo** para el alumno:

```ts
.from('workout_programs').select('id')
  .eq('client_id', user.id).eq('id', plan.program_id).eq('is_active', true).maybeSingle()
if (!activeProgramForUser) return { user, plan: null }
```

→ un plan de un programa archivado/inactivo NO se ejecuta. Luego trae los metadatos del programa (`name, program_phases, program_structure_type, cycle_length, ab_mode, start_date, weeks_to_repeat`) y calcula `activeWeekVariant` con `resolveActiveWeekVariantForDisplay(program)` si está en `ab_mode`.

### 3. Logs de HOY (para precargar series ya registradas)

```ts
const blockIds = plan.workout_blocks.map(b => b.id)
// ventana día Santiago
const { startIso: todayStartUtc, endIso: todayEndUtc } = getSantiagoUtcBoundsForDay(todayStr)
.from('workout_logs')
  .select('block_id, set_number, weight_kg, reps_done, rpe, rir, actual_duration_sec, actual_distance_m, actual_hold_sec, actual_avg_hr')
  .in('block_id', blockIds)
  .gte('logged_at', todayStartUtc).lt('logged_at', todayEndUtc)
```

> Estos `logs` son los que pueblan `existingLog` en cada `LogSetForm` (la serie aparece "ya guardada" con sus valores). Scoping por `block_id` (los bloques del plan) + ventana del día. Nota: NO filtra por `client_id` aquí (lo cubre RLS y el hecho de que los `block_id` son del plan del propio alumno). No trae `actual_pace_sec_per_km`.

### 4. Historial previo por ejercicio ("sesión anterior")

```ts
const exerciseIds = plan.workout_blocks.map(b => exercise.id).filter(Boolean)
.from('workout_logs')
  .select(`weight_kg, reps_done, logged_at, set_number, workout_blocks!inner(exercise_id)`)
  .eq('client_id', user.id)
  .in('workout_blocks.exercise_id', exerciseIds)   // mismos ejercicios, otros bloques
  .not('block_id', 'in', `(${blockIds.join(',')})`) // EXCLUYE los bloques de hoy
  .order('logged_at', { ascending: false }).limit(200)
```

Construye `previousHistory: Record<exerciseId, {weight_kg, reps_done, date}[]>`. Lógica de agrupado: solo agrega filas de la fecha más reciente vista por ejercicio (`existingDates.length === 0 || existingDates.includes(logDate)`) → muestra la "última vez" que hizo ese ejercicio. Scoping por `client_id` + ejercicios del plan + exclusión de hoy. Cap de 200 filas.

### 5. Maxes históricos por ejercicio (PRs de referencia)

```ts
.from('workout_logs')
  .select('block_id, weight_kg, workout_blocks!inner(exercise_id)')
  .eq('client_id', user.id).not('weight_kg', 'is', null)
  .in('workout_blocks.exercise_id', exerciseIds)   // acotado a ejercicios del plan
  .limit(5000)                                       // cap defensivo
```

Construye `exerciseMaxes: Record<exerciseId, number>` (peso máximo all-time), excluyendo los bloques de hoy (`if (blockIdsSet.has(log.block_id)) return`). Comentario en código: antes esta query no tenía `.in()` ni `.limit()` y traía TODO el historial de pesos (O(n) sin techo); ahora acotado a los ejercicios del plan + cap 5000.

### 6. Áreas custom (SERVICE ROLE, data minimization)

Las áreas (`workout_section_templates`) que el plan referencia vía `section_template_id` NO son legibles por el alumno (RLS `wst_select` no deja ver áreas custom del coach/team). Se resuelven con **service role puro** (`createServiceRoleClient()`, sin cookies — NO `createRawAdminClient` que heredaría la sesión del alumno = bypass falso). Doble acotamiento:
- Solo ids ya presentes en el plan (filtrando los slugs clásicos vía `classicSlugForAreaId`).
- Solo áreas del tenant del plan: `is_system.eq.true` OR `coach_id = plan.coach_id` OR `team_id = client.team_id` (se lee `clients.team_id` del propio alumno). Soft-deleted fuera (`.is('deleted_at', null)`).

→ un `section_template_id` cross-context copiado por assign/duplicate NO se resuelve (cae al bucket legacy).

### 7. Contexto cardio (chips de zona FC)

Solo si el plan tiene campos cardio (`planHasCardioFields` = algún bloque con `hr_zone != null` o `duration_sec > 0` o `interval_config != null`). El flag `enabled_modules` del team/coach NO es legible por el alumno → se lee con service role vía `getClientZonesForContext(supabase, user.id, createServiceRoleClient())`. Retorna `cardio: { enabled, zones }`. Try/catch → fallback `{ enabled: false, zones: null }`.

### Retorno completo

```ts
return { user, plan, program, logs, previousHistory, exerciseMaxes, activeWeekVariant, areas, cardio }
```

---

## 4.5 Adherencia 30d — `workoutAdherence30d.ts` (`computeWorkoutScore30d`)

Función **pura** (sin Supabase, testeable) que alimenta el `workoutScore` del dashboard, la ficha del alumno y las cards de compliance.

### Firma

```ts
computeWorkoutScore30d(input: {
  todaySantiagoIso: string
  activePlans: AdherencePlanRow[]      // { id, assigned_date, program_id, day_of_week, week_variant? }
  program: AdherenceProgramRow | null  // { id, ab_mode?, start_date?, weeks_to_repeat? }
  logs: AdherenceLogRow[]              // { logged_at, workout_blocks: { plan_id } }
}): { plannedDays: number; completedDays: number; score: number }
```

### Algoritmo (ventana rodante de 30 días calendario)

- **Ancla:** `anchor = parseISO(todaySantiagoIso + 'T12:00:00.000Z')` (mediodía para evitar bordes de DST).
- **Itera `i = 0..29`** (30 días hacia atrás): `instant = subDays(anchor, i)`; `iso = getSantiagoIsoYmdForUtcInstant(instant)`; `dow = getNutritionDayOfWeekFromIsoYmdInSantiago(iso)` (1=Lun..7=Dom).
- **Plan del día:**
  - `assignedPlan` = plan suelto cuyo `assigned_date === iso`.
  - `programPlan` (si hay programa): calcula `weekIdx = programWeekIndex1Based(prog, instant)`, resuelve `activeVariant` con `resolveEffectiveWeekVariant(...)` (variante EFECTIVA — si A/B mal armado cae a la variante con planes, evitando score 0 artificial en semanas "B" de un programa con una sola semana cargada), y busca el plan con `program_id === prog.id && day_of_week === dow && workoutPlanMatchesVariant(p, activeVariant, abMode)`.
  - `dayPlan = assignedPlan ?? programPlan`. Si no hay plan ese día → `continue` (no cuenta como planificado).
- **Conteo:**
  - `plannedDays++` por cada día con plan.
  - `done` = existe algún log cuyo `workout_blocks.plan_id === dayPlan.id` Y `getSantiagoIsoYmdForUtcInstant(l.logged_at) === iso`. Si `done` → `completedDays++`.
- **Score:** `plannedDays > 0 ? min(100, round(completedDays / plannedDays * 100)) : 0`.

### Qué entra / qué devuelve

| Entrada | Significado |
|---|---|
| `activePlans` | planes sueltos + de programa activos del alumno |
| `program` | programa activo (para resolver días planificados por `day_of_week` + variante A/B) |
| `logs` | logs 30d con `workout_blocks.plan_id` (≥1 log por día/plan = día completado) |
| Ventana | 30 días calendario rodantes terminando hoy (Santiago) |

| Salida | Significado |
|---|---|
| `plannedDays` | días en los 30 con un plan asignado/de programa |
| `completedDays` | de esos, cuántos tuvieron ≥1 log de ESE plan ese día |
| `score` | `completedDays / plannedDays * 100` (0 si no hay días planificados), capado a 100 |

> Semántica: la adherencia mide **cumplimiento por día** (¿registró algo de ese plan ese día?), NO por serie. Un día con 1 sola serie logueada cuenta igual que un día completo. Días sin plan no penalizan (no entran en el denominador).

### Caller — `getHeroComplianceBundle` (`heroComplianceBundle.ts`)

`getHeroComplianceBundle = cache(async (userId, coachSlug))` arma en paralelo (`Promise.all`) las entradas:
- `getActiveProgram(userId)` — programa activo + planes anidados + bloques.
- `getClientWorkoutPlans(userId)` — todos los planes del alumno (`id, title, assigned_date, group_name, day_of_week, week_variant, program_id, created_at`).
- `getRecentWorkoutLogs(userId)` — logs últimos 30d: `.from('workout_logs').select('id, logged_at, block_id, set_number, weight_kg, reps_done, workout_blocks!inner(plan_id)').eq('client_id', clientId).gte('logged_at', thirtyDaysAgo).order(logged_at DESC).limit(200)`.

Filtra `activePlans = allPlans.filter(p => !p.program_id || p.program_id === program?.id)` y llama:

```ts
const { score: workoutScore } = computeWorkoutScore30d({
  todaySantiagoIso: today, activePlans, program, logs,
})
```

`workoutScore` se devuelve en `scores.workoutScore` del bundle, junto a `nutritionEngagementScore`, `nutritionComplianceScore`, `checkInScore`. Este mismo bundle calcula el "hero de hoy" (plan de hoy, series target vs logueadas, `isAlreadyLogged`) deduplicando series por `${block_id}:${set_number}` (anti doble-conteo de duplicados que pudieran existir).

---

## 4.6 "Finalizar sesión" — NO existe persistencia explícita

No hay server action de "finalizar entrenamiento" ni escritura a `workout_sessions` desde este flujo (grep de `workout_sessions|finalize|finishSession` en la carpeta `workout` → 0 resultados). La "completitud" de una sesión es **derivada/implícita**:

- En el dashboard (`heroComplianceBundle`): `isAlreadyLogged = totalSetsTarget > 0 && totalSetsLogged >= totalSetsTarget` (cuenta series logueadas únicas vs target del plan de hoy).
- En la adherencia: un día "completado" = ≥1 log de ese plan ese día (no exige completar todas las series).

> Implicación para rediseño: si se quiere un evento explícito de "sesión terminada" (timestamp de fin, duración total, percepción global), HOY no se persiste — habría que agregar tabla/columna. La tabla `workout_sessions` existe (con RLS `workout_sessions_client`/`_coach`) pero NO la escribe el ejecutor de rutina del alumno en este flujo.

---

## 4.7 Riesgos / deudas backend a tener en cuenta en el rediseño

1. **Sin UNIQUE en DB:** la unicidad "una fila por serie/día" depende 100% de la lógica de `logSetAction`. Cualquier nuevo punto de escritura debe replicar el upsert + limpieza de duplicados, o introducir un UNIQUE parcial.
2. **Offline guard solo en submit principal:** los sliders RPE/RIR no se encolan offline → updates de métrica perdidos sin red.
3. **`logged_at = now()` al reproducir:** logs offline reproducidos tras medianoche caen en el día equivocado (afecta logs-de-hoy y adherencia).
4. **Sin backoff ni cap de reintentos** en el flush: un item que siempre falla (p.ej. plan borrado → FK/RLS) queda reintentándose en cada `online`/mount indefinidamente.
5. **`actual_pace_sec_per_km` y `metadata` no viajan por la cola** (el shape `WorkoutOfflineLog` no los incluye).
6. **Snapshot `*_at_log` queda NULL** en inserts del ejecutor (no se preserva prescripción al momento del log).
7. **`getUser()` en escritura vs `getClaims()` en lectura:** asimetría intencional (escritura pide round-trip), pero suma latencia a cada ✓ de serie — el momento de mayor fricción física.
8. **Validación de rango del espejo polimórfico solo en app:** sin CHECKs DB (salvo rpe/rir), una escritura directa a PostgREST evade los rangos de Zod.
