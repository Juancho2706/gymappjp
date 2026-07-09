import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Mocks de infraestructura (auth, DB, provider, service de negocio) ──────────────────────
// El route.test cubre los GUARDS + la bifurcacion por gateway (T5.5): coach Flow → redirect
// (sin tokenizacion), coach Flow sin customer → 409, coach MercadoPago → camino historico sin
// regresion (delegado a changeCardForCoach, ya cubierto por change-card.service.test.ts).

const getUser = vi.fn()
let coachGatewayRow: Record<string, unknown> | null = { subscription_provider: 'mercadopago', provider_customer_id: null }
vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(async () => ({
        auth: { getUser },
        from: vi.fn((table: string) => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => (table === 'coaches' ? { data: coachGatewayRow, error: null } : { data: null, error: null })),
                })),
            })),
        })),
    })),
}))

vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: vi.fn(() => ({})),
}))

const resolvePreferredWorkspace = vi.fn()
vi.mock('@/services/auth/workspace.service', () => ({
    resolvePreferredWorkspace: (...a: unknown[]) => resolvePreferredWorkspace(...a),
}))

// canViewBilling real (excluye team/org por tipo de workspace).
vi.mock('@/services/auth/workspace-permissions.service', async (orig) => {
    return await orig<typeof import('@/services/auth/workspace-permissions.service')>()
})

let rateLimitOk = true
vi.mock('@/lib/rate-limit', () => ({
    rateLimitCardChange: vi.fn(async () => (rateLimitOk ? { ok: true } : { ok: false, retryAfter: 60 })),
    jsonRateLimited: vi.fn(
        (retryAfter: number) =>
            new Response(JSON.stringify({ error: 'Too many requests', code: 'RATE_LIMIT' }), {
                status: 429,
                headers: { 'Retry-After': String(retryAfter) },
            })
    ),
}))

// CHANGE_CARD_ENABLED toggleable via getter; CARD_CHANGE_DISCLOSURE real (version exacta usada por los tests).
let changeCardEnabled = true
vi.mock('@/lib/constants', async (orig) => {
    const actual = await orig<typeof import('@/lib/constants')>()
    return {
        ...actual,
        get CHANGE_CARD_ENABLED() {
            return changeCardEnabled
        },
    }
})

// FlowProvider: solo el metodo T5.5 (startCardReenrollment). Stub de clase para el cast del route.
const startCardReenrollment = vi.fn()
vi.mock('@/lib/payments/providers/flow', () => ({
    FlowProvider: class {
        startCardReenrollment(...a: unknown[]) {
            return startCardReenrollment(...a)
        }
    },
}))

const getPaymentsProvider = vi.fn((gateway?: string) => ({
    name: gateway === 'flow' ? 'flow' : 'mercadopago',
    startCardReenrollment: (...a: unknown[]) => startCardReenrollment(...a),
}))
vi.mock('@/lib/payments/provider', () => ({
    getPaymentsProvider: (gateway?: string) => getPaymentsProvider(gateway),
}))

const changeCardForCoach = vi.fn()
vi.mock('@/services/billing/change-card.service', () => ({
    changeCardForCoach: (...a: unknown[]) => changeCardForCoach(...a),
}))

import { CARD_CHANGE_DISCLOSURE } from '@/lib/constants'
import { POST } from './route'

function makeRequest(body: unknown): Request {
    return new Request('http://localhost/api/payments/change-card', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
    })
}

const STANDALONE_WS = { type: 'coach_standalone', coachId: 'coach-1', userId: 'coach-1' }
const TERMS_VERSION = CARD_CHANGE_DISCLOSURE.version

beforeEach(() => {
    vi.clearAllMocks()
    changeCardEnabled = true
    rateLimitOk = true
    coachGatewayRow = { subscription_provider: 'mercadopago', provider_customer_id: null }
    getUser.mockResolvedValue({ data: { user: { id: 'coach-1' } } })
    resolvePreferredWorkspace.mockResolvedValue(STANDALONE_WS)
})

describe('POST /api/payments/change-card — guards', () => {
    it('401 sin sesion', async () => {
        getUser.mockResolvedValue({ data: { user: null } })
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(401)
    })

    it('403 con CHANGE_CARD_ENABLED off', async () => {
        changeCardEnabled = false
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.code).toBe('FEATURE_DISABLED')
    })

    it('429 fail-closed si el rate limit no responde', async () => {
        rateLimitOk = false
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(429)
    })

    it('403 fuera de coach standalone (org/team)', async () => {
        resolvePreferredWorkspace.mockResolvedValue({ type: 'org_admin', orgId: 'org-1', userId: 'coach-1' })
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(403)
    })

    it('400 con acceptedTermsVersion desactualizado', async () => {
        const res = await POST(makeRequest({ cardToken: 'tok_12345678', acceptedTermsVersion: 'v0-vieja' }))
        expect(res.status).toBe(400)
        const body = await res.json()
        expect(body.code).toBe('TERMS_OUTDATED')
    })
})

describe('POST /api/payments/change-card — rama Flow (T5.5)', () => {
    it('coach Flow con customer enrolado → 200 { kind: redirect, redirectUrl }', async () => {
        coachGatewayRow = { subscription_provider: 'flow', provider_customer_id: 'cus_123' }
        startCardReenrollment.mockResolvedValue({ redirectUrl: 'https://sandbox.flow.cl/app/customer/register.php?token=RG9' })

        const res = await POST(makeRequest({ acceptedTermsVersion: TERMS_VERSION }))

        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body).toEqual({ kind: 'redirect', redirectUrl: 'https://sandbox.flow.cl/app/customer/register.php?token=RG9' })
        expect(startCardReenrollment).toHaveBeenCalledWith('cus_123', expect.stringContaining('/coach/subscription?card=updated'))
        // Rama Flow NUNCA delega al service MP (cero cardToken, cero PUT de MercadoPago).
        expect(changeCardForCoach).not.toHaveBeenCalled()
    })

    it('coach Flow sin provider_customer_id → 409 NO_FLOW_CUSTOMER (nunca llama a Flow)', async () => {
        coachGatewayRow = { subscription_provider: 'flow', provider_customer_id: null }

        const res = await POST(makeRequest({ acceptedTermsVersion: TERMS_VERSION }))

        expect(res.status).toBe(409)
        const body = await res.json()
        expect(body.code).toBe('NO_FLOW_CUSTOMER')
        expect(startCardReenrollment).not.toHaveBeenCalled()
    })

    it('coach Flow con error del provider → 502 GATEWAY_ERROR', async () => {
        coachGatewayRow = { subscription_provider: 'flow', provider_customer_id: 'cus_123' }
        startCardReenrollment.mockRejectedValue(new Error('Flow customer/register failed (HTTP 500)'))

        const res = await POST(makeRequest({ acceptedTermsVersion: TERMS_VERSION }))

        expect(res.status).toBe(502)
        const body = await res.json()
        expect(body.code).toBe('GATEWAY_ERROR')
    })
})

describe('POST /api/payments/change-card — rama MercadoPago (cero regresion)', () => {
    it('coach MP sin cardToken → 400 (nunca llega al service)', async () => {
        const res = await POST(makeRequest({ acceptedTermsVersion: TERMS_VERSION }))
        expect(res.status).toBe(400)
        expect(changeCardForCoach).not.toHaveBeenCalled()
    })

    it('coach MP con cardToken → delega en changeCardForCoach (camino historico intacto)', async () => {
        changeCardForCoach.mockResolvedValue({ ok: true, last4: '4242', brand: 'visa' })

        const res = await POST(
            makeRequest({ cardToken: 'tok_12345678', acceptedTermsVersion: TERMS_VERSION, last4: '4242', brand: 'visa' })
        )

        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body).toEqual({ ok: true, last4: '4242', brand: 'visa' })
        expect(changeCardForCoach).toHaveBeenCalledTimes(1)
        expect(startCardReenrollment).not.toHaveBeenCalled()
    })

    it('coach sin fila de gateway (undefined) trata como MercadoPago default', async () => {
        coachGatewayRow = null
        changeCardForCoach.mockResolvedValue({ ok: true, last4: '1111', brand: 'master' })

        const res = await POST(makeRequest({ cardToken: 'tok_12345678', acceptedTermsVersion: TERMS_VERSION }))

        expect(res.status).toBe(200)
        expect(changeCardForCoach).toHaveBeenCalledTimes(1)
    })
})
