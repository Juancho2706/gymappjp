import { describe, expect, it, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(async () => ({ auth: { getUser } })),
}))

const adminInsert = vi.fn().mockResolvedValue({ error: null })
const fakeAdmin = { from: vi.fn(() => ({ insert: adminInsert })) }
vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: vi.fn(() => fakeAdmin),
}))

const resolvePreferredWorkspace = vi.fn()
vi.mock('@/services/auth/workspace.service', () => ({
    resolvePreferredWorkspace: (...a: unknown[]) => resolvePreferredWorkspace(...a),
}))

vi.mock('@/services/auth/workspace-permissions.service', async (orig) => {
    return await orig<typeof import('@/services/auth/workspace-permissions.service')>()
})

const rateLimitPayment = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/lib/rate-limit', () => ({
    rateLimitPayment: (...a: unknown[]) => rateLimitPayment(...a),
    jsonRateLimited: (retryAfter: number) =>
        new Response(JSON.stringify({ error: 'Too many requests', code: 'RATE_LIMIT' }), {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) },
        }),
}))

const requestAddonCancellation = vi.fn()
vi.mock('@/services/billing/addons.service', async (orig) => {
    const actual = await orig<typeof import('@/services/billing/addons.service')>()
    return {
        ...actual,
        requestAddonCancellation: (...a: unknown[]) => requestAddonCancellation(...a),
    }
})

vi.mock('../_lib/payments-port', () => ({
    buildAddonPaymentsPort: vi.fn(() => ({
        updateCheckoutAmount: vi.fn(),
        createOneShotPayment: vi.fn(),
    })),
}))

const fetchCoachBillingRow = vi.fn()
vi.mock('../_lib/coach-context', async (orig) => {
    const actual = await orig<typeof import('../_lib/coach-context')>()
    return {
        ...actual,
        fetchCoachBillingRow: (...a: unknown[]) => fetchCoachBillingRow(...a),
    }
})

const sendTransactionalEmail = vi.fn().mockResolvedValue({ ok: true, providerMessageId: 'm1' })
vi.mock('@/lib/email/send-email', () => ({
    sendTransactionalEmail: (...a: unknown[]) => sendTransactionalEmail(...a),
}))

import { POST } from './route'

function makeRequest(body: unknown): Request {
    return new Request('http://localhost/api/payments/addons/cancel', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
    })
}

const STANDALONE_WS = { type: 'coach_standalone', coachId: 'coach-1', userId: 'coach-1' }
const PAID_COACH = {
    id: 'coach-1',
    subscription_tier: 'pro',
    subscription_status: 'active',
    billing_cycle: 'monthly',
    current_period_end: '2026-07-01T00:00:00.000Z',
    subscription_mp_id: 'preapproval-1',
}

beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'coach-1', email: 'juan@evatest.cl' } } })
    rateLimitPayment.mockResolvedValue({ ok: true })
    resolvePreferredWorkspace.mockResolvedValue(STANDALONE_WS)
    fetchCoachBillingRow.mockResolvedValue(PAID_COACH)
})

describe('POST /api/payments/addons/cancel — guards', () => {
    it('401 sin sesión', async () => {
        getUser.mockResolvedValue({ data: { user: null } })
        const res = await POST(makeRequest({ moduleKey: 'cardio' }))
        expect(res.status).toBe(401)
    })

    it('403 si no es coach standalone', async () => {
        resolvePreferredWorkspace.mockResolvedValue({ type: 'enterprise_coach', userId: 'coach-1', coachId: 'coach-1', orgId: 'o1', memberId: 'm1' })
        const res = await POST(makeRequest({ moduleKey: 'cardio' }))
        expect(res.status).toBe(403)
        expect(requestAddonCancellation).not.toHaveBeenCalled()
    })

    it('400 con moduleKey inválido', async () => {
        const res = await POST(makeRequest({ moduleKey: 'nope' }))
        expect(res.status).toBe(400)
    })

    it('429 si el rate limit dispara', async () => {
        rateLimitPayment.mockResolvedValue({ ok: false, retryAfter: 30 })
        const res = await POST(makeRequest({ moduleKey: 'cardio' }))
        expect(res.status).toBe(429)
    })
})

describe('POST /api/payments/addons/cancel — máquina de estados (reglas 3-4)', () => {
    it('regla 4 (ya cobrado): devuelve fecha efectiva + putApplied true', async () => {
        requestAddonCancellation.mockResolvedValue({
            moduleKey: 'cardio',
            status: 'cancel_pending',
            effectiveAt: '2026-07-01T00:00:00.000Z',
            putApplied: true,
        })
        const res = await POST(makeRequest({ moduleKey: 'cardio', reason: 'me sobra' }))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.effectiveAt).toBe('2026-07-01T00:00:00.000Z')
        expect(json.putApplied).toBe(true)
        const inserted = adminInsert.mock.calls[0][0]
        expect(inserted.payload.action).toBe('addon_cancel_requested')
        expect(inserted.payload.cancel_reason).toBe('me sobra')
    })

    it('regla 3 (compromiso mínimo mensual): effectiveAt null, putApplied false', async () => {
        requestAddonCancellation.mockResolvedValue({
            moduleKey: 'cardio',
            status: 'cancel_pending',
            effectiveAt: null,
            putApplied: false,
        })
        const res = await POST(makeRequest({ moduleKey: 'cardio' }))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.effectiveAt).toBeNull()
        expect(json.putApplied).toBe(false)
    })

    it('409 si no hay add-on activo del módulo', async () => {
        requestAddonCancellation.mockRejectedValue(
            new Error('No hay un add-on activo de ese módulo para cancelar.')
        )
        const res = await POST(makeRequest({ moduleKey: 'cardio' }))
        expect(res.status).toBe(409)
        const json = await res.json()
        expect(json.code).toBe('NOT_ACTIVE')
    })
})
