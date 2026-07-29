/**
 * Semana Lu-Do de la FICHA DEL COACH en RN (T3.5) — composición de datos.
 *
 * La pantalla `apps/mobile/app/coach/nutrition-v2/[clientId].tsx` pinta la semana con el payload
 * que `getNutritionClientDetailV2` ya trajo: `plan.dayVariants` (el RPC devuelve TODAS las
 * variantes) + `recentDays` (historial disperso, recortado a la ventana del addon). Cero fetch por
 * celda y CERO llamadas a `get_nutrition_today_v2` con otra fecha.
 *
 * Estos tests fijan la composición exacta que la ficha consume — no el JSX — para que un cambio en
 * el recorte Pro o en el helper compartido no reintroduzca las mentiras que el SPEC prohíbe:
 * proyectar el plan vigente sobre el pasado, o pintar "0 kcal" donde no hubo registro.
 */
import { describe, expect, it } from 'vitest'
import { buildNutritionWeek } from '@eva/nutrition-v2'
import { filterHistoryDaysToBaseWindow } from '../apps/mobile/lib/nutrition-v2-pro'

const TODAY = '2026-07-29' // miércoles
const MONDAY = '2026-07-27'

function targets(calories: number) {
  return {
    calories,
    proteinG: 100,
    carbsG: 200,
    fatsG: 60,
    fiberG: 25,
    sodiumMg: null,
    waterMl: null,
  }
}

function consumed(calories: number, entryCount: number) {
  return { calories, proteinG: 90, carbsG: 180, fatsG: 55, fiberG: 20, entryCount }
}

/** Plan Pro: variante base + una específica de sábado (dow 6). */
const VARIANTS = [
  { id: 'v-base', key: 'base', label: 'Día base', dayOfWeek: null, isDefault: true, targets: targets(2200) },
  { id: 'v-sab', key: 'sabado', label: 'Sábado libre', dayOfWeek: 6, isDefault: false, targets: targets(2600) },
]

function historyDay(overrides: {
  localDate: string
  targetsCalories?: number
  consumedCalories?: number
  activeEntryCount?: number
  legacyDisclosure?: 'legacy_completion_without_food_detail' | null
  legacyCompletionCount?: number
}) {
  return {
    localDate: overrides.localDate,
    targets: targets(overrides.targetsCalories ?? 2200),
    consumed: consumed(overrides.consumedCalories ?? 0, overrides.activeEntryCount ?? 0),
    activeEntryCount: overrides.activeEntryCount ?? 0,
    correctionCount: 0,
    legacyCompletionCount: overrides.legacyCompletionCount ?? 0,
    legacyDisclosure: overrides.legacyDisclosure ?? null,
  }
}

describe('ficha coach RN — semana Lu-Do compuesta desde clientDetail', () => {
  it('siempre son 7 celdas Lu→Do y hoy es la única marcada como "today"', () => {
    const cells = buildNutritionWeek({
      variants: VARIANTS,
      history: [],
      weekStartIso: TODAY,
      todayIso: TODAY,
    })

    expect(cells).toHaveLength(7)
    expect(cells[0].isoDate).toBe(MONDAY)
    expect(cells.map((cell) => cell.shortLabel)).toEqual(['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'])
    expect(cells.filter((cell) => cell.state === 'today')).toHaveLength(1)
    expect(cells.find((cell) => cell.isoDate === TODAY)?.state).toBe('today')
  })

  it('día pasado: manda el snapshot del historial, no la estructura vigente', () => {
    // El coach republicó el plan (variante base = 2200 kcal), pero el lunes el alumno tuvo 1800.
    const cells = buildNutritionWeek({
      variants: VARIANTS,
      history: [
        historyDay({ localDate: MONDAY, targetsCalories: 1800, consumedCalories: 1750, activeEntryCount: 4 }),
      ],
      weekStartIso: TODAY,
      todayIso: TODAY,
    })

    const monday = cells[0]
    expect(monday.state).toBe('past-logged')
    expect(monday.targetsSource).toBe('snapshot')
    expect(monday.targets?.calories).toBe(1800)
    expect(monday.consumed?.calories).toBe(1750)
  })

  it('día pasado sin fila: "sin registro" con consumed null, nunca ceros', () => {
    const cells = buildNutritionWeek({
      variants: VARIANTS,
      history: [],
      weekStartIso: TODAY,
      todayIso: TODAY,
    })

    const tuesday = cells[1]
    expect(tuesday.state).toBe('past-empty')
    expect(tuesday.consumed).toBeNull()
  })

  it('día futuro: variante proyectada por día de semana, sin consumo', () => {
    const cells = buildNutritionWeek({
      variants: VARIANTS,
      history: [],
      weekStartIso: TODAY,
      todayIso: TODAY,
    })

    const saturday = cells[5]
    expect(saturday.state).toBe('future')
    expect(saturday.variant?.label).toBe('Sábado libre')
    expect(saturday.targetsSource).toBe('projected')
    expect(saturday.targets?.calories).toBe(2600)
    expect(saturday.consumed).toBeNull()

    const thursday = cells[3]
    expect(thursday.state).toBe('future')
    expect(thursday.variant?.label).toBe('Día base')
  })

  it('día del sistema anterior: cuenta como registrado y no expone los ceros V2', () => {
    const cells = buildNutritionWeek({
      variants: VARIANTS,
      history: [
        historyDay({
          localDate: MONDAY,
          activeEntryCount: 0,
          legacyDisclosure: 'legacy_completion_without_food_detail',
          legacyCompletionCount: 3,
        }),
      ],
      weekStartIso: TODAY,
      todayIso: TODAY,
    })

    const monday = cells[0]
    expect(monday.state).toBe('past-logged')
    expect(monday.isLegacy).toBe(true)
    expect(monday.legacy?.legacyOnly).toBe(true)
    expect(monday.consumed).toBeNull()
  })

  it('el recorte del coach base (30 días) se aplica ANTES de componer y no rompe la semana', () => {
    const history = [
      historyDay({ localDate: MONDAY, consumedCalories: 1750, activeEntryCount: 4 }),
      historyDay({ localDate: '2026-05-01', consumedCalories: 1900, activeEntryCount: 3 }),
    ]
    const clamped = filterHistoryDaysToBaseWindow(history, TODAY)
    expect(clamped.map((day) => day.localDate)).toEqual([MONDAY])

    const cells = buildNutritionWeek({
      variants: VARIANTS,
      history: clamped,
      weekStartIso: TODAY,
      todayIso: TODAY,
    })
    expect(cells).toHaveLength(7)
    expect(cells[0].consumed?.calories).toBe(1750)
  })
})
