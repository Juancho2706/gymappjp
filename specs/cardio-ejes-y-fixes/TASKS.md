# TASKS — Cardio: ejes por modalidad + fixes

Estado: **Fases A y B CONSTRUIDAS** (2026-07-25, PR #170); C y D pendientes de arranque.

## Fase A — datos correctos (sin migración) — HECHA
- [x] A1. Caja de distancia en la unidad prescrita (motor `TypedKeypadContext` retrocompatible; web + RN). NOTA: la ruta de EDICIÓN del keypad RN (`KeypadHost`/`keypad-flow.ts:104`) queda en metros a propósito — cablearla es Fase C.
- [x] A2. Etiquetas visibles sobre las cajas tipadas en V3 web (labels del motor; `TypedLogHeader` también lee del motor).
- [x] A3. Pace real derivado (`derivedPaceSecPerKm` en el motor, clamp 1..3600; FormData web + cola offline + escritura RN).
- [x] A4. Key de remonte incluye `actual_distance_m` + `actual_avg_hr`.
- [x] A5. Builder web: candado del tipo Cardio sin módulo (misma fuente `cardio?.enabled`, copy de RN).
- [x] A6. `legacyRepsSummaryFor` consolidado en el package (web re-exporta; copias eran idénticas).
- [ ] A7. QA device del owner (gates corridos verdes: vitest engine 232, suite 3.880, tsc x3, lint 0 errores).

## Fase B — el coach ve cardio (sin migración) — HECHA
- [x] B1. Select ampliado en `getClientWorkoutForDate` (+ `exercise_type`/override y prescripción tipada del bloque).
- [x] B2. Ficha web `TrainingTabB4Panels`: chip de tipo + línea por ronda vía `formatLoggedSetLine` (motor nuevo `logged-set-summary.ts`, 9 tests); "Registrado sin datos" en ronda vacía (D3); leyenda RPE/RIR solo si hay fuerza.
- [x] B3. RN ficha coach (`AnalisisTab` + `coach-client-detail.ts`): mismo select, mismo render del motor.
- [ ] B4. QA device del owner.

### Deuda anotada (para C o después)
- Analytics de la ficha (1RM/tonelaje/radar/`workoutHistory` 548d) siguen ciegas a cardio: métricas nuevas de minutos/distancia = fase posterior.
- `fmtTypedLoggedLine` del ejecutor RN del alumno (`workout-ui.ts:96`) duplica formato → delegar en `formatLoggedSetLine`.
- Mostrar `actual_pace_sec_per_km` en la ficha (ya se puebla desde A3): una línea en `logged-set-summary.ts`.
- Cabecera de la ficha dice "sets" aunque sean rondas (cosmético).

## Fase C — ejes por modalidad (1 migración)
- [ ] C1. Migración aditiva: `exercises.cardio_modality` + CHECK + backfill 8 seed + (D4) INSERT Escaladora + extensión CHECK `reps_unit` + grants verificados. Snapshot antes, advisors después.
- [ ] C2. Regenerar `database.types.ts`; validar web/mobile/enterprise.
- [ ] C3. Motor: `packages/workout-engine/cardio-modality.ts` (mapa modalidad→ejes) + `typedKeypadFields('cardio', modality)` + rama reps en `buildTypedPayload`. Tests.
- [ ] C4. Ejecutor web: `CardioStepV3`/`LogSetForm` leen ejes del motor (labels/decimales/orden).
- [ ] C5. Ejecutor RN: `CardioScreenV3`/`SetRow` ídem (debería ser casi solo pasar la modalidad).
- [ ] C6. Resumen de sesión + vista coach: etiqueta correcta del eje reps (saltos/reps/pisos).
- [ ] C7. Builder (web y RN): objetivo rep-based con `reps_value`/`reps_unit` cuando la modalidad es rep-based; selector opcional de modalidad en el editor de ejercicios del coach.
- [ ] C8. Gates completos + QA device.

## Fase D — intervalos por distancia
- [ ] D1. Motor: fases por distancia como pasos manuales (`workout-interval.ts`: modelo de fase distance con avance manual; recovery por tiempo cronometrada).
- [ ] D2. UI web `IntervalFace` + RN: botón "Fase siguiente", contador "Intervalo N de M" para distancia.
- [ ] D3. Builder: aplicar plantilla deja de borrar `duration_sec`/`distance_value` (`BlockEditSheet.tsx:342`).
- [ ] D4. Gates + QA.
