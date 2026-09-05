---
status: done
owner: product-engineering
last_verified: "2026-09-04"
canonical: false
---

# TASKS — Ciclo real, por lado en fuerza, ficha con tipo, Android/PWA

Ver [SPEC](SPEC.md) · [PLAN](PLAN.md). Un solo tren (D4): rama `rnmobiledenuevo`, un deploy web, una
OTA runtime **1.1.2** android+ios. Cada tarea es de **≤ 1 día-agente** y tiene aceptación
verificable; el total del tren es de **≈ 14,5 días-agente** (R38: las tareas nuevas W0.2b, W2.10b,
W3.7b, W3.x y la 4.ª migración W1.5b se absorben acá; nada pasa a no-objetivo). Modelo por tarea:
**Opus** salvo las marcadas **[UI · Fable]**, que las implementa el jefe **después** del mockup
aprobado por el owner (regla de la casa), y las de cierre.

Convención de estado: `[ ]` pendiente · `[x]` hecha. Nada se marca verde sin ejecución real.

## W0 · Decisiones del owner (2026-09-03)

- [x] W0.0 D1 ciclo = cursor por completitud · D2 por lado = dos reps + un peso · D3 inicio flexible
      real · D4 un solo tren (`DECISIONS.md`).
- [x] W0.0b Resoluciones del jefe R1–R8 (`OUTLINE.md` §R): racha de ciclo sin cursor en SQL ·
      flexible opt-in y solo para programas nuevos · `reps_done = min(izq, der)` · `alternating`
      igual que `per_side` y `bilateral` fuera · «Cambiar ejercicio» por tipo efectivo · cambiar tipo
      limpia campos · 3 eventos de analítica · ciclos hasta 14 días con el mismo helper.
- [x] W0.0b2 Resoluciones del jefe R9–R40 (`OUTLINE-16-RESOLUCIONES.md`, enmiendas en `OUTLINE.md`
      §13): productor `cycle-completions.ts` · ventana de logs única web/RN (30 d, `limit(200)`) ·
      completitud fechada por el día Santiago de `logged_at` · grillas Lun→Dom = días entrenados y anillo
      «Entrenos» `null` en ciclo · «Empezar hoy» como única acción (sin «Elegir otra fecha») · RPC
      `RETURNS TABLE (start_date, end_date, started)` con gate de cuenta pausada y REVOKE incluyendo
      `service_role` · fuerza fuera del carril tipado con `formatStrengthSetLine` y chip en la fila de
      objetivo · 4 migraciones · `programState` en el cursor.
- [x] W0.0c Confirmación del owner (2026-09-03, tras el mensaje final del plan): **R1 = A** (semana
      Lun–Dom vacía como único corte de racha) · **R2 = A** (flexible opt-in, default `false`, solo
      programas nuevos) · **R3 = A** (`reps_done = min`, tonelaje suma) · **M1 = A** (solo «Empezar
      hoy») · **M2 = A** (sin «Día de descanso» en ciclo). Condición única del owner: la UI se
      **asimila al estilo ya existente** (componentes, tokens y patrones del EVA DS que están en el
      código; los mockups se transcribieron de ahí), sin estética nueva.

## W0 · Motor compartido (`@eva/workout-engine`, `@eva/plan-builder`, `@eva/schemas`)

- [x] W0.1 `packages/schemas/workout.ts:301-311`: `WorkoutLogSetSchema.metadata` += `left_reps` y
      `right_reps` (int ≥ 0, nullable, opcionales), junto a `left_sec`/`right_sec`/`skipped`/
      `skip_reason`. **Aceptación**: caso en `packages/schemas/workout.test.ts` que parsea
      `{left_reps: 10, right_reps: 8}` sin estriparlo y rechaza `-1`.
- [x] W0.2 `packages/workout-engine/cycle-cursor.ts` (nuevo): `resolveCycleCursor(input)` con el
      contrato del OUTLINE §2 + §13 (`mode`, `todayPlanId`, `todayCycleIndex`, `todayState`,
      `nextPlanId`, `nextCycleIndex`, `lastCompleted`, `slots`). `CycleCursorProgram` recibe además
      `start_date` y `start_date_flexible`, y el resultado agrega
      `programState: 'not_started' | 'active'` (`not_started` ⇔ `start_date_flexible &&
      start_date == null`): hero web, hero RN y ficha del coach lo **leen de ahí** y nadie lo
      re-deriva (R30). La completitud se fecha por el **día Santiago de `logged_at`**
      (`eva_santiago_day`), que es la única fecha disponible en la lectura —`workout_logs` **no** tiene
      columna `target_date`; el `target_date` del ítem encolado manda en la **escritura** de la serie y
      allí sólo conmuta el modo solo-UPDATE sobre la fila de ese día, cuyo `logged_at` ya cae en esa
      fecha (`workout-log.actions.ts:120-125`, R11)—, y el cursor sigue la más reciente **por
      fecha**, no por orden de
      inserción (R11). Si el índice calculado no tiene plan, el cursor **salta al siguiente índice con
      plan** (los planes sin bloques no participan, R9). Pura, sin `Date.now()`. **Aceptación**: 12
      casos verdes — sin logs → Día 1 · completado hoy → `todayState='done'` con `todayPlanId` = el día
      hecho y `nextPlanId` = el siguiente · logs de hoy sin cerrar → `in_progress` · wrap N→1 · empate
      de fecha → mayor índice · **Día 1 registrado con fecha de ayer ⇒ hoy toca el Día 2** (R11) ·
      último completado fuera de la ventana de 30 días ⇒ **Día 1** (R10, reinicio explícito y sin
      persistencia) · `start_date NULL` + flexible ⇒ `programState='not_started'` · índice sin plan ⇒
      salto · `cycle_length` 1, 2, 7 y 14 · **weekly devuelve exactamente lo mismo que la resolución
      actual `day_of_week === ISODOW`** (y `programState='active'`).
- [x] W0.2b `packages/workout-engine/cycle-completions.ts` (nuevo): `buildCycleCompletions({ plans,
      blocksByPlan, logs, todayIso })` → `{ completions, inProgress }`, el **productor** del insumo caro
      de W0.2 (`completions` = días COMPLETADOS de los últimos 30 días según `deriveDayCompletion`).
      Reúsa `deriveDayCompletion`, `countLoggedSetsByBlock` y `skippedBlockIdsFromLogs`
      (`packages/workout-engine/day-completion.ts:136,193,215`). Un **plan SIN bloques no participa del
      cursor**: se salta y nunca es «hoy» (R9) — no aplica acá la regla legacy de
      `weekPendingWorkouts.ts:255-282` («sin denominador, ≥ 1 serie = hecho»), que queda sólo en la
      grilla weekly. En `cycle`, un día suma con **≥ 1 log DEL PROGRAMA** (enlace bloque→plan) y los
      logs con `block_id NULL` son **neutros** (R29, coherente con las reglas 4-5 de weekly). Hoy esa
      lógica (denominador por plan, dedup por (plan, día), omisiones) vive **sólo a 7 días** en web
      (`weekPendingWorkouts.ts:255-282`) y en RN (`v3/weekly-streak.ts:171-189`): sin este productor, W2
      y W3 la reimplementan distinto y el mismo alumno ve un día distinto en la PWA y en la app.
      **Aceptación**: web (W2.7/W2.8) y RN (W3.7b/W3.5) la consumen —no queda una segunda derivación de
      completitud en el tren—; el fixture compartido de W3.5 alimenta a **este productor**, no sólo al
      cursor; casos de dedup, omisiones, **plan sin bloques (se salta)** y **log huérfano (neutro)**.
- [x] W0.3 `packages/workout-engine/program-day-label.ts` (nuevo): `programDayLabel(dayOfWeek,
      structure, cycleLength, {form})`. **`form: 'chip'` en weekly devuelve `Lun`/`Mar`… (3 letras,
      igual que hoy), NO `L`** (R31): así el chip de 34 px de la biblioteca no cambia para los 276
      programas weekly. **Aceptación**: weekly → `Lun` (`short`) / `Lunes` (`long`) / `Lun` (`chip`);
      cycle → `Día 1` / `Día 1 de 3` / `D1`; `cycle_length = 14` → `Día 14 de 14`; sin `cycle_length`
      no explota.
- [x] W0.4 `packages/workout-engine/set-log-payload.ts:217-234`: `buildStrengthPayload` recibe `ctx?`
      con `sideMode`; `repsDone = min(izq, der)` (R3), `metadata {left_reps, right_reps}`; un solo
      lado ingresado ⇒ `reps_done` = ese lado. **Aceptación**: sin `ctx` el payload es **byte a byte
      el actual** (test de identidad); `per_side` y `alternating` producen el mismo shape; la rama
      `mobility` de `:121-130` queda intacta (`set-log-payload.per-side.test.ts` sigue verde).
- [x] W0.5 `packages/workout-engine/keypad-flow.ts:78-81,123-134`:
      `STRENGTH_PER_SIDE_KEYPAD_STEPS` (peso → reps izq → reps der) y `KeypadTarget` (`:28-59`) gana
      `sideMode?: 'per_side' | 'alternating' | null`. **La fuerza NUNCA entra al carril tipado**:
      `typedTargetFor` (`keypad-flow.ts:105-114`) sigue devolviendo `null` en `strength` y
      `TypedKeypadMode` (`typed-keypad.ts:16`) sigue siendo `cardio | mobility | roller`. Los pasos
      por lado salen de la rama **no tipada** de `keypadStepsForTarget` (`:123-134`), que elige
      `STRENGTH_PER_SIDE_KEYPAD_STEPS` cuando el target trae `sideMode`; el commit sigue por
      `buildStrengthPayload(…, ctx)` de W0.4. Motivo: RN despacha
      `typedMode ? buildTypedPayload : buildStrengthPayload`
      (`apps/mobile/components/alumno/workout/KeypadHost.tsx:230-232`, `SetRow.tsx:911-918`) y
      `buildTypedPayload` escribe `weightKg: null` (`set-log-payload.ts:191`) y `rir: null`, así que
      meter fuerza en el carril tipado guardaría la serie por lado **sin peso ni esfuerzo** y dejaría
      muerto el `ctx` de W0.4. **Aceptación**: test que fija los 3 pasos y el header «Izq · Der»; el
      flujo de fuerza sin lado conserva sus pasos actuales; `typedTargetFor` sobre un bloque
      `strength` con `side_mode = 'per_side'` sigue devolviendo `null`.
- [x] W0.6 `packages/workout-engine/logged-set-summary.ts` y `session-summary.ts` (R19, opción (a)):
      **`formatLoggedSetLine('strength')` SIGUE devolviendo `null`** —ese `null` es el interruptor con
      que las superficies eligen su render de fuerza (comparación objetivo↔hecho, «PC», RPE/RIR) y no se
      toca— y se agrega un export **nuevo** `formatStrengthSetLine(log) → string | null`, que devuelve
      «20 kg × 10 / 10» **sólo** cuando `metadata` trae los dos lados y `null` si no. El volumen de
      `session-summary.ts` usa `left + right` cuando hay metadata, vía el helper único
      `sideRepsFromMetadata` de W0.7 (R27). Los 4 call sites lo llaman **dentro** de su rama de fuerza,
      conservando over/under, «PC» y RPE/RIR: `LogSetForm.tsx:909-913` (W2.15),
      `SetRow.tsx:450-454` (W3.9), `TrainingTabB4Panels.tsx:776-783` (W4.8) y `AnalisisTab.tsx:631`
      (W4.9). **Aceptación**: test de identidad de `formatLoggedSetLine` (ningún `kind` cambia de
      salida, `strength` sigue `null`); tests de `formatStrengthSetLine` con y sin metadata; test del
      volumen con y sin lados.
- [x] W0.7 `packages/workout-engine/workout-exercise-type.ts:74-93`: exportar `sideSuffix` y sumar el
      helper único **`sideRepsFromMetadata(metadata) → { left, right } | null`** (R27): acepta sólo
      enteros 0..9999 **y cadenas de 1 a 4 dígitos** en `left_reps`/`right_reps` (paridad exacta con el
      regex `^[0-9]{1,4}$` del SQL de R27) y devuelve `null` en cualquier otro caso; lo consumen
      `session-summary.ts` (W0.6), `apps/mobile/lib/workout-session.ts:418` (W3.2),
      `build-share-data.ts` (W3.x) y los chips. `SIDE_LABEL` **ya está exportado** en `:31`: los chips
      de W2.15/W3.9 lo importan del motor (R39) en vez de copiarlo. **No** se agrega un CHECK a la
      columna. **Aceptación**: `hasTypedPrescription` y `typedBlockSummary` **sin un solo cambio de
      comportamiento** (test de identidad sobre un bloque `strength` con `side_mode = 'per_side'`:
      sigue devolviendo lo de hoy); `sideRepsFromMetadata` **acepta** enteros 0..9999 y cadenas de 1 a
      4 dígitos (`'10'`) y **rechaza** `-1`, `10.5`, `99999`, `'abc'`, el lado único (solo `left_reps`
      o solo `right_reps`) y metadata sin lados; test de paridad SQL↔TS contra el regex de R27.
- [x] W0.8 `packages/plan-builder/block-type-fields.ts` (nuevo): `stripFieldsForType(block, newType)`
      y `defaultBlockForType(type)` (espejo de `apps/web/src/app/coach/builder/[clientId]/program-read-mappers.ts:167-205`, `createDefaultBlock`).
      `stripFieldsForType` escribe **todos** los campos polimórficos del tipo anterior según
      `packages/schemas/workout.ts` —`duration_sec`, `distance_value`, `distance_unit`, `hr_zone`,
      `interval_config`, `reps_value`, `reps_unit`, `target_pace_sec_per_km`, `load_value`,
      `load_unit`— y **conserva** `sets`, `rest_time`, `notes`, `superset_group`, `side_mode` e
      `instructions` (R32; cotejar con `editedTypedColumns`,
      `apps/mobile/lib/plan-builder/serialize.ts:110-133`). Los escribe en
      `null` **explícito, nunca `undefined`**: el serializador RN sólo sobreescribe el campo cuando es
      `!== undefined` y el resto lo repone `_raw` (`serialize.ts:153`), así que un strip con
      `delete`/`undefined` es un **no-op**. Omitir `reps_value`/`reps_unit` deja encendido
      `hasTypedPrescription` (`packages/workout-engine/workout-exercise-type.ts:86-94`) en un bloque de
      fuerza. **Aceptación**: cambiar `cardio → strength` deja en `null` `duration_sec`/
      `distance_value`/`distance_unit`/`target_pace_sec_per_km`/`hr_zone`/`interval_config` y
      **conserva** `sets`, `rest_time`, `notes`, `superset_group`, `side_mode`, `instructions`; un caso
      `roller → strength` verifica `reps_value === null`, `reps_unit === null`, `load_value === null`,
      `load_unit === null` y `typedBlockSummary(bloque, 'strength') === null`; **test de round-trip** en
      `tests/mobile` que serialice el bloque stripeado **con `_raw` presente** y no vea residuos (ojo
      `distance_unit`, que en `serialize.ts:124` se define por `distance_value`).
- [x] W0.9 Test de no-regresión de progresión y PR: `apps/web/src/lib/workout/progression.ts:207-211`
      y `packages/workout-engine/pr-detect.ts:86-99` reciben el mismo `reps_done` que hoy para un
      bloque `per_side`. **Aceptación**: un «10 / 10» sobre rango «8-12» **no** dispara
      `status: 'progressed'` ni un PR de e1RM falso.
- [x] W0.10 `packages/workout-engine/index.ts:23-52`: tres `export *` nuevos (`cycle-cursor`,
      `cycle-completions`, `program-day-label`). `formatStrengthSetLine` (W0.6) y
      `sideRepsFromMetadata` / `SIDE_LABEL` (W0.7) **no** agregan líneas: ya viajan por los
      `export *` de `logged-set-summary` (`:38`) y `workout-exercise-type` (`:30`).
      **Único wave que edita el barrel.** **Aceptación**: `pnpm typecheck` verde
      y ningún otro wave con diff en ese archivo.

## W1 · DB (aditiva, validada en LIVE con tx-rollback antes de aplicar)

- [x] W1.1 Espejo **`_streak_next`** (nombre canónico, R25) en una transacción sobre LIVE + diff contra
      la función vigente para **todos** los clientes con logs. **Aceptación**: **0 filas de diff con
      `program_structure_type = 'weekly'`**; la tabla de diffs de `cycle` queda registrada en
      `DATA-SECURITY.md`. Termina en `ROLLBACK`.
- [x] W1.2 `supabase/migrations/20260903212441_streak_cycle_branch_and_null_start.sql`:
      `CREATE OR REPLACE FUNCTION public.get_client_current_streak(uuid)` con la rama `cycle` de R1
      (cada día con ≥ 1 log suma; corta solo una semana Lun–Dom cerrada con 0 logs; `start_date IS
      NULL` cae por la regla 7 con guard explícito). Misma firma; cuerpo `weekly` idéntico. Grants con
      el patrón del tren (R16): `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, service_role;` **antes**
      del `GRANT … TO authenticated`, y `has_function_privilege` inmediatamente después del CREATE.
      **Aceptación**: `EXPLAIN` sin plan peor que el actual; `get_clients_streaks_by_ids` y
      `get_coach_clients_streaks` heredan sin edición.
- [x] W1.3 `supabase/tests/streak_cycle_equivalence.sql` (**sin timestamp**, convención del repo, R25)
      con el patrón de la casa (`supabase/tests/nutrition_v2_sets_equivalence.sql`,
      `student_gate_equivalence.sql`) y el espejo `_streak_next` de W1.1.
      **Aceptación**: el archivo corre y falla si aparece una fila weekly divergente.
- [x] W1.4 `supabase/migrations/20260903212038_client_start_workout_program_rpc.sql`:
      `client_start_workout_program(p_program_id uuid, p_start_date date DEFAULT NULL)
      RETURNS TABLE (start_date date, end_date date, started boolean)` (R23), `SECURITY DEFINER`,
      `SET search_path = public`.
      - **Ventana = sólo hoy** (R14): `p_start_date` NULL o igual a hoy (Santiago); cualquier otra
        fecha ⇒ `start_date_out_of_range`. No existe «Elegir otra fecha» ni el estado
        «Empieza el <fecha>» en este tren.
      - **Quién puede empezar** (R40): el guard usa **exactamente el mismo predicado** que la policy
        INSERT de `workout_logs` para el alumno (el fixer de `DATA-SECURITY.md` cita la policy real:
        si admite `client_memberships`/`student_readable_client_ids`, la RPC también; si no,
        `client_id = auth.uid()`), más `is_active` AND `start_date_flexible` AND `start_date IS NULL`.
      - **Cuenta pausada** (R17): antes del UPDATE llama `private.student_write_allowed(v_uid)` y
        lanza `coach_account_paused` (`42501`).
      - **`end_date` en el mismo UPDATE** (R21): `end_date = start_date + weeks_to_repeat*7 − 1`.
      - **Idempotencia** (R28): si el UPDATE afecta 0 filas **porque `start_date` ya estaba**, devuelve
        la fecha existente con `started = false`; 0 filas por cualquier otra causa ⇒
        `program_not_startable`. `started = true` **sólo** cuando esta llamada escribió.
      - **Grants** (R16): `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, service_role;` antes del
        `GRANT EXECUTE … TO authenticated`, y `has_function_privilege` inmediatamente después del
        CREATE.
      - **Aceptación** (con JWTs reales, en transacción con `ROLLBACK`): el dueño fija fecha y
        `end_date` y recibe `started = true` · un tercero recibe error sin filtrar datos · segunda
        llamada devuelve la misma fecha con `started = false` · `p_start_date` = mañana ⇒
        `start_date_out_of_range` · alumno de coach pausado ⇒ `coach_account_paused` · un programa no
        flexible o ya iniciado no se mueve · `service_role` **no** tiene EXECUTE.
- [x] W1.5 `supabase/migrations/20260903212700_daily_tonnage_side_metadata.sql`: `get_client_daily_tonnage`
      (linaje `20260612052000_rpc_client_progress_aggregations.sql`) con `weight_kg * reps_eff`, donde
      el cast es **defensivo por regex, nunca `jsonb_typeof`** (R27):
      `reps_eff = CASE WHEN metadata->>'left_reps' ~ '^[0-9]{1,4}$' AND metadata->>'right_reps' ~
      '^[0-9]{1,4}$' THEN (metadata->>'left_reps')::int + (metadata->>'right_reps')::int
      ELSE reps_done END`. Misma firma; grants con el patrón de R16 (REVOKE de `PUBLIC`, `anon` y
      `service_role` + `has_function_privilege`). **Aceptación**: una fila sin metadata (o con metadata
      basura: `'abc'`, `-1`, `1.5`, `99999`) devuelve exactamente el valor de hoy; el protocolo LIVE
      mide `EXPLAIN (ANALYZE, BUFFERS)` **antes y después** y, si el tiempo sube más de **2×**, la
      migración `INCLUDE (metadata)` queda anotada como seguimiento —**no** entra a este tren (R26).
- [x] W1.5b `supabase/migrations/20260903212800_muscle_volume_side_metadata.sql` — **cuarta migración** del tren
      (R15): `CREATE OR REPLACE FUNCTION get_client_muscle_volume(uuid, integer)` con el **mismo**
      `reps_eff` por regex de W1.5, reponiendo el REVOKE/GRANT del linaje `20260612052000:76-77` con el
      patrón de R16. Espejos TS alineados a la misma fórmula: `apps/mobile/lib/enterprise-profile-analytics.ts:131`
      y `apps/mobile/lib/coach-client-detail.ts:755`. **Aceptación**: misma firma; una fila sin metadata
      devuelve el valor de hoy; el volumen por músculo de un bloque `per_side` con «10 / 10» coincide
      entre SQL y los dos espejos TS.
- [x] W1.6 Consulta de control en LIVE: cuántos bloques del programa activo de un cliente traen
      residuos de otro tipo (campos de cardio/movilidad en bloques `strength` y viceversa).
      **Aceptación**: número anotado en la SDD antes de que W4 amplíe el SELECT de la ficha.

### Ejecución W0 + W1 (2026-09-03, 6 workers Opus en paralelo; juicio del jefe sobre los diffs)

- **Gates reales**: `npx vitest run packages tests/mobile/plan-builder-strip-roundtrip.test.ts
  apps/web/src/lib/workout/progression.test.ts` → **118 archivos / 2 143 tests / 0 fallos** (7 s);
  `pnpm typecheck` verde (W0-C, tras cerrar §7.2 y `parseOptionalKg(null)`);
  `pnpm --filter @eva/mobile exec tsc --noEmit` verde (W0-C y W1-F); eslint limpio en todo lo tocado.
- **LIVE (todo en `BEGIN…ROLLBACK`, nada aplicado)**: racha → 109 clientes con logs, **0 diff
  weekly (91)**, 11 de 13 en ciclo suben (0→1…1→4), ninguno baja; 0 programas con `start_date NULL`
  hoy; EXPLAIN weekly 50,8 → 12,8 ms, cycle 3,6 → 2,2 ms. RPC → 7 casos con JWT reales OK, ACL
  anon=false / authenticated=true / service_role=false; policy real `workout_logs_client` =
  `client_id = (SELECT auth.uid())` (sin `client_memberships`). Tonelaje/volumen → 0 diffs en 3
  clientes, sintético `"10"+10 = 20` y basura ⇒ `reps_done`; EXPLAIN 0,97× / 0,95× (sin índice
  `INCLUDE`, B9 no aplica); 0 de 20 861 logs traen `left_reps` hoy. Residuos W1.6: **4 de 2 794**
  bloques activos (2 `strength` con `duration_sec`, 2 `mobility` con `reps_unit`): se despliega y
  se avisa, sin migración de datos.
- **Decisiones del jefe**: mensajes de error de la RPC **pelados** (`program_not_startable`,
  `coach_account_paused`, `start_date_out_of_range`, `unauthenticated`), como el resto de la casa
  (`includes` en los consumidores); orden real de migraciones por timestamp 2 → 1 → 3 → 4 (independientes,
  no se renumera); weekly en `resolveCycleCursor` = identidad estricta (`nextPlanId` sin wrap, slots
  pasados `upcoming`, ignora `completions`); `sideRepsFromMetadata` vive en `workout-exercise-type.ts`
  (SPEC corregido); `buildMuscleVolume` muerto de `coach-client-detail.ts` no se alinea (W4.2 decide).
- **Deudas nuevas** (backlog, no bloquean): B11 `reps` y `load_type` sobreviven a `stripFieldsForType`
  (no están en las listas de R32; un `cardio → strength` puede llegar con `reps: '10min'`) · B12
  `apps/mobile/lib/offline-cache.ts:43-44` declara su propio literal de `metadata` sin lados (lo cierra
  W3.2) · B13 alias `WorkoutLogSideRepsMetadata` en `set-log-payload.ts` ya redundante con §7.2
  (colapsar en W2/W3).
- **Costo**: 1,06 M tokens de workers (138 k–198 k cada uno). Tren detenido acá por decisión del owner
  (medir la barra de uso antes de W2–W4).

### Ejecución tanda 2 — capa de datos W2 + W3 + W4 (2026-09-03, 6 Opus + 1 Sonnet; juicio del jefe)

- **Gates reales**: `npx vitest run packages apps/web/src/app/c apps/web/src/services apps/web/src/lib
  apps/web/src/app/coach tests/mobile …` → **558 archivos / 7 674 tests / 0 fallos**; `pnpm typecheck`
  verde; `pnpm --filter @eva/mobile exec tsc --noEmit` verde; eslint limpio en lo tocado.
- **Contratos que consume la UI (tanda 3)**: web `heroComplianceBundle.cycle: HeroCycleView`
  (`programState`, `todayState`, `todayLabel/ChipLabel`, `nextLabel/ChipLabel`, `slots[]` con labels) y
  `startWorkoutProgramAction({ coachSlug, programId }) → StartProgramState { success?, startDate?,
  endDate?, started?, error?, code?: 'validation'|'unauthenticated'|'coach_paused'|'not_startable'|
  'out_of_range'|'db' }`; `WeekDay.{dayLabel, dayLabelLong, dayChipLabel}` y `WeekWorkoutStatus.mode`.
  RN `derived.cursor: ProgramCursorView` + planos `programState`, `todayState`, `todayDayLabel`,
  `nextDayLabel`, `slots: ProgramSlotView[]` (`components/alumno/home/program-cursor.ts`,
  `deriveProgramCursor` pura) y `startWorkoutProgram(programId, { via, structure }) → { ok: true,
  startDate, endDate, started } | { ok: false, code, message }` (`lib/start-program.ts`).
- **Decisiones del jefe**: evento `program_started_by_client` con `distinctId` = uuid del alumno
  (pseudónimo, precedente `google_link_rotated_password`); auto-start web = 1 lectura PK extra por
  serie (aceptado; B14 = hint del cliente); reemplazos con tipo efectivo `strength` incluyen catálogo
  con `exercise_type NULL` (web y RN iguales); `totalReps` del share suma lados (R34); defaults RN de
  fuerza al agregar del catálogo pasan a los de web (`3 × 8-12 · 90 s`, paridad deliberada, **visible
  para el coach**); `applyBlockTypeChange` duplicado 4 líneas web/RN (B16).
- **Huecos cerrados por el jefe** (fuera de zona de los workers): `workout.service.ts:855,1494`
  seguían con `start_date_flexible ?? true` → `resolveStartDateFlexible`; flujo «Asignar a alumnos»
  nacía flexible en web (`AssignToClientsDialog.tsx:31`) y RN (`assign-clients-options.ts:42`) → `false`;
  `program-builder.tsx:357` no pasaba `startDateFlexible` al helper (W3.3b sin efecto) → cableado.
- **Para la tanda 3 (UI, Fable)**: W2.9 sigue abierta en su mitad visual (`WorkoutPlanCard.tsx:20,117`
  → `dayLabel/dayChipLabel`; `week-status.queries.ts:34` entrega índices en ciclo a la tira del
  ejecutor); RN `ExecutorV3.tsx:1220,1242,1269` sigue pintando grilla semanal en ciclo (falta
  `program_structure_type` + `doneDates`); `PlanDayView.dateIso` de slots no hechos apunta a hoy
  (decidir `null`); copy de `weeklyStreak` en ciclo («2 de 2 esta semana»); LogSetForm `:780-798`
  encola los dos lados (W2.15).
- **Deudas nuevas**: B14 hint de auto-start · B15 `subject`/`previewText` del mail admin siguen
  «EVA pronto en las tiendas» (sincronizar con `AnnouncementEmailButton.tsx:14-15`) · B16 subir
  `applyBlockTypeChange` a `@eva/plan-builder` · B17 RN `since30Iso` = 29 d vs web 30 d (el motor
  reclampa; solo difiere el día −30).
- **Costo**: 1,61 M tokens de workers (Sonnet 230 k no fue más barato que Opus en archivos grandes).

### Ejecución tanda 3 — UI [Fable] W2.11–15, W2.9, W3.8–11, W4.8–11, W5.3 (2026-09-03, sin workers)

- **Gates reales al cierre**: `pnpm typecheck` verde · `pnpm --filter @eva/mobile exec tsc --noEmit`
  verde · eslint (web y `eslint.mobile.config.mjs`) limpio en todo lo tocado · vitest
  `apps/web/src/app/c apps/web/src/app/coach apps/web/src/components apps/web/src/lib
  apps/web/src/services packages` → **455 archivos / 6 102 tests / 0 fallos** · vitest
  `--project mobile-node tests/mobile` → **73 / 992 / 0** (+ 10 de los tests raíz de mobile).
- **Web alumno**: hero con los 4 estados leídos del cursor (`HeroSection` → `WorkoutHeroCard` con
  `eyebrow`, `startProgram`, `nextLabel`; «Empezar hoy» llama `startWorkoutProgramAction` y
  `router.refresh()`; `not_startable` = estado) · day-cards por `slots` con `dayLabel/dayLabelLong`
  (sin `DAYS[dow-1]`, sin «Recuperar» en ciclo, badge «Empieza cuando quieras») · Momentum = días
  entrenados en ciclo · `ComplianceRing` «—» + «Sin meta semanal» · cabecera desktop «Día N de M» /
  «Empieza cuando quieras» · `WeekCalendar.tsx` y `CalendarDay.tsx` borrados · tira del ejecutor
  omitida en ciclo (`week-status.queries.ts`, B18).
- **Web ejecutor por lado** (`LogSetForm.tsx`): `perSideReps` en los DOS layouts (tiles V3 y fila V2),
  «Izq»/«Der» + un peso, teclado de 3 pasos (`reps_right`), `buildStrengthPayload(…, sideMode)` en el
  submit (`reps_done = min`, `metadata` en FormData, cola y optimismo), chip recap con
  `formatStrengthSetLine` («20 kg × 10 / 10»), rueda dual apagada en por lado, evento
  `set_logged_per_side` (posthog-js), `sideMode` pasado desde `ExerciseStepV3`, `SingleExerciseCard`,
  `SupersetStepV3` y `WorkoutExecutionClient`; chip «Por lado»/«Alternado» en las 3 filas de
  objetivo con `SIDE_LABEL` del motor; copia local de `SIDE_LABEL` borrada.
- **RN alumno**: `HeroSection` con `cursor`/`programId`/`onStartProgram` (home recarga con `load()`);
  `PlanDayView` += `isCycle/label/labelLong`; day-card y sheet con etiquetas del cursor; badge
  «Empieza cuando quieras»; `MomentumCard` `workoutCompliance: number | null` → «Sin meta semanal»;
  `SetRow` con cajas «Izq»/«Der» y `buildStrengthPayload(…, sideMode)`; `KeypadHost` commit con
  `target.sideMode`; `ExecutorV3.openSet` siembra `reps_left/right` y pasa `sideMode` SOLO en strength
  (movilidad intacta, W3.10); racha del ejecutor omitida en ciclo; chips «Por lado» en
  `ExerciseScreenV3` y `SupersetGroupCard`; `SessionCompleteV3` volumen izq+der; biblioteca
  `dayLabel(day, structure, cycleLength)` por `programDayLabel(form:'chip')` («D1», tildes) y
  `ProgramPreviewCard` lo consume.
- **Coach**: web `ProgramTabB7` («Día N de M» en ciclo, resumen tipado + «Lado» en la ficha del
  bloque), `TrainingTabB4Panels` pastilla «10 / 10» conservando over/under y «PC» (metadata sumada al
  SELECT de la ficha), `BlockEditSheet` `Ninguno | Por lado | Alternado` + hint, sufijo «/lado» en
  `ExerciseBlock`/`StudentLivePreview`, copy del toggle en `ProgramConfigForm`; RN `PlanTab`
  (chip «D1», resumen tipado, «Lado»), `OverviewTab` («Programa por ciclos · Día 1 de N», nunca «Hoy»),
  `AnalisisTab` pastilla «10 / 10», `BlockEditorSheet` «Ninguno» + hint, `ProgramConfigSheet` copy,
  `BuilderBlockCard` sufijo.
- **PWA**: `InstallPrompt` día 1 en Android Chrome con `canPrompt` (iOS conserva el primer entreno),
  evento `pwa_install_prompt_shown {platform, day1}`.
- **Decisiones del jefe**: tira del ejecutor en ciclo se OMITE en web y RN (B18: días entrenados sin
  «N de M») · «próximo entreno» del coach en ciclo muestra el Día 1 con eyebrow «Programa por ciclos»
  (la ficha no carga las completitudes del alumno; el «hoy toca» real vive en el Inicio del alumno) ·
  la pastilla del coach usa `sideRepsFromMetadata` (no `formatStrengthSetLine`) para conservar el
  color over/under del peso (R19).
- **Deudas nuevas**: B19 borrador local web no guarda el lado derecho (la cola sí) · B20 semilla de
  «repetir día» no siembra `reps_left/right` (siembra `reps`) · B21 `CalendarDay.tsx` borrado junto a
  `WeekCalendar.tsx` (solo lo usaba él).

## M · Mockups del jefe (Fable) — bloquean toda tarea **[UI · Fable]**

- [x] M1 **Familia A — Alumno Inicio**: hero en los 4 estados de OUTLINE §6 («Tu programa está listo»
      con **«Empezar hoy» como única acción** —«Elegir otra fecha» sale del tren, R14— · «Hoy toca ·
      Día 2 de 3» · «En progreso» · «Día 2 hecho · Próximo: Día 3 de 3»), day-cards como `slots` (hecho
      con fecha / hoy / próximo, sin fechas de calendario ni «Recuperar»), chip de tipo de ejercicio,
      ribbon de racha, tira Lun→Dom de **días entrenados** (punto por día con logs, sin estados
      asignado/pendiente) y anillo «Entrenos» en «—» con el rótulo **«Sin meta semanal»** en modo ciclo
      (R12). El artifact de mockups se corrige donde todavía muestre «Elegir otra fecha». Web
      móvil/PWA + desktop + RN en la misma lámina.
- [x] M2 **Familia B — Ejecutor fuerza por lado**: fila de serie con «Izq» / «Der» + un peso, chip
      «Por lado»/«Alternado» **en la fila de objetivo** (no en `TypedTargetGrid`, que no cambia — R39),
      teclado con los 3 pasos de la rama **no tipada** (R18), resumen «10 / 10 · 20 kg», resumen de
      sesión. Web (mismo componente en móvil y desktop) + RN.
- [x] M3 **Familia C — Ficha coach → Programa**: resumen tipado por bloque (no «Series × reps» para
      todo), etiqueta «Día N de M» en microciclo y day-cards, «próximo entreno» en modo ciclo, chips
      de estructura sin duplicar los existentes. Web + RN + tarjeta de la biblioteca RN.
- [x] M4 **Familia D — Builder**: control «Lado» en fuerza (`Ninguno | Por lado | Alternado`, sin
      `bilateral`) con el hint «El alumno registra izquierda y derecha en cada serie.», resumen del
      bloque con sufijo, y toggle «Inicio flexible (el alumno decide)» con su copy nuevo y default
      apagado. Web + RN.
- [x] M5 **Familia E — Invitar / instalar**: hoja «Invitar alumno» de RN con el copy canónico y el
      prompt de instalar PWA en Android día 1 (con *dismiss*). Web + RN.
- [x] M6 Aprobación explícita del owner por artifact
      `623ea16f-c32c-4ebe-add1-7bf4ff9c63a8` (2026-09-03: «OK tal cual», con la condición de W0.0c:
      la UI se asimila al estilo existente en código). Donde el artifact todavía muestre «Elegir otra
      fecha», manda R14/M1 = A (solo «Empezar hoy»). **Sin esta casilla marcada, ninguna tarea
      [UI · Fable] arranca.**

## W2 · Alumno web / PWA

### Capa de datos y acciones (Opus)

- [x] W2.1 `apps/web/src/services/workout/workout.service.ts:374-392,510,585,977-981,1023`: default
      `start_date_flexible ?? false` (R2) y, en un programa **nuevo** con el flag en `true`,
      `start_date` **y `end_date`** quedan NULL (R21: `end_date` sólo se fija cuando se fija
      `start_date`; el guard de `assignFromTemplate` en `:977-981` deja de estampar ambos). Aplica a
      `weekly` **y** a `cycle` (R13); sólo los programas creados o asignados **después** del deploy con
      el flag en `true` nacen sin fecha: los 50 activos que hoy lo tienen conservan la suya y nunca ven
      «Empezar hoy». **Aceptación**: test que fija que un programa **existente con fecha conserva su
      fecha** al re-guardar (hoy `existing?.start_date || hoy` la protege; vaciarla rompería 50
      programas activos), que uno nuevo no-flexible sigue estampando hoy y que uno nuevo flexible nace
      con `start_date = NULL` **y `end_date = NULL`**.
- [x] W2.1b Aviso de programa asignado **sin fecha** (R20):
      `apps/web/src/services/workout/program-assignment-notification.service.ts:123` deja de exigir
      `start_date` en su guard, y `buildProgramAssignedEmail` acepta `startDate: null` pintando en la
      fila «Inicio» la frase canónica **«Empieza cuando quieras»**; la misma frase va en el mail de
      `assignFromTemplate` (`workout.service.ts:1093-1100`). **Aceptación**: test «programa flexible sin
      fecha ⇒ **1 email + 1 push**» (hoy se emiten **0**) y snapshot de la fila «Inicio» con la frase
      canónica; con fecha, el mail no cambia.
- [x] W2.2 `apps/web/src/app/c/[coach_slug]/dashboard/_actions/start-program.actions.ts` (nuevo):
      **`startWorkoutProgramAction({ coachSlug, programId })`** (objeto; **sin fecha**, R14/R24) → RPC
      `client_start_workout_program`, `revalidatePath('/c/' + coachSlug + '/dashboard')`, y evento
      `program_started_by_client {program_id, structure, via:'button'}` **sólo cuando la RPC devuelve
      `started = true`** (R23). El gate de cuenta pausada es el **tipado de `logSetAction`**
      (`workout-log.actions.ts:112-116`), que traduce `coach_account_paused` a error de UI en vez de un
      500 opaco (R17). **Aceptación**: test de la action con RPC mockeada (éxito con `started=true` y
      un evento; programa ajeno; segunda llamada devuelve la misma fecha con `started=false` y **no**
      emite evento; alumno de coach pausado ⇒ error tipado).
- [x] W2.3 `apps/web/src/app/c/[coach_slug]/workout/[planId]/_actions/workout-log.actions.ts:148-167`:
      `metadata` deja de escribirse como `?? null` (`:166`) y se **omite la key** cuando no viene en
      el payload. **Aceptación**: re-guardar una serie de movilidad sin mandar metadata **no borra**
      `{left_sec, right_sec}`; mandar `{left_reps: 10, right_reps: null}` sí vacía ese lado.
- [x] W2.4 Auto-start en el mismo archivo: si el plan pertenece a un programa flexible con
      `start_date NULL`, la primera serie del día llama la RPC **sin fecha** (`p_start_date` NULL ⇒ hoy,
      R14) y emite `program_started_by_client {via:'auto'}` sólo con `started = true` (R23).
      **Aceptación**: se llama **una sola vez** por sesión, nunca sobre un programa ya iniciado, y una
      segunda serie no emite un segundo evento.
- [x] W2.5 `apps/web/src/lib/workout-offline-queue.ts:131-156` +
      `apps/web/src/app/c/[coach_slug]/workout/[planId]/LogSetForm.tsx:780-798`: el item encolado de
      **fuerza** lleva `left_reps`/`right_reps` y `workoutLogToFormData` los reenvía (`:154` ya
      serializa `metadata`). **Aceptación**: test de round-trip encolar → `FormData` → parse del
      schema conservando los dos lados.
- [x] W2.6 `apps/web/src/app/c/[coach_slug]/dashboard/_data/dashboard.queries.ts:86-103`:
      `getActiveProgram` += `program_structure_type, cycle_length, start_date_flexible`; bloques +=
      `exercise_type_override, exercises ( exercise_type )`. En el **mismo archivo**,
      `getRecentWorkoutLogs` (`:166-178`) **no cambia de forma**: `select` = `block_id`,
      `workout_blocks(plan_id)`, `set_number`, `logged_at`, `metadata`, ventana de **30 días**,
      `order('logged_at', desc)` y `limit(200)`. **`target_date` NO existe como columna de
      `workout_logs`** (pedirlo da `PGRST204`): la fecha de la completitud sale de
      `eva_santiago_day(logged_at)` en **lectura**, y el `target_date` del ítem encolado sólo manda en
      **escritura** (`workout-offline-queue.ts:157`, R11). Es la lectura que RN espeja en W3.7b.
      **Aceptación**: `getClientWorkoutPlans` sin diff; el tipo `ActiveProgramRow` refleja los campos
      nuevos; `RecentWorkoutLog` mantiene exactamente esas columnas y ningún `select` del tren pide
      `target_date` a `workout_logs`.
- [x] W2.7 `apps/web/src/app/c/[coach_slug]/dashboard/_data/heroComplianceBundle.ts:92-162`:
      `todayPlan` (`:95-105`) y `nextLabel` (`:150-162`) pasan por `resolveCycleCursor` y
      `programDayLabel`. **Aceptación**: archivo de test **nuevo** (hoy no existe par de test) con un
      caso weekly idéntico al comportamiento actual y un caso ciclo de 3 días.
- [x] W2.8 `apps/web/src/app/c/[coach_slug]/dashboard/_data/weekPendingWorkouts.ts:179-221,354-370`:
      en `cycle`, los 7 slots por fecha se sustituyen por los `slots` del cursor y la función devuelve
      **cero pendientes y cero recuperables** (R12): no hay «día perdido» en ciclo, así que no se arma
      cola de «días pasados abiertos» y el `WorkoutRecoverBanner` no se monta (W2.12). **Aceptación**:
      `weekPendingWorkouts.test.ts` verde **sin editar sus casos weekly** + caso de ciclo con días
      pasados sin entrenar que devuelve lista vacía.
- [x] W2.9 **En web no hay aritmética `% 7` que borrar**: el grep de `((dow - 1) % 7 + 7) % 7` sobre
      `apps` y `packages` devuelve **dos** ocurrencias y ambas son RN
      (`apps/mobile/app/alumno/(tabs)/home.tsx:401` y
      `apps/mobile/components/alumno/workout/v3/weekly-streak.ts:198`); ese borrado es tarea
      exclusivamente RN y ya vive en W3.6. Lo que hay que cerrar acá (R8 **corregido por R33**, ciclos
      de 8..14 días) es que las day-cards se pinten con los `slots` del cursor (W0.2) y que
      `apps/web/src/app/c/[coach_slug]/dashboard/_components/program/ActiveProgramSection.tsx:63-68`
      deje de indexar por el `dayByDow` de **7 entradas** —ahí está el colapso web, no en un `% 7`—;
      `weekPendingWorkouts` **no** emite slots por índice en ciclo (devuelve cero pendientes, W2.8/R12).
      `WorkoutPlanCard.tsx:20,117` deja de
      etiquetar con `DAYS[dow - 1]` (devuelve `undefined` con `day_of_week > 7`) y pasa por
      `programDayLabel`. `week-status.queries.ts:30-34` hereda sin edición propia (sólo mapea
      `week.days`). **Aceptación**: `weekPendingWorkouts.test.ts` y
      `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/weekly-streak.test.ts` verdes **sin editar
      sus casos weekly**; un ciclo de 14 días muestra 14 tarjetas etiquetadas y ninguna vacía.
- [x] W2.10 `apps/web/src/app/c/[coach_slug]/workout/[planId]/_data/substitution.queries.ts:47-76`:
      trae `exercise_type_override` y filtra candidatos por tipo **efectivo** (R5). **Aceptación**:
      con override `mobility` sobre un ejercicio de catálogo `strength`, los candidatos son de
      movilidad; sin candidatos, la query devuelve lista vacía (la UI dirá «No hay reemplazos de este
      tipo»).
- [x] W2.10b `apps/web/src/lib/workout/workoutAdherence30d.ts:55-77` y
      `_components/momentum/MomentumCard.tsx:57-70` — capa de **DATOS** (Opus), distinta de la pasada
      visual de W2.13. En ciclo **no hay meta semanal** (queda en backlog B1), así que no se inventa un
      denominador: con `program_structure_type === 'cycle'`, `computeWorkoutScore30d` devuelve
      **`score = null`** y su firma pasa a `number | null` (R12). Sin esto, el anillo «Entrenos» del
      hero (`heroComplianceBundle.ts:166`, que consume `computeWorkoutScore30d`) seguiría contando sólo
      los días de semana que coinciden con el índice del ciclo, mostrando un porcentaje falso. El
      `days` de momentum deja de resolver el plan por `p.day_of_week === dow` y pasa a ser una tira
      Lun→Dom de **días entrenados** (punto por día con logs, sin estados asignado/pendiente), como en
      el mockup A. **Aceptación**: `apps/web/src/lib/workout/workoutAdherence30d.test.ts` verde **sin
      editar sus casos weekly** (`number` intacto) + caso de ciclo que devuelve `null`; los **3
      consumidores** del score compilan con `number | null` y pintan «—» con el rótulo
      **«Sin meta semanal»** (la pasada visual es W2.13).

### Capa de pantalla **[UI · Fable]** (requiere M6)

- [x] W2.11 **[UI · Fable]** Hero del alumno con los 4 estados y **«Empezar hoy» como única acción**
      (sin «Elegir otra fecha», R14) cableada a W2.2. El estado «no empezado» se lee del
      `programState: 'not_started'` que devuelve el cursor (R30): el hero **no** lo re-deriva de
      `start_date`. **Aceptación**: en preview, un ciclo sin `start_date` muestra «Tu programa está
      listo · Día 1 de 3» con un solo botón y al confirmar queda «Hoy toca · Día 1 de 3».
- [x] W2.12 **[UI · Fable]** `_components/program/ActiveProgramSection.tsx:49-121` y
      `_components/program/WorkoutPlanCard.tsx:20,117`: day-cards por `slots`, etiqueta por
      `programDayLabel`, sin `WorkoutRecoverBanner` (`:109-117`) en ciclo. **Aceptación**: en ciclo
      no aparece ningún nombre de día de la semana ni «Recuperar»; en weekly la sección no cambia.
- [x] W2.13 **[UI · Fable]** `_components/momentum/MomentumCard.tsx:50-83`,
      `_components/desktop/DesktopDashboardHead.tsx:29-51` y
      `_components/streak/StreakRibbon.tsx:18-87`: la tira semanal **se mantiene Lun→Dom** como «días
      entrenados» (punto por día con logs, sin estados asignado/pendiente — R12), y la cabecera de
      escritorio y el copy de racha quedan coherentes con R1 (revisar «Te faltan N para los G días» y
      `MILESTONES`). El anillo «Entrenos» tiene **un propagador y dos renders**, y sólo esos:
      `heroComplianceBundle.ts:50,166,199` (la firma pasa a `number | null`),
      `momentum/MomentumCard.tsx:92` y `ComplianceScoresCard.tsx:14` →
      `compliance/ComplianceRing.tsx:59,65,85`. `DesktopDashboardHead.tsx` **no** consume
      `workoutScore` (entra en esta tarea sólo por el copy de racha). Los dos renders pintan **«—» con
      el rótulo «Sin meta semanal»** cuando el score es `null` (ciclo). El `days` de `MomentumCard` lo resuelve W2.10b
      (capa de datos): esta tarea es sólo la pasada visual. **Aceptación**: ningún copy promete «días
      consecutivos» en modo ciclo; el anillo en ciclo nunca muestra un porcentaje.
- [x] W2.14 **[UI · Fable]** Borrar `apps/web/src/app/c/[coach_slug]/dashboard/_components/calendar/WeekCalendar.tsx`
      (código muerto: el símbolo solo aparece en su propia definición y en comentarios de
      `momentum/MomentumCard.tsx:22,25` y `_data/weekPendingWorkouts.ts:179`). **Aceptación**:
      `pnpm typecheck` y `pnpm test` verdes tras el borrado.
- [x] W2.15 **[UI · Fable]** Ejecutor de fuerza por lado:
      `LogSetForm.tsx:211-216,780-798,1512-1527,2088-2121` (dos campos de reps + un peso) y la línea de
      serie de `:909-913` llamando **`formatStrengthSetLine`** dentro de su rama de fuerza, con
      over/under, «PC» y RPE/RIR intactos (R19). El **chip «Por lado»/«Alternado» va en la fila de
      objetivo** —`v3/ExerciseStepV3.tsx:196-204`, `SingleExerciseCard.tsx:392-455` y la superserie web
      `v3/SupersetStepV3.tsx:323-356,512-560`— con `SIDE_LABEL[side_mode]` **importado del motor**;
      `WorkoutExecutionClient.tsx:308-311` borra su copia local de `SIDE_LABEL` y **`TypedTargetGrid` no
      cambia** (la fuerza nunca entra al carril tipado, R18/R39). Evento
      `set_logged_per_side {block_id, side_mode}`. **Aceptación**: registrar 10 y 10 con 20 kg guarda
      `reps_done = 10` y `metadata {left_reps: 10, right_reps: 10}`; la línea de serie dice
      «20 kg × 10 / 10»; un bloque de fuerza **sin** `side_mode` conserva la fila de hoy y su línea de
      serie actual; no queda ninguna definición local de `SIDE_LABEL` en `apps/web`.

## W3 · Alumno RN (sale por OTA 1.1.2)

### Capa de datos (Opus)

- [x] W3.1 `apps/mobile/lib/start-program.ts` (nuevo): **`startWorkoutProgram(programId)`** (sin fecha,
      R14/R24) → RPC + `captureAppEvent('program_started_by_client', {via:'button'})` **sólo con
      `started = true`** (R23). **Aceptación**: `tsc` verde y manejo explícito y tipado de los errores
      de la RPC (`coach_account_paused`, `program_not_startable`, `start_date_out_of_range`).
- [x] W3.2 `apps/mobile/lib/workout-session.ts:418,940,1058-1067` + `lib/offline-cache.ts:33-45`:
      auto-start en el primer `logSet` (`via:'auto'`, evento sólo con `started = true`) y
      `metadata {left_reps, right_reps}` en la cola offline y en el reconcile, leídos con
      `sideRepsFromMetadata` (R27, helper de W0.7) en vez de castear a mano. **Aceptación**: test de
      cola que conserva los dos lados tras drenar; metadata basura no rompe el reconcile; el hold por
      lado de movilidad sigue intacto.
- [x] W3.3 `apps/mobile/app/alumno/(tabs)/home.tsx:163-167` + `components/alumno/home/types.ts:38-47`:
      el select del programa y el contrato del dashboard suman
      `program_structure_type, cycle_length, start_date_flexible`. **Aceptación**: `tsc` verde y el
      contrato RN espeja el de web.
- [x] W3.3b `apps/mobile/lib/program-persistence.ts:89-102`: espejo RN de W2.1 — default
      `start_date_flexible ?? false` y `resolveProgramScheduleMetadata` devuelve **`{ start_date: null,
      end_date: null }`** para un programa nuevo flexible (R13/R21), sin reescribir la fecha de los
      programas existentes. **Aceptación**: test que fija `{ null, null }` en el caso flexible nuevo,
      la fecha de hoy en el no-flexible y la fecha guardada intacta al re-guardar.
- [x] W3.7b `apps/mobile/app/alumno/(tabs)/home.tsx:172-179` (R38; se lista acá por afinidad con la
      capa de datos RN): la lectura de 30 días **restaura las
      columnas** que hoy no trae (hoy es sólo fechas: `id, logged_at, exercise_name_at_log`) y pasa a
      ser la **MISMA lectura que web** (R10): `block_id`, `plan_id` (por el embed
      `workout_blocks ( plan_id )`, igual que
      `apps/web/src/app/c/[coach_slug]/dashboard/_data/dashboard.queries.ts:166-178`), `set_number`,
      `logged_at` y `metadata` (las omisiones). **Sin `target_date`: esa columna no existe en
      `workout_logs`** y pedirla devuelve `PGRST204`; la fecha de la completitud es
      `eva_santiago_day(logged_at)` (R11). `gte` de 30 días,
      `order('logged_at', { ascending: false })` y **el mismo `limit(200)`**. No se abre una tercera
      lectura: ésta es el insumo de `buildCycleCompletions` (W0.2b). **No se toca** la semanal
      serie-a-serie (`:185-191`, `limit(1000)`), que es la que sostiene el estado por día de la semana
      y por la que se hizo el recorte de columnas. Con dos estrategias distintas el mismo alumno vería
      «Día 2 de 3» en la PWA y «Día 1 de 3» en la app. **Aceptación**: un alumno con 6 sesiones de 30+
      series sigue viendo su semana completa (la lectura semanal no cambió) y, con el **fixture
      compartido en `packages/workout-engine`**, RN y web producen el mismo `completions` y el mismo
      `todayPlanId`; sin días completados en la ventana, ambas plataformas caen en **Día 1** (R10).
- [x] W3.5 `apps/mobile/app/alumno/(tabs)/home.tsx:350,400-412`: `derived` pasa por
      `resolveCycleCursor`, y el hero RN lee `programState` del resultado (R30) en vez de re-derivar
      «no empezado» de `start_date`. **Aceptación**: con el mismo `input`, RN y web devuelven el mismo
      `todayPlanId` **y el mismo `programState`** (fixture compartido en el paquete).
- [x] W3.6 `apps/mobile/components/alumno/workout/v3/weekly-streak.ts:94-103,171-201`: fuera
      `((dow-1)%7+7)%7`; `plannedDatesForWeek`/`planSlotDate` no aplican en ciclo. **Aceptación**:
      `tests/mobile/executor-v3-weekly-streak.test.ts` verde con casos de ciclo añadidos.
- [x] W3.7 `apps/mobile/lib/workout/substitution.ts:236-284`: filtro por tipo efectivo (R5), espejo
      exacto de W2.10. **Aceptación**: mismo resultado que web para el mismo bloque.
- [x] W3.x Share de entreno **RN** con `reps_done = min` (R3), repartido según R34:
      `apps/mobile/components/alumno/share/build-share-data.ts:55-61` (`topSetLabelFor`), `:109`
      (`totalReps`), `:110` (`totalVolumeKg`) y `:125` (`repsAtMax`) leen hoy `reps_done` crudo, así que
      sin esta tarea el share mostraría **la mitad** del volumen que el resumen de sesión (W0.6) y que
      el tonelaje del coach (W1.5). Con el helper `sideRepsFromMetadata` (W0.7): **`totalVolumeKg` pasa
      a `peso × (izq + der)`** cuando hay lados (misma fórmula que `session-summary`), mientras que
      **`topSetLabelFor` y `repsAtMax` siguen con `reps_done`** —el top set es una comparación entre
      series y cambiar su base rompería el orden— y `topSetLabel` imprime «10 / 10» a partir de la
      metadata. `SummaryLogLike` (`packages/workout-engine/session-summary.ts:43-52`, que hoy declara
      `block_id`, `set_number`, `weight_kg`, `reps_done` y los cuatro `actual_*`) **suma
      `metadata?: { left_reps?: number | null; right_reps?: number | null } | null`** (opcional, no
      rompe a los demás consumidores). (El no-objetivo declarado en OUTLINE §11 es el share **web**; el que existe hoy es el
      de RN.) **Aceptación**: test en `tests/mobile` con fixture **con** y **sin** metadata; sin
      metadata la salida es **byte-idéntica** a la de hoy; con «10 / 10 · 20 kg» el volumen del share
      coincide con el del resumen de sesión y el top set no cambia de serie.

### Capa de pantalla **[UI · Fable]** (requiere M6)

- [x] W3.8 **[UI · Fable]** Inicio del alumno RN: `components/alumno/home/ActiveProgramSection.tsx:109-117,446-449`,
      `home/WeekStrip.tsx`, `home/MomentumCard.tsx`, `home/StreakRibbon.tsx:18-87` con los 4 estados y
      «Empezar hoy». **Aceptación**: paridad visual con W2.11–W2.13 en device.
- [x] W3.9 **[UI · Fable]** Ejecutor RN por lado: `components/alumno/workout/SetRow.tsx:675-913` (dos
      campos de reps + un peso) y la línea de serie de `:450-454` llamando **`formatStrengthSetLine`**
      dentro de su rama de fuerza, con over/under, «PC» y RPE/RIR intactos (R19). El **chip
      «Por lado»/«Alternado» va en la fila de objetivo**:
      `components/alumno/workout/v3/ExerciseScreenV3.tsx:327-338` y
      `components/alumno/workout/SupersetGroupCard.tsx:428-429`, con `SIDE_LABEL[side_mode]` del motor.
      **`TypedTargetGrid.tsx` NO se toca** (la fuerza no entra al carril tipado, R18/R39). Resumen de
      sesión en `v3/SessionCompleteV3.tsx`. **Aceptación**: mismos valores guardados y misma línea de
      serie que en web para el mismo ejercicio; `TypedTargetGrid.tsx` sin diff.
- [x] W3.10 **[UI · Fable]** `components/alumno/workout/v3/ExecutorV3.tsx:555-557,562,649-651`: el
      teclado de **edición** admite lados **solo** en la rama `strength`. **Aceptación**: editar una
      serie de movilidad por lado **no** borra `{left_sec, right_sec}` (el aviso deliberado del código
      se levanta sin romper lo que protegía).
- [x] W3.11 **[UI · Fable]** Etiquetas de la biblioteca RN:
      `components/coach/programs/program-model.ts:93,180-183` (`dayLabel` → `programDayLabel`, de paso
      «Mié»/«Sáb» con tilde) y su consumidor `components/coach/programs/ProgramPreviewCard.tsx:83-87`.
      El consumidor es un **chip de 34 px** y con R31 la forma es **una sola**: `form: 'chip'` para
      ambas estructuras, porque `chip` en weekly devuelve `Lun`/`Mar`… (3 letras, idéntico a hoy para
      los **276** programas weekly) y en cycle devuelve «D1» —«Día 1» de `short` no entra en 34 px—.
      **Aceptación**: un programa de ciclo en la biblioteca muestra «D1», nunca «Lun»; **un programa
      weekly sigue mostrando «Lun», nunca «L»**.

## W4 · Coach web + RN

### Capa de datos (Opus)

- [x] W4.1 `apps/web/src/services/client/client-detail.service.ts:81-95`: el SELECT del programa
      activo suma `exercise_type_override, duration_sec, distance_value, distance_unit, hr_zone,
      interval_config, reps_value, reps_unit, side_mode` y `exercises ( …, exercise_type,
      cardio_modality )`. **Aceptación**: el bloque de cardio de un programa real deja de llegar como
      «Series × reps» al componente; sin regresión de tiempos en la ficha.
- [x] W4.2 `apps/mobile/lib/coach-client-detail.ts:806-815,142-157,952-967`: mismo SELECT + DTO
      `ProgramBlock` con los campos tipados y `side_mode`. **Aceptación**: paridad de payload con web
      para el mismo `clientId`.
- [x] W4.3 Cablear `stripFieldsForType` (W0.8) en
      `apps/web/src/app/coach/builder/[clientId]/components/BlockEditSheet.tsx:564-567` y
      `apps/mobile/components/coach/BlockEditorSheet.tsx:141-144` (R6, sin diálogo).
      **Aceptación**: cambiar el tipo y guardar deja el bloque **sin** campos del tipo anterior; se
      hace en el mismo commit que W4.1/W4.2 para que ningún residuo se vuelva visible.
- [x] W4.4 `defaultBlockForType` en `apps/mobile/components/coach/ExerciseSearchSheet.tsx:149-150` y
      `apps/mobile/app/coach/program-builder.tsx:82-88`. **Aceptación**: agregar un ejercicio de
      catálogo `cardio` en RN nace `cardio`, no `strength`.
- [x] W4.5 Default del toggle de inicio flexible a **false** en
      `apps/web/src/app/coach/builder/[clientId]/WeeklyPlanBuilder.tsx:186` y
      `apps/mobile/app/coach/program-builder.tsx:1214` (R2), en `weekly` **y** en `cycle` (R13).
      **Aceptación**: un programa nuevo nace con el toggle apagado; abrir uno existente respeta su
      valor guardado.
- [x] W4.6 `apps/web/src/app/coach/clients/[clientId]/profileProgramUtils.ts:79-100`: `isToday`
      (`:87`, `:98`) deja de marcar «Hoy» por coincidencia numérica en ciclo. **Aceptación**: un
      programa `cycle` de 3 días **no** ilumina el día 1 los lunes.
- [x] W4.7 Copy de invitación: `apps/mobile/components/coach/InviteStudent.tsx:214` («Tu alumno baja
      EVA, escribe este código y entra directo a tu app.» → copy canónico) y el mail admin
      `apps/web/src/lib/email/transactional-templates.ts:264-291`. **Aceptación**: caso nuevo en
      `tests/mobile/client-invite-copy.test.ts` (o regla eslint local, precedente
      `tools/eslint-rules/rules/store-plan-caption.mjs`) que falla si una superficie del coach dice
      «baja EVA».

### Capa de pantalla **[UI · Fable]** (requiere M6)

- [x] W4.8 **[UI · Fable]** Ficha web → Programa: `ProgramTabB7.tsx:281-284,482-484` (resumen tipado
      por bloque), `:666,684-687` (microciclo con «Día N de M»),
      `TrainingTabB4Panels.tsx:684-690` y la **pastilla de serie** de `:776-783`, que llama
      **`formatStrengthSetLine`** dentro de su rama de fuerza conservando over/under, «PC» y RPE/RIR
      (R19; `formatLoggedSetLine('strength')` sigue devolviendo `null`, así que la rama que hoy pinta la
      comparación objetivo↔hecho **no** se apaga). **Aceptación**: en «Performance Coto» (ciclo 3) el
      coach lee «Día 1 de 3 / Día 2 de 3 / Día 3 de 3» y cada bloque muestra su tipo real.
- [x] W4.9 **[UI · Fable]** Ficha RN: `components/coach/clientDetail/PlanTab.tsx:253,268-278,471,554-555`,
      `OverviewTab.tsx:420-474` («próximo entreno» por cursor, leyendo `programState`/`nextPlanId` del
      resultado, R30), `AnalisisTab.tsx:631` (la pastilla de serie llama `formatStrengthSetLine` en su
      rama de fuerza, R19, sin apagar over/under, «PC» ni RPE/RIR). **Aceptación**: paridad 1:1 con
      W4.8 en device.
- [x] W4.10 **[UI · Fable]** Builder «Lado»: `BlockEditSheet.tsx:823-871` y
      `BlockEditorSheet.tsx:296-329` con `Ninguno | Por lado | Alternado` (R4: `bilateral` fuera, 0
      filas en LIVE) + hint canónico; resumen con sufijo en `ExerciseBlock.tsx:272`,
      `StudentLivePreview.tsx:82`, `BuilderBlockCard.tsx:163`. **Aceptación**: guardar «Por lado» y
      abrir el ejecutor produce la captura de dos lados de W2.15.
- [x] W4.11 **[UI · Fable]** Copy del toggle «Inicio flexible (el alumno decide)» en
      `apps/web/src/app/coach/builder/[clientId]/components/ProgramConfigForm.tsx` y
      `apps/mobile/components/coach/ProgramConfigSheet.tsx`. **Aceptación**: el texto explica que el
      alumno elige cuándo empieza y que el ciclo arranca en «Día 1 de N».

## W5 · PWA / working tree

- [x] W5.1 Commiteado — verificado 2026-09-05: árbol limpio, `git ls-files` confirma trackeados los 9
      archivos del tren offline/SW (`apps/web/public/sw.js`,
      `apps/web/src/components/client/OfflineScreen.tsx` (+ `.test.tsx`),
      `apps/web/src/lib/client/clear-client-caches.ts` (+ `.test.ts`),
      `tests/pwa-sw-navigation.test.ts`, `apps/web/src/components/client/ClientNav.tsx`,
      `apps/web/src/app/c/[coach_slug]/layout.tsx`,
      `apps/web/src/app/c/[coach_slug]/_components/DemoViewerExit.tsx`,
      `apps/web/src/app/c/[coach_slug]/perfil/_components/ProfileClient.tsx`,
      `apps/web/src/app/c/[coach_slug]/suspended/_components/SuspendedSignOutButton.tsx`),
      `sw.js` en `591ea8cd` (03-09), integrado en `master`.
      **Aceptación**: `pnpm test` sin rojos nuevos **antes** de que W2–W4 mezclen.
- [x] W5.2 `apps/web/src/lib/client/clear-client-caches.test.ts:9-10` deriva los nombres de caché desde
      `apps/web/public/sw.js`. Hoy ese test guarda una **copia manual** (`SW_CACHES`) mientras la purga
      matchea por **PREFIJO** (`clear-client-caches.ts:18,31`): es exactamente el fallo que advierte
      `apps/web/public/sw.js:22-27` — un **rename** de caché deja los dos tests en verde y mata la purga
      del logout (fuga entre alumnos en un teléfono compartido). El test pasa a leer `sw.js`, extraer los
      4 nombres y afirmar que `NAV_CACHE` y `CLIENT_DATA_CACHE` **empiezan** por alguno de
      `STUDENT_DATA_CACHE_PREFIXES` y que `STATIC_CACHE` y el shell **no**. (`tests/pwa-sw-navigation.test.ts:38`
      **ya** deriva `NAV_CACHE` del source; lo único hardcodeado ahí es `SHELL_CACHE` en `:31`, que no
      participa de la purga.) **Aceptación**: renombrar `eva-nav-*` en `sw.js` sin tocar los prefijos deja
      el test en **rojo**.
- [x] W5.3 **[UI · Fable]** `apps/web/src/components/InstallPrompt.tsx:93-101`: el gate
      `hasCompletedFirstWorkout()` (`:97`) pasa a día 1 en Android Chrome cuando hay `canPrompt`,
      manteniendo *dismiss* de 30 días. Evento `pwa_install_prompt_shown {platform, day1}`.
      **Aceptación**: verificado contra `apps/web/src/lib/pwa/install-signals.ts` y el call site
      `WorkoutExecutionClient.tsx:2065` que **no** aparecen dos prompts (uno día 1 y otro tras el
      primer entreno); iOS conserva su camino de instrucciones manuales.

## W6 · Docs, gates y cierre

- [x] W6.1 SDD versionada en `docs/specs/ciclo-real-y-por-lado/` (SPEC.md, PLAN.md, TASKS.md,
      DATA-SECURITY.md) con frontmatter `status: draft` → `implemented-pending-qa`, `canonical: false`.
      **Aceptación**: `pnpm docs:check` verde.
- [x] W6.2 `docs/specs/workout-day-in-progress/SPEC.md:23-25`: hoy declara «la racha (RPC
      `get_client_current_streak`, 7 reglas CEO) **NO se toca en v1**», que este tren contradice.
      Actualizar en el **mismo commit** (`docs/README.md:79`: `status: active` exige mantenimiento en
      el cambio que altera su verdad). **Aceptación**: el SPEC apunta a esta SDD para la rama `cycle`.
- [x] W6.3 `docs/status/CURRENT.md`: punto nuevo con el patrón
      `N. **Título — ESTADO** ([tareas] → ruta desde docs/status: ../specs/ciclo-real-y-por-lado/TASKS.md, hash/deploy/OTA): …`.
      **Aceptación**: el archivo queda **≤ 16 KB** (`scripts/check-docs.mjs:117-119`; hoy 7 037 bytes)
      y `pnpm docs:check` verde.
- [x] W6.4 `docs/status/MOBILE_PARITY.md`: bloque `>` nuevo arriba del «Resumen ejecutivo» con
      hash, deploy y ambos hashes de OTA, declarando **por punto** qué es «Solo web», «Solo RN» o
      paridad nueva. **Aceptación**: los 4 puntos del feedback aparecen con su plataforma explícita.
- [x] W6.5 `docs/operations/MOBILE_RELEASES_OTA.md`: registrar la publicación (tag, grupos android/ios
      y `run id`). **Aceptación**: las dos corridas quedan citadas y verdes.
- [x] W6.5b Aviso a los coaches afectados (redacción + envío), con los dos puntos que el tren acepta — **ENVIADO 2026-09-05 ~18:10Z** por correo (Resend, 14 destinatarios, batch `w65b-ciclo-por-lado-20260905`) por orden explícita del owner; registro en TESTING-QA §11
      como cambio visible: (a) en bloques `per_side` con **historial sumado**, el PR por e1RM puede no
      dispararse; el PR por peso sigue funcionando (R22, 11 coaches con bloques `per_side`); (b) **flota
      mixta** (R35): los clientes en 1.1.2 sin la OTA escriben logs sin metadata —válido— y ven
      `reps_done` (el lado más bajo) en bloques por lado hasta actualizar, y `fallbackToCacheTimeout`
      puede darles un arranque con bundle viejo. **Aceptación**: el texto sale después del deploy web y
      antes de la OTA, y queda citado en `TESTING-QA.md`.
- [x] W6.6 Memoria del owner: actualizar los ganchos de `project_ejecutor_entreno.md`,
      `project_rn_paridad_web.md` y `project_coaches_casos.md` (caso Movens). **Aceptación**: índice
      de memoria ≤ 45 líneas, sin estado de repo duplicado.
- [x] W6.7 **Gates completos, ejecución real** (tabla abajo). **Aceptación**: ninguna casilla verde
      sin salida de consola.
- [ ] W6.8 Playwright del ejecutor **solo al cierre**, 1 navegador: `pnpm test:e2e` del flujo de
      registro de serie. **Aceptación**: verde o, si falla por entorno, causa anotada y decisión del
      owner. **Nota 05-09: se ejecuta por GitHub Actions (`gh workflow run CI --ref master`, job `e2e`
      con los secrets `E2E_*`) en la sesión de gates; no hace falta `.env.local`.**
- [x] W6.9 Deploy web a Vercel desde `rnmobiledenuevo` = `master`. **Orden obligatorio del tren (R35):
      deploy web → migraciones → OTA.** **Aceptación**: `deployment id` en estado READY anotado en
      CURRENT y MOBILE_PARITY. **El deploy web sale ANTES de la OTA** (si la OTA saliera primero, RN
      escribiría `left_reps`/`right_reps` que la web todavía estripa).
- [x] W6.9b Aplicar en LIVE las **4 migraciones** (W1.2, W1.4, W1.5, W1.5b) **después** del deploy web
      y **antes** de la OTA (R35), cada una precedida de su validación con tx-rollback y `EXPLAIN`
      (W1.1, W1.5). **Aceptación**: las 4 aparecen en `list_migrations` con su timestamp, y
      `has_function_privilege` confirma la ACL final de la tabla del protocolo LIVE: `authenticated`
      **con** EXECUTE en las cuatro; `anon` y `PUBLIC` **sin** EXECUTE en las cuatro; `service_role`
      **sin** EXECUTE **sólo** en `client_start_workout_program` y **con** EXECUTE en
      `get_client_current_streak`, `get_client_daily_tonnage` y `get_client_muscle_volume` (R16 fija el
      patrón `REVOKE … FROM PUBLIC, anon, service_role` antes del GRANT; las tres RPC de lectura
      re-grantean a `service_role` a propósito después).
- [x] W6.10 OTA 1.1.2 android + ios por `.github/workflows/mobile-ota.yml` (publicar a mano está
      prohibido por runbook), **última del orden de R35**. Antes: releer el estado real en App Store
      Connect con `ios-submit-review.yml` en `dry_run=true` para confirmar el piso.
      **Aceptación**: los dos grupos EAS Update verdes, con hash y `run id` anotados.

### Gates (tabla a completar con la ejecución real)

| Gate | Comando | Resultado |
|---|---|---|
| Tests | `pnpm test` | 699 archivos / 9 275 tests / 0 fallos (04-09) |
| Typecheck web | `pnpm typecheck` | verde |
| Typecheck mobile | `pnpm --filter @eva/mobile exec tsc --noEmit` | verde |
| Bundle mobile | `pnpm --filter @eva/mobile exec expo export --platform android` | no local (regla del owner): lo hizo `mobile-ota.yml`, runs 33829397531 / 33829399862 verdes |
| Lint | `pnpm lint` | 0 errores, 530 warnings preexistentes |
| Tokens | `pnpm check:tokens` | OK (86 + 5 tokens) |
| Docs | `pnpm docs:check` | OK |
| E2E ejecutor | `pnpm test:e2e` | NO corrió: faltan `E2E_COACH_SLUG`, `E2E_CLIENT_EMAIL`, `E2E_CLIENT_PASSWORD` en `.env.local` (decisión del owner, W6.8) |
| SQL equivalencia | diff weekly = 0 filas + `EXPLAIN` + `ROLLBACK` | 0 filas weekly (91 clientes), EXPLAIN 50,8→12,8 ms; ROLLBACK (DATA-SECURITY §1.3) |

## QA del owner (solo contra algo desplegado; 3 plataformas)

**Resultado 2026-09-04 — VERDE.** Reporte global del owner contra el deploy `dpl_DZ76aJq5…` + OTA 1.1.2
(`fd2e1212` / `248580e4`): ciclo N-días y fuerza por lado OK, sin Q# fallido. El veredicto fue global, no casilla
por casilla: la lista de abajo queda como guía del recorrido. SDD → `done`. Quedaban abiertos W6.5b (aviso a
coaches, §11 de TESTING-QA; **enviado el 05-09**) y W6.8 (E2E local sin variables `E2E_*`, sigue abierto).

**Cierre casilla por casilla 2026-09-05 — Q1…Q17 en `[x]`.** El owner corrió la sesión única de QA de cierre
siguiendo el guion del artifact `6bd32370-a460-42d6-9f2f-128e07c11bca` (102 verificaciones en 11 áreas) y la
declaró **VERDE COMPLETO**. Evidencia canónica de este archivo: **QA del owner VERDE 05-09 (sesión única,
artifact `6bd32370`, Android 1.1.2 build 86 / iOS 1.1.2 build 59 con OTA del 04-09 android `d8220490` / ios
`54487ddd`, web `www.eva-app.cl` deploy `dpl_ASZExsTB…` = `f9ba8a3f`)**. W6.5b se cerró aparte el mismo día (correo
a 14 coaches, ver §11 de TESTING-QA); W6.8 sigue abierto.

### Web desktop (Chrome, light y dark)

- [x] Q1 Ficha del alumno de Movens con el programa **«Performance Coto» (ciclo de 3)** → pestaña
      Programa: el microciclo dice «Día 1 de 3 / Día 2 de 3 / Día 3 de 3» y **ningún** «Lun/Mar/Mié».
- [x] Q2 En esa misma ficha, un bloque de cardio o movilidad muestra su resumen tipado (no
      «Series × reps» con mancuerna) y el bloque **«Remo a un brazo con kettlebell»** muestra el
      sufijo de lado.
- [x] Q3 Ningún día marcado «Hoy» por coincidencia numérica (abrir un lunes o simular).
- [x] Q4 Builder: cambiar el tipo de un bloque de fuerza a cardio y volver deja el bloque limpio;
      «Lado» ofrece solo `Ninguno | Por lado | Alternado`.
- [x] Q5a Un programa **weekly** de otro coach: el **Inicio del alumno** y el **microciclo weekly** se
      ven exactamente igual que antes del deploy (comparar con la captura previa, tomada **antes** de
      desplegar — criterio duro de D1: weekly no cambia ni un byte de comportamiento).
- [x] Q5b En la **ficha weekly** del coach, en cambio, los resúmenes tipados por bloque y el selector
      «Lado» **SÍ** son nuevos: W4.1, W4.3, W4.5, W4.8 y W4.10 cambian esas pantallas a propósito para
      **todos** los coaches. Es cambio esperado, **no** regresión: no revertir nada por este QA.
- [x] Q5c **Control weekly del coach** (R37): en un programa weekly de otro coach, la **ficha** sigue
      diciendo «Lun/Mar/Mié» (nunca «Día N») y el **builder** weekly se ve igual que antes salvo los
      cambios esperados de Q5b (resumen tipado y selector «Lado»).

### PWA móvil (Android Chrome, 390 px, instalada y sin instalar)

- [x] Q6 Alumno de Movens con ciclo sin empezar: hero «Tu programa está listo · Día 1 de 3» con
      «Empezar hoy» como **única** acción (no hay «Elegir otra fecha», R14); al tocarlo pasa a «Hoy
      toca · Día 1 de 3».
- [x] Q7 Entrenar el día 1 y cerrarlo: el hero pasa a «Día 1 hecho · Próximo: Día 2 de 3»; al día
      siguiente (o al volver a entrar) toca el **día 2**, no el día del calendario.
- [x] Q8 **«Remo a un brazo con kettlebell»**: la serie pide «Izq» y «Der» + un peso; registrar
      10 / 10 con 20 kg muestra «20 kg × 10 / 10» y el chip «Por lado».
- [x] Q9 Registrar una serie por lado **en avión** y volver a tener red: los dos lados sobreviven al
      drenado de la cola.
- [x] Q10 Racha del alumno de Movens **> 0** (hoy es 0 en los 5 alumnos con logs).
- [x] Q10b En modo ciclo, el anillo «Entrenos» muestra **«—» con «Sin meta semanal»** (nunca un
      porcentaje) y la tira semanal sigue siendo Lun→Dom de días entrenados, sin «Recuperar» (R12).
- [x] Q11 El prompt de instalar aparece el día 1 y, al descartarlo, no vuelve por 30 días; no
      aparecen dos prompts.
- [x] Q11b **Control weekly en PWA** (R37): un alumno con programa **weekly** ve su Inicio exactamente
      igual que antes del deploy (anillo con porcentaje, grilla y «Recuperar» incluidos).

### RN device (app 1.1.2, después de aplicar la OTA)

- [x] Q12 Mismo recorrido Q6–Q10 en la app: hero, «Empezar hoy», día 2 tras cerrar el 1, captura por
      lado y resumen de sesión con «10 / 10».
- [x] Q13 Editar una serie de **movilidad** por lado desde el teclado de edición **no** borra el hold
      guardado.
- [x] Q14 Ficha del coach en RN: mismo «Día N de 3» y mismos resúmenes tipados que en web (Q1–Q2).
- [x] Q15 Biblioteca de programas en RN: un programa de **ciclo** muestra «D1/D2/D3», nunca «Lun»; y un
      programa **weekly** mantiene el chip de 3 letras con la misma inicial que antes de la OTA (nunca
      «L/M/M»): la **única** diferencia admitida respecto de hoy son las tildes de «Mié» y «Sáb»
      (OUTLINE §11); el resto de los días sale byte-idéntico.
- [x] Q16 Hoja «Invitar alumno»: el copy ya no dice «Tu alumno baja EVA».
- [x] Q17 Un alumno con programa **weekly** en la app se ve igual que antes de la OTA.

## Backlog heredado (para próximas sesiones; ninguno bloquea)

| # | Deuda | Dónde | Costo estimado |
|---|---|---|---|
| B1 | Meta semanal de sesiones en programas `cycle` (D1 la deja fuera; R12 pone el anillo «Entrenos» en `null` con «Sin meta semanal» hasta entonces). | motor + racha | 1 día |
| B2 | Pesos distintos por lado (`left_weight`/`right_weight`): D2 fija un solo peso. **No** declarar los campos «por las dudas» — sería otro control muerto como el del punto 2 del feedback. | `packages/schemas/workout.ts` | 1,5 días |
| B3 | «Elegir otra fecha» al empezar un programa flexible (R14 lo saca del tren: la RPC sólo acepta hoy). | RPC + hero web/RN | 0,5 día |
| B4 | `get_workout_program_planned_set_totals` con `EXECUTE` concedido a `PUBLIC` (hallazgo colateral de grants). | `supabase/migrations` | 30 min |
| B5 | `is_unilateral` sigue muerta en `packages/plan-builder/types.ts:17,63,78`. | plan-builder | 30 min |
| B6 | Bloques con `sets: 6` que el coach escribió pensando «3 por lado» (sobre-prescripción heredada, sin contar): con el ejecutor honrando el lado pasan a 12 series efectivas. | datos LIVE + aviso en builder | 1 día |
| B7 | 4 bloques (3 coaches) con texto «10 por pierna» en `reps` y **sin** flag `side_mode`: aviso no bloqueante en el builder, sin migración de texto. | builders web + RN | 0,5 día |
| B8 | Tildes de `DAY_LABELS` («Mie», «Sab») si W3.11 no alcanza a limpiarlas. | `apps/mobile/components/coach/programs/program-model.ts:93` | 10 min |
| B9 | Índice `INCLUDE (metadata)` para el tonelaje si el `EXPLAIN` de W1.5 sube más de 2× (R26: seguimiento, no este tren). | `supabase/migrations` | 30 min |
| B10 | Fuera de alcance por decisión del owner: actividad externa / yoga como tipo nuevo · Play a producción (calendario 05-09) · Cobros coach→alumno · Share de entreno web. | — | — |
