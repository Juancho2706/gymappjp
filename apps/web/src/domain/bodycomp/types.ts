/**
 * Composicion corporal — tipos de dominio PUROS (sin Next.js, sin Supabase, sin `lib/`).
 *
 * Cubre los dos metodos de captura del modulo `body_composition`:
 *  - BIA (bioimpedancia): captura manual del reporte de la maquina (InBody / Tanita / Omron).
 *    No hay calculo: `BiaMetrics` es un superset opcional de los campos del dispositivo.
 *  - ISAK (antropometria): pliegues/perimetros/diametros crudos -> el codigo calcula
 *    fraccionamiento de 5 componentes (Ross & Kerr), somatotipo (Heath-Carter) y % grasa.
 *
 * Unidades: longitudes/perimetros/diametros en cm, pliegues en mm, peso en kg, edad en anios.
 * Identificadores en ingles; strings de UI viven en i18n (no aca).
 */

export type Sex = 'male' | 'female'

/** Ecuaciones de % grasa por pliegues soportadas (despacho en `bodyfat.ts`). */
export type BodyFatEquation = 'durnin_womersley' | 'yuhasz' | 'faulkner'

/**
 * Pliegues cutaneos en mm (perfil ISAK restringido + los que piden las ecuaciones de % grasa).
 * `supraspinaleMm` = pliegue supraespinal (ISAK), tambien llamado suprailiaco anterior.
 * `iliacCrestMm`   = pliegue de la cresta iliaca (suprailiaco), el que usan Durnin-Womersley y Faulkner.
 */
export interface Skinfolds {
  tricepsMm: number
  subscapularMm: number
  supraspinaleMm: number
  abdominalMm: number
  frontThighMm: number
  medialCalfMm: number
  bicepsMm: number
  iliacCrestMm: number
}

/** Perimetros en cm. `armRelaxedCm` (Kerr) y `armFlexedCm` (Heath-Carter) son medidas distintas. */
export interface Girths {
  headCm: number
  armRelaxedCm: number
  armFlexedCm: number
  forearmCm: number
  chestMesosternaleCm: number
  waistCm: number
  thighCm: number
  calfCm: number
}

/** Diametros/anchuras oseas en cm. `humerusCm`/`femurCm` son biepicondileos. */
export interface Breadths {
  biacromialCm: number
  biiliocristalCm: number
  humerusCm: number
  femurCm: number
  transverseChestCm: number
  apChestDepthCm: number
}

/** Input crudo completo de una medicion ISAK (lo que persiste en `raw_input`). */
export interface IsakRawInput {
  sex: Sex
  /** Requerido para Durnin-Womersley (selecciona la banda de edad). Opcional para Yuhasz/Faulkner. */
  ageYears?: number
  heightCm: number
  weightKg: number
  sittingHeightCm: number
  skinfolds: Skinfolds
  girths: Girths
  breadths: Breadths
}

/** Subconjunto minimo que requieren las ecuaciones de % grasa por pliegues. */
export interface BodyFatInput {
  sex: Sex
  ageYears?: number
  skinfolds: Skinfolds
}

/** Un componente de masa: valor absoluto (kg) y relativo (% de la masa total predicha). */
export interface MassComponent {
  kg: number
  pct: number
}

/** Fraccionamiento de 5 componentes (modelo Kerr 1988). */
export interface Fractionation5C {
  adipose: MassComponent
  muscle: MassComponent
  bone: MassComponent
  residual: MassComponent
  skin: MassComponent
  /** Suma de las 5 masas (validacion: aproxima el peso obtenido, SEE ~3 kg). */
  predictedMassKg: number
  /** Peso medido en bascula. */
  measuredWeightKg: number
  /** measuredWeightKg - predictedMassKg (criterio de validez interna). */
  massDifferenceKg: number
}

/** Somatotipo Heath-Carter (endomorfia / mesomorfia / ectomorfia). */
export interface Somatotype {
  endomorphy: number
  mesomorphy: number
  ectomorphy: number
}

/** Resultado de % grasa por una ecuacion de pliegues. */
export interface BodyFatResult {
  equation: BodyFatEquation
  percent: number
  /** Solo Durnin-Womersley: densidad corporal (g/ml) intermedia antes de Siri. */
  bodyDensity?: number
}

/** Resultado ISAK completo derivado (lo que persiste en `metrics`). */
export interface IsakResult {
  fractionation: Fractionation5C
  somatotype: Somatotype
  bodyFat: BodyFatResult
  /** Trazabilidad: que conjunto de ecuaciones se aplico (se guarda en `equation_used`). */
  equationUsed: string
}

/**
 * Captura BIA — superset OPCIONAL de los campos del reporte de la maquina.
 * NO se calcula: solo se valida por schema y se persiste tal cual.
 * `visceralFatAreaCm2` (InBody/medico) y `visceralFatLevel` (Tanita/Omron consumer) son
 * campos SEPARADOS a proposito: distintos dispositivos reportan distinta escala.
 */
export interface BiaSegmental {
  rightArm?: number
  leftArm?: number
  trunk?: number
  rightLeg?: number
  leftLeg?: number
}

export interface BiaMetrics {
  skeletalMuscleMassKg?: number
  fatMassKg?: number
  bodyFatPercent?: number
  totalBodyWaterL?: number
  intracellularWaterL?: number
  extracellularWaterL?: number
  ecwTbwRatio?: number
  visceralFatAreaCm2?: number
  visceralFatLevel?: number
  basalMetabolicRateKcal?: number
  phaseAngleDeg?: number
  segmentalLeanKg?: BiaSegmental
  segmentalFatKg?: BiaSegmental
}
