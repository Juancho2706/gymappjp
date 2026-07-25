import { describe, expect, it } from 'vitest'
import { deriveWeekWorkoutStatus, type WeekLogRow, type WeekPlanRow } from './weekPendingWorkouts'

// Semana de referencia: hoy = miércoles 2026-07-08 (dow 3). Lunes de la semana = 2026-07-06.
const TODAY_ISO = '2026-07-08'
const TODAY_DATE = new Date(2026, 6, 8) // componentes locales = miércoles

const PLAN_MON = '11111111-1111-1111-1111-111111111111'
const PLAN_TUE_A = '22222222-2222-2222-2222-222222222222'
const PLAN_TUE_B = '33333333-3333-3333-3333-333333333333'
const PLAN_WED = '44444444-4444-4444-4444-444444444444'
const PLAN_THU_B = '55555555-5555-5555-5555-555555555555'
const PLAN_FRI = '66666666-6666-6666-6666-666666666666'
const PLAN_SUN = '77777777-7777-7777-7777-777777777777'
const PLAN_REP = '88888888-8888-8888-8888-888888888888'
const PROG = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function plan(overrides: Partial<WeekPlanRow> & { id: string }): WeekPlanRow {
    return {
        title: `Plan ${overrides.id.slice(0, 4)}`,
        assigned_date: null,
        program_id: PROG,
        day_of_week: null,
        week_variant: 'A',
        ...overrides,
    }
}

const AB_PLANS: WeekPlanRow[] = [
    plan({ id: PLAN_MON, day_of_week: 1, week_variant: 'A', title: 'Empuje' }),
    plan({ id: PLAN_TUE_A, day_of_week: 2, week_variant: 'A', title: 'Tirón' }),
    plan({ id: PLAN_TUE_B, day_of_week: 2, week_variant: 'B', title: 'Piernas B' }),
    plan({ id: PLAN_WED, day_of_week: 3, week_variant: 'A', title: 'Full body' }),
    plan({ id: PLAN_THU_B, day_of_week: 4, week_variant: 'B', title: 'Core B' }),
    plan({ id: PLAN_FRI, day_of_week: 5, week_variant: 'A', title: 'Piernas' }),
]

// ab_mode con start el lunes de esta semana → semana 1 → variante A.
const AB_PROGRAM = { id: PROG, ab_mode: true, start_date: '2026-07-06', weeks_to_repeat: 4 }

function log(planId: string, isoUtc: string): WeekLogRow {
    return { logged_at: isoUtc, workout_blocks: { plan_id: planId } }
}

describe('deriveWeekWorkoutStatus', () => {
    it('sin programa activo → semana vacía y cero pendientes (nada cambia)', () => {
        const r = deriveWeekWorkoutStatus({
            userLocalDate: TODAY_DATE,
            todayIso: TODAY_ISO,
            program: null,
            activePlans: AB_PLANS,
            logs: [],
        })
        expect(r.days).toHaveLength(0)
        expect(r.pending).toHaveLength(0)
    })

    it('clasifica done/pending/today/upcoming y excluye la variante B en semana A', () => {
        const r = deriveWeekWorkoutStatus({
            userLocalDate: TODAY_DATE,
            todayIso: TODAY_ISO,
            program: AB_PROGRAM,
            activePlans: AB_PLANS,
            // lunes completado el mismo lunes (15:00Z = 11:00 Santiago mismo día)
            logs: [log(PLAN_MON, '2026-07-06T15:00:00.000Z')],
        })

        expect(r.days).toHaveLength(7)
        const byDow = new Map(r.days.map((d) => [d.dayOfWeek, d]))

        expect(byDow.get(1)?.status).toBe('done') // Lun hecho el lunes
        expect(byDow.get(2)?.status).toBe('pending') // Mar saltado
        expect(byDow.get(2)?.planId).toBe(PLAN_TUE_A) // variante A, NO la B
        expect(byDow.get(3)?.status).toBe('today') // Mié = hoy, sin log
        expect(byDow.get(3)?.isToday).toBe(true)
        expect(byDow.get(4)?.status).toBe('rest') // Jue solo tiene plan variante B → descanso
        expect(byDow.get(5)?.status).toBe('upcoming') // Vie futuro
        expect(byDow.get(6)?.status).toBe('rest') // Sáb
        expect(byDow.get(7)?.status).toBe('rest') // Dom
    })

    it('cola de pendientes = sólo días pasados con plan sin log, del más antiguo al más nuevo', () => {
        const r = deriveWeekWorkoutStatus({
            userLocalDate: TODAY_DATE,
            todayIso: TODAY_ISO,
            program: AB_PROGRAM,
            activePlans: AB_PLANS,
            logs: [log(PLAN_MON, '2026-07-06T15:00:00.000Z')],
        })
        expect(r.pending).toHaveLength(1)
        const p = r.pending[0]
        expect(p.planId).toBe(PLAN_TUE_A)
        expect(p.dayOfWeek).toBe(2)
        expect(p.dateIso).toBe('2026-07-07')
        expect(p.dayLabel).toBe('Martes')
        expect(p.shortLabel).toBe('Mar')
        expect(p.title).toBe('Tirón')
    })

    it('atribución al plan (fix del gap): recuperar el martes HOY cierra el día del martes con "Hecho el miércoles"', () => {
        const r = deriveWeekWorkoutStatus({
            userLocalDate: TODAY_DATE,
            todayIso: TODAY_ISO,
            program: AB_PROGRAM,
            activePlans: AB_PLANS,
            logs: [
                log(PLAN_MON, '2026-07-06T15:00:00.000Z'),
                // el alumno hace el plan del martes HOY (miércoles) → log del 08, no del 07
                log(PLAN_TUE_A, '2026-07-08T15:00:00.000Z'),
            ],
        })
        const tue = r.days.find((d) => d.dayOfWeek === 2)
        expect(tue?.status).toBe('done') // ya no queda pendiente: su plan tiene log esta semana
        expect(tue?.doneOnDate).toBe('2026-07-08')
        expect(tue?.doneOnLabel).toBe('Miércoles')
        expect(r.pending.map((p) => p.planId)).not.toContain(PLAN_TUE_A)
        expect(r.pending).toHaveLength(0) // Lun done en fecha, Mar recuperado → cola limpia
    })

    // (a) plan del martes con log del jueves → martes done "hecho el jueves"; jueves intacto.
    it('recuperación en otro día: plan del martes hecho el jueves → martes done "Jueves", jueves intacto', () => {
        const r = deriveWeekWorkoutStatus({
            userLocalDate: new Date(2026, 6, 10), // viernes 2026-07-10
            todayIso: '2026-07-10',
            program: AB_PROGRAM,
            activePlans: AB_PLANS,
            logs: [log(PLAN_TUE_A, '2026-07-09T15:00:00.000Z')], // día real Santiago = jueves 07-09
        })
        const tue = r.days.find((d) => d.dayOfWeek === 2)
        expect(tue?.status).toBe('done')
        expect(tue?.doneOnDate).toBe('2026-07-09')
        expect(tue?.doneOnLabel).toBe('Jueves')
        // el jueves sigue rigiéndose por SU propio plan (variante B en semana A → descanso): sin tocar.
        const thu = r.days.find((d) => d.dayOfWeek === 4)
        expect(thu?.status).toBe('rest')
        expect(thu?.doneOnDate).toBeNull()
        expect(r.pending.map((p) => p.planId)).not.toContain(PLAN_TUE_A)
    })

    // (b) plan repetido lunes+viernes: 1 sesión marca SOLO lunes; 2 sesiones marcan ambos.
    describe('plan repetido en 2+ días — asignación greedy 1 log ↔ 1 día', () => {
        // Mismo plan (id) asignado por fecha a lunes y viernes; hoy = sábado (ambos días son pasado).
        const SAT_DATE = new Date(2026, 6, 11) // sábado 2026-07-11
        const SAT_ISO = '2026-07-11'
        const REP_PLANS: WeekPlanRow[] = [
            plan({ id: PLAN_REP, program_id: null, day_of_week: null, week_variant: null, assigned_date: '2026-07-06' }),
            plan({ id: PLAN_REP, program_id: null, day_of_week: null, week_variant: null, assigned_date: '2026-07-10' }),
        ]
        const REP_PROGRAM = { id: PROG, ab_mode: false, start_date: '2026-07-06', weeks_to_repeat: 1 }

        it('1 sola sesión (miércoles) marca SOLO el lunes (día pendiente más antiguo); viernes queda pendiente', () => {
            const r = deriveWeekWorkoutStatus({
                userLocalDate: SAT_DATE,
                todayIso: SAT_ISO,
                program: REP_PROGRAM,
                activePlans: REP_PLANS,
                logs: [log(PLAN_REP, '2026-07-08T15:00:00.000Z')], // día real = miércoles
            })
            const mon = r.days.find((d) => d.dayOfWeek === 1)
            const fri = r.days.find((d) => d.dayOfWeek === 5)
            expect(mon?.status).toBe('done')
            expect(mon?.doneOnDate).toBe('2026-07-08')
            expect(mon?.doneOnLabel).toBe('Miércoles')
            expect(fri?.status).toBe('pending')
            expect(r.pending.map((p) => p.dayOfWeek)).toEqual([5])
        })

        it('2 sesiones (miércoles + jueves) marcan AMBOS días', () => {
            const r = deriveWeekWorkoutStatus({
                userLocalDate: SAT_DATE,
                todayIso: SAT_ISO,
                program: REP_PROGRAM,
                activePlans: REP_PLANS,
                logs: [
                    log(PLAN_REP, '2026-07-08T15:00:00.000Z'), // miércoles
                    log(PLAN_REP, '2026-07-09T15:00:00.000Z'), // jueves
                ],
            })
            const mon = r.days.find((d) => d.dayOfWeek === 1)
            const fri = r.days.find((d) => d.dayOfWeek === 5)
            expect(mon?.status).toBe('done')
            expect(fri?.status).toBe('done')
            expect(r.pending).toHaveLength(0)
        })
    })

    // (c) semana límite TZ Santiago: log lunes 00:xx y domingo 23:xx caen DENTRO de la semana.
    describe('límites de semana en America/Santiago (DST-safe)', () => {
        const SUN_DATE = new Date(2026, 6, 12) // domingo 2026-07-12 (fin de semana)
        const SUN_ISO = '2026-07-12'
        const EDGE_PLANS: WeekPlanRow[] = [
            plan({ id: PLAN_MON, day_of_week: 1, week_variant: null, title: 'Día lunes' }),
            plan({ id: PLAN_SUN, day_of_week: 7, week_variant: null, title: 'Día domingo' }),
        ]
        const EDGE_PROGRAM = { id: PROG, ab_mode: false, start_date: '2026-07-06', weeks_to_repeat: 1 }

        it('logs en los bordes (lunes 00:30 y domingo 23:30 Santiago) atribuyen dentro de la semana', () => {
            const r = deriveWeekWorkoutStatus({
                userLocalDate: SUN_DATE,
                todayIso: SUN_ISO,
                program: EDGE_PROGRAM,
                activePlans: EDGE_PLANS,
                logs: [
                    log(PLAN_MON, '2026-07-06T04:30:00.000Z'), // Santiago lunes 07-06 00:30
                    log(PLAN_SUN, '2026-07-13T03:30:00.000Z'), // Santiago domingo 07-12 23:30
                ],
            })
            expect(r.days.find((d) => d.dayOfWeek === 1)?.status).toBe('done')
            expect(r.days.find((d) => d.dayOfWeek === 7)?.status).toBe('done')
            expect(r.pending).toHaveLength(0)
        })

        it('log de la semana ANTERIOR (domingo 23:30 previo) NO atribuye: el lunes sigue pendiente', () => {
            const r = deriveWeekWorkoutStatus({
                userLocalDate: SUN_DATE,
                todayIso: SUN_ISO,
                program: EDGE_PROGRAM,
                activePlans: EDGE_PLANS,
                logs: [log(PLAN_MON, '2026-07-06T03:30:00.000Z')], // Santiago domingo 07-05 23:30 (fuera)
            })
            const mon = r.days.find((d) => d.dayOfWeek === 1)
            expect(mon?.status).toBe('pending')
            expect(mon?.doneOnDate).toBeNull()
            expect(r.pending.map((p) => p.dayOfWeek)).toContain(1)
        })
    })

    // (d) regresión: día hecho EN su fecha sigue done SIN doneOn ajeno.
    it('regresión: día completado en su propia fecha queda done sin doneOnDate/doneOnLabel', () => {
        const r = deriveWeekWorkoutStatus({
            userLocalDate: TODAY_DATE,
            todayIso: TODAY_ISO,
            program: AB_PROGRAM,
            activePlans: AB_PLANS,
            logs: [log(PLAN_MON, '2026-07-06T15:00:00.000Z')], // lunes completado el mismo lunes
        })
        const mon = r.days.find((d) => d.dayOfWeek === 1)
        expect(mon?.status).toBe('done')
        expect(mon?.doneOnDate).toBeNull()
        expect(mon?.doneOnLabel).toBeNull()
    })

    // (e) día futuro jamás done, ni siquiera con un log de ese plan esta semana.
    it('día futuro nunca es done aunque exista un log de su plan esta semana', () => {
        const r = deriveWeekWorkoutStatus({
            userLocalDate: TODAY_DATE, // miércoles 07-08
            todayIso: TODAY_ISO,
            program: AB_PROGRAM,
            activePlans: AB_PLANS,
            logs: [log(PLAN_FRI, '2026-07-08T15:00:00.000Z')], // log hoy del plan del viernes (futuro)
        })
        const fri = r.days.find((d) => d.dayOfWeek === 5)
        expect(fri?.status).toBe('upcoming')
        expect(fri?.doneOnDate).toBeNull()
    })

    it('múltiples pendientes ordenados del más antiguo al más nuevo', () => {
        const r = deriveWeekWorkoutStatus({
            userLocalDate: TODAY_DATE,
            todayIso: TODAY_ISO,
            program: AB_PROGRAM,
            activePlans: AB_PLANS,
            logs: [], // nada hecho → Lun y Mar pendientes
        })
        expect(r.pending.map((p) => p.dayOfWeek)).toEqual([1, 2])
        expect(r.pending[0].dateIso).toBe('2026-07-06')
        expect(r.pending[1].dateIso).toBe('2026-07-07')
    })

    it('programa sin A/B: plan con week_variant null cuenta como A y no genera falsos pendientes en descanso', () => {
        const plans: WeekPlanRow[] = [
            plan({ id: PLAN_MON, day_of_week: 1, week_variant: null, title: 'Día 1' }),
        ]
        const r = deriveWeekWorkoutStatus({
            userLocalDate: TODAY_DATE,
            todayIso: TODAY_ISO,
            program: { id: PROG, ab_mode: false, start_date: '2026-07-06', weeks_to_repeat: 1 },
            activePlans: plans,
            logs: [],
        })
        // Lun sin log → pendiente; el resto sin plan → descanso, cero pendientes extra.
        expect(r.pending.map((p) => p.dayOfWeek)).toEqual([1])
        expect(r.days.filter((d) => d.status === 'rest')).toHaveLength(6)
    })
})
