import { describe, expect, it } from 'vitest'
import {
  MAX_PHOTOS_PER_EXPORT,
  MAX_PHOTOS_PER_MONTH,
  selectDossierPhotoRefs,
} from '../../apps/mobile/lib/client-dossier-photos'

/**
 * Presupuesto de fotos de la exportación del dossier en RN (R20). Lo que se protege acá es la
 * única regla que el PDF no muestra: cuántas fotos se firman y embeben. Si se afloja, un alumno
 * con 24 meses de check-ins con foto arma un PDF de decenas de MB y el proceso de impresión muere
 * en el teléfono.
 */

const report = (photos: (string | null)[]) => ({
  checkIns: photos.map((photoUrl) => ({ photoUrl })),
})

describe('selectDossierPhotoRefs', () => {
  it('corta en 3 fotos por mes y devuelve un array por informe', () => {
    const picks = selectDossierPhotoRefs([
      report(['a1', 'a2', 'a3', 'a4', 'a5']),
      report(['b1']),
    ])
    expect(picks).toHaveLength(2)
    expect(picks[0]).toEqual(['a1', 'a2', 'a3'])
    expect(picks[1]).toEqual(['b1'])
    expect(MAX_PHOTOS_PER_MONTH).toBe(3)
  })

  it('respeta el tope global de 18 y deja sin fotos a los meses que no alcanzan', () => {
    const months = Array.from({ length: 10 }, (_, m) => report([`${m}-1`, `${m}-2`, `${m}-3`]))
    const picks = selectDossierPhotoRefs(months)
    const total = picks.reduce((acc, refs) => acc + refs.length, 0)
    expect(total).toBe(MAX_PHOTOS_PER_EXPORT)
    // 6 meses completos (3 × 6 = 18) y el resto vacío: nunca un muro de «foto no disponible».
    expect(picks.slice(0, 6).every((refs) => refs.length === 3)).toBe(true)
    expect(picks.slice(6).every((refs) => refs.length === 0)).toBe(true)
  })

  it('saltea refs vacíos, nulos, repetidos y los ya embebidos como data:', () => {
    const picks = selectDossierPhotoRefs([
      report([null, '', '  ', 'x', 'x', 'data:image/jpeg;base64,zzz', 'y']),
    ])
    expect(picks[0]).toEqual(['x', 'y'])
  })

  it('el dossier de hoy pide su propio tope (6 en un solo informe)', () => {
    const picks = selectDossierPhotoRefs([report(['1', '2', '3', '4', '5', '6', '7'])], {
      perReport: 6,
      total: 6,
    })
    expect(picks[0]).toEqual(['1', '2', '3', '4', '5', '6'])
  })

  it('sin presupuesto no firma nada', () => {
    expect(selectDossierPhotoRefs([report(['a'])], { total: 0 })).toEqual([[]])
    expect(selectDossierPhotoRefs([report(['a'])], { perReport: 0 })).toEqual([[]])
  })
})
