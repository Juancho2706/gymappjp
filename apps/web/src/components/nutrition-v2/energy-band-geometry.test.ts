import { describe, expect, it } from 'vitest'
import { energyBandGeometry } from '@eva/nutrition-v2'

// T2.7 F2 (decision D-A): la banda es el mismo riel en web y RN — la geometria vive en el
// paquete y aca se fija su contrato: riel 0..115% de la meta, zona objetivo ±10% adentro.
describe('energyBandGeometry', () => {
  it('sin meta valida no hay banda', () => {
    expect(energyBandGeometry(500, null)).toBeNull()
    expect(energyBandGeometry(500, 0)).toBeNull()
    expect(energyBandGeometry(500, Number.NaN)).toBeNull()
  })

  it('la zona objetivo ±10% queda dentro del riel, antes del tope', () => {
    const geo = energyBandGeometry(0, 2000)
    expect(geo).not.toBeNull()
    expect(geo!.zoneStartPercent).toBeCloseTo((0.9 / 1.15) * 100, 5)
    expect(geo!.zoneEndPercent).toBeCloseTo((1.1 / 1.15) * 100, 5)
    expect(geo!.zoneEndPercent).toBeLessThan(100)
  })

  it('el consumo en la meta cae DENTRO de la zona y el exceso topa en 100', () => {
    const atTarget = energyBandGeometry(2000, 2000)!
    expect(atTarget.fillPercent).toBeGreaterThan(atTarget.zoneStartPercent)
    expect(atTarget.fillPercent).toBeLessThan(atTarget.zoneEndPercent)
    // 115% de la meta = borde del riel; mas alla no se estira.
    expect(energyBandGeometry(2300, 2000)!.fillPercent).toBeCloseTo(100, 5)
    expect(energyBandGeometry(9999, 2000)!.fillPercent).toBeCloseTo(100, 5)
    expect(energyBandGeometry(0, 2000)!.fillPercent).toBe(0)
  })
})
