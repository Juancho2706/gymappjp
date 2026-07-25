# PLAN — Cardio: ejes por modalidad + fixes

Estado: **propuesta — nada construido**. Basado en la investigación 2026-07-25 (hallazgos G1-G11
verificados contra `fe603fad`; evidencia archivo:línea en el informe del artifact).

## 1. Arquitectura de la solución

Una sola fuente de verdad en el motor puro compartido:

```
packages/workout-engine/cardio-modality.ts   (NUEVO)
  CardioModality = 'run' | 'bike' | 'row' | 'elliptical' | 'jump_rope' | 'hiit_reps' | 'stairs' | null
  cardioAxesFor(modality) → lista ordenada de ejes {key, label, decimal, columna}
  → typedKeypadFields('cardio', modality) delega aquí (typed-keypad.ts hoy hardcodea las 3 cajas)
```

- Web (`LogSetForm` modo cardio) y RN (`SetRow` via `typedKeypadFields`) ya comparten ese motor:
  **cambiar el mapa una vez cambia ambas plataformas**.
- Ejes escriben SOLO columnas existentes de `workout_logs`:
  `actual_duration_sec`, `actual_distance_m`, `actual_avg_hr`, `reps_done` (saltos/reps/pisos).
  `set-log-payload.ts` (`buildTypedPayload`) gana la rama reps para cardio rep-based.
- La modalidad viaja con el ejercicio del plan (query del ejecutor ya trae el catálogo del bloque);
  fallback `null` → ejes genéricos actuales. **Planes viejos no cambian de comportamiento.**

## 2. Mapa de ejes propuesto (decisión D2)

| Modalidad | Ejercicios (seed) | Cajas de la ronda |
|---|---|---|
| `run` | Cinta, Trote aire libre, Caminata | Min · Distancia (m/km, RF4) · FC |
| `row` | Máquina de remo | Min · Metros · FC |
| `bike` | Bicicleta estática | Min · Distancia · FC *(la consola la muestra — owner decide si va)* |
| `elliptical` | Elíptica | Min · FC |
| `jump_rope` | Saltar la cuerda | Min · Saltos · FC |
| `hiit_reps` | Burpees (HIIT) | Min · Reps · FC |
| `stairs` | Escaladora *(nueva, decisión D4)* | Min · Pisos · FC |
| `null` (genérica) | Coach-created / sin asignar | Min · Distancia · FC (hoy) |

FC siempre presente (pulsómetro BLE ya cablea ese eje en ambas plataformas).

## 3. Cambios de datos (Supabase, protocolo aditivo-en-LIVE)

Una migración, forward-only e idempotente:

1. `ALTER TABLE exercises ADD COLUMN IF NOT EXISTS cardio_modality text` + CHECK
   `IN ('run','bike','row','elliptical','jump_rope','hiit_reps','stairs')` (nullable).
2. Backfill de las 8 filas del seed por nombre exacto + `exercise_type='cardio'` + fila de sistema.
3. (D4) INSERT "Escaladora" como ejercicio de sistema `stairs`.
4. Extensión del CHECK de `workout_blocks.reps_unit`: recrear constraint con superset
   `('reps','passes','breaths','saltos','pisos')` — patrón drop+add en la misma migración,
   validado no-destructivo (solo amplía).
5. Grants: `exercises` ya expone SELECT al catálogo (verificar columna nueva incluida si el grant
   es por columnas); `cardio_modality` NO es user-editable por alumnos → sin GRANT UPDATE nuevo
   salvo para el editor de ejercicios del coach (misma ruta server-side que edita `exercise_type`).
6. Regenerar `database.types.ts` + validar consumidores web/mobile/enterprise.

Sin cambios en `workout_logs` (RF3). Snapshot previo + advisors después, como siempre.

## 4. Riesgos y mitigaciones

- **Constraint reps_unit**: recrear CHECK toca tabla caliente de prescripción — se hace en
  transacción, es solo-ampliación; rollback = recrear el CHECK anterior.
- **OTA vs build**: todo es JS/TS compartido → viaja por OTA (sin dependencias nativas nuevas).
- **Backfill por nombre**: si un coach renombró su copia, no se toca (solo filas de sistema).
- **Paridad**: el mapa vive en packages; las pantallas solo leen `axes`. QA device igual requerida.
- **Resumen de sesión y coach view** deben leer `reps_done` con la etiqueta de la modalidad para
  no imprimir "420 reps" donde son saltos.

## 5. Fases (cada una = PR mergeable independiente)

### Fase A — datos correctos (sin migración) — chica
- G3/RF4: caja en unidad prescrita (km ↔ m ×1000) + **etiquetas visibles** sobre las cajas en web
  (paridad RN, fix D1 del informe).
- RF5: pace real derivado al guardar (min+distancia → `actual_pace_sec_per_km`).
- G8: key de remonte de fila incluye `actual_distance_m` y `actual_avg_hr`.
- G10: builder web gatea el tipo Cardio sin módulo (candado, como RN).
- G11: consolidar `legacyRepsSummaryFor` en `packages/workout-engine` (borrar copia web).

### Fase B — el coach ve cardio (sin migración) — chica/media
- B1 web: `client-detail.service.ts` agrega `actual_*` + `reps_done`; detalle de día de la ficha
  renderiza la línea cardio por ronda (y movilidad/roller de paso, mismo render tipado).
- B2 RN: mismo render en la ficha coach móvil (después de B1, misma query compartida).

### Fase C — ejes por modalidad (RF1-RF3, RF8; 1 migración) — media
- C1 migración + backfill + tipos.
- C2 motor: `cardio-modality.ts` + `typedKeypadFields('cardio', modality)` + payload reps.
- C3 ejecutores: web `LogSetForm`/`CardioStepV3` y RN `SetRow`/`CardioScreenV3` leen los ejes del
  motor (labels, decimales, orden). Resumen de sesión + coach view usan la etiqueta correcta.
- C4 builder: objetivo rep-based (saltos/reps/pisos) via `reps_value`/`reps_unit`; selector de
  modalidad en el editor de ejercicios del coach (opcional, default genérica).

### Fase D — intervalos por distancia (G2, RF7) — media
- Fases por distancia como pasos manuales (botón "Fase siguiente"; recovery por tiempo sí
  cronometra) en web y RN; plantillas dejan de borrar `duration_sec`/`distance_value`.

### Diferidos (no en esta tanda salvo pedido)
- G4 captura manual de pace (RF5 lo deriva solo), G5 target por intervalo, G7 drift 6s,
  G9 según decisión D3.

## 6. Gates por fase

`pnpm lint` + `pnpm typecheck` + `pnpm test` + `pnpm --filter @eva/mobile exec tsc --noEmit`;
tests unitarios nuevos del motor (`cardio-modality`, payload reps, conversión km);
Fase C además: migración validada con snapshot + advisors; `docs:check` si cambia documentación.
QA device del owner al final de cada fase visual.

## 7. Estimación

A = 1 sesión corta · B = 1 sesión (B1) + media (B2) · C = 1-2 sesiones · D = 1 sesión.
Orden recomendado: **A → B → C → D** (valor de negocio primero: el coach por fin ve cardio con
datos correctos; los ejes llegan con la base ya sana).
