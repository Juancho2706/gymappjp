import { describe, expect, it } from 'vitest'
import {
  PRESCRIBED_SNAPSHOT_SERVING_SIZE,
  nutritionEntryFactor,
  perUnitMacro,
  prescribedSnapshotMacros,
} from './intake-normalize'

const MACROS = { calories: 330, proteinG: 62, carbsG: 0, fatsG: 7.2, fiberG: null }

/** Total que reconstruye el RPC a partir del snapshot persistido. */
function reconstructedTotal(
  snapshotCalories: number | null,
  quantity: number,
  unit: string,
  servingSize: number | null,
): number {
  return (snapshotCalories ?? 0) * nutritionEntryFactor(quantity, unit, servingSize)
}

describe('perUnitMacro', () => {
  it('divide por la cantidad prescrita', () => {
    expect(perUnitMacro(330, 200)).toBeCloseTo(1.65, 10)
  })

  it('preserva null y no inventa numeros', () => {
    expect(perUnitMacro(null, 200)).toBeNull()
    expect(perUnitMacro(undefined, 200)).toBeNull()
  })

  it('devuelve el valor intacto con cantidad no positiva o valor no finito', () => {
    expect(perUnitMacro(330, 0)).toBe(330)
    expect(perUnitMacro(330, -5)).toBe(330)
    expect(perUnitMacro(Number.POSITIVE_INFINITY, 200)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('prescribedSnapshotMacros', () => {
  it('normaliza a por-unidad con servingSize = 1', () => {
    const snapshot = prescribedSnapshotMacros(MACROS, 200)
    expect(snapshot.servingSize).toBe(PRESCRIBED_SNAPSHOT_SERVING_SIZE)
    expect(snapshot.servingSize).toBe(1)
    expect(snapshot.calories).toBeCloseTo(1.65, 10)
    expect(snapshot.proteinG).toBeCloseTo(0.31, 10)
    expect(snapshot.fiberG).toBeNull()
  })

  it('el total reconstruido por el RPC vuelve a ser los macros mostrados (g/ml/un, 1/100/200)', () => {
    for (const unit of ['g', 'ml', 'un']) {
      for (const quantity of [1, 2.5, 50, 100, 200]) {
        const snapshot = prescribedSnapshotMacros(MACROS, quantity)
        expect(reconstructedTotal(snapshot.calories, quantity, unit, snapshot.servingSize)).toBeCloseTo(330, 6)
      }
    }
  })

  it('sin normalizar (macros crudos + servingSize null) el RPC duplica 200 g y subregistra 50 g', () => {
    // Documenta el defecto NUT-002 que motiva este modulo.
    expect(reconstructedTotal(330, 200, 'g', null)).toBe(660)
    expect(reconstructedTotal(330, 50, 'g', null)).toBe(165)
  })
})

describe('nutritionEntryFactor', () => {
  it('g/ml escala por serving-size (100 por defecto) y las contables usan la cantidad', () => {
    expect(nutritionEntryFactor(150, 'g', 100)).toBeCloseTo(1.5, 10)
    expect(nutritionEntryFactor(50, 'ml', null)).toBeCloseTo(0.5, 10)
    expect(nutritionEntryFactor(2, 'un', null)).toBe(2)
    expect(nutritionEntryFactor(2, 'un', 1)).toBe(2)
  })
})
