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

const { createClientMock, revalidatePathMock, captureEventMock } = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    captureEventMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock,
}))

vi.mock('next/cache', () => ({
    revalidatePath: revalidatePathMock,
}))

vi.mock('@/lib/posthog/server-capture', () => ({
    capturePostHogServerEvent: captureEventMock,
}))

import { logSetAction } from './workout-log.actions'
// Mismo "hoy Santiago" que resuelve el action (función pura, sin mock): así el caso
// `target_date == HOY` no depende de congelar el reloj del runner.
import { getTodayInSantiago } from '@/lib/date-utils'

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

/** Programa que cuelga del bloque, tal como lo lee el auto-start (W2.4). `null` = plan suelto. */
type ProgramRow = {
    id: string
    start_date: string | null
    start_date_flexible: boolean | null
    program_structure_type: string | null
} | null

type RpcResult = { data: unknown; error: { message: string; code?: string } | null }

/**
 * `workout_blocks` para el auto-start: `select(...).eq(...).maybeSingle()` con el programa anidado.
 * Cada `maybeSingle` consume la cola `programs` (así se modela «la 2ª serie ya ve la fecha escrita»).
 */
function makeBlocksMock(programs: ProgramRow[], throwOnRead = false) {
    const queue = [...programs]
    let last: ProgramRow = null
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => {
            if (throwOnRead) throw new Error('read failed')
            last = queue.length > 0 ? (queue.shift() as ProgramRow) : last
            return { data: last ? { workout_plans: { workout_programs: last } } : null }
        }),
    })
    return builder
}

function wireSupabase(
    logs: ReturnType<typeof makeWorkoutLogsMock>,
    sub: string | null = 'client-1',
    auto: { programs?: ProgramRow[]; rpc?: RpcResult; throwOnRead?: boolean } = {},
) {
    // Sin `programs` el bloque no cuelga de ningún programa ⇒ el auto-start no hace nada (default
    // de todos los tests previos, que no conocen esta capa).
    const blocks = makeBlocksMock(auto.programs ?? [null], auto.throwOnRead ?? false)
    const rpc = vi.fn().mockResolvedValue(auto.rpc ?? { data: [], error: null })
    const supabase = {
        auth: {
            getClaims: vi.fn().mockResolvedValue({ data: sub ? { claims: { sub } } : { claims: {} } }),
            // getUser NO debe usarse — si el action lo llamara, este mock lo delataría.
            getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        },
        rpc,
        from: vi.fn((table: string) => {
            if (table === 'workout_logs') return logs.builder
            if (table === 'workout_blocks') return blocks
            throw new Error(`Unexpected table: ${table}`)
        }),
    }
    createClientMock.mockResolvedValue(supabase)
    return Object.assign(supabase, { rpc })
}

function buildForm() {
    const f = new FormData()
    f.set('block_id', BLOCK_ID)
    f.set('set_number', '1')
    f.set('weight_kg', '50')
    f.set('reps_done', '10')
    return f
}

function buildFormWithTarget(targetDate: string) {
    const f = buildForm()
    f.set('target_date', targetDate)
    return f
}

// Fechas deterministas respecto del reloj real del runner: '2020-01-01' es SIEMPRE pasado y
// '2999-12-31' SIEMPRE futuro, así que no dependen de `getTodayInSantiago()` congelado.
const PAST_DATE = '2020-01-01'
const FUTURE_DATE = '2999-12-31'
const TODAY_DATE = getTodayInSantiago().iso

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

describe('logSetAction — edición de día pasado (target_date, E1.5)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('target_date + fila existente ⇒ SOLO-UPDATE (jamás INSERT)', async () => {
        const logs = makeWorkoutLogsMock({
            selectResults: [{ data: [{ id: 'past-row' }] }],
            updateResult: { error: null },
        })
        wireSupabase(logs)

        const result = await logSetAction({}, buildFormWithTarget(PAST_DATE))

        expect(result.success).toBe(true)
        expect(logs.updates).toHaveLength(1)
        expect(logs.inserts).toHaveLength(0)
        expect(logs.eqCalls).toContainEqual(['id', 'past-row'])
    })

    it('target_date + fila inexistente ⇒ past_set_not_found, NUNCA inserta', async () => {
        const logs = makeWorkoutLogsMock({ selectResults: [{ data: [] }] })
        wireSupabase(logs)

        const result = await logSetAction({}, buildFormWithTarget(PAST_DATE))

        expect(result).toEqual({
            error: 'Esta serie no se registró ese día. Usa "Repetir hoy" para completarla.',
            code: 'past_set_not_found',
        })
        expect(logs.inserts).toHaveLength(0)
        expect(logs.updates).toHaveLength(0)
    })

    it('target_date futuro ⇒ rechazado (validation), sin tocar workout_logs', async () => {
        const logs = makeWorkoutLogsMock({ selectResults: [{ data: [] }] })
        wireSupabase(logs)

        const result = await logSetAction({}, buildFormWithTarget(FUTURE_DATE))

        expect(result).toEqual({ error: 'Fecha inválida.', code: 'validation' })
        expect(logs.inserts).toHaveLength(0)
        expect(logs.updates).toHaveLength(0)
    })

    it('target_date con formato inválido ⇒ rechazado (validation)', async () => {
        const logs = makeWorkoutLogsMock({ selectResults: [{ data: [] }] })
        wireSupabase(logs)

        const result = await logSetAction({}, buildFormWithTarget('2026/07/20'))

        expect(result).toEqual({ error: 'Fecha inválida.', code: 'validation' })
        expect(logs.inserts).toHaveLength(0)
    })

    /**
     * Incidente 2026-07-26 (alumno perdió series): un día recuperado quedaba atribuido a HOY, el sheet
     * "Revisar y editar" linkeaba a `?fecha=<hoy>` y el modo solo-UPDATE rechazaba TODA serie nueva con
     * `past_set_not_found` (fallo permanente ⇒ la cola offline la descartaba). `target_date == HOY`
     * debe degradar al upsert normal de hoy; el anti-farmeo sigue vivo SÓLO para fechas pasadas.
     */
    it('target_date == HOY + sin fila previa ⇒ INSERT normal (nunca past_set_not_found)', async () => {
        const logs = makeWorkoutLogsMock({ selectResults: [{ data: [] }], insertResult: { error: null } })
        wireSupabase(logs)

        const result = await logSetAction({}, buildFormWithTarget(TODAY_DATE))

        expect(result.success).toBe(true)
        expect(result.code).toBeUndefined()
        expect(logs.inserts).toHaveLength(1)
        expect(logs.inserts[0]).toMatchObject({ client_id: 'client-1', block_id: BLOCK_ID, set_number: 1 })
        expect(logs.updates).toHaveLength(0)
    })

    it('target_date == HOY + fila existente ⇒ UPDATE sobre esa fila (upsert de hoy)', async () => {
        const logs = makeWorkoutLogsMock({
            selectResults: [{ data: [{ id: 'today-row' }] }],
            updateResult: { error: null },
        })
        wireSupabase(logs)

        const result = await logSetAction({}, buildFormWithTarget(TODAY_DATE))

        expect(result.success).toBe(true)
        expect(logs.inserts).toHaveLength(0)
        expect(logs.updates).toHaveLength(1)
        expect(logs.eqCalls).toContainEqual(['id', 'today-row'])
    })

    it('target_date + duplicados ⇒ UPDATE al más reciente + purga (misma semántica que hoy)', async () => {
        const logs = makeWorkoutLogsMock({
            selectResults: [{ data: [{ id: 'keep' }, { id: 'dupe' }] }],
            updateResult: { error: null },
        })
        wireSupabase(logs)

        const result = await logSetAction({}, buildFormWithTarget(PAST_DATE))

        expect(result.success).toBe(true)
        expect(logs.inserts).toHaveLength(0)
        expect(logs.updates).toHaveLength(1)
        expect(logs.eqCalls).toContainEqual(['id', 'keep'])
        expect(logs.deletes).toContainEqual({ col: 'id', ids: ['dupe'] })
    })
})

/**
 * W2.3 (tren «ciclo real y por lado»): `metadata` dejó de escribirse como `?? null`. La key sólo
 * viaja cuando el payload la trae; si no viene, el UPDATE no la toca y el jsonb sobrevive.
 */
describe('logSetAction — metadata: la key se OMITE cuando no viene (W2.3)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    function buildFormWithMetadata(metadata: Record<string, unknown>) {
        const f = buildForm()
        f.set('metadata', JSON.stringify(metadata))
        return f
    }

    it('re-guardar una serie de movilidad SIN metadata no borra {left_sec, right_sec}', async () => {
        const logs = makeWorkoutLogsMock({
            selectResults: [{ data: [{ id: 'mobility-row' }] }],
            updateResult: { error: null },
        })
        wireSupabase(logs)

        const result = await logSetAction({}, buildForm())

        expect(result.success).toBe(true)
        expect(logs.updates).toHaveLength(1)
        // Sin la key el UPDATE no toca la columna: el hold por lado ya persistido queda intacto.
        expect(Object.keys(logs.updates[0])).not.toContain('metadata')
    })

    it('el INSERT tampoco estampa metadata: null cuando el payload no la trae', async () => {
        const logs = makeWorkoutLogsMock({ selectResults: [{ data: [] }], insertResult: { error: null } })
        wireSupabase(logs)

        const result = await logSetAction({}, buildForm())

        expect(result.success).toBe(true)
        expect(Object.keys(logs.inserts[0])).not.toContain('metadata')
    })

    it('mandar {left_reps: 10, right_reps: null} SÍ vacía ese lado (escritura explícita)', async () => {
        const logs = makeWorkoutLogsMock({
            selectResults: [{ data: [{ id: 'strength-row' }] }],
            updateResult: { error: null },
        })
        wireSupabase(logs)

        const result = await logSetAction({}, buildFormWithMetadata({ left_reps: 10, right_reps: null }))

        expect(result.success).toBe(true)
        expect(logs.updates[0]).toMatchObject({ metadata: { left_reps: 10, right_reps: null } })
    })

    it('los dos lados de fuerza viajan enteros al jsonb', async () => {
        const logs = makeWorkoutLogsMock({ selectResults: [{ data: [] }], insertResult: { error: null } })
        wireSupabase(logs)

        await logSetAction({}, buildFormWithMetadata({ left_reps: 12, right_reps: 10 }))

        expect(logs.inserts[0]).toMatchObject({ metadata: { left_reps: 12, right_reps: 10 } })
    })

    it('metadata con JSON inválido se ignora ⇒ la key tampoco viaja (no pisa el jsonb existente)', async () => {
        const logs = makeWorkoutLogsMock({
            selectResults: [{ data: [{ id: 'row' }] }],
            updateResult: { error: null },
        })
        wireSupabase(logs)
        const f = buildForm()
        f.set('metadata', '{no es json')

        const result = await logSetAction({}, f)

        expect(result.success).toBe(true)
        expect(Object.keys(logs.updates[0])).not.toContain('metadata')
    })
})

/**
 * W2.4: auto-start del programa de inicio flexible. La primera serie fija la fecha vía RPC (sin
 * `p_start_date`: NULL ⇒ hoy, R14) y emite `program_started_by_client {via:'auto'}` sólo con
 * `started = true` (R23). Nunca bloquea el guardado de la serie.
 */
describe('logSetAction — auto-start del programa flexible (W2.4)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    const FLEXIBLE_SIN_FECHA = {
        id: 'prog-1',
        start_date: null,
        start_date_flexible: true,
        program_structure_type: 'cycle',
    }

    function freshLogs() {
        return makeWorkoutLogsMock({ selectResults: [{ data: [] }], insertResult: { error: null } })
    }

    it('A1+A7: flexible sin fecha ⇒ RPC UNA vez sin p_start_date + evento via:auto', async () => {
        const logs = freshLogs()
        const supabase = wireSupabase(logs, 'client-1', {
            programs: [FLEXIBLE_SIN_FECHA],
            rpc: { data: [{ start_date: '2026-09-03', end_date: '2026-09-30', started: true }], error: null },
        })

        const result = await logSetAction({}, buildForm())

        expect(result.success).toBe(true)
        expect(supabase.rpc).toHaveBeenCalledTimes(1)
        expect(supabase.rpc.mock.calls[0][0]).toBe('client_start_workout_program')
        expect(supabase.rpc.mock.calls[0][1]).toEqual({ p_program_id: 'prog-1' })
        expect(supabase.rpc.mock.calls[0][1]).not.toHaveProperty('p_start_date')
        expect(captureEventMock).toHaveBeenCalledTimes(1)
        expect(captureEventMock).toHaveBeenCalledWith({
            event: 'program_started_by_client',
            distinctId: 'client-1',
            properties: { program_id: 'prog-1', structure: 'cycle', via: 'auto' },
        })
    })

    it('A2: la segunda serie ya ve la fecha escrita ⇒ la RPC no vuelve a llamarse ni emite evento', async () => {
        const logs = freshLogs()
        const supabase = wireSupabase(logs, 'client-1', {
            programs: [FLEXIBLE_SIN_FECHA, { ...FLEXIBLE_SIN_FECHA, start_date: '2026-09-03' }],
            rpc: { data: [{ start_date: '2026-09-03', end_date: '2026-09-30', started: true }], error: null },
        })

        await logSetAction({}, buildForm())
        await logSetAction({}, buildForm())

        expect(supabase.rpc).toHaveBeenCalledTimes(1)
        expect(captureEventMock).toHaveBeenCalledTimes(1)
    })

    it('A2b: si dos series compiten, la que recibe started:false NO emite un segundo evento', async () => {
        const logs = freshLogs()
        wireSupabase(logs, 'client-1', {
            programs: [FLEXIBLE_SIN_FECHA],
            rpc: { data: [{ start_date: '2026-09-03', end_date: '2026-09-30', started: false }], error: null },
        })

        const result = await logSetAction({}, buildForm())

        expect(result.success).toBe(true)
        expect(captureEventMock).not.toHaveBeenCalled()
    })

    it('A3: programa con start_date ya fijado ⇒ la RPC NO se llama', async () => {
        const logs = freshLogs()
        const supabase = wireSupabase(logs, 'client-1', {
            programs: [{ ...FLEXIBLE_SIN_FECHA, start_date: '2026-01-05' }],
        })

        await logSetAction({}, buildForm())

        expect(supabase.rpc).not.toHaveBeenCalled()
        expect(captureEventMock).not.toHaveBeenCalled()
    })

    it('A4: start_date_flexible false ⇒ la RPC NO se llama aunque start_date sea null', async () => {
        const logs = freshLogs()
        const supabase = wireSupabase(logs, 'client-1', {
            programs: [{ ...FLEXIBLE_SIN_FECHA, start_date_flexible: false }],
        })

        await logSetAction({}, buildForm())

        expect(supabase.rpc).not.toHaveBeenCalled()
    })

    it('plan suelto (sin programa) ⇒ la RPC NO se llama', async () => {
        const logs = freshLogs()
        const supabase = wireSupabase(logs, 'client-1', { programs: [null] })

        await logSetAction({}, buildForm())

        expect(supabase.rpc).not.toHaveBeenCalled()
    })

    it('A5+A6: la RPC falla (incluido coach_account_paused) ⇒ la serie IGUAL queda guardada', async () => {
        for (const message of ['boom', 'coach_account_paused']) {
            vi.clearAllMocks()
            const logs = freshLogs()
            wireSupabase(logs, 'client-1', {
                programs: [FLEXIBLE_SIN_FECHA],
                rpc: { data: null, error: { message, code: '42501' } },
            })

            const result = await logSetAction({}, buildForm())

            expect(result).toEqual({ success: true })
            expect(logs.inserts).toHaveLength(1)
            expect(captureEventMock).not.toHaveBeenCalled()
        }
    })

    it('A5b: si la lectura del programa lanza, el guardado no se entera', async () => {
        const logs = freshLogs()
        const supabase = wireSupabase(logs, 'client-1', { throwOnRead: true })

        const result = await logSetAction({}, buildForm())

        expect(result).toEqual({ success: true })
        expect(supabase.rpc).not.toHaveBeenCalled()
    })

    it('edición de un día PASADO ⇒ nunca auto-arranca el programa (la RPC sólo acepta hoy)', async () => {
        const logs = makeWorkoutLogsMock({
            selectResults: [{ data: [{ id: 'past-row' }] }],
            updateResult: { error: null },
        })
        const supabase = wireSupabase(logs, 'client-1', { programs: [FLEXIBLE_SIN_FECHA] })

        const result = await logSetAction({}, buildFormWithTarget(PAST_DATE))

        expect(result.success).toBe(true)
        expect(supabase.rpc).not.toHaveBeenCalled()
    })
})
