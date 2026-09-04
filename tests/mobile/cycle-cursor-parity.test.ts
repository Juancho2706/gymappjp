/**
 * PARIDAD del cursor del ciclo web ↔ RN (spec `docs/specs/ciclo-real-y-por-lado`, W3.5/W3.7b).
 *
 * El fixture compartido (`CYCLE_CURSOR_FIXTURES` de `@eva/workout-engine`) entra por el adaptador RN
 * REAL —`deriveProgramCursor`, el mismo que usa `home.tsx`— armado desde las estructuras del home
 * (`Program`/`Plan` de `components/alumno/home/types.ts`) y desde las filas CRUDAS de la lectura de
 * 30 dias. Si el adaptador pierde `sets`, `block_id`, el `plan_id` del embed o `logged_at` por el
 * camino, el caso falla aca: el alumno veria "Dia 2 de 3" en la PWA y "Dia 1 de 3" en la app (R10).
 */
import { describe, expect, it } from 'vitest'
import {
  CYCLE_CURSOR_FIXTURES,
  CYCLE_FIXTURE_BLOCKS,
  CYCLE_FIXTURE_PLANS,
  CYCLE_FIXTURE_PROGRAM,
  CYCLE_FIXTURE_TODAY_ISO,
  type CycleCompletionLogRow,
  type CycleCursorPlan,
  type CycleCursorProgram,
  type DayCompletionBlock,
} from '@eva/workout-engine'
import { deriveProgramCursor } from '../../apps/mobile/components/alumno/home/program-cursor'
import type { Plan, Program } from '../../apps/mobile/components/alumno/home/types'

/** Plan del home a partir del plan del fixture + sus bloques (el `sets` es el denominador del dia). */
function planOf(row: CycleCursorPlan, blocks: readonly DayCompletionBlock[] | undefined): Plan {
  const heroBlocks = (blocks ?? []).map((b) => ({ id: b.id, name: 'Ejercicio', sets: b.sets ?? 0, reps: '10' }))
  return {
    id: row.id,
    title: row.title ?? '',
    day_of_week: row.day_of_week,
    assigned_date: null,
    week_variant: null,
    blockCount: heroBlocks.length,
    blocks: heroBlocks,
  }
}

/** Programa activo del home a partir del programa del fixture. */
function programOf(
  row: CycleCursorProgram,
  plans: readonly CycleCursorPlan[],
  blocksByPlan: Readonly<Record<string, readonly DayCompletionBlock[]>>,
): Program {
  return {
    id: 'prog-1',
    name: 'Programa',
    plans: plans.map((p) => planOf(p, blocksByPlan[p.id])),
    phases: null,
    weeksToRepeat: 4,
    startDate: row.start_date,
    abMode: false,
    structureType: row.program_structure_type,
    cycleLength: row.cycle_length,
    startDateFlexible: row.start_date_flexible,
  }
}

const FIXTURE_PROGRAM = programOf(CYCLE_FIXTURE_PROGRAM, CYCLE_FIXTURE_PLANS, CYCLE_FIXTURE_BLOCKS)

describe('deriveProgramCursor — paridad con el fixture compartido del motor', () => {
  for (const fixture of CYCLE_CURSOR_FIXTURES) {
    it(`fixture: ${fixture.name}`, () => {
      const program = programOf(fixture.program, fixture.plans, fixture.blocksByPlan)
      const cursor = deriveProgramCursor({
        program,
        plans: program.plans,
        logs: fixture.logs,
        todayIso: fixture.todayIso,
      })

      // Los dos invariantes de la aceptacion: MISMO dia y MISMO estado de programa que web.
      expect(cursor.todayPlanId).toBe(fixture.expectedCursor.todayPlanId)
      expect(cursor.programState).toBe(fixture.expectedCursor.programState)

      // El resto del contrato que consumen las secciones (W3.8) tampoco puede divergir.
      expect(cursor.mode).toBe(fixture.expectedCursor.mode)
      expect(cursor.todayState).toBe(fixture.expectedCursor.todayState)
      expect(cursor.todayCycleIndex).toBe(fixture.expectedCursor.todayCycleIndex)
      expect(cursor.nextPlanId).toBe(fixture.expectedCursor.nextPlanId)
      expect(cursor.nextCycleIndex).toBe(fixture.expectedCursor.nextCycleIndex)
      expect(cursor.lastCompleted).toEqual(fixture.expectedCursor.lastCompleted ?? null)
      expect(cursor.slots.map((s) => ({ planId: s.planId, cycleIndex: s.cycleIndex, state: s.state, doneDateIso: s.doneDateIso }))).toEqual(
        fixture.expectedCursor.slots.map((s) => ({
          planId: s.planId,
          cycleIndex: s.cycleIndex,
          state: s.state,
          doneDateIso: s.doneDateIso ?? null,
        })),
      )
    })
  }
})

describe('deriveProgramCursor — reinicio en Dia 1 (R10)', () => {
  it('sin logs en la ventana de 30 dias, hoy toca el Dia 1', () => {
    const cursor = deriveProgramCursor({
      program: FIXTURE_PROGRAM,
      plans: FIXTURE_PROGRAM.plans,
      logs: [],
      todayIso: CYCLE_FIXTURE_TODAY_ISO,
    })
    expect(cursor.todayPlanId).toBe('p1')
    expect(cursor.todayCycleIndex).toBe(1)
    expect(cursor.todayState).toBe('todo')
    expect(cursor.todayLabel).toBe('Día 1 de 3')
    expect(cursor.nextLabel).toBe('Día 2 de 3')
  })

  it('un dia cerrado FUERA de la ventana (60 dias atras) no revive el ciclo: sigue el Dia 1', () => {
    const viejo: CycleCompletionLogRow[] = [
      { block_id: 'b1a', set_number: 1, logged_at: '2026-07-05T15:00:00.000Z', workout_blocks: { plan_id: 'p1' } },
      { block_id: 'b1a', set_number: 2, logged_at: '2026-07-05T15:05:00.000Z', workout_blocks: { plan_id: 'p1' } },
      { block_id: 'b1b', set_number: 1, logged_at: '2026-07-05T15:10:00.000Z', workout_blocks: { plan_id: 'p1' } },
      { block_id: 'b1b', set_number: 2, logged_at: '2026-07-05T15:15:00.000Z', workout_blocks: { plan_id: 'p1' } },
    ]
    const cursor = deriveProgramCursor({
      program: FIXTURE_PROGRAM,
      plans: FIXTURE_PROGRAM.plans,
      logs: viejo,
      todayIso: CYCLE_FIXTURE_TODAY_ISO,
    })
    expect(cursor.todayPlanId).toBe('p1')
    expect(cursor.todayCycleIndex).toBe(1)
    expect(cursor.lastCompleted).toBeNull()
  })

  it('sin programa activo el cursor queda vacio (nada que pintar)', () => {
    const cursor = deriveProgramCursor({ program: null, plans: [], logs: [], todayIso: CYCLE_FIXTURE_TODAY_ISO })
    expect(cursor.todayPlanId).toBeNull()
    expect(cursor.slots).toEqual([])
    expect(cursor.programState).toBe('active')
  })
})

describe('deriveProgramCursor — programState (R30) y etiquetas (R8/R31)', () => {
  it('inicio flexible SIN fecha ⇒ not_started, y aun asi resuelve el Dia 1 disponible', () => {
    const program: Program = { ...FIXTURE_PROGRAM, startDate: null, startDateFlexible: true }
    const cursor = deriveProgramCursor({
      program,
      plans: program.plans,
      logs: [],
      todayIso: CYCLE_FIXTURE_TODAY_ISO,
    })
    expect(cursor.programState).toBe('not_started')
    expect(cursor.todayPlanId).toBe('p1')
    expect(cursor.todayLabel).toBe('Día 1 de 3')
  })

  it('flexible CON fecha ⇒ active (el programa ya arranco)', () => {
    const program: Program = { ...FIXTURE_PROGRAM, startDateFlexible: true }
    const cursor = deriveProgramCursor({ program, plans: program.plans, logs: [], todayIso: CYCLE_FIXTURE_TODAY_ISO })
    expect(cursor.programState).toBe('active')
  })

  it('los slots del ciclo traen las tres formas de `programDayLabel`, nunca dias de la semana', () => {
    const cursor = deriveProgramCursor({
      program: FIXTURE_PROGRAM,
      plans: FIXTURE_PROGRAM.plans,
      logs: [],
      todayIso: CYCLE_FIXTURE_TODAY_ISO,
    })
    expect(cursor.slots.map((s) => s.label)).toEqual(['Día 1', 'Día 2', 'Día 3'])
    expect(cursor.slots.map((s) => s.labelLong)).toEqual(['Día 1 de 3', 'Día 2 de 3', 'Día 3 de 3'])
    expect(cursor.slots.map((s) => s.labelChip)).toEqual(['D1', 'D2', 'D3'])
    expect(cursor.slots.map((s) => s.title)).toEqual(['Empuje', 'Tirón', 'Pierna'])
  })
})

describe('deriveProgramCursor — weekly es la IDENTIDAD de la resolucion de siempre', () => {
  // 2026-09-03 es JUEVES (ISODOW 4): el plan del jueves es el de hoy y el del viernes el proximo.
  const weeklyProgram: Program = {
    ...FIXTURE_PROGRAM,
    structureType: 'weekly',
    cycleLength: null,
    plans: [
      planOf({ id: 'w2', day_of_week: 2, title: 'Martes' }, [{ id: 'bw2', sets: 2 }]),
      planOf({ id: 'w4', day_of_week: 4, title: 'Jueves' }, [{ id: 'bw4', sets: 2 }]),
      planOf({ id: 'w5', day_of_week: 5, title: 'Viernes' }, [{ id: 'bw5', sets: 2 }]),
    ],
  }

  it('hoy = el plan del ISODOW de hoy y el proximo = el siguiente ISODOW con plan, SIN wrap', () => {
    const cursor = deriveProgramCursor({
      program: weeklyProgram,
      plans: weeklyProgram.plans,
      logs: [],
      todayIso: CYCLE_FIXTURE_TODAY_ISO,
    })
    expect(cursor.mode).toBe('weekly')
    expect(cursor.todayPlanId).toBe('w4')
    expect(cursor.todayCycleIndex).toBe(4)
    expect(cursor.todayState).toBe('todo')
    expect(cursor.nextPlanId).toBe('w5')
    expect(cursor.todayLabel).toBe('Jueves')
    expect(cursor.slots.map((s) => s.labelChip)).toEqual(['Mar', 'Jue', 'Vie'])
  })

  it('las completitudes NO mueven el cursor en weekly (los estados los siguen dando las grillas)', () => {
    const logs: CycleCompletionLogRow[] = [
      { block_id: 'bw4', set_number: 1, logged_at: '2026-09-03T15:00:00.000Z', workout_blocks: { plan_id: 'w4' } },
      { block_id: 'bw4', set_number: 2, logged_at: '2026-09-03T15:05:00.000Z', workout_blocks: { plan_id: 'w4' } },
    ]
    const cursor = deriveProgramCursor({
      program: weeklyProgram,
      plans: weeklyProgram.plans,
      logs,
      todayIso: CYCLE_FIXTURE_TODAY_ISO,
    })
    expect(cursor.todayPlanId).toBe('w4')
    expect(cursor.todayState).toBe('todo')
    expect(cursor.slots.every((s) => s.state !== 'done')).toBe(true)
  })
})
