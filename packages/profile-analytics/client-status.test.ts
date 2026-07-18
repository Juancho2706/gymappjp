import { describe, expect, it } from 'vitest'
import { deriveClientStatus } from './client-status'
import type { ClientStatusInput } from './types'

const base: ClientStatusInput = {
  attentionScore: 0,
  daysSinceCheckin: 1,
  daysSinceWorkout: 1,
  hasActiveWorkoutProgram: true,
  nutritionAdherencePct: 90,
  planDaysRemaining: 30,
}

describe('deriveClientStatus', () => {
  it('ok sin motivos y score bajo', () => {
    const s = deriveClientStatus(base)
    expect(s.level).toBe('ok')
    expect(s.label).toBe('Al día')
    expect(s.reasons).toEqual([])
  })
  it('urgent por score >= 50', () => {
    expect(deriveClientStatus({ ...base, attentionScore: 60 }).level).toBe('urgent')
  })
  it('urgent por ciclo vencido', () => {
    const s = deriveClientStatus({ ...base, planDaysRemaining: 0 })
    expect(s.level).toBe('urgent')
    expect(s.reasons).toContain('ciclo vencido')
  })
  it('urgent por >= 14 dias sin actividad', () => {
    expect(deriveClientStatus({ ...base, daysSinceCheckin: 20, daysSinceWorkout: 20 }).level).toBe('urgent')
  })
  it('attention por motivo activo (sin entrenar)', () => {
    const s = deriveClientStatus({ ...base, daysSinceWorkout: 8 })
    expect(s.level).toBe('attention')
    expect(s.reasons).toContain('8 días sin entrenar')
  })
  it('recorta a 3 motivos', () => {
    const s = deriveClientStatus({
      attentionScore: 10,
      daysSinceCheckin: 40,
      daysSinceWorkout: 10,
      hasActiveWorkoutProgram: true,
      nutritionAdherencePct: 20,
      planDaysRemaining: 2,
    })
    expect(s.reasons.length).toBeLessThanOrEqual(3)
  })
})
