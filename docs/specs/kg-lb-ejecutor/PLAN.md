---
status: active
owner: product-engineering
last_verified: "2026-09-26"
canonical: false
---

# PLAN — Kilos o libras en el ejecutor

Ver [SPEC](SPEC.md) · [TASKS](TASKS.md). Supone D1–D5 = (a); si el owner elige otra cosa, se ajusta
este plan antes de ejecutar.

## 1. Arquitectura por capa

| Capa | Qué cambia | Archivos principales |
|---|---|---|
| Motor `@eva/workout-engine` | `toKg(value, unit)`, `fromKg(kg, unit)`, `roundForUnit`, formateadores con unidad (`formatWeightEsCl`, `formatStrengthSetLine`, línea de fuerza por tiempo) y presets de rueda/teclado por unidad | `keypad-logic.ts`, `logged-set-summary.ts`, `set-log-payload.ts`, `keypad-flow.ts` + nuevo `weight-unit.ts` |
| Schema | `weight_unit: z.enum(['kg','lb']).optional()` en `WorkoutLogSetSchema` | `packages/schemas/workout.ts:295` |
| DB (D1a) | `ALTER TABLE public.workout_logs ADD COLUMN IF NOT EXISTS weight_unit text;` sin CHECK ni default; tipos a mano en `database.types.ts` (el regen completo sigue roto, CURRENT §5.3) | migración nueva |
| Web ejecutor | selector en rueda/teclado, lecturas en la unidad, payload con `weight_unit`, borrador con unidad | `v3/ExerciseStepV3.tsx`, `v3/SupersetStepV3.tsx`, `v3/DualWheelPicker.tsx`, `v3/wheel-range.ts`, `v3/PrCelebration.tsx`, `v3/SessionCompleteV3.tsx`, `WorkoutKeypadProvider.tsx`, `workout-draft-store.ts`, `_actions/workout-log.actions.ts`, `_data/workout-execution.queries.ts` |
| RN ejecutor | lo mismo + cola offline | `SetRow.tsx`, `TypedKeypad.tsx`, `KeypadHost.tsx`, `SingleExerciseCard.tsx`, `SupersetGroupCard.tsx`, `v3/DualWheelPicker.tsx`, `v3/ExerciseScreenV3.tsx`, `v3/SupersetScreenV3.tsx`, `v3/PrCelebration.tsx`, `v3/SessionCompleteV3.tsx`, `lib/workout-session.ts`, `lib/offline-cache.ts` |
| Builder | selector junto a «Peso objetivo»; guarda kg y muestra en `load_unit` | web `BlockEditSheet.tsx:821-945`; RN `app/coach/program-builder.tsx` + `lib/plan-builder/serialize.ts` |
| Coach | «(45 lb)» en la línea de serie de la ficha | ficha web y RN (lista de series) |

## 2. Olas (un archivo, un solo worker)

- **W0 · Decisiones y mockup (jefe).** D1–D5 respondidas y mockup del selector aprobado.
- **W1 · Motor + schema (Sonnet).** Helpers puros con tests de ida y vuelta (45 lb → 20,41 kg → 45,0 lb;
  47,5 lb; 0; 999) y formateadores con unidad. Sin UI.
- **W2 · DB (jefe).** Migración aditiva validada con `BEGIN`/`ROLLBACK` en LIVE (`EXPLAIN` no aplica:
  solo `ADD COLUMN` nullable). Tipos a mano.
- **W3 · Web (Opus).** Ejecutor + builder web + línea del coach.
- **W4 · RN (Opus).** Ejecutor + builder RN + cola offline.
- **W5 · Datos viejos (jefe + owner).** D4: mensaje a cada coach, lista de ejercicios confirmados y
  `UPDATE` en una transacción con tabla de respaldo `_bak_kg_lb_20260926` y rollback escrito.
- **W6 · Gates y salida.** typecheck web + `tsc` mobile + vitest de lo tocado + lint; suite completa una
  vez; deploy web y OTA doble (1.1.3 desde master y 1.1.2 desde tag) **solo a pedido del owner**.

## 3. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Doble conversión (UI convierte y el payload vuelve a convertir) | La conversión vive en un solo lugar (`set-log-payload.ts`); tests de ida y vuelta en el motor y en los dos payloads. |
| Serie offline de la versión vieja | `weight_unit` null ⇒ kg; nunca se reinterpreta. |
| `metadata` pisado (si D1 = b) | Con D1 = a no aplica. |
| Rueda lb demasiado larga (361 topes) | Arranca centrada en la última marca, igual que la de kg. |
| Coach que prescribe en lb y alumno que anota en kg | Cada uno ve su unidad; el dato canónico es kg. La línea del coach muestra la unidad tecleada. |
| OTA en dos runtimes | Solo JS; mismo patrón que los trenes anteriores (`docs/operations/MOBILE_RELEASES_OTA.md`). |

## 4. Presupuesto

~3–4 días-agente (W1 0,5 · W2 0,25 · W3 1–1,5 · W4 1–1,5 · W5 0,25 + QA del owner).
