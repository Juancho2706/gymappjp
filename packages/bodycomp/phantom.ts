/**
 * Phantom (estratagema de proporcionalidad de Ross & Wilson) y constantes del fraccionamiento
 * de 5 componentes de Kerr. UNICA fuente de constantes del phantom para el dominio bodycomp.
 *
 * El "Phantom" es un humano de referencia unisex, bilateralmente simetrico, de estatura 170.18 cm
 * y masa 64.58 kg. Cada variable antropometrica tiene una media phantom `p` y una desviacion `s`.
 * Una medida del sujeto se escala geometricamente a la estatura del phantom y se expresa como
 * un Z-score (desviaciones tipicas respecto del phantom).
 *
 * FUENTES (constantes transcritas verbatim, ver comentario por bloque):
 *  - Ross WD, Wilson NC. "A stratagem for proportional growth assessment". Acta Paediatr Belg,
 *    Suppl 28, 169-182, 1974.
 *  - Ross WD, Marfell-Jones MJ. "Kinanthropometry". In: MacDougall JD et al. (eds), Physiological
 *    Testing of the High-Performance Athlete, 1991. (tabla de valores phantom)
 *  - Kerr DA. "An anthropometric method for fractionation of skin, adipose, muscle, bone and
 *    residual tissue masses in males and females age 6 to 77 years". MSc Thesis, Simon Fraser
 *    University, 1988. Tabla 4.3 (ecuaciones del fraccionamiento) y Tabla 4.2 (seleccion de
 *    variables). Disponible en summit.sfu.ca/item/5139 (b14920293.pdf).
 *  - Drinkwater DT, Ross WD. "Anthropometric fractionation of body mass". In: Kinanthropometry II,
 *    University Park Press, 1980, pp. 178-189.
 *  - Esparza F (ed). "Manual de Cineantropometria". FEMEDE, 1993 (reproduce la tabla phantom;
 *    cross-check de las sumas de Kerr — ver tests).
 *
 * NOTA de validacion (incondicional, AC3 del SPEC): las sumas phantom de Kerr cuadran con la
 * tabla de variables de Ross & Marfell-Jones / Esparza: Σ medias de 6 pliegues = 116.40 (Kerr 116.41),
 * Σ SD = 34.79; Σ medias de diametros oseos = 98.88, Σ SD = 5.33. Ver `phantom.test.ts`.
 */

/** Estatura del phantom (cm). Constante de escalado por defecto. */
export const PHANTOM_STATURE_CM = 170.18

/** Masa del phantom (kg). */
export const PHANTOM_WEIGHT_KG = 64.58

/** Una variable phantom: media (`p`) y desviacion tipica (`s`). */
export interface PhantomVar {
  /** Media phantom de la variable. */
  p: number
  /** Desviacion tipica phantom de la variable. */
  s: number
}

/**
 * Tabla de valores phantom de referencia (Ross & Marfell-Jones 1991, reproducida en
 * Esparza 1993, Tabla 3). Solo se incluyen las variables que consume el dominio.
 * Pliegues en mm; perimetros, diametros, alturas en cm; masas en kg.
 */
export const PHANTOM: Record<string, PhantomVar> = {
  // Alturas / longitudes
  stature: { p: 170.18, s: 6.29 },
  sittingHeight: { p: 89.92, s: 4.5 },
  // Pliegues (mm)
  triceps: { p: 15.4, s: 4.47 },
  biceps: { p: 8.0, s: 2.0 },
  subscapular: { p: 17.2, s: 5.07 },
  iliacCrest: { p: 22.4, s: 6.8 },
  supraspinale: { p: 15.4, s: 4.47 },
  abdominal: { p: 25.4, s: 7.78 },
  frontThigh: { p: 27.0, s: 8.33 },
  medialCalf: { p: 16.0, s: 4.67 },
  // Perimetros (cm)
  headGirth: { p: 56.0, s: 1.44 },
  armRelaxedGirth: { p: 26.89, s: 2.33 },
  armFlexedGirth: { p: 29.41, s: 2.37 },
  forearmGirth: { p: 25.13, s: 1.41 },
  chestGirth: { p: 87.86, s: 5.18 },
  waistGirth: { p: 71.91, s: 4.45 },
  thighGirth: { p: 55.82, s: 4.23 },
  calfGirth: { p: 35.25, s: 2.3 },
  // Diametros / anchuras (cm)
  biacromial: { p: 38.04, s: 1.92 },
  transverseChest: { p: 27.92, s: 1.74 },
  apChestDepth: { p: 17.5, s: 1.38 },
  biiliocristal: { p: 28.84, s: 1.75 },
  humerus: { p: 6.48, s: 0.35 },
  femur: { p: 9.52, s: 0.48 },
}

/**
 * Constantes del fraccionamiento de 5 componentes de Kerr (1988), Tabla 4.3 — VERBATIM del thesis.
 * Las "sumas" son medias/SD agregadas del subconjunto de variables predictoras de cada masa
 * (el thesis las da directamente como sumas, no como variables sueltas).
 */
export const KERR = {
  /** Masa adiposa: Σ 6 pliegues -> Z -> masa. Pliegues: triceps, subescapular, supraespinal, abdominal, muslo ant, pierna medial. */
  adipose: {
    /** Σ medias phantom de los 6 pliegues (mm). */
    skinfoldSumP: 116.41,
    /** Σ SD phantom de los 6 pliegues. */
    skinfoldSumS: 34.79,
    /** Masa adiposa phantom (kg). */
    massP: 25.6,
    /** SD de la masa adiposa phantom. */
    massS: 5.85,
  },
  /** Masa osea = osea del cuerpo + osea de la cabeza (la cabeza NO se escala por estatura). */
  bone: {
    /** Σ medias phantom de diametros oseos: biacromial + biiliocristal + 2*humero + 2*femur. */
    breadthSumP: 98.88,
    /** Σ SD phantom de diametros oseos. */
    breadthSumS: 5.33,
    /** Masa osea del cuerpo phantom (kg). */
    bodyMassP: 6.7,
    /** SD de la masa osea del cuerpo phantom. */
    bodyMassS: 1.34,
    /** Perimetro cefalico phantom (cm). */
    headGirthP: 56.0,
    /** SD del perimetro cefalico phantom. */
    headGirthS: 1.44,
    /** Masa osea de la cabeza phantom (kg). */
    headMassP: 1.2,
    /** SD de la masa osea de la cabeza phantom. */
    headMassS: 0.18,
  },
  /** Masa muscular: Σ perimetros corregidos por pliegue -> Z -> masa. */
  muscle: {
    /** Σ medias phantom de los perimetros corregidos: brazo relajado + antebrazo + muslo + pierna + torax. */
    correctedGirthSumP: 207.21,
    /** Σ SD phantom de los perimetros corregidos. */
    correctedGirthSumS: 13.74,
    /** Masa muscular phantom (kg). */
    massP: 24.5,
    /** SD de la masa muscular phantom. */
    massS: 5.4,
  },
  /** Masa residual (organos/visceras): Σ medidas del torso -> Z -> masa. Escala = talla sentado. */
  residual: {
    /** Σ medias phantom: profundidad AP torax + diametro transverso torax + cintura corregida. */
    sumP: 109.35,
    /** Σ SD phantom. */
    sumS: 7.08,
    /** Talla sentado phantom (cm) — constante de escalado de la masa residual. */
    sittingHeightP: 89.92,
    /** Masa residual phantom (kg). */
    massP: 6.1,
    /** SD de la masa residual phantom. */
    massS: 1.24,
  },
  /** Masa de la piel: superficie corporal (DuBois revisado por Kerr) x grosor x densidad. */
  skin: {
    /** Densidad de la piel (g/cm^3), de datos de cadaver (Kerr 1988). */
    densityGCm3: 1.05,
    /** Grosor de la piel (mm): varones / mujeres, de datos de cadaver (Kerr 1988). */
    thicknessMaleMm: 2.07,
    thicknessFemaleMm: 1.96,
    /** Constante de superficie corporal (reemplaza el 71.84 de DuBois & DuBois 1916). */
    csaMaleOver12: 68.305,
    csaFemaleOver12: 73.074,
    csaUnder12: 70.691,
    /** Exponentes geometricos de DuBois & DuBois (1916), conservados por Kerr. */
    weightExp: 0.425,
    heightExp: 0.725,
  },
} as const

/**
 * Z-score del phantom (estratagema de Ross & Wilson). Escala la variable a la constante de
 * escalado del phantom con el exponente dimensional `d` y la compara con la media/SD phantom.
 *
 *   Z = ( value * (Cp / Cs)^d - p ) / s
 *
 * `Cp` = constante de escalado del phantom; por defecto la estatura (170.18), pero para la masa
 * residual es la talla sentado del phantom (89.92), porque el residual depende del tronco.
 * `Cs` = el valor del sujeto para esa misma constante (estatura o talla sentado).
 * `d`  = exponente dimensional: 1 para longitudes/perimetros/diametros/pliegues, 2 para areas,
 * 3 para volumenes/masas.
 *
 * Fuente: Kerr 1988, Tabla 4.3 (formula general del score de proporcionalidad phantom);
 * Ross & Wilson 1974.
 *
 * @param value           valor medido (o suma de medidas) del sujeto
 * @param p               media phantom de la variable
 * @param s               desviacion tipica phantom de la variable
 * @param d               exponente dimensional (1/2/3)
 * @param subjectScalingCm Cs: estatura del sujeto (o talla sentado) para el escalado geometrico
 * @param phantomScalingCm Cp: constante de escalado del phantom (default estatura 170.18)
 */
export function phantomZ(
  value: number,
  p: number,
  s: number,
  d: number,
  subjectScalingCm: number,
  phantomScalingCm: number = PHANTOM_STATURE_CM,
): number {
  return (value * (phantomScalingCm / subjectScalingCm) ** d - p) / s
}

/**
 * Perimetro corregido por pliegue (ISAK / Kerr): descuenta el anillo de tejido adiposo
 * subcutaneo asumiendo seccion circular.
 *
 *   corrected = girthCm - PI * (skinfoldMm / 10)
 *
 * Cross-check phantom: pierna 35.25 - PI*(16.0/10) = 30.22 (= valor corregido de Esparza).
 * Fuente: Kerr 1988 (CAGR/CTHG/CCAG/CCHG); convencion ISAK.
 */
export function correctedGirth(girthCm: number, skinfoldMm: number): number {
  return girthCm - Math.PI * (skinfoldMm / 10)
}
