import { describe, expect, it } from 'vitest'
import {
  clampAssignDurationWeeks,
  defaultAssignClientsOptions,
  isValidIsoYmd,
  normalizeAssignClientsOptions,
} from '../apps/mobile/lib/assign-clients-options'

describe('mobile assign clients options', () => {
  it('inicia con hoy Santiago, cuatro semanas, inicio flexible y todos los días', () => {
    expect(defaultAssignClientsOptions('2026-07-13')).toEqual({
      startDateFlexible: true,
      startDate: '2026-07-13',
      durationWeeks: 4,
      selectedDays: [],
    })
  })

  it('limita la duración al contrato 1..52', () => {
    expect(clampAssignDurationWeeks(0)).toBe(1)
    expect(clampAssignDurationWeeks('8')).toBe(8)
    expect(clampAssignDurationWeeks(80)).toBe(52)
    expect(clampAssignDurationWeeks('')).toBe(4)
    expect(clampAssignDurationWeeks('no-numero')).toBe(4)
  })

  it('valida fechas calendario YYYY-MM-DD reales', () => {
    expect(isValidIsoYmd('2028-02-29')).toBe(true)
    expect(isValidIsoYmd('2027-02-29')).toBe(false)
    expect(isValidIsoYmd('13-07-2026')).toBe(false)
  })

  it('normaliza fecha, semanas y días antes de entregar al builder', () => {
    expect(normalizeAssignClientsOptions({
      startDateFlexible: false,
      startDate: 'fecha-invalida',
      durationWeeks: 70,
      selectedDays: [7, 2, 2, 0, 8, 1.5],
    }, '2026-07-13')).toEqual({
      startDateFlexible: false,
      startDate: '2026-07-13',
      durationWeeks: 52,
      selectedDays: [2, 7],
    })
  })
})
