import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock, createServiceRoleClientMock, revalidatePathMock, captureMock } = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    createServiceRoleClientMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    captureMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: createServiceRoleClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('@/lib/posthog/server-capture', () => ({ capturePostHogServerEvent: captureMock }))

import { dismissLeadAction, markLeadConvertedAction } from './leads.actions'

/**
 * Query builder falso: todo encadena y el objeto es `thenable`, así que tanto
 * `.eq().maybeSingle()` como `update().eq().eq()` (que se awaitea sin terminador) resuelven
 * el mismo resultado. Los `vi.fn` quedan expuestos para afirmar sobre `where` y payloads.
 */
type FakeBuilder = {
    select: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    eq: ReturnType<typeof vi.fn>
    in: ReturnType<typeof vi.fn>
    order: ReturnType<typeof vi.fn>
    limit: ReturnType<typeof vi.fn>
    maybeSingle: ReturnType<typeof vi.fn>
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise<unknown>
}

function builder(result: unknown = { data: null, error: null }): FakeBuilder {
    const obj = {} as FakeBuilder
    Object.assign(obj, {
        select: vi.fn(() => obj),
        update: vi.fn(() => obj),
        eq: vi.fn(() => obj),
        in: vi.fn(() => obj),
        order: vi.fn(() => obj),
        limit: vi.fn(() => obj),
        maybeSingle: vi.fn(async () => result),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
            Promise.resolve(result).then(res, rej),
    })
    return obj
}

const REFERRED_LEAD = {
    id: 'lead-1',
    status: 'new',
    referred_by_client_id: 'client-referente',
    referral_source: 'share_card',
    referral_card_kind: 'placa',
}

describe('leads.actions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        captureMock.mockResolvedValue(undefined)
    })

    it('convertir copia la atribución al alumno, cierra el lead y emite los dos eventos', async () => {
        const leadRead = builder({ data: REFERRED_LEAD, error: null })
        const clientRead = builder({ data: { id: 'client-nuevo', referred_by_client_id: null }, error: null })
        const supabase = {
            auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'coach-1' } } }) },
            from: vi.fn((table: string) => (table === 'coach_leads' ? leadRead : clientRead)),
        }
        const leadWrite = builder({ error: null })
        const clientWrite = builder({ error: null })
        const admin = { from: vi.fn((table: string) => (table === 'coach_leads' ? leadWrite : clientWrite)) }

        createClientMock.mockResolvedValue(supabase)
        createServiceRoleClientMock.mockReturnValue(admin)

        const result = await markLeadConvertedAction('lead-1', 'client-nuevo')

        expect(result.ok).toBe(true)
        // Las tres columnas de atribución viajan del lead a `clients` (no tienen grant de usuario:
        // por eso el write va con service role).
        expect(clientWrite.update).toHaveBeenCalledWith({
            referred_by_client_id: 'client-referente',
            referral_source: 'share_card',
            referral_card_kind: 'placa',
        })
        expect(leadWrite.update).toHaveBeenCalledWith({
            status: 'converted',
            converted_client_id: 'client-nuevo',
        })
        // El write del lead se acota por coach además del id: verificar y escribir son dos viajes.
        expect(leadWrite.eq).toHaveBeenCalledWith('coach_id', 'coach-1')

        const events = captureMock.mock.calls.map((call) => call[0].event)
        expect(events).toEqual(['coach_client_referred', 'coach_lead_converted'])
        expect(captureMock.mock.calls[0][0]).toMatchObject({
            distinctId: 'coach-1',
            properties: { referred_by_client_id: 'client-referente', card_kind: 'placa' },
        })
        expect(captureMock.mock.calls[1][0].properties).toMatchObject({ referred: true })
        expect(revalidatePathMock).toHaveBeenCalledWith('/coach/clients')
    })

    it('convertir un lead sin atribución no toca `clients` ni emite coach_client_referred', async () => {
        const leadRead = builder({
            data: { ...REFERRED_LEAD, referred_by_client_id: null, referral_source: null, referral_card_kind: null },
            error: null,
        })
        const clientRead = builder({ data: { id: 'client-nuevo', referred_by_client_id: null }, error: null })
        const supabase = {
            auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'coach-1' } } }) },
            from: vi.fn((table: string) => (table === 'coach_leads' ? leadRead : clientRead)),
        }
        const leadWrite = builder({ error: null })
        const clientWrite = builder({ error: null })
        const admin = { from: vi.fn((table: string) => (table === 'coach_leads' ? leadWrite : clientWrite)) }

        createClientMock.mockResolvedValue(supabase)
        createServiceRoleClientMock.mockReturnValue(admin)

        const result = await markLeadConvertedAction('lead-1', 'client-nuevo')

        expect(result.ok).toBe(true)
        expect(clientWrite.update).not.toHaveBeenCalled()
        expect(captureMock.mock.calls.map((call) => call[0].event)).toEqual(['coach_lead_converted'])
        expect(captureMock.mock.calls[0][0].properties).toMatchObject({ referred: false })
    })

    it('no pisa la atribución de un alumno que ya tenía referente', async () => {
        const leadRead = builder({ data: REFERRED_LEAD, error: null })
        const clientRead = builder({
            data: { id: 'client-nuevo', referred_by_client_id: 'otro-referente' },
            error: null,
        })
        const supabase = {
            auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'coach-1' } } }) },
            from: vi.fn((table: string) => (table === 'coach_leads' ? leadRead : clientRead)),
        }
        const leadWrite = builder({ error: null })
        const clientWrite = builder({ error: null })
        createClientMock.mockResolvedValue(supabase)
        createServiceRoleClientMock.mockReturnValue({
            from: vi.fn((table: string) => (table === 'coach_leads' ? leadWrite : clientWrite)),
        })

        await markLeadConvertedAction('lead-1', 'client-nuevo')

        expect(clientWrite.update).not.toHaveBeenCalled()
        expect(leadWrite.update).toHaveBeenCalled()
    })

    it('descartar marca dismissed y revalida el directorio', async () => {
        const leadRead = builder({ data: { ...REFERRED_LEAD, status: 'contacted' }, error: null })
        const supabase = {
            auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'coach-1' } } }) },
            from: vi.fn(() => leadRead),
        }
        const leadWrite = builder({ error: null })
        createClientMock.mockResolvedValue(supabase)
        createServiceRoleClientMock.mockReturnValue({ from: vi.fn(() => leadWrite) })

        const result = await dismissLeadAction('lead-1')

        expect(result.ok).toBe(true)
        expect(leadWrite.update).toHaveBeenCalledWith({ status: 'dismissed' })
        expect(revalidatePathMock).toHaveBeenCalledWith('/coach/clients')
    })

    it('un coach no puede tocar el lead de otro: el SELECT scoped no devuelve fila y no hay write', async () => {
        // RLS + `.eq('coach_id', auth.uid())` ⇒ el lead ajeno simplemente no existe para esta sesión.
        const leadRead = builder({ data: null, error: null })
        const supabase = {
            auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'coach-intruso' } } }) },
            from: vi.fn(() => leadRead),
        }
        const adminFrom = vi.fn(() => builder({ error: null }))
        createClientMock.mockResolvedValue(supabase)
        createServiceRoleClientMock.mockReturnValue({ from: adminFrom })

        const dismissed = await dismissLeadAction('lead-de-otro')
        const converted = await markLeadConvertedAction('lead-de-otro', 'client-x')

        expect(dismissed.error).toBe('Solicitud no encontrada.')
        expect(converted.error).toBe('Solicitud no encontrada.')
        expect(adminFrom).not.toHaveBeenCalled()
        expect(captureMock).not.toHaveBeenCalled()
        expect(revalidatePathMock).not.toHaveBeenCalled()
    })

    it('convertir hacia un alumno que no es del coach falla sin escribir nada', async () => {
        const leadRead = builder({ data: REFERRED_LEAD, error: null })
        const clientRead = builder({ data: null, error: null })
        const supabase = {
            auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'coach-1' } } }) },
            from: vi.fn((table: string) => (table === 'coach_leads' ? leadRead : clientRead)),
        }
        const adminFrom = vi.fn(() => builder({ error: null }))
        createClientMock.mockResolvedValue(supabase)
        createServiceRoleClientMock.mockReturnValue({ from: adminFrom })

        const result = await markLeadConvertedAction('lead-1', 'client-ajeno')

        expect(result.error).toBe('Alumno no encontrado.')
        expect(adminFrom).not.toHaveBeenCalled()
        expect(captureMock).not.toHaveBeenCalled()
    })
})
