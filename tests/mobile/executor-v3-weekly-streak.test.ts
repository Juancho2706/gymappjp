/**
 * Racha semanal del ejecutor V3 (E4.4) — helpers puros. Verifica el anclaje Lun→Dom (incluye borde de
 * domingo, que en JS es getUTCDay()===0), la atribucion de estados (done/today/pending/rest), el
 * denominador honesto (sesion extra fuera de plan suma al total) y el copy neutro sin culpa.
 */
import { describe, expect, it } from 'vitest'
import {
  deriveWeeklyStreak,
  plannedDatesForWeek,
  weekDatesMondayToSunday,
  WEEK_LETTERS_ES,
} from '../../apps/mobile/components/alumno/workout/v3/weekly-streak'

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
