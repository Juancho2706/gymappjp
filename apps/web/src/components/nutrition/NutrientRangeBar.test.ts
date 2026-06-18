import { describe, expect, it } from 'vitest'
import { nutrientStatus, nutrientRangeAriaText } from './NutrientRangeBar'

describe('nutrientStatus', () => {
  it('aimup: below floor/target is low (neutral)', () => {
    expect(nutrientStatus(50, 'aimup', 80, 120)).toBe('low')
  })

  it('aimup: at/above target is optimal', () => {
    expect(nutrientStatus(120, 'aimup', 80, 120)).toBe('optimal')
    expect(nutrientStatus(130, 'aimup', 80, 120)).toBe('optimal')
  })

  it('aimup: above ceiling is high (overshoot)', () => {
    expect(nutrientStatus(210, 'aimup', 80, 120, 200)).toBe('high')
  })

  it('aimup: at/above floor without target is optimal', () => {
    expect(nutrientStatus(80, 'aimup', 80)).toBe('optimal')
  })

  it('cap: under ceiling is optimal', () => {
    expect(nutrientStatus(1500, 'cap', undefined, 2000, 2300)).toBe('optimal')
  })

  it('cap: over ceiling is high (alarm)', () => {
    expect(nutrientStatus(2400, 'cap', undefined, 2000, 2300)).toBe('high')
  })

  it('cap: over target when no ceiling is high', () => {
    expect(nutrientStatus(2100, 'cap', undefined, 2000)).toBe('high')
  })
})

describe('nutrientRangeAriaText', () => {
  it('renders "label: value unit, estado"', () => {
    const status = nutrientStatus(120, 'aimup', 80, 120)
    expect(nutrientRangeAriaText('Proteína', 120, 'g', status)).toBe('Proteína: 120 g, Óptimo')
  })
})
