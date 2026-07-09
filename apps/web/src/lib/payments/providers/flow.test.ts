import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FlowProvider } from './flow'
import { signFlowParams } from './flow-signature'

// processWebhook resuelve el coachId de un cobro recurrente por subscriptionId → coaches (service-role).
// Mock del cliente admin: `coachIdBySub` controla el resultado del lookup; `coachLookupError` simula un
// fallo transitorio de DB (para chequear que NO se confunde con huerfano).
let coachIdBySub: string | null = 'coach-flow-1'
let coachLookupError: { message: string } | null = null
// updateCheckoutAmount resuelve tier/cycle por otro select (subscription_tier, billing_cycle).
let coachTierCycle: { subscription_tier: string; billing_cycle: string } | null = {
    subscription_tier: 'pro',
    billing_cycle: 'monthly',
}
let coachTierCycleError: { message: string } | null = null
vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: () => ({
        from: () => ({
            // El select discrimina por columnas: `id` (resolveCoachId) vs `subscription_tier,...` (tier/cycle).
            select: (cols?: string) => ({
                eq: () => ({
                    maybeSingle: async () => {
                        if (cols && cols.includes('subscription_tier')) {
                            return coachTierCycleError
                                ? { data: null, error: coachTierCycleError }
                                : { data: coachTierCycle, error: null }
                        }
                        return coachLookupError
                            ? { data: null, error: coachLookupError }
                            : { data: coachIdBySub ? { id: coachIdBySub } : null, error: null }
                    },
                }),
            }),
        }),
    }),
}))

// FlowProvider outbound (Ola 2): valida el ARMADO del request (firma + params + endpoint) y el PARSEO
// de la respuesta, con fetch mockeado (sin tocar Flow). La validacion contra el sandbox real es aparte.
const BASE = 'https://sandbox.flow.cl/api'
const SECRET = 'sbx-secret'
const API_KEY = 'sbx-apikey'

let fetchMock: ReturnType<typeof vi.fn>

/** Respuesta fetch-like OK con json. */
function ok(json: Record<string, unknown>) {
    return { ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) }
}

beforeEach(() => {
    vi.stubEnv('FLOW_API_KEY', API_KEY)
    vi.stubEnv('FLOW_SECRET_KEY', SECRET)
    vi.stubEnv('FLOW_API_BASE', BASE)
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
})

/** Extrae {url, method, params} de la n-esima llamada a fetch (POST body o GET query). */
function callAt(i: number) {
    const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit]
    const method = (init?.method ?? 'GET').toUpperCase()
    const params = method === 'POST'
        ? new URLSearchParams(String(init.body))
        : new URL(url).searchParams
    return { url, method, params }
}

describe('FlowProvider — config', () => {
    it('sin FLOW_API_KEY/SECRET truena con mensaje claro', async () => {
        vi.stubEnv('FLOW_API_KEY', '')
        await expect(new FlowProvider().createOneShotPayment({
            coachId: 'c1', coachEmail: 'a@b.cl', amountClp: 1000, description: 'x',
            externalReference: 'addon_oneshot|c1|cardio|v2', successUrl: 's', failureUrl: 'f', pendingUrl: 'p', webhookUrl: 'w',
        })).rejects.toThrow('Missing FLOW_API_KEY')
    })
})

describe('FlowProvider.createOneShotPayment', () => {
    it('POST a payment/create con params + firma; devuelve checkoutUrl + flowOrder', async () => {
        fetchMock.mockResolvedValueOnce(ok({ url: 'https://sandbox.flow.cl/app/web/pay.php', token: 'TK1', flowOrder: 555 }))
        const r = await new FlowProvider().createOneShotPayment({
            coachId: 'c1', coachEmail: 'coach@eva.cl', amountClp: 9990, description: 'Add-on cardio',
            externalReference: 'addon_oneshot|c1|cardio|v2', successUrl: 'https://eva/ok', failureUrl: 'f', pendingUrl: 'p',
            webhookUrl: 'https://eva/api/payments/flow/webhook?token=x',
        })
        const { url, method, params } = callAt(0)
        expect(method).toBe('POST')
        expect(url).toBe(`${BASE}/payment/create`)
        expect(params.get('apiKey')).toBe(API_KEY)
        expect(params.get('commerceOrder')).toBe('addon_oneshot|c1|cardio|v2')
        expect(params.get('amount')).toBe('9990')
        expect(params.get('urlConfirmation')).toBe('https://eva/api/payments/flow/webhook?token=x')
        expect(params.get('urlReturn')).toBe('https://eva/ok')
        // La firma `s` debe coincidir con signFlowParams sobre TODOS los params menos `s`.
        const signed: Record<string, string> = {}
        params.forEach((v, k) => { if (k !== 's') signed[k] = v })
        expect(params.get('s')).toBe(signFlowParams(signed, SECRET))
        expect(r).toEqual({ checkoutUrl: 'https://sandbox.flow.cl/app/web/pay.php?token=TK1', preferenceId: '555' })
    })

    it('respuesta sin url/token → error', async () => {
        fetchMock.mockResolvedValueOnce(ok({ flowOrder: 1 }))
        await expect(new FlowProvider().createOneShotPayment({
            coachId: 'c1', coachEmail: 'a@b.cl', amountClp: 1000, description: 'x',
            externalReference: 'addon_oneshot|c1|cardio|v2', successUrl: 's', failureUrl: 'f', pendingUrl: 'p', webhookUrl: 'w',
        })).rejects.toThrow('sin url/token')
    })
})

describe('FlowProvider.createCheckout (Fase 1 — enrolamiento)', () => {
    const input = {
        coachId: 'coach-uuid', coachEmail: 'coach@eva.cl', tier: 'pro' as const, billingCycle: 'monthly' as const,
        amountClp: 14990, title: 'Pro', successUrl: 'https://eva/flow/return', failureUrl: 'f', pendingUrl: 'p',
        webhookUrl: 'https://eva/api/payments/flow/webhook',
    }

    it('sin customer previo: customer/create → customer/register; devuelve customerId + url de enrolamiento', async () => {
        fetchMock
            .mockResolvedValueOnce(ok({ customerId: 'cus_123' }))
            .mockResolvedValueOnce(ok({ url: 'https://sandbox.flow.cl/app/customer/register.php', token: 'RG9' }))
        const r = await new FlowProvider().createCheckout(input)
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(callAt(0).url).toBe(`${BASE}/customer/create`)
        expect(callAt(0).params.get('email')).toBe('coach@eva.cl')
        expect(callAt(1).url).toBe(`${BASE}/customer/register`)
        expect(callAt(1).params.get('customerId')).toBe('cus_123')
        expect(callAt(1).params.get('url_return')).toBe('https://eva/flow/return')
        expect(r).toEqual({ checkoutId: 'cus_123', checkoutUrl: 'https://sandbox.flow.cl/app/customer/register.php?token=RG9' })
    })

    it('con existingCustomerId: reusa el customer (NO llama customer/create)', async () => {
        fetchMock.mockResolvedValueOnce(ok({ url: 'https://sandbox.flow.cl/app/customer/register.php', token: 'RG9' }))
        const r = await new FlowProvider().createCheckout({ ...input, existingCustomerId: 'cus_existing' })
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(callAt(0).url).toBe(`${BASE}/customer/register`)
        expect(callAt(0).params.get('customerId')).toBe('cus_existing')
        expect(r.checkoutId).toBe('cus_existing')
    })
})

describe('FlowProvider.startCardReenrollment (T5.5 — cambio de tarjeta por redirect)', () => {
    it('POST a customer/register sobre el customerId existente; devuelve la url de re-enrolamiento', async () => {
        fetchMock.mockResolvedValueOnce(ok({ url: 'https://sandbox.flow.cl/app/customer/register.php', token: 'RG-CARD' }))
        const r = await new FlowProvider().startCardReenrollment('cus_existing', 'https://eva/coach/subscription?card=updated')
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(callAt(0).url).toBe(`${BASE}/customer/register`)
        expect(callAt(0).params.get('customerId')).toBe('cus_existing')
        expect(callAt(0).params.get('url_return')).toBe('https://eva/coach/subscription?card=updated')
        expect(r).toEqual({ redirectUrl: 'https://sandbox.flow.cl/app/customer/register.php?token=RG-CARD' })
    })

    it('respuesta sin url/token → error', async () => {
        fetchMock.mockResolvedValueOnce(ok({}))
        await expect(
            new FlowProvider().startCardReenrollment('cus_existing', 'https://eva/return')
        ).rejects.toThrow('sin url/token')
    })
})

describe('FlowProvider — GET snapshots + cancel', () => {
    it('fetchPaymentSnapshot: GET getStatusByFlowOrder, status 2 → approved', async () => {
        fetchMock.mockResolvedValueOnce(ok({ flowOrder: 555, commerceOrder: 'addon_oneshot|c1|cardio|v2', status: 2 }))
        const r = await new FlowProvider().fetchPaymentSnapshot('555')
        expect(callAt(0).method).toBe('GET')
        expect(callAt(0).url.startsWith(`${BASE}/payment/getStatusByFlowOrder?`)).toBe(true)
        expect(callAt(0).params.get('flowOrder')).toBe('555')
        expect(callAt(0).params.get('s')).toBeTruthy()
        expect(r).toEqual({ id: '555', status: 'approved', external_reference: 'addon_oneshot|c1|cardio|v2' })
    })

    it('fetchCheckoutSnapshot: GET subscription/get, status 1 → authorized + period_end', async () => {
        fetchMock.mockResolvedValueOnce(ok({
            subscriptionId: 'sub_9', status: 1, next_invoice_date: '2026-08-01', subscription_start: '2026-07-01', period_end: '2026-08-01',
        }))
        const r = await new FlowProvider().fetchCheckoutSnapshot('sub_9')
        expect(callAt(0).url.startsWith(`${BASE}/subscription/get?`)).toBe(true)
        expect(r.status).toBe('authorized')
        expect(r.id).toBe('sub_9')
        expect(r.next_payment_date).toBe('2026-08-01')
        expect(r.auto_recurring?.end_date).toBe('2026-08-01')
    })

    it('cancelCheckoutAtProvider: POST subscription/cancel con at_period_end=1 (conserva acceso)', async () => {
        fetchMock.mockResolvedValueOnce(ok({ subscriptionId: 'sub_9', status: 4 }))
        await new FlowProvider().cancelCheckoutAtProvider('sub_9')
        expect(callAt(0).method).toBe('POST')
        expect(callAt(0).url).toBe(`${BASE}/subscription/cancel`)
        expect(callAt(0).params.get('subscriptionId')).toBe('sub_9')
        expect(callAt(0).params.get('at_period_end')).toBe('1')
    })
})

describe('FlowProvider — error handling', () => {
    it('respuesta no-ok con {code,message} → throw legible', async () => {
        fetchMock.mockResolvedValueOnce({ ok: false, status: 401, text: async () => JSON.stringify({ code: 401, message: 'Sin tarjeta enrolada' }) })
        await expect(new FlowProvider().cancelCheckoutAtProvider('sub_x')).rejects.toThrow('code=401')
    })
})

describe('FlowProvider.processWebhook (Ola 3 — re-fetch firmado + resolucion de coachId)', () => {
    beforeEach(() => { coachIdBySub = 'coach-flow-1'; coachLookupError = null })

    it('sin token en el payload → accepted:false (no re-consulta)', async () => {
        const r = await new FlowProvider().processWebhook({})
        expect(r.accepted).toBe(false)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('ONE-SHOT (commerceOrder = nuestro ref addon) → coachId del ref, sin tocar DB', async () => {
        fetchMock.mockResolvedValueOnce(ok({
            flowOrder: 987654, commerceOrder: 'addon_oneshot|coach-x|cardio|v2-2026-06', status: 2,
            paymentData: { date: '2026-07-05 12:00:00' },
        }))
        const r = await new FlowProvider().processWebhook({ token: 'FLW-TK' })
        // 1 sola llamada: payment/getStatus firmado con el token.
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(callAt(0).url.startsWith(`${BASE}/payment/getStatus?`)).toBe(true)
        expect(callAt(0).params.get('token')).toBe('FLW-TK')
        expect(callAt(0).params.get('s')).toBeTruthy()
        expect(r).toMatchObject({
            accepted: true, eventKind: 'payment', providerStatus: 'approved', coachId: 'coach-x',
            providerPaymentId: '987654',
        })
        expect(r.oneShotAddon).toEqual({ coachId: 'coach-x', moduleKey: 'cardio', termsVersion: 'v2-2026-06' })
    })

    it('COBRO RECURRENTE (commerceOrder sus_...) → resuelve coachId por DB + invoice/get → approved', async () => {
        fetchMock
            .mockResolvedValueOnce(ok({ flowOrder: 8283334, commerceOrder: 'sus_f7254c813f_1167928_2026-07-05 19:55', status: 2 }))
            .mockResolvedValueOnce(ok({
                id: 1167928, subscriptionId: 'sus_f7254c813f', status: 1, period_end: '2026-08-04 00:00:00',
                payment: { flowOrder: 8283334, status: 2, paymentData: { date: '2026-07-05 19:55:20' } },
            }))
        const r = await new FlowProvider().processWebhook({ token: 'FLW-REC' })
        // 2 llamadas: payment/getStatus (discriminador) + invoice/get (detalle).
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(callAt(0).url.startsWith(`${BASE}/payment/getStatus?`)).toBe(true)
        expect(callAt(1).url.startsWith(`${BASE}/invoice/get?`)).toBe(true)
        expect(callAt(1).params.get('invoiceId')).toBe('1167928')
        expect(r).toMatchObject({
            accepted: true, eventKind: 'payment', isRecurringAuthorizedPayment: true,
            providerStatus: 'approved', coachId: 'coach-flow-1',
            providerPaymentId: 'invoice:1167928', currentPeriodEnd: '2026-08-04T00:00:00',
        })
    })

    it('COBRO RECURRENTE con coachId huerfano (sub desconocida) → accepted:true sin coachId, NO llama invoice/get', async () => {
        coachIdBySub = null
        fetchMock.mockResolvedValueOnce(ok({ flowOrder: 1, commerceOrder: 'sus_zzz_999_2026-07-05', status: 2 }))
        const r = await new FlowProvider().processWebhook({ token: 'FLW-ORPHAN' })
        expect(fetchMock).toHaveBeenCalledTimes(1) // solo payment/getStatus; no invoice/get
        expect(r.accepted).toBe(true)
        expect(r.coachId).toBeUndefined()
    })

    it('commerceOrder no reconocido → accepted:false', async () => {
        fetchMock.mockResolvedValueOnce(ok({ flowOrder: 1, commerceOrder: 'basura-desconocida', status: 2 }))
        const r = await new FlowProvider().processWebhook({ token: 'FLW-JUNK' })
        expect(r.accepted).toBe(false)
    })

    it('RECURRENTE con FALLO transitorio de DB en el lookup → THROW (no lo confunde con huerfano; pipeline → 502 → Flow reintenta)', async () => {
        coachLookupError = { message: 'statement timeout' }
        fetchMock.mockResolvedValueOnce(ok({ flowOrder: 1, commerceOrder: 'sus_abc_123_2026-07-05', status: 2 }))
        await expect(new FlowProvider().processWebhook({ token: 'FLW-DBERR' })).rejects.toThrow('coachId lookup failed')
        // NO llama invoice/get: tira en el lookup antes.
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })
})

describe('FlowProvider.getCustomerEnrollmentStatus (Fase 2a)', () => {
    it('customer enrolado (creditCardType + registerDate) → enrolled:true + last4', async () => {
        fetchMock.mockResolvedValueOnce(ok({
            customerId: 'cus_1', pay_mode: 'auto', creditCardType: 'Visa', last4CardDigits: '6623',
            registerDate: '2026-07-05 19:54:38',
        }))
        const r = await new FlowProvider().getCustomerEnrollmentStatus('cus_1')
        expect(callAt(0).method).toBe('GET')
        expect(callAt(0).url.startsWith(`${BASE}/customer/get?`)).toBe(true)
        expect(callAt(0).params.get('customerId')).toBe('cus_1')
        expect(callAt(0).params.get('s')).toBeTruthy()
        expect(r).toEqual({ enrolled: true, cardType: 'Visa', last4: '6623' })
    })

    it('customer NO enrolado (creditCardType/registerDate null) → enrolled:false', async () => {
        fetchMock.mockResolvedValueOnce(ok({
            customerId: 'cus_2', pay_mode: 'manual', creditCardType: null, last4CardDigits: null, registerDate: null,
        }))
        const r = await new FlowProvider().getCustomerEnrollmentStatus('cus_2')
        expect(r).toEqual({ enrolled: false, cardType: null, last4: null })
    })
})

describe('FlowProvider.createSubscriptionForEnrolledCustomer (Fase 2b)', () => {
    const input = {
        customerId: 'cus_1', tier: 'pro', cycle: 'monthly' as const, amountClp: 29990,
        planLabel: 'EVA Pro (mensual)', webhookUrl: 'https://eva/api/payments/flow/webhook?token=x',
    }

    it('happy: plans/create (planId por monto) + subscription/create → subscriptionId + periodEnd + firstInvoice pagada', async () => {
        fetchMock
            .mockResolvedValueOnce(ok({ planId: 'eva_pro_monthly_29990', amount: '29990', interval: 3, interval_count: 1, status: 1 }))
            .mockResolvedValueOnce(ok({
                subscriptionId: 'sus_abc', planId: 'eva_pro_monthly_29990', customerId: 'cus_1',
                period_end: '2026-08-04 00:00:00', status: 1, morose: 0,
                invoices: [{ id: 1167928, status: 1, amount: '29990.0000' }],
            }))
        const r = await new FlowProvider().createSubscriptionForEnrolledCustomer(input)
        expect(fetchMock).toHaveBeenCalledTimes(2)
        // plans/create
        expect(callAt(0).method).toBe('POST')
        expect(callAt(0).url).toBe(`${BASE}/plans/create`)
        expect(callAt(0).params.get('planId')).toBe('eva_pro_monthly_29990')
        expect(callAt(0).params.get('amount')).toBe('29990')
        expect(callAt(0).params.get('interval')).toBe('3')
        expect(callAt(0).params.get('interval_count')).toBe('1')
        expect(callAt(0).params.get('urlCallback')).toBe('https://eva/api/payments/flow/webhook?token=x')
        // subscription/create
        expect(callAt(1).url).toBe(`${BASE}/subscription/create`)
        expect(callAt(1).params.get('planId')).toBe('eva_pro_monthly_29990')
        expect(callAt(1).params.get('customerId')).toBe('cus_1')
        expect(r).toEqual({
            subscriptionId: 'sus_abc',
            planId: 'eva_pro_monthly_29990',
            periodEnd: '2026-08-04T00:00:00', // espacio → T
            firstInvoice: { id: '1167928', paid: true, paidAmountClp: 29990 },
        })
    })

    it('quarterly → interval 3, count 3 en plans/create', async () => {
        fetchMock
            .mockResolvedValueOnce(ok({ planId: 'eva_pro_quarterly_80973' }))
            .mockResolvedValueOnce(ok({ subscriptionId: 'sus_q', invoices: [] }))
        await new FlowProvider().createSubscriptionForEnrolledCustomer({ ...input, cycle: 'quarterly', amountClp: 80973 })
        expect(callAt(0).params.get('planId')).toBe('eva_pro_quarterly_80973')
        expect(callAt(0).params.get('interval')).toBe('3')
        expect(callAt(0).params.get('interval_count')).toBe('3')
    })

    it('annual → interval 4, count 1 en plans/create', async () => {
        fetchMock
            .mockResolvedValueOnce(ok({ planId: 'eva_pro_annual_287904' }))
            .mockResolvedValueOnce(ok({ subscriptionId: 'sus_a', invoices: [] }))
        await new FlowProvider().createSubscriptionForEnrolledCustomer({ ...input, cycle: 'annual', amountClp: 287904 })
        expect(callAt(0).params.get('interval')).toBe('4')
        expect(callAt(0).params.get('interval_count')).toBe('1')
    })

    it('plan ya existe (plans/create 4xx {code,message}) → NO tira, sigue a subscription/create', async () => {
        fetchMock
            .mockResolvedValueOnce({ ok: false, status: 401, text: async () => JSON.stringify({ code: 401, message: 'Plan already exists' }) })
            .mockResolvedValueOnce(ok({ subscriptionId: 'sus_shared', invoices: [{ id: 42, status: 1, amount: '29990' }] }))
        const r = await new FlowProvider().createSubscriptionForEnrolledCustomer(input)
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(callAt(1).url).toBe(`${BASE}/subscription/create`)
        expect(r.subscriptionId).toBe('sus_shared')
        expect(r.firstInvoice).toEqual({ id: '42', paid: true, paidAmountClp: 29990 })
    })

    it('F10 (DATO REAL sandbox): planId duplicado responde HTTP 401 code 501 "This planId has already been used" → NO tira, sigue', async () => {
        // Mensaje real confirmado contra sandbox 2026-07-09; el regex DEBE matchear "has already been used".
        fetchMock
            .mockResolvedValueOnce({
                ok: false,
                status: 401,
                text: async () =>
                    JSON.stringify({ code: 501, message: 'Internal Server Error - This planId has already been used' }),
            })
            .mockResolvedValueOnce(ok({ subscriptionId: 'sus_dup', invoices: [{ id: 7, status: 1, amount: '29990' }] }))
        const r = await new FlowProvider().createSubscriptionForEnrolledCustomer(input)
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(callAt(1).url).toBe(`${BASE}/subscription/create`)
        expect(r.subscriptionId).toBe('sus_dup')
    })

    it('firstInvoice con status STRING "1" → paid true (Number coerce)', async () => {
        fetchMock
            .mockResolvedValueOnce(ok({ planId: 'eva_pro_monthly_29990' }))
            .mockResolvedValueOnce(ok({ subscriptionId: 'sus_s', invoices: [{ id: '99', status: '1', amount: '29990.0000' }] }))
        const r = await new FlowProvider().createSubscriptionForEnrolledCustomer(input)
        expect(r.firstInvoice).toEqual({ id: '99', paid: true, paidAmountClp: 29990 })
    })

    it('sin subscriptionId en la respuesta → error', async () => {
        fetchMock
            .mockResolvedValueOnce(ok({ planId: 'eva_pro_monthly_29990' }))
            .mockResolvedValueOnce(ok({ invoices: [] }))
        await expect(new FlowProvider().createSubscriptionForEnrolledCustomer(input)).rejects.toThrow('sin subscriptionId')
    })
})

describe('FlowProvider — diferidos (throws etiquetados por Ola)', () => {
    it('updateCardAtProvider → Ola 4', async () => {
        await expect(new FlowProvider().updateCardAtProvider('s', 't', 'k')).rejects.toThrow('Ola 4')
    })
    it('fetchCardTokenSummary → Ola 4', async () => {
        await expect(new FlowProvider().fetchCardTokenSummary('t')).rejects.toThrow('Ola 4')
    })
})

describe('FlowProvider.changeSubscriptionPlan (T5.3 — ensure-plan + changePlan)', () => {
    const input = {
        tier: 'pro',
        cycle: 'monthly' as const,
        amountClp: 14990,
        planLabel: 'EVA Pro (mensual)',
        webhookUrl: 'https://eva/api/payments/flow/webhook?token=x',
    }

    it('happy SUBIDA: plans/create (planId por monto) + changePlan; balance>0 → chargedNowClp, sin credito', async () => {
        fetchMock
            .mockResolvedValueOnce(ok({ planId: 'eva_pro_monthly_14990' }))
            .mockResolvedValueOnce(ok({ start_date_of_new_plan: '2026-07-09', new_amount: 14990, old_amount: 5000, balance: 9990 }))
        const r = await new FlowProvider().changeSubscriptionPlan('sus_abc', input)
        expect(fetchMock).toHaveBeenCalledTimes(2)
        // 1) plans/create con planId deterministico por monto NUEVO.
        expect(callAt(0).method).toBe('POST')
        expect(callAt(0).url).toBe(`${BASE}/plans/create`)
        expect(callAt(0).params.get('planId')).toBe('eva_pro_monthly_14990')
        expect(callAt(0).params.get('amount')).toBe('14990')
        expect(callAt(0).params.get('interval')).toBe('3')
        expect(callAt(0).params.get('interval_count')).toBe('1')
        // 2) subscription/changePlan con subscriptionId + newPlanId.
        expect(callAt(1).method).toBe('POST')
        expect(callAt(1).url).toBe(`${BASE}/subscription/changePlan`)
        expect(callAt(1).params.get('subscriptionId')).toBe('sus_abc')
        expect(callAt(1).params.get('newPlanId')).toBe('eva_pro_monthly_14990')
        expect(r).toEqual({ applied: true, chargedNowClp: 9990, creditClp: null })
    })

    it('BAJADA: balance<0 (string, Flow stringifica) → creditClp, sin cobro', async () => {
        fetchMock
            .mockResolvedValueOnce(ok({ planId: 'eva_pro_monthly_5000' }))
            .mockResolvedValueOnce(ok({ balance: '-9990' }))
        const r = await new FlowProvider().changeSubscriptionPlan('sus_abc', { ...input, amountClp: 5000 })
        expect(callAt(0).params.get('planId')).toBe('eva_pro_monthly_5000')
        expect(r).toEqual({ applied: true, chargedNowClp: null, creditClp: 9990 })
    })

    it('balance 0 / ausente → ni cobro ni credito', async () => {
        fetchMock
            .mockResolvedValueOnce(ok({ planId: 'eva_pro_monthly_14990' }))
            .mockResolvedValueOnce(ok({ start_date_of_new_plan: '2026-07-09' }))
        const r = await new FlowProvider().changeSubscriptionPlan('sus_abc', input)
        expect(r).toEqual({ applied: true, chargedNowClp: null, creditClp: null })
    })

    it('plan duplicado (HTTP 401 "already been used") → NO tira, sigue a changePlan', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: false,
                status: 401,
                text: async () => JSON.stringify({ code: 501, message: 'Internal Server Error - This planId has already been used' }),
            })
            .mockResolvedValueOnce(ok({ balance: 9990 }))
        const r = await new FlowProvider().changeSubscriptionPlan('sus_abc', input)
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(callAt(1).url).toBe(`${BASE}/subscription/changePlan`)
        expect(r.chargedNowClp).toBe(9990)
    })

    it('addSubscriptionItem y removeSubscriptionItem = alias del mismo camino (ensure-plan + changePlan)', async () => {
        fetchMock
            .mockResolvedValueOnce(ok({ planId: 'eva_pro_monthly_14990' }))
            .mockResolvedValueOnce(ok({ balance: 9990 }))
        const add = await new FlowProvider().addSubscriptionItem('sus_add', input)
        expect(callAt(1).url).toBe(`${BASE}/subscription/changePlan`)
        expect(callAt(1).params.get('subscriptionId')).toBe('sus_add')
        expect(add).toEqual({ applied: true, chargedNowClp: 9990, creditClp: null })

        fetchMock.mockClear()
        fetchMock
            .mockResolvedValueOnce(ok({ planId: 'eva_pro_monthly_5000' }))
            .mockResolvedValueOnce(ok({ balance: '-3000' }))
        const rem = await new FlowProvider().removeSubscriptionItem('sus_rem', { ...input, amountClp: 5000 })
        expect(callAt(1).url).toBe(`${BASE}/subscription/changePlan`)
        expect(callAt(1).params.get('subscriptionId')).toBe('sus_rem')
        expect(rem).toEqual({ applied: true, chargedNowClp: null, creditClp: 3000 })
    })
})

describe('FlowProvider.updateCheckoutAmount (T5.3 — cupon-expira via changePlan, tier/cycle del coach)', () => {
    beforeEach(() => {
        coachTierCycle = { subscription_tier: 'pro', billing_cycle: 'monthly' }
        coachTierCycleError = null
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://eva-app.cl')
    })

    it('resuelve tier/cycle del coach → ensure-plan + changePlan al nuevo monto', async () => {
        fetchMock
            .mockResolvedValueOnce(ok({ planId: 'eva_pro_monthly_29990' }))
            .mockResolvedValueOnce(ok({ balance: 15000 }))
        await new FlowProvider().updateCheckoutAmount('sus_cupon', 29990)
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(callAt(0).url).toBe(`${BASE}/plans/create`)
        expect(callAt(0).params.get('planId')).toBe('eva_pro_monthly_29990')
        // urlCallback del plan = webhook Flow por defecto (NEXT_PUBLIC_SITE_URL).
        expect(callAt(0).params.get('urlCallback')).toContain('https://eva-app.cl/api/payments/flow/webhook')
        expect(callAt(1).url).toBe(`${BASE}/subscription/changePlan`)
        expect(callAt(1).params.get('subscriptionId')).toBe('sus_cupon')
    })

    it('sin coach para la sub → throw (no mueve plata a ciegas)', async () => {
        coachTierCycle = null
        await expect(new FlowProvider().updateCheckoutAmount('sus_orphan', 29990)).rejects.toThrow('sin coach')
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('error de query en el lookup → throw (no lo confunde con huerfano)', async () => {
        coachTierCycleError = { message: 'statement timeout' }
        await expect(new FlowProvider().updateCheckoutAmount('sus_x', 29990)).rejects.toThrow('tier/cycle lookup failed')
    })

    it('updateCheckoutAmountAndRef ignora el external_reference (EVA es fuente del tier) y aplica el monto', async () => {
        fetchMock
            .mockResolvedValueOnce(ok({ planId: 'eva_pro_monthly_29990' }))
            .mockResolvedValueOnce(ok({ balance: 0 }))
        await new FlowProvider().updateCheckoutAmountAndRef('sus_cupon', 29990, 'coach|pro|monthly')
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(callAt(1).url).toBe(`${BASE}/subscription/changePlan`)
    })
})
