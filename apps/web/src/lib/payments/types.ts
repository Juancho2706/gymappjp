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
    /**
     * Flow-only: `customerId` ya enrolado del coach (`coaches.provider_customer_id`). Si viene, la
     * Fase 1 de Flow reusa ese customer (no crea uno nuevo) antes del enrolamiento de tarjeta. MP lo
     * ignora (no aplica). Ausente ⇒ Flow crea el customer.
     */
    existingCustomerId?: string
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
 * Input de un cambio de compuesto sobre una suscripcion recurrente VIVA (add/remove item o
 * changePlan, T5.1). El `amountClp` es el compuesto NUEVO ya calculado por el caller con
 * `getCompositeAmountClp` (UNICA fuente de verdad de la plata) — los metodos del puerto NUNCA
 * calculan montos ni prorratean: solo aplican el monto que reciben. `planLabel`/`webhookUrl` los
 * usa Flow para hornear el plan deterministico nuevo (`eva_<tier>_<cycle>_<amountClp>`); MP los
 * ignora (solo mueve el monto del preapproval).
 */
export type SubscriptionCompositeInput = {
    tier: string
    cycle: 'monthly' | 'quarterly' | 'annual'
    amountClp: number
    planLabel: string
    webhookUrl: string
}

/**
 * Resultado de un cambio de compuesto (T5.1). `applied`=el provider acepto el cambio.
 * `chargedNowClp`=lo que el provider COBRO al instante por la diferencia (Flow, al SUBIR de monto,
 * emite+cobra una invoice por el delta al toque — VALIDADO sandbox); `null` si el provider no cobra
 * diferencia inmediata (MP mueve solo el proximo cobro) o no expone el dato. `creditClp`=credito a
 * favor del pagador cuando el compuesto BAJA (Flow deja balance negativo, invoice $0); `null` si no
 * aplica. Money-safety: el caller NUNCA debe sumar un one-shot propio sobre `chargedNowClp` (doble
 * cobro) — cuando el provider ya cobro la diferencia, ese cobro ES el ajuste.
 */
export type SubscriptionChangeResult = {
    applied: boolean
    chargedNowClp: number | null
    creditClp: number | null
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
    /**
     * true si el evento es un COBRO RECURRENTE de suscripción (MP `subscription_authorized_payment`,
     * P0-1). Antes caía mal ruteado (includes('subscription') → GET /preapproval → 404 → 502) y la
     * renovación nunca se confirmaba. El webhook lo procesa en una rama AUTOCONTENIDA e idempotente
     * (snapshot recurrente + first-charge de add-ons + avance de período), separada de los one-shot.
     */
    isRecurringAuthorizedPayment?: boolean
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
    name: 'mercadopago' | 'stripe' | 'flow'
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
     * `idempotencyKey` opcional → header X-Idempotency-Key (PUTs cupón-driven dedup de doble
     * aplicación de monto; F2a.2b). Los callers sin cupón lo omiten (comportamiento intacto).
     * validar en sandbox (item 1): ¿cuándo aplica?, ¿genera cargo inmediato?, ¿email al pagador?
     */
    updateCheckoutAmount(checkoutId: string, amountClp: number, idempotencyKey?: string): Promise<void>
    /**
     * Como `updateCheckoutAmount` pero ADEMÁS reescribe el `external_reference` del preapproval
     * (PUT /preapproval/{id} acepta `external_reference`). Lo usa el upgrade de tier
     * (confirm-upgrade / webhook tierUpgrade) para subir el monto del próximo cobro al nuevo
     * compuesto Y dejar el reference apuntando al NUEVO tier|cycle, evitando que el siguiente
     * evento `preapproval` re-derive el tier viejo y revierta el upgrade (P0-1 stale-ref revert).
     * Construir `externalReference` con `buildCheckoutExternalReference`.
     * `idempotencyKey` opcional → header X-Idempotency-Key (PUTs cupón-driven, F2a.2b).
     */
    updateCheckoutAmountAndRef(
        checkoutId: string,
        amountClp: number,
        externalReference: string,
        idempotencyKey?: string
    ): Promise<void>
    /**
     * PUT /preapproval/{id} { card_token_id } — cambia la tarjeta del preapproval EXISTENTE sin
     * cancelar ni re-autorizar al pagador (Modalidad A, feat/coach-change-card). El body lleva
     * EXCLUSIVAMENTE `card_token_id`: NUNCA auto_recurring/status/external_reference/back_url —
     * tocar cualquier otro campo del MISMO PUT podría mover `next_payment_date`/el ciclo (re-
     * facturación silenciosa = exposición SERNAC; plan P0-1/Q1). El `cardTokenId` es single-use
     * (7 días), tokenizado client-side con Secure Fields → el PAN nunca toca el server (PCI SAQ-A).
     * `idempotencyKey` viaja como header `X-Idempotency-Key` (mandatorio en MP; key determinística
     * SIN timestamp — `card_change:{coachId}:{tokenHash}` — para dedup de doble-submit).
     * validar en sandbox (Q1: ¿preserva el ciclo? · Q9: ¿emite webhook/micro-cobro? · Q10: ¿acepta paused?).
     */
    updateCardAtProvider(
        checkoutId: string,
        cardTokenId: string,
        idempotencyKey: string
    ): Promise<void>
    /**
     * GET /v1/card_tokens/{id}: lee el `last_four_digits` AUTORITATIVO del token server-side (no
     * confiar en el last4 que manda el cliente — plan P0-10). Display-only y best-effort: el llamador
     * cae al valor del body si esto falla. Un GET NO consume el token (lo consume el PUT del swap).
     */
    fetchCardTokenSummary(cardTokenId: string): Promise<{ last4: string | null }>
    /**
     * Crea un pago one-shot (Checkout Pro clásico, NO preapproval) y devuelve la URL de
     * checkout (plan 05 F3.2 — alta in-app trim/anual prorrateada).
     */
    createOneShotPayment(input: CreateOneShotInput): Promise<CreateOneShotResult>
    /**
     * Agrega un add-on al compuesto de una suscripcion VIVA (T5.1). El `input.amountClp` es el
     * compuesto NUEVO (base + add-ons − descuento) ya calculado por el service — el metodo solo lo
     * aplica. Money-safety (VALIDADO Flow sandbox): al SUBIR el monto Flow emite+cobra al instante
     * una invoice por la diferencia → `chargedNowClp` la refleja; el caller NUNCA suma un one-shot
     * propio encima (seria doble cobro). MP no cobra diferencia inmediata en el PUT
     * (`chargedNowClp: null`). Bajo Flow es un `changePlan` a un plan deterministico nuevo; bajo MP
     * un `updateCheckoutAmount` (el "item" es el compuesto horneado, granularidad diferida).
     */
    addSubscriptionItem(
        subscriptionRef: string,
        input: SubscriptionCompositeInput
    ): Promise<SubscriptionChangeResult>
    /**
     * Quita un add-on del compuesto de una suscripcion VIVA (T5.1). El `input.amountClp` es el
     * compuesto NUEVO (ya sin el add-on) calculado por el service. Money-safety (VALIDADO Flow
     * sandbox): al BAJAR el monto Flow deja un balance NEGATIVO (credito a favor, invoice $0) →
     * `creditClp` lo refleja, sin cargo. MP mueve solo el proximo cobro. Misma mecanica que
     * `addSubscriptionItem` (Flow: `changePlan`; MP: `updateCheckoutAmount`).
     */
    removeSubscriptionItem(
        subscriptionRef: string,
        input: SubscriptionCompositeInput
    ): Promise<SubscriptionChangeResult>
    /**
     * Cambia el plan/compuesto completo de una suscripcion VIVA al monto de `input.amountClp`
     * (T5.1 — cambio de tier o de ciclo con recomputo del compuesto). Money-safety: idem
     * add/removeSubscriptionItem (subida → `chargedNowClp` que Flow cobra solo; bajada →
     * `creditClp`). Bajo Flow es un ensure-plan deterministico (`eva_<tier>_<cycle>_<amountClp>`) +
     * `subscription/changePlan` (cambio INMEDIATO en la MISMA sub, VALIDADO sandbox). Bajo MP es un
     * `updateCheckoutAmount` (el rewrite de external_reference del upgrade MP lo hace su flujo
     * propio confirm-upgrade; el semantico MP toca SOLO el monto).
     */
    changeSubscriptionPlan(
        subscriptionRef: string,
        input: SubscriptionCompositeInput
    ): Promise<SubscriptionChangeResult>
}
