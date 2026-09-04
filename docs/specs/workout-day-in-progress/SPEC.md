# SPEC — Estado "En progreso" del dia de entrenamiento (day-cards alumno)

## Problema
Hoy un dia queda `done` con **una sola serie registrada** (`weekPendingWorkouts.ts`: "existe >=1 log
del plan en la semana"). Consecuencias reales (incidente P0 2026-07-26, PR #171):
- Un alumno interrumpido a mitad de entreno reentra por la day-card, que ya dice "hecho", y cae al
  sheet "Ya hiciste este entrenamiento" — un trap a mitad de sesion.
- El hero exige 100% de series ("Continuar") mientras la card dice "hecho": se contradicen en la
  misma pantalla.
- El banner ambar de pendientes y el "N de M" de la racha visual del ejecutor heredan la mentira.

## Objetivo
Tercer estado **"En progreso"** entre pendiente y hecho, con una unica regla de completitud
compartida entre web y RN.

## Decisiones (CEO 2026-07-26, opcion O2)
- `done` = **100% de las series esperadas del dia registradas**.
- `in_progress` = 1–99% de series registradas (hoy O dia pasado con sesion parcial).
- `pending` = 0 series y el dia ya paso (sin cambio de semantica).
- El sheet "Ya hiciste este entrenamiento" aparece **solo** con `done`. Un dia `in_progress` de HOY
  navega directo al ejecutor (flujo normal / recuperar); un dia pasado `in_progress` abre el sheet
  con copy "Entrenamiento incompleto" (editar esa fecha / repetir hoy, semantica actual).
- **La racha del home (RPC `get_client_current_streak`, 7 reglas CEO) NO se toca en v1.** La
  divergencia deliberada (card "en progreso" + racha intacta) se documenta aqui.
  **Actualización 2026-09-03:** el tren [ciclo-real-y-por-lado](../ciclo-real-y-por-lado/SPEC.md)
  (migración `20260903212441_streak_cycle_branch_and_null_start.sql`) agrega a esa RPC la rama
  `cycle` (R1: cada día entrenado suma; corta solo una semana Lun–Dom cerrada sin entrenos) y el guard
  de `start_date NULL` (regla 7). El cuerpo `weekly` sigue idéntico (test de equivalencia
  `supabase/tests/streak_cycle_equivalence.sql`, 0 diff).
- La regla nace como **funcion pura en `@eva/workout-engine`** (hoy existen 3 implementaciones del
  concepto: TS web, TS RN, SQL del RPC; una cuarta seria drift garantizado).

## Regla de completitud (denominador)
Por bloque del plan: series esperadas = `sets` si es numerico > 0; si `sets` es null/0 (cardio,
movilidad, formatos sin prescripcion de series) el bloque cuenta como **1 unidad**. Series
registradas por bloque se **capan a su esperado** (el indice unico por (block, set_number, dia)
garantiza filas exactas; el cap evita >100% por bloques editados a la baja despues de la sesion).
`pct = sum(min(logged_b, expected_b)) / sum(expected_b)`. Si el coach edita bloques despues, el
estado se recalcula solo (sin persistencia): un dia puede migrar entre estados y eso es aceptado.

## Alcance
- `packages/workout-engine/day-completion.ts`: `deriveDayCompletion({ blocks, loggedSetsByBlock })` +
  tests de paridad (patron `executor-mapping.parity.test.ts`). (Corrección 2026-08-17: la ruta real
  es `packages/workout-engine/day-completion.ts`, sin subcarpeta `src/`.)
- Web: `weekPendingWorkouts.ts` (usar block_id/set_number que las queries ya traen y hoy descartan;
  ampliar select de planes sueltos con `workout_blocks(id, sets)`), `WorkoutPlanCard` (tercera
  visual + gating del sheet), banner de pendientes, `week-status.queries.ts`/`dotStateFor` (racha
  visual del ejecutor V3 hereda done=100%).
- RN: `home.tsx` (traer `set_number` + targets), `weekly-streak.ts` (`greedyPlanDone` usa la funcion
  del engine), `ActiveProgramSection`, dots del `ExecutorV3`.
- Auditar TODO consumidor de `status === 'done'` (web y RN): un consumidor olvidado degrada a
  "no hecho" silencioso.

## No-objetivos
- No tocar el RPC de racha ni backfillear historia (v1 es derivado puro, reversible).
- No escribir `workout_sessions` (eso es O3, futuro: "done al tocar Finalizar" + rail del coach).
- No cambiar adherencia 30d / momentum (by design, comentario `weekPendingWorkouts.ts:106-108`).
- No cambiar la atribucion greedy de recuperaciones (solo su umbral de "cerrado").

## Metrica de exito
Cero alumnos con sesion parcial empujados al sheet "Ya hiciste este entrenamiento"; day-card, hero
y banner cuentan con la MISMA regla en web y RN (paridad testeada en el engine).
