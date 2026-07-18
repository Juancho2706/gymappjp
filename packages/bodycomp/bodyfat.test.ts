import { describe, expect, it } from 'vitest'
import { bodyFatPct, durninWomersley, faulkner, siriBodyFatPct, yuhasz } from './bodyfat'
import type { BodyFatInput, Sex, Skinfolds } from './types'

function makeInput(overrides: { sex: Sex; ageYears?: number; skinfolds?: Partial<Skinfolds> }): BodyFatInput {
  return {
    sex: overrides.sex,
    ageYears: overrides.ageYears,
    skinfolds: {
      tricepsMm: 0,
      subscapularMm: 0,
      supraspinaleMm: 0,
      abdominalMm: 0,
      frontThighMm: 0,
      medialCalfMm: 0,
      bicepsMm: 0,
      iliacCrestMm: 0,
      ...overrides.skinfolds,
    },
  }
}

describe('siriBodyFatPct', () => {
  it('495/D - 450', () => {
    expect(siriBodyFatPct(1.05)).toBeCloseTo(495 / 1.05 - 450, 6)
    expect(siriBodyFatPct(1.05)).toBeCloseTo(21.43, 2)
  })
})

describe('durninWomersley — golden (densidad log10 -> Siri)', () => {
  it('varon 25 anios, Σ4 = 40 mm -> D 1.06185, ~16.17%', () => {
    const r = durninWomersley(
      makeInput({ sex: 'male', ageYears: 25, skinfolds: { bicepsMm: 5, tricepsMm: 10, subscapularMm: 13, iliacCrestMm: 12 } }),
    )
    // sum4 = 5+10+13+12 = 40
    expect(r.bodyDensity).toBeCloseTo(1.0619, 3)
    expect(r.percent).toBeCloseTo(16.17, 1)
    expect(r.equation).toBe('durnin_womersley')
  })

  it('mujer 35 anios, Σ4 = 60 mm -> ~30.62%', () => {
    const r = durninWomersley(
      makeInput({ sex: 'female', ageYears: 35, skinfolds: { bicepsMm: 12, tricepsMm: 18, subscapularMm: 15, iliacCrestMm: 15 } }),
    )
    expect(r.percent).toBeCloseTo(30.62, 1)
  })

  it('selecciona la banda de edad correcta (mismo input, edades distintas -> coeficientes distintos)', () => {
    const sf = { bicepsMm: 8, tricepsMm: 12, subscapularMm: 14, iliacCrestMm: 16 }
    const young = durninWomersley(makeInput({ sex: 'male', ageYears: 22, skinfolds: sf }))
    const old = durninWomersley(makeInput({ sex: 'male', ageYears: 55, skinfolds: sf }))
    // Para el mismo pliegue, los mayores tienen mayor % grasa estimada (mayor M).
    expect(old.percent).toBeGreaterThan(young.percent)
  })

  it('banda de menores (<17) usa los coeficientes de adolescente', () => {
    const r = durninWomersley(
      makeInput({ sex: 'male', ageYears: 15, skinfolds: { bicepsMm: 6, tricepsMm: 10, subscapularMm: 10, iliacCrestMm: 10 } }),
    )
    // sum4=36, D = 1.1533 - 0.0643*log10(36)
    const expectedD = 1.1533 - 0.0643 * Math.log10(36)
    expect(r.bodyDensity).toBeCloseTo(expectedD, 3)
  })

  it('lanza si falta la edad (no se puede elegir banda)', () => {
    expect(() => durninWomersley(makeInput({ sex: 'male', skinfolds: { bicepsMm: 5, tricepsMm: 10, subscapularMm: 13, iliacCrestMm: 12 } }))).toThrow(
      /ageYears/,
    )
  })
})

describe('yuhasz — golden (6 pliegues, deportistas)', () => {
  it('varon Σ6 = 60 -> 0.1051*60 + 2.585 = 8.891%', () => {
    const r = yuhasz(
      makeInput({
        sex: 'male',
        skinfolds: { tricepsMm: 10, subscapularMm: 10, supraspinaleMm: 10, abdominalMm: 10, frontThighMm: 10, medialCalfMm: 10 },
      }),
    )
    expect(r.percent).toBeCloseTo(8.89, 2)
  })

  it('mujer Σ6 = 90 -> 0.1548*90 + 3.580 = 17.512%', () => {
    const r = yuhasz(
      makeInput({
        sex: 'female',
        skinfolds: { tricepsMm: 15, subscapularMm: 15, supraspinaleMm: 15, abdominalMm: 15, frontThighMm: 15, medialCalfMm: 15 },
      }),
    )
    expect(r.percent).toBeCloseTo(17.51, 2)
  })
})

describe('faulkner — golden (4 pliegues, ambos sexos)', () => {
  it('Σ4 = 50 -> 5.783 + 0.153*50 = 13.433%', () => {
    const r = faulkner(
      makeInput({ sex: 'male', skinfolds: { tricepsMm: 12, subscapularMm: 13, iliacCrestMm: 13, abdominalMm: 12 } }),
    )
    expect(r.percent).toBeCloseTo(13.43, 2)
  })
})

describe('bodyFatPct — despacho por ecuacion', () => {
  const base = makeInput({
    sex: 'male',
    ageYears: 30,
    skinfolds: {
      bicepsMm: 5,
      tricepsMm: 10,
      subscapularMm: 13,
      iliacCrestMm: 12,
      supraspinaleMm: 9,
      abdominalMm: 15,
      frontThighMm: 12,
      medialCalfMm: 8,
    },
  })

  it('despacha a cada implementacion y propaga la etiqueta de ecuacion', () => {
    expect(bodyFatPct(base, 'durnin_womersley').equation).toBe('durnin_womersley')
    expect(bodyFatPct(base, 'yuhasz').equation).toBe('yuhasz')
    expect(bodyFatPct(base, 'faulkner').equation).toBe('faulkner')
  })

  it('las 3 ecuaciones dan resultados distintos (no son intercambiables)', () => {
    const dw = bodyFatPct(base, 'durnin_womersley').percent
    const yu = bodyFatPct(base, 'yuhasz').percent
    const fa = bodyFatPct(base, 'faulkner').percent
    expect(dw).not.toBeCloseTo(yu, 1)
    expect(dw).not.toBeCloseTo(fa, 1)
  })
})
