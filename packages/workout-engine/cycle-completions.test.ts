import { describe, expect, it } from 'vitest'

import { buildCycleCompletions, santiagoDayFromInstant, type CycleCompletionLogRow } from './cycle-completions'
import { CYCLE_CURSOR_FIXTURES } from './cycle-cursor.fixtures'
import { resolveCycleCursor, type CycleCursorPlan } from './cycle-cursor'
import type { DayCompletionBlock } from './day-completion'

const TODAY = '2026-09-03'
const YESTERDAY = '2026-09-02'

const PLANS: CycleCursorPlan[] = [
    { id: 'p1', day_of_week: 1, title: 'Empuje' },
    { id: 'p2', day_of_week: 2, title: 'Tirón' },
    { id: 'p3', day_of_week: 3, title: 'Pierna' },
]

const BLOCKS: Record<string, DayCompletionBlock[]> = {
    p1: [
        { id: 'b1a', sets: 2 },
        { id: 'b1b', sets: 2 },
    ],
    p2: [
        { id: 'b2a', sets: 2 },
        { id: 'b2b', sets: 2 },
    ],
    p3: [{ id: 'b3a', sets: 2 }],
}

/** Fila de la lectura única (R10): `plan_id` viaja por el join `workout_blocks(plan_id)`. */
function log(
    blockId: string | null,
    setNumber: number | null,
    loggedAt: string,
    planId: string | null,
    metadata?: CycleCompletionLogRow['metadata']
): CycleCompletionLogRow {
    return {
        block_id: blockId,
        set_number: setNumber,
        logged_at: loggedAt,
        workout_blocks: planId ? { plan_id: planId } : null,
        ...(metadata ? { metadata } : {}),
    }
}

/** Día completo del plan p1 (4/4 series) en la fecha dada, a mediodía UTC. */
function fullDayP1(dateIso: string): CycleCompletionLogRow[] {
    return [
        log('b1a', 1, `${dateIso}T15:00:00.000Z`, 'p1'),
        log('b1a', 2, `${dateIso}T15:05:00.000Z`, 'p1'),
        log('b1b', 1, `${dateIso}T15:10:00.000Z`, 'p1'),
        log('b1b', 2, `${dateIso}T15:15:00.000Z`, 'p1'),
    ]
}

describe('santiagoDayFromInstant — la fecha de la completitud (R11)', () => {
    it('mapea el instante UTC al día calendario de Santiago, no al prefijo UTC', () => {
        // 02:00 UTC del 4 son las 22:00/23:00 del 3 en Santiago (UTC-4 / UTC-3 con horario de verano).
        expect(santiagoDayFromInstant('2026-09-04T02:00:00.000Z')).toBe('2026-09-03')
        expect(santiagoDayFromInstant('2026-09-03T15:00:00.000Z')).toBe('2026-09-03')
    })

    it('acepta el timestamp con espacio de Postgres y devuelve tal cual un día calendario', () => {
        expect(santiagoDayFromInstant('2026-09-04 02:00:00+00')).toBe('2026-09-03')
        expect(santiagoDayFromInstant('2026-09-03')).toBe('2026-09-03')
    })

    it('valores basura => null (nunca "Invalid Date" ni una fecha inventada)', () => {
        expect(santiagoDayFromInstant(null)).toBeNull()
        expect(santiagoDayFromInstant(undefined)).toBeNull()
        expect(santiagoDayFromInstant('')).toBeNull()
        expect(santiagoDayFromInstant('no-es-fecha')).toBeNull()
    })
})

describe('buildCycleCompletions — productor único de la completitud del ciclo (R9)', () => {
    it('B1 · plan con todos sus bloques cubiertos ayer => una completitud fechada ayer', () => {
        const result = buildCycleCompletions({ plans: PLANS, blocksByPlan: BLOCKS, logs: fullDayP1(YESTERDAY), todayIso: TODAY })
        expect(result.completions).toEqual([{ planId: 'p1', dateIso: YESTERDAY }])
        expect(result.inProgress).toBeUndefined()
    })

    it('B2 · logs parciales de HOY => cero completitudes e inProgress de ese plan', () => {
        const logs = [log('b1a', 1, `${TODAY}T15:00:00.000Z`, 'p1')]
        const result = buildCycleCompletions({ plans: PLANS, blocksByPlan: BLOCKS, logs, todayIso: TODAY })
        expect(result.completions).toEqual([])
        expect(result.inProgress).toEqual({ planId: 'p1', dateIso: TODAY })
    })

    it('B3 · plan SIN bloques no participa: ni completitud ni inProgress (R9)', () => {
        const blocksByPlan = { ...BLOCKS, p2: [] as DayCompletionBlock[] }
        const logs = [log('b2a', 1, `${YESTERDAY}T15:00:00.000Z`, 'p2'), log('b2a', 2, `${TODAY}T15:00:00.000Z`, 'p2')]
        const result = buildCycleCompletions({ plans: PLANS, blocksByPlan, logs, todayIso: TODAY })
        expect(result.completions).toEqual([])
        expect(result.inProgress).toBeUndefined()
    })

    it('B4 · el log de anoche que en Santiago cae AYER se fecha ayer, no por el prefijo UTC', () => {
        const logs = [
            log('b1a', 1, '2026-09-04T02:00:00.000Z', 'p1'),
            log('b1a', 2, '2026-09-04T02:05:00.000Z', 'p1'),
            log('b1b', 1, '2026-09-04T02:10:00.000Z', 'p1'),
            log('b1b', 2, '2026-09-04T02:15:00.000Z', 'p1'),
        ]
        const result = buildCycleCompletions({ plans: PLANS, blocksByPlan: BLOCKS, logs, todayIso: '2026-09-04' })
        expect(result.completions).toEqual([{ planId: 'p1', dateIso: '2026-09-03' }])
    })

    it('B5 · editar un día pasado no lo mueve de fecha: manda el día del logged_at existente', () => {
        // El modo solo-UPDATE del `target_date` encolado pisa la fila YA existente de ese día sin
        // tocar su `logged_at` (`target_date` no es columna de `workout_logs`).
        const logs = fullDayP1('2026-08-28')
        const result = buildCycleCompletions({ plans: PLANS, blocksByPlan: BLOCKS, logs, todayIso: TODAY })
        expect(result.completions).toEqual([{ planId: 'p1', dateIso: '2026-08-28' }])
        expect(result.inProgress).toBeUndefined()
    })

    it('B6 · completitudes insertadas al revés: la salida va ordenada por FECHA, no por inserción', () => {
        const logs = [
            // El día 2 se registró primero (ayer) y el día 1 después, pero con fecha de anteayer.
            log('b2a', 1, `${YESTERDAY}T15:00:00.000Z`, 'p2'),
            log('b2a', 2, `${YESTERDAY}T15:05:00.000Z`, 'p2'),
            log('b2b', 1, `${YESTERDAY}T15:10:00.000Z`, 'p2'),
            log('b2b', 2, `${YESTERDAY}T15:15:00.000Z`, 'p2'),
            ...fullDayP1('2026-09-01'),
        ]
        const result = buildCycleCompletions({ plans: PLANS, blocksByPlan: BLOCKS, logs, todayIso: TODAY })
        expect(result.completions).toEqual([
            { planId: 'p1', dateIso: '2026-09-01' },
            { planId: 'p2', dateIso: YESTERDAY },
        ])
    })

    it('B7 · log huérfano (block_id null) es NEUTRO: no suma ni resta (R29)', () => {
        const withOrphan = [...fullDayP1(YESTERDAY), log(null, 1, `${TODAY}T15:00:00.000Z`, null)]
        const soloOrphan = [log(null, 1, `${TODAY}T15:00:00.000Z`, null)]
        expect(buildCycleCompletions({ plans: PLANS, blocksByPlan: BLOCKS, logs: withOrphan, todayIso: TODAY })).toEqual(
            buildCycleCompletions({ plans: PLANS, blocksByPlan: BLOCKS, logs: fullDayP1(YESTERDAY), todayIso: TODAY })
        )
        expect(buildCycleCompletions({ plans: PLANS, blocksByPlan: BLOCKS, logs: soloOrphan, todayIso: TODAY })).toEqual({
            completions: [],
        })
    })

    it('B8 · el log de un bloque de OTRO programa no cuenta para este ciclo', () => {
        const logs = [
            log('bloque-de-otro-programa', 1, `${YESTERDAY}T15:00:00.000Z`, 'plan-ajeno'),
            log('bloque-de-otro-programa', 2, `${YESTERDAY}T15:05:00.000Z`, 'plan-ajeno'),
        ]
        expect(buildCycleCompletions({ plans: PLANS, blocksByPlan: BLOCKS, logs, todayIso: TODAY })).toEqual({ completions: [] })
    })

    it('B9 · bloque OMITIDO: el día cierra igual (mismo veredicto que deriveDayCompletion)', () => {
        const logs = [
            log('b1a', 1, `${YESTERDAY}T15:00:00.000Z`, 'p1'),
            log('b1a', 2, `${YESTERDAY}T15:05:00.000Z`, 'p1'),
            log('b1b', null, `${YESTERDAY}T15:10:00.000Z`, 'p1', { skipped: true, skip_reason: 'machine_busy' }),
        ]
        const result = buildCycleCompletions({ plans: PLANS, blocksByPlan: BLOCKS, logs, todayIso: TODAY })
        expect(result.completions).toEqual([{ planId: 'p1', dateIso: YESTERDAY }])
    })

    it('dedup por (plan, día): la misma serie repetida por la cola offline no infla la completitud', () => {
        const logs = [...fullDayP1(YESTERDAY), ...fullDayP1(YESTERDAY)]
        const result = buildCycleCompletions({ plans: PLANS, blocksByPlan: BLOCKS, logs, todayIso: TODAY })
        expect(result.completions).toEqual([{ planId: 'p1', dateIso: YESTERDAY }])
    })

    it('el mismo plan cerrado en DOS días distintos produce DOS completitudes', () => {
        const logs = [...fullDayP1('2026-08-31'), ...fullDayP1(YESTERDAY)]
        const result = buildCycleCompletions({ plans: PLANS, blocksByPlan: BLOCKS, logs, todayIso: TODAY })
        expect(result.completions).toEqual([
            { planId: 'p1', dateIso: '2026-08-31' },
            { planId: 'p1', dateIso: YESTERDAY },
        ])
    })

    it('ventana de 30 días (R10): lo anterior no entra, y sin nada dentro el resultado es []', () => {
        const viejo = fullDayP1('2026-07-20')
        expect(buildCycleCompletions({ plans: PLANS, blocksByPlan: BLOCKS, logs: viejo, todayIso: TODAY })).toEqual({ completions: [] })
        // El borde exacto de 30 días SÍ entra.
        const borde = fullDayP1('2026-08-04')
        expect(buildCycleCompletions({ plans: PLANS, blocksByPlan: BLOCKS, logs: borde, todayIso: TODAY }).completions).toEqual([
            { planId: 'p1', dateIso: '2026-08-04' },
        ])
    })

    it('con más de 200 logs el productor no inventa días: sólo declara lo que vino', () => {
        // La lectura corta en 200 filas (R10): del día viejo llegan sólo 2 de sus 4 series.
        const truncado = [
            ...fullDayP1(YESTERDAY),
            log('b1a', 1, '2026-08-20T15:00:00.000Z', 'p1'),
            log('b1a', 2, '2026-08-20T15:05:00.000Z', 'p1'),
        ]
        const result = buildCycleCompletions({ plans: PLANS, blocksByPlan: BLOCKS, logs: truncado, todayIso: TODAY })
        expect(result.completions).toEqual([{ planId: 'p1', dateIso: YESTERDAY }])
    })

    it('función pura: dos invocaciones con la misma entrada dan salidas idénticas', () => {
        const input = { plans: PLANS, blocksByPlan: BLOCKS, logs: fullDayP1(YESTERDAY), todayIso: TODAY }
        expect(buildCycleCompletions(input)).toEqual(buildCycleCompletions(input))
    })
})

describe('fixtures compartidos — productor + cursor de punta a punta', () => {
    for (const fixture of CYCLE_CURSOR_FIXTURES) {
        it(fixture.name, () => {
            const produced = buildCycleCompletions({
                plans: fixture.plans,
                blocksByPlan: fixture.blocksByPlan,
                logs: fixture.logs,
                todayIso: fixture.todayIso,
            })
            expect(produced.completions).toEqual(fixture.expectedCompletions)
            expect(produced.inProgress ?? null).toEqual(fixture.expectedInProgress)

            const cursor = resolveCycleCursor({
                program: fixture.program,
                plans: fixture.plans,
                completions: produced.completions,
                inProgress: produced.inProgress ?? null,
                todayIso: fixture.todayIso,
            })
            expect(cursor).toEqual(fixture.expectedCursor)
        })
    }
})
