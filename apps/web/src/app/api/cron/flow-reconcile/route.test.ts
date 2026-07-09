import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Cron reconcile de Flow (Ola 3, T3.5). Backstop ALERT-ONLY: detecta divergencias de estado y de
// periodo-no-avanzado (webhook perdido) sobre coaches Flow, escribe admin_audit_logs, NUNCA auto-fix.

const auditInserts: Array<Record<string, unknown>> = []
let flowCoaches: Array<Record<string, unknown>> = []
function makeAdmin() {
    return {
        from: (table: string) => {
            if (table === 'coaches') {
                // Cadena de filtros encadenables que termina resolviendo a { data: flowCoaches }.
                const chain: Record<string, unknown> = {}
                const ret = () => chain
                Object.assign(chain, {
                    select: ret, eq: ret, not: ret, is: ret,
                    then: (resolve: (v: { data: unknown; error: null }) => unknown) => resolve({ data: flowCoaches, error: null }),
                })
                return chain
            }
            if (table === 'admin_audit_logs') {
                return { insert: async (row: Record<string, unknown>) => { auditInserts.push(row); return { error: null } } }
            }
            return {}
        },
    }
}
let fakeAdmin = makeAdmin()
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => fakeAdmin }))

// FlowProvider.fetchCheckoutSnapshot controlado por subscriptionId.
const snapshots = new Map<string, { status: string; auto_recurring?: { end_date?: string | null } }>()
const fetchCheckoutSnapshot = vi.fn(async (subId: string) => {
    const s = snapshots.get(subId)
    if (!s) throw new Error('no snapshot')
    return { id: subId, external_reference: null, status: s.status, next_payment_date: null, auto_recurring: s.auto_recurring }
})
// U6.3: SYNC ACOTADO del drift → updateCheckoutAmount (ensure-plan + changePlan al compuesto esperado).
const updateCheckoutAmount = vi.fn(async (..._a: unknown[]) => {})
vi.mock('@/lib/payments/provider', () => ({
    getPaymentsProvider: () => ({
        name: 'flow',
        fetchCheckoutSnapshot: (...a: unknown[]) => fetchCheckoutSnapshot(...(a as [string])),
        updateCheckoutAmount: (...a: unknown[]) => updateCheckoutAmount(...a),
    }),
}))

// B4 drift: listLive (add-ons vivos) + resolveDiscountSpecByRedemptionId (cupon) alimentan el compuesto
// esperado. getCompositeAmountClp/toBillableAddons quedan REALES (puros). Default: sin add-ons, sin cupon.
const listLive = vi.fn(async () => [] as unknown[])
vi.mock('@/infrastructure/db/coach-addons.repository', () => ({
    listLive: (...a: unknown[]) => listLive(...(a as [])),
}))
vi.mock('@/services/billing/discount.service', () => ({
    resolveDiscountSpecByRedemptionId: vi.fn(async () => null),
    // El route ahora consume isChargeableNetClp (guard del SYNC) — real: net >= 1.
    isChargeableNetClp: (net: number) => Number.isFinite(net) && net >= 1,
}))

import { GET } from './route'
import { getCompositeAmountClp } from '@/services/billing/addons.service'

const SECRET = 'cron-sekret'
const authedReq = () => new Request('https://eva/api/cron/flow-reconcile', { headers: { authorization: `Bearer ${SECRET}` } })

beforeEach(() => {
    vi.clearAllMocks()
    auditInserts.length = 0
    flowCoaches = []
    snapshots.clear()
    fakeAdmin = makeAdmin()
    vi.stubEnv('CRON_SECRET', SECRET)
})
afterEach(() => vi.unstubAllEnvs())

describe('GET /api/cron/flow-reconcile — auth', () => {
    it('sin CRON_SECRET en el env → 401', async () => {
        vi.stubEnv('CRON_SECRET', '')
        expect((await GET(authedReq())).status).toBe(401)
    })
    it('Authorization incorrecto → 401', async () => {
        const res = await GET(new Request('https://eva/api/cron/flow-reconcile', { headers: { authorization: 'Bearer malo' } }))
        expect(res.status).toBe(401)
    })
})

describe('GET /api/cron/flow-reconcile — deteccion (alert-only)', () => {
    it('coach Flow SANO (activo, periodos alineados) → cero divergencias, cero audit', async () => {
        flowCoaches = [{ id: 'c1', slug: 'coach-uno', subscription_status: 'active', current_period_end: '2026-08-04T00:00:00', subscription_provider: 'flow', subscription_provider_external_id: 'sus_1' }]
        snapshots.set('sus_1', { status: 'authorized', auto_recurring: { end_date: '2026-08-04T00:00:00' } })
        const res = await GET(authedReq())
        const json = await res.json()
        expect(json).toMatchObject({ ok: true, checked: 1, divergences: 0, errors: 0 })
        expect(auditInserts).toHaveLength(0)
    })

    it('DIVERGENCIA de estado (Flow cancelada, DB active) → alerta status_divergence', async () => {
        flowCoaches = [{ id: 'c2', slug: 'coach-dos', subscription_status: 'active', current_period_end: '2026-08-04T00:00:00', subscription_provider: 'flow', subscription_provider_external_id: 'sus_2' }]
        snapshots.set('sus_2', { status: 'cancelled', auto_recurring: { end_date: '2026-08-04T00:00:00' } })
        const res = await GET(authedReq())
        expect((await res.json()).divergences).toBe(1)
        expect(auditInserts.some((a) => a.action === 'coach.flow_status_divergence')).toBe(true)
    })

    it('PERIODO no avanzado (Flow period_end posterior al de EVA) → alerta period_not_advanced (webhook perdido)', async () => {
        flowCoaches = [{ id: 'c3', slug: 'coach-tres', subscription_status: 'active', current_period_end: '2026-07-04T00:00:00', subscription_provider: 'flow', subscription_provider_external_id: 'sus_3' }]
        snapshots.set('sus_3', { status: 'authorized', auto_recurring: { end_date: '2026-08-04T00:00:00' } })
        const res = await GET(authedReq())
        expect((await res.json()).divergences).toBe(1)
        expect(auditInserts.some((a) => a.action === 'coach.flow_period_not_advanced')).toBe(true)
    })

    it('un fetch que tira NO tumba el cron (cuenta como error, sigue)', async () => {
        flowCoaches = [
            { id: 'c4', slug: 'rompe', subscription_status: 'active', current_period_end: '2026-08-04T00:00:00', subscription_provider: 'flow', subscription_provider_external_id: 'sus_missing' },
            { id: 'c5', slug: 'sano', subscription_status: 'active', current_period_end: '2026-08-04T00:00:00', subscription_provider: 'flow', subscription_provider_external_id: 'sus_5' },
        ]
        snapshots.set('sus_5', { status: 'authorized', auto_recurring: { end_date: '2026-08-04T00:00:00' } })
        const json = await (await GET(authedReq())).json()
        expect(json).toMatchObject({ ok: true, checked: 1, errors: 1 })
    })
})

describe('GET /api/cron/flow-reconcile — SYNC ACOTADO del drift de monto (U6.3, escritor único)', () => {
    // provider_plan_id rancio (monto horneado 999999 ≠ compuesto esperado) → drift. base pro/monthly.
    const RANCIO = 'eva_pro_monthly_999999'
    const expectedPro = getCompositeAmountClp('pro', 'monthly', []) as number

    it('coach Flow ACTIVO con drift cobrable y SIN downgrade diferido → SINCRONIZA (updateCheckoutAmount + audit synced)', async () => {
        flowCoaches = [{
            id: 'c-sync', slug: 'sync-me', subscription_status: 'active', subscription_tier: 'pro',
            billing_cycle: 'monthly', current_period_end: '2026-08-04T00:00:00', subscription_provider: 'flow',
            subscription_provider_external_id: 'sus_drift', provider_plan_id: RANCIO, active_coupon_redemption_id: null,
        }]
        snapshots.set('sus_drift', { status: 'authorized', auto_recurring: { end_date: '2026-08-04T00:00:00' } })
        listLive.mockResolvedValue([])
        const res = await GET(authedReq())
        expect(res.status).toBe(200)
        // SYNC: updateCheckoutAmount(subId, expected) — el escritor único aplica el compuesto esperado.
        expect(updateCheckoutAmount).toHaveBeenCalledWith('sus_drift', expectedPro)
        expect(auditInserts.some((a) => a.action === 'coach.flow_composite_synced')).toBe(true)
        // No queda como divergencia alertada (se corrigió).
        expect(auditInserts.some((a) => a.action === 'coach.flow_amount_drift')).toBe(false)
    })

    it('ventana de downgrade DIFERIDO (add-on cancel_pending por vencer) → NO sincroniza, solo ALERTA (evita crédito indebido)', async () => {
        flowCoaches = [{
            id: 'c-defer', slug: 'defer', subscription_status: 'active', subscription_tier: 'pro',
            billing_cycle: 'monthly', current_period_end: '2026-08-04T00:00:00', subscription_provider: 'flow',
            subscription_provider_external_id: 'sus_defer', provider_plan_id: RANCIO, active_coupon_redemption_id: null,
        }]
        snapshots.set('sus_defer', { status: 'authorized', auto_recurring: { end_date: '2026-08-04T00:00:00' } })
        // Add-on YA cobrado en baja diferida (firstChargedAt set → NO billable; expiresAt futuro → ventana viva).
        listLive.mockResolvedValue([
            { id: 'ad1', moduleKey: 'cardio', status: 'cancel_pending', source: 'self_service', firstChargedAt: '2026-06-01T00:00:00', expiresAt: '2027-01-01T00:00:00', priceClpMensual: 9990 },
        ] as unknown[])
        await GET(authedReq())
        expect(updateCheckoutAmount).not.toHaveBeenCalled()
        expect(auditInserts.some((a) => a.action === 'coach.flow_amount_drift')).toBe(true)
        expect(auditInserts.some((a) => a.action === 'coach.flow_composite_synced')).toBe(false)
    })

    it('si el SYNC falla (updateCheckoutAmount tira) → conserva la ALERTA de drift', async () => {
        flowCoaches = [{
            id: 'c-fail', slug: 'fail', subscription_status: 'active', subscription_tier: 'pro',
            billing_cycle: 'monthly', current_period_end: '2026-08-04T00:00:00', subscription_provider: 'flow',
            subscription_provider_external_id: 'sus_fail', provider_plan_id: RANCIO, active_coupon_redemption_id: null,
        }]
        snapshots.set('sus_fail', { status: 'authorized', auto_recurring: { end_date: '2026-08-04T00:00:00' } })
        listLive.mockResolvedValue([])
        updateCheckoutAmount.mockRejectedValueOnce(new Error('Flow changePlan 502'))
        await GET(authedReq())
        expect(updateCheckoutAmount).toHaveBeenCalledWith('sus_fail', expectedPro)
        expect(auditInserts.some((a) => a.action === 'coach.flow_amount_drift')).toBe(true)
    })
})
