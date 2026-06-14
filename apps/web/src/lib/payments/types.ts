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

/**
 * Datos del one-shot de upgrade de tier parseados del `external_reference`
 * `tier_upgrade|coachId|newTier|cycle` (FUNDACION F4). El monto del one-shot es la
 * DIFERENCIA de tier prorrateada al ciclo vigente del coach; la activación del nuevo
 * tier + el PUT del preapproval al nuevo compuesto los hace el confirm-upgrade/webhook.
 */
export type TierUpgradeRef = {
    coachId: string
    newTier: SubscriptionTier
    cycle: BillingCycle
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
    /**
     * Si el evento es un pago one-shot de upgrade de tier (reference `tier_upgrade|...`,
     * FUNDACION F4), sus datos. El webhook corre la activación idempotente (write rank-guarded
     * de tier+max_clients+cycle + PUT al nuevo compuesto) y escribe el `billing_snapshot`.
     */
    tierUpgrade?: TierUpgradeRef | null
    /**
     * id del preapproval extraído del pago (`metadata.preapproval_id` o campo top-level). Fallback de
     * refund/chargeback (P1-1): cuando una notificación de refund OMITE el external_reference no hay
     * coachId; el webhook recupera al coach por `subscription_mp_id === preapprovalId` para no perder
     * el refund en silencio. Null si el pago no expone preapproval.
     */
    preapprovalId?: string | null
}

/** Normalized preapproval / recurring checkout snapshot (Mercado Pago preapproval shape). */
export type ProviderCheckoutSnapshot = {
    id: string
    external_reference?: string | null
    status?: string | null
    next_payment_date?: string | null
    /**
     * Fecha de INICIO efectivo del preapproval (señal de "agendado al corte"). En MP la fuente
     * load-bearing es `auto_recurring.start_date` (la que el provider devuelve); el top-level se
     * incluye defensivamente. El early-slash guard de confirm-subscription la lee para NO degradar
     * entitlements de un cambio agendado a futuro (SLASH-EARLY).
     */
    start_date?: string | null
    auto_recurring?: { end_date?: string | null; transaction_amount?: number | null; start_date?: string | null }
}

/**
 * Snapshot mínimo de un pago one-shot (Mercado Pago `/v1/payments/{id}`) — lo usa el camino
 * síncrono `confirm-addon` para confirmar el pago del add-on sin esperar el webhook. El
 * `external_reference` trae el reference dedicado `addon_oneshot|...`.
 */
export type ProviderPaymentSnapshot = {
    id: string
    status?: string | null
    external_reference?: string | null
}

export interface PaymentsProvider {
    name: 'mercadopago' | 'stripe'
    createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>
    processWebhook(payload: unknown): Promise<WebhookProcessResult>
    /** Fetch current state of a recurring checkout / preapproval by provider id. */
    fetchCheckoutSnapshot(checkoutId: string): Promise<ProviderCheckoutSnapshot>
    /**
     * Fetch current state of a one-shot payment by provider payment id (MP `/v1/payments/{id}`).
     * Usado por el camino síncrono `confirm-addon` (plan 05) para materializar el add-on al volver
     * del checkout sin depender del webhook (que sigue como backstop). Devuelve estado + reference.
     */
    fetchPaymentSnapshot(paymentId: string): Promise<ProviderPaymentSnapshot>
    /** Cancel recurring billing at the provider (e.g. MP preapproval cancelled). */
    cancelCheckoutAtProvider(checkoutId: string): Promise<void>
    /**
     * Sube/baja el monto del próximo cobro de un preapproval SIN re-autorizar al pagador
     * (PUT /preapproval/{id}, plan 05 F3.1). El monto del próximo cobro pasa a `amountClp`.
     * validar en sandbox (item 1): ¿cuándo aplica?, ¿genera cargo inmediato?, ¿email al pagador?
     */
    updateCheckoutAmount(checkoutId: string, amountClp: number): Promise<void>
    /**
     * Como `updateCheckoutAmount` pero ADEMÁS reescribe el `external_reference` del preapproval
     * (PUT /preapproval/{id} acepta `external_reference`). Lo usa el upgrade de tier
     * (confirm-upgrade / webhook tierUpgrade) para subir el monto del próximo cobro al nuevo
     * compuesto Y dejar el reference apuntando al NUEVO tier|cycle, evitando que el siguiente
     * evento `preapproval` re-derive el tier viejo y revierta el upgrade (P0-1 stale-ref revert).
     * Construir `externalReference` con `buildCheckoutExternalReference`.
     */
    updateCheckoutAmountAndRef(
        checkoutId: string,
        amountClp: number,
        externalReference: string
    ): Promise<void>
    /**
     * Crea un pago one-shot (Checkout Pro clásico, NO preapproval) y devuelve la URL de
     * checkout (plan 05 F3.2 — alta in-app trim/anual prorrateada).
     */
    createOneShotPayment(input: CreateOneShotInput): Promise<CreateOneShotResult>
}
