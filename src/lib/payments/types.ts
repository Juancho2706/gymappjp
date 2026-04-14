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
    /** ISO date string — if provided, the subscription starts on that date (used for mid-cycle upgrades). */
    startDate?: string
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

/** Normalized preapproval / recurring checkout snapshot (Mercado Pago preapproval shape). */
export type ProviderCheckoutSnapshot = {
    id: string
    external_reference?: string | null
    status?: string | null
    next_payment_date?: string | null
    auto_recurring?: { end_date?: string | null }
}

export interface PaymentsProvider {
    name: 'mercadopago' | 'stripe'
    createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>
    processWebhook(payload: unknown): Promise<WebhookProcessResult>
    /** Fetch current state of a recurring checkout / preapproval by provider id. */
    fetchCheckoutSnapshot(checkoutId: string): Promise<ProviderCheckoutSnapshot>
    /** Cancel recurring billing at the provider (e.g. MP preapproval cancelled). */
    cancelCheckoutAtProvider(checkoutId: string): Promise<void>
}
