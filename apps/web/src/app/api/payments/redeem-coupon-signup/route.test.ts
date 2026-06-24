import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Mocks de infraestructura (auth, DB, rate-limit, helpers de billing) ───────────
// Espejo del patrón de confirm-upgrade/route.test.ts adaptado al canje EN REGISTRO: se interceptan
// auth, workspace, rate-limit (rateLimitCouponRedeem), redeemCoupon y los add-ons vivos. La diferencia
// clave vs redeem-coupon: NO hay preapproval vivo → el provider de pagos NUNCA se importa ni se llama
// (no hay PUT a MP). El gate de estado acepta `pending_payment` (alta de plan pago esperando el primer
// checkout) y rechaza `free`; además, si ya hay un código apuntado (active_coupon_redemption_id) → 409.
const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(async () => ({ auth: { getUser } })),
}))

// Service-role admin con estado: sirve coaches.select().eq().maybeSingle() (el gate de estado) y
// admin_audit_logs.insert (auditoría best-effort SOLO en commit). Cada test inyecta la fila del coach.
let coachRow: Record<string, unknown> | null = null
const auditInserts: Array<Record<string, unknown>> = []

function makeAdmin() {
    return {
        from: vi.fn((table: string) => {
            if (table === 'coaches') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            maybeSingle: vi.fn(async () => ({ data: coachRow, error: null })),
                        })),
                    })),
                }
            }
            if (table === 'admin_audit_logs') {
                return {
                    insert: vi.fn((row: Record<string, unknown>) => {
                        auditInserts.push(row)
                        return { then: (cb: (r: { error: null }) => void) => cb({ error: null }) }
                    }),
                }
            }
            return {
                select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) })),
                insert: vi.fn(() => ({ then: (cb: (r: { error: null }) => void) => cb({ error: null }) })),
            }
        }),
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

const rateLimitCouponRedeem = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/lib/rate-limit', () => ({
    rateLimitCouponRedeem: (...a: unknown[]) => rateLimitCouponRedeem(...a),
    jsonRateLimited: (retryAfter: number) =>
        new Response(JSON.stringify({ error: 'Too many requests', code: 'RATE_LIMIT' }), {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) },
        }),
}))

// Provider de pagos: NUNCA debe usarse en el path de registro (no hay preapproval). Lo mockeamos con
// un throw para que cualquier import/uso accidental tumbe el test (assert estructural de la regla (e)).
const getPaymentsProvider = vi.fn(() => {
    throw new Error('getPaymentsProvider NO debe llamarse en el canje de registro (no hay preapproval)')
})
vi.mock('@/lib/payments/provider', () => ({
    getPaymentsProvider: () => getPaymentsProvider(),
}))

// listLive: add-ons vivos del coach — default ninguno.
const listLive = vi.fn().mockResolvedValue([])
vi.mock('@/infrastructure/db/coach-addons.repository', async (orig) => {
    const actual = await orig<typeof import('@/infrastructure/db/coach-addons.repository')>()
    return { ...actual, listLive: (...a: unknown[]) => listLive(...a) }
})

// redeemCoupon: motor de canje (DB). Lo mockeamos para inspeccionar exactamente qué se le pasa
// (sobre todo `commit`) y para devolver previews/errores controlados.
const redeemCoupon = vi.fn()
vi.mock('@/services/billing/coupons.service', () => ({
    redeemCoupon: (...a: unknown[]) => redeemCoupon(...a),
}))

const PREVIEW = {
    baseBeforeDiscountClp: 29990,
    discountClp: 5000,
    totalClp: 24990,
    couponCode: 'WELCOME',
    durationLabel: 'por 1 ciclo',
    termsText: 'Código WELCOME: descuento.',
}

function setEnabled(v: boolean) {
    vi.stubEnv('COUPON_REDEMPTION_ENABLED', v ? 'true' : 'false')
}

async function loadRoute() {
    // El gate COUPON_REDEMPTION_ENABLED se evalúa al IMPORTAR el módulo → re-import aislado por test.
    vi.resetModules()
    return await import('./route')
}

function makeRequest(body: unknown): Request {
    return new Request('http://localhost/api/payments/redeem-coupon-signup', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    })
}

const STANDALONE_WS = { type: 'coach_standalone', coachId: 'coach-1', userId: 'coach-1' }
// Coach NUEVO: plan pago elegido (pro mensual) pero todavía pending_payment (sin preapproval), sin código.
const PENDING_COACH = {
    subscription_tier: 'pro',
    subscription_status: 'pending_payment',
    billing_cycle: 'monthly',
    active_coupon_redemption_id: null,
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    auditInserts.length = 0
    fakeAdmin = makeAdmin()
    coachRow = { ...PENDING_COACH }
    getUser.mockResolvedValue({ data: { user: { id: 'coach-1', email: 'juan@evatest.cl' } } })
    rateLimitCouponRedeem.mockResolvedValue({ ok: true })
    resolvePreferredWorkspace.mockResolvedValue(STANDALONE_WS)
    listLive.mockResolvedValue([])
    redeemCoupon.mockResolvedValue({ ok: true, redemptionId: null, preview: PREVIEW })
    setEnabled(true)
})

describe('POST /api/payments/redeem-coupon-signup — gate de dinero (flag OFF)', () => {
    it('flag OFF → 403 COUPONS_DISABLED, SIN canjear ni escribir', async () => {
        setEnabled(false)
        const { POST } = await loadRoute()
        const res = await POST(makeRequest({ code: 'WELCOME', commit: true }))
        expect(res.status).toBe(403)
        expect((await res.json()).code).toBe('COUPONS_DISABLED')
        expect(redeemCoupon).not.toHaveBeenCalled()
        expect(auditInserts).toHaveLength(0)
    })
})

describe('POST /api/payments/redeem-coupon-signup — auth + workspace + rate limit', () => {
    it('401 sin sesión', async () => {
        getUser.mockResolvedValue({ data: { user: null } })
        const { POST } = await loadRoute()
        const res = await POST(makeRequest({ code: 'WELCOME' }))
        expect(res.status).toBe(401)
        expect(redeemCoupon).not.toHaveBeenCalled()
    })

    it('401 sin email', async () => {
        getUser.mockResolvedValue({ data: { user: { id: 'coach-1', email: null } } })
        const { POST } = await loadRoute()
        const res = await POST(makeRequest({ code: 'WELCOME' }))
        expect(res.status).toBe(401)
    })

    it('403 si no es coach standalone (team/org excluido por canViewBilling)', async () => {
        resolvePreferredWorkspace.mockResolvedValue({
            type: 'coach_team',
            coachId: 'coach-1',
            userId: 'coach-1',
            teamId: 't1',
        })
        const { POST } = await loadRoute()
        const res = await POST(makeRequest({ code: 'WELCOME' }))
        expect(res.status).toBe(403)
        expect(redeemCoupon).not.toHaveBeenCalled()
    })

    it('429 si el rate limit dispara (fail-closed)', async () => {
        rateLimitCouponRedeem.mockResolvedValue({ ok: false, retryAfter: 30 })
        const { POST } = await loadRoute()
        const res = await POST(makeRequest({ code: 'WELCOME' }))
        expect(res.status).toBe(429)
        expect(redeemCoupon).not.toHaveBeenCalled()
    })

    it('400 sin code (zod)', async () => {
        const { POST } = await loadRoute()
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(400)
        expect(redeemCoupon).not.toHaveBeenCalled()
    })
})

describe('POST /api/payments/redeem-coupon-signup — gate de estado de registro', () => {
    it('acepta pending_payment con plan pago → 200', async () => {
        coachRow = { ...PENDING_COACH }
        const { POST } = await loadRoute()
        const res = await POST(makeRequest({ code: 'WELCOME', commit: true }))
        expect(res.status).toBe(200)
        expect((await res.json()).ok).toBe(true)
        expect(redeemCoupon).toHaveBeenCalledOnce()
    })

    it('acepta free + pending_payment con previewTier (reactivación, caso Ani) → 200 y precia sobre el plan elegido', async () => {
        // Un coach reactivando queda en tier='free' hasta pagar; el preview se precia sobre el plan
        // ELEGIDO (no sobre el free persistido $0). El cobro real lo recalcula create-preference.
        coachRow = { ...PENDING_COACH, subscription_tier: 'free' }
        const { POST } = await loadRoute()
        const res = await POST(makeRequest({ code: 'WELCOME', commit: true, previewTier: 'pro', previewCycle: 'annual' }))
        expect(res.status).toBe(200)
        expect(redeemCoupon).toHaveBeenCalledOnce()
        const arg = redeemCoupon.mock.calls[0][1] as { tier: string; cycle: string }
        expect(arg.tier).toBe('pro')
        expect(arg.cycle).toBe('annual')
    })

    it('acepta expired y canceled (estados de reactivación pre-checkout) → 200', async () => {
        for (const status of ['expired', 'canceled'] as const) {
            vi.clearAllMocks()
            redeemCoupon.mockResolvedValue({ ok: true, redemptionId: null, preview: PREVIEW })
            coachRow = { ...PENDING_COACH, subscription_tier: 'free', subscription_status: status }
            const { POST } = await loadRoute()
            const res = await POST(makeRequest({ code: 'WELCOME', commit: false, previewTier: 'pro' }))
            expect(res.status, status).toBe(200)
        }
    })

    it('rechaza un estado que NO es pre-checkout (active = coach pago vivo) → 422 NO_PENDING_SIGNUP', async () => {
        // active/trialing usan /redeem-coupon (PUT al preapproval vivo); acá quedan fuera (no hay hueco).
        coachRow = { ...PENDING_COACH, subscription_status: 'active' }
        const { POST } = await loadRoute()
        const res = await POST(makeRequest({ code: 'WELCOME', commit: true, previewTier: 'pro' }))
        expect(res.status).toBe(422)
        expect((await res.json()).code).toBe('NO_PENDING_SIGNUP')
        expect(redeemCoupon).not.toHaveBeenCalled()
    })

    it('rechaza si ya hay un código apuntado → 409 ALREADY_HAS_COUPON', async () => {
        coachRow = { ...PENDING_COACH, active_coupon_redemption_id: 'redemption-1' }
        const { POST } = await loadRoute()
        const res = await POST(makeRequest({ code: 'WELCOME', commit: true }))
        expect(res.status).toBe(409)
        expect((await res.json()).code).toBe('ALREADY_HAS_COUPON')
        expect(redeemCoupon).not.toHaveBeenCalled()
    })

    it('404 si el coach no existe', async () => {
        coachRow = null
        const { POST } = await loadRoute()
        const res = await POST(makeRequest({ code: 'WELCOME', commit: true }))
        expect(res.status).toBe(404)
        expect(redeemCoupon).not.toHaveBeenCalled()
    })
})

describe('POST /api/payments/redeem-coupon-signup — preview (commit:false) vs commit', () => {
    it('commit:false (default preview) → 200, redeemCoupon recibe commit=false y NO se audita', async () => {
        const { POST } = await loadRoute()
        const res = await POST(makeRequest({ code: 'WELCOME' })) // commit omitido → false
        expect(res.status).toBe(200)
        expect(redeemCoupon).toHaveBeenCalledOnce()
        const arg = redeemCoupon.mock.calls[0][1] as { commit: boolean }
        expect(arg.commit).toBe(false)
        // preview (redemptionId null) → NO escribe auditoría.
        expect(auditInserts).toHaveLength(0)
    })

    it('commit:true → audita con source:register e incluye el redemptionId', async () => {
        redeemCoupon.mockResolvedValue({ ok: true, redemptionId: 'redemption-99', preview: PREVIEW })
        const { POST } = await loadRoute()
        const res = await POST(makeRequest({ code: 'WELCOME', commit: true }))
        expect(res.status).toBe(200)
        const arg = redeemCoupon.mock.calls[0][1] as { commit: boolean }
        expect(arg.commit).toBe(true)
        expect(auditInserts).toHaveLength(1)
        expect(auditInserts[0].target_id).toBe('redemption-99')
        expect(auditInserts[0].payload).toMatchObject({ source: 'register', coach_id: 'coach-1' })
    })

    it('error de negocio de redeemCoupon → mapea al status correcto (CODE_NOT_FOUND → 404)', async () => {
        redeemCoupon.mockResolvedValue({ ok: false, code: 'CODE_NOT_FOUND', message: 'El código no existe.' })
        const { POST } = await loadRoute()
        const res = await POST(makeRequest({ code: 'NOPE', commit: true }))
        expect(res.status).toBe(404)
        expect((await res.json()).code).toBe('CODE_NOT_FOUND')
    })
})

describe('POST /api/payments/redeem-coupon-signup — NO toca el provider (sin PUT a MP)', () => {
    it('commit exitoso → el provider de pagos NUNCA se llama (no hay preapproval en el registro)', async () => {
        redeemCoupon.mockResolvedValue({ ok: true, redemptionId: 'redemption-99', preview: PREVIEW })
        const { POST } = await loadRoute()
        const res = await POST(makeRequest({ code: 'WELCOME', commit: true }))
        expect(res.status).toBe(200)
        expect(getPaymentsProvider).not.toHaveBeenCalled()
    })
})
