/**
 * Ecuaciones de % grasa por pliegues. Metodos MOLECULARES (estiman lipido), distintos del
 * fraccionamiento anatomico de Kerr (anthropometry.ts) — no se deben mezclar en una curva.
 *
 * FUENTES (coeficientes verbatim):
 *  - Durnin JVGA, Womersley J. "Body fat assessed from total body density and its estimation
 *    from skinfold thickness: measurements on 481 men and women aged from 16 to 72 years".
 *    Br J Nutr 32:77-97, 1974. Densidad por log10 de 4 pliegues (biceps+triceps+subescapular+
 *    suprailiaco) con coeficientes por sexo y banda de edad -> % grasa via Siri (1961).
 *  - Yuhasz MS (formula para deportistas, 6 pliegues): masculino %G = 0.1051*Σ6 + 2.585 ;
 *    femenino %G = 0.1548*Σ6 + 3.580 (triceps, subescapular, supraespinal, abdominal, muslo, pierna).
 *  - Faulkner JA. "Physiology of swimming and diving" (1968): %G = 5.783 + 0.153*Σ4
 *    (triceps + subescapular + suprailiaco + abdominal).
 *  - Siri WE (1961): %G = 495/D - 450.
 */

import type { BodyFatEquation, BodyFatInput, BodyFatResult, Sex } from './types'

/** Coeficientes Durnin-Womersley: D = C - M*log10(Σ4 pliegues). */
interface DwCoeff {
  /** Edad maxima inclusiva de la banda (Infinity = sin tope superior). */
  maxAge: number
  c: number
  m: number
}

/**
 * Tabla Durnin-Womersley (1974), bandas de edad. Verbatim de la tabla del paper
 * (reproducida en topendsports / measurement-toolkit). Banda "<17" cubre menores de 17.
 */
const DW_MALE: DwCoeff[] = [
  { maxAge: 16, c: 1.1533, m: 0.0643 },
  { maxAge: 19, c: 1.162, m: 0.063 },
  { maxAge: 29, c: 1.1631, m: 0.0632 },
  { maxAge: 39, c: 1.1422, m: 0.0544 },
  { maxAge: 49, c: 1.162, m: 0.07 },
  { maxAge: Infinity, c: 1.1715, m: 0.0779 },
]

const DW_FEMALE: DwCoeff[] = [
  { maxAge: 16, c: 1.1369, m: 0.0598 },
  { maxAge: 19, c: 1.1549, m: 0.0678 },
  { maxAge: 29, c: 1.1599, m: 0.0717 },
  { maxAge: 39, c: 1.1423, m: 0.0632 },
  { maxAge: 49, c: 1.1333, m: 0.0612 },
  { maxAge: Infinity, c: 1.1339, m: 0.0645 },
]

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** La densidad corporal necesita mas precision (varia en la 3a-4a decimal). */
function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5
}

/** Siri (1961): convierte densidad corporal (g/ml) en % grasa. */
export function siriBodyFatPct(bodyDensity: number): number {
  return 495 / bodyDensity - 450
}

function selectDwCoeff(sex: Sex, ageYears: number): DwCoeff {
  const table = sex === 'male' ? DW_MALE : DW_FEMALE
  return table.find((band) => ageYears <= band.maxAge) ?? table[table.length - 1]
}

/**
 * Durnin-Womersley -> densidad -> Siri. Requiere edad (selecciona la banda).
 * 4 pliegues: biceps, triceps, subescapular, suprailiaco (cresta iliaca).
 */
export function durninWomersley(input: BodyFatInput): BodyFatResult {
  if (input.ageYears === undefined) {
    throw new Error('durnin_womersley requiere ageYears para seleccionar la banda de edad')
  }
  const { skinfolds: sf } = input
  const sum4 = sf.bicepsMm + sf.tricepsMm + sf.subscapularMm + sf.iliacCrestMm
  const { c, m } = selectDwCoeff(input.sex, input.ageYears)
  const density = c - m * Math.log10(sum4)
  return {
    equation: 'durnin_womersley',
    percent: round2(siriBodyFatPct(density)),
    bodyDensity: round5(density),
  }
}

/** Yuhasz (deportistas), 6 pliegues. */
export function yuhasz(input: BodyFatInput): BodyFatResult {
  const { skinfolds: sf } = input
  const sum6 =
    sf.tricepsMm + sf.subscapularMm + sf.supraspinaleMm + sf.abdominalMm + sf.frontThighMm + sf.medialCalfMm
  const percent = input.sex === 'male' ? 0.1051 * sum6 + 2.585 : 0.1548 * sum6 + 3.58
  return { equation: 'yuhasz', percent: round2(percent) }
}

/** Faulkner, 4 pliegues (mismo para ambos sexos). */
export function faulkner(input: BodyFatInput): BodyFatResult {
  const { skinfolds: sf } = input
  const sum4 = sf.tricepsMm + sf.subscapularMm + sf.iliacCrestMm + sf.abdominalMm
  return { equation: 'faulkner', percent: round2(5.783 + 0.153 * sum4) }
}

/** Despacho por ecuacion seleccionada. */
export function bodyFatPct(input: BodyFatInput, equation: BodyFatEquation): BodyFatResult {
  switch (equation) {
    case 'durnin_womersley':
      return durninWomersley(input)
    case 'yuhasz':
      return yuhasz(input)
    case 'faulkner':
      return faulkner(input)
    default: {
      // Exhaustividad: si se agrega una ecuacion al union sin manejarla, TS falla aca.
      const _exhaustive: never = equation
      throw new Error(`Ecuacion de % grasa no soportada: ${String(_exhaustive)}`)
    }
  }
}
