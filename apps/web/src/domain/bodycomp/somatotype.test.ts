import { describe, expect, it } from 'vitest'
import { athleteMaleInput } from './fixtures'
import { ectomorphy, endomorphy, heathCarter, heightWeightRatio, mesomorphy } from './somatotype'
import type { IsakRawInput } from './types'

/** Construye un input completo cambiando solo talla/peso (para los tramos de HWR de la ectomorfia). */
function withHeightWeight(heightCm: number, weightKg: number): IsakRawInput {
  return { ...athleteMaleInput(), heightCm, weightKg }
}

describe('heathCarter — golden hand-computed del varon atletico', () => {
  const input = athleteMaleInput()

  it('endomorfia corregida por talla', () => {
    expect(endomorphy(input)).toBeCloseTo(2.38, 2)
  })

  it('mesomorfia (usa brazo flexionado y perimetros corregidos)', () => {
    expect(mesomorphy(input)).toBeCloseTo(4.96, 2)
  })

  it('ectomorfia por HWR', () => {
    expect(heightWeightRatio(178, 75)).toBeCloseTo(42.21, 2)
    expect(ectomorphy(input)).toBeCloseTo(2.32, 2)
  })

  it('heathCarter compone los 3 ejes', () => {
    expect(heathCarter(input)).toEqual({ endomorphy: 2.38, mesomorphy: 4.96, ectomorphy: 2.32 })
  })
})

describe('ectomorphy — goldens del manual Heath-Carter (tramos de HWR)', () => {
  it('HWR >= 40.75: sujeto 573 del manual (HWR 43.4 -> ecto 3.19)', () => {
    // 0.732*43.40 - 28.58 = 3.19 (manual: somatotipo 1.6-5.4-3.2)
    expect(ectomorphy(withHeightWeight(180, 71.34))).toBeCloseTo(3.19, 2)
  })

  it('HWR >= 40.75: sujeta B-188 del manual (HWR 45.6 -> ecto 4.80)', () => {
    // 0.732*45.60 - 28.58 = 4.80 (manual: somatotipo 3.0-2.1-4.8)
    expect(ectomorphy(withHeightWeight(165, 47.38))).toBeCloseTo(4.8, 2)
  })

  it('38.25 < HWR < 40.75: tramo intermedio (0.463*HWR - 17.63)', () => {
    // h=170, w=79.71 -> HWR 39.50 -> 0.463*39.50 - 17.63 = 0.659
    expect(ectomorphy(withHeightWeight(170, 79.71))).toBeCloseTo(0.66, 1)
  })

  it('HWR <= 38.25: piso 0.1 (sujeto compacto)', () => {
    // Persona baja y pesada -> HWR bajo -> ectomorfia minima.
    expect(ectomorphy(withHeightWeight(160, 90))).toBeCloseTo(0.1, 5)
  })
})

describe('floor del manual: ningun componente es <= 0', () => {
  it('endomorfia que el polinomio da negativa se piso a 0.1', () => {
    // 3 pliegues de 1 mm -> X ~ 2.87 -> el polinomio da < 0 -> piso 0.1.
    const lean: IsakRawInput = {
      ...athleteMaleInput(),
      skinfolds: { ...athleteMaleInput().skinfolds, tricepsMm: 1, subscapularMm: 1, supraspinaleMm: 1 },
    }
    expect(endomorphy(lean)).toBe(0.1)
  })
})

// Paridad exacta contra los ejemplos resueltos del manual (figuras 1/2, sujetos 573/B-188):
// el manual publica las SALIDAS (1.6-5.4-3.2 y 3.0-2.1-4.8) pero los inputs crudos viven en
// imagenes del formulario (no transcribibles). La ectomorfia ya esta anclada arriba (HWR 43.4/45.6).
describe.todo('heathCarter — paridad endo/meso con inputs crudos de las figuras del manual')
