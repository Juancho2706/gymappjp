import { beforeEach, describe, expect, it, vi } from 'vitest'

// U6.2: redeem-coupon in-app, ESCRITOR ÚNICO del compuesto Flow. Para un coach FLOW la redención se
// commitea igual, pero NO se hace el PUT inmediato del monto (un changePlan movería la plata del ciclo
// EN CURSO); el cron flow-reconcile aplica el descuento antes del próximo cobro. Para MP el PUT es
// inmediato como siempre.

// El gate COUPON_REDEMPTION_ENABLED es un const de MÓDULO (leído al import) → hay que setear el env
// ANTES de que se importe el route. vi.hoisted corre antes de los imports.
vi.hoisted(() => {
    process.env.COUPON_REDEMPTION_ENABLED = 'true'
})

const USER = { id: 'coach-1', email: 'coach@eva.cl' }

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: USER } }) } }),
}))
vi.mock('@/services/auth/workspace.service', () => ({ resolvePreferredWorkspace: async () => ({ kind: 'coach' }) }))
vi.mock('@/services/auth/workspace-permissions.service', () => ({ canViewBilling: () => true }))
vi.mock('@/lib/rate-limit', () => ({
    rateLimitCouponRedeem: async () => ({ ok: true }),
    jsonRateLimited: () => new Response('rl', { status: 429 }),
}))
vi.mock('@/infrastructure/db/coach-addons.repository', () => ({ listLive: async () => [] }))
vi.mock('@/services/billing/addons.service', () => ({ toBillableAddons: () => [] }))
vi.mock('@/services/billing/discount.service', () => ({
    buildAmountPutIdempotencyKey: (id: string, amt: number) => `coupon-amt|${id}|${amt}`,
}))

// redeemCoupon → commit ok con redemptionId + preview (neto descontado).
const redeemCoupon = vi.fn(async (..._a: unknown[]) => ({
    ok: true as const,
    redemptionId: 'red_1',
    preview: { couponCode: 'TEST10', discountClp: 5000, totalClp: 9990 },
}))
vi.mock('@/services/billing/coupons.service', () => ({ redeemCoupon: (...a: unknown[]) => redeemCoupon(...a) }))

// Provider: spy del updateCheckoutAmount (el PUT inmediato).
const updateCheckoutAmount = vi.fn(async (..._a: unknown[]) => {})
vi.mock('@/lib/payments/provider', () => ({
    getPaymentsProvider: () => ({ name: 'mercadopago', updateCheckoutAmount: (...a: unknown[]) => updateCheckoutAmount(...a) }),
}))

// Admin: SELECT del coach controlado por coachRow; inserts no-op.
let coachRow: Record<string, unknown> | null = null
vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: () => ({
        from: (table: string) => {
            if (table === 'coaches') {
                return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: coachRow, error: null }) }) }) }
            }
            return { insert: () => ({ then: (r: (v: { error: null }) => unknown) => r({ error: null }) }) }
        },
    }),
}))

import { POST } from './route'

function req(body: unknown) {
    return new Request('https://eva/api/payments/redeem-coupon', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
        body: JSON.stringify(body),
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    coachRow = null
})

describe('POST /api/payments/redeem-coupon — escritor único Flow (U6.2)', () => {
    it('coach FLOW → commitea la redención SIN PUT inmediato (el cron flow-reconcile sincroniza)', async () => {
        coachRow = {
            subscription_tier: 'pro',
            subscription_status: 'active',
            billing_cycle: 'monthly',
            subscription_mp_id: null,
            subscription_provider: 'flow',
            subscription_provider_external_id: 'sus_flow_1',
        }
        const res = await POST(req({ code: 'TEST10', commit: true }))
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ ok: true, redemptionId: 'red_1' })
        // Redención commiteada (redeemCoupon corrió) pero NINGÚN PUT al provider.
        expect(redeemCoupon).toHaveBeenCalledOnce()
        expect(updateCheckoutAmount).not.toHaveBeenCalled()
    })

    it('coach MP → PUT inmediato del monto descontado (comportamiento histórico intacto)', async () => {
        coachRow = {
            subscription_tier: 'pro',
            subscription_status: 'active',
            billing_cycle: 'monthly',
            subscription_mp_id: 'mp_pre_1',
            subscription_provider: 'mercadopago',
            subscription_provider_external_id: null,
        }
        const res = await POST(req({ code: 'TEST10', commit: true }))
        expect(res.status).toBe(200)
        expect(updateCheckoutAmount).toHaveBeenCalledWith('mp_pre_1', 9990, 'coupon-amt|coach-1|9990')
    })
})
