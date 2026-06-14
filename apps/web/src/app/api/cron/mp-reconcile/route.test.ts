import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── FIX-6: mp-reconcile's `isAuthorized` swaps `auth === \`Bearer ${expected}\`` for a
// length-safe constant-time compare (node:crypto timingSafeEqual). `isAuthorized` is private,
// so we drive it through the route GET — the auth gate is the FIRST thing GET runs:
//   - wrong / missing / empty Bearer  → 401 (rejected before any side effect)
//   - exact Bearer ${CRON_SECRET}     → passes auth; with MERCADOPAGO_ACCESS_TOKEN unset the
//                                       route then returns 500 ("...not set") — which PROVES the
//                                       auth gate let it through (a 401 would have short-circuited).
// These assert the CONTRACT (right token in, wrong token out) independent of the timing impl.
//
// The module imports service-role + email helpers at top level; stub them so importing the
// route never touches a real Supabase/Resend client. The 401 paths never reach them anyway,
// and the one 500 path returns before `createServiceRoleClient()` is used.
vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: vi.fn(() => ({
        from: vi.fn(() => ({
            select: vi.fn(() => ({})),
        })),
    })),
}))
vi.mock('@/lib/email/send-email', () => ({
    sendTransactionalEmail: vi.fn().mockResolvedValue({ ok: true }),
}))

import { GET } from './route'

function makeRequest(headers: Record<string, string> = {}): Request {
    return new Request('http://localhost/api/cron/mp-reconcile', { method: 'GET', headers })
}

const CRON_SECRET = 'super-secret-cron-value'

beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CRON_SECRET', CRON_SECRET)
    // Unset so a request that PASSES auth returns 500 ("not set"), letting us prove the gate opened
    // without exercising the full reconcile (which would call out to MP).
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', '')
})

afterEach(() => {
    vi.unstubAllEnvs()
})

describe('GET /api/cron/mp-reconcile — auth gate (FIX-6 constant-time Bearer compare)', () => {
    it('401 with NO Authorization header', async () => {
        const res = await GET(makeRequest())
        expect(res.status).toBe(401)
    })

    it('401 with a WRONG Bearer token of the SAME length (constant-time compare still discriminates)', async () => {
        // `Bearer ${CRON_SECRET}` byte-length but different content.
        const wrong = `Bearer ${'x'.repeat(CRON_SECRET.length)}`
        const res = await GET(makeRequest({ authorization: wrong }))
        expect(res.status).toBe(401)
    })

    it('401 with a Bearer token of a DIFFERENT length (length guard before timingSafeEqual)', async () => {
        const res = await GET(makeRequest({ authorization: `Bearer ${CRON_SECRET}-extra` }))
        expect(res.status).toBe(401)
    })

    it('401 with the raw secret but MISSING the "Bearer " prefix', async () => {
        const res = await GET(makeRequest({ authorization: CRON_SECRET }))
        expect(res.status).toBe(401)
    })

    it('passes auth with the EXACT "Bearer ${CRON_SECRET}" (NOT 401 — proves the right token authorizes)', async () => {
        const res = await GET(makeRequest({ authorization: `Bearer ${CRON_SECRET}` }))
        // Auth opened the gate; with MERCADOPAGO_ACCESS_TOKEN unset the route returns 500.
        expect(res.status).not.toBe(401)
        expect(res.status).toBe(500)
        const json = await res.json()
        expect(json.error).toMatch(/MERCADOPAGO_ACCESS_TOKEN/)
    })

    it('401 (fail-closed) when CRON_SECRET itself is unset, even with a Bearer header', async () => {
        vi.stubEnv('CRON_SECRET', '')
        const res = await GET(makeRequest({ authorization: 'Bearer anything' }))
        expect(res.status).toBe(401)
    })
})
