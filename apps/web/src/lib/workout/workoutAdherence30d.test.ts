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

    /**
     * Ciclo real (spec `docs/specs/ciclo-real-y-por-lado`, R12): no hay meta semanal, así que no hay
     * denominador — el score es `null` y los consumidores pintan «—». Los 3 casos de arriba quedan
     * intactos: el campo es OPCIONAL y su ausencia significa `weekly`.
     */
    describe('ciclo: sin meta semanal', () => {
        const PROG = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        const P1 = '33333333-3333-3333-3333-333333333333'
        const P2 = '44444444-4444-4444-4444-444444444444'
        const CYCLE_PLANS = [
            { id: P1, assigned_date: null, program_id: PROG, day_of_week: 1, week_variant: 'A' },
            { id: P2, assigned_date: null, program_id: PROG, day_of_week: 2, week_variant: 'A' },
        ]

        it('program_structure_type "cycle" ⇒ score null y cero días planificados', () => {
            const r = computeWorkoutScore30d({
                todaySantiagoIso: '2026-09-03',
                activePlans: CYCLE_PLANS,
                program: {
                    id: PROG,
                    ab_mode: false,
                    start_date: '2026-08-24',
                    weeks_to_repeat: 1,
                    program_structure_type: 'cycle',
                },
                logs: [
                    // Dos días distintos del programa + un log del mismo día (no duplica) + ruido neutro.
                    { logged_at: '2026-09-01T15:00:00.000Z', workout_blocks: { plan_id: P1 } },
                    { logged_at: '2026-09-01T16:00:00.000Z', workout_blocks: { plan_id: P1 } },
                    { logged_at: '2026-09-02T15:00:00.000Z', workout_blocks: { plan_id: P2 } },
                    { logged_at: '2026-09-02T15:00:00.000Z', workout_blocks: null },
                    { logged_at: '2026-09-02T15:00:00.000Z', workout_blocks: { plan_id: 'otro-programa' } },
                ],
            })
            expect(r.score).toBeNull()
            expect(r.plannedDays).toBe(0)
            expect(r.completedDays).toBe(2)
        })

        it('un log FUERA de la ventana de 30 días no suma', () => {
            const r = computeWorkoutScore30d({
                todaySantiagoIso: '2026-09-03',
                activePlans: CYCLE_PLANS,
                program: { id: PROG, program_structure_type: 'cycle' },
                logs: [{ logged_at: '2026-06-01T15:00:00.000Z', workout_blocks: { plan_id: P1 } }],
            })
            expect(r.score).toBeNull()
            expect(r.completedDays).toBe(0)
        })

        it('program_structure_type "weekly" explícito ⇒ el mismo número que hoy', () => {
            const planId = '55555555-5555-5555-5555-555555555555'
            const r = computeWorkoutScore30d({
                todaySantiagoIso: '2026-04-30',
                activePlans: [
                    { id: planId, assigned_date: '2026-04-30', program_id: null, day_of_week: null, week_variant: 'A' },
                ],
                program: { id: PROG, program_structure_type: 'weekly' },
                logs: [{ logged_at: '2026-04-30T15:00:00.000Z', workout_blocks: { plan_id: planId } }],
            })
            expect(r.plannedDays).toBe(1)
            expect(r.completedDays).toBe(1)
            expect(r.score).toBe(100)
        })

        it('inicio flexible SIN fecha (programa que no empezó) ⇒ score null aunque sea weekly', () => {
            const r = computeWorkoutScore30d({
                todaySantiagoIso: '2026-09-03',
                activePlans: CYCLE_PLANS,
                program: { id: PROG, start_date: null, start_date_flexible: true },
                logs: [],
            })
            expect(r.score).toBeNull()
            expect(r.plannedDays).toBe(0)
        })

        it('weekly SIN fecha y sin inicio flexible sigue puntuando como hoy (no es "no empezó")', () => {
            const planId = '66666666-6666-6666-6666-666666666666'
            const r = computeWorkoutScore30d({
                todaySantiagoIso: '2026-04-30',
                activePlans: [
                    { id: planId, assigned_date: '2026-04-30', program_id: null, day_of_week: null, week_variant: 'A' },
                ],
                program: { id: PROG, start_date: null },
                logs: [{ logged_at: '2026-04-30T15:00:00.000Z', workout_blocks: { plan_id: planId } }],
            })
            expect(r.score).toBe(100)
        })
    })
})
