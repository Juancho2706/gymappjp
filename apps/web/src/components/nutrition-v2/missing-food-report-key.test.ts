import { describe, expect, it } from 'vitest'
import { missingFoodReportKey } from './missing-food-report-key'

describe('missingFoodReportKey (dedup del reporte de GTIN faltante)', () => {
  const clientId = '11111111-1111-1111-1111-111111111111'
  const day = new Date(2026, 6, 16, 14, 30) // 2026-07-16, hora local

  it('misma entrada (alumno + gtin + dia) => MISMA clave (idempotente)', () => {
    const a = missingFoodReportKey({ clientId, gtin: '7801234567894', now: day })
    const b = missingFoodReportKey({ clientId, gtin: '7801234567894', now: new Date(2026, 6, 16, 9, 0) })
    expect(a).toBe(b)
    expect(a).toBe(`missing:${clientId}:7801234567894:2026-07-16`)
  })

  it('normaliza el gtin a digitos (mismos digitos => misma clave)', () => {
    const raw = missingFoodReportKey({ clientId, gtin: ' 780 1234-567894 ', now: day })
    const clean = missingFoodReportKey({ clientId, gtin: '7801234567894', now: day })
    expect(raw).toBe(clean)
  })

  it('cambia con el dia local (un reporte por dia calendario)', () => {
    const today = missingFoodReportKey({ clientId, gtin: '7801234567894', now: day })
    const tomorrow = missingFoodReportKey({ clientId, gtin: '7801234567894', now: new Date(2026, 6, 17, 1, 0) })
    expect(today).not.toBe(tomorrow)
  })

  it('cambia con el alumno y con el gtin', () => {
    const base = missingFoodReportKey({ clientId, gtin: '7801234567894', now: day })
    const otherClient = missingFoodReportKey({ clientId: '22222222-2222-2222-2222-222222222222', gtin: '7801234567894', now: day })
    const otherGtin = missingFoodReportKey({ clientId, gtin: '7809999999999', now: day })
    expect(base).not.toBe(otherClient)
    expect(base).not.toBe(otherGtin)
  })

  it('usa la fecha LOCAL, no UTC (dia calendario del dispositivo)', () => {
    // 2026-07-16 23:30 local: aunque en UTC pudiera ser 17, la clave usa el dia local = 16.
    const key = missingFoodReportKey({ clientId, gtin: '7801234567894', now: new Date(2026, 6, 16, 23, 30) })
    expect(key.endsWith(':2026-07-16')).toBe(true)
  })
})
