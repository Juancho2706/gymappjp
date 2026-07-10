/**
 * Fraccionamiento de 5 componentes de Kerr (1988): piel / adiposo / muscular / oseo / residual.
 *
 * Metodo de fraccionamiento ANATOMICO (no molecular): la "masa adiposa" es el tejido adiposo
 * completo (subcutaneo + interno), NO el lipido extraible. Por eso da valores sistematicamente
 * mas altos que el "% grasa" de las ecuaciones de pliegues (bodyfat.ts) — los metodos NO son
 * intercambiables (ver SPEC).
 *
 * Cada masa M se obtiene en 2 pasos (Kerr 1988, Tabla 4.3):
 *   1. Score de proporcionalidad phantom Z del subconjunto de variables de esa masa.
 *   2. M = ((Z * s_masa) + p_masa) * (escala_sujeto / escala_phantom)^3
 * donde la escala es la estatura (masas adiposa/muscular/osea-cuerpo) o la talla sentado (residual);
 * la masa osea de la cabeza se deriva independiente, sin escalado por estatura.
 *
 * FUENTE: Kerr DA (1988), MSc Thesis SFU, Tabla 4.3 (constantes en `phantom.ts`).
 */

import { KERR, PHANTOM_STATURE_CM, correctedGirth, phantomZ } from './phantom'
import type { Fractionation5C, IsakRawInput, Sex } from './types'

const SCALE_EXP = 3

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Superficie corporal (m^2) por la formula geometrica de DuBois & DuBois (1916) con las
 * constantes revisadas de Kerr por sexo/edad:
 *   SA(cm^2) = CSA * peso^0.425 * talla^0.725   ->   SA(m^2) = SA(cm^2) / 10000
 * Fuente: Kerr 1988, Tabla 4.3 (paso 1).
 */
export function bodySurfaceAreaM2(weightKg: number, heightCm: number, sex: Sex, ageYears?: number): number {
  const { csaMaleOver12, csaFemaleOver12, csaUnder12, weightExp, heightExp } = KERR.skin
  let csa: number
  if (ageYears !== undefined && ageYears < 12) {
    csa = csaUnder12
  } else {
    csa = sex === 'male' ? csaMaleOver12 : csaFemaleOver12
  }
  const saCm2 = csa * weightKg ** weightExp * heightCm ** heightExp
  return saCm2 / 10000
}

/**
 * Masa de la piel (kg) = SA(m^2) * grosor(mm) * densidad(1.05).
 * (Coherencia de unidades: m^2 * mm * (g/cm^3) -> kg, ver Kerr 1988.)
 */
export function skinMassKg(weightKg: number, heightCm: number, sex: Sex, ageYears?: number): number {
  const sa = bodySurfaceAreaM2(weightKg, heightCm, sex, ageYears)
  const thickness = sex === 'male' ? KERR.skin.thicknessMaleMm : KERR.skin.thicknessFemaleMm
  return sa * thickness * KERR.skin.densityGCm3
}

/** Masa adiposa (kg) — Σ 6 pliegues. */
export function adiposeMassKg(input: IsakRawInput): number {
  const { skinfolds: sf, heightCm } = input
  const sumSf =
    sf.tricepsMm + sf.subscapularMm + sf.supraspinaleMm + sf.abdominalMm + sf.frontThighMm + sf.medialCalfMm
  const z = phantomZ(sumSf, KERR.adipose.skinfoldSumP, KERR.adipose.skinfoldSumS, 1, heightCm)
  return (z * KERR.adipose.massS + KERR.adipose.massP) * (heightCm / PHANTOM_STATURE_CM) ** SCALE_EXP
}

/** Masa osea total (kg) = osea del cuerpo (escalada por estatura) + osea de la cabeza (sin escalar). */
export function boneMassKg(input: IsakRawInput): number {
  const { breadths: br, girths: gi, heightCm } = input
  // Cabeza: derivada independiente (escala = tamanio cefalico phantom, no la estatura).
  const zHead = (gi.headCm - KERR.bone.headGirthP) / KERR.bone.headGirthS
  const headBone = zHead * KERR.bone.headMassS + KERR.bone.headMassP
  // Cuerpo: biacromial + biiliocristal + 2*humero + 2*femur (cuenta ambos miembros).
  const sumBreadth = br.biacromialCm + br.biiliocristalCm + 2 * br.humerusCm + 2 * br.femurCm
  const zBody = phantomZ(sumBreadth, KERR.bone.breadthSumP, KERR.bone.breadthSumS, 1, heightCm)
  const bodyBone = (zBody * KERR.bone.bodyMassS + KERR.bone.bodyMassP) * (heightCm / PHANTOM_STATURE_CM) ** SCALE_EXP
  return bodyBone + headBone
}

/** Masa muscular (kg) — Σ perimetros corregidos por pliegue. */
export function muscleMassKg(input: IsakRawInput): number {
  const { girths: gi, skinfolds: sf, heightCm } = input
  const sumCorrected =
    correctedGirth(gi.armRelaxedCm, sf.tricepsMm) +
    gi.forearmCm +
    correctedGirth(gi.thighCm, sf.frontThighMm) +
    correctedGirth(gi.calfCm, sf.medialCalfMm) +
    correctedGirth(gi.chestMesosternaleCm, sf.subscapularMm)
  const z = phantomZ(sumCorrected, KERR.muscle.correctedGirthSumP, KERR.muscle.correctedGirthSumS, 1, heightCm)
  return (z * KERR.muscle.massS + KERR.muscle.massP) * (heightCm / PHANTOM_STATURE_CM) ** SCALE_EXP
}

/** Masa residual (kg) — torso. Escala = talla sentado (el residual depende del tronco, no de los miembros). */
export function residualMassKg(input: IsakRawInput): number {
  const { breadths: br, girths: gi, skinfolds: sf, sittingHeightCm } = input
  const sumRes = br.apChestDepthCm + br.transverseChestCm + correctedGirth(gi.waistCm, sf.abdominalMm)
  // Escala = talla sentado: Cp = talla sentado phantom (89.92), Cs = talla sentado del sujeto.
  const z = phantomZ(sumRes, KERR.residual.sumP, KERR.residual.sumS, 1, sittingHeightCm, KERR.residual.sittingHeightP)
  return (
    (z * KERR.residual.massS + KERR.residual.massP) *
    (sittingHeightCm / KERR.residual.sittingHeightP) ** SCALE_EXP
  )
}

/**
 * Fraccionamiento de 5 componentes (Kerr 1988). Devuelve cada masa en kg y como % de la masa
 * total predicha (suma de las 5). El peso medido se usa solo para la superficie corporal (piel);
 * la cercania entre la suma predicha y el peso medido es el criterio de validez interna del metodo.
 */
export function fractionate5C(input: IsakRawInput): Fractionation5C {
  const adipose = adiposeMassKg(input)
  const muscle = muscleMassKg(input)
  const bone = boneMassKg(input)
  const residual = residualMassKg(input)
  const skin = skinMassKg(input.weightKg, input.heightCm, input.sex, input.ageYears)

  const predicted = adipose + muscle + bone + residual + skin
  const pct = (kg: number) => (predicted > 0 ? round2((kg / predicted) * 100) : 0)

  return {
    adipose: { kg: round2(adipose), pct: pct(adipose) },
    muscle: { kg: round2(muscle), pct: pct(muscle) },
    bone: { kg: round2(bone), pct: pct(bone) },
    residual: { kg: round2(residual), pct: pct(residual) },
    skin: { kg: round2(skin), pct: pct(skin) },
    predictedMassKg: round2(predicted),
    measuredWeightKg: round2(input.weightKg),
    massDifferenceKg: round2(input.weightKg - predicted),
  }
}
