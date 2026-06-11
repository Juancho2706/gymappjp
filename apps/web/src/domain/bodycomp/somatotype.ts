/**
 * Somatotipo antropometrico de Heath-Carter (endomorfia / mesomorfia / ectomorfia).
 *
 * FUENTE (ecuaciones verbatim): Carter JEL. "The Heath-Carter Anthropometric Somatotype —
 * Instruction Manual". San Diego State University, 2002 (basado en Carter & Heath 1990;
 * Heath & Carter 1967). Seccion "Equations for a decimal anthropometric somatotype".
 *
 *   endomorfia = -0.7182 + 0.1451*X - 0.00068*X^2 + 0.0000014*X^3
 *     X = (triceps + subescapular + supraespinal, en mm) * (170.18 / talla_cm)   [endomorfia corregida por talla]
 *
 *   mesomorfia = 0.858*HB + 0.601*FB + 0.188*CAG + 0.161*CCG - 0.131*H + 4.5
 *     HB = diametro biepicondileo humero (cm); FB = diametro biepicondileo femur (cm)
 *     CAG = perimetro brazo FLEXIONADO - triceps/10 ; CCG = perimetro pierna max - pliegue pierna/10
 *     H = talla (cm)
 *
 *   ectomorfia via HWR = talla / peso^(1/3):
 *     HWR >= 40.75            -> 0.732*HWR - 28.58
 *     38.25 < HWR < 40.75     -> 0.463*HWR - 17.63
 *     HWR <= 38.25            -> 0.1
 *
 * Regla del manual: si el calculo de cualquier componente da <= 0, se asigna 0.1 (los ratings
 * no pueden ser cero ni negativos).
 */

import { PHANTOM_STATURE_CM, correctedGirth } from './phantom'
import type { IsakRawInput, Somatotype } from './types'

/** Piso del manual: un componente nunca es <= 0. */
const COMPONENT_FLOOR = 0.1

/** HWR umbrales del manual Heath-Carter para la ectomorfia. */
const HWR_HIGH = 40.75
const HWR_LOW = 38.25

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function floorComponent(value: number): number {
  return value <= 0 ? COMPONENT_FLOOR : value
}

/** Endomorfia corregida por talla. */
export function endomorphy(input: IsakRawInput): number {
  const { skinfolds: sf, heightCm } = input
  const x = (sf.tricepsMm + sf.subscapularMm + sf.supraspinaleMm) * (PHANTOM_STATURE_CM / heightCm)
  const value = -0.7182 + 0.1451 * x - 0.00068 * x ** 2 + 0.0000014 * x ** 3
  return round2(floorComponent(value))
}

/** Mesomorfia (musculo-esqueletica). Usa el perimetro de brazo FLEXIONADO (no el relajado). */
export function mesomorphy(input: IsakRawInput): number {
  const { breadths: br, girths: gi, skinfolds: sf, heightCm } = input
  const cag = correctedGirth(gi.armFlexedCm, sf.tricepsMm)
  const ccg = correctedGirth(gi.calfCm, sf.medialCalfMm)
  const value = 0.858 * br.humerusCm + 0.601 * br.femurCm + 0.188 * cag + 0.161 * ccg - 0.131 * heightCm + 4.5
  return round2(floorComponent(value))
}

/** Razon talla / raiz cubica del peso (HWR). */
export function heightWeightRatio(heightCm: number, weightKg: number): number {
  return heightCm / Math.cbrt(weightKg)
}

/** Ectomorfia (linealidad), tramos por HWR. */
export function ectomorphy(input: IsakRawInput): number {
  const hwr = heightWeightRatio(input.heightCm, input.weightKg)
  let value: number
  if (hwr >= HWR_HIGH) {
    value = 0.732 * hwr - 28.58
  } else if (hwr > HWR_LOW) {
    value = 0.463 * hwr - 17.63
  } else {
    value = COMPONENT_FLOOR
  }
  return round2(floorComponent(value))
}

/** Somatotipo Heath-Carter completo. */
export function heathCarter(input: IsakRawInput): Somatotype {
  return {
    endomorphy: endomorphy(input),
    mesomorphy: mesomorphy(input),
    ectomorphy: ectomorphy(input),
  }
}
