import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MercadoPagoProvider } from './mercadopago'

// ── P0-1 ────────────────────────────────────────────────────────────────────────────────────
// El cobro recurrente de suscripción llega como `subscription_authorized_payment`. Antes caía en
// `includes('subscription')` → `GET /preapproval/{authpay_id}` → 404 → 502, y la renovación nunca se
// confirmaba. Este test asevera que ahora el evento se rutea a `/authorized_payments/{id}`, se mapea a
// un payment recurrente idempotente (preapproval_id para el match, payment.id para el snapshot) y NO
// toca `/preapproval/{authpay_id}`.

const ORIGINAL_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN
beforeEach(() => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-test-token'
})
afterEach(() => {
    vi.restoreAllMocks()
    if (ORIGINAL_TOKEN === undefined) delete process.env.MERCADOPAGO_ACCESS_TOKEN
    else process.env.MERCADOPAGO_ACCESS_TOKEN = ORIGINAL_TOKEN
})

function mockFetchByPath(map: Record<string, unknown>): () => string[] {
    const calls: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input)
        calls.push(url)
        for (const [frag, body] of Object.entries(map)) {
            if (url.includes(frag)) {
                return new Response(JSON.stringify(body), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                })
            }
        }
        return new Response('{"message":"not found"}', { status: 404 })
    })
    return () => calls
}

describe('processWebhook — subscription_authorized_payment (cobro recurrente, P0-1)', () => {
    it('rutea a /authorized_payments (NO /preapproval) y mapea un payment recurrente aprobado', async () => {
        const getCalls = mockFetchByPath({
            '/authorized_payments/AP123': {
                id: 'AP123',
                preapproval_id: 'PRE999',
                external_reference: 'coach-1|pro|monthly',
                status: 'processed',
                payment: { id: 555, status: 'approved' },
                last_modified: '2026-07-16T00:00:00Z',
            },
            '/preapproval/PRE999': { id: 'PRE999', next_payment_date: '2026-08-16T00:00:00Z' },
        })

        const provider = new MercadoPagoProvider()
        const res = await provider.processWebhook({
            type: 'subscription_authorized_payment',
            data: { id: 'AP123' },
        })

        expect(res.eventKind).toBe('payment')
        expect(res.isRecurringAuthorizedPayment).toBe(true)
        expect(res.providerStatus).toBe('approved')
        expect(res.providerPaymentId).toBe('555')
        expect(res.preapprovalId).toBe('PRE999')
        expect(res.coachId).toBe('coach-1')
        expect(res.subscriptionTier).toBe('pro')
        expect(res.currentPeriodEnd).toBe('2026-08-16T00:00:00Z')

        // El bug original: NUNCA debe pegarle a /preapproval/AP123 (el id es de authorized_payment).
        const calls = getCalls()
        expect(calls.some((u) => u.includes('/authorized_payments/AP123'))).toBe(true)
        expect(calls.some((u) => u.includes('/preapproval/AP123'))).toBe(false)
    })

    it('rechazado: providerStatus refleja el decline (insumo del dunning P0-2)', async () => {
        mockFetchByPath({
            '/authorized_payments/AP124': {
                id: 'AP124',
                preapproval_id: 'PRE999',
                external_reference: 'coach-1|pro|monthly',
                payment: { id: 556, status: 'rejected' },
            },
            '/preapproval/PRE999': { id: 'PRE999', next_payment_date: '2026-08-16T00:00:00Z' },
        })

        const provider = new MercadoPagoProvider()
        const res = await provider.processWebhook({
            type: 'subscription_authorized_payment',
            data: { id: 'AP124' },
        })

        expect(res.isRecurringAuthorizedPayment).toBe(true)
        expect(res.providerStatus).toBe('rejected')
        expect(res.providerPaymentId).toBe('556')
    })
})
