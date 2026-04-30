import { describe, expect, it } from 'vitest'
import { macroRingAriaLabel } from './MacroRingSummary'

describe('macroRingAriaLabel', () => {
  it('describe normal range', () => {
    expect(macroRingAriaLabel('Proteína', 80, 120, false)).toContain('80 de 120')
    expect(macroRingAriaLabel('Proteína', 80, 120, false)).toContain('Proteína')
  })

  it('describe over target', () => {
    expect(macroRingAriaLabel('Carbos', 200, 150, true)).toContain('por encima')
    expect(macroRingAriaLabel('Carbos', 200, 150, true)).toContain('150')
  })

  it('describe missing target', () => {
    expect(macroRingAriaLabel('Grasas', 40, 0, false)).toContain('sin meta')
  })
})
