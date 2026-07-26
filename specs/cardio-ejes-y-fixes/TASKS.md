# TASKS — Cardio: ejes por modalidad + fixes

Estado: **Fases A, B, C y D CONSTRUIDAS** (2026-07-25, PR #170). Resta QA device del owner y la deuda listada al final.

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

### Deuda anotada (post C+D, priorizada) — barrida 2026-07-25 (sesión "haz toda la deuda")
1. [x] **GRAVE — cola offline RN pierde los ejes de cardio**: RESUELTA. `PendingLog` amplió con
   `actual_duration_sec/distance_m/pace/hold/avg_hr + metadata + substituted_*` (aditivo,
   retrocompatible con entradas viejas en AsyncStorage) y `enqueueLog` calca `logData` con el
   criterio "solo si presente"; el drain spreadea el item completo sin cambios. BONUS descubierto:
   `logSet` RN tampoco escribía `metadata` (lados per_side) ONLINE — corregido en el mismo paso.
   Suite nueva `tests/mobile-offline-cache-typed-axes.test.ts` (round-trip + legado sin columnas).
2. [ ] Analytics de la ficha (1RM/tonelaje/radar/`workoutHistory` 548d) siguen ciegas a cardio:
   métricas de minutos/distancia por semana = fase posterior (única deuda que queda viva).
3. [x] `fmtTypedLoggedLine` → RESUELTA: delega en `formatLoggedSetLine` del motor (misma línea que
   la ficha del coach; "Registrado" se conserva como copy del chip vacío del alumno).
4. [x] `legacyRepsSummaryFor` → RESUELTA: rama rep-based en el motor ("420 saltos", "45 pisos Z2");
   tests en `apps/web/src/lib/workout-exercise-type.test.ts`.
5. [x] Herencia de `exercise_type` en `ExerciseSearchSheet.handleSelect` → RESUELTA (viaja con el
   bloque nuevo igual que web; el editor deriva el tipo efectivo).
6. [x] Timers globales flotantes → RESUELTA: `startInterval` (web+RN) usa `buildIntervalSequence`;
   `IntervalTimer` muestra la distancia y CTA "Fase siguiente" en fases manuales (sin countdown ni
   barra; sin auto-avance en background). Las galerías ya decían "por distancia" desde la Fase D.
7. [x] Pace en la ficha → RESUELTA: `actual_pace_sec_per_km` en los selects web+RN y en
   `formatLoggedSetLine` ("5:00 /km"); cabecera "sets" ahora dice rondas/registros según el
   contenido. Las etiquetas de modalidad ya estaban consolidadas en `cardio-modality.ts` (baef4283).
8. [—] Plan cacheado offline previo a C sin `cardio_modality`: degradación segura, se auto-corrige
   con la primera carga online; sin acción.

## Fase C — ejes por modalidad (1 migración) — HECHA
- [x] C1. Migración `20260725221804` APLICADA EN LIVE (dry-run BEGIN/ROLLBACK previo; advisors 0 nuevos): `cardio_modality` + CHECK, backfill de los 8 por id determinístico, Escaladora insertada (`stairs`), `reps_unit` ampliado a `jumps`/`floors`. `exercises` tiene grants table-level ⇒ sin GRANT extra.
- [x] C2. `database.types.ts` actualizado; tsc web/mobile/enterprise verdes. Seed idempotente con modalidad + Escaladora oid(9).
- [x] C3. Motor: `cardio-modality.ts` (mapa aprobado, normalize, ejes, `formatCardioReps`), `typedKeypadFields` delega, `reps_done` solo en rep-based, `formatLoggedSetLine(…, {cardioModality})`, `CardioItem.repsDone/repsUnit`, `typedTargetFor` con ctx. GOTCHA: helpers de km MOVIDOS a `cardio-modality.ts` (typed-keypad re-exporta) para evitar ciclo ESM.
- [x] C4. Web: query + `LogSetForm` con ejes dinámicos del motor (elíptica 2 cajas, conteo rep-based), `TypedLogHeader` itera (bug de desestructuración posicional arreglado), superseries ganan `distanceUnit`+modalidad, resumen V3/V2 con conteo.
- [x] C5. RN: espejo completo + **ruta de edición del keypad cableada** (`typedContext` en KeypadHost, siembra en km, sin tocar primaryIsNext/onDone; `sideMode` excluido a propósito — cablearlo mal borraría holds per_side).
- [x] C6. Ficha coach web+RN con "420 saltos"/"45 pisos" (`cardio_modality` en ambos selects).
- [x] C7. Builder web+RN: campo "Objetivo (saltos|pisos|reps)" → `reps_value`+`reps_unit`; selector de modalidad en editor de ejercicios web (Select) y RN (chips), solo tipo cardio, default genérica. `REPS_UNIT_VALUES` de schemas ampliado (superset del CHECK).
- [ ] C8. QA device del owner (gates verdes: tsc x3, lint 0 errores, 3.936 tests).

## Fase D — intervalos por distancia — HECHA
- [x] D1. Motor: `buildIntervalSequence` (fases `timed`/`manual` con `distanceM`), `intervalTimerKind` (timeable|manual|none), `buildIntervalPhases` conserva contrato EXACTO (timers globales solo cronometrables). 16 casos nuevos.
- [x] D2. Web `IntervalFace` + RN `IntervalHero`: fase manual con "400 m" + CTA "Fase siguiente" (avanza y arranca sola la recuperación cronometrada); anillo estático accesible; 8x400m y HYROX dejan de caer a cronómetro pelado. Único test editado: `executor-v3-typed-screens.test.ts` que codificaba el bug G2 como expectativa.
- [x] D3. Builders web+RN: aplicar plantilla ya NO borra `duration_sec`/`distance_value` (el ejecutor prioriza intervalos; el dato continuo queda visible en el objetivo).
- [ ] D4. QA device del owner.
