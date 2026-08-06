import { describe, expect, it } from 'vitest'
import { buildNutritionWeek, buildNutritionWeekDates, type NutritionHistoryDay } from '@eva/nutrition-v2'
import {
  formatFutureDayHeadline,
  formatHistoryWeekRangeLabel,
  formatPastDayHeadline,
  formatSelectedDayCaption,
  groupHistoryDaysByWeek,
  nutritionWeekHistoryCursor,
  resolveWeekIsoFromDateParam,
  resolveWeekIsoFromDowParam,
  toWeekNavCells,
} from './week-nav.logic'

// Semana de referencia: lunes 2026-07-27 … domingo 2026-08-02. Hoy = miércoles 2026-07-29.
const HOY = '2026-07-29'
const LUNES = '2026-07-27'
const SABADO = '2026-08-01'
const DOMINGO = '2026-08-02'
const WEEK = buildNutritionWeekDates(HOY)

describe('nutritionWeekHistoryCursor', () => {
  it('pide el historial con el cursor exclusivo del lunes siguiente (cubre Lu-Do)', () => {
    // `p_before` es EXCLUSIVO: con 2026-08-03 entra el domingo 2026-08-02 y no un día más.
    expect(nutritionWeekHistoryCursor(HOY)).toBe('2026-08-03')
    expect(nutritionWeekHistoryCursor(DOMINGO)).toBe('2026-08-03')
    expect(nutritionWeekHistoryCursor('no-es-fecha')).toBeNull()
  })
})

describe('resolveWeekIsoFromDowParam', () => {
  it('mapea 1=lunes … 7=domingo dentro de la semana en curso', () => {
    expect(resolveWeekIsoFromDowParam(WEEK, '1', HOY)).toBe(LUNES)
    expect(resolveWeekIsoFromDowParam(WEEK, '6', HOY)).toBe(SABADO)
    expect(resolveWeekIsoFromDowParam(WEEK, '7', HOY)).toBe(DOMINGO)
  })

  it('cae a hoy con parámetro ausente, fuera de rango o basura', () => {
    expect(resolveWeekIsoFromDowParam(WEEK, undefined, HOY)).toBe(HOY)
    expect(resolveWeekIsoFromDowParam(WEEK, '0', HOY)).toBe(HOY)
    expect(resolveWeekIsoFromDowParam(WEEK, '8', HOY)).toBe(HOY)
    expect(resolveWeekIsoFromDowParam(WEEK, 'lunes', HOY)).toBe(HOY)
    expect(resolveWeekIsoFromDowParam(WEEK, ['1', '2'], HOY)).toBe(HOY)
  })
})

describe('resolveWeekIsoFromDateParam', () => {
  it('acepta solo fechas de la semana mostrada', () => {
    expect(resolveWeekIsoFromDateParam(WEEK, LUNES, HOY)).toBe(LUNES)
    expect(resolveWeekIsoFromDateParam(WEEK, DOMINGO, HOY)).toBe(DOMINGO)
  })

  it('cae a hoy con otra semana o fecha inválida (jamás se pide un día suelto al backend)', () => {
    expect(resolveWeekIsoFromDateParam(WEEK, '2026-07-20', HOY)).toBe(HOY)
    expect(resolveWeekIsoFromDateParam(WEEK, '2026-02-30', HOY)).toBe(HOY)
    expect(resolveWeekIsoFromDateParam(WEEK, 'mañana', HOY)).toBe(HOY)
    expect(resolveWeekIsoFromDateParam(WEEK, undefined, HOY)).toBe(HOY)
  })
})

const targets = {
  calories: 2600,
  proteinG: 180,
  carbsG: 260,
  fatsG: 80,
  fiberG: 30,
  sodiumMg: null,
  waterMl: null,
}

const cells = buildNutritionWeek({
  variants: [
    { id: 'base', key: 'base', label: 'Día base', dayOfWeek: null, isDefault: true, targets: { ...targets, calories: 2100 } },
    { id: 'sab', key: 'sabado', label: 'Día alto', dayOfWeek: 6, isDefault: false, targets },
  ],
  history: [
    {
      localDate: LUNES,
      targets: { ...targets, calories: 2100 },
      consumed: { calories: 1900, proteinG: 150, carbsG: 200, fatsG: 60, fiberG: 20, entryCount: 5 },
      activeEntryCount: 5,
    },
  ],
  weekStartIso: HOY,
  todayIso: HOY,
})

const cellFor = (isoDate: string) => {
  const cell = cells.find((candidate) => candidate.isoDate === isoDate)
  if (cell == null) throw new Error(`celda ausente: ${isoDate}`)
  return cell
}

describe('titulares de día', () => {
  it('el pasado ubica sin culpa ni adjetivos', () => {
    expect(formatPastDayHeadline(cellFor(LUNES))).toBe('Estás viendo el lunes 27 de julio')
  })

  it('el futuro anuncia la variante proyectada con sus kcal', () => {
    expect(formatFutureDayHeadline(cellFor(SABADO))).toBe('El sábado sigues: Día alto · 2.600 kcal')
    // Día sin variante propia: cae al día base, que es lo que congelaría el snapshot.
    expect(formatFutureDayHeadline(cellFor(DOMINGO))).toBe('El domingo sigues: Día base · 2.100 kcal')
  })

  it('sin variante para ese día no inventa un plan', () => {
    expect(
      formatFutureDayHeadline({ longLabel: 'Sábado', variant: null, targets: null }),
    ).toBe('El sábado tu plan no prescribe comidas')
  })

  it('la caption de metas nombra el día y la variante', () => {
    expect(formatSelectedDayCaption(cellFor(SABADO))).toBe('Sábado · Día alto')
  })
})

describe('toWeekNavCells', () => {
  it('conserva lo que el chip pinta y poda el plan que no cruza al cliente', () => {
    const navCells = toWeekNavCells(cells)
    expect(navCells).toHaveLength(7)

    const lunes = navCells[0]
    expect(lunes.isoDate).toBe(LUNES)
    expect(lunes.shortLabel).toBe('Lu')
    expect(lunes.state).toBe('past-logged')
    expect(lunes.consumed?.entryCount).toBe(5)

    // El árbol del plan (franjas, alimentos, media) NO se serializa para pintar 7 chips.
    expect(navCells.every((cell) => cell.variant === null)).toBe(true)
    expect(navCells.every((cell) => cell.targets === null)).toBe(true)
    expect(navCells.every((cell) => cell.legacy === null)).toBe(true)
  })

  it('el futuro nunca lleva consumo y hoy queda marcado', () => {
    const navCells = toWeekNavCells(cells)
    expect(navCells.find((cell) => cell.isoDate === HOY)?.state).toBe('today')
    expect(navCells.find((cell) => cell.isoDate === SABADO)?.state).toBe('future')
    expect(navCells.find((cell) => cell.isoDate === SABADO)?.consumed).toBeNull()
  })
})

// ── Historial por semanas (SPEC ola 3 punto 7) ────────────────────────────────────

function historyDay(overrides: Partial<NutritionHistoryDay> & { localDate: string }): NutritionHistoryDay {
  return {
    snapshotId: null,
    planVersionId: null,
    strategy: null,
    targets: { calories: 2000, proteinG: 150, carbsG: 200, fatsG: 60, fiberG: 25, sodiumMg: null, waterMl: null },
    consumed: { calories: 1800, proteinG: 140, carbsG: 190, fatsG: 55, fiberG: 20, entryCount: 3 },
    activeEntryCount: 3,
    correctionCount: 0,
    legacyCompletionCount: 0,
    legacyDisclosure: null,
    lastRecordedAt: `${overrides.localDate}T20:00:00.000Z`,
    ...overrides,
  }
}

describe('groupHistoryDaysByWeek', () => {
  // Semana pasada Lu-Do: 2026-07-20 (lunes) … 2026-07-26 (domingo).
  const rows: NutritionHistoryDay[] = [
    historyDay({ localDate: '2026-07-24' }), // viernes, con registro
    historyDay({ localDate: '2026-07-22' }), // miercoles, con registro
    historyDay({ localDate: '2026-07-13' }), // semana anterior a esa (lunes 13-19 jul)
  ]

  it('agrupa filas dispersas en semanas Lu-Do, mas reciente primero', () => {
    const weeks = groupHistoryDaysByWeek(rows, HOY)
    expect(weeks).toHaveLength(2)
    expect(weeks[0].weekStartIso).toBe('2026-07-20')
    expect(weeks[0].weekEndIso).toBe('2026-07-26')
    expect(weeks[1].weekStartIso).toBe('2026-07-13')
  })

  it('cada semana trae sus 7 celdas y cuenta solo los dias con registro real', () => {
    const [week] = groupHistoryDaysByWeek(rows, HOY)
    expect(week.cells).toHaveLength(7)
    expect(week.loggedCount).toBe(2)
    expect(week.percent).toBe(29) // round(2/7*100)
    // Los 5 dias sin fila de esa semana quedan "sin registro", no inventados.
    const lunes = week.cells.find((cell) => cell.isoDate === '2026-07-20')
    expect(lunes?.state).toBe('past-empty')
  })

  it('sin filas no fabrica semanas', () => {
    expect(groupHistoryDaysByWeek([], HOY)).toEqual([])
  })

  it('no serializa el arbol del plan: las celdas vienen podadas (variant siempre null)', () => {
    const [week] = groupHistoryDaysByWeek(rows, HOY)
    expect(week.cells.every((cell) => cell.variant === null)).toBe(true)
  })

  it('excluye la semana en curso (paridad RN T1.3): esa vive en el tab Hoy, no en el historial', () => {
    const rowsWithCurrentWeek: NutritionHistoryDay[] = [
      historyDay({ localDate: HOY }), // miercoles de la semana en curso (2026-07-27..2026-08-02)
      ...rows,
    ]
    const weeks = groupHistoryDaysByWeek(rowsWithCurrentWeek, HOY)
    expect(weeks).toHaveLength(2)
    expect(weeks.some((week) => week.weekStartIso === '2026-07-27')).toBe(false)
    expect(weeks[0].weekStartIso).toBe('2026-07-20')
  })

  it('semana en curso sola, sin semanas cerradas, no fabrica ningun bucket', () => {
    expect(groupHistoryDaysByWeek([historyDay({ localDate: HOY })], HOY)).toEqual([])
  })
})

describe('formatHistoryWeekRangeLabel', () => {
  it('mismo mes: "21-27 jul"', () => {
    expect(formatHistoryWeekRangeLabel('2026-07-21', '2026-07-27')).toBe('21-27 jul')
  })

  it('cruza de mes: incluye el mes de inicio', () => {
    expect(formatHistoryWeekRangeLabel('2026-07-28', '2026-08-03')).toBe('28 jul-3 ago')
  })
})
