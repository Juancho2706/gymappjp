import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Mocks de infraestructura (auth, DB, provider, service de add-ons) ─────────────
// Espejo del patrón de addons/route.test.ts: se interceptan auth, workspace, rate-limit, el
// provider de pagos y los hooks del service. El camino síncrono `confirm-addon` (plan 05) confirma
// un pago one-shot al volver del checkout SIN esperar el webhook (que sigue de backstop idempotente).
const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(async () => ({ auth: { getUser } })),
}))

const fakeAdmin = { __tag: 'service-role' }
vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: vi.fn(() => fakeAdmin),
}))

const resolvePreferredWorkspace = vi.fn()
vi.mock('@/services/auth/workspace.service', () => ({
    resolvePreferredWorkspace: (...a: unknown[]) => resolvePreferredWorkspace(...a),
}))

// canViewBilling real (excluye team/org por tipo de workspace) — mismo criterio que addons/route.
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

// Provider: el camino síncrono lee el snapshot del PAGO one-shot (no del preapproval).
const fetchPaymentSnapshot = vi.fn()
const getPaymentsProvider = vi.fn(() => ({
    name: 'mercadopago' as const,
    fetchPaymentSnapshot: (...a: unknown[]) => fetchPaymentSnapshot(...a),
}))
vi.mock('@/lib/payments/provider', () => ({
    getPaymentsProvider: () => getPaymentsProvider(),
}))

// materializeAddonFromOneShot es el ÚNICO hook que escribe coach_addons (service-role) en este
// camino — idempotente con el webhook por el índice único parcial. parseOneShotAddonReference es el
// parser único del formato `addon_oneshot|...` (se re-exporta desde el provider, design parte 1).
const materializeAddonFromOneShot = vi.fn()
vi.mock('@/services/billing/addons.service', async (orig) => {
    const actual = await orig<typeof import('@/services/billing/addons.service')>()
    return {
        ...actual,
        materializeAddonFromOneShot: (...a: unknown[]) => materializeAddonFromOneShot(...a),
    }
})

const parseOneShotAddonReference = vi.fn()
vi.mock('@/lib/payments/providers/mercadopago', async (orig) => {
    const actual = await orig<typeof import('@/lib/payments/providers/mercadopago')>()
    return {
        ...actual,
        parseOneShotAddonReference: (...a: unknown[]) => parseOneShotAddonReference(...a),
    }
})

const buildAddonPaymentsPort = vi.fn(() => ({
    updateCheckoutAmount: vi.fn(),
    createOneShotPayment: vi.fn(),
}))
vi.mock('../addons/_lib/payments-port', () => ({
    buildAddonPaymentsPort: () => buildAddonPaymentsPort(),
}))

const fetchCoachBillingRow = vi.fn()
vi.mock('../addons/_lib/coach-context', async (orig) => {
    const actual = await orig<typeof import('../addons/_lib/coach-context')>()
    return {
        ...actual,
        fetchCoachBillingRow: (...a: unknown[]) => fetchCoachBillingRow(...a),
    }
})

import { POST } from './route'

function makeRequest(body: unknown): Request {
    return new Request('http://localhost/api/payments/confirm-addon', {
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
const ONE_SHOT_REF = 'addon_oneshot|coach-1|cardio|v2-2026-06'

beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'coach-1', email: 'juan@evatest.cl' } } })
    rateLimitPayment.mockResolvedValue({ ok: true })
    resolvePreferredWorkspace.mockResolvedValue(STANDALONE_WS)
    fetchCoachBillingRow.mockResolvedValue(PAID_COACH)
    fetchPaymentSnapshot.mockResolvedValue({
        id: 'pay-1',
        status: 'approved',
        external_reference: ONE_SHOT_REF,
    })
    parseOneShotAddonReference.mockReturnValue({
        coachId: 'coach-1',
        moduleKey: 'cardio',
        termsVersion: 'v2-2026-06',
    })
    materializeAddonFromOneShot.mockResolvedValue({
        addon: { id: 'addon-1', moduleKey: 'cardio' },
        newCompositeAmountClp: 39980,
    })
    buildAddonPaymentsPort.mockReturnValue({
        updateCheckoutAmount: vi.fn(),
        createOneShotPayment: vi.fn(),
    })
})

describe('POST /api/payments/confirm-addon — auth + rate limit + payload', () => {
    it('401 sin sesión', async () => {
        getUser.mockResolvedValue({ data: { user: null } })
        const res = await POST(makeRequest({ paymentId: 'pay-1' }))
        expect(res.status).toBe(401)
        expect(materializeAddonFromOneShot).not.toHaveBeenCalled()
    })

    it('401 sin email (coach.id === auth uid, se exige email)', async () => {
        getUser.mockResolvedValue({ data: { user: { id: 'coach-1', email: null } } })
        const res = await POST(makeRequest({ paymentId: 'pay-1' }))
        expect(res.status).toBe(401)
    })

    it('429 si el rate limit dispara', async () => {
        rateLimitPayment.mockResolvedValue({ ok: false, retryAfter: 30 })
        const res = await POST(makeRequest({ paymentId: 'pay-1' }))
        expect(res.status).toBe(429)
        expect(materializeAddonFromOneShot).not.toHaveBeenCalled()
    })

    it('403 si no es coach standalone (team/org excluido por canViewBilling)', async () => {
        resolvePreferredWorkspace.mockResolvedValue({
            type: 'coach_team',
            coachId: 'coach-1',
            userId: 'coach-1',
            teamId: 't1',
        })
        const res = await POST(makeRequest({ paymentId: 'pay-1' }))
        expect(res.status).toBe(403)
        expect(materializeAddonFromOneShot).not.toHaveBeenCalled()
    })

    it('400 sin paymentId (zod)', async () => {
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(400)
        expect(fetchPaymentSnapshot).not.toHaveBeenCalled()
    })
})

describe('POST /api/payments/confirm-addon — materialización síncrona (pago aprobado)', () => {
    it('approved → materializa el add-on (service-role) y devuelve status active + moduleKey', async () => {
        const res = await POST(makeRequest({ paymentId: 'pay-1' }))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.ok).toBe(true)
        expect(json.status).toBe('active')
        expect(json.moduleKey).toBe('cardio')
        // el hook de materialización corrió exactamente una vez, con el client service-role
        expect(materializeAddonFromOneShot).toHaveBeenCalledOnce()
        expect(materializeAddonFromOneShot.mock.calls[0][0]).toBe(fakeAdmin)
        // contexto derivado del coach (tier/cycle/preapproval) + moduleKey + termsVersion del ref
        const ctxArg = materializeAddonFromOneShot.mock.calls[0][2]
        expect(ctxArg).toMatchObject({
            coachId: 'coach-1',
            tier: 'pro',
            cycle: 'monthly',
            subscriptionMpId: 'preapproval-1',
        })
        expect(materializeAddonFromOneShot.mock.calls[0][3]).toBe('cardio')
        expect(materializeAddonFromOneShot.mock.calls[0][4]).toBe('v2-2026-06')
    })

    it('idempotente: doble llamada con el mismo pago → 200 active, materialize reusa la fila viva', async () => {
        // El service materializeAddonFromOneShot dedup por el índice único parcial (reusa la fila
        // viva preexistente). Dos POST del mismo pago = dos 200 active, sin error de doble fila.
        const first = await POST(makeRequest({ paymentId: 'pay-1' }))
        const second = await POST(makeRequest({ paymentId: 'pay-1' }))
        expect(first.status).toBe(200)
        expect(second.status).toBe(200)
        expect((await first.json()).status).toBe('active')
        expect((await second.json()).status).toBe('active')
        expect(materializeAddonFromOneShot).toHaveBeenCalledTimes(2)
    })
})

describe('POST /api/payments/confirm-addon — pago no aprobado: NO otorga', () => {
    it('pending → { ok, status } SIN materializar (cero filas, cero módulos)', async () => {
        fetchPaymentSnapshot.mockResolvedValue({
            id: 'pay-1',
            status: 'pending',
            external_reference: ONE_SHOT_REF,
        })
        const res = await POST(makeRequest({ paymentId: 'pay-1' }))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.ok).toBe(true)
        expect(json.status).not.toBe('active')
        expect(materializeAddonFromOneShot).not.toHaveBeenCalled()
    })

    it('rejected → NO materializa (abandono/rechazo = sin grant)', async () => {
        fetchPaymentSnapshot.mockResolvedValue({
            id: 'pay-1',
            status: 'rejected',
            external_reference: ONE_SHOT_REF,
        })
        const res = await POST(makeRequest({ paymentId: 'pay-1' }))
        expect(res.status).toBe(200)
        expect(materializeAddonFromOneShot).not.toHaveBeenCalled()
    })
})

describe('POST /api/payments/confirm-addon — anti escalada: coachId del ref debe coincidir', () => {
    it('403 si el external_reference pertenece a otro coach (sin materializar)', async () => {
        parseOneShotAddonReference.mockReturnValue({
            coachId: 'someone-else',
            moduleKey: 'cardio',
            termsVersion: 'v2-2026-06',
        })
        const res = await POST(makeRequest({ paymentId: 'pay-1' }))
        expect(res.status).toBe(403)
        expect(materializeAddonFromOneShot).not.toHaveBeenCalled()
    })
})
