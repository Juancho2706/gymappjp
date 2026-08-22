import { describe, expect, it } from 'vitest'
import type { DbClient } from '@/infrastructure/db/interfaces'
import { artifactCutoff, readDemoSeededAt, resolveFirstArtifact } from './onboarding-v2.queries'

/**
 * Paso 3 de la guía («tu primer artefacto») — auditoría 22-08, W8.1.1: el alumno de ejemplo NO
 * cuenta. Lo que se prueba es la REGLA, no Postgres: un cliente falso registra la tabla y los
 * filtros de cada conteo y devuelve lo que el caso le dice.
 */

const SEEDED_AT = '2026-08-22T12:00:00.000Z'
const CUTOFF = '2026-08-22T12:02:00.000Z'
const COACH = 'coach-1'

type Filter = { op: 'eq' | 'gt' | 'or'; column: string; value: string }
type Call = { table: string; filters: Filter[] }

/** Qué devuelve cada conteo, según tabla y si lleva el corte del seed. */
type Counts = Partial<Record<string, { total: number; afterSeed?: number }>>

function fakeDb(counts: Counts, guide: unknown, calls: Call[] = []): DbClient {
    const from = (table: string) => {
        const call: Call = { table, filters: [] }
        calls.push(call)
        const q: Record<string, unknown> = {
            select: () => q,
            eq: (column: string, value: unknown) => {
                call.filters.push({ op: 'eq', column, value: String(value) })
                return q
            },
            gt: (column: string, value: unknown) => {
                call.filters.push({ op: 'gt', column, value: String(value) })
                return q
            },
            or: (expr: string) => {
                call.filters.push({ op: 'or', column: expr, value: '' })
                return q
            },
            maybeSingle: async () => ({
                data: table === 'coaches' ? { onboarding_guide: guide } : null,
                error: null,
            }),
            then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
                const spec = counts[table] ?? { total: 0 }
                const hasCutoff = call.filters.some((f) => f.op === 'gt' && f.column === 'updated_at')
                const count = hasCutoff ? (spec.afterSeed ?? 0) : spec.total
                return Promise.resolve({ count, data: null, error: null }).then(resolve, reject)
            },
        }
        return q
    }
    return { from } as unknown as DbClient
}

const SEEDED_GUIDE = { demo: { version: 1, seededAt: SEEDED_AT, clientId: 'demo-1' } }

describe('readDemoSeededAt / artifactCutoff', () => {
    it('lee seededAt del inventario y le suma los 2 minutos de margen', () => {
        expect(readDemoSeededAt(SEEDED_GUIDE)).toBe(SEEDED_AT)
        expect(artifactCutoff(SEEDED_AT)).toBe(CUTOFF)
    })

    it('sin inventario (other, demo borrado, coach viejo) no hay corte', () => {
        expect(readDemoSeededAt(null)).toBeNull()
        expect(readDemoSeededAt({})).toBeNull()
        expect(readDemoSeededAt({ demo: null })).toBeNull()
        expect(readDemoSeededAt({ demo: { seededAt: 'no-es-fecha' } })).toBeNull()
        expect(artifactCutoff(null)).toBeNull()
        expect(artifactCutoff('')).toBeNull()
    })
})

describe('resolveFirstArtifact — el alumno de ejemplo no cuenta', () => {
    it('fuerza: solo el programa sembrado ⇒ el paso 3 sigue pendiente', async () => {
        const calls: Call[] = []
        const db = fakeDb({ workout_programs: { total: 1, afterSeed: 0 } }, SEEDED_GUIDE, calls)
        expect(await resolveFirstArtifact(db, COACH, 'strength')).toBe(false)

        const programs = calls.find((c) => c.table === 'workout_programs')
        expect(programs?.filters).toEqual(
            expect.arrayContaining([
                { op: 'eq', column: 'coach_id', value: COACH },
                { op: 'gt', column: 'updated_at', value: CUTOFF },
            ])
        )
    })

    it('fuerza: un programa nuevo (aunque sea para el demo: la tarea guiada) ⇒ hecho', async () => {
        const db = fakeDb({ workout_programs: { total: 2, afterSeed: 1 } }, SEEDED_GUIDE)
        expect(await resolveFirstArtifact(db, COACH, 'strength')).toBe(true)
    })

    it('nutrición: la pauta sembrada EDITADA (updated_at después del seed) ⇒ hecho; intacta ⇒ pendiente', async () => {
        expect(
            await resolveFirstArtifact(fakeDb({ nutrition_plans_v2: { total: 1, afterSeed: 1 } }, SEEDED_GUIDE), COACH, 'nutrition')
        ).toBe(true)
        expect(
            await resolveFirstArtifact(fakeDb({ nutrition_plans_v2: { total: 1, afterSeed: 0 } }, SEEDED_GUIDE), COACH, 'nutrition')
        ).toBe(false)
    })

    it('rehab: el screening sembrado no cuenta, pero la pauta domiciliaria (programa) sí', async () => {
        const soloSeed = fakeDb(
            { movement_assessments: { total: 1, afterSeed: 0 }, workout_programs: { total: 1, afterSeed: 0 } },
            SEEDED_GUIDE
        )
        expect(await resolveFirstArtifact(soloSeed, COACH, 'rehab')).toBe(false)

        const conPauta = fakeDb(
            { movement_assessments: { total: 1, afterSeed: 0 }, workout_programs: { total: 2, afterSeed: 1 } },
            SEEDED_GUIDE
        )
        expect(await resolveFirstArtifact(conPauta, COACH, 'rehab')).toBe(true)
    })

    it('resistencia: el perfil cardio del demo no cuenta (is_demo = false en el conteo de alumnos)', async () => {
        const calls: Call[] = []
        const db = fakeDb({ clients: { total: 0 }, workout_programs: { total: 1, afterSeed: 0 } }, SEEDED_GUIDE, calls)
        expect(await resolveFirstArtifact(db, COACH, 'endurance')).toBe(false)

        const clients = calls.find((c) => c.table === 'clients')
        expect(clients?.filters).toEqual(
            expect.arrayContaining([
                { op: 'eq', column: 'is_archived', value: 'false' },
                { op: 'eq', column: 'is_demo', value: 'false' },
            ])
        )
    })

    it('resistencia: un alumno real con FC de reposo o marca de 5K ⇒ hecho', async () => {
        const db = fakeDb({ clients: { total: 1 }, workout_programs: { total: 1, afterSeed: 0 } }, SEEDED_GUIDE)
        expect(await resolveFirstArtifact(db, COACH, 'endurance')).toBe(true)
    })

    it('sin demo sembrado (other / persona null) se cuenta todo, como siempre', async () => {
        const calls: Call[] = []
        const db = fakeDb({ workout_programs: { total: 1 }, nutrition_plans_v2: { total: 0 } }, {}, calls)
        expect(await resolveFirstArtifact(db, COACH, 'other')).toBe(true)
        expect(calls.some((c) => c.filters.some((f) => f.op === 'gt'))).toBe(false)

        expect(
            await resolveFirstArtifact(fakeDb({ workout_programs: { total: 0 }, nutrition_plans_v2: { total: 1 } }, null), COACH, null)
        ).toBe(true)
        expect(
            await resolveFirstArtifact(fakeDb({ workout_programs: { total: 0 }, nutrition_plans_v2: { total: 0 } }, null), COACH, null)
        ).toBe(false)
    })
})
