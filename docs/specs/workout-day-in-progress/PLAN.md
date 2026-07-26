# PLAN — Estado "En progreso" del dia de entrenamiento

Base: investigacion 2026-07-26 (post-incidente P0). Prerrequisito: ola de fixes tecnicos previa
mergeada (telemetria per-code de la cola, dedup por (plan, ymd) en `weekPendingWorkouts`, fix banner
RN de otro plan) — este plan asume esos diffs presentes.

## F1 — Motor puro (packages/workout-engine)
1. `deriveDayCompletion({ blocks: {id, sets}[], loggedSetsByBlock: Record<blockId, number> })`
   → `{ state: 'none' | 'in_progress' | 'done', pct, expected, logged }` con la regla del SPEC
   (sets null/0 = 1 unidad; cap por bloque).
2. Tests unitarios + tests de paridad (mismos fixtures que consumiran web y RN).
3. Export publico del paquete; cero dependencias nuevas.

## F2 — Web
1. `weekPendingWorkouts.ts`: `WeekLogRow` gana `block_id`/`set_number` (ya viajan en
   `getRecentWorkoutLogs`, hoy se descartan); targets desde `getActiveProgram` (bloques anidados) y
   select ampliado para planes sueltos (`getClientWorkoutPlans` + `workout_blocks(id, sets)`).
   `WeekDayStatus` gana `'in_progress'`; la atribucion greedy cierra un dia solo con `done`.
2. `WorkoutPlanCard`: tercera visual (anillo/label "En progreso"); tap de HOY in_progress = morph
   directo al ejecutor; dia pasado in_progress = sheet con copy "Entrenamiento incompleto";
   sheet "Ya hiciste este entrenamiento" solo con done.
3. Banner de pendientes y `getExecutorWeekStatusDays`/`dotStateFor`: heredan el nuevo estado
   (dot parcial en la racha visual del ejecutor).
4. Auditoria exhaustiva `status === 'done'` en apps/web (grep) — lista cerrada en TASKS.

## F3 — RN (paridad)
1. `home.tsx`: query de logs gana `set_number`; targets de bloques del programa activo.
2. `weekly-streak.ts` (`greedyPlanDone`, `greedyDoneDatesForWeek`) consume `deriveDayCompletion`
   del engine (borra la copia local del concepto).
3. `ActiveProgramSection` + dots del `ExecutorV3`: tercera visual, mismos copys que web.
4. Auditoria `'done'` en apps/mobile — lista cerrada en TASKS.

## F4 — Gates y cierre
1. `pnpm lint` + `pnpm typecheck` + vitest targeted (engine, weekPendingWorkouts, weekly-streak,
   tests/mobile) + `tsc` web y mobile.
2. QA manual: alumno con sesion parcial HOY (card "En progreso" → ejecutor directo), dia pasado
   parcial (sheet "incompleto"), dia 100% (sheet clasico), plan solo-cardio (sets null).
3. Docs: `MOBILE_PARITY.md` (fila nueva), `CURRENT.md` al corte. QA fisica device queda pendiente
   del owner como siempre.

## Riesgos
- Consumidor de `done` olvidado → degrada silencioso: mitigado con auditoria por grep en F2.4/F3.4
  y tests de paridad.
- Denominador con bloques editados post-sesion → estados que migran: aceptado en SPEC (derivado
  puro, sin persistencia).
- Racha visual del ejecutor cambia (dot parcial): decision consciente, documentada en SPEC; la
  racha REAL (RPC) no se toca.
