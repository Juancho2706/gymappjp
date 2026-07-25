# TASKS — Cardio: ejes por modalidad + fixes

Estado: **pendiente de aprobación** (ver decisiones D1-D4 en SPEC.md). No iniciar sin OK del owner.

## Fase A — datos correctos (sin migración)
- [ ] A1. Caja de distancia en la unidad prescrita: `distance_unit='km'` → label "Km", decimal, guarda ×1000 (`LogSetForm.tsx` web + regla en `typed-keypad.ts` para que RN herede). Sin prescripción → "Metros".
- [ ] A2. Etiquetas visibles Min/Distancia/FC sobre las cajas de la pantalla cardio V3 web (hoy solo aria-label; RN ya las tiene).
- [ ] A3. Pace real derivado: al armar el payload con tiempo+distancia, calcular `actual_pace_sec_per_km` (`set-log-payload.ts`, usa `packages/cardio/pace.ts`). Test unitario.
- [ ] A4. Key de remonte de fila incluye `actual_distance_m` + `actual_avg_hr` (`LogSetForm.tsx:1755`).
- [ ] A5. Builder web: candado del tipo Cardio sin módulo (paridad RN `BlockEditorSheet`).
- [ ] A6. Consolidar `legacyRepsSummaryFor` en `packages/workout-engine`; web importa del package; borrar copia `apps/web/src/lib/workout-exercise-type.ts` (o reducirla a re-export).
- [ ] A7. Gates + QA device corta.

## Fase B — el coach ve cardio (sin migración)
- [ ] B1. `client-detail.service.ts` select + tipos: `actual_duration_sec, actual_distance_m, actual_avg_hr, actual_hold_sec, reps_done, metadata`.
- [ ] B2. Render del detalle de día (ficha alumno web): línea tipada por ronda según tipo de ejercicio (cardio/movilidad/roller), formato "12,5 min · 3.200 m · FC 148".
- [ ] B3. RN ficha coach: mismo render (reusar formateadores del motor `session-summary.ts` si calzan).
- [ ] B4. Gates + QA.

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
