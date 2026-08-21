import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))

import { getCoachLeads } from './leads.queries'

function mockSupabase(result: { data: unknown; error: unknown }) {
    const query: Record<string, unknown> = {}
    Object.assign(query, {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        in: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(async () => result),
    })
    const supabase = { from: vi.fn(() => query) }
    createClientMock.mockResolvedValue(supabase)
    return { supabase, query }
}

describe('getCoachLeads', () => {
    beforeEach(() => vi.clearAllMocks())

    it('acota a los estados abiertos del coach y ordena por más nuevo', async () => {
        const { supabase, query } = mockSupabase({ data: [], error: null })

        await getCoachLeads('coach-1')

        expect(supabase.from).toHaveBeenCalledWith('coach_leads')
        expect(query.eq).toHaveBeenCalledWith('coach_id', 'coach-1')
        expect(query.in).toHaveBeenCalledWith('status', ['new', 'contacted'])
        expect(query.order).toHaveBeenCalledWith('created_at', { ascending: false })
        // Sin el hint de FK PostgREST responde 300: la tabla tiene DOS FKs a `clients`.
        const selected = (query.select as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
        expect(selected).toContain('clients!coach_leads_referred_by_client_id_fkey')
    })

    it('mapea la fila al DTO y resuelve el nombre del referente (objeto o array)', async () => {
        mockSupabase({
            data: [
                {
                    id: 'lead-1',
                    full_name: 'Ana Pérez',
                    phone: '912345678',
                    email: null,
                    message: 'Quiero entrenar contigo',
                    status: 'contacted',
                    created_at: '2026-08-21T02:00:00.000Z',
                    referred_by_client_id: 'client-9',
                    referral_card_kind: 'placa',
                    referral_source: 'share_card',
                    referrer: { full_name: 'Dani Referente' },
                },
                {
                    id: 'lead-2',
                    full_name: 'Bruno Soto',
                    phone: null,
                    email: 'bruno@example.com',
                    message: null,
                    status: 'new',
                    created_at: '2026-08-20T02:00:00.000Z',
                    referred_by_client_id: 'client-9',
                    referral_card_kind: null,
                    referral_source: null,
                    // PostgREST devuelve el embed to-one como objeto, pero varias versiones del
                    // generador de tipos lo entregan como array de 0/1: los dos deben mapear igual.
                    referrer: [{ full_name: 'Dani Referente' }],
                },
                {
                    id: 'lead-3',
                    full_name: 'Cami Rojas',
                    phone: '912345679',
                    email: null,
                    message: null,
                    status: 'new',
                    created_at: '2026-08-19T02:00:00.000Z',
                    referred_by_client_id: null,
                    referral_card_kind: null,
                    referral_source: null,
                    referrer: null,
                },
            ],
            error: null,
        })

        const leads = await getCoachLeads('coach-1')

        expect(leads).toHaveLength(3)
        expect(leads[0]).toEqual({
            id: 'lead-1',
            fullName: 'Ana Pérez',
            phone: '912345678',
            email: null,
            message: 'Quiero entrenar contigo',
            status: 'contacted',
            createdAt: '2026-08-21T02:00:00.000Z',
            referrerName: 'Dani Referente',
            referralCardKind: 'placa',
            referralSource: 'share_card',
        })
        expect(leads[1].referrerName).toBe('Dani Referente')
        expect(leads[2].referrerName).toBeNull()
    })

    it('falla blando: un error de lectura devuelve lista vacía, no rompe /coach/clients', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        mockSupabase({ data: null, error: { message: 'permission denied' } })

        await expect(getCoachLeads('coach-1')).resolves.toEqual([])

        consoleError.mockRestore()
    })
})
