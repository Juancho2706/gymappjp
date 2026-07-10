import { describe, expect, it } from 'vitest'
import { KERR, PHANTOM, PHANTOM_STATURE_CM, correctedGirth, phantomZ } from './phantom'

describe('phantomZ', () => {
  it('da 0 cuando value = media phantom y la estatura es la del phantom', () => {
    // value = p, height = 170.18, d = 1 -> (p*1 - p)/s = 0
    expect(phantomZ(PHANTOM.triceps.p, PHANTOM.triceps.p, PHANTOM.triceps.s, 1, PHANTOM_STATURE_CM)).toBeCloseTo(
      0,
      10,
    )
  })

  it('da +1 cuando value supera la media en 1 SD (estatura phantom)', () => {
    const { p, s } = PHANTOM.subscapular
    expect(phantomZ(p + s, p, s, 1, PHANTOM_STATURE_CM)).toBeCloseTo(1, 10)
  })

  it('aplica el escalado geometrico por estatura con el exponente dimensional d', () => {
    // Sujeto mas alto que el phantom -> la medida se reduce proporcionalmente antes de comparar.
    // value=20, p=15.4, s=4.47, d=1, h=180: Z = (20*(170.18/180) - 15.4)/4.47
    const expected = (20 * (170.18 / 180) - 15.4) / 4.47
    expect(phantomZ(20, 15.4, 4.47, 1, 180)).toBeCloseTo(expected, 10)
    expect(phantomZ(20, 15.4, 4.47, 1, 180)).toBeCloseTo(0.785, 3)
  })

  it('respeta d=3 para masas/volumenes', () => {
    const expected = (64.58 * (170.18 / 160) ** 3 - 64.58) / 8.6
    expect(phantomZ(64.58, 64.58, 8.6, 3, 160)).toBeCloseTo(expected, 10)
  })

  it('usa la constante de escalado del phantom (Cp) cuando no es la estatura (residual = talla sentado 89.92)', () => {
    // Con Cp = 89.92 (talla sentado phantom) y el sujeto en la talla sentado phantom -> Z = 0.
    expect(phantomZ(109.35, 109.35, 7.08, 1, 89.92, 89.92)).toBeCloseTo(0, 10)
    // Si se omitiera Cp (default 170.18) el Z saldria muy positivo (era el bug de la masa residual).
    expect(phantomZ(109.35, 109.35, 7.08, 1, 89.92)).toBeGreaterThan(10)
  })
})

describe('correctedGirth', () => {
  it('descuenta el anillo adiposo: pierna 35.25 - PI*(16/10) = 30.22 (valor corregido phantom)', () => {
    expect(correctedGirth(35.25, 16.0)).toBeCloseTo(30.22, 2)
  })

  it('muslo 55.82 - PI*(27/10) = 47.34 (valor corregido phantom)', () => {
    expect(correctedGirth(55.82, 27.0)).toBeCloseTo(47.34, 2)
  })
})

describe('cross-check de las constantes phantom de Kerr contra la tabla de variables', () => {
  // Las sumas phantom del thesis de Kerr (Tabla 4.3) deben reconstruirse desde la tabla de
  // variables de Ross & Marfell-Jones / Esparza. Esto valida que las constantes NO esten mal
  // transcritas (riesgo ALTO del SPEC: dato de salud erroneo).

  it('Σ medias de los 6 pliegues == skinfoldSumP de Kerr (116.41)', () => {
    const sum =
      PHANTOM.triceps.p +
      PHANTOM.subscapular.p +
      PHANTOM.supraspinale.p +
      PHANTOM.abdominal.p +
      PHANTOM.frontThigh.p +
      PHANTOM.medialCalf.p
    expect(sum).toBeCloseTo(KERR.adipose.skinfoldSumP, 1)
  })

  it('Σ SD de los 6 pliegues == skinfoldSumS de Kerr (34.79)', () => {
    const sum =
      PHANTOM.triceps.s +
      PHANTOM.subscapular.s +
      PHANTOM.supraspinale.s +
      PHANTOM.abdominal.s +
      PHANTOM.frontThigh.s +
      PHANTOM.medialCalf.s
    expect(sum).toBeCloseTo(KERR.adipose.skinfoldSumS, 2)
  })

  it('Σ medias de los diametros oseos (biac+biil+2*humero+2*femur) == breadthSumP (98.88)', () => {
    const sum =
      PHANTOM.biacromial.p + PHANTOM.biiliocristal.p + 2 * PHANTOM.humerus.p + 2 * PHANTOM.femur.p
    expect(sum).toBeCloseTo(KERR.bone.breadthSumP, 2)
  })

  it('Σ SD de los diametros oseos == breadthSumS (5.33)', () => {
    const sum =
      PHANTOM.biacromial.s + PHANTOM.biiliocristal.s + 2 * PHANTOM.humerus.s + 2 * PHANTOM.femur.s
    expect(sum).toBeCloseTo(KERR.bone.breadthSumS, 2)
  })

  it('Σ medias del residuo (AP torax + transverso torax + cintura corregida) == residual.sumP (109.35)', () => {
    const sum = PHANTOM.apChestDepth.p + PHANTOM.transverseChest.p + correctedGirth(PHANTOM.waistGirth.p, PHANTOM.abdominal.p)
    expect(sum).toBeCloseTo(KERR.residual.sumP, 1)
  })

  it('Σ perimetros corregidos del musculo == muscle.correctedGirthSumP (207.21)', () => {
    // arm relajado + antebrazo(sin corregir) + muslo + pierna + torax, todos corregidos por su pliegue.
    const sum =
      correctedGirth(PHANTOM.armRelaxedGirth.p, PHANTOM.triceps.p) +
      PHANTOM.forearmGirth.p +
      correctedGirth(PHANTOM.thighGirth.p, PHANTOM.frontThigh.p) +
      correctedGirth(PHANTOM.calfGirth.p, PHANTOM.medialCalf.p) +
      correctedGirth(PHANTOM.chestGirth.p, PHANTOM.subscapular.p)
    expect(sum).toBeCloseTo(KERR.muscle.correctedGirthSumP, 1)
  })
})
