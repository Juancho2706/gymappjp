import type { BillingCycle, SubscriptionTier } from '@/lib/constants'
import type { ModuleKey } from '@/services/entitlements.service'

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
    /**
     * Add-ons que viajan en la 4ª parte del `external_reference` (signup / supersede con
     * add-ons, plan 05 F3.3). Ausente ⇒ preapproval de 3 partes (backward compatible).
     */
    addons?: ModuleKey[]
}

/** Input del pago one-shot prorrateado (Checkout Pro clásico — alta in-app trim/anual, plan 05 F3.2). */
export type CreateOneShotInput = {
    coachId: string
    coachEmail: string
    /** Monto entero CLP calculado por el server (`getAddonProrationClp`). El cliente jamás manda montos. */
    amountClp: number
    description: string
    /** `external_reference` dedicado `addon_oneshot|coachId|moduleKey|termsVersion`. */
    externalReference: string
    successUrl: string
    failureUrl: string
    pendingUrl: string
    webhookUrl: string
}

export type CreateOneShotResult = {
    checkoutUrl: string
    /** id de la preference creada (para trazabilidad/logs). */
    preferenceId: string
}

export type CreateCheckoutResult = {
    checkoutId: string
    checkoutUrl: string
}

/**
 * Tipo de evento del webhook, normalizado por el provider (plan 05 F3.4):
 *   - `preapproval`: alta/cambio de estado de la suscripción recurrente (incl. evento `updated`).
 *   - `payment`:     un cobro (recurrente del preapproval u one-shot prorrateado de add-on).
 *   - `other`:       evento que no movemos (merchant_order, etc.).
 */
export type WebhookEventKind = 'preapproval' | 'payment' | 'other'

/** Datos del one-shot de add-on parseados del `external_reference` `addon_oneshot|...` (plan 05 F3.2). */
export type OneShotAddonRef = {
    coachId: string
    moduleKey: ModuleKey
    termsVersion: string
}

export type WebhookProcessResult = {
    accepted: boolean
    eventId?: string
    providerStatus?: string
    coachId?: string
    providerCheckoutId?: string
    currentPeriodEnd?: string | null
    /** Raw Mercado Pago `external_reference` when available */
    externalReference?: string | null
    subscriptionTier?: SubscriptionTier
    billingCycle?: BillingCycle
    /** Tipo de evento normalizado (plan 05 F3.4 — el webhook bifurca por esto). */
    eventKind?: WebhookEventKind
    /**
     * Monto vigente del preapproval (`auto_recurring.transaction_amount`) en eventos
     * `preapproval` — usado para confirmar el PUT (evento `updated`) y detectar drift.
     * validar en sandbox (item 8).
     */
    providerAmountClp?: number | null
    /** Add-ons parseados de la 4ª parte del `external_reference` (preapproval con add-ons). */
    addons?: ModuleKey[]
    /** id del pago (`payment.id`) — idempotencia del snapshot por cobro (`billing_snapshots`). */
    providerPaymentId?: string | null
    /** Fecha del pago aprobado (ISO) — set-once de `first_charged_at` / `charged_at` del snapshot. */
    paidAt?: string | null
    /** Si el evento es un pago one-shot de add-on (reference `addon_oneshot|...`), sus datos. */
    oneShotAddon?: OneShotAddonRef | null
}

/** Normalized preapproval / recurring checkout snapshot (Mercado Pago preapproval shape). */
export type ProviderCheckoutSnapshot = {
    id: string
    external_reference?: string | null
    status?: string | null
    next_payment_date?: string | null
    auto_recurring?: { end_date?: string | null; transaction_amount?: number | null }
}

export interface PaymentsProvider {
    name: 'mercadopago' | 'stripe'
    createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>
    processWebhook(payload: unknown): Promise<WebhookProcessResult>
    /** Fetch current state of a recurring checkout / preapproval by provider id. */
    fetchCheckoutSnapshot(checkoutId: string): Promise<ProviderCheckoutSnapshot>
    /** Cancel recurring billing at the provider (e.g. MP preapproval cancelled). */
    cancelCheckoutAtProvider(checkoutId: string): Promise<void>
    /**
     * Sube/baja el monto del próximo cobro de un preapproval SIN re-autorizar al pagador
     * (PUT /preapproval/{id}, plan 05 F3.1). El monto del próximo cobro pasa a `amountClp`.
     * validar en sandbox (item 1): ¿cuándo aplica?, ¿genera cargo inmediato?, ¿email al pagador?
     */
    updateCheckoutAmount(checkoutId: string, amountClp: number): Promise<void>
    /**
     * Crea un pago one-shot (Checkout Pro clásico, NO preapproval) y devuelve la URL de
     * checkout (plan 05 F3.2 — alta in-app trim/anual prorrateada).
     */
    createOneShotPayment(input: CreateOneShotInput): Promise<CreateOneShotResult>
}
