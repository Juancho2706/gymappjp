import { MercadoPagoProvider } from '@/lib/payments/providers/mercadopago'
import { StripeProvider } from '@/lib/payments/providers/stripe'
import type { PaymentsProvider } from '@/lib/payments/types'

export function getPaymentsProvider(): PaymentsProvider {
    const provider = (process.env.PAYMENT_PROVIDER ?? 'mercadopago').toLowerCase()
    if (provider === 'stripe') return new StripeProvider()
    return new MercadoPagoProvider()
}
