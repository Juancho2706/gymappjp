import type { BillingCycle, SubscriptionTier } from '@/lib/constants'

export type CreateCheckoutInput = {
    coachId: string
    coachEmail: string
    tier: SubscriptionTier
    billingCycle: BillingCycle
    amountClp: number
    title: string
    successUrl: string
    failureUrl: string
    pendingUrl: string
    webhookUrl: string
}

export type CreateCheckoutResult = {
    checkoutId: string
    checkoutUrl: string
}

export type WebhookProcessResult = {
    accepted: boolean
    eventId?: string
    providerStatus?: string
    coachId?: string
    providerCheckoutId?: string
    currentPeriodEnd?: string | null
}

export interface PaymentsProvider {
    name: 'mercadopago' | 'stripe'
    createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>
    processWebhook(payload: unknown): Promise<WebhookProcessResult>
}
