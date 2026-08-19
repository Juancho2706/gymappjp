# QA6 — Racha del alumno: días sin asignación son NEUTROS (no cortan ni cuentan)

Fecha: 2026-07-22 · Rama: `fix/executor-v3-qa1` · Sin commits (worktree `executor-redesign`).

## Bug reportado (CEO)

> La racha del alumno se corta mal. Coach programa **lunes** actividad, **martes NADA** (descanso
> implícito — no usó el botón de día de descanso del builder), **miércoles** actividad. El alumno
> entrena lunes y miércoles → la racha **NO** debe cortarse por el martes: si un día NO tiene nada
> asignado es **neutro** (no cuenta ni corta). "Las rachas deben contar por día hecho como tal"
> (días **ASIGNADOS** hechos).

## Semántica ACTUAL encontrada (file:line)

### Motor de la racha semanal del ejecutor V3 — ya contaba días asignados

- **Web** `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/weekly-streak.ts:66-76`
  `computeWeeklyStreak`: `done = #(status==='done')`; **`planned = #(status !== 'rest')`** → el
  denominador ya EXCLUYE los días `rest`. NO cuenta contra 7 fijos ni contra días consecutivos.
- **Fuente de "qué días están asignados" (web)**: `deriveWeekWorkoutStatus`
  (`apps/web/src/app/c/[coach_slug]/dashboard/_data/weekPendingWorkouts.ts:231`):
  **`if (!s.dayPlan) status = 'rest'`** — un día sin fila de plan (`day_of_week`/`assigned_date`) es
  `'rest'`. Llega al ejecutor vía `getExecutorWeekStatusDays`
  (`.../_data/week-status.queries.ts:22-35`) que reusa esa misma derivación. **El dato de días
  asignados YA llega** — no hubo que cablear nada.
- **RN** `apps/mobile/components/alumno/workout/v3/weekly-streak.ts:88-117`
  `deriveWeeklyStreak`: estado por día `done | today | pending | rest`, con
  **`else state = 'rest'`** cuando no hay plan ni sesión (`:103`), y **`plannedCount =
  |plannedDates ∪ doneDates|`** (`:108`) — denominador = días asignados ∪ hechos, nunca 7.
  Cableado en `ExecutorV3.tsx:656-686` (`weekDatesMondayToSunday` + `plannedDatesForWeek` sobre las
  filas de plan). **El dato ya llega.**

**Conclusión del conteo:** en el caso exacto del CEO (Lun asignado+hecho, Mar sin plan, Mié
asignado+hecho) **ambos motores ya devolvían "2 de 2"** con el martes fuera del denominador. La
lógica de conteo NO estaba rota.

### El defecto real: el martes se PINTABA como un día fallido

Los dos renderizadores de dots **colapsaban `rest` (sin asignación) al mismo look que `todo`/`pending`
(asignado sin hacer)** — un punto de 16px con borde `#33333f`:

- Web `WeeklyStreakDots.tsx:35-36` (antes): `// rest / todo … return { background:'#26262f', border:'2px solid #33333f' }`.
- RN `WeekStreakDots.tsx:91-92` (antes): `// pending / rest … <View … borderColor:'#33333f' … />`.

Efecto: Lun(lleno) · Mar(punto bordeado, **se veía como "fallé el martes"**) · Mié(lleno). El eje
leía un eslabón roto entre dos días entrenados → percepción de "racha cortada", aunque el número
dijera "2 de 2". (El `MomentumCard` del home ya los distinguía —
`apps/mobile/components/alumno/home/MomentumCard.tsx:82-99`: sin asignación = celda vacía, asignado
sin hacer = punto tenue— por eso el bug sólo se veía en el ejecutor.)

### ¿El schema marca descanso? NO

`workout_plans` **no persiste** marcador de descanso. `is_rest` existe sólo como estado de UI del
builder (`packages/plan-builder/types.ts:93`, `WeeklyPlanBuilder.tsx:179,1367,1526`), pero el
read-mapper que hidrata desde la DB **nunca lee `is_rest`** (`WeeklyPlanBuilder.tsx:98-106, 117-125`)
y `database.types.ts` no tiene columna alguna. → **Un día de descanso EXPLÍCITO y uno IMPLÍCITO
persisten idénticos: ausencia de fila de plan para ese `day_of_week`.** Ambos ya caen en la rama
`'rest'` de las derivaciones. No hubo nada extra que cablear; ambos casos quedan neutros por igual.

## Cambio aplicado (decisión CEO)

Días SIN asignación (`rest`) se pintan **DISTINTO**: punto pequeño y tenue **sin borde de "fallo"**,
para que la fila Lun→Dom lea a los días entrenados como una cadena que **salta** los neutros. Se
respetó `today` por delante de `rest` (mirror web/RN): un día sin plan que ES hoy sigue mostrando el
anillo "hoy". El conteo "X de Y" (Y = días asignados) se conservó y se blindó con tests. Motor de
guardado **intocable**; lógica pura **sin cambios** (sólo presentación + tests). Web + RN espejo.

| Estado | Significado | Visual nuevo |
|---|---|---|
| `done` | asignado + hecho | relleno de acento + halo (sin cambios) |
| `today` | hoy, aún sin sesión | anillo de acento (sin cambios) |
| `todo`/`pending` | **asignado** sin hacer (pasado o futuro) | punto 16px con borde tenue, sin culpa (sin cambios) |
| `rest` | **SIN asignación** (implícito o descanso explícito) | **NUEVO: punto ~7px tenue, SIN borde — neutro** |

## Archivos tocados

- `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/WeeklyStreakDots.tsx` — rama `rest` en
  `dotStyle` (punto `scale(0.45)`, sin borde, `opacity 0.7`); `DOT_TITLE.rest = 'Sin asignación'`;
  doc actualizado.
- `apps/mobile/components/alumno/workout/v3/WeekStreakDots.tsx` — rama `rest` en `Dot` (View 7px sin
  borde); doc actualizado.
- `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/weekly-streak.test.ts` — +2 tests (caso CEO
  "2 de 2" sin corte; `rest` ≠ `todo`).
- `tests/mobile/executor-v3-weekly-streak.test.ts` — +1 test (caso CEO "2 de 2 esta semana", martes
  `rest`, cadena Lun→Mié intacta).

Lógica pura (`weekly-streak.ts` web/RN, `weekPendingWorkouts.ts`) **sin cambios**: ya satisfacía la
semántica; sólo se blindó con regresión.

## Gates

- `pnpm --filter web exec tsc --noEmit` → **EXIT 0**.
- `pnpm --filter @eva/mobile exec tsc --noEmit` → **EXIT 0**.
- `vitest run` de los 2 archivos tocados → **22 passed** (incluye los 3 nuevos casos CEO).

## Nota fuera de alcance (para el CEO)

Existe una racha DISTINTA: el ribbon **"X días de racha"** del home/dashboard
(`StreakRibbon`, RN + web) que viene del RPC `get_client_current_streak`
(`supabase/migrations/20260612053000_streak_cap_730d.sql`). Ésa cuenta **días calendario
consecutivos** con actividad (workout **o** comida) y SÍ se corta ante cualquier día sin actividad,
sin mirar asignación. Cambiarla es una migración DB (toca también la racha de nutrición) y queda
**fuera** del scope de este fix (client-side, motor de guardado intocable). Si el CEO quiere que esa
racha también "cuente por día asignado hecho", es una tarea aparte con decisión de producto (¿qué
pasa con nutrición? ¿días sin plan de entrenamiento pero con comida?).
