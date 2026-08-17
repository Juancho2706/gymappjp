import { describe, it, expect } from 'vitest'
import { macroCalorieShares } from './macro-spark'

describe('macroCalorieShares', () => {
  it('reparte por resto mayor y suma exactamente 100 (P51.8/C63/G23)', () => {
    expect(macroCalorieShares(51.8, 63, 23)).toEqual({ p: 31, c: 38, g: 31 })
  })

  it('los tres nulls → {0,0,0} (sin pintar segmentos)', () => {
    expect(macroCalorieShares(null, null, null)).toEqual({ p: 0, c: 0, g: 0 })
  })

  it('solo proteína → {100,0,0}', () => {
    expect(macroCalorieShares(30, 0, 0)).toEqual({ p: 100, c: 0, g: 0 })
  })

  it('solo proteína con carbos/grasas null → {100,0,0}', () => {
    expect(macroCalorieShares(30, null, null)).toEqual({ p: 100, c: 0, g: 0 })
  })

  it('clampea negativos a 0 antes de calcular aportes', () => {
    expect(macroCalorieShares(-5, 50, 50)).toEqual(macroCalorieShares(0, 50, 50))
  })

  it('los tres en 0 (no null) → {0,0,0}', () => {
    expect(macroCalorieShares(0, 0, 0)).toEqual({ p: 0, c: 0, g: 0 })
  })
})

// 20 tripletas fijas y deterministas (sin Math.random). Cada una tiene al menos un macro con
// aporte calórico > 0, así que el reparto siempre debe sumar exactamente 100.
const FUZZ_CASES: Array<[number | null, number | null, number | null]> = [
  [10.5, 20.3, 5.1],
  [0, 0, 50],
  [100, 0, 0],
  [0, 100, 0],
  [33.333, 33.333, 33.333],
  [1, 1, 1],
  [0.1, 0.2, 0.3],
  [999, 1, 1],
  [-5, 50, 50],
  [50, -10, 50],
  [50, 50, -10],
  [null, 40, 40],
  [40, null, 40],
  [40, 40, null],
  [0.001, 0.002, 0.003],
  [123.456, 78.9, 45.6],
  [7, 7, 7],
  [15.5, 0, 0],
  [0, 15.5, 0],
  [0, 0, 15.5],
]

describe('macroCalorieShares — fuzz determinista (20 casos)', () => {
  it.each(FUZZ_CASES)('p+c+g === 100 y cada valor >= 0 para (%s, %s, %s)', (protein, carbs, fats) => {
    const shares = macroCalorieShares(protein, carbs, fats)
    expect(shares.p + shares.c + shares.g).toBe(100)
    expect(shares.p).toBeGreaterThanOrEqual(0)
    expect(shares.c).toBeGreaterThanOrEqual(0)
    expect(shares.g).toBeGreaterThanOrEqual(0)
  })
})
