---
status: active
owner: product-engineering
last_verified: "2026-09-30"
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

> **Estado W4 (30-09): HECHO y commiteado local en `rnmobiledenuevo` (sin push, sin OTA).** Misma arquitectura
> que la web: `components/alumno/workout/weight-unit-context.tsx` (nuevo) con `useWeightUnitState` en `ExecutorV3`
> (unidad por EJERCICIO efectivo: elegida en la sesión → última de hoy → `lastWeightUnitByExercise` del historial →
> `load_unit` → kg) + `WeightUnitProvider`; `useBlockWeightUnit` (fila, pantallas) y `useWeightUnitLookup` (serie
> logueada, superserie). Los valores tecleados viajan al borrador con la marca `wu` (sin marca = kg) y
> `valuesInWeightUnit` los deja en la unidad del ejercicio; la conversión a kg ocurre UNA vez, en el payload del
> motor (`weightUnit` en el contexto). `weight_unit` se escribe SIEMPRE junto al peso (online y cola), igual que la
> acción web; los re-envíos armados desde un log (esfuerzo, reloj importado) repiten la unidad del log.

- [x] **W4.1** Selector en `TypedKeypad.tsx`/`KeypadHost.tsx` y `v3/DualWheelPicker.tsx`. — `WeightUnitToggle`
  (kg | lb, mockup) sobre el campo de peso del teclado de la fila y del de edición; chips en lb con paso propio en
  memoria (`useKeypadStepLb`, presets 1 · 2,5 · 5 · 10); pestaña/unidad del peso siguen al selector; la rueda usa
  `WHEEL_WEIGHT_SPECS` por unidad (sin selector propio, igual que la web). El teclado de edición separa los campos
  de la siembra de los rotulados: cambiar de unidad convierte lo escrito, nunca re-siembra.
- [x] **W4.2** Lecturas en la unidad. — `SetRow` (línea de serie logueada), `ActiveSetRow` (tiles, sugerencia a
  2,5 lb, «Anterior»/rueda por autollenado con unidad), `ExerciseScreenV3` y `SupersetScreenV3` (prescripción,
  «Anterior», récord en vivo, objetivo del teclado, rueda), `overloadChipLabel` con unidad, «Serie N» del descanso
  y prescripción del siguiente en el interstitial, `PrCelebration` en la unidad tecleada. **Queda en kg a propósito
  (v1, igual que la web):** volumen/tonelaje de `SessionCompleteV3`. `SingleExerciseCard`/`SupersetGroupCard` no
  pintan fuerza en V3 (la fuerza va por `ExerciseScreenV3`; `SupersetGroupCard` no se monta).
- [x] **W4.3** `lib/workout-session.ts` + cola offline con `weight_unit`. — select de las series del día y del
  historial con `weight_unit` + `lastWeightUnitByExercise` (misma regla que la web); `logData` y `enqueueLog`
  escriben `weight_unit`; `reconciledToOfflineLog` conserva la unidad en el snapshot; el reloj de fuerza por tiempo
  (`use-hold-module`) toma la unidad de la marca `wu` de los valores que mezcla.
- [x] **W4.4** Builder RN. — `TargetWeightField` en `components/coach/BlockEditorSheet.tsx` (número + kg | lb
  pegado; guarda kilos a centésimas, muestra/recibe libras; escribe `load_unit` + `load_type = 'weight'`, que el
  serializador ya propaga) + `lib/plan-builder/target-weight.ts` (espejo de `_lib/target-weight.ts` web), también en
  `ProgramPreviewSheet` y en la tarjeta del plan de la ficha (`PlanTab`, `load_unit` en el select).
- [x] **W4.5** Ficha del coach RN: «20.41kg (45 lb)» en la línea de serie (`AnalisisTab`, clásica y por tiempo con
  `annotateEntered`) + `weight_unit` en el select de `lib/coach-client-detail.ts`.
- **Gates W4 (30-09, salida real):** `tsc --noEmit` mobile exit 0; `vitest run tests/mobile packages/workout-engine`
  **200 archivos / 3.040 tests ✓** (nuevos: `tests/mobile/kg-lb-keypad-host.test.ts` 5 — libras a kilos una sola vez,
  sin selector byte-idéntico, objetivo a 2,5 lb, cambio de unidad sin doble conversión —; `tests/mobile/kg-lb-helpers.test.ts`
  13); eslint de los 25 archivos tocados 0 errores (21 advertencias, todas previas). `expo export` y QA en device:
  NO hechos (van con W6).

## W5 · Datos viejos (D4)

**D4 cambió de (a) a (b) por el owner 30-09** («B pero con backup»): se convierte TODO lo de bloques `lb`, sin
confirmar coach por coach. W5.1/W5.2 quedan sin objeto.

- [x] **W5.3** Conversión en LIVE 30-09 con `supabase/migrations/_POST_DEPLOY_20260930150000_kg_lb_convert_lb_blocks.sql`
  (reversa: `…_rollback.sql`). Respaldo en `_bak_kg_lb_20260930_logs` (315) y `_bak_kg_lb_20260930_blocks` (11), RLS
  on y 0 grants a anon/authenticated/PUBLIC. Verificado: 315/315 series con `weight_unit = 'lb'` y `weight_kg`
  convertido (0 descuadres contra el respaldo), 11/11 objetivos convertidos (35 → 15,88 · 190 → 86,18 · 210 → 95,25),
  0 series `lb` pendientes. Muestra: Pushdown 40 → 18,14 kg; Jalón 70 → 31,75 kg.
- [ ] **W5.4** Barrido post-OTA: volver a correr SOLO la Parte A del mismo SQL cuando la adopción del OTA sea alta
  (cliente viejo en un bloque `lb` escribe libras sin unidad). La Parte B no se repite (el builder nuevo guarda kilos).
  — Medido 02-10 (solo lectura): **0 series pendientes** (bloque `lb` + peso + sin unidad); en 24 h, 295 de 313 series
  de fuerza traen unidad y 18 de 19 alumnos ya escriben con cliente nuevo. Verificado que un cliente nuevo con el
  selector en kg escribe `'kg'` (no NULL), así que la Parte A no confunde kilos nuevos con libras viejas.
- ⚠️ Corrido ANTES del deploy (decisión del owner): hasta que salgan web + OTA, la web y la app en prod muestran estas
  series y objetivos en kilos (40 lb → «18,14 kg»). Límite conocido: un cliente viejo que EDITE una serie ya convertida
  escribe libras con `weight_unit = 'lb'` ya puesto y el barrido no la detecta (raro: editar series pasadas).

## W6 · Gates y salida

- [x] **W6.1** Gates proporcionales por ola; suite completa una vez al cierre (30-09, ver «Retomar»).
- [x] **W6.2** 30-09: `master` `872b3e4c..759b47d1` (fast-forward) ⇒ Vercel prod `dpl_AouZB5An…` success; OTA 1.1.3
  android `24d7a59f` (run 36761118795) / ios `6c11fb23` (run 36761141098), ambos success y listados en
  `eas update:list --branch production`. Android 1.1.2 SIN port (decisión: lo cubre el barrido W5.4).
- [ ] **W6.3** QA del owner (SPEC §7) ⇒ SDD `done`.

## Retomar (30-09)

W1–W4 en producción 30-09 (web `759b47d1` + OTA 1.1.3 android `24d7a59f` / ios `6c11fb23`); W5.3 datos convertidos en
LIVE con respaldo (D4 = b). Gates W6.1 sobre `e0d25d93`: typecheck web 0 errores; vitest completo 827 archivos / 11.491
tests pasan, 0 fallan; `expo export --platform android` OK. **Quedan:** W5.4 barrido (re-correr SOLO la Parte A del SQL
cuando la adopción del OTA sea alta; revisar antes cuántas series `lb` sin unidad hay) y W6.3 QA del owner SPEC §7.
