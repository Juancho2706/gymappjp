/**
 * Fixtures de PARIDAD del ciclo (spec `docs/specs/ciclo-real-y-por-lado`, W0.2/W0.2b).
 *
 * UN solo programa de ciclo de 3 días con sus logs, consumido por los tres lados para que "hoy toca"
 * no pueda divergir entre plataformas:
 *   · `cycle-completions.test.ts` + `cycle-cursor.test.ts` (este paquete) — el contrato mismo, de
 *     punta a punta: los MISMOS logs entran a `buildCycleCompletions` y su salida alimenta a
 *     `resolveCycleCursor`.
 *   · web — tests del hero / la sección de programa (W2.7).
 *   · RN  — tests del home del alumno (W3.5 / W3.7b).
 * Cada app arma su propia entrada desde SUS queries y verifica que el resultado sea el del fixture;
 * si un adaptador pierde `sets`, `block_id` o `logged_at` por el camino, el caso falla ahí.
 *
 * Se exportan desde el índice del paquete (`@eva/workout-engine`) a propósito: los tsconfig de web y
 * mobile mapean UNA sola entrada para este paquete. Son datos inertes, sin dependencias.
 *
 * Calendario del fixture (todo en America/Santiago): `2026-09-01` martes · `2026-09-02` miércoles ·
 * `2026-09-03` jueves = HOY. Los `logged_at` van a mediodía UTC para que el día Santiago sea el mismo
 * con y sin horario de verano chileno; el caso del borde nocturno vive en `cycle-completions.test.ts`.
 */
import type { CycleCompletionLogRow } from './cycle-completions'
import type { CycleCompletion, CycleCursorPlan, CycleCursorProgram, CycleCursorResult } from './cycle-cursor'
import type { DayCompletionBlock } from './day-completion'

/** Ciclo de 3 días, fecha fija (no flexible) ⇒ `programState: 'active'`. */
export const CYCLE_FIXTURE_PROGRAM: CycleCursorProgram = {
    program_structure_type: 'cycle',
    cycle_length: 3,
    start_date: '2026-08-24',
    start_date_flexible: false,
}

/** Los tres días del ciclo. `day_of_week` es el ÍNDICE del ciclo, no el día de la semana. */
export const CYCLE_FIXTURE_PLANS: readonly CycleCursorPlan[] = [
    { id: 'p1', day_of_week: 1, title: 'Empuje' },
    { id: 'p2', day_of_week: 2, title: 'Tirón' },
    { id: 'p3', day_of_week: 3, title: 'Pierna' },
]

/** Dos bloques de 2 series por día ⇒ 4 series cierran un día. */
export const CYCLE_FIXTURE_BLOCKS: Readonly<Record<string, readonly DayCompletionBlock[]>> = {
    p1: [
        { id: 'b1a', sets: 2 },
        { id: 'b1b', sets: 2 },
    ],
    p2: [
        { id: 'b2a', sets: 2 },
        { id: 'b2b', sets: 2 },
    ],
    p3: [
        { id: 'b3a', sets: 2 },
        { id: 'b3b', sets: 2 },
    ],
}

/** Jueves — el día de la semana NO participa del cursor de ciclo. */
export const CYCLE_FIXTURE_TODAY_ISO = '2026-09-03'

/** Día 1 completo el martes (4/4 series). */
const DAY1_TUESDAY: readonly CycleCompletionLogRow[] = [
    { block_id: 'b1a', set_number: 1, logged_at: '2026-09-01T15:00:00.000Z', workout_blocks: { plan_id: 'p1' } },
    { block_id: 'b1a', set_number: 2, logged_at: '2026-09-01T15:05:00.000Z', workout_blocks: { plan_id: 'p1' } },
    { block_id: 'b1b', set_number: 1, logged_at: '2026-09-01T15:10:00.000Z', workout_blocks: { plan_id: 'p1' } },
    { block_id: 'b1b', set_number: 2, logged_at: '2026-09-01T15:15:00.000Z', workout_blocks: { plan_id: 'p1' } },
]

/** Día 2 completo el miércoles (4/4 series). */
const DAY2_WEDNESDAY: readonly CycleCompletionLogRow[] = [
    { block_id: 'b2a', set_number: 1, logged_at: '2026-09-02T15:00:00.000Z', workout_blocks: { plan_id: 'p2' } },
    { block_id: 'b2a', set_number: 2, logged_at: '2026-09-02T15:05:00.000Z', workout_blocks: { plan_id: 'p2' } },
    { block_id: 'b2b', set_number: 1, logged_at: '2026-09-02T15:10:00.000Z', workout_blocks: { plan_id: 'p2' } },
    { block_id: 'b2b', set_number: 2, logged_at: '2026-09-02T15:15:00.000Z', workout_blocks: { plan_id: 'p2' } },
]

/** Ruido que NO debe mover nada: log huérfano (R29) y log de un bloque de OTRO programa. */
const NEUTRAL_NOISE: readonly CycleCompletionLogRow[] = [
    { block_id: null, set_number: 1, logged_at: '2026-09-03T15:00:00.000Z', workout_blocks: null },
    { block_id: 'otro-programa-b1', set_number: 1, logged_at: '2026-09-03T15:00:00.000Z', workout_blocks: { plan_id: 'plan-de-otro-programa' } },
]

export interface CycleCursorFixture {
    /** Nombre del caso — se reutiliza como título del `it` en cada plataforma. */
    name: string
    program: CycleCursorProgram
    plans: readonly CycleCursorPlan[]
    blocksByPlan: Readonly<Record<string, readonly DayCompletionBlock[]>>
    logs: readonly CycleCompletionLogRow[]
    todayIso: string
    /** Salida esperada de `buildCycleCompletions` (`inProgress: null` = campo ausente). */
    expectedCompletions: readonly CycleCompletion[]
    expectedInProgress: { planId: string; dateIso: string } | null
    /** Salida esperada de `resolveCycleCursor` alimentado con lo anterior. */
    expectedCursor: CycleCursorResult
}

export const CYCLE_CURSOR_FIXTURES: readonly CycleCursorFixture[] = [
    {
        name: 'sin logs en la ventana => hoy toca el Día 1',
        program: CYCLE_FIXTURE_PROGRAM,
        plans: CYCLE_FIXTURE_PLANS,
        blocksByPlan: CYCLE_FIXTURE_BLOCKS,
        logs: [],
        todayIso: CYCLE_FIXTURE_TODAY_ISO,
        expectedCompletions: [],
        expectedInProgress: null,
        expectedCursor: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p1',
            todayCycleIndex: 1,
            todayState: 'todo',
            nextPlanId: 'p2',
            nextCycleIndex: 2,
            slots: [
                { planId: 'p1', cycleIndex: 1, state: 'today' },
                { planId: 'p2', cycleIndex: 2, state: 'upcoming' },
                { planId: 'p3', cycleIndex: 3, state: 'upcoming' },
            ],
        },
    },
    {
        name: 'días 1 y 2 cerrados martes y miércoles => hoy jueves toca el Día 3',
        program: CYCLE_FIXTURE_PROGRAM,
        plans: CYCLE_FIXTURE_PLANS,
        blocksByPlan: CYCLE_FIXTURE_BLOCKS,
        logs: [...DAY1_TUESDAY, ...DAY2_WEDNESDAY, ...NEUTRAL_NOISE],
        todayIso: CYCLE_FIXTURE_TODAY_ISO,
        expectedCompletions: [
            { planId: 'p1', dateIso: '2026-09-01' },
            { planId: 'p2', dateIso: '2026-09-02' },
        ],
        expectedInProgress: null,
        expectedCursor: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p3',
            todayCycleIndex: 3,
            todayState: 'todo',
            nextPlanId: 'p1',
            nextCycleIndex: 1,
            lastCompleted: { planId: 'p2', cycleIndex: 2, dateIso: '2026-09-02' },
            slots: [
                { planId: 'p1', cycleIndex: 1, state: 'done', doneDateIso: '2026-09-01' },
                { planId: 'p2', cycleIndex: 2, state: 'done', doneDateIso: '2026-09-02' },
                { planId: 'p3', cycleIndex: 3, state: 'today' },
            ],
        },
    },
    {
        name: 'empezó el Día 3 hoy y no lo cerró => in_progress, el cursor no adelanta',
        program: CYCLE_FIXTURE_PROGRAM,
        plans: CYCLE_FIXTURE_PLANS,
        blocksByPlan: CYCLE_FIXTURE_BLOCKS,
        logs: [
            ...DAY1_TUESDAY,
            ...DAY2_WEDNESDAY,
            { block_id: 'b3a', set_number: 1, logged_at: '2026-09-03T15:00:00.000Z', workout_blocks: { plan_id: 'p3' } },
        ],
        todayIso: CYCLE_FIXTURE_TODAY_ISO,
        expectedCompletions: [
            { planId: 'p1', dateIso: '2026-09-01' },
            { planId: 'p2', dateIso: '2026-09-02' },
        ],
        expectedInProgress: { planId: 'p3', dateIso: '2026-09-03' },
        expectedCursor: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p3',
            todayCycleIndex: 3,
            todayState: 'in_progress',
            nextPlanId: 'p1',
            nextCycleIndex: 1,
            lastCompleted: { planId: 'p2', cycleIndex: 2, dateIso: '2026-09-02' },
            slots: [
                { planId: 'p1', cycleIndex: 1, state: 'done', doneDateIso: '2026-09-01' },
                { planId: 'p2', cycleIndex: 2, state: 'done', doneDateIso: '2026-09-02' },
                { planId: 'p3', cycleIndex: 3, state: 'today' },
            ],
        },
    },
    {
        name: 'cerró el Día 3 hoy => done en el día hecho y el próximo vuelve al Día 1 (wrap)',
        program: CYCLE_FIXTURE_PROGRAM,
        plans: CYCLE_FIXTURE_PLANS,
        blocksByPlan: CYCLE_FIXTURE_BLOCKS,
        logs: [
            ...DAY1_TUESDAY,
            ...DAY2_WEDNESDAY,
            { block_id: 'b3a', set_number: 1, logged_at: '2026-09-03T15:00:00.000Z', workout_blocks: { plan_id: 'p3' } },
            { block_id: 'b3a', set_number: 2, logged_at: '2026-09-03T15:05:00.000Z', workout_blocks: { plan_id: 'p3' } },
            { block_id: 'b3b', set_number: 1, logged_at: '2026-09-03T15:10:00.000Z', workout_blocks: { plan_id: 'p3' } },
            { block_id: 'b3b', set_number: 2, logged_at: '2026-09-03T15:15:00.000Z', workout_blocks: { plan_id: 'p3' } },
        ],
        todayIso: CYCLE_FIXTURE_TODAY_ISO,
        expectedCompletions: [
            { planId: 'p1', dateIso: '2026-09-01' },
            { planId: 'p2', dateIso: '2026-09-02' },
            { planId: 'p3', dateIso: '2026-09-03' },
        ],
        expectedInProgress: null,
        expectedCursor: {
            mode: 'cycle',
            programState: 'active',
            todayPlanId: 'p3',
            todayCycleIndex: 3,
            todayState: 'done',
            nextPlanId: 'p1',
            nextCycleIndex: 1,
            lastCompleted: { planId: 'p3', cycleIndex: 3, dateIso: '2026-09-03' },
            slots: [
                { planId: 'p1', cycleIndex: 1, state: 'done', doneDateIso: '2026-09-01' },
                { planId: 'p2', cycleIndex: 2, state: 'done', doneDateIso: '2026-09-02' },
                { planId: 'p3', cycleIndex: 3, state: 'done', doneDateIso: '2026-09-03' },
            ],
        },
    },
] as const
