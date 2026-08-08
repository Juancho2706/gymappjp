import { describe, expect, it } from 'vitest'
import {
  CoachFoodOverrideInputSchema,
  CoachFoodOverrideValuesSchema,
  COACH_FOOD_OVERRIDE_MACRO_MAX,
  coachFoodOverrideValuesFromRow,
  indexCoachFoodOverridesByFoodId,
  resolveFoodMacros,
  type CoachFoodOverrideRow,
  type CoachFoodOverrideValues,
} from './food-overrides'

const FOOD_ID = '33333333-3333-4333-8333-333333333333'

/** Alimento del catalogo importado: macros por 100 g, sin medida casera. */
const ARROZ = {
  calories: 130,
  proteinG: 2.7,
  carbsG: 28,
  fatsG: 0.3,
  fiberG: 0.4,
  macrosBasis: 'per_100' as const,
  householdLabel: null,
  householdGrams: null,
}

function override(patch: Partial<CoachFoodOverrideValues> = {}): CoachFoodOverrideValues {
  return {
    calories: 112,
    proteinG: 2.1,
    carbsG: 25,
    fatsG: 0.2,
    fiberG: 0.3,
    macrosBasis: 'per_100',
    householdLabel: null,
    householdGrams: null,
    ...patch,
  }
}

describe('resolveFoodMacros', () => {
  it('sin override devuelve el alimento tal cual y no marca la fila', () => {
    const resolved = resolveFoodMacros(ARROZ, null)
    expect(resolved.calories).toBe(130)
    expect(resolved.fiberG).toBe(0.4)
    expect(resolved.macrosBasis).toBe('per_100')
    expect(resolved.hasOverride).toBe(false)
    expect(resolved.original).toBeNull()
  })

  it('con override reemplaza los CINCO macros, no coalesce campo a campo', () => {
    const resolved = resolveFoodMacros(ARROZ, override())
    expect(resolved).toMatchObject({ calories: 112, proteinG: 2.1, carbsG: 25, fatsG: 0.2, fiberG: 0.3 })
    expect(resolved.hasOverride).toBe(true)
  })

  it('conserva los macros del catalogo en `original` para el badge tachado', () => {
    const resolved = resolveFoodMacros(ARROZ, override())
    expect(resolved.original).toEqual({ calories: 130, proteinG: 2.7, carbsG: 28, fatsG: 0.3, fiberG: 0.4 })
  })

  it('la base del override MANDA sobre la del alimento', () => {
    // El gotcha central: sin esto, un override por porcion se congelaria como si fuera por 100 g.
    const resolved = resolveFoodMacros(ARROZ, override({ macrosBasis: 'per_serving' }))
    expect(resolved.macrosBasis).toBe('per_serving')
  })

  it('base ausente en el alimento queda null: no se inventa per_100', () => {
    const { macrosBasis: _drop, ...sinBase } = ARROZ
    expect(resolveFoodMacros(sinBase, null).macrosBasis).toBeNull()
  })

  it('fibra null del catalogo se preserva como null (dato, no cero)', () => {
    expect(resolveFoodMacros({ ...ARROZ, fiberG: null }, null).fiberG).toBeNull()
    expect(resolveFoodMacros({ ...ARROZ, fiberG: null }, override()).original?.fiberG).toBeNull()
  })

  it('un override que no trae medida casera NO borra la del alimento', () => {
    const conMedida = { ...ARROZ, householdLabel: '1 taza', householdGrams: 158 }
    const resolved = resolveFoodMacros(conMedida, override())
    expect(resolved.householdLabel).toBe('1 taza')
    expect(resolved.householdGrams).toBe(158)
  })

  it('la medida casera del override reemplaza la del alimento COMO PAR', () => {
    const conMedida = { ...ARROZ, householdLabel: '1 taza', householdGrams: 158 }
    const resolved = resolveFoodMacros(
      conMedida,
      override({ householdLabel: '1 pocillo', householdGrams: 90 }),
    )
    expect(resolved.householdLabel).toBe('1 pocillo')
    expect(resolved.householdGrams).toBe(90)
  })

  it('un par incompleto en el alimento no se muestra a medias', () => {
    const resolved = resolveFoodMacros({ ...ARROZ, householdLabel: '1 taza', householdGrams: null }, null)
    expect(resolved.householdLabel).toBeNull()
    expect(resolved.householdGrams).toBeNull()
  })
})

describe('CoachFoodOverrideValuesSchema', () => {
  it('acepta un override sin medida casera y la deja en null', () => {
    const parsed = CoachFoodOverrideValuesSchema.parse({
      calories: 112,
      proteinG: 2.1,
      carbsG: 25,
      fatsG: 0.2,
      fiberG: 0.3,
      macrosBasis: 'per_100',
    })
    expect(parsed.householdLabel).toBeNull()
    expect(parsed.householdGrams).toBeNull()
  })

  it('rechaza la medida casera a medias (espejo del check par de la tabla)', () => {
    const res = CoachFoodOverrideValuesSchema.safeParse({ ...override(), householdLabel: '1 taza' })
    expect(res.success).toBe(false)
  })

  it('exige la base declarada: un override sin ella es un bug silencioso', () => {
    const { macrosBasis: _drop, ...sinBase } = override()
    expect(CoachFoodOverrideValuesSchema.safeParse(sinBase).success).toBe(false)
  })

  it('rechaza macros negativas y fuera del tope de sanidad', () => {
    expect(CoachFoodOverrideValuesSchema.safeParse(override({ calories: -1 })).success).toBe(false)
    expect(
      CoachFoodOverrideValuesSchema.safeParse(override({ calories: COACH_FOOD_OVERRIDE_MACRO_MAX + 1 })).success,
    ).toBe(false)
  })

  it('el input de la UI no lleva coachId: el dueño lo pone el servidor', () => {
    const parsed = CoachFoodOverrideInputSchema.parse({ foodId: FOOD_ID, values: override() })
    expect(parsed.foodId).toBe(FOOD_ID)
    expect(Object.keys(parsed)).toEqual(['foodId', 'values'])
  })
})

describe('indexCoachFoodOverridesByFoodId', () => {
  const row: CoachFoodOverrideRow = {
    food_id: FOOD_ID,
    calories: 112,
    protein_g: 2.1,
    carbs_g: 25,
    fats_g: 0.2,
    fiber_g: 0.3,
    macros_basis: 'per_serving',
    household_label: '1 pocillo',
    household_grams: 90,
  }

  it('mapea la fila de PostgREST a los valores del merge', () => {
    expect(coachFoodOverrideValuesFromRow(row)).toEqual({
      calories: 112,
      proteinG: 2.1,
      carbsG: 25,
      fatsG: 0.2,
      fiberG: 0.3,
      macrosBasis: 'per_serving',
      householdLabel: '1 pocillo',
      householdGrams: 90,
    })
  })

  it('indexa por alimento para mergear un lote sin N+1', () => {
    const otro = { ...row, food_id: '44444444-4444-4444-8444-444444444444' }
    const index = indexCoachFoodOverridesByFoodId([row, otro])
    expect(index.size).toBe(2)
    expect(index.get(FOOD_ID)?.calories).toBe(112)
  })

  it('una base fuera del vocabulario cae a per_100 en vez de propagarse', () => {
    expect(coachFoodOverrideValuesFromRow({ ...row, macros_basis: 'per_kilo' }).macrosBasis).toBe('per_100')
  })
})
