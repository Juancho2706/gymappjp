import { describe, expect, it, vi } from 'vitest'
import { countActiveStandaloneClients } from './capacity.service'

// FUNDACION F3 (plan estrategia 06): countActiveStandaloneClients reusa el filtro canónico del cap
// gate de alta de alumno — coach_id=coachId + is_archived=false + org_id IS NULL (NO is_active),
// head:true + count:'exact'. Estos tests verifican el filtro EXACTO y el fallback count ?? 0.

// Builder encadenable que captura cada filtro aplicado y devuelve un count fijo al await.
function makeDb(count: number | null) {
    const calls: { eqs: Array<[string, unknown]>; iss: Array<[string, unknown]>; selectArgs: unknown[] } = {
        eqs: [],
        iss: [],
        selectArgs: [],
    }
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn((...args: unknown[]) => {
        calls.selectArgs = args
        return builder
    })
    builder.eq = vi.fn((col: string, val: unknown) => {
        calls.eqs.push([col, val])
        return builder
    })
    // .is(...) es el último eslabón → resuelve la promesa con { count }.
    builder.is = vi.fn((col: string, val: unknown) => {
        calls.iss.push([col, val])
        return Promise.resolve({ count, error: null })
    })
    const db = { from: vi.fn(() => builder) } as never
    return { db, calls, builder }
}

describe('countActiveStandaloneClients — filtro canónico standalone', () => {
    it('aplica coach_id + is_archived=false + org_id IS NULL con head/count exact', async () => {
        const { db, calls, builder } = makeDb(7)
        const n = await countActiveStandaloneClients(db, 'coach-1')
        expect(n).toBe(7)

        // consultó la tabla clients
        expect((db as unknown as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith(
            'clients'
        )
        // select('id', { count: 'exact', head: true }) — no trae filas
        expect((builder.select as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('id', {
            count: 'exact',
            head: true,
        })
        // filtros .eq exactos: coach_id y is_archived=false (NO is_active)
        expect(calls.eqs).toContainEqual(['coach_id', 'coach-1'])
        expect(calls.eqs).toContainEqual(['is_archived', false])
        expect(calls.eqs.find(([c]) => c === 'is_active')).toBeUndefined()
        // scope standalone: org_id IS NULL
        expect(calls.iss).toContainEqual(['org_id', null])
    })

    it('count null → 0 (fallback)', async () => {
        const { db } = makeDb(null)
        expect(await countActiveStandaloneClients(db, 'coach-1')).toBe(0)
    })

    it('count 0 → 0 (coach sin alumnos)', async () => {
        const { db } = makeDb(0)
        expect(await countActiveStandaloneClients(db, 'coach-1')).toBe(0)
    })
})
