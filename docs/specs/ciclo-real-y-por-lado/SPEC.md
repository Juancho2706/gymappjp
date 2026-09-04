---
status: implemented-pending-qa
owner: product-engineering
last_verified: "2026-09-03"
canonical: false
---

# SPEC — Ciclo real y por lado (ciclo N-días, series por lado en fuerza, tipo en la ficha del coach, Android/PWA)

> **Borrador.** Origen: feedback del coach **Movens** (03-09, primer coach frío de Meta, Pro pagado
> 02-09, 7 alumnos) + un cuarto punto del owner. Decisiones del owner en `DECISIONS.md` (D1–D4);
> resoluciones del jefe en `OUTLINE.md` §R (R1–R8) y en `OUTLINE-16-RESOLUCIONES.md` (R9–R40, que
> mandan sobre las anteriores y ya están aplicadas en este documento). Un solo tren (D4): una rama `rnmobiledenuevo`,
> un deploy web, una OTA (runtime 1.1.2). Mockups del jefe aprobados ANTES de construir UI.
> Plan de ejecución en [PLAN](PLAN.md); tareas en [TASKS](TASKS.md); DB y amenazas en
> [DATA-SECURITY](DATA-SECURITY.md).

## Problema

Cuatro defectos verificados contra `HEAD dbdf4b5e` y LIVE (03-09, solo lectura).

### P0 · «Ciclo N-días» es una fachada

El coach configura un programa `cycle` y **todos** los consumidores tratan `workout_plans.day_of_week`
(1..`cycle_length`) como día calendario ISODOW. Un ciclo de 3 se ve como Lun/Mar/Mié fijo y jue–dom
«descanso».

- Hero del alumno web: `apps/web/src/app/c/[coach_slug]/dashboard/_data/heroComplianceBundle.ts:101`
  → `p.day_of_week === todayDow`.
- Day-cards web: `.../dashboard/_components/program/ActiveProgramSection.tsx:67-74`
  (`isToday: dow === todayDow`) y `.../program/WorkoutPlanCard.tsx:20,117`
  (`const DAYS = ['Lun',…,'Dom']` / `DAYS[dow - 1]` ⇒ `undefined` con `dow` 8..14).
- Agenda semanal web: `.../dashboard/_data/weekPendingWorkouts.ts:200-209`.
- Anillo «Entrenos» (últimos 30 días): `apps/web/src/lib/workout/workoutAdherence30d.ts:72`
  (`p.day_of_week === dow` decide qué día estaba «planificado») → `heroComplianceBundle.ts:166` →
  `MomentumCard.tsx:92` / `ComplianceRing.tsx:85`. En un ciclo de 3, entrenar jueves no suma.
- Home RN: `apps/mobile/app/alumno/(tabs)/home.tsx:350` (`p.day_of_week === todayDbDay`) y `:401`
  (`((dow - 1) % 7 + 7) % 7`).
- Ficha del coach web: `apps/web/src/app/coach/clients/[clientId]/profileProgramUtils.ts:87,99`
  — `isToday: dow >= 1 && dow <= 7 && dow === todayDow` y luego `isToday: info.dayOfWeek === todayDow`
  **sin guard de rango**: con `cycle_length = 3` los días 1..3 caen dentro de 1..7 y el lunes marca
  «Hoy» el día 1 del ciclo.
- Racha SQL: `supabase/migrations/20260723110000_streak_assigned_days_semantics.sql:136`
  → `AND p.day_of_week = dy.dow`.

**Números (STATS)**: 31 programas `cycle` (16 asignados, **15 activos**, 8 coaches); Movens tiene 16
de esos 31. `cycle_length`: 2→9, 3→12, 4→3, 5→2, 7→5 (ninguno > 7; el schema permite 14). Los
**5 alumnos de Movens con logs tienen racha 0**. Contrapeso: 276 programas `weekly` (104 activos,
63 coaches) que no deben notar nada.

### P1 · «Series por lado» en fuerza es un control muerto

Los dos builders ofrecen «Lado» y persisten `workout_blocks.side_mode`
(`apps/web/src/app/coach/builder/[clientId]/components/BlockEditSheet.tsx:43,232-238`;
`apps/mobile/components/coach/BlockEditorSheet.tsx:77,327`), pero el ejecutor de fuerza lo ignora:

- Web: `apps/web/src/app/c/[coach_slug]/workout/[planId]/LogSetForm.tsx:1524`
  → `const perSide = mode === 'mobility' && sideMode === 'per_side'`.
- Motor: `packages/workout-engine/set-log-payload.ts:122` (rama `per_side` **solo** en `mobility`)
  y `:217` `buildStrengthPayload(values, blockId, setNumber)` — sin contexto de lado.
- Zod: `packages/schemas/workout.ts:301-305` declara `left_sec`/`right_sec` y nada más; Zod v4
  estripa las claves no declaradas.
- El chip «Lado» solo se pinta en el carril tipado, no en fuerza
  (`apps/mobile/components/alumno/workout/TypedTargetGrid.tsx`).

**Números (STATS)**: 195 bloques `per_side/strength` en 49 coaches (**78 bloques / 11 coaches** son
de alumnos reales; el resto es demo y plantillas) con **296 logs** ya escritos; 75 bloques
`alternating/strength` en 3 coaches con 202 logs; 110 `per_side/mobility` (que sí funcionan: 28 filas
con `metadata` por lado). Movens: 19 bloques `per_side`, 8 en fuerza. Ejemplo LIVE: «Remo a un brazo
con kettlebell», 3 series ⇒ 3 filas con `reps_done = 36` y la nota «2 x 18 izq/der» escrita a mano.

### P2 · Tipo de ejercicio: el alumno lo ve, el coach está ciego

`effectiveExerciseType(block, exercise)` (`packages/workout-engine/workout-exercise-type.ts:74`) rige
los ejecutores, pero el SELECT del programa activo de la ficha **no pide las columnas tipadas**:

- Web `apps/web/src/services/client/client-detail.service.ts:80-92` — trae
  `sets, reps, rest_time, notes, target_weight_kg, tempo, rir, superset_group` y
  `exercises ( id, name, muscle_group, gif_url, thumbnail_url, video_url )`. Sin
  `exercise_type_override`, sin `exercises.exercise_type`, sin `side_mode`, sin los campos de
  cardio/movilidad.
- RN `apps/mobile/lib/coach-client-detail.ts:806-816` — mismo hueco.
- Resultado: `ProgramTabB7.tsx:482` y `PlanTab.tsx:555` imprimen siempre `'Series × reps'` con icono
  de mancuerna, aunque el modelo a copiar ya existe en
  `apps/web/src/app/coach/clients/[clientId]/TrainingTabB4Panels.tsx:642,684`
  (`effectiveExerciseType` + `typedBlockSummary`).

Agujeros menores del mismo tipo: «Cambiar ejercicio» filtra por el tipo del **catálogo** ignorando el
override (`apps/web/src/app/c/[coach_slug]/workout/[planId]/_data/substitution.queries.ts:47-76`;
RN `apps/mobile/lib/workout/substitution.ts:236-284`); cambiar el tipo de un bloque no limpia los
campos del tipo anterior. **Números**: 7 869 `workout_blocks`, 396 con `exercise_type_override` (5 %);
Movens 269 bloques, 8 con override.

### P3 · Android / PWA: estado de tienda y copy viejos

- `apps/mobile/components/coach/InviteStudent.tsx:213` dice «Tu alumno baja EVA, escribe este código
  y entra directo a tu app» — Play está en **closed testing** (0 tokens Android en toda la instancia,
  32 iOS) y la web ya corrigió el copy.
- El prompt de instalar PWA solo aparece **después del primer entreno**:
  `apps/web/src/components/InstallPrompt.tsx:97` → `if (!hasCompletedFirstWorkout()) return false`.
  3 de los 5 alumnos de Movens con logs entrenan por navegador.
- El tren PWA/service worker está **sin commit** en el working tree (`sw.js`, `OfflineScreen.tsx`,
  `clear-client-caches.ts`, `tests/pwa-sw-navigation.test.ts`, `ClientNav.tsx`, `layout.tsx`,
  `DemoViewerExit.tsx`, `ProfileClient.tsx`, `SuspendedSignOutButton.tsx`).

## Objetivo

Que un programa por ciclo se comporte como un ciclo (el alumno avanza 1→2→3→1 al ritmo que entrena, no
al ritmo del calendario), que «por lado» capture izquierda y derecha en fuerza, que el coach vea en la
ficha el mismo tipo de ejercicio que ve el alumno, y que las superficies de Android/PWA digan la
verdad — **sin que un solo programa `weekly` cambie de comportamiento** y sin reescribir historia de
los programas ya asignados.

## Decisiones

### Del owner (`DECISIONS.md`, literales)

- **D1 · Ciclo N-días: «hoy toca» = CURSOR POR COMPLETITUD.** Hoy toca el día del ciclo siguiente al
  último día COMPLETADO por el alumno (1→2→3→1…). Nunca se ancla al día calendario. Racha en programas
  `cycle`: cada día entrenado suma; ningún día corta. Etiquetas en modo ciclo: «Día 1 de 3», «Día 2 de
  3»… en TODAS las superficies (alumno web/PWA, alumno RN, ficha coach web/RN, biblioteca). Nunca
  Lun/Mar/Mié. Los programas `weekly` no cambian ni un byte de comportamiento.
- **D2 · Series por lado en FUERZA: REPS IZQ/DER + UN PESO.** Una fila por serie (el índice único
  `workout_logs_one_set_per_day` no se toca). El alumno registra dos campos de reps (izquierda /
  derecha) y un peso. Se guarda `reps_done` y `metadata { left_reps, right_reps }` (extender el zod de
  metadata; mismo patrón que `left_sec/right_sec` en movilidad). Ficha del coach, resúmenes, historial
  y share muestran «10 / 10», tonelaje = peso × (izq + der).
- **D3 · «Inicio flexible (el alumno decide)»: IMPLEMENTARLO DE VERDAD.** El toggle se queda en ambos
  builders y pasa a tener función real. Con `start_date_flexible = true` y `start_date` sin fijar, el
  alumno ve en su Inicio (web/PWA y RN) un estado «Tu programa está listo, empieza cuando quieras» con
  acción «Empezar hoy». Al confirmar, se fija `workout_programs.start_date` = fecha elegida (TZ
  America/Santiago) vía acción/RPC con guard de pertenencia (solo el alumno dueño del programa; nunca
  `service_role` en cliente; RLS revisada). Hasta que el alumno empiece: el ciclo igual muestra «Día 1
  de N» disponible, la semana del programa es 1, fases/A-B no avanzan y la racha no exige nada. Con
  `start_date_flexible = false`: comportamiento actual. Los programas cycle activos ya estampados
  conservan su fecha (no se reescribe historia).
- **D4 · Entrega: TODO EN UN SOLO TREN.** Una rama, un deploy web, una OTA (runtime 1.1.2) con los 4
  puntos. El PLAN se organiza en waves internas pero sale a producción junto, con un QA grande del
  owner al final (web desktop, PWA móvil, RN device). Gates completos antes del deploy: lint,
  typecheck, test (vitest), check:tokens, docs:check, tsc mobile + expo export android; E2E del
  ejecutor solo al cierre.

### Del jefe (`OUTLINE.md` §R, literales)

- **R1 · Racha en ciclo sin cursor en SQL.** La racha NO usa «día asignado» en programas `cycle`.
  Regla: cada día entrenado suma +1; ningún día individual corta; corta solo una **semana calendario
  completa (Lun–Dom, America/Santiago, ya cerrada) con cero entrenos**. Motivo: «ningún día corta» a
  secas produce un contador que nunca baja (medido en LIVE: 8, 6, 4…); la semana vacía es la ventana de
  gracia mínima y coincide con Hevy. El cursor por completitud vive SOLO en TS (motor), no en Postgres.
  Weekly: byte a byte igual.
- **R2 · «Inicio flexible» pasa a opt-in y solo afecta programas nuevos.** Default del toggle =
  **false** en ambos builders y en el servicio (`?? false`); hoy es `true` por defecto y 50 programas
  activos lo tienen sin saberlo. Con `true`, el servicio deja de estampar `start_date` (queda NULL) y
  el alumno lo fija con «Empezar hoy» o automáticamente al registrar su primera serie (misma RPC,
  idempotente). Programas ya guardados conservan su `start_date`; no se reescribe historia.
  `start_date NULL` = «no empezó»: semana 1, fases/A-B quietas, y en la racha entra por la regla 7
  existente («sin programa cubriendo la fecha»), con guard explícito contra NULL en la rama cycle.
- **R3 · `reps_done` en fuerza por lado = MÍNIMO de los dos lados; la suma solo en tonelaje y
  presentación.** D2 decía «suma»; los mapas muestran que la suma rompe la progresión automática
  (`progression.ts:208-211` compara contra el tope del rango prescrito POR LADO), el e1RM del PR
  (`pr-detect.ts:93`) y el top-set del share, y crea doble semántica contra los 296 logs históricos de
  bloques per_side. Con el mínimo: progresión, PR y chips siguen correctos sin tocarlos;
  `metadata {left_reps, right_reps}` guarda el desglose; el tonelaje pasa a
  `weight_kg × (left+right)` cuando hay metadata. Un solo lado ingresado ⇒ `reps_done` = ese lado.
- **R4 · `alternating` se captura igual que `per_side`** (dos campos de reps, una fila por serie,
  etiqueta «Alternado»). `bilateral` desaparece como opción (0 filas en LIVE): selector =
  `null | per_side | alternating` en web y RN.
- **R5 · «Cambiar ejercicio» filtra por tipo EFECTIVO** (override incluido). Si no hay candidatos, el
  sheet muestra «No hay reemplazos de este tipo» y no ofrece nada. No se bloquea el cambio cuando hay
  override.
- **R6 · Cambiar el tipo de un bloque limpia al instante los campos del tipo anterior** (helper único
  `stripFieldsForType`), sin diálogo. Campos compartidos (`sets`, `rest_time`, `notes`,
  `superset_group`, `side_mode`, `instructions`) se conservan. Se aplica ANTES o junto con ampliar el
  SELECT de la ficha (evita que residuos se vuelvan visibles). **R32:** la limpieza escribe `null`
  **explícito** (nunca `undefined`) en TODOS los campos polimórficos del tipo anterior según
  `packages/schemas/workout.ts` — `duration_sec`, `distance_value`, `distance_unit`, `hr_zone`,
  `interval_config`, `reps_value`, `reps_unit`, `target_pace_sec_per_km`, `load_value`, `load_unit` —
  con test de round-trip en el `serialize.ts` de RN.
- **R7 · Nada de telemetría nueva más allá de 3 eventos.** Sin medición previa de racha (no existe) no
  se promete «delta».
- **R8 · Ciclos > 7 días quedan soportados por el mismo helper** (etiquetas «Día 8..14» y cursor módulo
  N); se elimina la aritmética `((dow-1)%7+7)%7` en los sitios que colisionan.

**R33 corrige a R8 (manda R33).** Esa aritmética existe **solo en RN**:
`apps/mobile/app/alumno/(tabs)/home.tsx:401` y
`apps/mobile/components/alumno/workout/v3/weekly-streak.ts:198`. En **web** el colapso de los índices
8..14 no es esa fórmula sino el `dayByDow` de 7 entradas de
`apps/web/src/app/c/[coach_slug]/dashboard/_components/program/ActiveProgramSection.tsx:63-68`; ahí va
la corrección web, no en una fórmula inexistente.

**Contradicción D2 ↔ R3 (resuelta):** D2 dice `reps_done = izq + der`; R3 la corrige a
`min(izq, der)`. Manda R3 (jerarquía `OUTLINE.md:3`). Lo que el owner pidió — «10 / 10» en las
superficies y tonelaje = peso × (izq + der) — se cumple igual, porque ambos salen de `metadata`.

**Consecuencia aceptada de R3 · los PR por e1RM en bloques `per_side` con historial.** `detectPR`
(`packages/workout-engine/pr-detect.ts:86-99`) compara el e1RM de la serie nueva
(`epleyOneRM(setActual.weight_kg, setActual.reps_done)`, `:93`) contra el `historicalBest` de los logs
previos, y esos **296 logs** de bloques `per_side/strength` traen las reps **sumadas a mano** (LIVE:
«Remo a un brazo con kettlebell», `reps_done = 36`). Con `reps_done = min(izq, der)`, una serie nueva
de 10 nunca supera ese e1RM inflado ⇒ `isPR: false` salvo que suba el peso (`:95`, `weightPR` sigue
intacto). **Se acepta tal cual**: no se reescribe historia (el backfill es no-objetivo), el PR por
peso —el que el alumno reconoce— sigue funcionando, y el desvío se apaga solo a medida que entran
logs nuevos. Gate en W0: test con historial mixto (fila vieja `reps_done = 36` + fila nueva `10`) que
fije `isPR: false` por e1RM y `true` al subir el peso. Se avisa a los 11 coaches con bloques
`per_side/strength` reales antes del deploy, junto con el aviso de la racha.

## Modelo de dominio y reglas del motor

**Sin columnas nuevas.** `workout_programs`: `program_structure_type` weekly|cycle · `cycle_length`
1..14 · `start_date_flexible` (opt-in) · `start_date` (NULL = no empezó, solo posible con flexible).
`workout_plans.day_of_week`: weekly = ISODOW 1..7 · cycle = índice del ciclo 1..`cycle_length`.
`workout_blocks.side_mode`: `per_side` | `alternating` | NULL (en fuerza ahora tiene efecto;
`is_unilateral` sigue muerta y no se toca). `workout_logs`: una fila por (bloque, set_number, día) —
el índice único `workout_logs_one_set_per_day`
(`supabase/migrations/20260707120000_workout_logs_unique_set_per_day.sql:62`) no se toca.

### `packages/workout-engine/cycle-cursor.ts` (nuevo)

```ts
export type CycleCursorProgram = {
  program_structure_type: 'weekly' | 'cycle' | null
  cycle_length: number | null
  start_date: string | null            // ISO yyyy-mm-dd; NULL = no empezó (R2)
  start_date_flexible: boolean | null  // opt-in (R2); NULL/false = el coach fijó la fecha
}
export type CycleCursorPlan = { id: string; day_of_week: number | null; title: string | null }
export type CycleCompletion = { planId: string; dateIso: string }   // día COMPLETADO (deriveDayCompletion)
export type CycleSlot = {
  planId: string
  cycleIndex: number
  state: 'done' | 'today' | 'upcoming'
  doneDateIso?: string
}
export type CycleCursorInput = {
  program: CycleCursorProgram
  plans: CycleCursorPlan[]              // ya filtrados por variante A/B
  completions: CycleCompletion[]        // últimos 30 días (los produce buildCycleCompletions)
  inProgress?: { planId: string; dateIso: string } | null
  todayIso: string                      // yyyy-mm-dd en America/Santiago
}
export type CycleCursorResult = {
  mode: 'weekly' | 'cycle'
  programState: 'not_started' | 'active'   // 'not_started' SOLO si flexible && start_date NULL
  todayPlanId: string | null
  todayCycleIndex: number | null
  todayState: 'todo' | 'in_progress' | 'done'
  nextPlanId: string | null
  nextCycleIndex: number | null
  lastCompleted?: { planId: string; cycleIndex: number; dateIso: string }
  slots: CycleSlot[]
}
export function resolveCycleCursor(input: CycleCursorInput): CycleCursorResult
```

### `packages/workout-engine/cycle-completions.ts` (nuevo, R9 — bloquea el cursor)

Único productor de `completions`; nadie deriva la completitud a mano en una superficie.

```ts
export function buildCycleCompletions(input: {
  plans: CycleCursorPlan[]
  blocksByPlan: Record<string, { id: string }[]>
  logs: CompletionLogLike[]             // ventana de 30 días (R10)
  todayIso: string
}): { completions: CycleCompletion[]; inProgress?: { planId: string; dateIso: string } }
```

Reutiliza `countLoggedSetsByBlock`, `skippedBlockIdsFromLogs` y `deriveDayCompletion`
(`day-completion.ts:136`) — no reimplementa la regla de «día hecho». **Un plan SIN bloques no
participa del cursor**: se salta, nunca es «hoy» y nunca aparece como completado.

**Ventana y fuente de logs (R10).** Web y RN alimentan el cursor con la MISMA lectura: logs de los
**últimos 30 días**, `select block_id, workout_blocks(plan_id), set_number, logged_at, metadata`,
`order by logged_at desc`, `limit 200`. **Forma verificada del select:** `plan_id` no es columna de
`workout_logs` y viaja por el join `workout_blocks(plan_id)`; **`target_date` tampoco es columna** de
`workout_logs` (hoy es metadato de la cola offline de RN), así que no se pide en la lectura.
RN restaura esas columnas en la lectura de
`apps/mobile/app/alumno/(tabs)/home.tsx:172-179` (hoy solo trae fechas). Sin ningún día completado en
la ventana ⇒ cursor = **Día 1** (reinicio explícito, sin persistencia): es comportamiento declarado
del contrato, no un riesgo abierto.

**Fecha de la completitud (R11).** Cada completitud se fecha por el **día Santiago del log**
(`eva_santiago_day(logged_at)`) **en lectura**; en **escritura** manda el `target_date` del ítem
encolado (cola offline de RN, «repetir el día»), que llega al log como `logged_at` de esa fecha.
El cursor sigue la completitud **más reciente por fecha**, no por orden de inserción: registrar el
Día 1 con fecha de ayer ⇒ hoy toca el Día 2, y editar un día viejo no lo «mueve» de fecha.

**Reglas del cursor.** Pura, sin `new Date()` implícito ni acceso a red. `N = cycle_length`.
`L` = índice del último día completado (fecha más reciente; empate → mayor índice).
`hoy = (L mod N) + 1`. **Si no existe plan para el índice calculado, el cursor SALTA al siguiente
índice que sí tenga plan** (los planes vacíos no participan, R9 + DECISIONS-2). Si hay un completado
**hoy** ⇒ `todayState = 'done'`, `todayPlanId` = el plan del día hecho y `nextPlanId` /
`nextCycleIndex` = el siguiente. Si hay logs de hoy sin completar el día ⇒ `todayState =
'in_progress'` en ese plan. Sin completados en la ventana de 30 días ⇒ **Día 1**. En `weekly` devuelve
exactamente lo actual (`day_of_week === ISODOW`) — identidad, sin ninguna rama nueva.

**`programState` (el motor es el único dueño de la semántica de «no empezó»).**
`programState = 'not_started'` ⟺ `start_date_flexible === true` **y** `start_date === null`; en
cualquier otro caso `'active'` (incluye el weekly sin fecha no flexible, que se comporta como hoy).
Ninguna superficie vuelve a derivar ese estado a mano: el hero web, el hero RN y la ficha del coach
leen `programState`, no `start_date`. Con `'not_started'` el cursor **igual** devuelve el Día 1
disponible en `cycle` (`todayCycleIndex = 1`, `todayState = 'todo'`, `slots` con `p1` en `today`; en
`weekly` la salida no cambia respecto de hoy), la semana del
programa es 1 y fases/A-B no avanzan (D3). El estado no depende de `todayIso`: la función sigue siendo
pura.

Ejemplos de entrada/salida (ciclo de 3, planes `p1`→Día 1, `p2`→Día 2, `p3`→Día 3):

| Caso | `completions` | `todayIso` | Resultado |
|---|---|---|---|
| Avance normal | `[{p1,'2026-09-01'} (lun), {p2,'2026-09-02'} (mié)]` | `'2026-09-03'` (jue) | `todayPlanId=p3`, `todayCycleIndex=3`, `todayState='todo'`, `next=p1/1`, `lastCompleted={p2,2,'2026-09-02'}`, `slots=[{p1,1,done,'2026-09-01'},{p2,2,done,'2026-09-02'},{p3,3,today}]` |
| Ya entrenó hoy | `[…, {p3,'2026-09-03'}]` | `'2026-09-03'` | `todayPlanId=p3` (el día hecho), `todayCycleIndex=3`, `todayState='done'`, `nextPlanId=p1`, `nextCycleIndex=1` |
| Día 1 fechado ayer (R11) | `[{p1,'2026-09-02'}]` | `'2026-09-03'` | `todayPlanId=p2`, `todayCycleIndex=2`, `todayState='todo'` — el cursor sigue la fecha, no el orden de inserción |
| Índice sin plan (R9) | `[{p1,'2026-09-01'}]` con `p2` **sin bloques** | `'2026-09-03'` | el cursor salta el índice 2 y devuelve `todayPlanId=p3`, `todayCycleIndex=3` |
| Empezó y no cerró | `[{p1,'2026-09-01'}]` + `inProgress={p2,'2026-09-03'}` | `'2026-09-03'` | `todayPlanId=p2`, `todayCycleIndex=2`, `todayState='in_progress'` |
| Sin logs | `[]` | cualquiera | `todayPlanId=p1`, `todayCycleIndex=1`, `todayState='todo'`, `slots=[{p1,1,today},{p2,2,upcoming},{p3,3,upcoming}]` |
| Weekly (identidad) | irrelevante | jueves | `mode='weekly'`, `todayPlanId` = el plan con `day_of_week === 4`, o `null` |
| No empezó (flexible) | `[]` con `start_date_flexible=true`, `start_date=null` | cualquiera | `programState='not_started'`, `todayPlanId=p1`, `todayCycleIndex=1`, `todayState='todo'`, `slots=[{p1,1,today},{p2,2,upcoming},{p3,3,upcoming}]` |
| Sin fecha y NO flexible | `[]` con `start_date_flexible=false`, `start_date=null` | cualquiera | `programState='active'` (comportamiento de hoy: el hero no ofrece «Empezar hoy»); resto igual al caso «Sin logs» |

En los demás casos de la tabla `programState = 'active'`. Los dos casos nuevos entran a la batería de
`resolveCycleCursor` junto a los 12 del motor.

El día calendario **no participa** del cursor: un alumno que vuelve el domingo tras dos semanas ve el
día siguiente al último que cerró. Fuera de la ventana de 30 días el cursor reinicia en Día 1:
**comportamiento declarado del contrato** (R10), idéntico en web y RN, no una regresión a mitigar.

### Resto del motor

| Archivo | Export | Contrato |
|---|---|---|
| `program-day-label.ts` (nuevo) | `programDayLabel(dayOfWeek: number \| null, structure: 'weekly'\|'cycle'\|null, cycleLength: number \| null, opts: { form: 'short'\|'long'\|'chip' }): string` | weekly: `Lun` / `Lunes` / **`Lun` también en `chip`** (R31: el chip de 34 px no cambia para los 276 weekly); cycle: `Día 1` / `Día 1 de 3` / `D1`. Reemplaza las 7 implementaciones ad-hoc, incluidas `WorkoutPlanCard.tsx:20`, `profileProgramUtils.ts:81` y `apps/mobile/components/coach/programs/program-model.ts:93,180-183` (`DAY_LABELS` con «Mie»/«Sab» sin tilde). Soporta índices 8..14 (R8). **Forma por call site:** el chip de 34 px de la biblioteca RN (`ProgramPreviewCard.tsx:83-87`, hoy `dayLabel(plan.day_of_week)`) puede usar `chip` en ambas estructuras: en weekly `chip` devuelve `Lun` (3 letras, idéntico a hoy en los 276 programas weekly) y en ciclo `D1` (forma corta oficial de «Día 1 de 3», lo único que entra en 34 px). Nunca una inicial suelta: «L» sería una regresión visual sin aceptación que la atrape. |
| `set-log-payload.ts` | `buildStrengthPayload(values, blockId, setNumber, ctx?: { sideMode?: string \| null }): OptimisticLogPayload` | Con `ctx.sideMode ∈ {per_side, alternating}` lee `values.reps_left` / `values.reps_right`, escribe `repsDone = min(l, r)` (o el único presente) y `metadata = { left_reps, right_reps }`. Sin `ctx`, comportamiento actual byte a byte (`:217-234`). |
| `keypad-flow.ts` | `STRENGTH_PER_SIDE_KEYPAD_STEPS`, `sideMode` nuevo en `KeypadTarget` | **R18: `typedTargetFor` NO cambia** — la fuerza nunca entra al carril tipado (sigue devolviendo `null` en strength) y `TypedKeypadMode` queda igual. Los pasos por lado salen de la **rama no tipada** de `keypadStepsForTarget` (`:123`), que elige `STRENGTH_PER_SIDE_KEYPAD_STEPS` según el `sideMode` del `KeypadTarget`. Pasos: peso → reps izq → reps der. Header «Izq · Der». |
| `logged-set-summary.ts` | **`formatStrengthSetLine(log): string \| null`** (export nuevo) | **R19 (opción a): `formatLoggedSetLine('strength')` SIGUE devolviendo `null`** (`:149`) — no se toca. El export nuevo devuelve «20 kg × 10 / 10» **solo** cuando `metadata` trae los dos lados; si no, `null`. Lo llaman dentro de su rama de fuerza los 4 call sites: `LogSetForm.tsx:909-913`, `SetRow.tsx:450-454`, `TrainingTabB4Panels.tsx:776-783`, `AnalisisTab.tsx:631`, conservando over/under, «PC» y RPE/RIR. |
| `workout-exercise-type.ts` | `SIDE_LABEL` (`:31`, ya exportado) | Fuente única de «Por lado» / «Alternado». Web borra su copia local (`WorkoutExecutionClient.tsx:308-311`) y la importa del motor (R39). |
| `workout-exercise-type.ts` (motor; TASKS W0.7 manda sobre la ubicación anterior en `session-summary.ts`) | **`sideRepsFromMetadata(metadata): { left, right } \| null`** (export nuevo) | **R27:** helper único de lectura defensiva — devuelve los dos lados **solo si LOS DOS** son enteros `0..9999`; **por paridad con el `->>` del SQL acepta también una cadena de 1 a 4 dígitos** (`/^[0-9]{1,4}$/`, así `{left_reps:"10"}` suma igual que en la migración) y la convierte. Cualquier otro caso (uno solo presente, decimal, negativo, `1e30`, otra cadena, objeto, ausente, `null`) ⇒ `null` (nunca `jsonb_typeof`/cast crudo). Lo usan `session-summary.ts`, `apps/mobile/lib/workout-session.ts:418`, `build-share-data.ts` y los chips. Sin CHECK en la columna. |
| `workout-exercise-type.ts` | `sideSuffix` pasa a export (`:118`) | Los 4 call sites legacy agregan « /lado» o « alt.» al «3 × 10». **`hasTypedPrescription` (`:86`) NO cambia** — tocarla activaría resúmenes tipados en 195 bloques de fuerza y rompería la edición rápida del builder. |
| `session-summary.ts` | volumen | Usa `left + right` de `sideRepsFromMetadata` si hay metadata; si no, `reps_done` (`:164-198`). |
| `progression.ts`, `pr-detect.ts` | sin cambio funcional | R3 los protege. Se agrega un test que fije la invariante. |
| `day-completion.ts` | sin cambio | `deriveDayCompletion` (`:136`), `countLoggedSetsByBlock` (`:193`) y `skippedBlockIdsFromLogs` (`:215`) alimentan `buildCycleCompletions` sin tocarse. |

`packages/plan-builder/block-type-fields.ts` (nuevo): `stripFieldsForType(block, newType)` y
`defaultBlockForType(type)`, usados por ambos builders (R6 + R32).
`packages/schemas/workout.ts`: `WorkoutLogSetSchema.metadata` (`:301-305`) suma `left_reps` y
`right_reps` (int ≥ 0, nullable, opcionales), junto a `left_sec`/`right_sec`/`skipped`/`skip_reason`.

### Adherencia 30 d — el anillo «Entrenos» (dentro del alcance)

Tercer consumidor del ISODOW, además del hero y las day-cards:
`apps/web/src/lib/workout/workoutAdherence30d.ts:34-88` recorre 30 días calendario y cuenta como día
**planificado** aquel cuyo plan cumple `p.day_of_week === dow` (`:72`, `plannedDays++` en `:80`, score
en `:88`). En `cycle` eso vuelve a leer el índice del ciclo como día de la semana: un alumno de un
ciclo de 3 sólo «tiene planificado» lun/mar/mié y entrenar jueves no suma. El resultado viaja por
`heroComplianceBundle.ts:166` → `scores.workoutScore` (`:50,199`) hasta
`MomentumCard.tsx:92` y `ComplianceRing.tsx:85`, ambos con la etiqueta «Entrenos».

**Regla elegida (una sola, sin meta semanal):** `AdherenceProgramRow` (`:23-28`) suma
`program_structure_type?: 'weekly' | 'cycle' | null` (**opcional**; ausente ⇒ weekly) y
`computeWorkoutScore30d` devuelve `score: number | null`.

- **weekly**: byte a byte lo de hoy.
- **cycle**, o programa con `start_date == null` (el `programState = 'not_started'` del motor, que
  esta función deriva de la fila que ya recibe): no existe denominador honesto — el «día planificado»
  no está definido en un ciclo y la meta semanal de sesiones es un no-objetivo declarado de este tren
  ⇒ devuelve `{ plannedDays: 0, completedDays: <días con ≥ 1 log del programa>, score: null }`
  (R29: cuenta el día con ≥ 1 log **del programa** vía el enlace bloque→plan; un log con
  `block_id NULL` es neutro, no suma ni resta). El bundle propaga el `null`
  (`workoutScore: number | null` en `heroComplianceBundle.ts:50,166,199`) y **los 3 consumidores del
  score pintan «—» con el rótulo «Sin meta semanal»** (R12), lista única: el render de
  `MomentumCard.tsx:92` y la cadena `ComplianceScoresCard.tsx:14` → `ComplianceRing.tsx:59,65,85`
  (`ComplianceRingCluster` propaga el `null` a la ring de «Entrenos»). Nunca un porcentaje inventado
  ni un 0 % que castigue al alumno por entrenar el día que
  quiso. La meta semanal en ciclo queda como backlog.

**Blindaje de weekly:** los 3 `it` existentes (`workoutAdherence30d.test.ts:5,17,43`) **no se editan**
— el campo nuevo es opcional y su ausencia significa weekly. Se agregan dos casos: `cycle` ⇒
`score === null` y `plannedDays === 0`; `program_structure_type: 'weekly'` explícito ⇒ el mismo número
que hoy.

### Grillas Lun→Dom en `cycle` (R12)

Qué hace cada superficie de calendario cuando `mode = 'cycle'` (en `weekly` no cambia nada):

- `dashboard/_components/calendar/WeekCalendar.tsx` — **se borra** (código muerto).
- `dashboard/_data/weekPendingWorkouts.ts:200-209` — devuelve **cero** pendientes y cero recuperables,
  y el `WorkoutRecoverBanner` **no se monta**: en un ciclo no existe «día perdido».
- `MomentumCard`, el `WeekStrip` de RN y la tira de racha del ejecutor **se mantienen** como tira
  Lun→Dom de **días entrenados** (un punto por día con logs; sin estados «asignado» ni «pendiente»),
  tal como muestra el mockup A.
- Anillo «Entrenos» (`workoutAdherence30d`): `score = null` y los 3 consumidores pintan «—» con el
  rótulo «Sin meta semanal» (firma `number | null`).

### Share de entreno RN y el desglose por lado

El share que existe hoy es el de **RN** (`apps/mobile/components/alumno/share/build-share-data.ts`);
el no-objetivo declarado más abajo es el share **web**, que no existe. Con R3 (`reps_done` = mínimo)
ese builder mostraría la mitad del volumen que el resumen de sesión y que el tonelaje del coach,
porque lee `reps_done` crudo en `topSetLabelFor` (`:55-61`), `totalReps` (`:109`), `totalVolumeKg`
(`:110`) y `repsAtMax` (`:125`). Además `SummaryLogLike`
(`packages/workout-engine/session-summary.ts:43-52`) no declara `metadata`, así que el desglose ni
siquiera llega tipado al share (el patrón de ampliarlo ya existe en
`apps/mobile/components/alumno/workout/v3/SessionCompleteV3.tsx:76`, `FinalLogLike`).

**Regla (R34):** `SummaryLogLike` suma `metadata?: { left_reps?: number | null; right_reps?: number |
null } | null` (opcional, no rompe a los demás consumidores) y `build-share-data.ts` lee el desglose
con `sideRepsFromMetadata` (R27), no con casts propios:

- **`totalReps` (`:109`) y `totalVolumeKg` (`:110`)**: `izq + der` cuando hay metadata — la misma
  fórmula que `session-summary.ts`, para que el share reporte el **mismo volumen** que el resumen de
  sesión y que el tonelaje del coach (peso × (izq + der)).
- **Top set (`topSetLabelFor`, `:55-61`) y `repsAtMax` (`:125`)**: siguen con **`reps_done`**, que con
  R3 es el mínimo de los dos lados — es la magnitud comparable serie a serie. El label imprime
  «10 / 10» cuando hay metadata.

Sin metadata la salida es **byte a byte idéntica a hoy** (test en `tests/mobile` con fixture con y sin
metadata).

### DB (aditiva, 4 migraciones)

1. `20260903212441_streak_cycle_branch_and_null_start.sql` — `CREATE OR REPLACE FUNCTION
   public.get_client_current_streak(uuid)` con la misma firma y grants: rama `cycle` según R1
   (sin `assigned`, +1 por día con ≥ 1 log del programa, corte solo por semana Lun–Dom cerrada con 0
   logs) y guard contra `start_date IS NULL`. Weekly: cuerpo idéntico. Los batch
   (`get_clients_streaks_by_ids`, `get_coach_clients_streaks`) heredan.
2. `20260903212038_client_start_workout_program_rpc.sql` — **firma (R23)**:
   `public.client_start_workout_program(p_program_id uuid, p_start_date date DEFAULT NULL)
   RETURNS TABLE (start_date date, end_date date, started boolean)`, `SECURITY DEFINER`,
   `SET search_path=public`.
   - **Ventana: solo hoy (R14).** Acepta `p_start_date` **NULL o igual a hoy** (Santiago); cualquier
     otra fecha ⇒ `start_date_out_of_range`. No hay rango +30/−90 ni fechas pasadas: «Elegir otra
     fecha» está fuera del tren.
   - **Guard de pertenencia (R40).** El predicado del alumno es **exactamente el mismo** que el de la
     policy INSERT de `workout_logs` (si esa policy admite `client_memberships` /
     `student_readable_client_ids`, la RPC también; si no, `client_id = auth.uid()`); el detalle con
     la policy real citada va en [DATA-SECURITY](DATA-SECURITY.md). Se suman `is_active` AND
     `start_date_flexible` AND `start_date IS NULL`.
   - **Gate de cuenta pausada (R17).** Antes del UPDATE llama `private.student_write_allowed(v_uid)` y
     lanza **`coach_account_paused`** (SQLSTATE `42501`). El action web devuelve el mismo error tipado
     que `logSetAction` (`workout-log.actions.ts:112-116`).
   - Fija `start_date = COALESCE(p_start_date, eva_santiago_day(now()))`
     (`20260707120000_workout_logs_unique_set_per_day.sql:30`) y, **en el mismo UPDATE (R21)**,
     `end_date = start_date + weeks_to_repeat * 7 − 1`.
   - **Idempotencia (R28).** Si el UPDATE afecta 0 filas porque `start_date` ya estaba, devuelve la
     fecha existente con `started = false`; 0 filas por cualquier otra causa ⇒ `program_not_startable`.
     `started = true` **solo** cuando esta llamada escribió.
3. `20260903212700_daily_tonnage_side_metadata.sql` — `get_client_daily_tonnage`
   (`20260612052000_rpc_client_progress_aggregations.sql:200`) pasa a usar el `reps_eff` defensivo de
   R27 (abajo). Misma firma y grants.
4. `20260903212800_muscle_volume_side_metadata.sql` (R15) — `CREATE OR REPLACE
   public.get_client_muscle_volume(uuid, integer)` con el **mismo `reps_eff`**, reponiendo el
   REVOKE/GRANT del linaje `20260612052000:76-77`. Los espejos TS quedan alineados:
   `apps/mobile/lib/enterprise-profile-analytics.ts:131` y `apps/mobile/lib/coach-client-detail.ts:755`
   (ambos en `apps/mobile`, no en la app `apps/enterprise` congelada).

**`reps_eff` defensivo (R27), idéntico en las migraciones 3 y 4** — nunca `jsonb_typeof` ni cast
crudo, y **sin CHECK en la columna**:

```sql
reps_eff = CASE
  WHEN metadata->>'left_reps'  ~ '^[0-9]{1,4}$'
   AND metadata->>'right_reps' ~ '^[0-9]{1,4}$'
  THEN (metadata->>'left_reps')::int + (metadata->>'right_reps')::int
  ELSE reps_done
END
```

**Grants, las 4 migraciones (R16).** `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, service_role;`
**antes** del `GRANT EXECUTE … TO authenticated`, y un `has_function_privilege` inmediatamente después
del `CREATE` como aserción.

Validación obligatoria antes de aplicar (R25): función espejo **`_streak_next`** (no
`get_client_current_streak_next`), diff sobre todos los clientes con logs, EXPLAIN, JWT reales y
ROLLBACK; test de equivalencia **`supabase/tests/streak_cycle_equivalence.sql`** (convención del repo:
**sin timestamp** en el nombre) con criterio duro **0 filas de diff en clientes weekly**. Estos dos
nombres son los únicos que usan todos los documentos del tren.

## Estados del alumno

- **Ciclo, no empezado** (`start_date_flexible = true`, `start_date NULL` ⇒ `programState =
  'not_started'`, leído del motor y no re-derivado por cada superficie): hero «Tu programa está
  listo · Día 1 de 3 · Push/Pull» y **un único botón: «Empezar hoy»** (R14 / M1 variante B). Entrar a
  entrenar directo también lo empieza (auto-start idempotente por la misma RPC).
  **No hay selector de fecha en este tren**: «Elegir otra fecha» sale al backlog, la RPC solo acepta
  hoy (o NULL) y cualquier otra fecha responde `start_date_out_of_range`. Tampoco existe el estado
  «Empieza el <fecha>»: el cursor de ciclo es agnóstico del calendario y no hay UI para un inicio
  futuro (el cálculo de semana sí soportaría un `start_date` futuro —
  `apps/web/src/lib/workout/programWeekVariant.ts:17-19`— pero no se usa).
- **Ciclo en curso**: el hero refleja `todayState` — `todo` → «Hoy toca · Día 2 de 3 · Pull»;
  `in_progress` → «En progreso · Día 2 de 3»; `done` → «Día 2 hecho · Próximo: Día 3 de 3». Las
  day-cards se pintan desde `slots` (hecho con fecha / hoy / próximo), **sin fechas de calendario y
  sin «Recuperar»**: en un ciclo no existe «día perdido». Tampoco hay «Día de descanso» forzado — el
  alumno decide cuándo entrena.
- **Weekly**: idéntico a hoy, en las dos plataformas.
- **Racha**: en `cycle` por R1 (cada día entrenado suma; corta solo una semana Lun–Dom cerrada sin
  entrenos). El ribbon y los milestones se mantienen tal cual (cuentan días entrenados).
- **Fuerza por lado**: la fila de serie muestra «Izq / Der» + un peso; el resultado se lee
  «10 / 10 · 20 kg». **El chip «Por lado» / «Alternado» va en la fila de objetivo del ejercicio de
  fuerza, no en `TypedTargetGrid` (R39)** — la fuerza nunca entra al carril tipado (R18). Call sites:
  web `ExerciseStepV3.tsx:196-204`, `SingleExerciseCard` y la superserie; RN
  `ExerciseScreenV3.tsx:327-338` y `SupersetGroupCard.tsx:428-429`. Todos toman el texto de
  `SIDE_LABEL[side_mode]` importado del motor; `TypedTargetGrid` no cambia.

## Superficies por plataforma

Rutas verificadas contra `HEAD dbdf4b5e` (varias difieren de las del OUTLINE §7; manda esta tabla).

| Familia | Web móvil / PWA | Web desktop | RN alumno / coach |
|---|---|---|---|
| **A. Alumno Inicio** (ciclo + «Empezar hoy» + chip de tipo) | `dashboard/_data/heroComplianceBundle.ts:101,162`, `dashboard/_components/program/ActiveProgramSection.tsx:51-74`, `.../program/WorkoutPlanCard.tsx:20,117`, `dashboard/_data/weekPendingWorkouts.ts:200-209`, `dashboard/_components/momentum/MomentumCard.tsx:92` y `dashboard/_components/compliance/ComplianceRing.tsx:85` (anillo «Entrenos» ⇒ «—» + «Sin meta semanal» en ciclo, R12), `dashboard/_components/calendar/WeekCalendar.tsx` (muerto: borrar), `workout/[planId]/_data/week-status.queries.ts`, `apps/web/src/lib/workout/workoutAdherence30d.ts:23-28,72,80,88` | `dashboard/_components/desktop/DesktopDashboardHead.tsx` | `app/alumno/(tabs)/home.tsx:163,350,401`, `components/alumno/home/ActiveProgramSection.tsx:268,303,446-450`, `components/alumno/home/types.ts`, `components/alumno/workout/v3/weekly-streak.ts:94-98,192-201`, `components/alumno/home/StreakRibbon.tsx` |
| **B. Ejecutor fuerza por lado** | `workout/[planId]/LogSetForm.tsx:216,1512,1524,1643,1755,2076-2088`, `workout/[planId]/v3/ExerciseStepV3.tsx:219`, `workout/[planId]/SingleExerciseCard.tsx`, `workout/[planId]/v3/SupersetStepV3.tsx`, `workout/[planId]/WorkoutExecutionClient.tsx`, `apps/web/src/lib/workout-offline-queue.ts:154` | mismo componente | `components/alumno/workout/SetRow.tsx`, `components/alumno/workout/v3/ExerciseScreenV3.tsx`, `components/alumno/workout/SupersetGroupCard.tsx:428-429` (chip en la fila de objetivo; `TypedTargetGrid.tsx` **no cambia**, R39), `lib/workout-session.ts:418`, `lib/offline-cache.ts`, `components/alumno/share/build-share-data.ts:55-61,109-110,125` (+ `SummaryLogLike` en `packages/workout-engine/session-summary.ts:43-52`) |
| **C. Ficha coach → Programa** (tipo + Día N + próximo) | `coach/clients/[clientId]/ProgramTabB7.tsx:237,482,685`, `coach/clients/[clientId]/profileProgramUtils.ts:87,99`, `coach/clients/[clientId]/TrainingTabB4Panels.tsx:642,684`, `services/client/client-detail.service.ts:80-92` | mismo | `components/coach/clientDetail/PlanTab.tsx:127,270,555`, `components/coach/clientDetail/OverviewTab.tsx`, `lib/coach-client-detail.ts:806-816`, `components/coach/programs/ProgramPreviewCard.tsx:85` + `components/coach/programs/program-model.ts:93,180-183` |
| **D. Builder «Lado» + toggle flexible** | `coach/builder/[clientId]/components/BlockEditSheet.tsx:43,232-238,868,1041,1094`, `.../components/ExerciseBlock.tsx`, `.../components/StudentLivePreview.tsx`, `.../components/ProgramConfigForm.tsx`, `coach/builder/[clientId]/WeeklyPlanBuilder.tsx:186,1030,1035` | mismo | `components/coach/BlockEditorSheet.tsx:77,327,432,448,685`, `components/coach/BuilderBlockCard.tsx`, `components/coach/ProgramConfigSheet.tsx`, `components/coach/ExerciseSearchSheet.tsx`, `app/coach/program-builder.tsx:842,1214,1558,1655` |
| **E. Invitar / instalar** | `apps/web/src/components/InstallPrompt.tsx:97` (día 1 en Android Chrome con `beforeinstallprompt`, dismiss 30 d), `components/client/ClientNav.tsx` sin cambio | — | `components/coach/InviteStudent.tsx:213` (copy) + `apps/web/src/lib/email/transactional-templates.ts` (mail admin, copy) |

Backend web que acompaña: `services/workout/workout.service.ts:385,510,585,798,975,1023` (deja de
estampar `start_date` con el flag; default `?? false`; y el guard de `assignFromTemplate`
`:977-981` deja `end_date` en NULL cuando no hay `start_date`, R21),
`workout/[planId]/_actions/workout-log.actions.ts:166`
(`metadata: parsed.data.metadata ?? null` ⇒ pasa a escribirse **solo si viene**, para no borrar el
desglose al re-guardar), `dashboard/_data/dashboard.queries.ts` (+ `program_structure_type`,
`cycle_length`, `start_date_flexible`, `exercise_type_override`, `exercises(exercise_type)`), y la
acción nueva `dashboard/_actions/start-program.actions.ts` →
**`startWorkoutProgramAction({ coachSlug, programId })`** (objeto; sin fecha por R14), que hace
`revalidatePath('/c/' + coachSlug + '/dashboard')` y devuelve el error tipado `coach_paused` cuando la
RPC lanza `coach_account_paused` (R17, R24).
RN: `lib/start-program.ts` (nuevo) con **`startWorkoutProgram(programId)`** (R24),
`lib/program-persistence.ts:96-99` (espejo del default; `resolveProgramScheduleMetadata` devuelve
`{ start_date: null, end_date: null }` con flexible sin fecha, R21), y
`app/alumno/(tabs)/home.tsx:172-179` — la lectura de 30 días **hoy solo trae fechas**: se le devuelven
`block_id, workout_blocks(plan_id), set_number, logged_at, metadata` (`order by logged_at desc`,
`limit 200`) para alimentar `buildCycleCompletions` con la misma lectura que web (R10). `plan_id`
llega por el join y `target_date` **no se pide**: no es columna de `workout_logs` (la fecha sale de
`eva_santiago_day(logged_at)` en lectura, R11).

### Aviso «programa asignado» con `start_date NULL` (regresión que abre R2)

`apps/web/src/services/workout/program-assignment-notification.service.ts:117-126` descarta el
programa en `programMatchesScope` con
`if (!program.is_active || !program.source_template_id || !program.start_date) return false` (`:123`)
y sale por `program_not_eligible` (`:173-176`) **antes** del push (`:205-213`) y del email
(`:215-220`). Es el único aviso del alta de un programa hecha desde RN
(`apps/web/src/app/api/mobile/coach/program-assignment-notifications/route.ts:34-41`, con
`emailSender: resendIdempotentEmailSender` y `pushSender: notifyProgramAssigned`). Con R2 (flexible ⇒
`start_date` queda NULL) ese guard apagaría **email y push** justo en el flujo nuevo: el coach asigna
desde la app y el alumno no se entera de nada.

**Regla:** `start_date` sale del guard de `:123` (siguen `is_active`, `source_template_id` y la
pertenencia al scope). `buildProgramAssignedEmail` (`transactional-templates.ts:109`) pasa a
`startDate: string | null` (`:100`) y la fila «Inicio» (`:130-132`, hoy `${ctx.startDate}` crudo)
imprime **«Empieza cuando quieras»** cuando llega `null`; el call site del servicio (`:196`) deja de
usar el non-null assertion `program.start_date!`. El push no lee la fecha: no cambia.

**Aceptación:** programa flexible sin fecha ⇒ **1 email + 1 push** (hoy: 0 + 0, `program_not_eligible`);
programa con fecha ⇒ salida byte a byte igual a hoy.

## Copys canónicos

«Día 1 de 3» (forma corta oficial para chips estrechos: «D1») · «Hoy toca» · «Empezar hoy» (único
botón del estado «no empezó»; no existe «Elegir fecha» ni «Elegir otra fecha» en este tren, R14) ·
«Tu programa está listo» · «Empieza cuando quieras» (fila «Inicio» del email de programa
asignado cuando no hay fecha, R20) · «Sin meta semanal» (rótulo del anillo «Entrenos» en ciclo, con
«—» en lugar del porcentaje, R12) · «Por lado» ·
«Alternado» · «Izq» · «Der» · «10 / 10» · «No hay reemplazos de este tipo» · «Tu alumno entra desde el
navegador con tu link o desde la app en iOS. No necesita instalar nada.» · hint del builder: «El alumno
registra izquierda y derecha en cada serie.»

Español latinoamericano neutro con tildes, sin emojis, tokens EVA DS (`#1462DC`, `vars()` en RN).
Ninguna superficie del coach vuelve a decir «baja EVA».

## Alcance

Los cuatro puntos, en un solo tren (D4), con paridad web desktop + PWA/móvil web + RN:
motor compartido (`cycle-cursor.ts`, `cycle-completions.ts`, `program-day-label.ts`,
`block-type-fields.ts`, `sideRepsFromMetadata`, `formatStrengthSetLine`, zod de
`metadata`), **4 migraciones aditivas**, alumno web, alumno RN, coach web + RN (incluye R5 y R6), copy de
invitar/instalar y el commit del tren PWA que está en el working tree. Entran también, por ser
consecuencias directas de R2 y R3 y no arreglarlas dejaría el tren incoherente: el anillo «Entrenos»
(`workoutAdherence30d.ts`, con el hero y `MomentumCard`/`ComplianceRing`) y el aviso «programa
asignado» con fecha nula (`program-assignment-notification.service.ts` +
`transactional-templates.ts`) en la wave del alumno web; el share de RN (`build-share-data.ts` +
`SummaryLogLike`) en la wave del alumno RN. Analytics: **exactamente 3
eventos** (R7) — `program_started_by_client {program_id, structure, via:'button'|'auto'}`, que se
emite **únicamente cuando la RPC devuelve `started = true`** (R23/R28: una segunda llamada idempotente
no vuelve a contar),
`set_logged_per_side {block_id, side_mode}`, `pwa_install_prompt_shown {platform, day1}`.

## No-objetivos

Meta semanal de sesiones en ciclo · actividad externa/yoga como tipo nuevo · sacar Play a producción
(calendario del owner 05-09) · Cobros coach→alumno · `is_unilateral` · pesos distintos por lado
(`left_weight`/`right_weight`: el owner fijó **un peso** en D2; declararlos en el zod «por las dudas»
repetiría el control muerto de P1) · `hr` en `metadata` · el `EXECUTE` a `PUBLIC` de
`get_workout_program_planned_set_totals` · share de entreno **web** (el share de **RN**, que es el que
existe, sí entra: pasa a leer el desglose por lado) · **«Elegir otra fecha» y el quinto estado
«Empieza el <fecha>»** (R14: la RPC solo acepta hoy; ambos quedan como backlog) · métrica de
adherencia con denominador propio y **meta semanal de sesiones en ciclo** (el anillo «Entrenos»
muestra «—» con el rótulo «Sin meta semanal», R12) · tildes de `program-model.ts:93` como
tarea aparte (entran gratis con `programDayLabel`) · backfill o recálculo de rachas históricas ·
migración del texto de `reps` («10 por pierna»): son 4 bloques en 3 coaches, no justifica DDL.

## Métrica de éxito

Criterios de salida del tren (todos verificables):

1. **Weekly: 0 diff.** El test de equivalencia SQL devuelve 0 filas para clientes con programa
   `weekly`, los parity tests del motor pasan y `resolveCycleCursor` en `mode:'weekly'` es la identidad
   del comportamiento actual.
2. **Movens ve el ciclo.** Sus alumnos con programa `cycle` ven «Día N de 3» (nunca Lun/Mar/Mié) en
   Inicio web, PWA y RN, y en la ficha del coach; y su racha deja de ser 0 en los 5 alumnos con logs.
   En la biblioteca RN el chip sigue diciendo **«Lun» en weekly** (sin regresión en los 276 programas)
   y dice **«D1»** en ciclo. El anillo «Entrenos» no inventa porcentaje en ciclo: muestra «—» con el
   rótulo «Sin meta semanal».
3. **«Remo a un brazo» registra 10 / 10.** Un bloque `per_side/strength` captura izquierda y derecha,
   guarda `metadata {left_reps, right_reps}`, muestra «10 / 10 · 20 kg» en ejecutor, resumen de sesión,
   historial y ficha del coach, y el tonelaje del día sube por `peso × (izq + der)`. El **share de
   RN** reporta el mismo volumen que el resumen de sesión (no la mitad).
4. **El coach ve el tipo.** La pestaña Programa (web y RN) imprime el mismo tipo efectivo que ve el
   alumno en los bloques con `exercise_type_override` o tipo de catálogo distinto de `strength`.
5. **Copy honesto.** Ninguna superficie del coach promete la app de Android; el prompt de instalar PWA
   aparece el día 1 en Android Chrome.
6. **El alta flexible avisa igual.** Un programa `start_date_flexible` sin fecha, asignado desde RN,
   produce **1 email + 1 push** «programa asignado» (hoy: 0 + 0) y el email dice «Empieza cuando
   quieras» en la fila «Inicio».
7. **Gates verdes con ejecución real**: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm check:tokens`,
   `pnpm docs:check`, `pnpm --filter @eva/mobile exec tsc --noEmit`, `npx expo export --platform
   android`, Playwright del ejecutor al cierre; QA del owner verde en web desktop, PWA móvil y device.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Regresión en los 104 programas `weekly` activos (63 coaches) | Test de equivalencia SQL con criterio 0 filas + parity tests + `resolveCycleCursor` weekly = identidad. |
| La racha de los alumnos de Movens «salta» de 0 a 6-8 al desplegar | Esperado: la racha es derivada, no se persiste. Se avisa al coach antes del deploy. |
| Borrado silencioso de `metadata` al re-guardar en web (`workout-log.actions.ts:166`, `?? null`) | Se corrige **antes** de habilitar la captura por lado; la cola offline web (`workout-offline-queue.ts:154`) ya reenvía `metadata` y pasa a recibirla también desde fuerza. |
| Residuos de campos del tipo anterior visibles al ampliar el SELECT de la ficha | R6 (`stripFieldsForType`) entra en el mismo tren; se cuenta el volumen de residuos con una query acotada en LIVE antes del deploy. |
| Los 2 ciclos activos con `ab_mode` | La variante se sigue resolviendo por semana calendario desde `start_date` (igual que hoy); se documenta, no se rediseña. |
| `start_date NULL` en un weekly flexible nuevo | Hero muestra «Empezar hoy»; racha por la regla 7; fases quietas. Los programas existentes quedan intactos (R2, default `?? false`). |
| Orden de salida deploy web ↔ migraciones ↔ OTA | Orden obligatorio (R35): **deploy web → migraciones → OTA**. Si RN sale antes, escribe `left_reps`/`right_reps` que el zod web todavía estripa al re-guardar. |
| Ventana entre el deploy web y las migraciones: la web ya está en producción y `client_start_workout_program` todavía no existe | Es la ventana que abre el orden obligatorio de R35 y es aceptada: el hero trata el error de la RPC como **estado, no como crash** (DATA-SECURITY §«`program_not_startable` como estado»), así que «Empezar hoy» falla suave y el alumno vuelve a ver su programa sin fecha. La ventana se cierra aplicando las cuatro migraciones inmediatamente después del deploy y antes de la OTA. |
| El cursor reinicia en Día 1 tras > 30 días sin logs | Ventana declarada del contrato; coincide con la lectura que ya hacen ambas plataformas. Alternativa (ampliar la ventana) queda en backlog. |
| El tren PWA sin commit arrastra los 4 puntos si viene rojo | Se corren los gates sobre el working tree **antes** de sumarlo al tren (W5 previa a W6). |
| Colisión de 4 waves en `packages/workout-engine/index.ts` (51 líneas de `export *`) | W0 aterriza el motor completo y bloquea a las demás; nadie más edita el barrel. |
| Los PR por e1RM se apagan en los 78 bloques `per_side/strength` reales con historial de reps sumadas (296 logs) | Aceptado y documentado (R3): el PR por peso sigue intacto; test de W0 con historial mixto (36 vieja / 10 nueva); aviso a los 11 coaches antes del deploy. |
| R2 deja `start_date` NULL y el guard de `program-assignment-notification.service.ts:123` apagaría el email **y** el push del alta hecha desde RN | `start_date` sale del guard y `buildProgramAssignedEmail` acepta fecha nula en el mismo tren; criterio de salida 6 (1 email + 1 push). |
| El anillo «Entrenos» derivaba el denominador por ISODOW también en `cycle` (`workoutAdherence30d.ts:72`) | `computeWorkoutScore30d` devuelve `score: null` en ciclo ⇒ los 3 consumidores pintan «—» + «Sin meta semanal» (R12); los 3 `it` weekly quedan sin editar como blindaje. |
| Un inicio con fecha distinta de hoy dejaría al alumno sin el estado «no empezó» y sin un estado «Empieza el <fecha>» que no existe | R14: no hay selector de fecha; la RPC acepta solo NULL u hoy y responde `start_date_out_of_range` en cualquier otro caso. Ambos quedan declarados como no-objetivo. |
| Flota mixta: clientes 1.1.2 que todavía no bajaron la OTA (`fallbackToCacheTimeout` puede arrancar con bundle viejo) | R35: escriben logs **sin** `metadata` (payload válido) y ven `reps_done` (= el lado más bajo) en los bloques por lado hasta actualizar. Se documenta en TESTING-QA y en el aviso a coaches; no bloquea el tren. |
