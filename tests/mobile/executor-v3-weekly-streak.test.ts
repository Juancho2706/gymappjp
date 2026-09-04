/**
 * Racha semanal del ejecutor V3 (E4.4) — helpers puros. Verifica el anclaje Lun→Dom (incluye borde de
 * domingo, que en JS es getUTCDay()===0), la atribucion de estados (done/in_progress/today/pending/rest),
 * el denominador honesto (sesion extra fuera de plan suma al total) y el copy neutro sin culpa.
 *
 * Ademas cubre la REGLA DE COMPLETITUD (spec `workout-day-in-progress`, CEO O2 2026-07-26) tal como la
 * consume RN: los mismos `DAY_COMPLETION_FIXTURES` del engine que consumira la web, pasados por el
 * adaptador RN (`PlanWeekCompletionSource` → `planDayCompletionState`). Si el adaptador pierde `sets` o
 * `set_number` por el camino, el caso falla aca.
 */
import { describe, expect, it } from 'vitest'
import { DAY_COMPLETION_FIXTURES, countLoggedSetsByBlock, type DayCompletionBlock } from '@eva/workout-engine'
import {
  deriveWeeklyStreak,
  greedyPlanDone,
  greedyStatesForWeek,
  planDayCompletionState,
  plannedDatesForWeek,
  weekDatesMondayToSunday,
  WEEK_LETTERS_ES,
  type PlanWeekCompletionSource,
} from '../../apps/mobile/components/alumno/workout/v3/weekly-streak'

/** Arma la fuente de completitud del movil: bloques por plan + series por `planId|ymd`. */
function sourceOf(
  blocksByPlan: Record<string, DayCompletionBlock[]>,
  loggedSetsByPlanDay: Record<string, Record<string, number>>,
): PlanWeekCompletionSource {
  return {
    blocksByPlan: new Map(Object.entries(blocksByPlan)),
    loggedSetsByPlanDay: new Map(Object.entries(loggedSetsByPlanDay)),
  }
}

describe('weekDatesMondayToSunday', () => {
  it('un miercoles ancla al lunes de esa semana y da 7 dias Lun→Dom', () => {
    // 2026-07-22 es miercoles.
    const w = weekDatesMondayToSunday('2026-07-22')
    expect(w).toEqual([
      '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23',
      '2026-07-24', '2026-07-25', '2026-07-26',
    ])
    expect(w).toHaveLength(7)
  })

  it('un DOMINGO cae en su propia semana (no salta a la siguiente)', () => {
    // 2026-07-26 es domingo → debe ser el ultimo dia de la misma semana que arranca el 20.
    const w = weekDatesMondayToSunday('2026-07-26')
    expect(w[0]).toBe('2026-07-20')
    expect(w[6]).toBe('2026-07-26')
  })

  it('un LUNES es el primer dia', () => {
    const w = weekDatesMondayToSunday('2026-07-20')
    expect(w[0]).toBe('2026-07-20')
  })

  it('cruza el fin de mes correctamente', () => {
    // 2026-08-01 es sabado → lunes 2026-07-27.
    const w = weekDatesMondayToSunday('2026-08-01')
    expect(w[0]).toBe('2026-07-27')
    expect(w).toContain('2026-08-01')
  })
})

describe('plannedDatesForWeek', () => {
  const week = weekDatesMondayToSunday('2026-07-22') // Lun 20 .. Dom 26

  it('marca los dias por day_of_week (1=Lun..7=Dom)', () => {
    const planned = plannedDatesForWeek(
      [{ day_of_week: 1, assigned_date: null }, { day_of_week: 3, assigned_date: null }, { day_of_week: 5, assigned_date: null }],
      week,
    )
    expect([...planned].sort()).toEqual(['2026-07-20', '2026-07-22', '2026-07-24'])
  })

  it('marca por assigned_date (plan suelto de fecha fija)', () => {
    const planned = plannedDatesForWeek([{ day_of_week: null, assigned_date: '2026-07-23' }], week)
    expect([...planned]).toEqual(['2026-07-23'])
  })

  it('ignora fechas fuera de la semana', () => {
    const planned = plannedDatesForWeek([{ day_of_week: null, assigned_date: '2026-07-19' }], week)
    expect(planned.size).toBe(0)
  })
})

describe('paridad con @eva/workout-engine (regla de completitud del dia)', () => {
  // El estado que RN pinta para un dia debe ser EXACTAMENTE el del fixture: mismos bloques, mismas series.
  for (const f of DAY_COMPLETION_FIXTURES) {
    it(`fixture: ${f.name}`, () => {
      const source = sourceOf(
        { p1: [...f.input.blocks] },
        { 'p1|2026-07-22': { ...f.input.loggedSetsByBlock } },
      )
      expect(planDayCompletionState(source, 'p1', '2026-07-22')).toBe(f.expected.state)
    })
  }

  it('el adaptador RN cuenta series desde las filas crudas (dedup por block_id+set_number)', () => {
    // Dos veces la MISMA serie (la cola offline puede reenviarla antes de reconciliar) no infla el conteo:
    // 3 filas → 2 series de b1 → 2 de 3 esperadas = in_progress, jamas done.
    const logged = countLoggedSetsByBlock([
      { block_id: 'b1', set_number: 1 },
      { block_id: 'b1', set_number: 1 },
      { block_id: 'b1', set_number: 2 },
    ])
    const source = sourceOf({ p1: [{ id: 'b1', sets: 3 }] }, { 'p1|2026-07-22': logged })
    expect(planDayCompletionState(source, 'p1', '2026-07-22')).toBe('in_progress')
  })
})

describe('greedyPlanDone (atribucion greedy + completitud)', () => {
  const week = weekDatesMondayToSunday('2026-07-22') // Lun 20 .. Dom 26, hoy = mie 22
  const LUN = '2026-07-20'
  const JUE = '2026-07-23'
  const blocks = { p1: [{ id: 'b1', sets: 3 }, { id: 'b2', sets: 3 }] }

  it('CASO P0: UNA sola serie en su fecha => in_progress (antes daba done)', () => {
    const source = sourceOf(blocks, { [`p1|${LUN}`]: { b1: 1 } })
    expect(greedyPlanDone('p1', LUN, false, week, source)).toEqual({ state: 'in_progress', doneOnDate: null })
  })

  it('100% de las series en su fecha => done en fecha', () => {
    const source = sourceOf(blocks, { [`p1|${LUN}`]: { b1: 3, b2: 3 } })
    expect(greedyPlanDone('p1', LUN, false, week, source)).toEqual({ state: 'done', doneOnDate: null })
  })

  it('recuperacion: el plan del lunes se completa el jueves => done con doneOnDate jueves', () => {
    const source = sourceOf(blocks, { [`p1|${JUE}`]: { b1: 3, b2: 3 } })
    expect(greedyPlanDone('p1', LUN, false, week, source)).toEqual({ state: 'done', doneOnDate: JUE })
  })

  it('recuperacion a medias => in_progress con la fecha de esa sesion (no cierra el dia)', () => {
    const source = sourceOf(blocks, { [`p1|${JUE}`]: { b1: 2 } })
    expect(greedyPlanDone('p1', LUN, false, week, source)).toEqual({ state: 'in_progress', doneOnDate: JUE })
  })

  it('parcial en su fecha + sesion COMPLETA otro dia => done (la completa manda)', () => {
    const source = sourceOf(blocks, { [`p1|${LUN}`]: { b1: 1 }, [`p1|${JUE}`]: { b1: 3, b2: 3 } })
    expect(greedyPlanDone('p1', LUN, false, week, source)).toEqual({ state: 'done', doneOnDate: JUE })
  })

  it('un dia FUTURO nunca se atribuye', () => {
    const source = sourceOf(blocks, { [`p1|${JUE}`]: { b1: 3, b2: 3 } })
    expect(greedyPlanDone('p1', '2026-07-24', true, week, source)).toEqual({ state: 'none', doneOnDate: null })
  })

  it('cardio (sets null = 1 unidad): una serie por bloque cierra el dia', () => {
    const source = sourceOf({ p1: [{ id: 'c1', sets: null }, { id: 'c2' }] }, { [`p1|${LUN}`]: { c1: 1, c2: 1 } })
    expect(greedyPlanDone('p1', LUN, false, week, source).state).toBe('done')
    const partial = sourceOf({ p1: [{ id: 'c1', sets: null }, { id: 'c2' }] }, { [`p1|${LUN}`]: { c1: 1 } })
    expect(greedyPlanDone('p1', LUN, false, week, partial).state).toBe('in_progress')
  })

  it('logs de OTRO plan no atribuyen nada (dimension plan_id)', () => {
    const source = sourceOf({ ...blocks, p2: [{ id: 'x1', sets: 3 }] }, { [`p2|${LUN}`]: { x1: 3 } })
    expect(greedyPlanDone('p1', LUN, false, week, source)).toEqual({ state: 'none', doneOnDate: null })
  })
})

describe('greedyStatesForWeek', () => {
  const week = weekDatesMondayToSunday('2026-07-22') // Lun 20 .. Dom 26
  const plans = [
    { id: 'p1', day_of_week: 1, assigned_date: null }, // Lun 20
    { id: 'p2', day_of_week: 3, assigned_date: null }, // Mie 22 (hoy)
    { id: 'p3', day_of_week: 5, assigned_date: null }, // Vie 24 (futuro)
  ]
  const blocks = {
    p1: [{ id: 'a1', sets: 2 }],
    p2: [{ id: 'b1', sets: 2 }],
    p3: [{ id: 'c1', sets: 2 }],
  }

  it('separa dias cerrados de dias a medias y no toca el futuro', () => {
    const source = sourceOf(blocks, {
      'p1|2026-07-20': { a1: 2 }, // lunes completo
      'p2|2026-07-22': { b1: 1 }, // hoy a medias
      'p3|2026-07-24': { c1: 2 }, // futuro (imposible en la practica): jamas se atribuye
    })
    const { doneDates, inProgressDates } = greedyStatesForWeek(plans, week, '2026-07-22', source)
    expect([...doneDates]).toEqual(['2026-07-20'])
    expect([...inProgressDates]).toEqual(['2026-07-22'])
  })

  it('el dia a medias pinta dot in_progress, suma al denominador y NO al doneCount', () => {
    const source = sourceOf(blocks, { 'p1|2026-07-20': { a1: 2 }, 'p2|2026-07-22': { b1: 1 } })
    const { doneDates, inProgressDates } = greedyStatesForWeek(plans, week, '2026-07-22', source)
    const r = deriveWeeklyStreak({
      weekDates: week,
      plannedDates: plannedDatesForWeek(plans, week),
      doneDates,
      inProgressDates,
      todayIso: '2026-07-22',
    })
    expect(r.dots.map((d) => d.state)).toEqual([
      'done',        // Lun 20 cerrado
      'rest',        // Mar 21 sin plan
      'in_progress', // Mie 22 hoy a medias (gana a 'today')
      'rest',        // Jue 23
      'pending',     // Vie 24 con plan, futuro
      'rest',        // Sab 25
      'rest',        // Dom 26
    ])
    expect(r.doneCount).toBe(1)
    expect(r.plannedCount).toBe(3)
    expect(r.copy).toBe('1 de 3 esta semana')
  })

  it('una sesion PARCIAL fuera de plan suma al denominador (nunca "N de menos")', () => {
    const soloVie = [{ id: 'p3', day_of_week: 5, assigned_date: null }]
    const source = sourceOf({ p3: blocks.p3, p1: blocks.p1 }, { 'p1|2026-07-20': { a1: 1 } })
    const { doneDates, inProgressDates } = greedyStatesForWeek(
      [...soloVie, { id: 'p1', day_of_week: 1, assigned_date: null }],
      week,
      '2026-07-26',
      source,
    )
    const r = deriveWeeklyStreak({
      weekDates: week,
      plannedDates: plannedDatesForWeek(soloVie, week),
      doneDates,
      inProgressDates,
      todayIso: '2026-07-26',
    })
    expect(r.doneCount).toBe(0)
    expect(r.plannedCount).toBe(2) // Vie planificado + Lun con sesion parcial
    expect(r.copy).toBe('0 de 2 esta semana')
  })
})

describe('deriveWeeklyStreak', () => {
  const weekDates = weekDatesMondayToSunday('2026-07-22') // Lun 20 .. Dom 26, hoy = mie 22

  it('estados done/today/pending/rest y copy "N de M"', () => {
    const r = deriveWeeklyStreak({
      weekDates,
      // Plan Lun/Mie/Vie.
      plannedDates: new Set(['2026-07-20', '2026-07-22', '2026-07-24']),
      // Hecho Lun y (hoy) Mie.
      doneDates: new Set(['2026-07-20', '2026-07-22']),
      todayIso: '2026-07-22',
    })
    expect(r.dots.map((d) => d.state)).toEqual([
      'done',    // Lun 20 hecho
      'rest',    // Mar 21 sin plan
      'done',    // Mie 22 hecho (aunque sea hoy, done gana)
      'rest',    // Jue 23 sin plan
      'pending', // Vie 24 con plan, futuro
      'rest',    // Sab 25
      'rest',    // Dom 26
    ])
    expect(r.doneCount).toBe(2)
    expect(r.plannedCount).toBe(3)
    expect(r.copy).toBe('2 de 3 esta semana')
    expect(r.hasSignal).toBe(true)
  })

  it('hoy sin sesion se marca como today', () => {
    const r = deriveWeeklyStreak({
      weekDates,
      plannedDates: new Set(['2026-07-22']),
      doneDates: new Set(),
      todayIso: '2026-07-22',
    })
    expect(r.dots[2].state).toBe('today')
    expect(r.copy).toBe('0 de 1 esta semana')
  })

  it('una sesion FUERA de plan suma al denominador (done nunca supera planned)', () => {
    const r = deriveWeeklyStreak({
      weekDates,
      plannedDates: new Set(['2026-07-24']), // solo Vie planificado
      doneDates: new Set(['2026-07-20', '2026-07-24']), // Lun (extra) + Vie
      todayIso: '2026-07-26',
    })
    expect(r.doneCount).toBe(2)
    // Denominador = plan(Vie) ∪ done(Lun,Vie) = {Lun,Vie} = 2 → nunca "2 de 1".
    expect(r.plannedCount).toBe(2)
    expect(r.copy).toBe('2 de 2 esta semana')
  })

  it('sin plan ni sesiones: hasSignal=false y copy neutro', () => {
    const r = deriveWeeklyStreak({
      weekDates,
      plannedDates: new Set(),
      doneDates: new Set(),
      todayIso: '2026-07-22',
    })
    expect(r.hasSignal).toBe(false)
    expect(r.doneCount).toBe(0)
    expect(r.plannedCount).toBe(0)
    expect(r.copy).toBe('Sin sesiones esta semana')
  })

  it('las etiquetas son Lun→Dom', () => {
    const r = deriveWeeklyStreak({ weekDates, plannedDates: new Set(), doneDates: new Set(), todayIso: '2026-07-22' })
    expect(r.dots.map((d) => d.label)).toEqual([...WEEK_LETTERS_ES])
  })

  // QA6 (decision CEO 2026-07-22): la racha cuenta DIAS ASIGNADOS COMPLETADOS. Un dia sin nada
  // asignado (descanso implicito) es NEUTRO ('rest'): no cuenta al denominador ni corta la cadena.
  // Caso reportado: coach programa Lun y Mie, martes NADA; el alumno entrena Lun y Mie.
  it('CASO CEO: Lun+Mie asignados y hechos, Mar SIN asignar => "2 de 2" y martes neutro (rest) sin corte', () => {
    // Coach programo solo Lun (day_of_week 1) y Mie (day_of_week 3). Martes = sin plan.
    const planned = plannedDatesForWeek(
      [{ day_of_week: 1, assigned_date: null }, { day_of_week: 3, assigned_date: null }],
      weekDates,
    )
    const r = deriveWeeklyStreak({
      weekDates,
      plannedDates: planned,
      doneDates: new Set(['2026-07-20', '2026-07-22']), // Lun (20) + Mie (22) hechos
      todayIso: '2026-07-26', // domingo: Lun y Mie quedan en pasado, sin 'today' de por medio
    })
    // Martes (21) = sin plan => 'rest' (neutro), NUNCA 'pending'.
    expect(r.dots[1].state).toBe('rest')
    // La cadena Lun->Mie SALTA el martes sin romperse: ambos asignados quedan 'done'.
    expect(r.dots[0].state).toBe('done') // Lun 20
    expect(r.dots[2].state).toBe('done') // Mie 22
    // Y = dias ASIGNADOS (Lun + Mie) = 2, jamas 7 ni 3: el martes sin plan NO cuenta ni corta.
    expect(r.doneCount).toBe(2)
    expect(r.plannedCount).toBe(2)
    expect(r.copy).toBe('2 de 2 esta semana')
  })
})

/**
 * CICLO (spec `docs/specs/ciclo-real-y-por-lado`, R12/W3.6). En un programa `cycle` la columna
 * `day_of_week` guarda el INDICE del ciclo (1..14), no el ISODOW: mapearlo sobre la semana Lun→Dom
 * "planificaba" lun/mar/mie en un ciclo de 3 dias y doblaba los indices 8..14 de un ciclo largo sobre
 * los 7 primeros (el `((dow - 1) % 7 + 7) % 7` que se fue). En ciclo la tira Lun→Dom es de dias
 * ENTRENADOS: sin dia asignado, sin pendientes y sin greedy — el estado por dia del programa lo
 * resuelve `resolveCycleCursor`, no estos helpers.
 */
describe('estructura `cycle` — la grilla Lun→Dom no aplica (R12)', () => {
  const week = weekDatesMondayToSunday('2026-07-22') // Lun 20 .. Dom 26
  const cyclePlans = [
    { id: 'c1', day_of_week: 1, assigned_date: null }, // Dia 1 del ciclo
    { id: 'c2', day_of_week: 2, assigned_date: null }, // Dia 2
    { id: 'c3', day_of_week: 3, assigned_date: null }, // Dia 3
  ]
  const cycleBlocks = { c1: [{ id: 'x1', sets: 2 }], c2: [{ id: 'x2', sets: 2 }], c3: [{ id: 'x3', sets: 2 }] }

  it('plannedDatesForWeek no marca ningun dia (no existe el "dia asignado" del calendario)', () => {
    expect(plannedDatesForWeek(cyclePlans, week, 'cycle').size).toBe(0)
    // El mismo programa leido como weekly SI marca Lun/Mar/Mie: es exactamente el bug que se corrige.
    expect(plannedDatesForWeek(cyclePlans, week, 'weekly').size).toBe(3)
  })

  it('un ciclo LARGO ya no dobla los dias 8..14 sobre lunes..domingo', () => {
    const largo = [{ id: 'c8', day_of_week: 8, assigned_date: null }, { id: 'c14', day_of_week: 14, assigned_date: null }]
    expect(plannedDatesForWeek(largo, week, 'cycle').size).toBe(0)
    const source = sourceOf({ c8: [{ id: 'y8', sets: 2 }] }, { 'c8|2026-07-20': { y8: 2 } })
    // Sin estructura (weekly, default historico) un indice fuera de 1..7 ya no cae en un dia inventado.
    expect(greedyStatesForWeek(largo, week, '2026-07-22', source).doneDates.size).toBe(0)
  })

  it('greedyStatesForWeek no atribuye ningun slot en ciclo (cero pendientes, cero recuperaciones)', () => {
    const source = sourceOf(cycleBlocks, { 'c1|2026-07-20': { x1: 2 }, 'c2|2026-07-22': { x2: 1 } })
    const { doneDates, inProgressDates } = greedyStatesForWeek(cyclePlans, week, '2026-07-22', source, 'cycle')
    expect(doneDates.size).toBe(0)
    expect(inProgressDates.size).toBe(0)
    // Weekly (el default) sigue atribuyendo igual que siempre: el cambio es opt-in por estructura.
    // (`c2` cae en el slot del MARTES leido como weekly y su sesion parcial del miercoles se le
    // atribuye por el greedy — justo la semantica de calendario que en ciclo no existe.)
    const weekly = greedyStatesForWeek(cyclePlans, week, '2026-07-22', source)
    expect([...weekly.doneDates]).toEqual(['2026-07-20'])
    expect([...weekly.inProgressDates]).toEqual(['2026-07-21'])
  })

  it('la tira de ciclo son DIAS ENTRENADOS: dots done/today/rest, sin un solo pendiente', () => {
    // El caller (home.tsx) alimenta `doneDates` con los dias de la semana que tienen logs.
    const entrenados = new Set(['2026-07-20', '2026-07-22'])
    const r = deriveWeeklyStreak({
      weekDates: week,
      plannedDates: plannedDatesForWeek(cyclePlans, week, 'cycle'),
      doneDates: entrenados,
      inProgressDates: new Set(),
      todayIso: '2026-07-23',
    })
    expect(r.dots.map((d) => d.state)).toEqual(['done', 'rest', 'done', 'today', 'rest', 'rest', 'rest'])
    expect(r.dots.some((d) => d.state === 'pending')).toBe(false)
    expect(r.doneCount).toBe(2)
    expect(r.plannedCount).toBe(2)
  })
})
