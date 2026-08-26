import { describe, expect, it } from 'vitest'
import { DAY_COMPLETION_FIXTURES } from '@eva/workout-engine'
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

/**
 * Serie registrada. Sin `blockId` el plan no trae bloques en estos fixtures → aplica la REGLA LEGACY
 * (≥1 serie = hecho), que es justo lo que ejercitan los casos históricos de atribución de abajo.
 */
function log(planId: string, isoUtc: string, blockId: string | null = null, setNumber: number | null = null): WeekLogRow {
    return { logged_at: isoUtc, block_id: blockId, set_number: setNumber, workout_blocks: { plan_id: planId } }
}

/** N series (1…n) de un bloque, todas el mismo día — el shape que produce `getRecentWorkoutLogs`. */
function setsOf(planId: string, isoUtc: string, blockId: string, n: number): WeekLogRow[] {
    return Array.from({ length: n }, (_, i) => log(planId, isoUtc, blockId, i + 1))
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

        // Regresión del fix: `logs` trae UNA fila por SERIE. 5 series de la MISMA sesión no pueden
        // cerrar dos días del plan repetido (antes el viernes salía done "Hecho el lunes").
        it('1 sola sesión con 5 series (lunes) marca SOLO el lunes; el viernes sigue pendiente', () => {
            const r = deriveWeekWorkoutStatus({
                userLocalDate: SAT_DATE,
                todayIso: SAT_ISO,
                program: REP_PROGRAM,
                activePlans: REP_PLANS,
                logs: [
                    // misma sesión del lunes 07-06, 5 series (5 filas en workout_logs)
                    log(PLAN_REP, '2026-07-06T15:00:00.000Z'),
                    log(PLAN_REP, '2026-07-06T15:04:00.000Z'),
                    log(PLAN_REP, '2026-07-06T15:09:00.000Z'),
                    log(PLAN_REP, '2026-07-06T15:13:00.000Z'),
                    log(PLAN_REP, '2026-07-06T15:18:00.000Z'),
                ],
            })
            const mon = r.days.find((d) => d.dayOfWeek === 1)
            const fri = r.days.find((d) => d.dayOfWeek === 5)
            expect(mon?.status).toBe('done')
            expect(mon?.doneOnDate).toBeNull() // hecho en su propia fecha
            expect(fri?.status).toBe('pending')
            expect(fri?.doneOnDate).toBeNull()
            expect(fri?.doneOnLabel).toBeNull()
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

    // ── Completitud del día (spec `workout-day-in-progress`, CEO O2 2026-07-26) ───────────────────
    // `done` sólo con el 100% de las series esperadas; 1–99% ⇒ `in_progress`. La regla vive en
    // `deriveDayCompletion` (@eva/workout-engine): acá se verifica el ADAPTADOR web (que los targets
    // y los `block_id`/`set_number` lleguen enteros hasta el motor).
    describe('completitud del día: done = 100%, parcial = in_progress', () => {
        const SIMPLE_PROGRAM = { id: PROG, ab_mode: false, start_date: '2026-07-06', weeks_to_repeat: 1 }
        // Lunes: 2 bloques = 5 series esperadas. Miércoles (HOY): 1 bloque = 4 series.
        const MON = plan({
            id: PLAN_MON,
            day_of_week: 1,
            week_variant: null,
            title: 'Empuje',
            workout_blocks: [
                { id: 'bm1', sets: 3 },
                { id: 'bm2', sets: 2 },
            ],
        })
        const WED = plan({
            id: PLAN_WED,
            day_of_week: 3,
            week_variant: null,
            title: 'Full body',
            workout_blocks: [{ id: 'bw1', sets: 4 }],
        })

        it('PARCIAL HOY: 2 de 4 series ⇒ in_progress (antes decía "hecho" con 1 sola serie)', () => {
            const r = deriveWeekWorkoutStatus({
                userLocalDate: TODAY_DATE,
                todayIso: TODAY_ISO,
                program: SIMPLE_PROGRAM,
                activePlans: [WED],
                logs: setsOf(PLAN_WED, '2026-07-08T15:00:00.000Z', 'bw1', 2),
            })
            const wed = r.days.find((d) => d.dayOfWeek === 3)
            expect(wed?.status).toBe('in_progress')
            expect(wed?.completionPct).toBe(0.5)
            expect(wed?.isToday).toBe(true)
            // HOY jamás entra a la cola de recuperables (es trabajo del hero).
            expect(r.pending).toHaveLength(0)
        })

        it('HOY al 100% ⇒ done (el sheet clásico sólo aparece acá)', () => {
            const r = deriveWeekWorkoutStatus({
                userLocalDate: TODAY_DATE,
                todayIso: TODAY_ISO,
                program: SIMPLE_PROGRAM,
                activePlans: [WED],
                logs: setsOf(PLAN_WED, '2026-07-08T15:00:00.000Z', 'bw1', 4),
            })
            const wed = r.days.find((d) => d.dayOfWeek === 3)
            expect(wed?.status).toBe('done')
            expect(wed?.completionPct).toBe(1)
            expect(wed?.doneOnDate).toBeNull()
        })

        // ── OMISIÓN (mockup 3 del ejecutor) ──
        // La fila de omisión NO es una serie entrenada: `countLoggedSetsByBlock` la ignora. Sin pasar
        // `skippedBlockIds` el día quedaba eternamente parcial en el panel del coach (y como pendiente
        // ámbar), aunque el alumno lo hubiera cerrado desde el ejecutor.
        it('OMITIR cierra el día: 2 series de bm1 + bm2 omitido ⇒ done (la fila de skip no suma series)', () => {
            const r = deriveWeekWorkoutStatus({
                userLocalDate: TODAY_DATE,
                todayIso: TODAY_ISO,
                program: SIMPLE_PROGRAM,
                activePlans: [MON, WED],
                logs: [
                    ...setsOf(PLAN_MON, '2026-07-06T15:00:00.000Z', 'bm1', 3),
                    { ...log(PLAN_MON, '2026-07-06T15:10:00.000Z', 'bm2', 1), metadata: { skipped: true, skip_reason: 'machine_busy' } },
                ],
            })
            const mon = r.days.find((d) => d.dayOfWeek === 1)
            expect(mon?.status).toBe('done')
            expect(mon?.completionPct).toBe(1)
            expect(r.pending).toHaveLength(0)
        })

        it('OMITIR resuelve el bloque ENTERO, no una serie: bm1 omitido tras 1 serie ⇒ 5/5', () => {
            const r = deriveWeekWorkoutStatus({
                userLocalDate: TODAY_DATE,
                todayIso: TODAY_ISO,
                program: SIMPLE_PROGRAM,
                activePlans: [MON, WED],
                logs: [
                    ...setsOf(PLAN_MON, '2026-07-06T15:00:00.000Z', 'bm2', 2),
                    ...setsOf(PLAN_MON, '2026-07-06T15:05:00.000Z', 'bm1', 1),
                    { ...log(PLAN_MON, '2026-07-06T15:10:00.000Z', 'bm1', 2), metadata: { skipped: true } },
                ],
            })
            const mon = r.days.find((d) => d.dayOfWeek === 1)
            expect(mon?.status).toBe('done')
            expect(mon?.completionPct).toBe(1)
        })

        it('metadata SIN skipped (hold por lado) no resuelve nada: sigue siendo parcial', () => {
            const r = deriveWeekWorkoutStatus({
                userLocalDate: TODAY_DATE,
                todayIso: TODAY_ISO,
                program: SIMPLE_PROGRAM,
                activePlans: [MON, WED],
                logs: [
                    ...setsOf(PLAN_MON, '2026-07-06T15:00:00.000Z', 'bm1', 3).map((l) => ({ ...l, metadata: { skipped: false } })),
                ],
            })
            const mon = r.days.find((d) => d.dayOfWeek === 1)
            expect(mon?.status).toBe('in_progress')
            expect(mon?.completionPct).toBeCloseTo(0.6, 5)
        })

        it('PARCIAL DÍA PASADO: 3 de 5 el lunes ⇒ in_progress y entra a la cola como "in_progress"', () => {
            const r = deriveWeekWorkoutStatus({
                userLocalDate: TODAY_DATE,
                todayIso: TODAY_ISO,
                program: SIMPLE_PROGRAM,
                activePlans: [MON, WED],
                logs: [
                    ...setsOf(PLAN_MON, '2026-07-06T15:00:00.000Z', 'bm1', 3),
                    // bm2 (2 series) sin registrar → 3/5
                ],
            })
            const mon = r.days.find((d) => d.dayOfWeek === 1)
            expect(mon?.status).toBe('in_progress')
            expect(mon?.completionPct).toBeCloseTo(0.6, 5)
            expect(r.pending.map((p) => [p.dayOfWeek, p.status])).toEqual([[1, 'in_progress']])
        })

        it('DÍA PASADO al 100% ⇒ done y sale de la cola', () => {
            const r = deriveWeekWorkoutStatus({
                userLocalDate: TODAY_DATE,
                todayIso: TODAY_ISO,
                program: SIMPLE_PROGRAM,
                activePlans: [MON, WED],
                logs: [
                    ...setsOf(PLAN_MON, '2026-07-06T15:00:00.000Z', 'bm1', 3),
                    ...setsOf(PLAN_MON, '2026-07-06T15:20:00.000Z', 'bm2', 2),
                ],
            })
            expect(r.days.find((d) => d.dayOfWeek === 1)?.status).toBe('done')
            expect(r.pending).toHaveLength(0)
        })

        it('CARDIO-ONLY (sets null/0): cada bloque vale 1 unidad — mitad ⇒ in_progress, ambos ⇒ done', () => {
            const cardio = plan({
                id: PLAN_TUE_A,
                day_of_week: 2,
                week_variant: null,
                title: 'Cardio',
                workout_blocks: [
                    { id: 'c1', sets: null },
                    { id: 'c2', sets: 0 },
                ],
            })
            const half = deriveWeekWorkoutStatus({
                userLocalDate: TODAY_DATE,
                todayIso: TODAY_ISO,
                program: SIMPLE_PROGRAM,
                activePlans: [cardio],
                logs: setsOf(PLAN_TUE_A, '2026-07-07T15:00:00.000Z', 'c1', 1),
            })
            expect(half.days.find((d) => d.dayOfWeek === 2)?.status).toBe('in_progress')
            expect(half.days.find((d) => d.dayOfWeek === 2)?.completionPct).toBe(0.5)

            const full = deriveWeekWorkoutStatus({
                userLocalDate: TODAY_DATE,
                todayIso: TODAY_ISO,
                program: SIMPLE_PROGRAM,
                activePlans: [cardio],
                logs: [
                    ...setsOf(PLAN_TUE_A, '2026-07-07T15:00:00.000Z', 'c1', 1),
                    ...setsOf(PLAN_TUE_A, '2026-07-07T15:10:00.000Z', 'c2', 1),
                ],
            })
            expect(full.days.find((d) => d.dayOfWeek === 2)?.status).toBe('done')
        })

        it('series de MÁS (coach bajó las series después) no rompen: el día sigue done, nunca >100%', () => {
            const r = deriveWeekWorkoutStatus({
                userLocalDate: TODAY_DATE,
                todayIso: TODAY_ISO,
                program: SIMPLE_PROGRAM,
                activePlans: [WED],
                logs: setsOf(PLAN_WED, '2026-07-08T15:00:00.000Z', 'bw1', 7),
            })
            const wed = r.days.find((d) => d.dayOfWeek === 3)
            expect(wed?.status).toBe('done')
            expect(wed?.completionPct).toBe(1)
        })

        it('compatibilidad: plan SIN la relación de bloques conserva la regla legacy (≥1 serie = done)', () => {
            const sinBloques = plan({ id: PLAN_MON, day_of_week: 1, week_variant: null, title: 'Empuje' })
            const r = deriveWeekWorkoutStatus({
                userLocalDate: TODAY_DATE,
                todayIso: TODAY_ISO,
                program: SIMPLE_PROGRAM,
                activePlans: [sinBloques],
                logs: [log(PLAN_MON, '2026-07-06T15:00:00.000Z')],
            })
            expect(r.days.find((d) => d.dayOfWeek === 1)?.status).toBe('done')
        })

        it('targets ANIDADOS del programa activo también alimentan el denominador', () => {
            // El plan llega SIN bloques (como `getClientWorkoutPlans` antiguo) pero el programa sí los trae.
            const sinBloques = plan({ id: PLAN_WED, day_of_week: 3, week_variant: null, title: 'Full body' })
            const r = deriveWeekWorkoutStatus({
                userLocalDate: TODAY_DATE,
                todayIso: TODAY_ISO,
                program: {
                    ...SIMPLE_PROGRAM,
                    workout_plans: [{ id: PLAN_WED, workout_blocks: [{ id: 'bw1', sets: 4 }] }],
                },
                activePlans: [sinBloques],
                logs: setsOf(PLAN_WED, '2026-07-08T15:00:00.000Z', 'bw1', 1),
            })
            // Con targets conocidos 1 de 4 ya NO es "hecho".
            expect(r.days.find((d) => d.dayOfWeek === 3)?.status).toBe('in_progress')
        })

        it('la recuperación PARCIAL en otra fecha no cierra el día ajeno (la atribución greedy sólo mira sesiones completas)', () => {
            const tue = plan({
                id: PLAN_TUE_A,
                day_of_week: 2,
                week_variant: null,
                title: 'Tirón',
                workout_blocks: [{ id: 'bt1', sets: 4 }],
            })
            const r = deriveWeekWorkoutStatus({
                userLocalDate: TODAY_DATE,
                todayIso: TODAY_ISO,
                program: SIMPLE_PROGRAM,
                activePlans: [tue, WED],
                // El plan del martes se retoma HOY (miércoles) pero sólo 1 de 4 series.
                logs: setsOf(PLAN_TUE_A, '2026-07-08T15:00:00.000Z', 'bt1', 1),
            })
            expect(r.days.find((d) => d.dayOfWeek === 2)?.status).toBe('pending')
            expect(r.days.find((d) => d.dayOfWeek === 2)?.completionPct).toBe(0)
            // El miércoles (hoy) tiene SU propio plan sin tocar.
            expect(r.days.find((d) => d.dayOfWeek === 3)?.status).toBe('today')
        })

        it('la recuperación COMPLETA en otra fecha sigue cerrando el día (regresión de la atribución)', () => {
            const tue = plan({
                id: PLAN_TUE_A,
                day_of_week: 2,
                week_variant: null,
                title: 'Tirón',
                workout_blocks: [{ id: 'bt1', sets: 4 }],
            })
            const r = deriveWeekWorkoutStatus({
                userLocalDate: TODAY_DATE,
                todayIso: TODAY_ISO,
                program: SIMPLE_PROGRAM,
                activePlans: [tue, WED],
                logs: setsOf(PLAN_TUE_A, '2026-07-08T15:00:00.000Z', 'bt1', 4),
            })
            const mar = r.days.find((d) => d.dayOfWeek === 2)
            expect(mar?.status).toBe('done')
            expect(mar?.doneOnDate).toBe('2026-07-08')
            expect(mar?.doneOnLabel).toBe('Miércoles')
        })
    })

    // Paridad con el motor: los MISMOS fixtures que consumen el paquete y RN, atravesando el
    // adaptador web (bloques del plan + filas `block_id`/`set_number` de `getRecentWorkoutLogs`).
    // `none` se proyecta como `today` porque el día del fixture es HOY sin nada válido registrado.
    describe('paridad con DAY_COMPLETION_FIXTURES (@eva/workout-engine)', () => {
        const PROGRAM = { id: PROG, ab_mode: false, start_date: '2026-07-06', weeks_to_repeat: 1 }
        const EXPECTED_STATUS = { done: 'done', in_progress: 'in_progress', none: 'today' } as const

        for (const fixture of DAY_COMPLETION_FIXTURES) {
            it(fixture.name, () => {
                const logs = Object.entries(fixture.input.loggedSetsByBlock).flatMap(([blockId, n]) =>
                    setsOf(PLAN_WED, '2026-07-08T15:00:00.000Z', blockId, n)
                )
                const r = deriveWeekWorkoutStatus({
                    userLocalDate: TODAY_DATE,
                    todayIso: TODAY_ISO,
                    program: PROGRAM,
                    activePlans: [
                        plan({
                            id: PLAN_WED,
                            day_of_week: 3,
                            week_variant: null,
                            title: 'Full body',
                            workout_blocks: fixture.input.blocks,
                        }),
                    ],
                    logs,
                })
                const wed = r.days.find((d) => d.dayOfWeek === 3)
                expect(wed?.status).toBe(EXPECTED_STATUS[fixture.expected.state])
                if (fixture.expected.state !== 'none') {
                    expect(wed?.completionPct).toBeCloseTo(fixture.expected.pct, 5)
                }
            })
        }
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
