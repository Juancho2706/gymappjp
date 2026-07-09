import { FlowProvider } from '@/lib/payments/providers/flow'
import { MercadoPagoProvider } from '@/lib/payments/providers/mercadopago'
import { StripeProvider } from '@/lib/payments/providers/stripe'
import type { PaymentProvider } from '@/domain/coach/types'
import type { PaymentsProvider } from '@/lib/payments/types'

/**
 * Factory del puerto de pagos — seleccion POR REQUEST (plan pagos-multigateway-flow, Ola 1).
 *
 * El `gateway` lo elige el server (validado por Zod en el endpoint), NUNCA el monto ni un secreto:
 *   - `gateway === 'flow'`                       -> FlowProvider (Webpay/Flow.cl; stub hasta Ola 2).
 *   - `gateway === 'mercadopago'` | ausente | invalido -> MercadoPagoProvider (DEFAULT = MP, cero regresion).
 *
 * Cuando no se pasa `gateway` se conserva el comportamiento historico: el env `PAYMENT_PROVIDER`
 * sigue actuando como fallback para `stripe`, y en cualquier otro caso el default es MercadoPago.
 * Asi todo el codigo existente que llama `getPaymentsProvider()` sin argumentos sigue igual.
 */
export function getPaymentsProvider(gateway?: PaymentProvider): PaymentsProvider {
    if (gateway === 'flow') return new FlowProvider()
    if (gateway === 'mercadopago') return new MercadoPagoProvider()

    // Sin `gateway` explicito: fallback historico por env (solo activa Stripe si se pidio),
    // default MercadoPago. Cero regresion para los callers actuales.
    const envProvider = (process.env.PAYMENT_PROVIDER ?? 'mercadopago').toLowerCase()
    if (envProvider === 'stripe') return new StripeProvider()
    return new MercadoPagoProvider()
}

/**
 * Elige el provider para operar la suscripcion YA EXISTENTE de un coach, por el gateway PERSISTIDO en
 * `coaches.subscription_provider` (Ola 3, T3.6). Es la fuente de verdad server-side del dueño de la
 * sub — NUNCA se confia en el body del request para elegir gateway (money-safety). Lo usan los caminos
 * que actuan sobre una sub viva: confirm-subscription, cancel, change-card, etc. Default MercadoPago
 * (subscription_provider es NOT NULL DEFAULT 'mercadopago' → cero regresion mientras Flow este OFF).
 */
export function getPaymentsProviderForCoach(coach: { subscription_provider?: string | null }): PaymentsProvider {
    return getPaymentsProvider(coach?.subscription_provider === 'flow' ? 'flow' : 'mercadopago')
}
