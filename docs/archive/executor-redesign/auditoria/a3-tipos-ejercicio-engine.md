# Auditoria a3 — Modelo de tipos de ejercicio y engine compartido (`@eva/workout-engine`)

> Alcance: solo lectura. Auditoria del modelo de tipos de ejercicio (fuerza / cardio / movilidad / roller), del schema de guardado de logs y de que hay que tocar en el motor puro para dar experiencias unicas por tipo sin romper reconciliacion ni schema. Rutas ancladas al worktree `executor-redesign`.

## Resumen ejecutivo

- Los tipos REALES en codigo son exactamente cuatro y su union es la fuente de verdad: `type ExerciseType = 'strength' | 'cardio' | 'mobility' | 'roller'` en `packages/workout-engine/workout-exercise-type.ts:17`, replicada en `apps/web/src/domain/workout/types.ts:28` y en el enum de schema `EXERCISE_TYPE_VALUES` en `packages/schemas/workout.ts:53`.
- El tipo EFECTIVO de un bloque se resuelve con una sola funcion pura: `effectiveExerciseType(block, exercise) = block.exercise_type_override ?? exercise.exercise_type ?? 'strength'` (`workout-exercise-type.ts:73-82`). Todo bloque legacy sin override cae a `strength`, garantizando cero regresion.
- Los campos de log son un unico schema plano polimorfico (`WorkoutLogSetSchema`, `packages/schemas/workout.ts:256-282`): `weight_kg`, `reps_done`, `rpe`, `rir` (fuerza) mas los ejes `actual_duration_sec`, `actual_distance_m`, `actual_pace_sec_per_km`, `actual_hold_sec`, `actual_avg_hr` (tipados). TODOS opcionales: un log strength de hoy valida identico.
- La decision de QUE campo aplica a cada tipo NO vive en el schema (que acepta todo), sino en dos capas puras: `typedKeypadFields(mode)` (`typed-keypad.ts:29-45`) define los campos por modo, y `typedTargetFor()` / `keypadStepsForTarget()` (mobile `keypad-flow.ts:82-107`) enrutan tipo->campos. La web lo espeja con `mode={effType}` en `LogSetForm.tsx`.
- RIR/RPE solo son de fuerza por construccion del flujo: el paso de esfuerzo (`{ kind: 'effort' }`) solo se anexa al flujo strength (`keypad-flow.ts:106`); los tipados no tienen paso de esfuerzo en el registro, aunque admiten un RPE POST-log opcional (`set-log-payload.ts:70-75`).
- El mapeo valores->columnas por tipo esta centralizado y es puro: `typedLogValues(mode, values)` (`set-log-payload.ts:36-55`). Cardio -> min/metros/FC; movilidad -> hold; roller -> segundos + pasadas (`reps_done`).
- Supersets se modelan por contiguidad de `superset_group` (letra) + `order_index`: `groupContiguousSupersetRuns()` (`workout-block-grouping.ts:35-70`) exige >=2 bloques; `sanitizeSupersets()` normaliza letras huerfanas/partidas sin reordenar.
- Rondas intercaladas (A1->B1->A2->B2) son puras: `buildRoundOrder()`, `isRoundComplete()`, `findNextIncompleteInRounds()` (`superset-rounds.ts:32-87`). El descanso de grupo dispara solo al CERRAR ronda.
- Intervalos (cardio) tienen su propia maquina de fases: `buildIntervalPhases()` (`workout-interval.ts:52-75`) expande warmup -> (work->recovery)xN -> cooldown, pero SOLO si el work tiene duracion (un work por distancia no genera fase cronometrable, `isTimeableInterval`).
- Holds "por lado" existen como PRESCRIPCION (`side_mode: 'per_side' | 'alternating'`, `schemas/workout.ts:54`) pero NO como LOGGING por lado: hoy se registra un solo `actual_hold_sec` agregado por serie. La migracion reservo `workout_logs.metadata jsonb` para el lado L/R y lo declaro explicitamente fuera de alcance v1 (`20260611090003_...:7`).
- `actual_avg_hr` es entrada MANUAL: la migracion documenta "sin integracion con relojes/bandas, fuera de alcance v1" (`20260611090003_...:11`). Es el punto de enganche natural para el BPM de Apple Watch.
- `actual_pace_sec_per_km` existe en schema (`workout.ts:272`) y DB pero NO esta cableado a ningun campo de teclado (`typedKeypadFields('cardio')` solo ofrece min/metros/FC): es capacidad latente para el ritmo de cardio.
- La reconciliacion offline (`reconcileSessionLogs`, `session-logs.reconcile.ts:98-137`) y el optimismo (`buildOptimisticSessionLog`, `session-logs.optimistic.ts:35-49`) ya arrastran TODOS los ejes `actual_*`; agregar experiencias por tipo NO exige tocar el merge mientras se reusen esas keys.
- El resumen post-entreno ya es por-tipo: `summarizeSessionByKind()` (`session-summary.ts:123-223`) clasifica cada bloque por `effectiveExerciseType` y produce cardio/movilidad/fuerza + mapa muscular. Cardio se excluye del mapa; movilidad/roller encienden zonas con proxy.
- Lo compartible ya extraido a `packages/workout-engine` es abundante (index en `index.ts:17-31`): resolucion de tipo, campos de teclado, logica de teclado, stepper, agrupacion, rondas, intervalos, areas, resumen. Lo que queda por plataforma es SOLO presentacion (UI RN vs web, iconos lucide, timers nativos, integracion HealthKit).

## Hallazgos

### 1. Tipos reales, nombres exactos y resolucion del tipo efectivo

La union canonica es `'strength' | 'cardio' | 'mobility' | 'roller'` y aparece triplicada (con espejo intencional documentado):

- Motor puro: `workout-exercise-type.ts:17` (`ExerciseType`) + array `EXERCISE_TYPES` (`:19`).
- Dominio web: `apps/web/src/domain/workout/types.ts:28`.
- Schema/DB: `EXERCISE_TYPE_VALUES` en `packages/schemas/workout.ts:53`, usado por `exercise_type_override` (`workout.ts:154`).

Etiquetas es-neutro centralizadas: `EXERCISE_TYPE_LABEL` (`workout-exercise-type.ts:22-27`) = Fuerza / Cardio / Movilidad / Foam roller. Las opciones del selector del coach viven en `EXERCISE_TYPE_OPTIONS` (`:40-45`) con descripcion de ejes ("Cardio (duracion / distancia / zona FC)", "Movilidad (holds por lado)", "Foam roller (duracion o pasadas)").

Resolucion efectiva (decision #2 del PLAN movida-entrenamiento), pura: `effectiveExerciseType()` (`:73-82`) devuelve `override del bloque > tipo del ejercicio del catalogo > 'strength'`. `asExerciseType()` (`:47-49`) filtra strings invalidos. Consecuencia de diseno: el rediseño NUNCA debe asumir el tipo desde otra parte; esta es la unica puerta.

En `plan-builder` el bloque del builder ya distingue ambos niveles: `exercise_type` (del catalogo, `packages/plan-builder/types.ts:52-53`) y `exercise_type_override` (`:54-55`), mas los ejes prescriptivos `side_mode`, `reps_unit`, `distance_value`, `duration_sec`, `hr_zone` (`:56-68`).

### 2. Campos de log por tipo y DONDE se decide

El schema de guardado es UN solo objeto plano polimorfico, `WorkoutLogSetSchema` (`schemas/workout.ts:256-282`). Campos:

- Identidad: `block_id` (uuid), `set_number` (int >=1).
- Fuerza: `weight_kg` (>=0), `reps_done` (int >=0), `rpe` (1-10), `rir` (1-10). Nota CEO: ambas escalas 1-10 (`:261-265`).
- Tipados (espejo M3): `actual_duration_sec` (int 0-86400), `actual_distance_m` (0-1e6), `actual_pace_sec_per_km` (int 1-3600), `actual_hold_sec` (int 0-86400), `actual_avg_hr` (int 25-250) (`:270-274`).
- Transversal: `note` (texto <=300, leido crudo aparte del normalizador decimal, `:266-268`), y sustitucion de maquina (`substituted_exercise_id/_name`, `substitution_reason`, `:279-281`).

Punto CLAVE: el schema ACEPTA cualquier combinacion (todo opcional), no restringe por tipo. La decision "que campo pinta cada tipo" vive en capas puras/UI, no en validacion:

- `typedKeypadFields(mode)` (`typed-keypad.ts:29-45`): cardio -> `cardio_min` (decimal), `actual_distance_m` (decimal), `actual_avg_hr` (entero); movilidad -> `actual_hold_sec` (entero); roller -> `actual_duration_sec` (entero) + `reps_done` (entero, "pasadas"). Reglas decimales CEO 2026-07-04: distancia y minutos decimal; FC, segundos y pasadas enteros.
- Mapeo valores->columnas: `typedLogValues(mode, values)` (mobile `set-log-payload.ts:36-55`). Cardio convierte `cardio_min` a `actual_duration_sec = min*60`; movilidad escribe `actual_hold_sec`; roller escribe `actual_duration_sec` + `reps_done`.
- Ruteo tipo->flujo: `typedTargetFor()` + `keypadStepsForTarget()` (`keypad-flow.ts:82-107`). Si el tipo efectivo es strength devuelve `null` (flujo peso->reps->esfuerzo, `STRENGTH_KEYPAD_STEPS` `:59-62`); si es tipado devuelve los campos de `typedKeypadFields`.
- Web: `LogSetForm.tsx` recibe `mode` y renderiza inputs tipados nativos (`actual_distance_m`, `actual_avg_hr`, `actual_hold_sec` en `:1038-1091`) reusando `typedKeypadFields` (`:818`).

RIR/RPE SON solo-fuerza porque el paso de esfuerzo `{ kind: 'effort' }` solo se anexa al flujo strength (`keypad-flow.ts:106`). Los tipados admiten un RPE post-registro opcional sembrado desde el log al editar (`set-log-payload.ts:70-75`, `buildTypedPayload` fija `rir: null`). La fila de fuerza captura RPE y RIR por separado con dots inline (`buildStrengthPayload`, `set-log-payload.ts:89-106`).

Persistencia DB: migracion `20260611090003_workout_logs_polymorphic_mirror.sql:16-22` agrega las columnas `actual_*` + `metadata jsonb`, todas nullable, SIN CHECKs (hot table; validacion en Zod). El mapa de campos por tipo esta documentado en el header (`:3-11`): roller reusa `reps_done` existente; `metadata` jsonb reservado para lado L/R; `actual_avg_hr` "se ingresa a mano".

### 3. Supersets, rondas, intervalos y holds

Supersets (agrupacion): `groupContiguousSupersetRuns()` (`workout-block-grouping.ts:35-70`) agrupa por `superset_group` (letra A/B...) SOLO en tramos contiguos por `order_index+1`. Contrato: una superserie exige >=2 bloques; un tramo de 1 se degrada a `single` sin letra (guard singleton `:61-66`). Normalizacion pre-persistencia: `sanitizeSupersets()` (`:108-201`) reasigna letras huerfanas/partidas sin reordenar, con boundary por area (una superserie nunca cruza area).

Rondas intercaladas (ejecucion de superset): `superset-rounds.ts`. `buildRoundOrder(members)` (`:32-41`) genera A1,B1,C1,A2,B2... saltando miembros sin serie en esa ronda (segun `sets` de cada miembro). `isRoundComplete()` (`:48-62`) con proyeccion optimista via `extraLoggedBlockId`. `findNextIncompleteInRounds()` (`:68-78`) da la proxima serie (envuelve). `firstIncompleteInRounds()` (`:84-87`) da la serie activa. El descanso completo del grupo dispara solo al CERRAR ronda (documentado `:7`).

Modelo de pasos (modo paso-a-paso): `workout-stepper.ts` aplana secciones->grupos en pasos lineales donde una superserie = UN paso (`buildStepModel`, `:59-75`). Completitud: `isBlockDone`/`isStepComplete` (`:49-80`), arranque `firstIncompleteStepIndex` (`:86-90`).

Intervalos (cardio): `workout-interval.ts`. `IntervalConfig` (`:14-34`) modela warmup/cooldown + `repeats` + `work {duration_sec|distance_m, target}` + `recovery`. `buildIntervalPhases(config, sets)` (`:52-75`) expande warmup -> (work->recovery) x (repeats*sets) -> cooldown; omite la ultima recovery; SOLO cronometrable si `work.duration_sec > 0` (un work por distancia devuelve `[]`). `isTimeableInterval()` (`:83-85`) es el guard. Hay 5 plantillas system en codigo (`INTERVAL_TEMPLATES`, `:107-169`): 8x400, VO2 6x1min, Z2 continuo, Fartlek 10x30/30, HYROX. Schema DB del jsonb: `IntervalConfigSchema` (`schemas/workout.ts:68-85`), validado en app layer.

Holds "por lado": la PRESCRIPCION existe (`side_mode` en `SIDE_MODE_VALUES = ['bilateral','per_side','alternating']`, `schemas/workout.ts:54`; etiquetas `SIDE_LABEL` en `workout-exercise-type.ts:30-33`; sufijo "/lado" en resumenes `:117-119`). Pero el LOGGING NO es por lado: movilidad registra un solo `actual_hold_sec` por serie (`typedLogValues` `:47-48`). La migracion reservo `metadata jsonb` "ej. lado L/R v1 — logging por lado separado fuera de alcance" (`20260611090003_...:7`). Es un gap deliberado, no un bug.

### 4. Que tocar en el engine para experiencias unicas por tipo

Objetivo: cardio countdown/distancia/BPM, movilidad holds por lado, roller pasadas — sin romper reconciliacion ni schema.

Reconciliacion/optimismo YA soportan todos los ejes: `WorkoutOfflineLog` (`session-logs.reconcile.ts:7-31`) y `ReconciledSessionLog` (`:43-61`) incluyen `actualDurationSec/actualDistanceM/actualHoldSec/actualAvgHr`; `reconcileSessionLogs()` (`:98-137`) los copia; `buildOptimisticSessionLog()` (`session-logs.optimistic.ts:35-49`) los preserva (el bug forense de hold 2026-07-04 se corrigio justamente para esto, `:26-34`). Regla de oro: mientras las experiencias nuevas escriban en las MISMAS keys `actual_*`/`reps_done`/`rpe`, el merge no se toca.

Cambios propuestos en el motor, por experiencia:

a) Cardio countdown / distancia (progreso animado): la data ya existe — objetivo prescrito via `formatTypedObjective(block, 'cardio')` (`typed-keypad.ts:72-88`) y fases via `buildIntervalPhases`. FALTA en el engine: una funcion pura que dado (objetivo prescrito, avance actual) devuelva el % de progreso y el "cuanto falta" (tiempo o distancia) para alimentar el anillo animado. Hoy no existe; es logica pura ideal para `packages/workout-engine`.

b) Cardio BPM (Apple Watch): `actual_avg_hr` ya es columna y campo de teclado (`typed-keypad.ts:35`), hoy manual. El engine NO necesita cambios de shape; el streaming de BPM en vivo es UI/nativo. Si se quiere media/max/zonas en tiempo real convendria una funcion pura de zona FC (hay `hr_zone` prescrito y `CardioProfileUpdateSchema` con `resting_hr`/`max_hr_override`, `schemas/workout.ts:295-312`) — no existe hoy el calculo de zona a partir de bpm+perfil; seria aditivo.

c) Cardio ritmo: `actual_pace_sec_per_km` esta en schema/DB (`workout.ts:272`) pero NO en `typedKeypadFields('cardio')`. Cablearlo es de bajo riesgo (aditivo) si el rediseño lo requiere.

d) Movilidad holds por lado: es el cambio de mayor superficie. Hoy `actual_hold_sec` es agregado. Opciones sin romper schema: (1) usar `metadata jsonb` (ya reservado) para `{ left_sec, right_sec }`, exponiendolo en `WorkoutLogSetSchema` (hoy `metadata` NO esta en el schema Zod — habria que agregarlo como record opcional, patron ya usado por `extra_targets` en bloques `workout.ts:156`); (2) loguear dos series (una por lado) reusando `set_number`. La opcion (1) requiere ampliar `typedKeypadFields('mobility')`, `typedLogValues`, `WorkoutOfflineLog`, `ReconciledSessionLog` y `OptimisticLogPayload` con las keys de lado — todo aditivo/nullable para no romper el merge. `side_mode` ya viaja en el bloque para decidir si se piden 1 o 2 valores.

e) Roller pasadas: ya funciona (`reps_done` + `actual_duration_sec`, `set-log-payload.ts:49-52`). Para "contar pasadas" con feedback animado no se necesita cambio de engine; es UI. Un contador incremental podria reusar `applyKeypadIncrement`/`appendKeypadDigit` (`keypad-logic.ts:65-96`).

f) Celebraciones/PRs (vibra Duolingo): `summarizeSessionByKind` (`session-summary.ts:123-223`) ya calcula `maxWeight` por ejercicio (excluye sustituidos, anti-PR-falso `:181-184`). FALTA en el engine una funcion pura de deteccion de PR (comparar vs historico) para disparar celebraciones — hoy no existe; encaja como aditivo puro.

Riesgo transversal: cualquier key nueva debe agregarse simultaneamente en las CINCO superficies del payload (schema Zod, `WorkoutOfflineLog`, `ReconciledSessionLog`, `OptimisticLogPayload`, `typedLogValues`) o la serie "desaparece" al reconciliar/editar (exactamente el bug forense de hold, `session-logs.optimistic.ts:26-34`).

### 5. Que es compartible en packages y que es UI por plataforma

Ya compartido en `@eva/workout-engine` (`index.ts:17-31`), TypeScript puro sin React/RN/Supabase: resolucion de tipo (`workout-exercise-type`), campos y objetivo de teclado (`typed-keypad`), manipulacion de texto del teclado (`keypad-logic`), modelo de pasos (`workout-stepper`), agrupacion y normalizacion de supersets (`workout-block-grouping`), rondas intercaladas (`superset-rounds`), areas (`workout-areas`), maquina de fases de intervalos + plantillas (`workout-interval`), resumen por tipo (`session-summary`), mapa muscular (`muscle-map`/`body-anatomy`), reconciliacion no destructiva del guardado (`workout-save-reconcile`), y los shapes canonicos de log offline/optimista/reconciliado.

Compartido pero fuera del package por acoplamiento a plataforma: el ruteo tipo->campos `keypad-flow.ts` y el builder de payload `set-log-payload.ts` viven en `apps/mobile/.../workout/` (la web los espeja en `LogSetForm.tsx`). Son candidatos a subir al engine para eliminar el ultimo drift web/mobile del mapeo valores->columnas.

UI por plataforma (NO compartible): iconos lucide (`EXERCISE_TYPE_META`, documentado que queda en web/mobile por presentacion, `workout-exercise-type.ts:5-8`), los componentes RN (`ExecutorV2.tsx`, `TypedKeypad.tsx`, `TypedTargetGrid.tsx`, `SetRow.tsx`, timers nativos en `timers/`) vs web (`WorkoutExecutionClient.tsx`, `NumericKeypadSheet.tsx`, `LogSetForm.tsx`), persistencia del paso del teclado (localStorage web vs AsyncStorage mobile, `keypad-logic.ts:114-116`), y toda integracion nativa (HealthKit/Apple Watch BPM, haptics, cronometros con capacidades del SO, celebraciones animadas).

## Recomendaciones para el rediseño (priorizadas)

1. **Mantener `effectiveExerciseType` como unica puerta de tipo.** Cualquier experiencia por tipo del nuevo ejecutor debe derivar de esa funcion (`workout-exercise-type.ts:73`), nunca de heuristicas de UI. Es la garantia de retrocompatibilidad legacy->strength.

2. **Antes de agregar cualquier eje de log nuevo, actualizar las cinco superficies del payload a la vez** (Zod `WorkoutLogSetSchema`, `WorkoutOfflineLog`, `ReconciledSessionLog`, `OptimisticLogPayload`, `typedLogValues`). Escribir en las keys `actual_*` existentes cuando sea posible: asi el merge offline y el optimismo no se tocan.

3. **Cardio con progreso animado: agregar al engine una funcion pura de progreso** (objetivo prescrito + avance -> % y restante en tiempo/distancia), reusando `formatTypedObjective` y `buildIntervalPhases`. Es logica sin plataforma; mantiene la animacion RN y la barra PWA en sync.

4. **BPM de Apple Watch: no cambiar shape, enganchar en `actual_avg_hr`.** El streaming vivo es UI/nativo (HealthKit). Si se quiere zona FC en vivo, agregar una funcion pura `hrToZone(bpm, perfil)` usando `CardioProfileUpdateSchema` — aditiva, opcional en PWA.

5. **Holds por lado (movilidad): decidir el modelo de datos temprano.** Recomendado exponer `metadata jsonb` (ya reservado en DB) en el schema como record opcional (patron `extra_targets`) con `{ left_sec, right_sec }`, condicionado por `side_mode`. Es el unico cambio de superficie grande; planificarlo evita re-trabajo del keypad tipado.

6. **Roller: es UI, no engine.** Construir el contador de pasadas animado sobre `reps_done` + `applyKeypadIncrement`; no requiere cambios de motor.

7. **Subir `keypad-flow.ts` y `set-log-payload.ts` a `@eva/workout-engine`** para que web y mobile compartan el mapeo tipo->campos->columnas sin espejo manual (hoy la web reimplementa el mapeo en `LogSetForm.tsx`). Reduce el riesgo de drift del bug forense de hold.

8. **Celebraciones/PR (vibra): agregar deteccion de PR pura al engine** comparando contra historico, reusando `maxWeight`/`totalVolume` de `summarizeSessionByKind`. La animacion es por plataforma; el disparo (¿es PR?) debe ser puro y testeable, white-label safe (sin mascota).

9. **Intervalos: reusar la maquina de fases existente para el cronometro nativo.** `buildIntervalPhases` + `INTERVAL_PHASE_LABEL` ya dan la secuencia; el cronometro nativo (haptics por fase, background) es UI RN. Recordar el guard `isTimeableInterval` (work por distancia no es cronometrable).

10. **No reintroducir CHECKs de tipo en DB ni en el schema base.** El diseño deliberado es "schema permisivo, decision por tipo en capa pura/UI" (`20260611090003_...:8-9`). Mantenerlo preserva la retrocompatibilidad y la velocidad de la hot table de logs.
