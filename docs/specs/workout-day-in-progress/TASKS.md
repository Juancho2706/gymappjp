# TASKS — Estado "En progreso" del dia de entrenamiento

## F1 · Engine
- [x] `packages/workout-engine/day-completion.ts`: `deriveDayCompletion` (regla SPEC). (Ruta
      corregida 2026-08-17: sin subcarpeta `src/`.)
- [x] Tests unitarios: sets normales, sets null/0 (cardio = 1 unidad), cap por bloque, 0 logs,
      100% exacto, bloque borrado (log huerfano se ignora).
- [x] Fixtures de paridad exportados (consumidos por tests web y RN).

## F2 · Web
- [x] `dashboard.queries.ts`: `getClientWorkoutPlans` trae `workout_blocks(id, sets)`.
- [x] `weekPendingWorkouts.ts`: `WeekLogRow` + `block_id`/`set_number`; targets por plan;
      `WeekDayStatus = 'done' | 'in_progress' | 'pending' | 'none' | ...` (revisar union real);
      greedy cierra solo con done; tests nuevos (parcial hoy, parcial pasado, cardio-only).
- [x] `WorkoutPlanCard.tsx`: visual "En progreso"; tap hoy→ejecutor directo; pasado→sheet
      "Entrenamiento incompleto"; sheet clasico solo done. A11y labels nuevos.
- [x] Banner pendientes (`ActiveProgramSection` web o equivalente) con in_progress.
- [x] `week-status.queries.ts` + `v3/weekly-streak.ts` (`dotStateFor`): dot parcial.
- [x] Auditoria grep `status === 'done'` / `'done'` en apps/web — cerrar lista aqui:
      `WorkoutPlanCard.tsx:74,130`, `weekPendingWorkouts.ts:227+`, `week-status.queries.ts:32`,
      `v3/weekly-streak.ts:49-60`, hero (`heroComplianceBundle.ts:141-143`, ya al 100%).

## F3 · RN
- [x] `app/alumno/(tabs)/home.tsx`: logs con `set_number`; targets de bloques; banner de hoy usa
      el estado del engine (se apoya en el fix previo de "otro plan").
- [x] `components/alumno/workout/v3/weekly-streak.ts`: `greedyPlanDone` → engine; borrar copia.
- [x] `ActiveProgramSection.tsx` (:87, :344) + dots `ExecutorV3.tsx` (:878-909): tercera visual.
- [x] Auditoria grep `'done'` en apps/mobile — cerrar lista.
- [x] Tests `tests/mobile/executor-v3-weekly-streak.test.ts` + fixtures de paridad.

## F4 · Cierre
- [x] Gates: lint, typecheck, vitest targeted, tsc web + mobile.
- [x] QA manual (owner, 2026-07-26, preview Vercel vs prod DB): parcial hoy, parcial pasado, 100%, cardio-only y sheet/banner — aprobado. Hallazgo colateral: planes de programas inactivos con assigned_date secuestran celdas (backlog).
- [x] `MOBILE_PARITY.md` + `CURRENT.md`.
- [ ] QA fisica device: pendiente owner.

## Fuera de alcance (explicito)
- RPC `get_client_current_streak` (racha real), `workout_sessions` (O3), adherencia 30d/momentum.
