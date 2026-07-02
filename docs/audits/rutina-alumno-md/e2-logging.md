# 2. Registro de series y tipos de bloque

> Corazón de la pantalla de ejecución (`/c/[coach_slug]/workout/[planId]`). Es el momento de mayor fricción física: el alumno registra cada serie mientras entrena. Esta sección documenta a fondo `LogSetForm.tsx` (componente de registro por serie), el server action `logSetAction`, el esquema `WorkoutLogSetSchema`, la persistencia en `workout_logs`, la cola offline y el cálculo de adherencia aguas abajo. Énfasis backend.

---

## 2.0 Anatomía: una fila de registro = un `LogSetForm`

En `WorkoutExecutionClient.tsx` (líneas 714-731), por cada bloque se renderiza un `LogSetForm` **por serie planificada** (`Array.from({ length: block.sets })`). Cada fila recibe:

- `blockId` — `block.id` (FK a `workout_blocks`).
- `setNumber` — índice 1-based de la serie (`i + 1`).
- `restTimeStr` — `block.rest_time` (string libre del builder: `"90"`, `"01:30"`, `"1 min"`).
- `existingLog` — el log ya registrado HOY para esa `(block_id, set_number)`, si existe (`blockLogs.find((entry) => entry.set_number === setNumber)`).
- `autoTimerEnabled` — preferencia local (arranca el descanso solo al registrar).
- `mode` — **tipo efectivo del bloque** (`effType = effectiveExerciseType(block, exercise)`), uno de `'strength' | 'cardio' | 'mobility' | 'roller'`. Esto decide qué inputs muestra la fila.
- `onLogged` — callback `handleLogged` que actualiza `sessionLogs` (estado optimista del cliente, para la barra de progreso y el auto-scroll al siguiente bloque incompleto).

El dispatcher `LogSetForm(props)` (líneas 47-54):
- Si `mode` existe y NO es `'strength'` → renderiza `TypedLogSetRow` (cardio/movilidad/roller).
- En cualquier otro caso → `StrengthLogSetForm` (camino histórico, "sin un solo cambio visual/funcional" — anti-regresión declarada en el código).

El **tipo efectivo** se resuelve en `lib/workout-exercise-type.ts` con la regla:
```
effectiveExerciseType(block, exercise) =
  block.exercise_type_override ?? exercise.exercise_type ?? 'strength'
```
Un bloque legacy (sin override y ejercicio sin `exercise_type`) SIEMPRE resuelve `'strength'`.

---

## 2.1 Tipos de serie/bloque y sus campos tipados (qué inputs muestra cada uno)

Hay **cuatro modos de registro**. La tabla resume qué inputs visibles muestra cada fila y a qué columna de `workout_logs` mapea cada dato capturado. (Encabezados de columna en `WorkoutExecutionClient` — `TypedLogHeader`, líneas 262-291, y el header strength inline 705-710.)

| Modo | Inputs visibles (name HTML) | `type`/`inputMode` | Columna `workout_logs` destino | Notas |
|------|------------------------------|--------------------|-------------------------------|-------|
| **strength** (fuerza) | `weight_kg` (Kg), `reps_done` (Reps) | number step `0.5` / number | `weight_kg`, `reps_done` | + RPE/RIR sliders al desplegar (ver 2.2) |
| **cardio** | `cardio_min` (Min), `actual_distance_m` (Metros), `actual_avg_hr` (FC) | number step `0.5` decimal / number / number `min 25 max 250` | `actual_duration_sec`, `actual_distance_m`, `actual_avg_hr` | `cardio_min` se transforma a segundos antes de enviar (ver 2.1.1) |
| **mobility** (movilidad/hold) | `actual_hold_sec` (Seg de hold) | number numeric | `actual_hold_sec` | un solo input |
| **roller** (foam roller) | `actual_duration_sec` (Seg), `reps_done` (Pasadas) | number numeric / number numeric | `actual_duration_sec`, `reps_done` | "pasadas" se guarda en la columna `reps_done` existente |

### 2.1.1 Transformación cardio: minutos → segundos (`normalizeFormData`)

El input de cardio es **minutos** (más natural para el alumno) pero la columna es **segundos**. En `TypedLogSetRow.normalizeFormData` (líneas 346-353):

```
if (mode === 'cardio') {
  const min = parseNum(formData.get('cardio_min'))
  formData.delete('cardio_min')
  if (min != null && min > 0) formData.set('actual_duration_sec', String(Math.round(min * 60)))
}
```

Es decir: **el cliente convierte min→seg** antes de mandar al server action. El default value del input también hace el camino inverso para mostrar (`Math.round((actual_duration_sec / 60) * 10) / 10`, línea 448). Movilidad usa `actual_hold_sec` directo; roller usa `actual_duration_sec` + `reps_done` directos (sin transformación).

### 2.1.2 Autollenado del input desde el log previo (`defaultValue`)

Cada input se prepopula con `existingLog?.<campo>` vía `defaultValue` (no `value` — son inputs no controlados con `ref`). Esto significa que **al volver a abrir la rutina, los inputs muestran lo ya registrado HOY**:

- strength: `weight_kg`, `reps_done` (líneas 187, 199).
- cardio: `cardio_min` derivado de `actual_duration_sec`, `actual_distance_m`, `actual_avg_hr` (448-469).
- mobility: `actual_hold_sec` (483).
- roller: `actual_duration_sec`, `reps_done` (497, 507).

El `key` del `<form>` se deriva del `existingLog` (`log-${weight_kg}-${reps_done}` strength, `tlog-${actual_duration_sec}-${actual_hold_sec}-${reps_done}` typed). Cuando cambia el log entrante (re-fetch del server), React **remonta** el form y reinicia los `defaultValue`.

> **Importante (no hay autollenado desde la sesión anterior en el input):** el log de la **sesión pasada** se muestra en una tarjeta read-only ("Sesión anterior · {fecha}") arriba de la tabla, SOLO para strength (`WorkoutExecutionClient` 688-702), pero NO precarga los inputs. Los inputs solo se autollenan con el log de HOY. El "objetivo" (target del builder: `block.sets × block.reps`, `target_weight_kg`, `rest_time`, `tempo`, `rir`) se muestra en las tarjetas de objetivo (strength inline 658-667; typed vía `TypedTargetGrid` 143-212) pero TAMPOCO precarga el input — el alumno escribe lo que efectivamente hizo.

---

## 2.2 RPE / RIR — sliders de esfuerzo percibido y reps en reserva

### Cuándo aparecen
Los sliders **no se muestran hasta que la serie está registrada** (`isLogged`). Recién ahí se despliega el panel (animado con `AnimatePresence`):
- **strength**: muestra DOS sliders (RPE y RIR) — `showMetrics = isLogged` (líneas 236-300).
- **cardio/movilidad/roller**: muestra SOLO el slider RPE (líneas 532-565). No hay RIR en los tipos no-strength.

Antes de registrar, hay un hint: *"Cambia los valores y presiona ✓ para actualizar"* (líneas 230-234).

### Rangos y semántica
| Métrica | Rango UI (`<input type="range">`) | Step | Default draft | Tooltip (`InfoTooltip` con `t('tooltip.rpe'/'tooltip.rir')`) |
|---------|-----------------------------------|------|---------------|------------------------------------------------------------|
| **RPE** | `min={6}` `max={10}` | 1 | `rpeDraft = 8` | "Esfuerzo Percibido: escala 6-10. 6=muy fácil, 8=exigente, 10=máximo/fallo" |
| **RIR** | `min={0}` `max={5}` | 1 | `rirDraft = 2` | "Repeticiones en Reserva: cuántas extra podías antes del fallo. RIR 2 = 2 más posibles. 0 = fallo" |

> **Discrepancia rango UI vs validación server:** el slider RIR llega a `5` en la UI, pero `WorkoutLogSetSchema` valida `rir: z.coerce.number().int().min(0).max(10)` y el CHECK de DB es `rir BETWEEN 0 AND 10`. RPE: UI `6-10`, schema `min(1).max(10)`, CHECK DB `rpe BETWEEN 1 AND 10`. La UI es más restrictiva que el server/DB.

### Cómo se guardan (estado local + hidden inputs + submit dedicado)
RPE/RIR tienen DOS rutas de persistencia:

1. **En el submit principal de la serie** — si ya hay un valor en `rpeLocal`/`rirLocal`, se emite como `<input type="hidden" name="rpe" value={rpeLocal} />` / `name="rir"` (líneas 206-211 strength; 434 typed solo rpe). Así, al presionar ✓ con un RPE ya elegido, viaja junto al peso/reps.

2. **Al mover el slider después de registrar** — el `onChange` solo actualiza el draft visual; el guardado ocurre en `onPointerUp` (al soltar): setea `rpeLocal`/`rirLocal` y llama a `submitMetricsUpdate(rpe, rir)` (strength, 138-159) o `submitRpeUpdate(rpe)` (typed, 405-415). Estas funciones:
   - Reconstruyen un `FormData` con `block_id`, `set_number`, los valores actuales de peso/reps (leídos de los `ref`/del form) y el RPE/RIR nuevo.
   - Llaman `onLogged?.(...)` para reflejar en `sessionLogs`.
   - Disparan el server action dentro de `startTransition(() => formAction(fd))`.

Es decir: **mover un slider re-dispara el mismo `logSetAction`**, que hace UPDATE de la fila existente (ver 2.6). El RPE/RIR se persiste sin tocar el peso/reps ya guardados (los re-envía idénticos).

---

## 2.3 Marcar serie como completada / editar / agregar-quitar series

- **Marcar completada = registrar:** no hay checkbox separado. Una serie se considera completada cuando existe una fila en `workout_logs` con esa `(block_id, set_number)` HOY. El botón de submit (`SubmitSetButton`, 570-583) es el toggle visual: muestra `Loader2` mientras `pending`, `Check` en reposo; `title`/`aria-label` cambian a "Set guardado · toca para editar" cuando `isLogged`.
- **Editar una serie ya registrada:** se cambian los valores en los inputs (siguen editables tras registrar) y se vuelve a presionar ✓. El server action detecta la fila existente y hace UPDATE en vez de INSERT (2.6). También se puede editar moviendo el slider RPE/RIR.
- **Bloque completo:** `isBlockComplete(block, logs)` (293-302) cuenta cuántas de las `1..block.sets` tienen log; `done >= block.sets` ⇒ completo. Dispara el ícono `CheckCircle2`, atenúa el bloque (`opacity 0.6`) y hace auto-scroll al siguiente bloque incompleto (350 ms después, `handleLogged` 441-450).
- **Agregar/quitar series:** **NO existe en la ejecución.** El número de filas es fijo = `block.sets` (definido por el coach en el builder). El alumno no puede añadir una serie extra ni borrar una serie planificada desde esta pantalla. La única "eliminación" que ocurre es interna: el server action borra filas DUPLICADAS del mismo `(block_id, set_number)` del día (2.6).

---

## 2.4 Técnica del ejercicio (modal con video/gif/instrucciones)

Acceso: botón con ícono `Info` que solo aparece si el ejercicio tiene `gif_url` o `video_url` (`WorkoutExecutionClient` 647-651). `openTechnique(exercise)` setea `selectedExercise` y abre el `Dialog` (`showTechnique`, 792-903).

De dónde sale el contenido (datos en `exercises`, traídos por la query — ver 2.5):
- **YouTube:** si `video_url` contiene `youtube.com`/`youtu.be` y `extractYoutubeVideoId` resuelve un id → componente `<ExerciseVideo>` con `start={video_start_time}` / `end={video_end_time}` (recorte de clip definido por el coach).
- **GIF:** si `gif_url` existe → `<Image unoptimized>` con el gif.
- **MP4/video subido:** si `video_url` apunta a `.mp4/.mov/.webm` o a Supabase Storage → `<video autoPlay loop muted playsInline>`.
- **Imagen:** fallback de `video_url` como imagen.
- **Instrucciones:** lista ordenada desde `selectedExercise.instructions` (array de pasos); cada paso pasa por `step.replace(/^Step:\d+\s*/i, '')` para limpiar prefijos. Si no hay, muestra "No hay instrucciones detalladas disponibles".

El modal es solo lectura (no captura nada). Botón "Entendido" cierra.

---

## 2.5 Qué datos llegan (plan / día / bloques / series / logs previos)

Fuente: `_data/workout-execution.queries.ts` → `getWorkoutExecutionData(planId)`, envuelto en `React.cache`. Flujo de queries (todas user-scoped salvo dos lecturas service-role justificadas):

1. **Auth local:** `supabase.auth.getClaims()` (verificación local ES256 del JWT, sin round-trip a `/user`); `user = { id: claims.sub }`.

2. **Plan + bloques + ejercicio (1 query con joins):** de `workout_plans` filtrado por `id = planId AND client_id = user.id` (`.maybeSingle()`). Selecciona el plan (`id, title, assigned_date, day_of_week, week_variant, program_id, coach_id`) y anidado `workout_blocks (...)` con TODOS los campos de prescripción, incluidos los polimórficos (`exercise_type_override, side_mode, reps_value, reps_unit, load_value, load_unit, distance_value, distance_unit, duration_sec, target_pace_sec_per_km, hr_zone, instructions, interval_config`) y el ejercicio anidado `exercises ( id, name, muscle_group, video_url, video_start_time, video_end_time, gif_url, instructions, exercise_type )`. Si no hay plan → redirect a dashboard.

3. **Guard de programa activo:** si `plan.program_id`, verifica que el programa esté `is_active = true` para ese cliente; si no, devuelve `plan: null` (no se ejecuta una rutina de un programa archivado).

4. **Programa (metadata):** `workout_programs` (`name, program_phases, program_structure_type, cycle_length, ab_mode, start_date, weeks_to_repeat`). Deriva `activeWeekVariant` (A/B) si `ab_mode` vía `resolveActiveWeekVariantForDisplay`.

5. **Logs de HOY (los `existingLog`):** de `workout_logs` filtrado por `block_id IN (blockIds del plan)` y `logged_at` dentro de los límites UTC del día de Santiago (`getSantiagoUtcBoundsForDay(getTodayInSantiago().iso)`). Selecciona `block_id, set_number, weight_kg, reps_done, rpe, rir, actual_duration_sec, actual_distance_m, actual_hold_sec, actual_avg_hr`. Estos alimentan `existingLog` por serie. **Ventana = solo hoy** ⇒ al cambiar de día, la rutina arranca "limpia" aunque sea el mismo plan.

6. **Historial de la sesión anterior (`previousHistory`):** `workout_logs` del mismo `client_id`, mismos `exercise_id` que el plan, EXCLUYENDO los `block_id` actuales (`.not('block_id', 'in', ...)`), orden `logged_at` desc, `limit(200)`. Se agrupa por `exercise_id` quedándose solo con el día más reciente (la tarjeta "Sesión anterior"). Solo se muestra en strength.

7. **Áreas (secciones no clásicas):** si el plan referencia `section_template_id` no-clásicos, se resuelven con **service-role puro** (`createServiceRoleClient`, sin cookies — porque la RLS no deja al alumno leer áreas custom del coach/team). Doble acotamiento por ids ya presentes + tenant del plan (system / coach del plan / team del alumno).

8. **`exerciseMaxes` (para detectar PRs en el resumen):** `workout_logs` del cliente, `weight_kg` not null, ejercicios del plan, `limit(5000)`, excluyendo los block_id de hoy. Calcula el max histórico de peso por `exercise_id`. Lo consume `WorkoutSummaryOverlay` para detectar récords.

9. **Vista cardio (`cardio: ClientCardioView`):** solo si el plan tiene campos cardio (`hr_zone`/`duration_sec`/`interval_config`). Resuelve `enabled` (módulo cardio del coach/team, leído service-role) + `zones` (zonas FC personalizadas del alumno) vía `getClientZonesForContext`. Alimenta los chips "Z4 · 150-168 bpm".

> El `WorkoutExecutionClient` recibe TODO esto como props (no fetchea nada). El `page.tsx` redirige a `login` si no hay user, a `dashboard` si no hay plan.

---

## 2.6 Cómo se GUARDA cada serie — `logSetAction` (server action)

Archivo: `_actions/workout-log.actions.ts`. Es el único punto de escritura. Flujo:

### Paso 1 — Lectura y normalización del FormData
`getOptional(key)`: devuelve `undefined` si `null`/`''`, si no `String(val).replace(',', '.')` (normaliza coma decimal latam → punto). Arma `raw` con: `block_id`, `set_number`, `weight_kg`, `reps_done`, `rpe`, `rir`, y los polimórficos `actual_duration_sec`, `actual_distance_m`, `actual_pace_sec_per_km`, `actual_hold_sec`, `actual_avg_hr`. Un log strength de hoy NO envía las keys `actual_*` (quedan `undefined`).

### Paso 2 — Validación Zod (`WorkoutLogSetSchema`, en `@eva/schemas`)
`packages/schemas/workout.ts` líneas 198-211. Usa `z.coerce.number()` (acepta strings del FormData). Constraints:
- `block_id`: `z.string().uuid()` (UUID estricto — el block_id sí cumple RFC).
- `set_number`: int `min(1)`.
- `weight_kg`: number `min(0)` opcional.
- `reps_done`: int `min(0)` opcional.
- `rpe`: number `min(1).max(10)` opcional.
- `rir`: int `min(0).max(10)` opcional.
- `actual_duration_sec`: int `min(0).max(86400)` opcional.
- `actual_distance_m`: number `min(0).max(1000000)` opcional.
- `actual_pace_sec_per_km`: int positivo `max(3600)` opcional.
- `actual_hold_sec`: int `min(0).max(86400)` opcional.
- `actual_avg_hr`: int `min(25).max(250)` opcional.

Si falla: `return { error: parsed.error.issues[0].message }` (se muestra en la fila con botón "Reintentar").

### Paso 3 — Auth + scoping
`createClient()` (server, user-scoped — corre con la sesión del alumno, NO service-role). `supabase.auth.getUser()`; sin user → `{ error: 'No autenticado.' }`. La RLS `client_manage_logs` (`client_id = auth.uid()` en USING y WITH CHECK) acota TODA operación a logs propios.

### Paso 4 — Upsert manual por día (NO `.upsert()` nativo)
La estrategia es leer-y-decidir, NO un upsert de Postgres:

1. Calcula límites UTC del día Santiago (`getTodayInSantiago` + `getSantiagoUtcBoundsForDay`).
2. **SELECT** `id` de `workout_logs` donde `block_id` + `client_id = user.id` + `set_number` + `logged_at` en [hoy 00:00, mañana 00:00), orden desc.
3. Arma `payloadValues` con los 9 campos de medición (todos con `?? null`).
4. **Si existe** ≥1 fila: `UPDATE` de la primera (`existingRows[0].id`) con `payloadValues`. Si hay más de una (`length > 1`): `DELETE` de los duplicados (`existingRows.slice(1)`) — limpieza de filas duplicadas del mismo día.
5. **Si no existe**: `INSERT` con `block_id, client_id, set_number, ...payloadValues`.

> **Idempotencia por día:** registrar y re-registrar la misma serie el mismo día = UPDATE in-place (no acumula filas). Las columnas `_at_log` (`plan_name_at_log`, `target_reps_at_log`, `target_weight_at_log`, `exercise_name_at_log`) NO las escribe este action (quedan null en el INSERT; existen en la tabla pero las puebla otro flujo).

### Paso 5 — Revalidación
Si `dbError` → `{ error: dbError.message }`. Si OK:
- `revalidatePath('/c', 'layout')` — refresca la app del alumno.
- `revalidatePath('/coach/clients/${user.id}')` — refresca la vista del coach (el path usa `user.id`, que es el client_id).
- `return { success: true }`.

### Persistencia física (`workout_logs`)
Esquema (baseline + migración `20260611090003_workout_logs_polymorphic_mirror.sql`):
```
workout_logs (
  id uuid PK default uuid_generate_v4(),
  block_id uuid NOT NULL,            -- FK workout_blocks
  client_id uuid NOT NULL,           -- = auth.uid()
  set_number integer NOT NULL,
  weight_kg numeric(6,2),
  reps_done integer,
  rpe integer,                       -- CHECK 1..10
  rir integer,                       -- CHECK 0..10
  logged_at timestamptz NOT NULL default now(),
  plan_name_at_log text,             -- snapshot histórico (no escrito por logSetAction)
  target_reps_at_log text,
  target_weight_at_log numeric,
  exercise_name_at_log text,
  -- espejo polimórfico (nullable, SIN CHECKs — hot table, valida Zod):
  actual_duration_sec integer,
  actual_distance_m numeric,
  actual_pace_sec_per_km integer,
  actual_hold_sec integer,
  actual_avg_hr smallint,
  metadata jsonb                     -- libre (no usado por la UI actual)
)
```
Es la **tabla más caliente de la app** (1 insert/update por serie logueada). Por eso el espejo polimórfico se agregó sin CHECKs (validación en Zod) y con autovacuum agresivo (`autovacuum_vacuum_scale_factor = 0.05`, migración `20260617170346`). Índices relevantes: `(client_id, logged_at DESC)`, `block_id`, `logged_at DESC`.

RLS: `client_manage_logs` (alumno ALL sobre lo propio), `coaches_read_logs`/`workout_logs_coach` (coach SELECT sobre sus clientes), `team_workout_logs_member_all` (pool team). El alumno escribe, el coach lee.

---

## 2.7 Cómo cada acción dispara el guardado (optimistic + cola offline)

### Camino online (normal)
`<form action={handleSubmit}>`. `handleSubmit(formData)`:
1. (typed) `normalizeFormData` (min→seg cardio).
2. `addOptimisticLogged(true)` — `useOptimistic` marca la fila como registrada YA (verde) sin esperar al server.
3. Si `autoTimerEnabled && !isLogged` (y hay `restTimeStr`): `navigator.vibrate(50)` + `startRest(restTimeStr)` — arranca el temporizador de descanso (ver §timer abajo).
4. `onLogged?.({...})` — sube el dato al `sessionLogs` del cliente (barra de progreso, auto-scroll, detección de bloque completo). En strength incluye `weightKg/repsDone/rpe/rir`; en typed `weightKg: null, repsDone, rpe, rir: null`.
5. `formAction(formData)` — dispara `logSetAction` (vía `useActionState`).

El estado `pending` de `useFormStatus` muestra el spinner en el botón. Si el action devuelve `state.error`, aparece la línea de error + "Reintentar" (`formRef.current?.requestSubmit()`).

### Estado optimista
- `useOptimistic(!!existingLog || state.success, ...)` — la fila se ve registrada apenas se envía; si el server falla, `state.success` queda false y el error se muestra. El optimista NO hace rollback automático de los inputs (los valores tipeados persisten en pantalla).
- `useActionState(logSetAction, initialState)` — `state = { error?, success? }`.

### Camino offline (cola en localStorage)
Guard al inicio de `handleSubmit`: `if (!navigator.onLine)`. En ese caso NO se llama al server. Se encola:

`enqueueWorkoutLog(...)` (`lib/workout-offline-queue.ts`) hace `localStorage` push a la key `eva:workout-offline-queue`. El item `WorkoutOfflineLog` lleva: `blockId, setNumber, weightKg, repsDone, rpe, rir, planId, coachSlug, timestamp` + los polimórficos opcionales `actualDurationSec, actualDistanceM, actualHoldSec, actualAvgHr`. Luego `addOptimisticLogged(true)` + toast "Sin conexión — el log se guardará al reconectar".

> Strength encola RPE/RIR; typed encola `weightKg: null, rir: null` + los actual_*. El parser de cada campo normaliza coma decimal (`Number(String(wRaw).replace(',', '.'))`).

### Flush de la cola (`OfflineWorkoutQueueSync`)
Componente montado en el layout del alumno (`_components/OfflineWorkoutQueueSync.tsx`). En `useEffect` y en el evento `window 'online'`:
1. Lee la cola; si vacía, no hace nada. Guard `flushing` (ref) evita reentradas.
2. Por cada item: reconstruye `FormData` (solo setea las keys con valor != null, incluidos los `actual_*`) y llama **directamente** `logSetAction({}, fd)`.
3. Si `res.success` → cuenta como flushed; si no → lo re-pone en `remaining`. Excepciones → también `remaining`.
4. Reescribe la cola con `remaining`. Si flushed > 0 → toast "N sets sincronizados" + `router.refresh()`.

> La cola es **best-effort, sin reintentos con backoff ni dedup por timestamp**: si dos items apuntan a la misma `(block_id, set_number)` del día, el segundo simplemente hace UPDATE sobre el primero (idempotencia del action). El indicador offline en la UI (`isOffline`, banner ámbar) se controla por `online`/`offline` listeners en `WorkoutExecutionClient`.

---

## 2.8 Temporizadores que dispara el registro (contexto, no captura datos)

`WorkoutTimerProvider` expone `startRest`, `startHold`, `startInterval`, `startStopwatch`. UN solo timer activo a la vez (reemplazo suave con toast "Temporizador anterior reemplazado"). Disparadores:

- **Al registrar una serie** (`handleSubmit`, si `autoTimerEnabled`): `startRest(restTimeStr)`. `parseRestTime` interpreta `"90"`, `"01:30"`, `"1 min"`, `"90s"` → segundos. Solo arranca si `> 0`. `RestTimer` cuenta atrás; al terminar alarma (`setInterval`, `navigator.vibrate([200,100,200,100,400])`, notificación vía service worker).
- **Botones de objetivo typed** (`TypedBlockTimerButton`, 215-259): cardio con `interval_config` cronometrable → `startInterval(config, sets)` (construye fases warmup→work/recovery×N→cooldown vía `buildIntervalPhases`); cardio sin intervalos → `startStopwatch()`; movilidad/roller con `duration_sec > 0` → `startHold(seconds, label)`.
- **Botón manual de descanso** (footer, `ManualTimerButton`): `startRest('90')` por defecto.

Estos timers NO escriben en `workout_logs`; son ayudas de ejecución. El dato que el alumno haya cronometrado (ej. el hold) lo ingresa MANUALMENTE en el input correspondiente.

---

## 2.9 Cálculo de adherencia (qué hace el registro aguas abajo)

El registro produce filas en `workout_logs`; la adherencia se computa en `services/dashboard.service.ts` (consumido por el coach y por el dashboard del alumno). Mecánica clave: **adherencia = series logueadas / series planificadas** (no por bloque completo, por serie individual).

- `adherenceForWindow(logs, windowStart, windowEnd, totalPlannedSets)` (163-174): cuenta logs con `logged_at` en la ventana; `min(round(count / totalPlannedSets * 100), 100)`.
- `adherenceHistory4w`: 4 ventanas semanales (subDays).
- `percentage` (semana actual): `logsCount / totalPlannedSets` capado a 100.
- `totalPlannedSets` viene del programa activo (`plannedSetsFromProgram` / `plannedSetTotals`).
- Lectura: chunked `workout_logs.select('client_id, logged_at, weight_kg, reps_done, plan_name_at_log')`, `WORKOUT_LOGS_ROW_CAP = 2000` por chunk, ventana ~35 días. `lastWorkoutDate` se resuelve por RPC `get_clients_last_workout_date` (MAX server-side, no depende del cap).
- 1RM / progreso: `computeOneRMDelta` + `avgDailyMaxEpley` (Epley sobre `weight_kg`/`reps_done`).

> **Consecuencia de diseño:** la adherencia ignora el TIPO de serie — cuenta cualquier fila de `workout_logs` (strength, cardio, mobility, roller) como "1 serie cumplida". El volumen y 1RM solo usan `weight_kg`/`reps_done`, así que un log cardio/movilidad/roller (sin peso) cuenta para adherencia pero NO suma volumen ni dispara PR.

### En la propia pantalla (barra de progreso de la sesión)
`WorkoutExecutionClient` calcula en vivo desde `sessionLogs` (optimista):
- `requiredSets = sum(block.sets)`.
- `completedSetCount = countUniqueLoggedSets(blocks, sessionLogs)` (305-318) — dedup por `(block_id, set_number)` dentro del rango planificado, ignora set_numbers fuera de `1..block.sets`.
- `completionPct = min(100, round(completedSetCount / requiredSets * 100))`.

### Resumen final (`WorkoutSummaryOverlay`)
Al "Finalizar entrenamiento" (`handleFinish` → portal a `document.body`). Calcula del `sessionLogs`:
- `completedSets = logs.length`, `totalReps`, `totalVolume = Σ weight_kg × reps_done`.
- `exerciseBreakdown` por ejercicio (volumen, maxWeight, best1RM con `epleyOneRM`).
- `detectedPRs`: compara `maxWeight` de hoy vs `exerciseMaxes[exerciseId]` (histórico de la query) → si supera, es PR (confetti + tarjeta con +%). Solo aplica a series con peso.
- `muscleGroupVolume` (barras por grupo). Botón "Compartir logro" (Web Share / clipboard). "Volver al inicio" → `router.push(dashboard)`. El overlay NO escribe nada nuevo; los logs ya se guardaron serie a serie.

---

## 2.10 Resumen del mapeo dato→columna por tipo (cheat sheet backend)

| Dato capturado (UI) | name FormData | Columna `workout_logs` | Tipos que lo usan |
|----------------------|---------------|------------------------|-------------------|
| Peso | `weight_kg` | `weight_kg` numeric(6,2) | strength |
| Reps | `reps_done` | `reps_done` integer | strength |
| Pasadas | `reps_done` | `reps_done` integer | roller |
| RPE | `rpe` | `rpe` integer (1-10) | strength, cardio, mobility, roller |
| RIR | `rir` | `rir` integer (0-10) | strength |
| Minutos cardio (→seg) | `cardio_min` → `actual_duration_sec` | `actual_duration_sec` integer | cardio |
| Segundos (roller) | `actual_duration_sec` | `actual_duration_sec` integer | roller |
| Metros | `actual_distance_m` | `actual_distance_m` numeric | cardio |
| FC promedio | `actual_avg_hr` | `actual_avg_hr` smallint | cardio |
| Seg de hold | `actual_hold_sec` | `actual_hold_sec` integer | mobility |
| Pace (no hay input en ejecución) | `actual_pace_sec_per_km` | `actual_pace_sec_per_km` integer | (existe en schema/queue, sin input UI) |

> `actual_pace_sec_per_km` está en el schema, en el espejo de la cola offline (vía `collectValues`) y en la columna, pero **ningún input visible lo captura** en la ejecución actual (el cardio captura min/metros/FC, no pace directo). Punto a revisar para parity en el rediseño.
