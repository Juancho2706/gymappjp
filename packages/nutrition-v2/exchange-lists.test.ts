import { describe, expect, it } from 'vitest'
import {
  dominantExchangeMacro,
  formatPortionSentence,
  rescalePortionGrams,
  resolveExchangeListRows,
  roundPortionGrams,
  suggestPortionGrams,
  EXCHANGE_LIST_OWNER_RANK,
} from './exchange-lists'

const CEREALES = { refProteinG: 2, refCarbsG: 15, refFatsG: 0, refCalories: 70 }
const CARNES = { refProteinG: 7, refCarbsG: 0, refFatsG: 3, refCalories: 55 }
const GRASAS = { refProteinG: 0, refCarbsG: 0, refFatsG: 5, refCalories: 45 }

describe('dominantExchangeMacro', () => {
  it('elige el macro que mas kcal aporta a la porcion de referencia', () => {
    expect(dominantExchangeMacro(CEREALES)).toBe('carbs')
    expect(dominantExchangeMacro(CARNES)).toBe('protein')
    expect(dominantExchangeMacro(GRASAS)).toBe('fats')
  })

  it('grupo sin macros de referencia no tiene dominante', () => {
    expect(dominantExchangeMacro({ refProteinG: 0, refCarbsG: 0, refFatsG: 0, refCalories: 0 })).toBeNull()
  })

  it('las grasas ganan a igual gramaje porque valen 9 kcal/g', () => {
    expect(dominantExchangeMacro({ refProteinG: 5, refCarbsG: 5, refFatsG: 5, refCalories: 85 })).toBe('fats')
  })
})

describe('suggestPortionGrams', () => {
  it('avena en Cereales: 15 g de CHO sobre 60 g/100 g ⇒ 25 g', () => {
    const avena = { proteinG: 13, carbsG: 60, fatsG: 7, calories: 380, servingSize: 100, macrosBasis: 'per_100' as const }
    expect(suggestPortionGrams(CEREALES, avena)).toBe(25)
  })

  it('respeta la base per_serving (macros por porcion declarada)', () => {
    // 30 g de CHO por porcion de 50 g ⇒ 0,6 g/g ⇒ 15/0,6 = 25 g
    const galleta = { proteinG: 3, carbsG: 30, fatsG: 5, calories: 190, servingSize: 50, macrosBasis: 'per_serving' as const }
    expect(suggestPortionGrams(CEREALES, galleta)).toBe(25)
  })

  it('cae a calorias cuando el alimento no aporta el macro dominante', () => {
    // Aceite en Cereales (0 CHO): 70 kcal del grupo / 9 kcal por g ⇒ 8 g
    const aceite = { proteinG: 0, carbsG: 0, fatsG: 100, calories: 900, servingSize: 100, macrosBasis: 'per_100' as const }
    expect(suggestPortionGrams(CEREALES, aceite)).toBe(8)
  })

  it('devuelve null cuando no hay ninguna referencia utilizable', () => {
    const agua = { proteinG: 0, carbsG: 0, fatsG: 0, calories: 0, servingSize: 100, macrosBasis: 'per_100' as const }
    expect(suggestPortionGrams(CEREALES, agua)).toBeNull()
  })

  it('devuelve null en vez de pedir kilos de producto', () => {
    const trazas = { proteinG: 0, carbsG: 0.1, fatsG: 0, calories: 0, servingSize: 100, macrosBasis: 'per_100' as const }
    expect(suggestPortionGrams(CEREALES, trazas)).toBeNull()
  })

  it('sobre 100 g redondea al multiplo de 5', () => {
    // 15 g de CHO sobre 11 g/100 g ⇒ 136,36 ⇒ 135
    const papa = { proteinG: 2, carbsG: 11, fatsG: 0, calories: 55, servingSize: 100, macrosBasis: 'per_100' as const }
    expect(suggestPortionGrams(CEREALES, papa)).toBe(135)
  })
})

describe('roundPortionGrams', () => {
  it('entero bajo 100, multiplo de 5 sobre 100', () => {
    expect(roundPortionGrams(24.6)).toBe(25)
    expect(roundPortionGrams(137)).toBe(135)
    expect(roundPortionGrams(0.2)).toBe(1)
  })

  it('valores no utiles dan 0', () => {
    expect(roundPortionGrams(0)).toBe(0)
    expect(roundPortionGrams(Number.NaN)).toBe(0)
  })
})

describe('rescalePortionGrams', () => {
  it('regla de tres por el macro dominante del grupo origen', () => {
    const mitad = { ...CEREALES, refCarbsG: 7.5, refCalories: 35 }
    expect(rescalePortionGrams(120, CEREALES, mitad)).toBe(60)
  })

  it('cae a la razon de calorias si el destino cambio de naturaleza', () => {
    const proteico = { refProteinG: 7, refCarbsG: 0, refFatsG: 0, refCalories: 35 }
    expect(rescalePortionGrams(120, CEREALES, proteico)).toBe(60)
  })

  it('sin referencias copia literal en vez de inventar', () => {
    const vacio = { refProteinG: 0, refCarbsG: 0, refFatsG: 0, refCalories: 0 }
    expect(rescalePortionGrams(120, vacio, vacio)).toBe(120)
  })
})

describe('formatPortionSentence', () => {
  it('incluye la medida casera cuando existe', () => {
    expect(formatPortionSentence({ foodName: 'Avena', portionGrams: 33, portionLabel: '3 cdas' })).toBe(
      '1 porción = 33 g de Avena (≈ 3 cdas)'
    )
  })

  it('sin medida casera queda solo con gramos', () => {
    expect(formatPortionSentence({ foodName: 'Avena', portionGrams: 33 })).toBe('1 porción = 33 g de Avena')
  })

  it('sin gramos no miente con un cero', () => {
    expect(formatPortionSentence({ foodName: 'Avena', portionGrams: null })).toBe('1 porción = Avena')
  })
})

describe('resolveExchangeListRows', () => {
  const base = { isExcluded: false }

  it('la fila del coach gana a la global y a la legacy', () => {
    const rows = [
      { ...base, foodId: 'arroz', ownerRank: EXCHANGE_LIST_OWNER_RANK.global, grams: 40 },
      { ...base, foodId: 'arroz', ownerRank: EXCHANGE_LIST_OWNER_RANK.coach, grams: 30 },
      { ...base, foodId: 'arroz', ownerRank: EXCHANGE_LIST_OWNER_RANK.legacy, grams: 50 },
    ]
    expect(resolveExchangeListRows(rows).map((r) => r.grams)).toEqual([30])
  })

  it('una lapida del coach retira el alimento aunque exista fila global', () => {
    const rows = [
      { foodId: 'quinoa', ownerRank: EXCHANGE_LIST_OWNER_RANK.global, isExcluded: false },
      { foodId: 'quinoa', ownerRank: EXCHANGE_LIST_OWNER_RANK.coach, isExcluded: true },
    ]
    expect(resolveExchangeListRows(rows)).toEqual([])
  })

  it('no duplica alimentos', () => {
    const rows = [
      { ...base, foodId: 'a', ownerRank: 2 },
      { ...base, foodId: 'b', ownerRank: 2 },
      { ...base, foodId: 'a', ownerRank: 3 },
    ]
    expect(resolveExchangeListRows(rows)).toHaveLength(2)
  })
})
