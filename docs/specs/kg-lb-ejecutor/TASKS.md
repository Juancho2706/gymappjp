---
status: active
owner: product-engineering
last_verified: "2026-09-26"
canonical: false
---

# TASKS — Kilos o libras en el ejecutor

Ver [SPEC](SPEC.md) · [PLAN](PLAN.md). **Ningún checkbox se marca sin gate real o QA del owner.**
Push, deploy, OTA y cualquier `UPDATE` de datos en LIVE **solo a pedido del owner**.

## W0 · Decisiones y mockup

- [x] **W0.1** Owner responde D1–D5 (SPEC §4). — 26-09: todas (a) (columna nueva, última unidad por ejercicio, selector junto a «Peso objetivo», confirmar con cada coach, kg + «(45 lb)»).
- [x] **W0.2** Owner aprueba el mockup del selector (ejecutor + builder). — 26-09: «aprobado tal cual» (artifact `WDwkaKEaKCjQneH7dtYUkG`).

## W1 · Motor y schema

- [x] **W1.1** `packages/workout-engine/weight-unit.ts`: `KG_PER_LB = 0.45359237`, `toKg`, `fromKg`,
  `roundForUnit`, presets de rueda y teclado por unidad. Tests de ida y vuelta. — 26-09: `weightToKg`,
  `weightFromKg`, `convertTypedWeight` (cambio de selector), `resolveInitialWeightUnit` (D2),
  `suggestedWeightInUnit` (2,5 lb), `WHEEL_WEIGHT_SPECS`, `KEYPAD_STEP_PRESETS_LB`/`DEFAULT_KEYPAD_STEP_LB`;
  ida y vuelta exacta con `numeric(6,2)` para 16 valores (0–999 lb) en `weight-unit.test.ts`.
- [x] **W1.2** Formateadores con unidad: `formatWeightEsCl`, `formatStrengthSetLine`, línea de fuerza por
  tiempo (`logged-set-summary.ts`). Los tests viejos en kg siguen verdes sin tocarlos. — 26-09:
  `formatLoggedWeight` + 2º argumento opcional `{ unit, annotateEntered }` en `formatStrengthSetLine` y
  `formatStrengthTimeSetLine` («45 lb» alumno · «20,4 kg (45 lb)» coach); `LoggedSetLike.weight_unit`.
  `formatWeightEsCl` no cambia (es texto del teclado, sin unidad).
- [x] **W1.3** `set-log-payload.ts`: único punto de conversión; agrega `weight_unit`. — 26-09:
  `TypedKeypadContext.weightUnit` → `buildStrengthPayload`/`buildStrengthTimePayload` convierten a kg y
  agregan `weightUnit` solo si hay unidad (sin ella, byte-idéntico); `OptimisticLogPayload`,
  `WorkoutOfflineLog` y `ReconciledSessionLog` cargan la unidad (optimismo y cola offline).
- [x] **W1.4** `WorkoutLogSetSchema.weight_unit` opcional (`packages/schemas/workout.ts`). — 26-09:
  `z.enum(['kg','lb']).optional()` + test.
- **Gates W1 (26-09, salida real):** `vitest run packages/workout-engine packages/schemas/workout.test.ts`
  41 archivos / 960 tests ✓ (40 nuevos en `weight-unit.test.ts`); ejecutor web + cola offline + ficha del
  coach + `tests/mobile` 181 archivos / 2.381 tests ✓; `pnpm typecheck` exit 0; mobile `tsc --noEmit`
  exit 0; eslint de los 10 archivos tocados exit 0. Sin UI todavía: nada cambia para el usuario.

## W2 · Base de datos (si D1 = a)

- [x] **W2.1** Migración aditiva `workout_logs.weight_unit text` (nullable, sin CHECK), validada con
  `BEGIN`/`ROLLBACK` en LIVE y aplicada solo con OK del owner. — 26-09: archivo
  `supabase/migrations/20260926163000_workout_logs_weight_unit.sql` (`SET LOCAL lock_timeout = '5s'`).
  Previo en LIVE: columna inexistente, ~29.800 filas / 18 MB, sin vistas dependientes, ninguna función con
  `INSERT` sin lista de columnas ni `%rowtype`, grants a nivel de tabla. Dry-run en transacción descartada:
  `text`, nullable, sin default, 0 filas con valor. **Aplicada con OK del owner** (versión remota
  `20260926171235`, nombre `workout_logs_weight_unit`): 0 locks en espera, sin errores en `postgres_logs`.
  Insert de prueba dentro de un `DO` que termina en `RAISE EXCEPTION` (rollback garantizado): `weight_kg`
  20.41 + `weight_unit` 'lb' aceptados y el trigger `trg_workout_logs_set_exercise_id` completó `exercise_id`;
  después 29.813 filas, 0 con unidad (nada quedó). Rollback: `DROP COLUMN IF EXISTS weight_unit` en un archivo nuevo.
- [x] **W2.2** `database.types.ts` a mano (sin regen completo). — 26-09: `weight_unit` en Row/Insert/Update de
  `workout_logs` (`apps/web/src/lib/database.types.ts`); RN usa el cliente sin tipos generados (nada que
  tocar). `pnpm typecheck` exit 0.

## W3 · Web

> **Estado W3 (26-09): HECHO y commiteado local (sin push). Pausa pedida por el owner ⇒ sigue W4 RN.** Arquitectura: `weight-unit-context.tsx` (nuevo) con `useWeightUnitState` en
> `WorkoutExecutionClient` (unidad por EJERCICIO efectivo: elegida en la sesión → última usada hoy →
> `lastWeightUnitByExercise` del historial → `load_unit` del bloque → kg) + `WeightUnitProvider`;
> `useBlockWeightUnit` (filas) y `useWeightUnitLookup` + `weightNum`/`suggestionNum` (lecturas). Sin
> provider todo queda byte-idéntico. La conversión a kg del submit web vive en `LogSetForm.handleSubmit`
> (`weightToKg`, una sola vez).

- [x] **W3.1** Selector en la rueda y el teclado (`v3/DualWheelPicker.tsx`, `v3/wheel-range.ts`,
  `WorkoutKeypadProvider.tsx`). — selector kg | lb en `NumericKeypadSheet` (mockup), pestaña/unidad/chips
  (presets lb 1·2,5·5·10, paso lb en memoria) y objetivo/«última vez» convertidos; rueda con
  `WHEEL_WEIGHT_SPECS` por unidad; en escritorio la etiqueta «KG ⇄» del tile ES el selector (V3 y clásico).
- [x] **W3.2** Lecturas en la unidad: prescripción, «Última vez», autollenado, sugerencia, línea de serie,
  récord y resumen (`v3/ExerciseStepV3.tsx`, `v3/SupersetStepV3.tsx`, `v3/PrCelebration.tsx`,
  `v3/SessionCompleteV3.tsx`). — hecho en ExerciseStepV3, SupersetStepV3, SingleExerciseCard,
  SupersetGroupCard, recap colapsado, chips/detalle de progresión, «siguiente» del descanso, línea «Serie N»
  del descanso, chip de serie guardada y PrCelebration. **Queda en kg a propósito (v1):** volumen/tonelaje
  de `SessionCompleteV3` (suma ejercicios de unidades distintas).
- [x] **W3.3** Payload y borrador (`_actions/workout-log.actions.ts`, `workout-draft-store.ts`) + lectura
  de `weight_unit` en `_data/workout-execution.queries.ts`. — la acción escribe `weight_unit` SIEMPRE junto
  al peso (`?? null` = kg); cola offline (`lib/workout-offline-queue.ts`) serializa `weightUnit`; borrador
  guarda `wu` y convierte al rehidratar; consultas leen `weight_unit` y arman `lastWeightUnitByExercise`.
  **Bug encontrado por el test y corregido:** el `<input type=number>` de escritorio tenía `step="0.5"` ⇒
  44,1 lb o 22,68 kg daban `stepMismatch` y el navegador bloqueaba el envío en silencio; con el selector
  activo el paso es `any`.
- [x] **W3.4** Builder: selector junto a «Peso objetivo» (`BlockEditSheet.tsx`), sin el duplicado de
  «Ejes adicionales». — `TargetWeightField` (guarda kg a centésimas, muestra/recibe lb) +
  `_lib/target-weight.ts` (también en `StudentLivePreview` y `PrintProgramDialog`).
- [x] **W3.5** Ficha del coach: «(45 lb)» en la línea de serie. — `TrainingTabB4Panels.tsx` (serie clásica y
  por tiempo con `annotateEntered`) + `weight_unit` en el select de `services/client/client-detail.service.ts`.
- [x] **W3.6** Gates de cierre de W3 + commit local. — 26-09: vitest (ejecutor web, builder, ficha, cola
  offline, services/client, workout-engine, schemas, tests/mobile) **297 archivos / 4.336 tests ✓**; tests
  nuevos `LogSetForm.weight-unit.test.tsx` (7) y `_lib/target-weight.test.ts` (3); `tsc --noEmit` web exit 0;
  eslint de los archivos tocados 0 errores (3 warnings preexistentes). QA visual en navegador: NO hecho
  (va con el QA del owner, SPEC §7).

## W4 · RN

- [ ] **W4.1** Selector en `TypedKeypad.tsx`/`KeypadHost.tsx` y `v3/DualWheelPicker.tsx`.
- [ ] **W4.2** Lecturas en la unidad (`SetRow.tsx`, `SingleExerciseCard.tsx`, `SupersetGroupCard.tsx`,
  `v3/ExerciseScreenV3.tsx`, `v3/SupersetScreenV3.tsx`, `v3/PrCelebration.tsx`, `v3/SessionCompleteV3.tsx`).
- [ ] **W4.3** `lib/workout-session.ts` + cola offline con `weight_unit`.
- [ ] **W4.4** Builder RN (`app/coach/program-builder.tsx`, `lib/plan-builder/serialize.ts`).

## W5 · Datos viejos (D4)

- [ ] **W5.1** Lista por coach de ejercicios en bloques `lb` con series y objetivos sospechosos.
- [ ] **W5.2** El owner confirma con cada coach (mensaje lo manda el owner).
- [ ] **W5.3** `UPDATE` en transacción con tabla de respaldo y rollback escrito, solo lo confirmado.
- ⚠️ **Antes del deploy web:** los 11 bloques `lb` con `target_weight_kg` escrito en libras (doblementefit 6,
  monkey 4, robin-coach 1) pasarán a mostrarse CONVERTIDOS (132,5 → «292,1 lb»). Corregir esos 11 objetivos
  (con OK del owner) en el mismo corte del deploy, o avisar a esos coaches.

## W6 · Gates y salida

- [ ] **W6.1** Gates proporcionales por ola; suite completa una vez al cierre.
- [ ] **W6.2** Deploy web + OTA doble, solo a pedido del owner.
- [ ] **W6.3** QA del owner (SPEC §7) ⇒ SDD `done`.

## Retomar (pausa del 26-09)

W1 (motor) + W2 (columna en LIVE) + W3 (web) hechos, commits locales SIN push. Siguiente: **W4 RN**
(ejecutor RN: `SetRow`, `TypedKeypad`/`KeypadHost`, `v3/DualWheelPicker`, pantallas V3,
`lib/workout-session.ts` + cola offline, builder RN `app/coach/program-builder.tsx` +
`lib/plan-builder/serialize.ts`, ficha coach RN) con la misma arquitectura que la web
(contexto por ejercicio + conversión única al guardar + lecturas con `weightNum`/`suggestionNum`).
Después: W5 (datos viejos, con OK) y W6 (gates completos, deploy web + OTA doble, QA del owner).
