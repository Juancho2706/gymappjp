---
status: done
owner: product-engineering
last_verified: "2026-09-04"
canonical: false
---

# PLAN — Ciclo real, por lado en fuerza, ficha con tipo, Android/PWA

Ver [SPEC](SPEC.md) · [TASKS](TASKS.md) · [DATA-SECURITY](DATA-SECURITY.md). Un solo tren (D4): una
rama (`rnmobiledenuevo`, sin ramas extra), un deploy web, una OTA runtime **1.1.2** android+ios.
Sin columnas nuevas, sin DDL destructiva, sin dependencias nuevas, sin cambios nativos.
Esfuerzo total ≈ **14,5 días-agente** + QA del owner (R38: suman W0.2b, W2.10b, W3.7b, W3.x y la
4.ª migración).

Jerarquía que gobierna este archivo: `DECISIONS.md` (owner) > `OUTLINE-16-RESOLUCIONES.md` (R9–R40)
> `DECISIONS-2.md` > `OUTLINE.md` (§R y §13 Enmiendas) > este PLAN. Ningún worker reabre D1–D4 ni
R1–R40.

## Arquitectura (sin cambios de capa)

```text
packages/schemas/workout.ts        WorkoutLogSetSchema.metadata += left_reps, right_reps
        │
packages/workout-engine/           MOTOR PURO (sin React/Supabase/RN)
  cycle-completions.ts   (nuevo)   buildCycleCompletions({plans, blocksByPlan, logs, todayIso})  (R9)
  cycle-cursor.ts        (nuevo)   resolveCycleCursor(input) → … + programState                  (R30)
  program-day-label.ts   (nuevo)   programDayLabel(dayOfWeek, structure, cycleLength, {form})
  set-log-payload.ts               buildStrengthPayload(values, blockId, setNumber, ctx?)
  keypad-flow.ts                   pasos peso → izq → der en el carril NO tipado (fuerza)         (R18)
  logged-set-summary.ts            formatStrengthSetLine(log) → «20 kg × 10 / 10» | null          (R19)
  (export del motor)               sideRepsFromMetadata(metadata) → {left,right} | null           (R27)
  session-summary.ts               volumen con left+right (vía sideRepsFromMetadata)
  workout-exercise-type.ts         sideSuffix y SIDE_LABEL exportados (typedBlockSummary SIN cambio)
        │
packages/plan-builder/
  block-type-fields.ts   (nuevo)   stripFieldsForType(block, newType) · defaultBlockForType(type)
        │
        ├── apps/web   → queries/_data → services → actions → pantallas (Fable)
        └── apps/mobile→ lib/*        → hooks/estado    → pantallas (Fable)
        │
supabase/migrations/               4 CREATE OR REPLACE aditivos (misma firma y grants)           (R15)
  get_client_current_streak · client_start_workout_program (nueva) · get_client_daily_tonnage ·
  get_client_muscle_volume
```

Regla dura de arquitectura para las waves de producto (W2–W4): **el motor es el único dueño de la
semántica**. Web y RN no reimplementan cursor, `completions`, etiqueta de día, `programState`,
lectura de `metadata` ni cálculo de lados; consumen `@eva/workout-engine` y
`@eva/plan-builder`. El barrel `packages/workout-engine/index.ts:23-52` lo toca **solo W0** (evita las
colisiones de 4 writers que advirtió el crítico, `critics/completitud-w1.md` §3 S8).

## Waves — resumen

| Wave | Qué entra | Depende de | Días-agente | Modelo del worker | Gate de salida |
|---|---|---|---|---|---|
| W0 · Motor | `@eva/workout-engine` (+ `cycle-completions.ts`, W0.2b) + `@eva/plan-builder` + zod | — | 2,5 | **Opus** | `pnpm test` de los paquetes verde (12 casos de cursor + paridad weekly identidad) |
| W1 · DB | **4 migraciones** (R15) + test de equivalencia + validación LIVE | — (paralela a W0) | 1,5 | **Opus** | 0 filas de diff en clientes `weekly`; EXPLAIN sin regresión; ROLLBACK ejecutado |
| **M · Mockups** | 5 familias de pantallas (§7 del OUTLINE) | W0 (contratos), W1 (estados) | 0,5 | **Fable (jefe)** | **Aprobación explícita del owner por artifact** |
| W2 · Alumno web/PWA | Familias A + B + grillas Lun→Dom y anillo `null` en ciclo (W2.10b, R12) | W0, W1, M | 3 | Opus (datos) + **Fable (UI)** | vitest web + typecheck; «Día N de 3» y 10/10 en preview |
| W3 · Alumno RN | Familias A + B en RN + W3.7b + share RN (W3.x, R34) | W0, W1, M | 3 | Opus (datos) + **Fable (UI)** | `tsc --noEmit` mobile + `expo export --platform android` |
| W4 · Coach web + RN | Familias C + D + R5 + R6 | W0, M | 2,5 | Opus (datos) + **Fable (UI)** | vitest + typecheck + tsc mobile |
| W5 · PWA / working tree | Familia E + commit del tren SW/offline ya en working tree | — (paralela) | 0,5 | **Opus** | `tests/pwa-sw-navigation.test.ts` verde y suite completa sin rojos nuevos |
| W6 · Cierre | Gates completos, docs, QA del owner, deploy, OTA | W0–W5 | 1 | **Fable (jefe)** | Tabla de gates real + QA del owner verde en 3 plataformas |

Criterio de salida del tren (OUTLINE §8): **weekly con 0 diff** (racha SQL + parity tests), Movens ve
«Día N de 3» y racha > 0, «Remo a un brazo con kettlebell» registra 10 / 10.

---

## W0 · Motor compartido — 2,5 días-agente · **Opus**

**Objetivo.** Que toda la semántica nueva (cursor de ciclo, etiqueta de día, captura por lado) exista
como funciones puras testeadas ANTES de que web y RN la consuman. Bloquea W2, W3 y W4.

**Archivos exactos.**

| Archivo | Cambio |
|---|---|
| `packages/workout-engine/cycle-completions.ts` (nuevo, **W0.2b**) | `buildCycleCompletions({ plans, blocksByPlan, logs, todayIso }) → { completions: CycleCompletion[], inProgress?: { planId, dateIso } }`, reutilizando `countLoggedSetsByBlock`, `skippedBlockIdsFromLogs` y `deriveDayCompletion` (R9). Un plan **sin bloques no participa del cursor** (se salta; nunca es «hoy»). Es el único productor de `completions`: web y RN no lo reimplementan. |
| `packages/workout-engine/cycle-cursor.ts` (nuevo) | `resolveCycleCursor(input)` con el contrato del OUTLINE §2. `CycleCursorProgram` recibe `start_date` **y `start_date_flexible`**; `CycleCursorResult` agrega `programState: 'not_started' \| 'active'` (`not_started` ⇔ `start_date_flexible && start_date == null`) — hero web, hero RN y ficha del coach lo **leen de ahí y nadie lo re-deriva** (R30). Weekly = identidad (`day_of_week === ISODOW`), sin fechas implícitas. Regla: L = índice del último día completado (fecha más reciente; empate → mayor índice); hoy = `(L mod N) + 1`. La completitud se fecha por el **día Santiago del log** (`eva_santiago_day(logged_at)`; con «repetir el día» o `target_date`, manda `target_date`) y el cursor sigue la más reciente **por fecha, no por orden de inserción** (R11). Si no hay plan para el índice calculado, el cursor **salta al siguiente índice con plan** (DECISIONS-2 TESTING D3a); con `todayState='done'`, `todayPlanId` = el día hecho y `nextPlanId` = el siguiente (D3b). |
| `packages/workout-engine/program-day-label.ts` (nuevo) | `programDayLabel(dayOfWeek, structure, cycleLength, {form:'short'\|'long'\|'chip'})`. weekly → `Lun`/`Lunes`/**`Lun`** (el chip weekly conserva las 3 letras de hoy: el chip de 34 px no cambia para los 276 weekly, R31); cycle → `Día 1`/`Día 1 de 3`/`D1`. Soporta ciclos 1..14 (R8, corregido por R33). |
| `packages/workout-engine/set-log-payload.ts:217-234` | `buildStrengthPayload(values, blockId, setNumber, ctx?)`: con `ctx.sideMode ∈ per_side\|alternating` lee `reps_left`/`reps_right`, `repsDone = min(l, r)` (R3), `metadata {left_reps, right_reps}`. Sin `ctx` = comportamiento actual byte a byte. La rama `mobility` de `:121-130` no se toca. |
| `packages/workout-engine/keypad-flow.ts:28-45,78-86,123-134` | `STRENGTH_PER_SIDE_KEYPAD_STEPS` (peso → reps izq → reps der) + campo `sideMode` nuevo en `KeypadTarget` (`:28-45`). `keypadStepsForTarget` los devuelve en la rama **no tipada** (`:134`, hoy `[...STRENGTH_KEYPAD_STEPS]`) cuando `target.sideMode ∈ per_side\|alternating`. **`typedTargetFor` NO se toca**: sigue devolviendo `null` en strength (`:110`) y `TypedKeypadMode` sigue siendo `cardio\|mobility\|roller` (`typed-keypad.ts:16`). **Fuerza nunca entra al carril tipado**: si entrara, RN despacharía `buildTypedPayload` (`KeypadHost.tsx:230-232`, `SetRow.tsx:911-918`), que escribe `weightKg: null` (`set-log-payload.ts:191`) y `rir: null` (`:196`) ⇒ la serie por lado se guardaría sin peso ni RIR y el `ctx` por lado quedaría muerto (M2 del crítico). El commit sigue siendo `buildStrengthPayload(values, blockId, setNumber, ctx)`. |
| `packages/workout-engine/logged-set-summary.ts` | **`formatLoggedSetLine('strength')` SIGUE devolviendo `null`** (no se toca su contrato). Nuevo export `formatStrengthSetLine(log) → string \| null`: «20 kg × 10 / 10» **solo** cuando `metadata` trae los dos lados; si no, `null` (R19). Los 4 call sites (`LogSetForm.tsx:909-913`, `SetRow.tsx:450-454`, `TrainingTabB4Panels.tsx:776-783`, `AnalisisTab.tsx:631`) lo llaman **dentro de su rama de fuerza** y conservan over/under, «PC» y RPE/RIR. |
| `packages/workout-engine/` — helper único `sideRepsFromMetadata(metadata)` | `→ { left, right } \| null`: enteros 0..9999 **y cadenas de 1 a 4 dígitos** (paridad exacta con el regex `'^[0-9]{1,4}$'` del `reps_eff` SQL), si no `null` (R27). Único lector de `left_reps`/`right_reps` en TS; lo usan `session-summary.ts`, `apps/mobile/lib/workout-session.ts:418`, `build-share-data.ts` y los chips. **Sin CHECK en la columna**: la defensa es de lectura. |
| `packages/workout-engine/session-summary.ts` | volumen = `weight × (left + right)` vía `sideRepsFromMetadata`; si no hay lados, `reps_done`. |
| `packages/workout-engine/workout-exercise-type.ts:74-93` | exportar `sideSuffix` y `SIDE_LABEL` (`per_side` → «Por lado», `alternating` → «Alternado»), para que web borre su copia local de `WorkoutExecutionClient.tsx:308-311` (R39). **Prohibido** tocar `hasTypedPrescription` y `typedBlockSummary` (S3 del crítico: rompería la edición rápida en `ExerciseBlock.tsx:266-277` y metería resúmenes tipados en 195 bloques de fuerza). |
| `packages/workout-engine/index.ts:23-52` | tres `export *` nuevos (`cycle-completions`, `cycle-cursor`, `program-day-label`). **Único wave que edita el barrel.** |
| `packages/plan-builder/block-type-fields.ts` (nuevo) | `stripFieldsForType(block, newType)` (R6) y `defaultBlockForType(type)`, espejo de `apps/web/src/app/coach/builder/[clientId]/program-read-mappers.ts:167-205` (`createDefaultBlock`). `stripFieldsForType` limpia escribiendo **`null` explícito (nunca `undefined`)** en TODOS los campos polimórficos del tipo anterior según `packages/schemas/workout.ts` (`duration_sec`, `distance_value`, `distance_unit`, `hr_zone`, `interval_config`, `reps_value`, `reps_unit`, `target_pace_sec_per_km`, `load_value`, `load_unit`) y conserva `sets`, `rest_time`, `notes`, `superset_group`, `side_mode`, `instructions` (R32). |
| `packages/schemas/workout.ts:301-311` | `metadata` += `left_reps`, `right_reps` (int ≥ 0, nullable, opcionales). Zod v4 estripa lo no declarado: sin esto el lado no persiste. |

**No se toca** (R3 los protege y hay test que lo fija): `apps/web/src/lib/workout/progression.ts:207-211`
(`repsArr.every(r => r >= top)`) y `packages/workout-engine/pr-detect.ts:86-99` (`epleyOneRM`).
`packages/workout-engine/day-completion.ts` queda agnóstico de fechas.

**Dependencias.** Ninguna. Arranca junto con W1.

**Gate de salida.** `pnpm test` de los paquetes verde, con: ≥ 12 casos de `resolveCycleCursor`
(sin logs → Día 1 · completado hoy → `done` + `next` · en progreso → `in_progress` · wrap N→1 ·
empate de fecha → mayor índice · último completado fuera de la ventana de 30 d ⇒ **Día 1** (reinicio
explícito, sin persistencia, R10) · `start_date NULL` ⇒ `programState: 'not_started'` (R30) ·
plan sin bloques que se salta (R9) · registrar el Día 1 con fecha de **ayer** ⇒ hoy toca el Día 2, y
editar un día viejo **no** lo mueve de fecha (R11) · `cycle_length` 1, 2, 7 y 14 · weekly identidad),
labels en las 3 formas con **`form:'chip'` weekly = `Lun`** (R31), payload por lado (min, un solo
lado, sin `ctx`), `sideRepsFromMetadata` aceptando enteros 0..9999 **y cadenas de 1 a 4 dígitos** (paridad con el regex
`'^[0-9]{1,4}$'` de R27) y devolviendo `null` con basura (`-1`, `10.5`, `99999`, `'abc'`, un solo
lado),
`formatStrengthSetLine` sin lados ⇒ `null` y `formatLoggedSetLine('strength')` ⇒ `null` (R19),
round-trip de `stripFieldsForType` (R32), summary con y sin metadata, **un test de no-regresión que
fija que `progression.ts` y `pr-detect.ts` reciben el mismo `reps_done` que hoy**, y **un test que
fija que `typedTargetFor` sigue devolviendo `null` en un bloque strength con `side_mode = per_side`**
(blinda que fuerza no se cuele al carril tipado y termine en `buildTypedPayload`, R18).

---

## W1 · DB — 1,5 días-agente · **Opus** (paralela a W0)

**Objetivo.** Que la racha deje de dar 0 en programas `cycle`, que exista la RPC de «Empezar hoy» y
que el tonelaje **y el volumen por músculo** cuenten los dos lados — todo aditivo, misma firma y
mismos grants, en **4 migraciones** (R15).

**Archivos exactos.**

1. `supabase/migrations/20260903212441_streak_cycle_branch_and_null_start.sql` — `CREATE OR REPLACE FUNCTION
   public.get_client_current_streak(uuid)` sobre el linaje
   `supabase/migrations/20260723110000_streak_assigned_days_semantics.sql`. La CTE `progs` trae
   `program_structure_type` y `start_date`; rama `cycle` según **R1**: sin `assigned`, `+1` por día con
   ≥ 1 log del programa, corte **solo** por semana calendario Lun–Dom ya cerrada (America/Santiago)
   con cero logs; `start_date IS NULL` cae por la regla 7 existente, con guard explícito contra NULL.
   «Del programa» = enlace `block → plan`; los logs con `block_id NULL` son **neutros** (ni suman ni
   cortan), coherente con las reglas 4-5 de weekly (R29). El cuerpo `weekly` queda idéntico. Los batch
   `get_clients_streaks_by_ids` (`20260612054000_rpc_clients_streaks_by_ids.sql`) y
   `get_coach_clients_streaks` heredan sin tocarse.
2. `supabase/migrations/20260903212038_client_start_workout_program_rpc.sql` —
   `public.client_start_workout_program(p_program_id uuid, p_start_date date DEFAULT NULL)`
   **`RETURNS TABLE (start_date date, end_date date, started boolean)`** (R23), `SECURITY DEFINER`,
   `SET search_path = public`.
   - **Ventana: solo hoy** (R14). Acepta `p_start_date` NULL **o igual a hoy** (Santiago); cualquier
     otra fecha ⇒ `start_date_out_of_range`. No existe «Elegir otra fecha» ni el estado
     «Empieza el \<fecha\>» en este tren (backlog).
   - **Guard de pertenencia** (R40): el predicado es **exactamente el mismo** que usa la policy
     INSERT de `workout_logs` para el alumno (si esa policy admite `client_memberships` /
     `student_readable_client_ids`, la RPC también; si no, `client_id = auth.uid()`). La policy real
     se cita en `DATA-SECURITY.md`. Además: `is_active` AND `start_date_flexible` AND
     `start_date IS NULL`.
   - **Gate de cuenta pausada** (R17): llama `private.student_write_allowed(v_uid)` **antes** del
     `UPDATE` y lanza `coach_account_paused` (SQLSTATE `42501`).
   - Fija `start_date = COALESCE(p_start_date, eva_santiago_day(now()))` **y, en el mismo `UPDATE`,
     `end_date = start_date + (weeks_to_repeat * 7 - 1)`** — las dos columnas viajan juntas (R21, A2
     del crítico): `client-detail.service.ts:314` exige `start_date` **y** `end_date` para calcular
     semana y días restantes, así que fijar solo `start_date` dejaría el progreso del programa en 0.
   - **Idempotencia** (R28): `started = true` **solo cuando esta llamada escribió**. Si el `UPDATE`
     afecta 0 filas porque `start_date` ya estaba, devuelve la fecha existente con `started = false`;
     si afecta 0 filas por cualquier otra causa ⇒ `program_not_startable`.
   - **Grants** (R16): `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, service_role;` **antes** del
     `GRANT EXECUTE … TO authenticated`, y `has_function_privilege` inmediatamente después del
     `CREATE`. Mismo patrón en las **4** migraciones de este tren.
3. `supabase/migrations/20260903212700_daily_tonnage_side_metadata.sql` — `get_client_daily_tonnage`
   (linaje `supabase/migrations/20260612052000_rpc_client_progress_aggregations.sql`) pasa a usar el
   `reps_eff` **defensivo con regex** (R27, nunca `jsonb_typeof`):
   `CASE WHEN metadata->>'left_reps' ~ '^[0-9]{1,4}$' AND metadata->>'right_reps' ~ '^[0-9]{1,4}$'
   THEN (metadata->>'left_reps')::int + (metadata->>'right_reps')::int ELSE reps_done END`, y
   tonelaje = `weight_kg * reps_eff`. Misma firma y grants.
4. `supabase/migrations/20260903212800_muscle_volume_side_metadata.sql` — **cuarta migración** (R15):
   `CREATE OR REPLACE FUNCTION get_client_muscle_volume(uuid, integer)` con el **mismo `reps_eff`**
   del punto 3, reponiendo el REVOKE/GRANT del linaje `20260612052000:76-77`. Espejos TS alineados en
   `apps/mobile/lib/enterprise-profile-analytics.ts:131` (única ocurrencia en el repo; vive en
   `apps/mobile`, así que la congelación de `apps/enterprise` no lo alcanza) y
   `apps/mobile/lib/coach-client-detail.ts:755`.
5. `supabase/tests/streak_cycle_equivalence.sql` — **sin timestamp** (convención del repo, R25),
   harness de la casa (mismo patrón que `supabase/tests/nutrition_v2_sets_equivalence.sql` y
   `student_gate_equivalence.sql`). La función espejo del protocolo LIVE se llama **`_streak_next`**
   (nunca `get_client_current_streak_next`).

**Protocolo LIVE (no negociable, memoria `feedback_db_y_supabase`).** Función espejo **`_streak_next`**
(R25) en una transacción → diff contra la vigente sobre **todos** los clientes con logs → criterio duro
**0 filas con `estructura = 'weekly'`** → `EXPLAIN` de la rama nueva → `EXPLAIN (ANALYZE, BUFFERS)` de
`get_client_daily_tonnage` **antes y después** del `reps_eff` (R26: se acepta leer `metadata` fuera del
índice covering; si el tiempo sube más de **2×**, la migración `INCLUDE (metadata)` es **seguimiento,
no este tren**) → prueba con JWTs reales del alumno y de un tercero para la RPC 2 (IDOR) → caso de
**cuenta pausada** ⇒ `coach_account_paused` (R17) → `ROLLBACK`. Recién después se aplica la migración.

**Dependencias.** Ninguna. Sus resultados alimentan el mockup del hero (estado «no empezó»).

**Gate de salida.** Diff con 0 filas weekly; EXPLAIN sin plan peor que el actual (tonelaje < 2×); la
RPC 2 rechaza `auth.uid()` ajeno, rechaza **cualquier fecha que no sea hoy** con
`start_date_out_of_range` (R14), rechaza una cuenta pausada con `coach_account_paused` (R17),
devuelve `started = false` con la fecha existente si ya estaba y `program_not_startable` si no es
arrancable (R28), y deja `end_date = start_date + weeks_to_repeat * 7 - 1` en la misma fila del
`RETURNS TABLE` (test que lo verifique en el mismo harness); `has_function_privilege` confirma la ACL
final de `DATA-SECURITY.md` (R16 fija el patrón del REVOKE, no la ACL): `PUBLIC` y `anon` **sin**
EXECUTE en las **cuatro** funciones; `service_role` **sin** EXECUTE **solo** en
`client_start_workout_program` y **con** EXECUTE en `get_client_current_streak`,
`get_client_daily_tonnage` y `get_client_muscle_volume` (se re-grantea a propósito tras el REVOKE);
`ROLLBACK` ejecutado y registrado en
`DATA-SECURITY.md`.

---

## M · Mockups del jefe (Fable) — 0,5 días · **bloquea toda UI**

Regla de la casa: **mockup aprobado por el owner ANTES de construir**, diseñado contra el CÓDIGO
vivo (EVA DS, tokens, componentes existentes), con paridad web desktop + PWA móvil + RN en la misma
lámina. Cinco familias, ni una pantalla más (OUTLINE §7):

| Familia | Web móvil / PWA | Web desktop | RN |
|---|---|---|---|
| **A. Alumno Inicio** (ciclo + «Empezar hoy» + chip de tipo) | `dashboard/_data/heroComplianceBundle.ts:92-162`, `_components/program/ActiveProgramSection.tsx:49-121`, `_components/program/WorkoutPlanCard.tsx:20,117`, `_data/weekPendingWorkouts.ts:179-221`, `_components/momentum/MomentumCard.tsx:50-83`, `apps/web/src/lib/workout/workoutAdherence30d.ts:47-74` (este último es **capa de datos**, entra por W2 — acá solo define que en ciclo el anillo «Entrenos» pinta «—» con el rótulo «Sin meta semanal», R12) | `_components/desktop/DesktopDashboardHead.tsx:29-51` | `apps/mobile/app/alumno/(tabs)/home.tsx:163-190,350-412`, `components/alumno/home/ActiveProgramSection.tsx:109-117,446-449`, `components/alumno/home/WeekStrip.tsx`, `components/alumno/home/StreakRibbon.tsx:18-87` |
| **B. Ejecutor fuerza por lado** | `workout/[planId]/LogSetForm.tsx:211-216,780-798,909-913,1512-1527,2088-2121`, `workout/[planId]/SingleExerciseCard.tsx:392-455`, `workout/[planId]/v3/ExerciseStepV3.tsx:196-204` (fila de objetivo = chip «Por lado», R39), `v3/SupersetStepV3.tsx:323-356,512-560`, `WorkoutExecutionClient.tsx:308-311,354-406,965-972,1055-1078` (borra la copia local de `SIDE_LABEL` e importa la del motor) | mismo componente | `components/alumno/workout/SetRow.tsx:450-454,675-913`, `components/alumno/workout/SupersetGroupCard.tsx:295,428-429`, `components/alumno/workout/v3/ExerciseScreenV3.tsx:221-248,251,327-338`, `v3/ExecutorV3.tsx:555-557,562,649-651`, `v3/SessionCompleteV3.tsx`. **`TypedTargetGrid.tsx` NO cambia** (R39) |
| **C. Ficha coach → Programa** (tipo + Día N + próximo) | `coach/clients/[clientId]/ProgramTabB7.tsx:39,281-284,482-484,666,684-687`, `profileProgramUtils.ts:79-100`, `TrainingTabB4Panels.tsx:684-690,776-783` | mismo | `components/coach/clientDetail/PlanTab.tsx:32,253,268-278,471,554-555`, `OverviewTab.tsx:420-474`, `AnalisisTab.tsx:631`, `components/coach/programs/ProgramPreviewCard.tsx:85` + `program-model.ts:93,180-183` |
| **D. Builder «Lado» + toggle de inicio** | `coach/builder/[clientId]/components/BlockEditSheet.tsx:43-47,240,564-567,823-871`, `components/ExerciseBlock.tsx:272`, `components/StudentLivePreview.tsx:82`, `components/ProgramConfigForm.tsx`, `WeeklyPlanBuilder.tsx:186,1030-1035` | mismo | `components/coach/BlockEditorSheet.tsx:77-81,141-144,296-329,686`, `components/coach/BuilderBlockCard.tsx:163`, `components/coach/ProgramConfigSheet.tsx`, `app/coach/program-builder.tsx:82-88,236-237,1214,1558-1657` |
| **E. Invitar / instalar** | `apps/web/src/components/InstallPrompt.tsx:93-101` | — | `components/coach/InviteStudent.tsx:214`, `apps/web/src/lib/email/transactional-templates.ts:264-291` |

**Copys canónicos** (no se inventan variantes): «Día 1 de 3» · «Hoy toca» · «Empezar hoy» ·
«Tu programa está listo» · «Por lado» · «Alternado» · «Izq» · «Der» · «10 / 10» ·
«Sin meta semanal» (rótulo del anillo «Entrenos» en ciclo, R12) · «Empieza cuando quieras» (fila
«Inicio» del mail de programa asignado sin fecha, R20) · hint del builder «El alumno registra
izquierda y derecha en cada serie.» · invitar «Tu alumno entra desde el navegador con tu link o desde
la app en iOS. No necesita instalar nada.»

**Fuera del mockup por R14**: no se dibuja «Elegir fecha» / «Elegir otra fecha» ni el estado
«Empieza el \<fecha\>» — el único CTA es «Empezar hoy». **Por R39**, el chip «Por lado» / «Alternado»
va en la **fila de objetivo** de fuerza, no dentro de `TypedTargetGrid` (que no cambia).

**Gate de salida.** Un artifact por familia (o uno con 5 secciones) con estados vacíos, de carga y de
error, aprobado explícitamente por el owner. Sin esa aprobación, W2/W3/W4 hacen **solo** su capa de
datos.

---

## W2 · Alumno web / PWA — 3 días-agente · Opus (datos) + **Fable (UI)**

**Objetivo.** Que el alumno de un programa `cycle` vea «Día N de M», pueda empezar cuando quiera y
registre izquierda/derecha en fuerza, sin que un solo programa `weekly` cambie de comportamiento.

**Capa de datos y acciones — Opus.**

| Archivo | Cambio |
|---|---|
| `apps/web/src/services/workout/workout.service.ts:374-392,510,585,1023` | Con `start_date_flexible = true` **en un programa nuevo**, no estampa `start_date` (queda NULL); default del flag `?? false` (R2). **Guard obligatorio**: si el programa ya tiene `start_date`, se conserva — el camino actual `existing?.start_date || hoy` no puede convertirse en «vaciar» (S1 del crítico: 50 programas activos, 37 de ellos weekly). |
| `apps/web/src/services/workout/workout.service.ts:977-981` y `apps/mobile/lib/program-persistence.ts:89-103` | **`end_date` acompaña siempre a `start_date`** (A2 del crítico). Con `start_date` NULL, `end_date` también queda NULL. Hoy `end_date` se deriva de `start_date` en 3 sitios y **solo uno tiene guard**: `workout.service.ts:421-428` (`if (startDateToUse)`, ok); `:977-981` en `assignFromTemplate` hace `new Date(dateToUse)` **sin guard** (y `:1097` manda `dateToUse` al mail de programa asignado); y `resolveProgramScheduleMetadata` (`program-persistence.ts:99-103`) llama `addIsoCalendarDays`, que hace `isoYmd.split('-')` (`:84`) ⇒ `TypeError` con `null`. Cambios: guard en `:977-981` (sin fecha ⇒ `endDate = null`, R21) y `resolveProgramScheduleMetadata` devolviendo `{ startDate: null, endDate: null }` cuando el programa es flexible y no empezó. La RPC de W1 fija las dos columnas juntas. Test por sitio. |
| `apps/web/src/services/workout/program-assignment-notification.service.ts:123`, `buildProgramAssignedEmail` y `workout.service.ts:1093-1100` | **R20**: el aviso de programa asignado deja de **exigir** `start_date`. `buildProgramAssignedEmail` acepta `startDate: null` y la fila «Inicio» dice **«Empieza cuando quieras»**; la misma frase en el mail de `assignFromTemplate`. Test: «flexible sin fecha ⇒ 1 email + 1 push». |
| `apps/web/src/app/c/[coach_slug]/dashboard/_actions/start-program.actions.ts` (nuevo) | **`startWorkoutProgramAction({ coachSlug, programId })`** — objeto, **sin fecha** (R24 + R14: no hay «Elegir otra fecha» en este tren) → RPC `client_start_workout_program`. **El `coachSlug` es obligatorio en la firma** (SEC-06 del crítico): la ruta del hero es `/c/[coach_slug]/dashboard` y sin el slug la action no puede revalidarla — tras «Empezar hoy» el hero RSC seguiría diciendo «Empezar hoy». Revalida `revalidatePath('/c/' + coachSlug + '/dashboard')` + `revalidatePath('/c', 'layout')`, mismo patrón que `dashboard/_actions/dashboard.actions.ts:48-50` y `nutrition/_actions/intake.actions.ts:112-113` (todas las actions de esa carpeta reciben el slug explícito, `dashboard.actions.ts:17`). Usa el **gate tipado de `logSetAction`** (`workout-log.actions.ts:112-116`) para traducir `coach_account_paused` (R17). Evento `program_started_by_client {program_id, structure, via:'button'}` **solo cuando la RPC devuelve `started = true`** (R23). |
| `apps/web/src/app/c/[coach_slug]/workout/[planId]/_actions/workout-log.actions.ts:148-167` | `metadata` se escribe **solo si viene en el payload**: hoy `metadata: parsed.data.metadata ?? null` (`:166`) borra el jsonb al re-guardar. Se resuelve por **omisión de la key** (C8 del crítico); la fila per_side manda `{left_reps, right_reps}` explícitos, y para vaciar un lado manda el valor `null` dentro del objeto. Auto-start: si el programa del plan es flexible y tiene `start_date NULL`, llama la RPC una vez por sesión (`via:'auto'`). |
| `apps/web/src/lib/workout-offline-queue.ts:131-156` | El `FormData` ya reenvía `metadata` (`:154`), pero `LogSetForm.tsx:780-798` encola fuerza **sin** metadata: se agrega `left_reps`/`right_reps` al item encolado (H2 del crítico; si no, una serie por lado offline pierde los dos lados al drenar). |
| `apps/web/src/app/c/[coach_slug]/dashboard/_data/dashboard.queries.ts:86-103` | `getActiveProgram` += `program_structure_type, cycle_length, start_date_flexible`; los bloques += `exercise_type_override, exercises(exercise_type)` (chip de tipo en el hero). **No tocar** `getClientWorkoutPlans`. |
| `apps/web/src/app/c/[coach_slug]/dashboard/_data/dashboard.queries.ts` — `getRecentWorkoutLogs` | **Lectura única del cursor (R10)**, idéntica en web y RN: logs de los **últimos 30 días**, `select block_id, workout_blocks(plan_id), set_number, logged_at, metadata`, `order by logged_at desc`, `limit 200`. Alimenta `buildCycleCompletions`. Sin ningún día completado en la ventana ⇒ cursor = **Día 1** (reinicio explícito, sin persistencia): es **comportamiento documentado, no un riesgo**. **Forma real del select** (verificado en `:172`): `plan_id` no es columna de `workout_logs`, viaja por el join `workout_blocks(plan_id)`; `target_date` **tampoco es columna** (`offline-cache.ts:123-124`: «`target_date` no existe en `workout_logs` → PGRST204»; 0 hits en `supabase/migrations`) — hoy es metadato de la cola offline de RN (`tests/mobile-offline-cache-past-day-edit.test.ts:129-131`), así que la regla de fecha de R11 se resuelve con el `target_date` del ítem encolado y, en lectura, con `eva_santiago_day(logged_at)`. |
| `apps/web/src/app/c/[coach_slug]/dashboard/_data/heroComplianceBundle.ts:92-162` | `todayPlan` deja de resolverse por `p.day_of_week === todayDow` (`:101`) y pasa por `buildCycleCompletions` → `resolveCycleCursor`; `nextLabel` (`:150-162`) usa `programDayLabel` en modo cycle en vez de `DAY_NAMES`. El estado «no empezó» del hero se lee de `programState` del cursor, **no se re-deriva** (R30). |
| `apps/web/src/lib/workout/workoutAdherence30d.ts:47-74` (**W2.10b**) | **Anillo «Entrenos»** (B2 / M7 del crítico, resuelto por **R12**). Hoy `computeWorkoutScore30d` resuelve el plan de cada uno de los 30 días por `p.day_of_week === dow` (`:68-71`), así que un ciclo de 3 solo cuenta lun/mar/mié; el resultado entra por el **propagador** `heroComplianceBundle.ts:50,166,199` (la firma pasa a `number \| null`) a los **dos** puntos de render: `MomentumCard.tsx:92` y `_components/ComplianceScoresCard.tsx:14` → `_components/compliance/ComplianceRing.tsx:59,65,85`. Regla: en `program_structure_type === 'cycle'` **no hay meta semanal**, así que `score = null` y **esos tres sitios (propagador + los dos renders) pintan «—» con el rótulo «Sin meta semanal»**. `DesktopDashboardHead.tsx` **no** consume `workoutScore` (verificado: no lo menciona) y no entra en esta lista. No se inventa un denominador por cursor. `weekly` no cambia una línea. Meta semanal en ciclo = backlog (B1). Es tarea de **datos (Opus)**, no de UI. |
| `apps/web/src/app/c/[coach_slug]/dashboard/_components/momentum/MomentumCard.tsx:57-70` (**W2.10b**) | La tira `days` repite la resolución por `p.day_of_week === dDow` (`:64`) y diría «Día 2 de 3» sobre una semana Lun–Dom. En ciclo la tira **se mantiene Lun→Dom pero pasa a ser de «días entrenados»**: un punto por día con logs, **sin estados asignado/pendiente** (R12, mockup A). Aunque el archivo sea de pantalla, **esta parte va con la capa de datos** (M7): Fable solo ajusta la presentación. |
| `apps/web/src/app/c/[coach_slug]/dashboard/_data/weekPendingWorkouts.ts:179-221,354-370` (**W2.10b**) | En modo `cycle` devuelve **cero pendientes y cero recuperables**, y el `WorkoutRecoverBanner` **no se monta** (R12): en ciclo no existe día perdido. `weekly` conserva el bucle de 7 slots por fecha, byte a byte. |
| `apps/web/src/app/c/[coach_slug]/workout/[planId]/_data/substitution.queries.ts:47-76` | Trae `exercise_type_override` del bloque y filtra candidatos por **tipo efectivo** (R5); hoy filtra por `exercises.exercise_type` (`:76`) ignorando el override. |
| `apps/web/src/app/c/[coach_slug]/dashboard/_components/program/ActiveProgramSection.tsx:63-68` (**W2.9, reescrita por R33**) | En web **no existe** la aritmética `((dow-1)%7+7)%7` (eso es solo RN: `home.tsx:401` y `v3/weekly-streak.ts:198`). El colapso de los ciclos 8-14 está acá: `dayByDow` es un mapa de **7 entradas**, así que los días 8..14 se pisan. Se reemplaza por indexado por índice de ciclo 1..N y etiqueta vía `programDayLabel` (R8 corregido por R33). |

**Capa de pantalla — Fable, después del mockup aprobado.**

- Familia A: `_components/program/ActiveProgramSection.tsx:49-121` (day-cards = `slots`; sin
  `WorkoutRecoverBanner` en ciclo, `:109-117`, R12), `_components/program/WorkoutPlanCard.tsx:20,117`
  (`DAYS[dow-1]` → `programDayLabel`), `_components/momentum/MomentumCard.tsx:50-83` (tira Lun→Dom de
  días entrenados), `_components/desktop/DesktopDashboardHead.tsx:29-51` (hero desktop de la familia
  A; **no** consume `workoutScore`, así que no toca el anillo),
  `_components/ComplianceScoresCard.tsx:14` → `_components/compliance/ComplianceRing.tsx:59,65,85`
  («—» + «Sin meta semanal» con `score = null`, R12),
  `_components/streak/StreakRibbon.tsx:18-87` (copy y milestones bajo R1). Hero con los estados de
  OUTLINE §6 **sin** «Elegir fecha» y **sin** «Empieza el \<fecha\>» (R14).
  **Borrar** `_components/calendar/WeekCalendar.tsx` (R12; verificado sin ningún import: solo aparece
  en su propia definición y en comentarios de `MomentumCard.tsx:22,25` y `weekPendingWorkouts.ts:179`).
- Familia B: `LogSetForm.tsx:211-216,1512-1527,2088-2121` (dos campos de reps + un peso) y
  `:909-913` (línea de serie por `formatStrengthSetLine`, dentro de la rama de fuerza, conservando
  over/under, «PC» y RPE/RIR, R19), `SingleExerciseCard.tsx:392-455`,
  `v3/ExerciseStepV3.tsx:196-204` (chip «Por lado»/«Alternado» en la **fila de objetivo**, con
  `SIDE_LABEL[side_mode]` importado del motor, R39), `v3/SupersetStepV3.tsx:323-356,512-560`,
  `WorkoutExecutionClient.tsx:308-311,354-406,965-972,1055-1078` (borra la copia local de `SIDE_LABEL`).
  **`TypedTargetGrid` no cambia y fuerza sigue fuera del carril tipado** (R18, R39).

**Dependencias.** W0 (motor), W1 (RPC 2), M (mockup aprobado para la capa de pantalla).

**Gate de salida.** `pnpm exec vitest run <rutas de los dominios tocados>` (o
`pnpm exec vitest run --project web-node`; **no existe** un gate `--filter @eva/web` con vitest: el
script raíz es `"test": "vitest"` en `package.json:14`, `apps/web` no tiene script `test` ni
`vitest.config`, y el aislamiento va por ruta o por `--project`) + `pnpm typecheck`; `weekPendingWorkouts.test.ts` verde sin editar sus casos weekly; test nuevo de
`heroComplianceBundle` (hoy **no tiene par de test**, H9 del crítico); test nuevo de
`computeWorkoutScore30d` en modo `cycle` (**`score = null` siempre**, R12) **sin editar los 3 `it`
weekly de `apps/web/src/lib/workout/workoutAdherence30d.test.ts:5,17,43`**, que quedan como blindaje;
test de `weekPendingWorkouts` en ciclo con **cero pendientes y cero recuperables** (R12); y test de
`startWorkoutProgramAction({ coachSlug, programId })` que verifica el path revalidado exacto (R24) y
la traducción de `coach_account_paused` (R17).

---

## W3 · Alumno RN — 3 días-agente · Opus (datos) + **Fable (UI)**

**Objetivo.** Paridad exacta con W2 en la app, saliendo por OTA 1.1.2.

**Capa de datos — Opus.**

| Archivo | Cambio |
|---|---|
| `apps/mobile/lib/start-program.ts` (nuevo) | **`startWorkoutProgram(programId)`** — sin fecha (R24 + R14) → RPC `client_start_workout_program`, que devuelve `{ start_date, end_date, started }` (R23) + `captureAppEvent('program_started_by_client')` **solo con `started = true`**. Traduce `coach_account_paused` (R17) y `start_date_out_of_range` / `program_not_startable` (R14, R28). |
| `apps/mobile/lib/workout-session.ts:418,940,1058-1067` | Auto-start en el primer `logSet` si el programa es flexible con `start_date NULL`; la cola offline lleva `metadata {left_reps, right_reps}`; `:418` lee los lados **solo** por `sideRepsFromMetadata` (R27). |
| `apps/mobile/lib/offline-cache.ts:33-45` | El tipo encolado admite los dos lados (hoy solo `left_sec`/`right_sec`). |
| `apps/mobile/app/alumno/(tabs)/home.tsx:163-167` | El select del programa += `program_structure_type, cycle_length, start_date_flexible`. |
| `apps/mobile/app/alumno/(tabs)/home.tsx:172-179` (**W3.7b**) | Hoy la lectura de 30 días trae solo fechas. **RN restaura las columnas y usa la MISMA lectura que web** (R10): `select block_id, workout_blocks(plan_id), set_number, logged_at, metadata`, `order by logged_at desc`, `limit 200`, últimos 30 días — con la misma forma real que web: el `plan_id` viaja por el join `workout_blocks(plan_id)` y la fecha de R11 sale de `eva_santiago_day(logged_at)` en lectura y del `target_date` del ítem encolado en escritura (`target_date` no es columna de `workout_logs`). No se inventa una lectura distinta ni se amplía el límite: la ventana es la misma en las dos plataformas y alimenta `buildCycleCompletions`. |
| `apps/mobile/app/alumno/(tabs)/home.tsx:350,400-412` + `components/alumno/home/types.ts:38-47` | `derived` pasa por `buildCycleCompletions` → `resolveCycleCursor`; el hero lee `programState` del cursor (R30); el contrato del dashboard suma los campos nuevos. **`home.tsx:401`**: fuera la aritmética `((dow-1)%7+7)%7` (R8, ubicación fijada por R33). |
| `apps/mobile/components/alumno/workout/v3/weekly-streak.ts:94-103,171-201` | **`:198`**: fuera la aritmética `((dow-1)%7+7)%7` (R8/R33 — junto con `home.tsx:401` son los **únicos dos** sitios donde existe; en web el problema es otro, ver W2.9); `plannedDatesForWeek`/`planSlotDate` no aplican en ciclo. La tira de racha del ejecutor queda Lun→Dom de **días entrenados**, sin estados asignado/pendiente (R12). |
| `apps/mobile/components/alumno/share/build-share-data.ts` (**W3.x**) | **R34**: usa `sideRepsFromMetadata`; volumen = `peso × (izq + der)`; top set y `repsAtMax` siguen con `reps_done`. |
| `apps/mobile/lib/workout/substitution.ts:236-284` | Filtro por tipo efectivo (R5), espejo de web. |

**Capa de pantalla — Fable, después del mockup aprobado.**
`components/alumno/home/ActiveProgramSection.tsx:109-117,446-449`, `home/WeekStrip.tsx`,
`home/MomentumCard.tsx`, `home/StreakRibbon.tsx:18-87` (familia A);
`components/alumno/workout/SetRow.tsx:450-454,675-913` y
`components/alumno/workout/KeypadHost.tsx:230-232` (el `commit` sigue eligiendo
`buildStrengthPayload` en fuerza — `SetRow.tsx:911-918` —; lo que cambia es el `ctx` por lado y los
pasos del teclado, nunca la rama `typedMode`, M2),
`components/alumno/workout/SupersetGroupCard.tsx:295,428-429`,
`components/alumno/workout/v3/ExerciseScreenV3.tsx:221-248,251,327-338`,
`v3/ExecutorV3.tsx:555-557,562,649-651` (el aviso deliberado «pasarlo borraría el hold guardado» se
levanta **solo** en la rama strength), `v3/SessionCompleteV3.tsx` (familia B).
El chip «Por lado»/«Alternado» va en la **fila de objetivo** (`ExerciseScreenV3.tsx:327-338`,
`SupersetGroupCard.tsx:428-429`) con `SIDE_LABEL[side_mode]` del motor: **`TypedTargetGrid.tsx` no se
toca** (R39). La línea de serie de `SetRow.tsx:450-454` pasa por `formatStrengthSetLine` dentro de su
rama de fuerza (R19).

**Dependencias.** W0, W1, M. Paralela a W2 salvo el contrato del motor.

**Gate de salida.** `pnpm --filter @eva/mobile exec tsc --noEmit` y
`pnpm --filter @eva/mobile exec expo export --platform android` verdes; `tests/mobile/*` sin rojos;
sin dependencias nativas nuevas (el tren debe caber en OTA 1.1.2).

---

## W4 · Coach web + RN — 2,5 días-agente · Opus (datos) + **Fable (UI)**

**Objetivo.** Que la ficha del alumno diga la verdad (tipo efectivo + «Día N de M») y que el builder
deje de guardar residuos ni ofrecer opciones muertas.

**Capa de datos — Opus.**

| Archivo | Cambio |
|---|---|
| `apps/web/src/services/client/client-detail.service.ts:81-95` | El SELECT del programa activo += `exercise_type_override, duration_sec, distance_value, distance_unit, hr_zone, interval_config, reps_value, reps_unit, side_mode` y `exercises ( …, exercise_type, cardio_modality )`. Hoy trae solo `sets, reps, rest_time, notes, target_weight_kg, tempo, rir, superset_group` ⇒ la ficha imprime «Series × reps» para todo. |
| `apps/mobile/lib/coach-client-detail.ts:806-815,142-157,952-967` | Mismo SELECT + DTO `ProgramBlock` con los campos tipados y `side_mode`. |
| Espejos TS del `reps_eff` (**R15**): `apps/mobile/lib/coach-client-detail.ts:755` y `apps/mobile/lib/enterprise-profile-analytics.ts:131` | Alinean el volumen por músculo con la 4.ª migración, leyendo los lados **solo** por `sideRepsFromMetadata` (R27). |
| `packages/plan-builder/block-type-fields.ts` (de W0) cableado en `apps/web/src/app/coach/builder/[clientId]/components/BlockEditSheet.tsx:564-567` y `apps/mobile/components/coach/BlockEditorSheet.tsx:141-144` | R6 + **R32**: cambiar el tipo de un bloque limpia al instante los campos del tipo anterior escribiendo **`null` explícito** (nunca `undefined`), sin diálogo; se conservan `sets`, `rest_time`, `notes`, `superset_group`, `side_mode`, `instructions`. **Se aplica antes o junto con ampliar el SELECT**, o los residuos se vuelven visibles. Test de round-trip en `apps/mobile/lib/plan-builder/serialize.ts`. |
| `apps/mobile/components/coach/ExerciseSearchSheet.tsx:149-150` y `app/coach/program-builder.tsx:82-88` | `defaultBlockForType` — un ejercicio agregado en RN deja de nacer siempre `strength`. |
| `apps/web/src/app/coach/builder/[clientId]/WeeklyPlanBuilder.tsx:186` y `apps/mobile/app/coach/program-builder.tsx:1214` | Default del toggle de inicio flexible a **false** (R2); hoy `useState(initialProgram?.start_date_flexible ?? true)`. Alcance **R13**: aplica a `weekly` **y** `cycle`, y **solo** los programas creados o asignados DESPUÉS del deploy con el flag en `true` nacen con `start_date NULL`; los 50 activos que hoy tienen el flag conservan su fecha y nunca ven «Empezar hoy». |
| `apps/mobile/components/coach/programs/program-model.ts:93,180-183` | `dayLabel` pasa a `programDayLabel`. En `form:'chip'` **weekly sigue devolviendo `Lun`/`Mar`… (3 letras, igual que hoy)** — el chip de 34 px no cambia para los 276 weekly (R31) — y cycle devuelve `D1`, `D2`…; de paso deja de escribir «Mie»/«Sab» sin tilde. Consumidor real: `components/coach/programs/ProgramPreviewCard.tsx:85` (biblioteca RN, exigido por D1 y no mapeado en W1 — H1 del crítico). |
| `apps/web/src/app/coach/clients/[clientId]/profileProgramUtils.ts:79-100` | `isToday` (`:87` y `:98`) marca «Hoy» por coincidencia numérica: con `cycle_length = 3`, el lunes ilumina el día 1. En ciclo se resuelve por cursor o se apaga. |
| `apps/mobile/components/coach/InviteStudent.tsx:214` y `apps/web/src/lib/email/transactional-templates.ts:264-291` | Copy: fuera «Tu alumno baja EVA…»; entra el copy canónico. Guard: caso nuevo en `tests/mobile/client-invite-copy.test.ts` o regla eslint local (precedente: `tools/eslint-rules/rules/store-plan-caption.mjs`). |

**Capa de pantalla — Fable, después del mockup aprobado.** Familias C y D:
`ProgramTabB7.tsx:281-284,482-484,666,684-687`, `TrainingTabB4Panels.tsx:684-690,776-783`,
`PlanTab.tsx:253,268-278,471,554-555`, `OverviewTab.tsx:420-474`, `AnalisisTab.tsx:631`,
`BlockEditSheet.tsx:823-871` (selector «Lado» = `null | per_side | alternating`; `bilateral`
desaparece, R4), `BlockEditorSheet.tsx:296-329`, `ExerciseBlock.tsx:272`,
`StudentLivePreview.tsx:82`, `BuilderBlockCard.tsx:163`, `ProgramConfigForm.tsx` /
`ProgramConfigSheet.tsx` (copy del toggle; **sin prometer elegir fecha**, R14).
`TrainingTabB4Panels.tsx:776-783` y `AnalisisTab.tsx:631` son **2 de los 4 call sites de
`formatStrengthSetLine`** (R19): lo llaman dentro de su rama de fuerza y conservan over/under, «PC» y
RPE/RIR. En modo `cycle` las etiquetas son «Día N de M» en todas estas superficies, **nunca
Lun/Mar/Mié** (D1).

**Dependencias.** W0 y M. No depende de W1.

**Gate de salida.** vitest + `pnpm typecheck` + `tsc --noEmit` mobile; consulta acotada en LIVE que
cuente bloques con residuos de otro tipo **antes** del deploy (riesgo §10 del OUTLINE).

---

## W5 · PWA / working tree — 0,5 días-agente · **Opus** (paralela)

**Objetivo.** Cerrar el tren de offline/service worker que ya está en el working tree y adelantar el
prompt de instalar a día 1 en Android, sin ser invasivo.

**Archivos exactos.**

- Commit del tren ya presente sin commitear: `apps/web/public/sw.js` (`NAV_TIMEOUT_MS`,
  `!res.redirected`, `eva-nav-v5`), `apps/web/src/components/client/OfflineScreen.tsx` (+ su test),
  `apps/web/src/lib/client/clear-client-caches.ts` (+ su test), `tests/pwa-sw-navigation.test.ts`,
  `apps/web/src/components/client/ClientNav.tsx`,
  `apps/web/src/app/c/[coach_slug]/layout.tsx`,
  `apps/web/src/app/c/[coach_slug]/_components/DemoViewerExit.tsx`,
  `apps/web/src/app/c/[coach_slug]/perfil/_components/ProfileClient.tsx`,
  `apps/web/src/app/c/[coach_slug]/suspended/_components/SuspendedSignOutButton.tsx`.
  Requisito: el test debe **derivar los nombres de caché desde `sw.js`**, no hardcodearlos.
- `apps/web/src/components/InstallPrompt.tsx:93-101`: el gate `hasCompletedFirstWorkout()` (`:97`)
  pasa a día 1 en Android Chrome cuando hay `beforeinstallprompt` (`canPrompt`), con *dismiss* de
  30 días. Verificar contra `apps/web/src/lib/pwa/install-signals.ts` y el call site
  `WorkoutExecutionClient.tsx:2065` que no queden **dos** prompts (S9 del crítico).
  Evento `pwa_install_prompt_shown {platform, day1}`.

**Dependencias.** Ninguna, pero **se commitea temprano**: si sus gates vienen rojos, arrastra los 4
puntos del feedback (S10 del crítico).

**Gate de salida.** `pnpm test` sin rojos nuevos y `tests/pwa-sw-navigation.test.ts` verde.

---

## W6 · Cierre — 1 día-agente · **Fable (jefe)**

**Objetivo.** Gates reales, documentación, QA del owner en las 3 plataformas, deploy y OTA.

Contenido: tabla de gates ejecutados de verdad, Playwright del ejecutor **solo al cierre**
(`pnpm test:e2e`, 1 navegador), docs (`docs/status/CURRENT.md` ≤ 16 KB —
`scripts/check-docs.mjs:117-119` —, `docs/status/MOBILE_PARITY.md`,
`docs/specs/workout-day-in-progress/SPEC.md:23-25` que hoy afirma lo contrario del tren, esta SDD a
`implemented-pending-qa`), memoria del owner, y la salida en el **orden obligatorio de R35: deploy
web → migraciones → OTA** 1.1.2 android+ios por `.github/workflows/mobile-ota.yml` (nunca a mano).
Antes de la OTA, el aviso a los coaches afectados cubre los dos efectos aceptados: la **flota mixta**
(clientes 1.1.2 sin la OTA escriben logs sin metadata —válido— y ven `reps_done` en bloques por lado
hasta actualizar; con `fallbackToCacheTimeout` puede arrancar con bundle viejo, R35) y el **PR por
e1RM que puede no dispararse** en bloques `per_side` con logs viejos sumados —el PR por peso sigue—
(R22, 11 coaches).

## Gates (proporcionales, todos antes del push)

| Gate | Comando |
|---|---|
| Tests | `pnpm test` (vitest, suite completa) |
| Typecheck web | `pnpm typecheck` |
| Typecheck mobile | `pnpm --filter @eva/mobile exec tsc --noEmit` |
| Bundle mobile | `pnpm --filter @eva/mobile exec expo export --platform android` |
| Lint | `pnpm lint` (incluye `apps/mobile` con `eslint.mobile.config.mjs`) |
| Tokens | `pnpm check:tokens` |
| Docs | `pnpm docs:check` (incluye el tope de 16 KB de `CURRENT.md`) |
| E2E | `pnpm test:e2e` del ejecutor, **solo al cierre**, 1 navegador |
| SQL | diff de equivalencia con 0 filas weekly + `EXPLAIN` + `ROLLBACK` (W1) |

## QA del owner (solo contra algo desplegado)

Tres plataformas, casos concretos de Movens; el detalle por caso está en
[TASKS](TASKS.md) § «QA del owner».

- **Web desktop** (light/dark): ficha del alumno → pestaña Programa de «Performance Coto» (ciclo 3).
- **PWA móvil** (390 px, Android Chrome): Inicio del alumno, «Empezar hoy», ejecutor por lado,
  prompt de instalar día 1.
- **RN device**: mismo recorrido tras aplicar la OTA 1.1.2.

**Control weekly obligatorio (R37).** El ítem «**un programa `weekly` de otro coach se ve exactamente
igual**» se repite en los **cuatro** bloques de QA: alumno web, alumno RN, ficha del coach y builder.
Es el criterio duro de no-regresión, no un chequeo opcional.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Regresión en los 104 programas `weekly` activos (63 coaches) | `resolveCycleCursor` weekly = identidad + test de equivalencia SQL con criterio duro «0 filas weekly» + parity tests existentes. |
| El próximo guardado del coach **vacía** `start_date` de 50 programas activos (37 weekly) | R2 es opt-in y el servicio conserva la fecha existente; test de `workout.service` que fije «programa con fecha → conserva fecha» (S1 del crítico). |
| La racha «salta» de 0 a 6-8 al desplegar en los alumnos de Movens | Esperado y no persistido; se avisa al coach. Los copys y `MILESTONES` de `StreakRibbon` se revisan en W2/W3 bajo R1 (H4 del crítico). |
| Borrado de `metadata` al re-guardar en web (`workout-log.actions.ts:166`) | Se corrige en W2 **antes** de habilitar los lados en la UI. |
| Serie por lado registrada offline en web pierde los dos lados al drenar | `LogSetForm.tsx:780-798` encola `left_reps`/`right_reps` (H2). |
| `reps_done` por lado rompe la doble progresión o el PR | R3 (`min` de los lados) los deja intactos; test de no-regresión en W0 (H3). **R22 acepta el residuo**: en bloques `per_side` con logs viejos sumados el PR por **e1RM** puede no dispararse (el PR por peso sigue); va en el aviso a los 11 coaches afectados y en los riesgos del SPEC. |
| El anillo «Entrenos» y la tira Momentum siguen contando por ISODOW y el hero queda incoherente con el cursor | **R12**: en ciclo el anillo es `score = null` («—» + «Sin meta semanal», firma `number \| null`) y la tira Lun→Dom pasa a «días entrenados»; `weekPendingWorkouts` devuelve cero pendientes/recuperables y `WorkoutRecoverBanner` no se monta. Test de `computeWorkoutScore30d` en cycle sin tocar los 3 casos weekly (B2 / M7). |
| Sin ningún día completado en la ventana de 30 d el cursor «se resetea» al Día 1 | **R10**: es comportamiento documentado, no un riesgo — reinicio explícito, sin persistencia, con la misma lectura en web y RN (`block_id, workout_blocks(plan_id), set_number, logged_at, metadata`, `limit 200`). |
| El tonelaje se pone lento al leer `metadata` fuera del índice covering | **R26**: se acepta; el protocolo LIVE mide `EXPLAIN (ANALYZE, BUFFERS)` antes/después y solo si sube más de 2× se agenda `INCLUDE (metadata)` como **seguimiento, fuera de este tren**. |
| `end_date` queda desalineado con `start_date` (progreso del programa en 0, o `TypeError` al guardar) | `end_date` acompaña siempre a `start_date`: guard en `workout.service.ts:977-981`, `resolveProgramScheduleMetadata` devolviendo `{null, null}` y la RPC fijando las dos columnas en el mismo `UPDATE` (A2). |
| Tras «Empezar hoy» el hero RSC no se refresca | `startWorkoutProgramAction({ coachSlug, programId })` revalida `'/c/' + coachSlug + '/dashboard'` + `/c` layout; el test verifica el path exacto (SEC-06, R24). |
| Una cuenta de coach pausada deja al alumno escribir `start_date` | **R17**: la RPC llama `private.student_write_allowed(v_uid)` antes del `UPDATE` y lanza `coach_account_paused` (42501); el action web lo traduce con el gate tipado de `logSetAction` (`workout-log.actions.ts:112-116`). Caso en el protocolo LIVE. |
| La RPC queda ejecutable por `service_role` o `PUBLIC` | **R16**: `REVOKE ALL … FROM PUBLIC, anon, service_role` antes del `GRANT … TO authenticated`, y `has_function_privilege` inmediatamente después del `CREATE`, en las **4** migraciones. La ACL final está en `DATA-SECURITY.md`: `service_role` queda sin EXECUTE **solo** en `client_start_workout_program`; en racha, tonelaje y volumen se re-grantea a propósito. |
| `metadata` con basura rompe el tonelaje o el volumen | **R27**: en SQL, `reps_eff` con regex `'^[0-9]{1,4}$'` (nunca `jsonb_typeof`); en TS, un único `sideRepsFromMetadata` (enteros 0..9999 y cadenas de 1 a 4 dígitos, misma paridad; si no, `null`). **Sin CHECK en la columna.** |
| Residuos de otro tipo visibles al ampliar el SELECT de la ficha | R6 entra en el mismo wave; consulta de conteo en LIVE antes del deploy. |
| Desfase deploy web ↔ migraciones ↔ OTA (flota mixta) | **R35**, orden obligatorio: **deploy web → migraciones → OTA**. Los clientes 1.1.2 sin la OTA escriben logs sin metadata (válido) y ven `reps_done` en bloques por lado hasta actualizar; `fallbackToCacheTimeout` implica un arranque con bundle viejo. Se documenta en TESTING-QA y en el aviso a coaches; **no bloquea** (S5 del crítico). |
| El tren PWA del working tree llega rojo al commit común | W5 se cierra temprano y con su gate propio. |
| Ciclos con `ab_mode` (2 activos) | La variante sigue por semana calendario desde `start_date`; documentado, no se rediseña. |

## Backlog heredado (no bloquea este tren)

| # | Deuda | Dónde |
|---|---|---|
| B0 | **«Elegir otra fecha»** al empezar un programa flexible: R14 lo saca del tren (la RPC solo acepta hoy y devuelve `start_date_out_of_range` para cualquier otra fecha). No existe el estado «Empieza el \<fecha\>». | RPC + hero web/RN |
| B1 | Meta semanal de sesiones en programas `cycle` (D1 la deja fuera; por R12 el anillo «Entrenos» queda en `null` / «Sin meta semanal» hasta que exista). | motor + racha |
| B2 | Pesos distintos por lado (`left_weight`/`right_weight`): D2 fija un solo peso; **no** declarar el campo «por las dudas» (sería otro control muerto). | `packages/schemas/workout.ts` |
| B3 | ~~Editar o repetir un día pasado mueve el cursor: falta regla escrita.~~ **Cerrado por R11**: la completitud se fecha por el día Santiago del log (con «repetir el día» o `target_date`, manda `target_date`) y el cursor sigue la más reciente **por fecha**, no por inserción — entra en W0.2 (una línea + test). | `workout-log.actions.ts:66-69,120-128`, `apps/mobile/lib/workout-executor-nav.ts:62-68` |
| B4 | `get_workout_program_planned_set_totals` con `EXECUTE` a `PUBLIC`. | `supabase/migrations` |
| B5 | `is_unilateral` sigue muerta en `packages/plan-builder/types.ts`. | plan-builder |
| B6 | Bloques con `sets: 6` pensados como «3 por lado» (sobre-prescripción heredada, sin contar). | datos LIVE |
| B7 | Actividad externa / yoga como tipo nuevo · Play a producción · Cobros coach→alumno · Share de entreno web. | fuera de alcance del owner |
