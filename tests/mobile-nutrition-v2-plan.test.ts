import { describe, expect, it } from 'vitest'
import { describeItemGuidance } from '../apps/mobile/lib/nutrition-v2-plan'

const base = { unit: 'g', minimumQuantity: null, maximumQuantity: null, notes: null }

describe('nutrición v2 · describeItemGuidance (guía de ítem prescrito, port 1:1 web)', () => {
  it('rango min+max → "Ajustable entre X y Y"', () => {
    expect(describeItemGuidance({ ...base, minimumQuantity: 100, maximumQuantity: 150 })).toBe(
      'Ajustable entre 100 g y 150 g',
    )
  })

  it('solo max → "Hasta X"', () => {
    expect(describeItemGuidance({ ...base, maximumQuantity: 150 })).toBe('Hasta 150 g')
  })

  it('solo min → "Desde X"', () => {
    expect(describeItemGuidance({ ...base, minimumQuantity: 100 })).toBe('Desde 100 g')
  })

  it('sin rango pero con notas → solo las notas', () => {
    expect(describeItemGuidance({ ...base, notes: 'Preferir integral' })).toBe('Preferir integral')
  })

  it('rango + notas → unidos por " · "', () => {
    expect(
      describeItemGuidance({ unit: 'g', minimumQuantity: 100, maximumQuantity: 150, notes: 'Preferir integral' }),
    ).toBe('Ajustable entre 100 g y 150 g · Preferir integral')
  })

  it('sin rango ni notas → null', () => {
    expect(describeItemGuidance({ ...base })).toBeNull()
  })
})
