import { describe, expect, it } from 'vitest'
import { getProfileTopAlert } from './top-alert'

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

describe('getProfileTopAlert', () => {
  it('warning por >30 dias sin check-in', () => {
    const a = getProfileTopAlert({
      checkIns: [{ created_at: isoDaysAgo(40) }],
      lastWorkoutDate: isoDaysAgo(1),
      compliance: { nutritionCompliancePercent: 100, planDaysRemaining: 30 },
    })
    expect(a).toMatchObject({ type: 'warning' })
    expect(a!.message).toContain('último check-in')
  })
  it('danger si no registra ejercicios en la semana (lastWorkoutDate null)', () => {
    const a = getProfileTopAlert({ checkIns: [{ created_at: isoDaysAgo(1) }], lastWorkoutDate: null })
    expect(a).toMatchObject({ type: 'danger' })
  })
  it('acepta checkIns con campo `date` (superset RN)', () => {
    const a = getProfileTopAlert({
      checkIns: [{ date: isoDaysAgo(40) }],
      lastWorkoutDate: isoDaysAgo(1),
      compliance: { nutritionCompliancePercent: 100 },
    })
    expect(a).toMatchObject({ type: 'warning' })
  })
  it('warning nutricion < 60 con string web (hoy / plan activo)', () => {
    const a = getProfileTopAlert({
      checkIns: [{ created_at: isoDaysAgo(1) }],
      lastWorkoutDate: isoDaysAgo(1),
      compliance: { nutritionCompliancePercent: 50, planDaysRemaining: 30 },
    })
    expect(a!.message).toContain('(hoy / plan activo)')
  })
  it('success con racha >= 10', () => {
    const a = getProfileTopAlert({
      checkIns: [{ created_at: isoDaysAgo(1) }],
      lastWorkoutDate: isoDaysAgo(1),
      compliance: { nutritionCompliancePercent: 100, planDaysRemaining: 30, currentStreak: 12 },
    })
    expect(a).toMatchObject({ type: 'success' })
  })
  it('null cuando todo esta bien', () => {
    expect(
      getProfileTopAlert({
        checkIns: [{ created_at: isoDaysAgo(1) }],
        lastWorkoutDate: isoDaysAgo(1),
        compliance: { nutritionCompliancePercent: 100, planDaysRemaining: 30, currentStreak: 1 },
      })
    ).toBeNull()
  })
})
