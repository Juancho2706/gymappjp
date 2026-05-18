import type {
    CreateCheckoutInput,
    CreateCheckoutResult,
    PaymentsProvider,
    ProviderCheckoutSnapshot,
    WebhookProcessResult,
} from '@/lib/payments/types'

export class StripeProvider implements PaymentsProvider {
    name = 'stripe' as const

    async createCheckout(_input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
        throw new Error('Stripe provider is not implemented yet. Configure PAYMENT_PROVIDER=mercadopago.')
    }

    async processWebhook(_payload: unknown): Promise<WebhookProcessResult> {
        throw new Error('Stripe webhook is not implemented yet. Configure PAYMENT_PROVIDER=mercadopago.')
    }

    async fetchCheckoutSnapshot(_checkoutId: string): Promise<ProviderCheckoutSnapshot> {
        throw new Error('Stripe provider is not implemented yet. Configure PAYMENT_PROVIDER=mercadopago.')
    }

    async cancelCheckoutAtProvider(_checkoutId: string): Promise<void> {
        throw new Error('Stripe provider is not implemented yet. Configure PAYMENT_PROVIDER=mercadopago.')
    }
}
