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

// ── webhook-authorization: token + signature always valid here; notification id is the
//    DEDUP key (FIX-5). We thread it through a module-level var so each test can set it. ──
let notificationId: string | null = 'notif-1'
vi.mock('@/lib/payments/webhook-authorization', () => ({
    extractMercadoPagoNotificationId: () => notificationId,
    isPaymentsWebhookTokenValid: () => true,
    verifyMercadoPagoSignatureIfConfigured: () => true,
}))

// ── Stateful service-role admin. Tracks subscription_events by provider_event_id (the
//    dedup store), records coaches.update patches, and records admin_audit_logs inserts. ──
type EventRow = { provider_event_id: string; [k: string]: unknown }
const subscriptionEvents = new Map<string, EventRow>()
const coachUpdates: Array<Record<string, unknown>> = []
const auditLogInserts: Array<Record<string, unknown>> = []
let coachRow: Record<string, unknown> | null

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
                        })),
                    })),
                    upsert: vi.fn(async (row: EventRow) => {
                        if (row?.provider_event_id) subscriptionEvents.set(row.provider_event_id, row)
                        return { error: null }
                    }),
                }
            }
            if (table === 'coaches') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: coachRow, error: null })) })),
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
const getPaymentsProvider = vi.fn(() => ({
    name: 'mercadopago' as const,
    processWebhook: (...a: unknown[]) => processWebhook(...a),
    updateCheckoutAmount: (...a: unknown[]) => updateCheckoutAmount(...a),
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

// ── addon-webhook.service: snapshot + breakdown helpers (keep them inert). ──
const insertBillingSnapshot = vi.fn().mockResolvedValue({ inserted: true })
vi.mock('@/services/billing/addon-webhook.service', async (orig) => {
    const actual = await orig<typeof import('@/services/billing/addon-webhook.service')>()
    return {
        ...actual,
        insertBillingSnapshot: (...a: unknown[]) => insertBillingSnapshot(...a),
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
    coachUpdates.length = 0
    auditLogInserts.length = 0
    fakeAdmin = makeAdmin()
    notificationId = 'notif-1'
    coachRow = { ...PAID_COACH }
    cancelAllForCoach.mockResolvedValue(0)
    listLive.mockResolvedValue([])
    materializeAddonFromOneShot.mockResolvedValue({
        addon: { id: 'addon-1', moduleKey: 'cardio', priceClpMensual: 9990 },
    })
    getUserById.mockResolvedValue({ data: { user: { email: 'juan@evatest.cl' } } })
    sendTransactionalEmail.mockResolvedValue({ ok: true, providerMessageId: 'm1' })
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
