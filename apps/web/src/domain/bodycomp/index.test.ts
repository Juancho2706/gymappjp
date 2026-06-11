import { describe, expect, it } from 'vitest'
import { computeIsak, isakEquationLabel } from './index'
import { athleteMaleInput } from './fixtures'

describe('computeIsak — composicion end-to-end', () => {
  const raw = athleteMaleInput()

  it('compone fraccionamiento + somatotipo + % grasa con la ecuacion por defecto (DW)', () => {
    const r = computeIsak(raw)
    // Fraccionamiento (Kerr) presente y coherente.
    expect(r.fractionation.muscle.kg).toBeCloseTo(38.18, 1)
    expect(r.fractionation.adipose.kg).toBeCloseTo(16.64, 1)
    // Somatotipo (Heath-Carter).
    expect(r.somatotype).toEqual({ endomorphy: 2.38, mesomorphy: 4.96, ectomorphy: 2.32 })
    // % grasa por defecto = Durnin-Womersley.
    expect(r.bodyFat.equation).toBe('durnin_womersley')
    expect(r.bodyFat.percent).toBeCloseTo(13.11, 1)
    expect(r.equationUsed).toBe('kerr5c+heath_carter+durnin_womersley')
  })

  it('respeta la ecuacion de % grasa seleccionada (poblacion atletica -> Yuhasz)', () => {
    const r = computeIsak(raw, { bodyFatEquation: 'yuhasz' })
    expect(r.bodyFat.equation).toBe('yuhasz')
    expect(r.equationUsed).toBe('kerr5c+heath_carter+yuhasz')
    // El % grasa molecular (Yuhasz) NO coincide con el adiposo anatomico de Kerr (no se mezclan).
    expect(r.bodyFat.percent).not.toBeCloseTo(r.fractionation.adipose.pct, 0)
  })

  it('es determinista (misma entrada -> misma salida)', () => {
    expect(computeIsak(raw)).toEqual(computeIsak(raw))
  })

  it('isakEquationLabel arma la etiqueta de trazabilidad', () => {
    expect(isakEquationLabel('faulkner')).toBe('kerr5c+heath_carter+faulkner')
  })
})
