import { describe, expect, it } from 'vitest'
import { computeWorkoutScore30d } from './workoutAdherence30d'

describe('computeWorkoutScore30d', () => {
    it('returns 0 when no planned days', () => {
        const r = computeWorkoutScore30d({
            todaySantiagoIso: '2026-04-30',
            activePlans: [],
            program: null,
            logs: [],
        })
        expect(r.plannedDays).toBe(0)
        expect(r.completedDays).toBe(0)
        expect(r.score).toBe(0)
    })

    it('counts completed only when log falls on same Santiago day as plan', () => {
        const planId = '11111111-1111-1111-1111-111111111111'
        const r = computeWorkoutScore30d({
            todaySantiagoIso: '2026-04-30',
            activePlans: [
                {
                    id: planId,
                    assigned_date: '2026-04-30',
                    program_id: null,
                    day_of_week: null,
                    week_variant: 'A',
                },
            ],
            program: null,
            logs: [
                {
                    logged_at: '2026-04-29T12:00:00.000Z',
                    workout_blocks: { plan_id: planId },
                },
            ],
        })
        expect(r.plannedDays).toBe(1)
        expect(r.completedDays).toBe(0)
        expect(r.score).toBe(0)
    })

    it('marks day complete when log exists that Santiago day for that plan', () => {
        const planId = '22222222-2222-2222-2222-222222222222'
        const r = computeWorkoutScore30d({
            todaySantiagoIso: '2026-04-30',
            activePlans: [
                {
                    id: planId,
                    assigned_date: '2026-04-30',
                    program_id: null,
                    day_of_week: null,
                    week_variant: 'A',
                },
            ],
            program: null,
            logs: [
                {
                    logged_at: '2026-04-30T15:00:00.000Z',
                    workout_blocks: { plan_id: planId },
                },
            ],
        })
        expect(r.plannedDays).toBe(1)
        expect(r.completedDays).toBe(1)
        expect(r.score).toBe(100)
    })
})
