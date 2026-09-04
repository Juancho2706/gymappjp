import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * «Empezar hoy» del alumno (W2.2 · tren «ciclo real y por lado»). La RPC
 * `client_start_workout_program` está mockeada: acá se fija el CONTRATO de la action
 * (firma, revalidación, mapeo de los 4 errores pelados y la regla de emisión del evento).
 * El comportamiento real de la RPC se verificó en LIVE con tx-rollback (DATA-SECURITY §2.4).
 */

const { createClientMock, revalidatePathMock, resolveAccessMock, captureEventMock } = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    resolveAccessMock: vi.fn(),
    captureEventMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('@/lib/student-access.server', () => ({ resolveStudentAccessForClient: resolveAccessMock }))
vi.mock('@/lib/posthog/server-capture', () => ({ capturePostHogServerEvent: captureEventMock }))

import { startWorkoutProgramAction } from './start-program.actions'

const CLIENT_ID = '22222222-2222-4222-8222-222222222222'
const PROGRAM_ID = '11111111-1111-4111-8111-111111111111'
const COACH_SLUG = 'josefit'

type RpcResult = { data: unknown; error: { message: string; code?: string } | null }

function wireSupabase(opts: {
    sub?: string | null
    rpc?: RpcResult
    structure?: string | null
}) {
    const rpc = vi.fn().mockResolvedValue(opts.rpc ?? { data: [], error: null })
    const maybeSingle = vi
        .fn()
        .mockResolvedValue({ data: { program_structure_type: opts.structure ?? 'cycle' }, error: null })
    const programsBuilder = {
        select: vi.fn(() => programsBuilder),
        eq: vi.fn(() => programsBuilder),
        maybeSingle,
    }
    const sub = opts.sub === undefined ? CLIENT_ID : opts.sub
    const supabase = {
        auth: {
            getClaims: vi.fn().mockResolvedValue({ data: sub ? { claims: { sub } } : { claims: {} } }),
            getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        },
        rpc,
        from: vi.fn((table: string) => {
            if (table === 'workout_programs') return programsBuilder
            throw new Error(`Unexpected table: ${table}`)
        }),
    }
    createClientMock.mockResolvedValue(supabase)
    return { supabase, rpc, programsBuilder }
}

/** Fila del RETURNS TABLE (R23) tal como la devuelve PostgREST: array de una fila. */
function rpcRow(startDate: string | null, endDate: string | null, started: boolean): RpcResult {
    return { data: [{ start_date: startDate, end_date: endDate, started }], error: null }
}

beforeEach(() => {
    vi.clearAllMocks()
    resolveAccessMock.mockResolvedValue({ state: 'ok', graceEndsAt: null })
})

describe('startWorkoutProgramAction', () => {
    it('SP1: sin sesión ⇒ unauthenticated y la RPC NO se llama', async () => {
        const { rpc } = wireSupabase({ sub: null })

        const res = await startWorkoutProgramAction({ coachSlug: COACH_SLUG, programId: PROGRAM_ID })

        expect(res).toEqual({ error: 'No autenticado.', code: 'unauthenticated' })
        expect(rpc).not.toHaveBeenCalled()
        expect(revalidatePathMock).not.toHaveBeenCalled()
    })

    it('SP2: programId inválido o coachSlug vacío ⇒ validation, sin RPC', async () => {
        const { rpc } = wireSupabase({})

        const malProgram = await startWorkoutProgramAction({ coachSlug: COACH_SLUG, programId: 'no-es-uuid' })
        const sinSlug = await startWorkoutProgramAction({ coachSlug: '   ', programId: PROGRAM_ID })

        expect(malProgram.code).toBe('validation')
        expect(sinSlug.code).toBe('validation')
        expect(rpc).not.toHaveBeenCalled()
    })

    it('SP2b: la firma es un OBJETO — llamarla posicionalmente es un error de tipos', async () => {
        wireSupabase({ rpc: rpcRow('2026-09-03', '2026-09-30', true) })

        // @ts-expect-error la action no acepta `(programId)` posicional: sólo { coachSlug, programId }.
        await startWorkoutProgramAction(PROGRAM_ID)
        expect(true).toBe(true)
    })

    it('SP3+SP4+SP6: camino feliz ⇒ RPC sin fecha, revalidación exacta, 3 columnas y evento via:button', async () => {
        // weeks_to_repeat = 4 ⇒ end = start + 4*7 − 1 (aritmética de la RPC, fijada en LIVE).
        const { rpc } = wireSupabase({ rpc: rpcRow('2026-09-03', '2026-09-30', true), structure: 'cycle' })

        const res = await startWorkoutProgramAction({ coachSlug: COACH_SLUG, programId: PROGRAM_ID })

        expect(res).toEqual({
            success: true,
            startDate: '2026-09-03',
            endDate: '2026-09-30',
            started: true,
        })
        // R14/R24: se manda SÓLO el programa; `p_start_date` no viaja (NULL ⇒ hoy Santiago).
        expect(rpc).toHaveBeenCalledTimes(1)
        expect(rpc.mock.calls[0][0]).toBe('client_start_workout_program')
        expect(rpc.mock.calls[0][1]).toEqual({ p_program_id: PROGRAM_ID })
        expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_start_date')
        expect(revalidatePathMock).toHaveBeenCalledWith(`/c/${COACH_SLUG}/dashboard`)

        expect(captureEventMock).toHaveBeenCalledTimes(1)
        expect(captureEventMock).toHaveBeenCalledWith({
            event: 'program_started_by_client',
            distinctId: CLIENT_ID,
            properties: { program_id: PROGRAM_ID, structure: 'cycle', via: 'button' },
        })
    })

    it('SP5: segunda llamada (started:false) ⇒ éxito idempotente con la MISMA fecha y SIN evento', async () => {
        wireSupabase({ rpc: rpcRow('2026-09-03', '2026-09-30', false) })

        const res = await startWorkoutProgramAction({ coachSlug: COACH_SLUG, programId: PROGRAM_ID })

        expect(res).toEqual({
            success: true,
            startDate: '2026-09-03',
            endDate: '2026-09-30',
            started: false,
        })
        expect(res.error).toBeUndefined()
        expect(captureEventMock).not.toHaveBeenCalled()
    })

    it('SP7: coach_account_paused (42501) ⇒ code coach_paused con el copy de siempre, no un 500', async () => {
        wireSupabase({
            rpc: { data: null, error: { message: 'coach_account_paused', code: '42501' } },
        })

        const res = await startWorkoutProgramAction({ coachSlug: COACH_SLUG, programId: PROGRAM_ID })

        expect(res.code).toBe('coach_paused')
        expect(res.error).toContain('en pausa')
        expect(res.success).toBeUndefined()
        expect(captureEventMock).not.toHaveBeenCalled()
    })

    it('SP7b: el gate tipado también corre ANTES de la RPC cuando el alumno está en readonly', async () => {
        resolveAccessMock.mockResolvedValue({ state: 'readonly', graceEndsAt: null })
        const { rpc } = wireSupabase({})

        const res = await startWorkoutProgramAction({ coachSlug: COACH_SLUG, programId: PROGRAM_ID })

        expect(res.code).toBe('coach_paused')
        expect(rpc).not.toHaveBeenCalled()
    })

    it('SP8: programa ajeno / no iniciable ⇒ ESTADO tipado not_startable, sin throw ni evento', async () => {
        wireSupabase({
            rpc: { data: null, error: { message: 'program_not_startable', code: '42501' } },
        })

        const res = await startWorkoutProgramAction({ coachSlug: COACH_SLUG, programId: PROGRAM_ID })

        expect(res.code).toBe('not_startable')
        expect(res.success).toBeUndefined()
        expect(revalidatePathMock).not.toHaveBeenCalled()
        expect(captureEventMock).not.toHaveBeenCalled()
    })

    it('SP9: los otros dos códigos pelados de la RPC salen tipados, nunca como 500 genérico', async () => {
        wireSupabase({ rpc: { data: null, error: { message: 'start_date_out_of_range', code: '22007' } } })
        expect((await startWorkoutProgramAction({ coachSlug: COACH_SLUG, programId: PROGRAM_ID })).code).toBe(
            'out_of_range'
        )

        wireSupabase({ rpc: { data: null, error: { message: 'unauthenticated', code: '28000' } } })
        expect((await startWorkoutProgramAction({ coachSlug: COACH_SLUG, programId: PROGRAM_ID })).code).toBe(
            'unauthenticated'
        )

        wireSupabase({ rpc: { data: null, error: { message: 'connection reset', code: '08006' } } })
        expect((await startWorkoutProgramAction({ coachSlug: COACH_SLUG, programId: PROGRAM_ID })).code).toBe('db')
    })

    it('el evento sobrevive a un fallo de lectura de la estructura (structure: null)', async () => {
        const { programsBuilder } = wireSupabase({ rpc: rpcRow('2026-09-03', '2026-09-30', true) })
        programsBuilder.maybeSingle.mockRejectedValue(new Error('boom'))

        const res = await startWorkoutProgramAction({ coachSlug: COACH_SLUG, programId: PROGRAM_ID })

        expect(res.success).toBe(true)
        expect(captureEventMock).toHaveBeenCalledWith(
            expect.objectContaining({ properties: { program_id: PROGRAM_ID, structure: null, via: 'button' } })
        )
    })
})
