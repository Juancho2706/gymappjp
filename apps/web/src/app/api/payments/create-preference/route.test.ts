import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── FIX-2: create-preference gains rateLimitPayment(user.id) + jsonRateLimited right after the
// auth check (audit medium). These tests mirror the addons/route.test.ts mock pattern: auth,
// service-role admin, the user-scoped supabase client (.from('coaches').select...maybeSingle),
// workspace, rate-limit, provider, the live-addons repo and the composite-amount service are all
// stubbed so the route is exercised in isolation.
//
// The contract under test:
//   - a TRIPPED rate limiter returns 429 (via jsonRateLimited) BEFORE any provider checkout / DB
//     write — proven by createCheckout never being called.
//   - an OK rate limiter lets a valid request through to a 200 (provider checkout created).
const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(async () => ({ auth: { getUser }, from: userScopedFrom })),
}))

// The route reads the coach's current subscription via the USER-scoped client
// (supabase.from('coaches').select(...).eq('id', user.id).maybeSingle()).
const currentCoachMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
const userScopedFrom = vi.fn(() => ({
    select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: currentCoachMaybeSingle })) })),
}))

// Service-role client: only the billing-columns UPDATE goes through here (update→eq→{error}).
const adminUpdateEq = vi.fn().mockResolvedValue({ error: null })
const fakeAdmin = {
    from: vi.fn(() => ({
        update: vi.fn(() => ({ eq: adminUpdateEq })),
    })),
}
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

const rateLimitPayment = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/lib/rate-limit', () => ({
    rateLimitPayment: (...a: unknown[]) => rateLimitPayment(...a),
    jsonRateLimited: (retryAfter: number) =>
        new Response(JSON.stringify({ error: 'Too many requests', code: 'RATE_LIMIT' }), {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) },
        }),
}))

const createCheckout = vi.fn()
const getPaymentsProvider = vi.fn(() => ({
    name: 'mercadopago' as const,
    createCheckout: (...a: unknown[]) => createCheckout(...a),
}))
vi.mock('@/lib/payments/provider', () => ({
    getPaymentsProvider: () => getPaymentsProvider(),
}))

// Live add-ons of the coach (composite amount) — default none.
const listLive = vi.fn().mockResolvedValue([])
vi.mock('@/infrastructure/db/coach-addons.repository', async (orig) => {
    const actual = await orig<typeof import('@/infrastructure/db/coach-addons.repository')>()
    return { ...actual, listLive: (...a: unknown[]) => listLive(...a) }
})

import { POST } from './route'

function makeRequest(body: unknown): Request {
    return new Request('http://localhost/api/payments/create-preference', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
    })
}

const STANDALONE_WS = { type: 'coach_standalone', coachId: 'coach-1', userId: 'coach-1' }

beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'coach-1', email: 'juan@evatest.cl' } } })
    rateLimitPayment.mockResolvedValue({ ok: true })
    resolvePreferredWorkspace.mockResolvedValue(STANDALONE_WS)
    currentCoachMaybeSingle.mockResolvedValue({ data: null, error: null })
    listLive.mockResolvedValue([])
    createCheckout.mockResolvedValue({
        checkoutId: 'preapproval-NEW',
        checkoutUrl: 'https://mp/checkout',
    })
})

describe('POST /api/payments/create-preference — FIX-2 rate limit', () => {
    it('429 cuando el rate limit dispara — ANTES de crear el checkout o tocar la DB', async () => {
        rateLimitPayment.mockResolvedValue({ ok: false, retryAfter: 42 })
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'monthly' }))
        expect(res.status).toBe(429)
        expect(res.headers.get('Retry-After')).toBe('42')
        // El limiter corta antes de crear el preapproval o escribir billing.
        expect(createCheckout).not.toHaveBeenCalled()
        expect(fakeAdmin.from).not.toHaveBeenCalled()
        // Se rate-limitea por user.id (de la sesión, no del body).
        expect(rateLimitPayment).toHaveBeenCalledWith('coach-1')
    })

    it('200 cuando el rate limit pasa (la request válida llega al checkout)', async () => {
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'monthly' }))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.subscriptionId).toBe('preapproval-NEW')
        expect(json.checkoutUrl).toBe('https://mp/checkout')
        expect(createCheckout).toHaveBeenCalledOnce()
    })

    it('401 sin sesión: ni siquiera consulta el rate limit', async () => {
        getUser.mockResolvedValue({ data: { user: null } })
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'monthly' }))
        expect(res.status).toBe(401)
        expect(rateLimitPayment).not.toHaveBeenCalled()
    })
})
