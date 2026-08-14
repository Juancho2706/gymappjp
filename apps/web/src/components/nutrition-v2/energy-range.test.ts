import { describe, expect, it } from 'vitest'
import {
  countEnergyDaysEvaluable,
  countEnergyDaysInRange,
  energyDayInRange,
  energyTrendDirection,
} from '@eva/nutrition-v2'

// T2.7 F2/F3: racha honesta "N de 7 en rango" + tendencia del historial. Contrato compartido
// web/RN: el rango es ±10% de la meta y un dia sin datos NO cuenta ni a favor ni en contra.
describe('energyDayInRange', () => {
  it('dentro, bajo y sobre el rango ±10%', () => {
    expect(energyDayInRange(2000, 2000)).toBe(true)
    expect(energyDayInRange(1800, 2000)).toBe(true) // borde inferior exacto
    expect(energyDayInRange(2200, 2000)).toBe(true) // borde superior exacto
    expect(energyDayInRange(1799, 2000)).toBe(false)
    expect(energyDayInRange(2201, 2000)).toBe(false)
  })

  it('sin meta o sin consumo no se juzga (null, no false)', () => {
    expect(energyDayInRange(1500, null)).toBeNull()
    expect(energyDayInRange(1500, 0)).toBeNull()
    expect(energyDayInRange(0, 2000)).toBeNull()
  })
})

describe('conteos de la semana', () => {
  const day = (calories: number, target: number | null) => ({
    consumed: { calories },
    targets: { calories: target },
  })

  it('cuenta en-rango y evaluables por separado', () => {
    const days = [day(2000, 2000), day(1500, 2000), day(0, 2000), day(1200, null)]
    expect(countEnergyDaysInRange(days)).toBe(1)
    expect(countEnergyDaysEvaluable(days)).toBe(2)
  })
})

describe('energyTrendDirection', () => {
  it('compara la mas reciente contra la mas vieja; con <2 semanas no hay tendencia', () => {
    expect(energyTrendDirection([3, 4, 5, 5])).toBe('up')
    expect(energyTrendDirection([5, 4, 2])).toBe('down')
    expect(energyTrendDirection([4, 6, 4])).toBe('flat')
    expect(energyTrendDirection([4])).toBeNull()
    expect(energyTrendDirection([])).toBeNull()
  })
})
