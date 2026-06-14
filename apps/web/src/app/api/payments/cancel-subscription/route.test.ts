import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── FIX-2: cancel-subscription gains rateLimitPayment(user.id) + jsonRateLimited right after the
// auth check (audit medium). Mirrors the addons/route.test.ts mock pattern. The service-role admin
// is a chainable query builder: select→eq→maybeSingle returns the coach; update→eq returns {error};
// insert resolves; the coach_addons select→eq→eq returns no live add-ons by default.
const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(async () => ({ auth: { getUser } })),
}))

let coachRow: Record<string, unknown> | null
const cancelAtProviderCalls: string[] = []

// A terminal builder node that both AWAITS to a PostgREST-like { data, error } and exposes
// chainable .eq()/.maybeSingle() so single-eq (coaches.update) and double-eq (coach_addons.update,
// coach_addons.select) shapes all resolve. The same node is returned at every depth.
function terminal(result: { data?: unknown; error: unknown }) {
    const node: Record<string, unknown> = {
        eq: vi.fn(() => terminal(result)),
        maybeSingle: vi.fn(async () => result),
        then: (resolve: (v: unknown) => unknown) => resolve(result),
    }
    return node
}

function makeAdmin() {
    return {
        from: vi.fn((table: string) => ({
            select: vi.fn(() => ({
                eq: vi.fn(() =>
                    table === 'coaches'
                        ? terminal({ data: coachRow, error: null }) // .eq('id').maybeSingle()
                        : terminal({ data: [], error: null }) // coach_addons .eq().eq() → no live add-ons
                ),
            })),
            update: vi.fn(() => terminal({ data: null, error: null })),
            insert: vi.fn(async () => ({ error: null })),
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

const cancelCheckoutAtProvider = vi.fn(async (id: string) => {
    cancelAtProviderCalls.push(id)
})
const getPaymentsProvider = vi.fn(() => ({
    name: 'mercadopago' as const,
    cancelCheckoutAtProvider: (...a: unknown[]) => cancelCheckoutAtProvider(a[0] as string),
}))
vi.mock('@/lib/payments/provider', () => ({
    getPaymentsProvider: () => getPaymentsProvider(),
}))

import { POST } from './route'

function makeRequest(body: unknown = {}): Request {
    return new Request('http://localhost/api/payments/cancel-subscription', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
    })
}

const STANDALONE_WS = { type: 'coach_standalone', coachId: 'coach-1', userId: 'coach-1' }

beforeEach(() => {
    vi.clearAllMocks()
    cancelAtProviderCalls.length = 0
    fakeAdmin = makeAdmin()
    getUser.mockResolvedValue({ data: { user: { id: 'coach-1', email: 'juan@evatest.cl' } } })
    rateLimitPayment.mockResolvedValue({ ok: true })
    resolvePreferredWorkspace.mockResolvedValue(STANDALONE_WS)
    coachRow = {
        id: 'coach-1',
        subscription_mp_id: 'preapproval-1',
        payment_provider: 'mercadopago',
        current_period_end: '2026-07-01T00:00:00.000Z',
    }
})

describe('POST /api/payments/cancel-subscription — FIX-2 rate limit', () => {
    it('429 cuando el rate limit dispara — ANTES de cancelar en el provider', async () => {
        rateLimitPayment.mockResolvedValue({ ok: false, retryAfter: 30 })
        const res = await POST(makeRequest({ reason: 'me voy' }))
        expect(res.status).toBe(429)
        expect(res.headers.get('Retry-After')).toBe('30')
        // No se llegó a tocar el provider de pagos.
        expect(cancelCheckoutAtProvider).not.toHaveBeenCalled()
        // Se rate-limitea por user.id (de la sesión).
        expect(rateLimitPayment).toHaveBeenCalledWith('coach-1')
    })

    it('200 cuando el rate limit pasa (la cancelación procede)', async () => {
        const res = await POST(makeRequest({ reason: 'me voy' }))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.ok).toBe(true)
        expect(cancelCheckoutAtProvider).toHaveBeenCalledWith('preapproval-1')
    })

    it('401 sin sesión: ni siquiera consulta el rate limit', async () => {
        getUser.mockResolvedValue({ data: { user: null } })
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(401)
        expect(rateLimitPayment).not.toHaveBeenCalled()
    })
})
