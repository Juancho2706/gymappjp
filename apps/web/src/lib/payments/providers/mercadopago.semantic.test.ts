import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MercadoPagoProvider } from './mercadopago'
import type { SubscriptionCompositeInput } from '@/lib/payments/types'

// T5.2 — el puerto semantico de MP NO cambia el comportamiento: los tres metodos delegan en la
// maquinaria existente updateCheckoutAmount (PUT /preapproval al monto compuesto que ya viene
// calculado por el service). MP no cobra la diferencia en el PUT → chargedNowClp/creditClp = null.

const ORIGINAL_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN

beforeEach(() => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-test-token'
})

afterEach(() => {
    vi.restoreAllMocks()
    if (ORIGINAL_TOKEN === undefined) delete process.env.MERCADOPAGO_ACCESS_TOKEN
    else process.env.MERCADOPAGO_ACCESS_TOKEN = ORIGINAL_TOKEN
})

const input: SubscriptionCompositeInput = {
    tier: 'pro',
    cycle: 'monthly',
    amountClp: 29990,
    planLabel: 'EVA Pro (mensual)',
    webhookUrl: 'https://eva/api/payments/webhook',
}

describe('MercadoPagoProvider — puerto semantico (T5.2) delega en updateCheckoutAmount', () => {
    it('addSubscriptionItem → updateCheckoutAmount(ref, amount); result sin cobro/credito', async () => {
        const provider = new MercadoPagoProvider()
        const spy = vi.spyOn(provider, 'updateCheckoutAmount').mockResolvedValue(undefined)
        const r = await provider.addSubscriptionItem('preapproval-1', input)
        expect(spy).toHaveBeenCalledWith('preapproval-1', 29990)
        expect(r).toEqual({ applied: true, chargedNowClp: null, creditClp: null })
    })

    it('removeSubscriptionItem → updateCheckoutAmount(ref, amount)', async () => {
        const provider = new MercadoPagoProvider()
        const spy = vi.spyOn(provider, 'updateCheckoutAmount').mockResolvedValue(undefined)
        const r = await provider.removeSubscriptionItem('preapproval-2', { ...input, amountClp: 14990 })
        expect(spy).toHaveBeenCalledWith('preapproval-2', 14990)
        expect(r).toEqual({ applied: true, chargedNowClp: null, creditClp: null })
    })

    it('changeSubscriptionPlan → updateCheckoutAmount (NO reescribe el external_reference; solo el monto)', async () => {
        const provider = new MercadoPagoProvider()
        const spy = vi.spyOn(provider, 'updateCheckoutAmount').mockResolvedValue(undefined)
        const andRefSpy = vi.spyOn(provider, 'updateCheckoutAmountAndRef')
        const r = await provider.changeSubscriptionPlan('preapproval-3', input)
        expect(spy).toHaveBeenCalledWith('preapproval-3', 29990)
        expect(andRefSpy).not.toHaveBeenCalled()
        expect(r).toEqual({ applied: true, chargedNowClp: null, creditClp: null })
    })
})
