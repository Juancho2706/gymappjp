import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    CYCLE_FIXTURE_BLOCKS,
    CYCLE_FIXTURE_PLANS,
    CYCLE_FIXTURE_PROGRAM,
    CYCLE_FIXTURE_TODAY_ISO,
} from '@eva/workout-engine'

/**
 * Contrato del bundle del hero del alumno (spec `docs/specs/ciclo-real-y-por-lado`, W2.7).
 *
 * Los casos WEEKLY son el blindaje de identidad: se escribieron ANTES de cablear
 * `resolveCycleCursor` y capturan la resolución previa (`todayPlan` por ISODOW, `nextWorkoutDayLabel`
 * con "Mañana" y el nombre largo del día, atajo por `assigned_date` de los planes sueltos). Si el
 * cursor cambiara algo en weekly, fallan acá.
 *
 * El caso CICLO usa el fixture compartido del motor (`CYCLE_FIXTURE_*`), el mismo que consumen
 * `cycle-cursor.test.ts` y RN: si el adaptador de la web perdiera `sets`, `block_id` o `logged_at`
 * por el camino, la completitud no cerraría y el cursor devolvería otro día.
 */

const PROG = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

type BlockFixture = { id: string; sets: number | null; reps: string | null; exercise_id: string; exercises: { id: string; name: string } | null }
type PlanFixture = {
    id: string
    title: string | null
    day_of_week: number | null
    week_variant: string | null
    assigned_date: string | null
    program_id: string | null
    workout_blocks?: { id: string; sets: number | null }[]
}
type LogFixture = {
    id: string
    logged_at: string
    block_id: string | null
    set_number: number | null
    weight_kg: number | null
    reps_done: number | null
    workout_blocks: { plan_id: string | null } | null
}

const state = vi.hoisted(() => ({
    program: null as unknown,
    plans: [] as unknown[],
    logs: [] as unknown[],
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/services/feature-prefs.service', () => ({ resolveNutritionDomainEnabled: vi.fn(async () => true) }))
vi.mock('./dashboard.queries', () => ({
    getActiveProgram: async () => state.program,
    getClientWorkoutPlans: async () => state.plans,
    getRecentWorkoutLogs: async () => state.logs,
    getCheckInHistory30Days: async () => [],
    getNutritionLogDays30: async () => 0,
    getNutritionAdherenceInputs30d: async () => null,
    getWorkoutPlanBlocksForHero: async () => null,
}))

const { getHeroComplianceBundle } = await import('./heroComplianceBundle')

/** Jueves 2026-09-03 en Santiago — el mismo "hoy" del fixture compartido del motor. */
const TODAY_ISO = '2026-09-03'

function weeklyProgram(plans: PlanFixture[], blocksByPlan: Record<string, BlockFixture[]> = {}) {
    return {
        id: PROG,
        name: 'Programa',
        start_date: '2026-08-31',
        end_date: null,
        weeks_to_repeat: 4,
        ab_mode: false,
        program_phases: null,
        program_structure_type: 'weekly',
        cycle_length: null,
        start_date_flexible: false,
        workout_plans: plans
            .filter((p) => p.program_id === PROG)
            .map((p) => ({
                id: p.id,
                title: p.title,
                day_of_week: p.day_of_week,
                week_variant: p.week_variant,
                assigned_date: p.assigned_date,
                workout_blocks: blocksByPlan[p.id] ?? [],
            })),
    }
}

function plan(overrides: Partial<PlanFixture> & { id: string }): PlanFixture {
    return {
        title: `Plan ${overrides.id}`,
        day_of_week: null,
        week_variant: 'A',
        assigned_date: null,
        program_id: PROG,
        workout_blocks: [],
        ...overrides,
    }
}

beforeAll(() => {
    vi.useFakeTimers()
    // 15:00 UTC ⇒ jueves 2026-09-03 en Santiago con y sin horario de verano.
    vi.setSystemTime(new Date(`${TODAY_ISO}T15:00:00.000Z`))
})

afterAll(() => {
    vi.useRealTimers()
})

beforeEach(() => {
    state.program = null
    state.plans = []
    state.logs = []
})

describe('getHeroComplianceBundle — weekly (identidad con la resolución previa al cursor)', () => {
    it('hoy jueves con plan del jueves ⇒ el hero toma ese plan y no hay "próximo"', async () => {
        const plans = [
            plan({ id: 'w-lun', day_of_week: 1, title: 'Empuje' }),
            plan({ id: 'w-jue', day_of_week: 4, title: 'Tirón', workout_blocks: [{ id: 'bj1', sets: 3 }] }),
            plan({ id: 'w-sab', day_of_week: 6, title: 'Pierna' }),
        ]
        state.plans = plans
        state.program = weeklyProgram(plans, {
            'w-jue': [{ id: 'bj1', sets: 3, reps: '10', exercise_id: 'e1', exercises: { id: 'e1', name: 'Remo' } }],
        })

        const { hero } = await getHeroComplianceBundle('u1', 'coach')

        expect(hero.hasWorkout).toBe(true)
        expect(hero.planId).toBe('w-jue')
        expect(hero.planTitle).toBe('Tirón')
        expect(hero.blocks).toEqual([{ id: 'bj1', sets: 3, reps: '10', exercise: { name: 'Remo' } }])
        expect(hero.totalSetsTarget).toBe(3)
        expect(hero.totalSetsLogged).toBe(0)
        expect(hero.isAlreadyLogged).toBe(false)
        expect(hero.nextWorkoutTitle).toBeNull()
        expect(hero.nextWorkoutDayLabel).toBeNull()
    })

    it('sin plan hoy ⇒ próximo = el siguiente ISODOW con plan (sin wrap) con su nombre largo', async () => {
        const plans = [
            plan({ id: 'w-lun', day_of_week: 1, title: 'Empuje' }),
            plan({ id: 'w-sab', day_of_week: 6, title: 'Pierna' }),
        ]
        state.plans = plans
        state.program = weeklyProgram(plans)

        const { hero } = await getHeroComplianceBundle('u1', 'coach')

        expect(hero.hasWorkout).toBe(false)
        expect(hero.planId).toBeNull()
        expect(hero.nextWorkoutTitle).toBe('Pierna')
        expect(hero.nextWorkoutDayLabel).toBe('Sábado')
    })

    it('el próximo cae mañana (viernes) ⇒ la etiqueta es "Mañana"', async () => {
        const plans = [plan({ id: 'w-vie', day_of_week: 5, title: 'Pierna' })]
        state.plans = plans
        state.program = weeklyProgram(plans)

        const { hero } = await getHeroComplianceBundle('u1', 'coach')

        expect(hero.nextWorkoutTitle).toBe('Pierna')
        expect(hero.nextWorkoutDayLabel).toBe('Mañana')
    })

    it('sólo días ya pasados ⇒ no hay próximo (la resolución weekly no envuelve a la semana siguiente)', async () => {
        const plans = [plan({ id: 'w-mar', day_of_week: 2, title: 'Empuje' })]
        state.plans = plans
        state.program = weeklyProgram(plans)

        const { hero } = await getHeroComplianceBundle('u1', 'coach')

        expect(hero.hasWorkout).toBe(false)
        expect(hero.nextWorkoutTitle).toBeNull()
        expect(hero.nextWorkoutDayLabel).toBeNull()
    })

    it('plan SUELTO con `assigned_date` de hoy manda sobre el día del programa', async () => {
        const plans = [
            plan({ id: 'w-jue', day_of_week: 4, title: 'Del programa' }),
            plan({ id: 'suelto', program_id: null, assigned_date: TODAY_ISO, title: 'Suelto de hoy', workout_blocks: [] }),
        ]
        state.plans = plans
        state.program = weeklyProgram(plans)

        const { hero } = await getHeroComplianceBundle('u1', 'coach')

        expect(hero.planId).toBe('suelto')
        expect(hero.planTitle).toBe('Suelto de hoy')
    })
})

describe('getHeroComplianceBundle — ciclo (fixture compartido del motor)', () => {
    /** Los 3 días del ciclo tal como los devuelve `getClientWorkoutPlans` (con su denominador). */
    const cyclePlans: PlanFixture[] = CYCLE_FIXTURE_PLANS.map((p) => ({
        id: p.id,
        title: p.title,
        day_of_week: p.day_of_week,
        week_variant: 'A',
        assigned_date: null,
        program_id: PROG,
        workout_blocks: (CYCLE_FIXTURE_BLOCKS[p.id] ?? []).map((b) => ({ id: b.id, sets: b.sets ?? null })),
    }))

    function cycleProgram() {
        return {
            id: PROG,
            name: 'Ciclo de 3',
            start_date: CYCLE_FIXTURE_PROGRAM.start_date,
            end_date: null,
            weeks_to_repeat: 1,
            ab_mode: false,
            program_phases: null,
            program_structure_type: CYCLE_FIXTURE_PROGRAM.program_structure_type,
            cycle_length: CYCLE_FIXTURE_PROGRAM.cycle_length,
            start_date_flexible: CYCLE_FIXTURE_PROGRAM.start_date_flexible,
            workout_plans: cyclePlans.map((p) => ({
                id: p.id,
                title: p.title,
                day_of_week: p.day_of_week,
                week_variant: p.week_variant,
                assigned_date: p.assigned_date,
                workout_blocks: (CYCLE_FIXTURE_BLOCKS[p.id] ?? []).map((b) => ({
                    id: b.id,
                    sets: b.sets ?? null,
                    reps: '10',
                    exercise_id: `e-${b.id}`,
                    exercises: { id: `e-${b.id}`, name: `Ejercicio ${b.id}` },
                })),
            })),
        }
    }

    /** 4 series (2 bloques × 2) cierran un día del fixture. */
    function dayLogs(planId: string, blockIds: [string, string], dateIso: string): LogFixture[] {
        return blockIds.flatMap((blockId, bi) =>
            [1, 2].map((setNumber) => ({
                id: `${blockId}-${setNumber}`,
                logged_at: `${dateIso}T1${5 + bi}:0${setNumber}:00.000Z`,
                block_id: blockId,
                set_number: setNumber,
                weight_kg: 20,
                reps_done: 10,
                workout_blocks: { plan_id: planId },
            }))
        )
    }

    it('sin logs en la ventana ⇒ hoy toca el Día 1 y el próximo es el Día 2', async () => {
        state.plans = cyclePlans
        state.program = cycleProgram()
        state.logs = []

        const { hero, cycle } = await getHeroComplianceBundle('u1', 'coach')

        expect(cycle.mode).toBe('cycle')
        expect(cycle.programState).toBe('active')
        expect(cycle.todayState).toBe('todo')
        expect(hero.planId).toBe('p1')
        expect(hero.planTitle).toBe('Empuje')
        expect(cycle.todayCycleIndex).toBe(1)
        expect(cycle.todayLabel).toBe('Día 1 de 3')
        expect(cycle.nextPlanId).toBe('p2')
        expect(cycle.nextCycleIndex).toBe(2)
        expect(cycle.nextLabel).toBe('Día 2 de 3')
        expect(cycle.slots.map((s) => [s.cycleIndex, s.state, s.shortLabel])).toEqual([
            [1, 'today', 'Día 1'],
            [2, 'upcoming', 'Día 2'],
            [3, 'upcoming', 'Día 3'],
        ])
    })

    it('días 1 y 2 cerrados martes y miércoles ⇒ hoy jueves toca el Día 3 (el ISODOW no participa)', async () => {
        state.plans = cyclePlans
        state.program = cycleProgram()
        state.logs = [
            ...dayLogs('p1', ['b1a', 'b1b'], '2026-09-01'),
            ...dayLogs('p2', ['b2a', 'b2b'], '2026-09-02'),
            // Ruido neutro: log huérfano y bloque de otro programa (R29).
            { id: 'n1', logged_at: `${CYCLE_FIXTURE_TODAY_ISO}T15:00:00.000Z`, block_id: null, set_number: 1, weight_kg: null, reps_done: null, workout_blocks: null },
            {
                id: 'n2',
                logged_at: `${CYCLE_FIXTURE_TODAY_ISO}T15:00:00.000Z`,
                block_id: 'otro-b1',
                set_number: 1,
                weight_kg: null,
                reps_done: null,
                workout_blocks: { plan_id: 'plan-de-otro-programa' },
            },
        ]

        const { hero, cycle } = await getHeroComplianceBundle('u1', 'coach')

        expect(hero.planId).toBe('p3')
        expect(hero.planTitle).toBe('Pierna')
        expect(hero.blocks).toHaveLength(2)
        expect(hero.totalSetsTarget).toBe(4)
        expect(cycle.todayCycleIndex).toBe(3)
        expect(cycle.todayState).toBe('todo')
        expect(cycle.todayLabel).toBe('Día 3 de 3')
        expect(cycle.nextPlanId).toBe('p1')
        expect(cycle.nextLabel).toBe('Día 1 de 3')
        expect(cycle.lastCompleted).toEqual({ planId: 'p2', cycleIndex: 2, dateIso: '2026-09-02' })
        expect(cycle.slots.map((s) => [s.cycleIndex, s.state, s.doneDateIso])).toEqual([
            [1, 'done', '2026-09-01'],
            [2, 'done', '2026-09-02'],
            [3, 'today', null],
        ])
    })

    it('empezó el Día 3 hoy y no lo cerró ⇒ in_progress y el cursor no adelanta', async () => {
        state.plans = cyclePlans
        state.program = cycleProgram()
        state.logs = [
            ...dayLogs('p1', ['b1a', 'b1b'], '2026-09-01'),
            ...dayLogs('p2', ['b2a', 'b2b'], '2026-09-02'),
            {
                id: 'x1',
                logged_at: `${CYCLE_FIXTURE_TODAY_ISO}T15:00:00.000Z`,
                block_id: 'b3a',
                set_number: 1,
                weight_kg: 20,
                reps_done: 10,
                workout_blocks: { plan_id: 'p3' },
            },
        ]

        const { hero, cycle } = await getHeroComplianceBundle('u1', 'coach')

        expect(cycle.todayState).toBe('in_progress')
        expect(hero.planId).toBe('p3')
        expect(hero.totalSetsLogged).toBe(1)
        expect(hero.isAlreadyLogged).toBe(false)
        expect(cycle.nextPlanId).toBe('p1')
    })

    it('cerró el Día 3 hoy ⇒ todayState done y el próximo vuelve al Día 1 (wrap)', async () => {
        state.plans = cyclePlans
        state.program = cycleProgram()
        state.logs = [
            ...dayLogs('p1', ['b1a', 'b1b'], '2026-09-01'),
            ...dayLogs('p2', ['b2a', 'b2b'], '2026-09-02'),
            ...dayLogs('p3', ['b3a', 'b3b'], CYCLE_FIXTURE_TODAY_ISO),
        ]

        const { hero, cycle } = await getHeroComplianceBundle('u1', 'coach')

        expect(cycle.todayState).toBe('done')
        expect(hero.planId).toBe('p3')
        expect(hero.isAlreadyLogged).toBe(true)
        expect(cycle.nextPlanId).toBe('p1')
        expect(cycle.nextCycleIndex).toBe(1)
        expect(cycle.slots.every((s) => s.state === 'done')).toBe(true)
    })

    it('ciclo con inicio flexible sin fecha ⇒ programState not_started y el Día 1 igual disponible', async () => {
        state.plans = cyclePlans
        state.program = { ...cycleProgram(), start_date: null, start_date_flexible: true }
        state.logs = []

        const { hero, cycle } = await getHeroComplianceBundle('u1', 'coach')

        expect(cycle.programState).toBe('not_started')
        expect(hero.planId).toBe('p1')
        expect(cycle.todayCycleIndex).toBe(1)
    })

    it('el anillo «Entrenos» no inventa meta semanal en ciclo (score null)', async () => {
        state.plans = cyclePlans
        state.program = cycleProgram()
        state.logs = dayLogs('p1', ['b1a', 'b1b'], '2026-09-01')

        const { scores } = await getHeroComplianceBundle('u1', 'coach')

        expect(scores.workoutScore).toBeNull()
    })
})
