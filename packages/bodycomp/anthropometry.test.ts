import { describe, expect, it } from 'vitest'
import {
  adiposeMassKg,
  bodySurfaceAreaM2,
  boneMassKg,
  fractionate5C,
  muscleMassKg,
  residualMassKg,
  skinMassKg,
} from './anthropometry'
import { athleteMaleInput, phantomMeanInput } from './fixtures'

describe('fractionate5C — golden de "media phantom" (Kerr 1988)', () => {
  // Con cada medida cruda = media phantom y estatura 170.18, todos los Z = 0 y cada masa
  // escalada == su masa phantom de Kerr. Fija las constantes Y la maquinaria de Z-score.
  const input = phantomMeanInput()

  it('masa adiposa -> 25.6 kg (phantom adipose mass)', () => {
    expect(adiposeMassKg(input)).toBeCloseTo(25.6, 1)
  })

  it('masa muscular -> 24.5 kg (phantom muscle mass)', () => {
    expect(muscleMassKg(input)).toBeCloseTo(24.5, 1)
  })

  it('masa osea -> 7.90 kg (cuerpo 6.70 + cabeza 1.20)', () => {
    expect(boneMassKg(input)).toBeCloseTo(7.9, 2)
  })

  it('masa residual -> 6.10 kg (phantom residual mass)', () => {
    expect(residualMassKg(input)).toBeCloseTo(6.1, 2)
  })

  it('masa de la piel -> ~3.62 kg (SA phantom * 2.07mm * 1.05)', () => {
    expect(skinMassKg(input.weightKg, input.heightCm, input.sex, input.ageYears)).toBeCloseTo(3.62, 1)
  })

  it('superficie corporal del phantom (varon >12) -> ~1.664 m^2', () => {
    expect(bodySurfaceAreaM2(64.58, 170.18, 'male', 30)).toBeCloseTo(1.664, 2)
  })

  it('fractionate5C entrega kg, % y la suma predicha', () => {
    const r = fractionate5C(input)
    expect(r.adipose.kg).toBeCloseTo(25.6, 1)
    expect(r.muscle.kg).toBeCloseTo(24.5, 1)
    expect(r.bone.kg).toBeCloseTo(7.9, 2)
    expect(r.residual.kg).toBeCloseTo(6.1, 2)
    expect(r.skin.kg).toBeCloseTo(3.62, 1)
    // Suma de los 5 componentes para el sujeto media-phantom ~ 67.7 kg.
    expect(r.predictedMassKg).toBeCloseTo(67.71, 1)
    // Los % suman 100.
    const pctSum = r.adipose.pct + r.muscle.pct + r.bone.pct + r.residual.pct + r.skin.pct
    expect(pctSum).toBeCloseTo(100, 1)
  })
})

describe('fractionate5C — varon atletico realista', () => {
  const r = fractionate5C(athleteMaleInput())

  it('masas en rangos fisiologicos para un sujeto magro (musculo > adiposo)', () => {
    expect(r.muscle.kg).toBeGreaterThan(r.adipose.kg)
    expect(r.muscle.pct).toBeGreaterThan(40)
    expect(r.adipose.pct).toBeLessThan(28)
  })

  it('valores hand-computed de la implementacion Kerr (regresion exacta)', () => {
    // Calculados con el modelo Kerr (ver PLAN/research). El adiposo Kerr es tejido ANATOMICO,
    // por eso ~21.7% (mayor que el % grasa molecular de bodyfat.ts) — los metodos no se mezclan.
    expect(r.adipose.kg).toBeCloseTo(16.64, 1)
    expect(r.muscle.kg).toBeCloseTo(38.18, 1)
    expect(r.bone.kg).toBeCloseTo(9.21, 1)
    expect(r.residual.kg).toBeCloseTo(8.8, 1)
    expect(r.skin.kg).toBeCloseTo(3.98, 1)
  })

  it('invariante de Kerr: la suma de las 5 masas aproxima el peso medido (SEE ~3 kg)', () => {
    expect(Math.abs(r.massDifferenceKg)).toBeLessThan(3)
    expect(r.measuredWeightKg).toBe(75)
  })
})

// --- Golden de PARIDAD con fichas reales de Fran (T6.2) ---
// Pendiente del bloqueante externo: 3-5 fichas ISAK resueltas (input crudo + output que Fran
// considera correcto). Cuando lleguen, estos casos pasan a ser golden de paridad con tolerancia
// masas <2% y se marca el set de calculo como `is_validated`. Hasta entonces el % grasa se
// muestra "preliminar" (no es un placeholder de constantes: el calculo ya esta validado vs
// literatura en los tests de arriba; lo que falta es la paridad con la practica de Fran).
describe.todo('fractionate5C — paridad con fichas reales de Fran (T6.2, requiere datos de Movida)')
