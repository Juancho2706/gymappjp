import { describe, expect, it } from 'vitest'
import { computeItemMacros, type BuilderFood } from './editor-food'

/**
 * `computeItemMacros` CONGELA planes: sus decimales son los que el alumno ve y los que quedan
 * inmutables en el snapshot. Este archivo cuida dos cosas a la vez:
 *
 *  1. la rama `casera` de W2 («2 huevos» = 122 g) resuelve por la MISMA formula que los gramos,
 *     tanto en `per_100` como en `per_serving` (R6);
 *  2. los tres regimenes que ya existian quedan BYTE-IDENTICOS — la regla dura del tren es que
 *     ningun cambio mueva un decimal de g/ml/un/porcion (SPEC §5.3).
 */

/** Huevo per-100 con medida casera «huevo» = 61 g. El caso del tren. */
const HUEVO: BuilderFood = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Huevo',
  brand: null,
  calories: 149,
  proteinG: 10,
  carbsG: 1.6,
  fatsG: 11,
  fiberG: 0,
  servingSize: 100,
  servingUnit: 'g',
  category: 'proteina',
  media: null,
  householdGrams: 61,
  householdLabel: 'huevo',
}

/** Alimento con macros POR PORCION (seed de intercambios / override del coach). */
const AREPA: BuilderFood = {
  ...HUEVO,
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Arepa',
  calories: 240,
  proteinG: 6,
  carbsG: 45,
  fatsG: 4,
  fiberG: 2,
  servingSize: 80,
  macrosBasis: 'per_serving',
  householdGrams: 40,
  householdLabel: 'media arepa',
}

describe('computeItemMacros — rama casera (W2)', () => {
  it('per_100: «2 huevos» da EXACTAMENTE lo mismo que «122 g»', () => {
    expect(computeItemMacros(HUEVO, 2, 'casera')).toEqual(computeItemMacros(HUEVO, 122, 'g'))
    expect(computeItemMacros(HUEVO, 2, 'casera').calories).toBeCloseTo(181.8, 1)
  })

  it('per_serving entra por SU rama con gramos, no por el factor de las unidades contadas (R6)', () => {
    // 2 medias arepas = 80 g = 1 porcion ⇒ 240 kcal. Con el factor contable habrian sido 480.
    expect(computeItemMacros(AREPA, 2, 'casera')).toEqual(computeItemMacros(AREPA, 80, 'g'))
    expect(computeItemMacros(AREPA, 2, 'casera').calories).toBe(240)
    expect(computeItemMacros(AREPA, 2, 'un').calories).toBe(480)
  })

  it('un liquido resuelve la medida casera en ml (misma base per-100)', () => {
    const jugo: BuilderFood = { ...HUEVO, servingUnit: 'ml', householdGrams: 240, householdLabel: 'taza' }
    expect(computeItemMacros(jugo, 1, 'casera')).toEqual(computeItemMacros(jugo, 240, 'ml'))
  })

  it('sin medida casera utilizable devuelve macros CERO (el borrador no se publica asi)', () => {
    const sinMedida: BuilderFood = { ...HUEVO, householdGrams: null, householdLabel: null }
    expect(computeItemMacros(sinMedida, 2, 'casera')).toEqual({
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatsG: 0,
      fiberG: 0,
    })
    expect(computeItemMacros({ ...HUEVO, householdGrams: 0 }, 2, 'casera').calories).toBe(0)
  })

  it('reconoce el codigo `casera` sin importar espacios ni mayusculas', () => {
    expect(computeItemMacros(HUEVO, 2, ' Casera ')).toEqual(computeItemMacros(HUEVO, 2, 'casera'))
  })

  it('cantidad no positiva sigue dando cero, como en cualquier otra unidad', () => {
    expect(computeItemMacros(HUEVO, 0, 'casera').calories).toBe(0)
    expect(computeItemMacros(HUEVO, Number.NaN, 'casera').calories).toBe(0)
  })
})

describe('computeItemMacros — los tres regimenes existentes NO se mueven', () => {
  it('per_100 en g/ml escala por cantidad/100', () => {
    expect(computeItemMacros(HUEVO, 200, 'g')).toEqual({
      calories: 298,
      proteinG: 20,
      carbsG: 3.2,
      fatsG: 22,
      fiberG: 0,
    })
    expect(computeItemMacros(HUEVO, 200, 'ml')).toEqual(computeItemMacros(HUEVO, 200, 'g'))
  })

  it('per_100 en `un` escala por cantidad × servingSize / 100 (la trampa del tren)', () => {
    // «1 un» de un alimento de 100 g son 100 g, no 1 g. El numero no cambia con W2.
    expect(computeItemMacros(HUEVO, 1, 'un')).toEqual(computeItemMacros(HUEVO, 100, 'g'))
    expect(computeItemMacros(HUEVO, 30, 'un').calories).toBe(4470)
  })

  it('per_serving conserva su factor por porcion en g y en `un`', () => {
    expect(computeItemMacros(AREPA, 80, 'g').calories).toBe(240)
    expect(computeItemMacros(AREPA, 160, 'g').calories).toBe(480)
    expect(computeItemMacros(AREPA, 1, 'un').calories).toBe(240)
  })

  it('la medida casera del alimento NO altera ninguna otra unidad', () => {
    const sinMedida: BuilderFood = { ...HUEVO, householdGrams: null, householdLabel: null }
    for (const unit of ['g', 'ml', 'un', 'porción']) {
      expect(computeItemMacros(HUEVO, 150, unit)).toEqual(computeItemMacros(sinMedida, 150, unit))
    }
  })
})
