import { describe, expect, it } from 'vitest'
import {
  NUTRITION_WEEK_ORDER,
  buildNutritionDayVariantWeekStrip,
  formatNutritionDayOfWeek,
  formatNutritionTodayVariantBadge,
  nutritionDayOfWeekFromIso,
  resolveNutritionDayVariantForDate,
  resolveNutritionDayVariantForDow,
  sortNutritionDayVariantsForDisplay,
} from './day-variants'

interface Variant {
  id: string
  label: string
  dayOfWeek: number | null
  isDefault: boolean
  targets?: { calories: number | null }
}

const base: Variant = { id: 'base', label: 'Todos los días', dayOfWeek: null, isDefault: true, targets: { calories: 2000 } }
const sabado: Variant = { id: 'sa', label: 'Sábado', dayOfWeek: 6, isDefault: false, targets: { calories: 2600 } }
const domingo: Variant = { id: 'do', label: 'Domingo', dayOfWeek: 0, isDefault: false, targets: { calories: 2400 } }
const variants = [base, sabado, domingo]

describe('nutritionDayOfWeekFromIso', () => {
  it('usa la fecha local tal cual (0=domingo, sin corrimiento por zona)', () => {
    // 2026-07-28 = martes; 2026-08-01 = sábado; 2026-08-02 = domingo.
    expect(nutritionDayOfWeekFromIso('2026-07-28')).toBe(2)
    expect(nutritionDayOfWeekFromIso('2026-08-01')).toBe(6)
    expect(nutritionDayOfWeekFromIso('2026-08-02')).toBe(0)
  })

  it('rechaza cadenas que no son una fecha válida', () => {
    expect(nutritionDayOfWeekFromIso('2026-13-01')).toBeNull()
    expect(nutritionDayOfWeekFromIso('2026-02-30')).toBeNull()
    expect(nutritionDayOfWeekFromIso('mañana')).toBeNull()
    expect(nutritionDayOfWeekFromIso(null)).toBeNull()
  })
})

describe('resolveNutritionDayVariantForDow', () => {
  it('el match exacto de día gana sobre la variante por defecto', () => {
    expect(resolveNutritionDayVariantForDow(variants, 6)).toBe(sabado)
    expect(resolveNutritionDayVariantForDow(variants, 0)).toBe(domingo)
  })

  it('sin match exacto cae a la variante por defecto', () => {
    for (const dow of [1, 2, 3, 4, 5]) {
      expect(resolveNutritionDayVariantForDow(variants, dow)).toBe(base)
    }
  })

  it('sin default y sin match exacto no inventa variante', () => {
    const soloSabado = [sabado]
    expect(resolveNutritionDayVariantForDow(soloSabado, 6)).toBe(sabado)
    expect(resolveNutritionDayVariantForDow(soloSabado, 3)).toBeNull()
    expect(resolveNutritionDayVariantForDow([], 3)).toBeNull()
  })

  it('resuelve por fecha local del alumno', () => {
    expect(resolveNutritionDayVariantForDate(variants, '2026-08-01')).toBe(sabado)
    expect(resolveNutritionDayVariantForDate(variants, '2026-07-28')).toBe(base)
    expect(resolveNutritionDayVariantForDate(variants, 'no-es-fecha')).toBe(base)
  })
})

describe('sortNutritionDayVariantsForDisplay', () => {
  it('deja la base primero y ordena los días de lunes a domingo', () => {
    const lunes: Variant = { id: 'lu', label: 'Lunes', dayOfWeek: 1, isDefault: false }
    const ordered = sortNutritionDayVariantsForDisplay([domingo, sabado, lunes, base])
    expect(ordered.map((variant) => variant.id)).toEqual(['base', 'lu', 'sa', 'do'])
  })

  it('no muta el arreglo original', () => {
    const input = [domingo, base]
    const ordered = sortNutritionDayVariantsForDisplay(input)
    expect(input.map((variant) => variant.id)).toEqual(['do', 'base'])
    expect(ordered.map((variant) => variant.id)).toEqual(['base', 'do'])
  })
})

describe('buildNutritionDayVariantWeekStrip', () => {
  it('cubre la semana completa: cada día lo reclama exactamente una variante', () => {
    const strips = variants.map((variant) =>
      buildNutritionDayVariantWeekStrip({ variants, variant, todayIso: '2026-08-01' }),
    )
    expect(strips[0]).toHaveLength(NUTRITION_WEEK_ORDER.length)
    for (let index = 0; index < NUTRITION_WEEK_ORDER.length; index += 1) {
      const claims = strips.filter((strip) => strip[index].applies)
      expect(claims).toHaveLength(1)
    }
  })

  it('la base cubre lunes a viernes y los días específicos su día', () => {
    const baseStrip = buildNutritionDayVariantWeekStrip({ variants, variant: base, todayIso: '2026-08-01' })
    expect(baseStrip.filter((day) => day.applies).map((day) => day.shortLabel)).toEqual([
      'Lu',
      'Ma',
      'Mi',
      'Ju',
      'Vi',
    ])
    const sabadoStrip = buildNutritionDayVariantWeekStrip({ variants, variant: sabado, todayIso: '2026-08-01' })
    expect(sabadoStrip.filter((day) => day.applies).map((day) => day.shortLabel)).toEqual(['Sá'])
  })

  it('marca hoy una sola vez y lo omite sin fecha', () => {
    const strip = buildNutritionDayVariantWeekStrip({ variants, variant: base, todayIso: '2026-08-01' })
    expect(strip.filter((day) => day.isToday).map((day) => day.dayOfWeek)).toEqual([6])
    const sinHoy = buildNutritionDayVariantWeekStrip({ variants, variant: base, todayIso: null })
    expect(sinHoy.some((day) => day.isToday)).toBe(false)
  })

  it('empieza el lunes y termina el domingo', () => {
    const strip = buildNutritionDayVariantWeekStrip({ variants, variant: base })
    expect(strip.map((day) => day.shortLabel)).toEqual(['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'])
  })
})

describe('etiquetas y badge', () => {
  it('nombra los días en español con tildes', () => {
    expect(formatNutritionDayOfWeek(3)).toBe('Miércoles')
    expect(formatNutritionDayOfWeek(6, { short: true })).toBe('Sá')
    expect(formatNutritionDayOfWeek(null)).toBeNull()
    expect(formatNutritionDayOfWeek(9)).toBeNull()
  })

  it('arma el badge de hoy con la energía de la variante del día', () => {
    expect(formatNutritionTodayVariantBadge(sabado)).toBe('Hoy: plan de Sábado · 2.600 kcal')
    expect(formatNutritionTodayVariantBadge({ label: 'Sábado', targets: { calories: null } })).toBe(
      'Hoy: plan de Sábado',
    )
    expect(formatNutritionTodayVariantBadge({ label: 'Sábado' })).toBe('Hoy: plan de Sábado')
  })
})
