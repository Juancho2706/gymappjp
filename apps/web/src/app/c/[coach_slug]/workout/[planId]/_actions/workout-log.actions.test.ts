import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Unit de resiliencia del guardado de series (informe forense WA-2, 2026-07-07):
 *
 *  1. Auth por `getClaims()` (verificación local ES256), NO `getUser()` — la red mala del gimnasio
 *     hacía fallar el round-trip a GoTrue por CADA serie → "No autenticado" espurio.
 *  2. Idempotencia ante la carrera flush-vs-submit: cuando el índice único
 *     `workout_logs_one_set_per_day` rechaza el segundo INSERT concurrente con 23505, el action NO
 *     devuelve error — re-SELECT la fila ganadora y hace UPDATE (last-wins). Backward-compatible:
 *     sin el índice aplicado el 23505 no ocurre y el flujo es el de siempre.
 */

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    revalidatePathMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock,
}))

vi.mock('next/cache', () => ({
    revalidatePath: revalidatePathMock,
}))

import { logSetAction } from './workout-log.actions'

// UUID RFC 4122 válido (versión 4, variante 8): `z.string().uuid()` de Zod v4 rechaza los que no
// cumplen los nibbles de versión/variante (gotcha de seeds no-RFC del repo).
const BLOCK_ID = '11111111-1111-4111-8111-111111111111'

type EqCall = [string, unknown]

/**
 * Builder thenable de `workout_logs` que sirve a las 3 operaciones que encadena el action en una
 * misma invocación (select existentes → insert/update → re-select ganador → update). `from()`
 * devuelve SIEMPRE esta instancia; cada método de arranque (select/insert/update/delete) fija el
 * resultado que resolverá el `await` siguiente. Los SELECT consumen una cola en orden.
 */
function makeWorkoutLogsMock(opts: {
    selectResults: Array<{ data: Array<{ id: string }> | null }>
    insertResult?: { error: { code?: string; message?: string } | null }
    updateResult?: { error: { code?: string; message?: string } | null }
}) {
    const selectQueue = [...opts.selectResults]
    const inserts: Array<Record<string, unknown>> = []
    const updates: Array<Record<string, unknown>> = []
    const deletes: Array<{ col: string; ids: unknown }> = []
    const eqCalls: EqCall[] = []
    let pending: Promise<unknown> = Promise.resolve({ data: [] })

    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
        select: vi.fn(() => {
            pending = Promise.resolve(selectQueue.shift() ?? { data: [] })
            return builder
        }),
        insert: vi.fn((payload: Record<string, unknown>) => {
            inserts.push(payload)
            pending = Promise.resolve(opts.insertResult ?? { error: null })
            return builder
        }),
        update: vi.fn((payload: Record<string, unknown>) => {
            updates.push(payload)
            pending = Promise.resolve(opts.updateResult ?? { error: null })
            return builder
        }),
        delete: vi.fn(() => {
            pending = Promise.resolve({ error: null })
            return builder
        }),
        eq: vi.fn((col: string, val: unknown) => {
            eqCalls.push([col, val])
            return builder
        }),
        in: vi.fn((col: string, ids: unknown) => {
            deletes.push({ col, ids })
            return builder
        }),
        gte: vi.fn(() => builder),
        lt: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            pending.then(resolve, reject),
    })
    return { builder, inserts, updates, deletes, eqCalls }
}

function wireSupabase(logs: ReturnType<typeof makeWorkoutLogsMock>, sub: string | null = 'client-1') {
    const supabase = {
        auth: {
            getClaims: vi.fn().mockResolvedValue({ data: sub ? { claims: { sub } } : { claims: {} } }),
            // getUser NO debe usarse — si el action lo llamara, este mock lo delataría.
            getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        },
        from: vi.fn((table: string) => {
            if (table === 'workout_logs') return logs.builder
            throw new Error(`Unexpected table: ${table}`)
        }),
    }
    createClientMock.mockResolvedValue(supabase)
    return supabase
}

function buildForm() {
    const f = new FormData()
    f.set('block_id', BLOCK_ID)
    f.set('set_number', '1')
    f.set('weight_kg', '50')
    f.set('reps_done', '10')
    return f
}

describe('logSetAction — resiliencia WA-2', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('autentica con getClaims(), no con getUser()', async () => {
        const logs = makeWorkoutLogsMock({ selectResults: [{ data: [] }] })
        const supabase = wireSupabase(logs, 'client-1')

        const result = await logSetAction({}, buildForm())

        expect(result.success).toBe(true)
        expect(supabase.auth.getClaims).toHaveBeenCalledTimes(1)
        expect(supabase.auth.getUser).not.toHaveBeenCalled()
        // client_id resuelto desde el claim `sub`.
        expect(logs.inserts[0]).toMatchObject({ client_id: 'client-1', block_id: BLOCK_ID, set_number: 1 })
    })

    it('claim sin sub ⇒ no autenticado', async () => {
        const logs = makeWorkoutLogsMock({ selectResults: [{ data: [] }] })
        wireSupabase(logs, null)

        const result = await logSetAction({}, buildForm())

        expect(result).toEqual({ error: 'No autenticado.', code: 'unauthenticated' })
        expect(logs.inserts).toHaveLength(0)
    })

    it('sin fila previa ⇒ INSERT limpio y success', async () => {
        const logs = makeWorkoutLogsMock({ selectResults: [{ data: [] }], insertResult: { error: null } })
        wireSupabase(logs)

        const result = await logSetAction({}, buildForm())

        expect(result.success).toBe(true)
        expect(logs.inserts).toHaveLength(1)
        expect(logs.updates).toHaveLength(0)
    })

    it('carrera flush-vs-submit: INSERT 23505 ⇒ re-SELECT ganador + UPDATE (last-wins), sin error', async () => {
        const logs = makeWorkoutLogsMock({
            selectResults: [
                { data: [] },                 // 1er SELECT: nadie vio la fila (carrera)
                { data: [{ id: 'winner-1' }] }, // re-SELECT tras el 23505: la fila que sí entró
            ],
            insertResult: { error: { code: '23505', message: 'duplicate key value' } },
            updateResult: { error: null },
        })
        wireSupabase(logs)

        const result = await logSetAction({}, buildForm())

        expect(result.success).toBe(true)
        expect(result.error).toBeUndefined()
        // El INSERT se intentó y falló; el UPDATE last-wins cae sobre la fila ganadora.
        expect(logs.inserts).toHaveLength(1)
        expect(logs.updates).toHaveLength(1)
        expect(logs.eqCalls).toContainEqual(['id', 'winner-1'])
    })

    it('23505 pero la fila ganadora no aparece en la ventana ⇒ éxito silencioso (no loop)', async () => {
        const logs = makeWorkoutLogsMock({
            selectResults: [
                { data: [] }, // 1er SELECT
                { data: [] }, // re-SELECT vacío (borde de día / RLS)
            ],
            insertResult: { error: { code: '23505', message: 'duplicate key value' } },
        })
        wireSupabase(logs)

        const result = await logSetAction({}, buildForm())

        expect(result.success).toBe(true)
        expect(logs.updates).toHaveLength(0)
    })

    it('INSERT con error NO-23505 (ej. FK 23503) ⇒ se propaga como invalid_block', async () => {
        const logs = makeWorkoutLogsMock({
            selectResults: [{ data: [] }],
            insertResult: { error: { code: '23503', message: 'fk violation' } },
        })
        wireSupabase(logs)

        const result = await logSetAction({}, buildForm())

        expect(result.code).toBe('invalid_block')
        expect(logs.updates).toHaveLength(0)
    })

    it('fila previa presente ⇒ UPDATE + purga de duplicados sobrantes (regresión del upsert)', async () => {
        const logs = makeWorkoutLogsMock({
            selectResults: [{ data: [{ id: 'a' }, { id: 'b' }] }],
            updateResult: { error: null },
        })
        wireSupabase(logs)

        const result = await logSetAction({}, buildForm())

        expect(result.success).toBe(true)
        expect(logs.inserts).toHaveLength(0)
        expect(logs.updates).toHaveLength(1)
        expect(logs.eqCalls).toContainEqual(['id', 'a'])
        expect(logs.deletes).toContainEqual({ col: 'id', ids: ['b'] })
    })
})
