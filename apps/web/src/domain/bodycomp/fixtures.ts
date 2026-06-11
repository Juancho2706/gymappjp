/**
 * Fixtures de soporte para los golden tests del dominio bodycomp. PURO (sin IO).
 * No es codigo de produccion: solo lo consumen los `*.test.ts` del mismo directorio.
 */

import { PHANTOM } from './phantom'
import type { IsakRawInput } from './types'

/**
 * Sujeto "media phantom": estatura 170.18, talla sentado 89.92, y cada medida cruda igual a su
 * media phantom. Por construccion todos los Z = 0 y cada masa escalada == su masa phantom de Kerr.
 * Es el golden de maquinaria mas fuerte: fija las constantes de masa Y la logica de Z-score.
 */
export function phantomMeanInput(): IsakRawInput {
  return {
    sex: 'male',
    ageYears: 30,
    heightCm: 170.18,
    weightKg: 64.58,
    sittingHeightCm: 89.92,
    skinfolds: {
      tricepsMm: PHANTOM.triceps.p,
      subscapularMm: PHANTOM.subscapular.p,
      supraspinaleMm: PHANTOM.supraspinale.p,
      abdominalMm: PHANTOM.abdominal.p,
      frontThighMm: PHANTOM.frontThigh.p,
      medialCalfMm: PHANTOM.medialCalf.p,
      bicepsMm: PHANTOM.biceps.p,
      iliacCrestMm: PHANTOM.iliacCrest.p,
    },
    girths: {
      headCm: PHANTOM.headGirth.p,
      armRelaxedCm: PHANTOM.armRelaxedGirth.p,
      armFlexedCm: PHANTOM.armFlexedGirth.p,
      forearmCm: PHANTOM.forearmGirth.p,
      chestMesosternaleCm: PHANTOM.chestGirth.p,
      waistCm: PHANTOM.waistGirth.p,
      thighCm: PHANTOM.thighGirth.p,
      calfCm: PHANTOM.calfGirth.p,
    },
    breadths: {
      biacromialCm: PHANTOM.biacromial.p,
      biiliocristalCm: PHANTOM.biiliocristal.p,
      humerusCm: PHANTOM.humerus.p,
      femurCm: PHANTOM.femur.p,
      transverseChestCm: PHANTOM.transverseChest.p,
      apChestDepthCm: PHANTOM.apChestDepth.p,
    },
  }
}

/** Varon atletico realista (h 178, peso 75). Sujeto magro: musculo alto, adiposo bajo. */
export function athleteMaleInput(): IsakRawInput {
  return {
    sex: 'male',
    ageYears: 25,
    heightCm: 178,
    weightKg: 75,
    sittingHeightCm: 92,
    skinfolds: {
      tricepsMm: 8,
      subscapularMm: 10,
      supraspinaleMm: 7,
      abdominalMm: 12,
      frontThighMm: 10,
      medialCalfMm: 6,
      bicepsMm: 4,
      iliacCrestMm: 9,
    },
    girths: {
      headCm: 57,
      armRelaxedCm: 32,
      armFlexedCm: 34,
      forearmCm: 27.5,
      chestMesosternaleCm: 98,
      waistCm: 80,
      thighCm: 56,
      calfCm: 37.5,
    },
    breadths: {
      biacromialCm: 42,
      biiliocristalCm: 28,
      humerusCm: 7.2,
      femurCm: 9.9,
      transverseChestCm: 29,
      apChestDepthCm: 19,
    },
  }
}
