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

- [ ] **W1.1** `packages/workout-engine/weight-unit.ts`: `KG_PER_LB = 0.45359237`, `toKg`, `fromKg`,
  `roundForUnit`, presets de rueda y teclado por unidad. Tests de ida y vuelta.
- [ ] **W1.2** Formateadores con unidad: `formatWeightEsCl`, `formatStrengthSetLine`, línea de fuerza por
  tiempo (`logged-set-summary.ts`). Los tests viejos en kg siguen verdes sin tocarlos.
- [ ] **W1.3** `set-log-payload.ts`: único punto de conversión; agrega `weight_unit`.
- [ ] **W1.4** `WorkoutLogSetSchema.weight_unit` opcional (`packages/schemas/workout.ts`).

## W2 · Base de datos (si D1 = a)

- [ ] **W2.1** Migración aditiva `workout_logs.weight_unit text` (nullable, sin CHECK), validada con
  `BEGIN`/`ROLLBACK` en LIVE y aplicada solo con OK del owner.
- [ ] **W2.2** `database.types.ts` a mano (sin regen completo).

## W3 · Web

- [ ] **W3.1** Selector en la rueda y el teclado (`v3/DualWheelPicker.tsx`, `v3/wheel-range.ts`,
  `WorkoutKeypadProvider.tsx`).
- [ ] **W3.2** Lecturas en la unidad: prescripción, «Última vez», autollenado, sugerencia, línea de serie,
  récord y resumen (`v3/ExerciseStepV3.tsx`, `v3/SupersetStepV3.tsx`, `v3/PrCelebration.tsx`,
  `v3/SessionCompleteV3.tsx`).
- [ ] **W3.3** Payload y borrador (`_actions/workout-log.actions.ts`, `workout-draft-store.ts`) + lectura
  de `weight_unit` en `_data/workout-execution.queries.ts`.
- [ ] **W3.4** Builder: selector junto a «Peso objetivo» (`BlockEditSheet.tsx`), sin el duplicado de
  «Ejes adicionales».
- [ ] **W3.5** Ficha del coach: «(45 lb)» en la línea de serie.

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

## W6 · Gates y salida

- [ ] **W6.1** Gates proporcionales por ola; suite completa una vez al cierre.
- [ ] **W6.2** Deploy web + OTA doble, solo a pedido del owner.
- [ ] **W6.3** QA del owner (SPEC §7) ⇒ SDD `done`.
