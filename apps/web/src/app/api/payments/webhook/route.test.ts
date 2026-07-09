import { describe, expect, it, vi, beforeEach } from 'vitest'

// ════════════════════════════════════════════════════════════════════════════════════
// Webhook route tests for FIX-5 (one-shot redelivery idempotency) and FIX-7 (refund/
// chargeback handler). The webhook is the idempotent BACKSTOP (the synchronous confirm
// paths are the source of truth in the MP test sandbox). These tests mock the provider's
// processWebhook + the service-role admin + the add-on service/repo/email helpers so the
// route's branching is exercised in isolation (no MP, no DB, no Resend network).
//
// FIX-5: a re-delivered one-shot add-on PAYMENT notification (same notificationId) must NOT
//        re-send the activation receipt email. The one-shot history row is keyed
//        `addon:<id>:oneshot` (never the notificationId), so before FIX-5 the top dedup missed
//        the redelivery and the receipt fired every time. FIX-5 makes the redelivery idempotent
//        (a subscription_events row keyed by notificationId short-circuits the second receipt).
//
// FIX-7: a recurring/stale-checkout PAYMENT whose status maps to 'expired' (refunded /
//        charged_back) must cancel ALL the coach's add-ons, block the coach (status='expired'),
//        and write an admin_audit_logs row action 'coach.payment_refunded_or_chargeback' with the
//        provider_payment_id. Idempotent. (It does NOT physically reverse the billing_snapshot.)
// ════════════════════════════════════════════════════════════════════════════════════

// ── webhook-authorization: token + signature default to valid; notification id is the DEDUP
//    key (FIX-5). All three are threaded through module-level vars so each test can flip them
//    (the 401 tests set tokenValid/sigValid to false). ──
let notificationId: string | null = 'notif-1'
let tokenValid = true
let sigValid = true
vi.mock('@/lib/payments/webhook-authorization', () => ({
    extractMercadoPagoNotificationId: () => notificationId,
    isPaymentsWebhookTokenValid: () => tokenValid,
    verifyMercadoPagoSignatureIfConfigured: () => sigValid,
}))

// ── Stateful service-role admin. Tracks subscription_events by provider_event_id (the
//    dedup store), records coaches.update patches, and records admin_audit_logs inserts. ──
type EventRow = { provider_event_id: string; [k: string]: unknown }
const subscriptionEvents = new Map<string, EventRow>()
// P0-4: provider_event_id de cada DELETE de subscription_events (clearUpgradeInFlight tras activar
// el tier-upgrade). Permite aseverar que el webhook libera el candado in-flight del coach.
const subscriptionEventDeletes: string[] = []
const coachUpdates: Array<Record<string, unknown>> = []
const auditLogInserts: Array<Record<string, unknown>> = []
// billing_snapshots upserts deduped by provider_payment_id (tier_upgrade_proration path).
const billingSnapshots = new Map<string, Record<string, unknown>>()
let coachRow: Record<string, unknown> | null
// P1-1 fallback: coach recovered by `subscription_mp_id === preapprovalId` when the refund
// notification omitted external_reference. Keyed by the preapproval id the route looks up.
const coachByPreapproval = new Map<string, { id: string }>()

const getUserById = vi.fn(async () => ({ data: { user: { email: 'juan@evatest.cl' } } }))

function makeAdmin() {
    return {
        auth: { admin: { getUserById: (...a: unknown[]) => getUserById(...(a as [])) } },
        from: vi.fn((table: string) => {
            if (table === 'subscription_events') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn((_col: string, value: string) => ({
                            maybeSingle: vi.fn(async () =>
                                subscriptionEvents.has(value)
                                    ? { data: { id: value }, error: null }
                                    : { data: null, error: null }
                            ),
                            // isUpgradeInFlight (no usado por estas ramas, pero el chain debe existir).
                            gt: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
                        })),
                    })),
                    upsert: vi.fn(async (row: EventRow) => {
                        if (row?.provider_event_id) subscriptionEvents.set(row.provider_event_id, row)
                        return { error: null }
                    }),
                    // clearUpgradeInFlight (P0-4): delete().eq('provider_event_id', key) — tras activar
                    // un tier-upgrade el webhook (backstop) limpia el candado in-flight del coach.
                    delete: vi.fn(() => ({
                        eq: vi.fn(async (_col: string, value: string) => {
                            subscriptionEventDeletes.push(value)
                            subscriptionEvents.delete(value)
                            return { error: null }
                        }),
                    })),
                }
            }
            if (table === 'coaches') {
                return {
                    // Column-aware: the P1-1 fallback selects `id` by `subscription_mp_id` (coach
                    // recovered from the preapproval id) — served from `coachByPreapproval`; every
                    // other lookup (the main flow's `.eq('id', coachId)`) returns the full `coachRow`.
                    select: vi.fn(() => ({
                        eq: vi.fn((col: string, value: string) => ({
                            maybeSingle: vi.fn(async () =>
                                col === 'subscription_mp_id'
                                    ? { data: coachByPreapproval.get(value) ?? null, error: null }
                                    : { data: coachRow, error: null }
                            ),
                        })),
                    })),
                    update: vi.fn((patch: Record<string, unknown>) => {
                        coachUpdates.push(patch)
                        return { eq: vi.fn(async () => ({ error: null })) }
                    }),
                }
            }
            if (table === 'admin_audit_logs') {
                return { insert: vi.fn(async (row: Record<string, unknown>) => { auditLogInserts.push(row); return { error: null } }) }
            }
            if (table === 'billing_snapshots') {
                // Espeja el CHECK billing_snapshots_kind_check de la DB: un kind fuera del allowlist
                // devuelve error (antes el mock lo aceptaba → enmascaraba el 23514 de prod).
                const ALLOWED_SNAPSHOT_KINDS = new Set(['recurring', 'addon_proration', 'tier_upgrade_proration'])
                return {
                    upsert: vi.fn(async (row: Record<string, unknown>) => {
                        if (!ALLOWED_SNAPSHOT_KINDS.has(String(row.kind))) {
                            return { error: { message: `billing_snapshots_kind_check: ${String(row.kind)}` } }
                        }
                        // dedup por provider_payment_id (ignoreDuplicates en el route).
                        const key = String(row.provider_payment_id)
                        if (!billingSnapshots.has(key)) billingSnapshots.set(key, row)
                        return { error: null }
                    }),
                }
            }
            return { select: vi.fn(), update: vi.fn(), insert: vi.fn(async () => ({ error: null })), upsert: vi.fn(async () => ({ error: null })) }
        }),
    }
}
let fakeAdmin = makeAdmin()
vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: vi.fn(() => fakeAdmin),
}))

// ── Provider: processWebhook returns a normalized result we control per test. The
//    add-on PUT port methods are present but unused by these branches. ──
const processWebhook = vi.fn()
const updateCheckoutAmount = vi.fn().mockResolvedValue(undefined)
// P0-1: el tier-upgrade del webhook reescribe monto + external_reference del preapproval (al nuevo
// tier|cycle) vía updateCheckoutAmountAndRef — no por updateCheckoutAmount.
const updateCheckoutAmountAndRef = vi.fn().mockResolvedValue(undefined)
const getPaymentsProvider = vi.fn(() => ({
    name: 'mercadopago' as const,
    processWebhook: (...a: unknown[]) => processWebhook(...a),
    updateCheckoutAmount: (...a: unknown[]) => updateCheckoutAmount(...a),
    updateCheckoutAmountAndRef: (...a: unknown[]) => updateCheckoutAmountAndRef(...a),
    cancelCheckoutAtProvider: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/payments/provider', () => ({
    getPaymentsProvider: () => getPaymentsProvider(),
}))

// ── coach-addons repository: cancelAllForCoach (FIX-7) + listLive (snapshots). ──
const cancelAllForCoach = vi.fn().mockResolvedValue(0)
const listLive = vi.fn().mockResolvedValue([])
vi.mock('@/infrastructure/db/coach-addons.repository', async (orig) => {
    const actual = await orig<typeof import('@/infrastructure/db/coach-addons.repository')>()
    return {
        ...actual,
        cancelAllForCoach: (...a: unknown[]) => cancelAllForCoach(...a),
        listLive: (...a: unknown[]) => listLive(...a),
    }
})

// ── addons.service: the one-shot materializer (FIX-5 path). ──
const materializeAddonFromOneShot = vi.fn()
vi.mock('@/services/billing/addons.service', async (orig) => {
    const actual = await orig<typeof import('@/services/billing/addons.service')>()
    return {
        ...actual,
        materializeAddonFromOneShot: (...a: unknown[]) => materializeAddonFromOneShot(...a),
    }
})

// ── addon-webhook.service: snapshot + breakdown helpers (keep them inert). applyFirstChargeToAddons
//    mockeado (B1): capturamos con qué ref (subscriptionMpId) lo llama el pipeline — para un coach Flow
//    debe ser el external_id, no el subscription_mp_id (null). ──
const insertBillingSnapshot = vi.fn().mockResolvedValue({ inserted: true })
const applyFirstChargeToAddons = vi.fn().mockResolvedValue({ markedIds: [], putApplied: false })
vi.mock('@/services/billing/addon-webhook.service', async (orig) => {
    const actual = await orig<typeof import('@/services/billing/addon-webhook.service')>()
    return {
        ...actual,
        insertBillingSnapshot: (...a: unknown[]) => insertBillingSnapshot(...a),
        applyFirstChargeToAddons: (...a: unknown[]) => applyFirstChargeToAddons(...a),
    }
})

// ── discount.service / coupons.service: el pipeline los llama en las ramas recurrente/canónica. Los
//    dejamos inertes (sin cupón por defecto) para aislar la lógica de ref del gateway. Un test de
//    cupón-expira flipea decrementCouponCycleForCharge a { expired: true }. ──
const resolveActiveDiscountSpec = vi.fn().mockResolvedValue(null)
const resolveActiveDiscountDetail = vi.fn().mockResolvedValue(null)
vi.mock('@/services/billing/discount.service', async (orig) => {
    const actual = await orig<typeof import('@/services/billing/discount.service')>()
    return {
        ...actual,
        resolveActiveDiscountSpec: (...a: unknown[]) => resolveActiveDiscountSpec(...a),
        resolveActiveDiscountDetail: (...a: unknown[]) => resolveActiveDiscountDetail(...a),
    }
})
const decrementCouponCycleForCharge = vi.fn().mockResolvedValue({ expired: false })
const revertActiveCouponForCoach = vi.fn().mockResolvedValue({ reverted: false })
vi.mock('@/services/billing/coupons.service', async (orig) => {
    const actual = await orig<typeof import('@/services/billing/coupons.service')>()
    return {
        ...actual,
        decrementCouponCycleForCharge: (...a: unknown[]) => decrementCouponCycleForCharge(...a),
        revertActiveCouponForCoach: (...a: unknown[]) => revertActiveCouponForCoach(...a),
    }
})

// ── Email: the activation receipt. We assert this is sent ONCE (first delivery) and NOT
//    again on a redelivery (FIX-5). ──
const sendTransactionalEmail = vi.fn().mockResolvedValue({ ok: true, providerMessageId: 'm1' })
vi.mock('@/lib/email/send-email', () => ({
    sendTransactionalEmail: (...a: unknown[]) => sendTransactionalEmail(...a),
}))

import { POST } from './route'

function makeRequest(): Request {
    return new Request('http://localhost/api/payments/webhook?token=t', {
        method: 'POST',
        body: JSON.stringify({ type: 'payment', data: { id: notificationId } }),
        headers: { 'content-type': 'application/json' },
    })
}

const PAID_COACH = {
    id: 'coach-1',
    subscription_status: 'active',
    subscription_tier: 'pro',
    billing_cycle: 'monthly',
    current_period_end: '2026-07-01T00:00:00.000Z',
    subscription_mp_id: 'preapproval-1',
    superseded_mp_preapproval_id: null,
}

beforeEach(() => {
    vi.clearAllMocks()
    subscriptionEvents.clear()
    subscriptionEventDeletes.length = 0
    billingSnapshots.clear()
    coachByPreapproval.clear()
    coachUpdates.length = 0
    auditLogInserts.length = 0
    fakeAdmin = makeAdmin()
    notificationId = 'notif-1'
    tokenValid = true
    sigValid = true
    coachRow = { ...PAID_COACH }
    cancelAllForCoach.mockResolvedValue(0)
    listLive.mockResolvedValue([])
    materializeAddonFromOneShot.mockResolvedValue({
        addon: { id: 'addon-1', moduleKey: 'cardio', priceClpMensual: 9990 },
    })
    getUserById.mockResolvedValue({ data: { user: { email: 'juan@evatest.cl' } } })
    sendTransactionalEmail.mockResolvedValue({ ok: true, providerMessageId: 'm1' })
    applyFirstChargeToAddons.mockResolvedValue({ markedIds: [], putApplied: false })
    resolveActiveDiscountSpec.mockResolvedValue(null)
    resolveActiveDiscountDetail.mockResolvedValue(null)
    decrementCouponCycleForCharge.mockResolvedValue({ expired: false })
    revertActiveCouponForCoach.mockResolvedValue({ reverted: false })
})

// ─────────────────────────────────────────────────────────────────────────────────────
// AUTH BOUNDARY: tras la extracción de Ola 1, la única responsabilidad restante de la ruta
// es rechazar token/firma inválidos (401) ANTES de delegar en runWebhookPipeline. Sin estos
// tests, invertir/borrar un guard en un merge dejaría la suite verde mientras el webhook
// procesa payloads forjados sin auth (un atacante manejaría subscription_status/tier/billing).
// ─────────────────────────────────────────────────────────────────────────────────────
describe('POST /api/payments/webhook — auth boundary (401 en token/firma inválidos)', () => {
    it('token inválido → 401 y NO invoca el pipeline (processWebhook nunca corre)', async () => {
        tokenValid = false
        const res = await POST(makeRequest())
        expect(res.status).toBe(401)
        expect(processWebhook).not.toHaveBeenCalled()
    })

    it('firma inválida → 401 y NO invoca el pipeline (processWebhook nunca corre)', async () => {
        // token válido, firma no → el segundo guard debe cortar igual.
        sigValid = false
        const res = await POST(makeRequest())
        expect(res.status).toBe(401)
        expect(processWebhook).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────────────
// FIX-5: one-shot add-on payment redelivery is idempotent (no second receipt)
// ─────────────────────────────────────────────────────────────────────────────────────
describe('POST /api/payments/webhook — FIX-5: one-shot redelivery sends NO second receipt', () => {
    function oneShotApprovedResult() {
        return {
            accepted: true,
            coachId: 'coach-1',
            eventKind: 'payment' as const,
            providerStatus: 'approved',
            providerPaymentId: 'pay-99',
            paidAt: '2026-06-13T12:00:00.000Z',
            oneShotAddon: { coachId: 'coach-1', moduleKey: 'cardio', termsVersion: 'v2-2026-06' },
        }
    }

    it('first delivery materializes the add-on and sends the receipt exactly once', async () => {
        processWebhook.mockResolvedValue(oneShotApprovedResult())
        const res = await POST(makeRequest())
        expect(res.status).toBe(200)
        expect(materializeAddonFromOneShot).toHaveBeenCalledOnce()
        expect(sendTransactionalEmail).toHaveBeenCalledOnce()
    })

    it('REDELIVERY (same notificationId) does NOT send a second receipt', async () => {
        processWebhook.mockResolvedValue(oneShotApprovedResult())
        // 1st delivery: receipt sent once, a dedup row keyed by notificationId is now present.
        await POST(makeRequest())
        expect(sendTransactionalEmail).toHaveBeenCalledTimes(1)

        // 2nd delivery of the SAME notification id → idempotent: NO additional receipt email.
        const res2 = await POST(makeRequest())
        expect(res2.status).toBe(200)
        expect(sendTransactionalEmail).toHaveBeenCalledTimes(1)
    })
})

// ─────────────────────────────────────────────────────────────────────────────────────
// Primer pago sin order.id: el primer `payment` aprobado de una suscripción de MP llega SIN
// order.id (providerCheckoutId null). El tier viene del external_reference, NO del checkout id →
// DEBE escribirse para que el coach no quede 'free' tras pagar (incidente Ani, jun-2026).
// ─────────────────────────────────────────────────────────────────────────────────────
describe('POST /api/payments/webhook — primer pago sin order.id escribe el tier (no queda free)', () => {
    function firstPaymentNoOrderId() {
        return {
            accepted: true,
            coachId: 'coach-1',
            eventKind: 'payment' as const,
            providerStatus: 'approved',
            providerPaymentId: 'pay-first-1',
            paidAt: '2026-06-24T02:50:34.000Z',
            // external_reference del preapproval → tier/ciclo resueltos…
            subscriptionTier: 'pro' as const,
            billingCycle: 'monthly' as const,
            currentPeriodEnd: '2026-07-24T02:50:35.430Z',
            // …pero el payment NO trae order.id → checkoutId null (el bug original).
            providerCheckoutId: undefined,
            oneShotAddon: null,
        }
    }

    const FREE_PENDING_COACH = {
        id: 'coach-1',
        subscription_status: 'pending_payment',
        subscription_tier: 'free',
        billing_cycle: 'monthly',
        current_period_end: null,
        subscription_mp_id: 'preapproval-aef',
        superseded_mp_preapproval_id: null,
    }

    it('coach free + pago aprobado SIN order.id → escribe tier=pro + max_clients=30, status active, sin pisar mp_id', async () => {
        coachRow = { ...FREE_PENDING_COACH }
        processWebhook.mockResolvedValue(firstPaymentNoOrderId())
        const res = await POST(makeRequest())
        expect(res.status).toBe(200)
        const patch = coachUpdates.find((p) => p.subscription_tier === 'pro')
        expect(patch).toBeTruthy()
        expect(patch!.max_clients).toBe(30)
        expect(patch!.billing_cycle).toBe('monthly')
        expect(patch!.subscription_status).toBe('active')
        // checkoutId null → NO sobrescribir subscription_mp_id (dejaría al coach sin con qué cobrar).
        expect('subscription_mp_id' in patch!).toBe(false)
    })

    it('mismo evento PERO con order.id presente (= preapproval) → escribe tier y SÍ setea subscription_mp_id', async () => {
        coachRow = { ...FREE_PENDING_COACH }
        processWebhook.mockResolvedValue({ ...firstPaymentNoOrderId(), providerCheckoutId: 'preapproval-aef' })
        const res = await POST(makeRequest())
        expect(res.status).toBe(200)
        const patch = coachUpdates.find((p) => p.subscription_tier === 'pro')
        expect(patch).toBeTruthy()
        expect(patch!.subscription_mp_id).toBe('preapproval-aef')
    })
})

// ─────────────────────────────────────────────────────────────────────────────────────
// FIX-7: refund / chargeback payment cancels add-ons + blocks coach + writes the audit row
// ─────────────────────────────────────────────────────────────────────────────────────
describe('POST /api/payments/webhook — FIX-7: refund/chargeback handler', () => {
    function refundResult(providerStatus: string) {
        return {
            accepted: true,
            // For a PAYMENT event MP's eventId === the payment/notification id; the route writes the
            // (stale-branch) subscription_events row keyed by eventId, so the top-level notificationId
            // dedup catches a genuine redelivery — modeling production faithfully.
            eventId: notificationId ?? undefined,
            coachId: 'coach-1',
            eventKind: 'payment' as const,
            providerStatus, // 'refunded' | 'charged_back' → mapProviderStatus → 'expired'
            providerPaymentId: 'pay-refund-1',
            paidAt: '2026-06-13T12:00:00.000Z',
            // A recurring payment carries order.id ≠ preapproval id → falls on the stale/recurring branch.
            providerCheckoutId: 'order-555',
            oneShotAddon: null,
        }
    }

    it("'refunded' → cancela todos los add-ons, bloquea al coach (expired) y escribe la fila de auditoría", async () => {
        cancelAllForCoach.mockResolvedValue(2)
        processWebhook.mockResolvedValue(refundResult('refunded'))
        const res = await POST(makeRequest())
        expect(res.status).toBe(200)

        // (a) add-ons cancelados
        expect(cancelAllForCoach).toHaveBeenCalledOnce()
        expect(cancelAllForCoach.mock.calls[0][1]).toBe('coach-1')

        // (b) coach bloqueado: algún coaches.update con subscription_status = 'expired'
        const expiredUpdate = coachUpdates.find((p) => p.subscription_status === 'expired')
        expect(expiredUpdate).toBeTruthy()

        // (c) fila de auditoría con la acción + el provider_payment_id
        const audit = auditLogInserts.find(
            (r) => r.action === 'coach.payment_refunded_or_chargeback'
        )
        expect(audit).toBeTruthy()
        expect(audit!.target_id).toBe('coach-1')
        const payload = audit!.payload as Record<string, unknown>
        expect(payload.provider_payment_id).toBe('pay-refund-1')
    })

    it("'charged_back' → mismo handler (también mapea a 'expired')", async () => {
        cancelAllForCoach.mockResolvedValue(1)
        processWebhook.mockResolvedValue(refundResult('charged_back'))
        const res = await POST(makeRequest())
        expect(res.status).toBe(200)
        expect(cancelAllForCoach).toHaveBeenCalledOnce()
        expect(coachUpdates.find((p) => p.subscription_status === 'expired')).toBeTruthy()
        expect(
            auditLogInserts.find((r) => r.action === 'coach.payment_refunded_or_chargeback')
        ).toBeTruthy()
    })

    it("un pago aprobado (NO refund) NO dispara el handler de refund/chargeback", async () => {
        processWebhook.mockResolvedValue({
            accepted: true,
            coachId: 'coach-1',
            eventKind: 'payment' as const,
            providerStatus: 'approved',
            providerPaymentId: 'pay-ok-1',
            paidAt: '2026-06-13T12:00:00.000Z',
            providerCheckoutId: 'order-555',
            oneShotAddon: null,
        })
        const res = await POST(makeRequest())
        expect(res.status).toBe(200)
        // No se canceló nada ni se escribió la auditoría de refund.
        expect(
            auditLogInserts.find((r) => r.action === 'coach.payment_refunded_or_chargeback')
        ).toBeFalsy()
        expect(coachUpdates.find((p) => p.subscription_status === 'expired')).toBeFalsy()
    })

    it("un cobro 'rejected' (decline transitorio / dunning) NO expira ni bloquea al coach", async () => {
        // mapProviderStatus('rejected') === 'expired', PERO el handler FIX-7 dispara con el ESTADO
        // CRUDO refunded/charged_back, no con 'expired' → un decline transitorio NO debe nukear a un
        // coach con período pagado vigente (eso lo maneja la rama terminal, no este handler).
        processWebhook.mockResolvedValue({
            accepted: true,
            coachId: 'coach-1',
            eventKind: 'payment' as const,
            providerStatus: 'rejected',
            providerPaymentId: 'pay-rej-1',
            paidAt: '2026-06-13T12:00:00.000Z',
            providerCheckoutId: 'order-555',
            oneShotAddon: null,
        })
        const res = await POST(makeRequest())
        expect(res.status).toBe(200)
        expect(cancelAllForCoach).not.toHaveBeenCalled()
        expect(
            auditLogInserts.find((r) => r.action === 'coach.payment_refunded_or_chargeback')
        ).toBeFalsy()
        expect(coachUpdates.find((p) => p.subscription_status === 'expired')).toBeFalsy()
    })

    it('refund REDELIVERY (mismo notificationId) es idempotente vía el dedup top-level', async () => {
        cancelAllForCoach.mockResolvedValue(2)
        processWebhook.mockResolvedValue(refundResult('refunded'))
        await POST(makeRequest())
        const firstAuditCount = auditLogInserts.filter(
            (r) => r.action === 'coach.payment_refunded_or_chargeback'
        ).length
        expect(firstAuditCount).toBe(1)

        // Redelivery con el mismo notificationId → el dedup top-level corta antes de reprocesar.
        const res2 = await POST(makeRequest())
        expect(res2.status).toBe(200)
        const secondAuditCount = auditLogInserts.filter(
            (r) => r.action === 'coach.payment_refunded_or_chargeback'
        ).length
        expect(secondAuditCount).toBe(1)
    })
})

// ─────────────────────────────────────────────────────────────────────────────────────
// P1-1: REFUND FALLBACK by preapproval id (money-safety). MP sometimes OMITS external_reference
// on a refund/chargeback PAYMENT notification → processWebhook yields NO coachId. Before the fix
// the route returned at 'accepted without coachId' and the refund was SILENTLY MISSED (coach stays
// active, no audit row). Now: if eventKind='payment' + status refunded/charged_back + preapprovalId,
// the route recovers the coach by `subscription_mp_id === preapprovalId` and CONTINUES into FIX-7.
// ─────────────────────────────────────────────────────────────────────────────────────
describe('POST /api/payments/webhook — P1-1: refund fallback by preapproval id (no external_reference)', () => {
    // A refund PAYMENT with NO coachId (external_reference dropped) but a metadata.preapproval_id.
    function refundNoCoachId(providerStatus: string, preapprovalId: string | null) {
        return {
            accepted: true,
            // coachId ABSENT (external_reference omitted by MP) — this is the whole point of the fix.
            coachId: undefined,
            eventKind: 'payment' as const,
            providerStatus, // refunded | charged_back
            providerPaymentId: 'pay-refund-fallback-1',
            paidAt: '2026-06-13T12:00:00.000Z',
            providerCheckoutId: 'order-777', // order id ≠ preapproval id (recurring payment shape)
            oneShotAddon: null,
            preapprovalId, // metadata.preapproval_id surfaced by processWebhook (P1-1)
        }
    }

    it("refunded sin coachId pero con preapproval_id que matchea subscription_mp_id → recupera al coach y CORRE FIX-7 (cancela add-ons, bloquea, audita)", async () => {
        // El preapproval del pago apunta al mp_id del coach → el fallback lo recupera.
        coachByPreapproval.set('preapproval-1', { id: 'coach-1' })
        coachRow = { ...PAID_COACH } // subscription_mp_id: 'preapproval-1'
        cancelAllForCoach.mockResolvedValue(2)
        processWebhook.mockResolvedValue(refundNoCoachId('refunded', 'preapproval-1'))

        const res = await POST(makeRequest())
        expect(res.status).toBe(200)

        // (a) add-ons cancelados para el coach recuperado
        expect(cancelAllForCoach).toHaveBeenCalledOnce()
        expect(cancelAllForCoach.mock.calls[0][1]).toBe('coach-1')

        // (b) coach bloqueado (status='expired')
        expect(coachUpdates.find((p) => p.subscription_status === 'expired')).toBeTruthy()

        // (c) fila de auditoría con la acción + el provider_payment_id
        const audit = auditLogInserts.find(
            (r) => r.action === 'coach.payment_refunded_or_chargeback'
        )
        expect(audit).toBeTruthy()
        expect(audit!.target_id).toBe('coach-1')
        expect((audit!.payload as Record<string, unknown>).provider_payment_id).toBe(
            'pay-refund-fallback-1'
        )
    })

    it("charged_back sin coachId pero con preapproval_id matcheable → mismo fallback + FIX-7", async () => {
        coachByPreapproval.set('preapproval-1', { id: 'coach-1' })
        coachRow = { ...PAID_COACH }
        cancelAllForCoach.mockResolvedValue(1)
        processWebhook.mockResolvedValue(refundNoCoachId('charged_back', 'preapproval-1'))

        const res = await POST(makeRequest())
        expect(res.status).toBe(200)
        expect(cancelAllForCoach).toHaveBeenCalledOnce()
        expect(coachUpdates.find((p) => p.subscription_status === 'expired')).toBeTruthy()
        expect(
            auditLogInserts.find((r) => r.action === 'coach.payment_refunded_or_chargeback')
        ).toBeTruthy()
    })

    it("refunded con preapproval_id que NO matchea ningún coach → early return, CERO mutaciones", async () => {
        // El preapproval del pago no existe en coaches → el fallback no recupera coachId.
        // (coachByPreapproval vacío)
        processWebhook.mockResolvedValue(refundNoCoachId('refunded', 'preapproval-DESCONOCIDO'))

        const res = await POST(makeRequest())
        expect(res.status).toBe(200)
        // Nada: ni cancelación, ni bloqueo, ni auditoría (el refund queda sin coach al que aplicar).
        expect(cancelAllForCoach).not.toHaveBeenCalled()
        expect(coachUpdates.find((p) => p.subscription_status === 'expired')).toBeFalsy()
        expect(
            auditLogInserts.find((r) => r.action === 'coach.payment_refunded_or_chargeback')
        ).toBeFalsy()
    })

    it("refunded SIN coachId y SIN preapprovalId → el fallback ni se intenta: early return, CERO mutaciones", async () => {
        processWebhook.mockResolvedValue(refundNoCoachId('refunded', null))
        const res = await POST(makeRequest())
        expect(res.status).toBe(200)
        expect(cancelAllForCoach).not.toHaveBeenCalled()
        expect(coachUpdates.find((p) => p.subscription_status === 'expired')).toBeFalsy()
        expect(
            auditLogInserts.find((r) => r.action === 'coach.payment_refunded_or_chargeback')
        ).toBeFalsy()
    })

    it("un PAGO APROBADO (no refund) sin coachId pero con preapproval_id → el fallback NO aplica (solo refund/chargeback)", async () => {
        // El fallback solo recupera coach para refunded/charged_back: un approved sin coachId NO debe
        // recuperar al coach por preapproval (no es el caso de money-safety que motiva el fallback).
        coachByPreapproval.set('preapproval-1', { id: 'coach-1' })
        coachRow = { ...PAID_COACH }
        processWebhook.mockResolvedValue({
            ...refundNoCoachId('approved', 'preapproval-1'),
            providerPaymentId: 'pay-ok-no-coach',
        })
        const res = await POST(makeRequest())
        expect(res.status).toBe(200)
        // Ni se intentó cancelar/auditar: el approved sin coachId cae al early-return de siempre.
        expect(cancelAllForCoach).not.toHaveBeenCalled()
        expect(
            auditLogInserts.find((r) => r.action === 'coach.payment_refunded_or_chargeback')
        ).toBeFalsy()
        expect(coachUpdates.find((p) => p.subscription_status === 'expired')).toBeFalsy()
    })
})

// ─────────────────────────────────────────────────────────────────────────────────────
// B1: cobro RECURRENTE de un coach FLOW (subscription_provider='flow', subscription_mp_id=null,
// external_id presente). El ref de la sub para el first-charge de add-ons y el PUT del cupón-expira
// DEBE resolverse al external_id — no al subscription_mp_id (null) → antes esos hooks JAMÁS corrían
// para Flow (add-ons sin first_charged_at → overcharge en la baja; cupón que no expira → undercharge).
// ─────────────────────────────────────────────────────────────────────────────────────
describe('POST /api/payments/webhook — B1: cobro recurrente de coach Flow usa el ref del gateway', () => {
    const FLOW_COACH = {
        id: 'coach-1',
        subscription_status: 'active',
        subscription_tier: 'pro',
        billing_cycle: 'monthly',
        current_period_end: '2026-07-01T00:00:00.000Z',
        subscription_mp_id: null, // un coach Flow NO tiene preapproval MP
        superseded_mp_preapproval_id: null,
        subscription_provider: 'flow',
        subscription_provider_external_id: 'flowsub-1',
    }

    function flowRecurringApproved() {
        return {
            accepted: true,
            coachId: 'coach-1',
            eventKind: 'payment' as const,
            isRecurringAuthorizedPayment: true,
            providerStatus: 'approved',
            providerPaymentId: 'invoice:9001',
            paidAt: '2026-06-13T12:00:00.000Z',
            currentPeriodEnd: '2026-08-01T00:00:00.000Z',
        }
    }

    it('approved → applyFirstChargeToAddons corre con el ref FLOW (external_id), no con mp_id null', async () => {
        coachRow = { ...FLOW_COACH }
        processWebhook.mockResolvedValue(flowRecurringApproved())
        const res = await POST(makeRequest())
        expect(res.status).toBe(200)
        expect(applyFirstChargeToAddons).toHaveBeenCalledOnce()
        const ctx = applyFirstChargeToAddons.mock.calls[0][2] as { subscriptionMpId: string }
        expect(ctx.subscriptionMpId).toBe('flowsub-1')
    })

    it('cupón expira en este cobro → updateCheckoutAmount al ref FLOW (external_id)', async () => {
        coachRow = { ...FLOW_COACH }
        decrementCouponCycleForCharge.mockResolvedValue({ expired: true })
        processWebhook.mockResolvedValue(flowRecurringApproved())
        const res = await POST(makeRequest())
        expect(res.status).toBe(200)
        expect(updateCheckoutAmount).toHaveBeenCalledOnce()
        expect(updateCheckoutAmount.mock.calls[0][0]).toBe('flowsub-1')
    })

    it('coach MP (mismo cobro recurrente): SIN regresión — el ref es el subscription_mp_id', async () => {
        coachRow = { ...PAID_COACH } // subscription_mp_id 'preapproval-1', provider default (no flow)
        processWebhook.mockResolvedValue(flowRecurringApproved())
        const res = await POST(makeRequest())
        expect(res.status).toBe(200)
        expect(applyFirstChargeToAddons).toHaveBeenCalledOnce()
        const ctx = applyFirstChargeToAddons.mock.calls[0][2] as { subscriptionMpId: string }
        expect(ctx.subscriptionMpId).toBe('preapproval-1')
    })
})

// ─────────────────────────────────────────────────────────────────────────────────────
// tier-upgrade one-shot (plan estrategia 06, C4): backstop idempotente de confirm-upgrade.
// El webhook corre la MISMA activación rank-guarded (tier+max_clients+cycle) + PUT al nuevo
// compuesto y escribe el snapshot kind='tier_upgrade_proration' deduped por provider_payment_id.
// Seguro en cualquier orden respecto a confirm-upgrade (ambos rank-guarded + snapshot/event dedup).
// ─────────────────────────────────────────────────────────────────────────────────────
describe('POST /api/payments/webhook — tier-upgrade one-shot (idempotente con confirm-upgrade)', () => {
    function tierUpgradeResult() {
        return {
            accepted: true,
            coachId: 'coach-1',
            eventKind: 'payment' as const,
            providerStatus: 'approved',
            providerPaymentId: 'pay-upg-1',
            paidAt: '2026-06-13T12:00:00.000Z',
            tierUpgrade: { coachId: 'coach-1', newTier: 'elite' as const, cycle: 'monthly' as const },
            oneShotAddon: null,
        }
    }

    it('approved + rank menor (pro→elite): activa tier+max_clients+cycle, hace el PUT con ref reescrito (P0-1), snapshot, y limpia el candado (P0-4)', async () => {
        coachRow = { ...PAID_COACH } // pro, mp_id presente
        processWebhook.mockResolvedValue(tierUpgradeResult())
        const res = await POST(makeRequest())
        expect(res.status).toBe(200)

        // (a) activación rank-guarded: coaches.update al destino completo.
        const activate = coachUpdates.find((p) => p.subscription_tier === 'elite')
        expect(activate).toBeTruthy()
        expect(activate!.max_clients).toBe(100) // elite
        expect(activate!.billing_cycle).toBe('monthly')
        expect(activate).not.toHaveProperty('subscription_status') // status intacto

        // (b) P0-1: PUT del preapproval al nuevo compuesto Y reescritura del external_reference al
        //     NUEVO tier|cycle — vía updateCheckoutAmountAndRef, NO updateCheckoutAmount. Sin esto el
        //     siguiente evento preapproval re-derivaría el tier VIEJO y revertiría el upgrade.
        expect(updateCheckoutAmount).not.toHaveBeenCalled()
        expect(updateCheckoutAmountAndRef).toHaveBeenCalledOnce()
        expect(updateCheckoutAmountAndRef.mock.calls[0][0]).toBe('preapproval-1')
        const refArg = updateCheckoutAmountAndRef.mock.calls[0][2] as string
        expect(refArg).toContain('elite') // ref apunta al NUEVO tier
        expect(refArg).not.toContain('|pro|')

        // (c) snapshot kind='tier_upgrade_proration' deduped por provider_payment_id.
        const snap = billingSnapshots.get('pay-upg-1')
        expect(snap).toBeTruthy()
        expect(snap!.kind).toBe('tier_upgrade_proration')
        expect(snap!.tier).toBe('elite')

        // (d) evento de historial keyed `tier_upgrade:${paymentId}` (misma key que confirm-upgrade).
        expect(subscriptionEvents.has('tier_upgrade:pay-upg-1')).toBe(true)

        // (e) P0-4: el candado in-flight del coach se limpia (DELETE keyed por tier_upgrade_pending).
        expect(subscriptionEventDeletes).toContain('tier_upgrade_pending:coach-1')
    })

    it('coach YA en elite (confirm-upgrade activó primero): rank-guard no-op del write, igual PUT(ref) + snapshot', async () => {
        coachRow = { ...PAID_COACH, subscription_tier: 'elite' }
        processWebhook.mockResolvedValue(tierUpgradeResult())
        const res = await POST(makeRequest())
        expect(res.status).toBe(200)
        // Rank-guard: elite no es < elite → NO hay coaches.update que setee tier.
        expect(coachUpdates.find((p) => p.subscription_tier === 'elite')).toBeFalsy()
        // El PUT (con ref) y el snapshot igual corren (idempotentes/determinísticos).
        expect(updateCheckoutAmountAndRef).toHaveBeenCalledOnce()
        expect(billingSnapshots.get('pay-upg-1')).toBeTruthy()
    })

    it('REDELIVERY (mismo notificationId) es idempotente: ni segunda activación ni snapshot duplicado', async () => {
        coachRow = { ...PAID_COACH }
        processWebhook.mockResolvedValue(tierUpgradeResult())
        // 1ª entrega: activa + snapshot + escribe el marker keyed por notificationId.
        await POST(makeRequest())
        const updatesAfterFirst = coachUpdates.length
        expect(billingSnapshots.size).toBe(1)

        // 2ª entrega de la MISMA notificación → el dedup top-level corta antes de reprocesar.
        const res2 = await POST(makeRequest())
        expect(res2.status).toBe(200)
        expect(coachUpdates.length).toBe(updatesAfterFirst) // sin segunda activación
        expect(billingSnapshots.size).toBe(1) // snapshot deduped por provider_payment_id
    })

    it('pending → NO activa (tier intacto, cero PUT, cero snapshot)', async () => {
        coachRow = { ...PAID_COACH }
        processWebhook.mockResolvedValue({ ...tierUpgradeResult(), providerStatus: 'pending' })
        const res = await POST(makeRequest())
        expect(res.status).toBe(200)
        expect(coachUpdates.find((p) => p.subscription_tier === 'elite')).toBeFalsy()
        expect(updateCheckoutAmountAndRef).not.toHaveBeenCalled()
        expect(billingSnapshots.size).toBe(0)
    })

    it('coach sin preapproval (mp_id null): no hay dónde aplicar el PUT → no activa ni hace PUT', async () => {
        coachRow = { ...PAID_COACH, subscription_mp_id: null }
        processWebhook.mockResolvedValue(tierUpgradeResult())
        const res = await POST(makeRequest())
        expect(res.status).toBe(200)
        expect(updateCheckoutAmountAndRef).not.toHaveBeenCalled()
        expect(coachUpdates.find((p) => p.subscription_tier === 'elite')).toBeFalsy()
    })
})
