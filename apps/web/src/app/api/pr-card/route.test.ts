import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * W4.8 (`specs/cuenta-atras-en-pantalla`) — la curva de la PR-card ignora las series de FUERZA POR
 * TIEMPO. Una plancha con disco guarda `weight_kg = 10` y `reps_done = NULL` (contrato R2), así que
 * el filtro histórico —solo `weight_kg IS NOT NULL`— la habría listado como récord «10 kg × 0 reps».
 * Es el cliente hermano de la migración M2 sobre `get_client_exercise_prs`: los dos caminos que
 * publican récords tienen que decidir igual (A4).
 *
 * El stub de PostgREST APLICA los filtros de verdad sobre las filas del caso, así que el test no
 * afirma «se llamó `.gt`» sino el efecto observable: la fila del hold no llega a la reducción.
 */

const harness = vi.hoisted(() => {
    const CLIENT_ID = '33333333-3333-4333-8333-333333333333'
    const EXERCISE_ID = '44444444-4444-4444-8444-444444444444'
    type LogRow = { weight_kg: number | null; reps_done: number | null; logged_at: string }
    const state = {
        rows: [] as LogRow[],
        /** Filas que sobrevivieron los filtros del select (lo que llega a `reducePrFromRows`). */
        served: [] as LogRow[],
        /** Registro de los filtros aplicados, para dejar constancia del contrato PostgREST. */
        filters: [] as string[],
    }

    /** Builder thenable mínimo de PostgREST: `select().eq().not().gt().order().limit()` ⇒ `{ data }`. */
    function workoutLogsBuilder() {
        let rows = [...state.rows]
        const builder: Record<string, unknown> = {}
        Object.assign(builder, {
            select: () => builder,
            eq: () => builder,
            not: (col: string, op: string) => {
                state.filters.push(`not:${col}:${op}`)
                if (col === 'weight_kg') rows = rows.filter((r) => r.weight_kg != null)
                return builder
            },
            gt: (col: string, value: number) => {
                state.filters.push(`gt:${col}:${value}`)
                // `NULL > 0` es NULL en SQL ⇒ la fila se descarta (misma semántica que PostgREST).
                if (col === 'reps_done') rows = rows.filter((r) => r.reps_done != null && r.reps_done > value)
                return builder
            },
            order: () => builder,
            limit: () => {
                state.served = rows
                return Promise.resolve({ data: rows })
            },
        })
        return builder
    }

    const adminStub = {
        from: (table: string) => {
            if (table === 'workout_logs') return workoutLogsBuilder()
            if (table === 'exercises') {
                return {
                    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Plancha frontal' } }) }) }),
                }
            }
            if (table === 'clients') {
                return {
                    select: () => ({
                        eq: () => ({ maybeSingle: async () => ({ data: { coach_id: 'coach-1', team_id: null, org_id: null } }) }),
                    }),
                }
            }
            return {
                select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
            }
        },
    }

    const serverStub = {
        auth: { getClaims: async () => ({ data: { claims: { sub: CLIENT_ID } } }) },
    }

    return { CLIENT_ID, EXERCISE_ID, state, adminStub, serverStub }
})

const { CLIENT_ID, EXERCISE_ID, state } = harness

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => harness.serverStub }))
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => harness.adminStub }))
vi.mock('@/services/client/client-scope.service', () => ({ assertCoachClientReadAccess: async () => undefined }))
// `next/og` levanta satori + wasm: acá solo interesa QUÉ datos entran a la imagen, no el PNG.
vi.mock('next/og', () => ({
    ImageResponse: class {
        status = 200
        constructor(public element: unknown) {}
    },
}))

import { GET } from './route'

function request() {
    return new Request(
        `https://app.test/api/pr-card?exerciseId=${EXERCISE_ID}&clientId=${CLIENT_ID}`,
    ) as unknown as Parameters<typeof GET>[0]
}

beforeEach(() => {
    vi.clearAllMocks()
    state.rows = []
    state.served = []
    state.filters = []
    // Las fuentes de Google son best-effort dentro de un try/catch: se cortan para no tocar la red.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sin red en test')))
})

describe('GET /api/pr-card — la curva ignora la fuerza por tiempo (W4.8)', () => {
    it('un log {weight_kg: 10, reps_done: null} NO entra a la serie ⇒ sin récord que mostrar', async () => {
        state.rows = [{ weight_kg: 10, reps_done: null, logged_at: '2026-09-01T12:00:00.000Z' }]

        const res = await GET(request())

        expect(state.filters).toContain('gt:reps_done:0')
        expect(state.served).toHaveLength(0)
        // Sin filas la reducción devuelve null y el endpoint responde 404 en vez de publicar
        // «10 kg × 0 reps» como récord personal.
        expect(res.status).toBe(404)
    })

    it('la misma serie CON reps sí entra (anti-regresión del filtro)', async () => {
        state.rows = [{ weight_kg: 10, reps_done: 8, logged_at: '2026-09-01T12:00:00.000Z' }]

        const res = await GET(request())

        expect(state.served).toHaveLength(1)
        expect(res.status).toBe(200)
    })

    it('con holds y levantamientos mezclados, el récord sale de los levantamientos', async () => {
        state.rows = [
            { weight_kg: 60, reps_done: 5, logged_at: '2026-08-01T12:00:00.000Z' },
            // Hold de 90 kg: pesa más que cualquier levantamiento y no debe ganar la curva.
            { weight_kg: 90, reps_done: null, logged_at: '2026-08-15T12:00:00.000Z' },
            { weight_kg: 70, reps_done: 5, logged_at: '2026-09-01T12:00:00.000Z' },
        ]

        const res = await GET(request())

        expect(state.served.map((r) => r.weight_kg)).toEqual([60, 70])
        expect(res.status).toBe(200)
    })
})
