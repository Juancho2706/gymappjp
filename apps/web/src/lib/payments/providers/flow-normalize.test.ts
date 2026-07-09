import { describe, expect, it } from 'vitest'
import {
    normalizeFlowOneShotPayment,
    normalizeFlowRecurringInvoice,
    normalizeFlowSubscriptionLifecycle,
    normalizeFlowRefund,
    parseFlowDate,
    parseFlowRecurringCommerceOrder,
    type FlowInvoice,
} from './flow-normalize'

// flow-normalize es money code: traduce respuestas de Flow → resultado que decide si al coach le
// cobraron y por cuanto. Enums confirmados contra el OpenAPI oficial de Flow. coachId de one-shots
// sale del commerceOrder (nuestro ref); en recurrentes/lifecycle/refund se pasa resuelto por DB.
const COACH = 'coach-1'
const ADDON_ORDER = `addon_oneshot|${COACH}|cardio|v2-2026-06`
const UPGRADE_ORDER = `tier_upgrade|${COACH}|pro|monthly`

describe('parseFlowDate', () => {
    it('convierte `yyyy-mm-dd hh:mm:ss` a ISO-parseable (T en vez de espacio)', () => {
        expect(parseFlowDate('2026-07-05 14:30:00')).toBe('2026-07-05T14:30:00')
    })
    it('deja `yyyy-mm-dd` tal cual', () => {
        expect(parseFlowDate('2026-07-05')).toBe('2026-07-05')
    })
    it('null/vacio → null', () => {
        expect(parseFlowDate(null)).toBeNull()
        expect(parseFlowDate('   ')).toBeNull()
        expect(parseFlowDate(undefined)).toBeNull()
    })
})

describe('parseFlowRecurringCommerceOrder', () => {
    it('parsea el commerceOrder generado por Flow (captura real sandbox)', () => {
        expect(parseFlowRecurringCommerceOrder('sus_f7254c813f_1167928_2026-07-05 19:55'))
            .toEqual({ subscriptionId: 'sus_f7254c813f', invoiceId: '1167928' })
    })
    it('nuestros refs one-shot NO matchean (no arrancan con sus_)', () => {
        expect(parseFlowRecurringCommerceOrder('addon_oneshot|c1|cardio|v2')).toBeNull()
        expect(parseFlowRecurringCommerceOrder('tier_upgrade|c1|pro|monthly')).toBeNull()
    })
    it('null/vacio/basura → null', () => {
        expect(parseFlowRecurringCommerceOrder(null)).toBeNull()
        expect(parseFlowRecurringCommerceOrder('sus_singuionbajo')).toBeNull()
    })
})

describe('normalizeFlowOneShotPayment — add-on / tier-upgrade one-shot', () => {
    it('add-on PAGADO (status 2) → approved + oneShotAddon + coachId del commerceOrder', () => {
        const r = normalizeFlowOneShotPayment({
            flowOrder: 987654,
            commerceOrder: ADDON_ORDER,
            status: 2,
            paymentData: { date: '2026-07-05 12:00:00', amount: 9990, media: 'webpay' },
        })
        expect(r.accepted).toBe(true)
        expect(r.eventKind).toBe('payment')
        expect(r.providerStatus).toBe('approved')
        expect(r.coachId).toBe(COACH)
        expect(r.providerPaymentId).toBe('987654')
        expect(r.paidAt).toBe('2026-07-05T12:00:00')
        expect(r.oneShotAddon).toEqual({ coachId: COACH, moduleKey: 'cardio', termsVersion: 'v2-2026-06' })
        expect(r.tierUpgrade).toBeNull()
    })

    it('tier-upgrade PAGADO → approved + tierUpgrade (no addon)', () => {
        const r = normalizeFlowOneShotPayment({ flowOrder: 111, commerceOrder: UPGRADE_ORDER, status: 2 })
        expect(r.accepted).toBe(true)
        expect(r.tierUpgrade).toEqual({ coachId: COACH, newTier: 'pro', cycle: 'monthly' })
        expect(r.oneShotAddon).toBeNull()
        expect(r.providerStatus).toBe('approved')
    })

    it('status 3 (rechazada) → rejected', () => {
        expect(normalizeFlowOneShotPayment({ commerceOrder: ADDON_ORDER, status: 3 }).providerStatus).toBe('rejected')
    })
    it('status 4 (anulada) → rejected (no hubo cobro exitoso)', () => {
        expect(normalizeFlowOneShotPayment({ commerceOrder: ADDON_ORDER, status: 4 }).providerStatus).toBe('rejected')
    })
    it('status 1 (pendiente) → pending', () => {
        expect(normalizeFlowOneShotPayment({ commerceOrder: ADDON_ORDER, status: 1 }).providerStatus).toBe('pending')
    })
    it('status como STRING "2" (Flow stringifica) → approved igual (coercion Number)', () => {
        expect(normalizeFlowOneShotPayment({ commerceOrder: ADDON_ORDER, status: '2' }).providerStatus).toBe('approved')
    })
    it('commerceOrder NO reconocido → accepted:false (no adivina coachId)', () => {
        expect(normalizeFlowOneShotPayment({ commerceOrder: 'basura|xxx', status: 2 }).accepted).toBe(false)
        expect(normalizeFlowOneShotPayment({ commerceOrder: null, status: 2 }).accepted).toBe(false)
    })
})

describe('normalizeFlowRecurringInvoice — cobro recurrente', () => {
    const paidInvoice: FlowInvoice = {
        id: 5001,
        subscriptionId: 'sub_abc',
        amount: 14990,
        period_start: '2026-07-01',
        period_end: '2026-08-01',
        status: 1,
        payment: { flowOrder: 777001, status: 2, paymentData: { date: '2026-07-01 09:15:00', amount: 14990 } },
    }

    it('invoice PAGADA (status 1) → approved + recurrente + period_end + clave estable por invoice.id', () => {
        const r = normalizeFlowRecurringInvoice(paidInvoice, COACH)
        expect(r.accepted).toBe(true)
        expect(r.isRecurringAuthorizedPayment).toBe(true)
        expect(r.providerStatus).toBe('approved')
        expect(r.coachId).toBe(COACH)
        expect(r.providerPaymentId).toBe('invoice:5001') // clave ESTABLE = id de invoice, no el flowOrder condicional
        expect(r.paidAt).toBe('2026-07-01T09:15:00')
        expect(r.currentPeriodEnd).toBe('2026-08-01')
    })

    it('idempotencia: la MISMA invoice da la MISMA clave con y sin payment.flowOrder poblado', () => {
        const conFlowOrder = normalizeFlowRecurringInvoice(paidInvoice, COACH)
        const sinFlowOrder = normalizeFlowRecurringInvoice({ ...paidInvoice, payment: { status: 2, paymentData: { date: '2026-07-01' } } }, COACH)
        expect(conFlowOrder.providerPaymentId).toBe('invoice:5001')
        expect(sinFlowOrder.providerPaymentId).toBe('invoice:5001')
        expect(conFlowOrder.providerPaymentId).toBe(sinFlowOrder.providerPaymentId)
    })

    it('invoice IMPAGA (status 0) → rejected (dunning), sin paidAt ni period advance', () => {
        const r = normalizeFlowRecurringInvoice({ ...paidInvoice, status: 0, payment: null }, COACH)
        expect(r.providerStatus).toBe('rejected')
        expect(r.isRecurringAuthorizedPayment).toBe(true)
        expect(r.paidAt).toBeNull()
        expect(r.currentPeriodEnd).toBeNull()
    })

    it('invoice ANULADA (status 2) → no-op terminal: accepted:true SIN coachId (ack 200, sin dunning ni retry-loop)', () => {
        const r = normalizeFlowRecurringInvoice({ ...paidInvoice, status: 2 }, COACH)
        expect(r.accepted).toBe(true)
        expect(r.coachId).toBeUndefined()
        expect(r.providerStatus).toBeUndefined()
    })

    it('status DESCONOCIDO/null/NaN → no-op terminal (NO dunning falso por schema drift)', () => {
        for (const bad of [null, undefined, 3, '', 'abc'] as const) {
            const r = normalizeFlowRecurringInvoice({ ...paidInvoice, status: bad as never }, COACH)
            expect(r.accepted).toBe(true)
            expect(r.coachId).toBeUndefined()
            expect(r.providerStatus).toBeUndefined()
        }
    })

    it('status como STRING "1" (Flow stringifica) → approved igual (coercion Number)', () => {
        const r = normalizeFlowRecurringInvoice({ ...paidInvoice, status: '1' }, COACH)
        expect(r.providerStatus).toBe('approved')
        expect(r.currentPeriodEnd).toBe('2026-08-01')
    })
})

describe('normalizeFlowSubscriptionLifecycle', () => {
    it('status 1 (activa) → authorized', () => {
        expect(normalizeFlowSubscriptionLifecycle({ subscriptionId: 'sub_1', status: 1, period_end: '2026-08-01' }, COACH))
            .toMatchObject({ accepted: true, eventKind: 'preapproval', providerStatus: 'authorized', coachId: COACH, providerCheckoutId: 'sub_1', currentPeriodEnd: '2026-08-01' })
    })
    it('status 2 (trial) → trialing', () => {
        expect(normalizeFlowSubscriptionLifecycle({ status: 2 }, COACH).providerStatus).toBe('trialing')
    })
    it('status 4 (cancelada) → cancelled', () => {
        expect(normalizeFlowSubscriptionLifecycle({ status: 4 }, COACH).providerStatus).toBe('cancelled')
    })
    it('status 0 (inactivo) → pending', () => {
        expect(normalizeFlowSubscriptionLifecycle({ status: 0 }, COACH).providerStatus).toBe('pending')
    })
    it('status como STRING "1" → authorized (coercion Number)', () => {
        expect(normalizeFlowSubscriptionLifecycle({ status: '1' }, COACH).providerStatus).toBe('authorized')
    })
})

describe('normalizeFlowRefund', () => {
    it("status 'refunded' → emite providerStatus:'refunded' (Ola 3 debe cancelar la sub en Flow, ver docstring)", () => {
        const r = normalizeFlowRefund({ flowRefundOrder: 'ref_99', status: 'refunded', amount: 14990 }, COACH)
        expect(r).toMatchObject({ accepted: true, eventKind: 'payment', providerStatus: 'refunded', coachId: COACH, providerPaymentId: 'ref_99' })
    })
    it("status 'accepted'/'created'/'rejected' → accepted:false (aun no mueve plata)", () => {
        expect(normalizeFlowRefund({ status: 'accepted' }, COACH).accepted).toBe(false)
        expect(normalizeFlowRefund({ status: 'created' }, COACH).accepted).toBe(false)
        expect(normalizeFlowRefund({ status: 'rejected' }, COACH).accepted).toBe(false)
    })
})
