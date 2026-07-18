import { describe, expect, it } from 'vitest'
import {
  avgEnergySince,
  bmiCategory,
  bmiFromMetric,
  energyColorHex,
  linearRegressionKgPerDay,
  projectedWeightRangeKg,
} from './body-composition'

describe('linearRegressionKgPerDay', () => {
  it('pendiente ~ -0.1 kg/dia para descenso lineal reciente', () => {
    // 10 puntos, 1 por dia, bajando 0.1 kg/dia → pendiente negativa
    const base = new Date()
    const checkIns = Array.from({ length: 10 }, (_, i) => ({
      created_at: new Date(base.getTime() - (9 - i) * 86_400_000).toISOString(),
      weight: 80 - i * 0.1,
    }))
    expect(linearRegressionKgPerDay(checkIns)).toBeCloseTo(-0.1, 2)
  })
  it('cero con < 2 puntos', () => {
    expect(linearRegressionKgPerDay([{ created_at: new Date().toISOString(), weight: 80 }])).toBe(0)
  })
})

describe('projectedWeightRangeKg', () => {
  it('banda = punto ± |slope|·marginDays', () => {
    const r = projectedWeightRangeKg(80, -0.1, 4, 7)!
    expect(r.point).toBeCloseTo(80 + -0.1 * 28, 1)
    expect(r.high - r.point).toBeCloseTo(0.7, 1)
  })
  it('null sin peso base', () => {
    expect(projectedWeightRangeKg(null, 0.1)).toBeNull()
  })
})

describe('bmiFromMetric / bmiCategory', () => {
  it('IMC metros o cm', () => {
    expect(bmiFromMetric(70, 175)).toBeCloseTo(22.86, 2)
    expect(bmiFromMetric(70, 1.75)).toBeCloseTo(22.86, 2)
  })
  it('null fuera de rango', () => {
    expect(bmiFromMetric(70, 50)).toBeNull()
    expect(bmiFromMetric(0, 175)).toBeNull()
  })
  it('categorias', () => {
    expect(bmiCategory(17)).toBe('Bajo peso')
    expect(bmiCategory(22)).toBe('Normal')
    expect(bmiCategory(27)).toBe('Sobrepeso')
    expect(bmiCategory(31)).toBe('Obesidad')
  })
})

describe('avgEnergySince / energyColorHex', () => {
  it('promedia energia desde una fecha', () => {
    const since = new Date('2026-01-01T00:00:00Z')
    expect(
      avgEnergySince(
        [
          { created_at: '2026-01-02T00:00:00Z', energy_level: 8 },
          { created_at: '2026-01-03T00:00:00Z', energy_level: 6 },
          { created_at: '2025-12-31T00:00:00Z', energy_level: 2 }, // fuera de rango
        ],
        since
      )
    ).toBe(7)
  })
  it('color por umbral', () => {
    expect(energyColorHex(null)).toBe('#6B7280')
    expect(energyColorHex(9)).toBe('#10B981')
    expect(energyColorHex(6)).toBe('#F59E0B')
    expect(energyColorHex(3)).toBe('#EF4444')
  })
})
