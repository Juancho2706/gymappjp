import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Mocks de infraestructura (auth, DB service-role, provider, hooks de add-ons) ──────
// confirm-subscription es el camino SÍNCRONO de "Ya pagué": confirma el preapproval al volver de MP
// sin esperar el webhook (que sigue de backstop idempotente). Los tests cubren los dos hooks que la
// fase 2 movió del webhook a este camino: (P0-B) cancelar el preapproval superseded en un upgrade en
// curso, y (P0-C) materializar las filas de add-ons embebidas en el external_reference del combo.
const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(async () => ({ auth: { getUser } })),
}))

// Admin service-role: query builder chainable. select→eq→maybeSingle devuelve el coach; update→eq
// devuelve { error }. Se registran las llamadas a update para aseverar el clear del superseded marker.
let coachRow: Record<string, unknown> | null
const updateCalls: Array<Record<string, unknown>> = []
const upsertCalls: Array<Record<string, unknown>> = []

function makeAdmin() {
    return {
        from: vi.fn((table: string) => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: coachRow, error: null })),
                })),
            })),
            update: vi.fn((patch: Record<string, unknown>) => {
                updateCalls.push({ table, patch })
                return { eq: vi.fn(async () => ({ error: null })) }
            }),
            upsert: vi.fn(async (row: Record<string, unknown>) => {
                upsertCalls.push({ table, row })
                return { error: null }
            }),
        })),
    }
}
let fakeAdmin = makeAdmin()
vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: vi.fn(() => fakeAdmin),
}))

const resolvePreferredWorkspace = vi.fn()
vi.mock('@/services/auth/workspace.service', () => ({
    resolvePreferredWorkspace: (...a: unknown[]) => resolvePreferredWorkspace(...a),
}))

// canViewBilling real (excluye team/org por tipo de workspace).
vi.mock('@/services/auth/workspace-permissions.service', async (orig) => {
    return await orig<typeof import('@/services/auth/workspace-permissions.service')>()
})

// Provider: fetchCheckoutSnapshot del preapproval + cancelCheckoutAtProvider para la supersede.
const fetchCheckoutSnapshot = vi.fn()
const cancelCheckoutAtProvider = vi.fn().mockResolvedValue(undefined)
const getPaymentsProvider = vi.fn(() => ({
    name: 'mercadopago' as const,
    fetchCheckoutSnapshot: (...a: unknown[]) => fetchCheckoutSnapshot(...a),
    cancelCheckoutAtProvider: (...a: unknown[]) => cancelCheckoutAtProvider(...a),
}))
vi.mock('@/lib/payments/provider', () => ({
    getPaymentsProvider: () => getPaymentsProvider(),
}))

// Hooks de add-ons (los mismos que el webhook): solo materializeAddonsFromPreapproval escribe filas.
const materializeAddonsFromPreapproval = vi.fn()
vi.mock('@/services/billing/addon-webhook.service', async (orig) => {
    const actual = await orig<typeof import('@/services/billing/addon-webhook.service')>()
    return {
        ...actual,
        materializeAddonsFromPreapproval: (...a: unknown[]) => materializeAddonsFromPreapproval(...a),
    }
})

import { POST } from './route'

function makeRequest(body: unknown): Request {
    return new Request('http://localhost/api/payments/confirm-subscription', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
    })
}

const STANDALONE_WS = { type: 'coach_standalone', coachId: 'coach-1', userId: 'coach-1' }

beforeEach(() => {
    vi.clearAllMocks()
    updateCalls.length = 0
    upsertCalls.length = 0
    fakeAdmin = makeAdmin()
    getUser.mockResolvedValue({ data: { user: { id: 'coach-1', email: 'juan@evatest.cl' } } })
    resolvePreferredWorkspace.mockResolvedValue(STANDALONE_WS)
    materializeAddonsFromPreapproval.mockResolvedValue([])
    cancelCheckoutAtProvider.mockResolvedValue(undefined)
    coachRow = {
        id: 'coach-1',
        subscription_tier: 'pro',
        billing_cycle: 'monthly',
        subscription_mp_id: 'preapproval-NEW',
        current_period_end: '2026-06-01T00:00:00.000Z',
        subscription_status: 'pending_payment',
        superseded_mp_preapproval_id: null,
    }
    // approved → status interno active; reference de 3 partes (sin add-ons) del coach correcto.
    fetchCheckoutSnapshot.mockResolvedValue({
        id: 'preapproval-NEW',
        status: 'approved',
        external_reference: 'coach-1|pro|monthly',
        next_payment_date: '2026-07-01T00:00:00.000Z',
        auto_recurring: { end_date: null },
    })
})

describe('POST /api/payments/confirm-subscription — guards', () => {
    it('401 sin sesión', async () => {
        getUser.mockResolvedValue({ data: { user: null } })
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(401)
    })

    it('403 si no es coach standalone (team/org excluido por canViewBilling)', async () => {
        resolvePreferredWorkspace.mockResolvedValue({
            type: 'coach_team',
            coachId: 'coach-1',
            userId: 'coach-1',
            teamId: 't1',
        })
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(403)
    })
})

describe('POST /api/payments/confirm-subscription — supersede cancel (P0-B)', () => {
    it('cancela el preapproval superseded una sola vez y limpia el marcador', async () => {
        coachRow!.superseded_mp_preapproval_id = 'preapproval-OLD'
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        // cancelCheckoutAtProvider llamado EXACTAMENTE una vez con el viejo preapproval
        expect(cancelCheckoutAtProvider).toHaveBeenCalledOnce()
        expect(cancelCheckoutAtProvider).toHaveBeenCalledWith('preapproval-OLD')
        // se limpia el marcador superseded (update con superseded_mp_preapproval_id: null)
        const clearUpdate = updateCalls.find(
            (c) =>
                c.table === 'coaches' &&
                (c.patch as Record<string, unknown>).superseded_mp_preapproval_id === null &&
                Object.keys(c.patch as Record<string, unknown>).length === 1
        )
        expect(clearUpdate).toBeTruthy()
    })

    it('NO cancela si no hay preapproval superseded (marcador null)', async () => {
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        expect(cancelCheckoutAtProvider).not.toHaveBeenCalled()
    })

    it('NO cancela si el superseded es el mismo preapproval que se confirma (no es upgrade)', async () => {
        coachRow!.superseded_mp_preapproval_id = 'preapproval-NEW'
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        expect(cancelCheckoutAtProvider).not.toHaveBeenCalled()
    })

    it('un fallo al cancelar en el provider NO tumba el confirm (se loguea)', async () => {
        coachRow!.superseded_mp_preapproval_id = 'preapproval-OLD'
        cancelCheckoutAtProvider.mockRejectedValue(new Error('MercadoPago PUT failed (404)'))
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        // la confirmación igual responde 200 (el coach ya quedó actualizado)
        expect(res.status).toBe(200)
        expect(cancelCheckoutAtProvider).toHaveBeenCalledOnce()
    })

    it('NO cancela cuando el preapproval no quedó activo (pending → no paid-like)', async () => {
        coachRow!.superseded_mp_preapproval_id = 'preapproval-OLD'
        fetchCheckoutSnapshot.mockResolvedValue({
            id: 'preapproval-NEW',
            status: 'pending',
            external_reference: 'coach-1|pro|monthly',
        })
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        expect(cancelCheckoutAtProvider).not.toHaveBeenCalled()
    })
})

describe('POST /api/payments/confirm-subscription — addons materializados (P0-C)', () => {
    it('combo con add-ons embebidos → materializeAddonsFromPreapproval con las claves del reference', async () => {
        fetchCheckoutSnapshot.mockResolvedValue({
            id: 'preapproval-NEW',
            status: 'approved',
            external_reference: 'coach-1|pro|monthly|cardio+body_composition',
            next_payment_date: '2026-07-01T00:00:00.000Z',
        })
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        expect(materializeAddonsFromPreapproval).toHaveBeenCalledOnce()
        // (admin service-role, coachId, addons[], termsVersion)
        const [adminArg, coachIdArg, addonsArg] = materializeAddonsFromPreapproval.mock.calls[0]
        expect(adminArg).toBe(fakeAdmin)
        expect(coachIdArg).toBe('coach-1')
        expect([...(addonsArg as string[])].sort()).toEqual(['body_composition', 'cardio'])
    })

    it('reference de 3 partes (sin add-ons) → NO materializa nada', async () => {
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        expect(materializeAddonsFromPreapproval).not.toHaveBeenCalled()
    })

    it('NO materializa si el preapproval no quedó activo (pending)', async () => {
        fetchCheckoutSnapshot.mockResolvedValue({
            id: 'preapproval-NEW',
            status: 'pending',
            external_reference: 'coach-1|pro|monthly|cardio',
        })
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        expect(materializeAddonsFromPreapproval).not.toHaveBeenCalled()
    })

    it('un fallo al materializar NO tumba el confirm (backstop = webhook)', async () => {
        fetchCheckoutSnapshot.mockResolvedValue({
            id: 'preapproval-NEW',
            status: 'approved',
            external_reference: 'coach-1|pro|monthly|cardio',
            next_payment_date: '2026-07-01T00:00:00.000Z',
        })
        materializeAddonsFromPreapproval.mockRejectedValue(new Error('db down'))
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        expect(materializeAddonsFromPreapproval).toHaveBeenCalledOnce()
    })
})
