import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPaymentsProvider, getPaymentsProviderForCoach } from './provider'
import { FlowProvider } from './providers/flow'
import { MercadoPagoProvider } from './providers/mercadopago'
import { StripeProvider } from './providers/stripe'

// Factory de selección de gateway POR REQUEST (Ola 1, pagos-multigateway-flow §T1.3). Es ruteo de
// DINERO: un flip del default, o que se caiga el guard `gateway === 'flow'` en un merge, desviaría el
// rail equivocado SIN romper ningún otro test (todos los callers mockean este módulo, así que sin este
// archivo la rama no tiene cobertura directa). Cubrimos las 5 ramas del factory.
describe('getPaymentsProvider — ruteo de gateway por request', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it("'flow' → FlowProvider", () => {
        const p = getPaymentsProvider('flow')
        expect(p).toBeInstanceOf(FlowProvider)
        expect(p.name).toBe('flow')
    })

    it("'mercadopago' → MercadoPagoProvider (el arg explícito manda por encima del env)", () => {
        // Aunque el env pida stripe, el gateway explícito 'mercadopago' debe ganar.
        vi.stubEnv('PAYMENT_PROVIDER', 'stripe')
        const p = getPaymentsProvider('mercadopago')
        expect(p).toBeInstanceOf(MercadoPagoProvider)
        expect(p.name).toBe('mercadopago')
    })

    it("sin arg + PAYMENT_PROVIDER='stripe' → StripeProvider (fallback histórico por env)", () => {
        vi.stubEnv('PAYMENT_PROVIDER', 'stripe')
        const p = getPaymentsProvider()
        expect(p).toBeInstanceOf(StripeProvider)
        expect(p.name).toBe('stripe')
    })

    it('sin arg + sin PAYMENT_PROVIDER → MercadoPagoProvider (default, cero regresión)', () => {
        vi.stubEnv('PAYMENT_PROVIDER', undefined as unknown as string)
        const p = getPaymentsProvider()
        expect(p).toBeInstanceOf(MercadoPagoProvider)
        expect(p.name).toBe('mercadopago')
    })

    it('gateway inválido/desconocido (sin env stripe) → MercadoPagoProvider (fail-safe al rail MP)', () => {
        vi.stubEnv('PAYMENT_PROVIDER', undefined as unknown as string)
        const p = getPaymentsProvider('paypal' as never)
        expect(p).toBeInstanceOf(MercadoPagoProvider)
        expect(p.name).toBe('mercadopago')
    })
})

describe('getPaymentsProviderForCoach — provider por gateway PERSISTIDO del coach', () => {
    it("subscription_provider='flow' → FlowProvider", () => {
        expect(getPaymentsProviderForCoach({ subscription_provider: 'flow' })).toBeInstanceOf(FlowProvider)
    })
    it("subscription_provider='mercadopago' → MercadoPagoProvider", () => {
        expect(getPaymentsProviderForCoach({ subscription_provider: 'mercadopago' })).toBeInstanceOf(MercadoPagoProvider)
    })
    it('null/undefined/ausente → MercadoPagoProvider (default, cero regresión con Flow OFF)', () => {
        expect(getPaymentsProviderForCoach({ subscription_provider: null })).toBeInstanceOf(MercadoPagoProvider)
        expect(getPaymentsProviderForCoach({})).toBeInstanceOf(MercadoPagoProvider)
    })
})
