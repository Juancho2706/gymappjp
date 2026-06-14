import {
    BILLING_CYCLE_CONFIG,
    TIER_CONFIG,
    isBillingCycleAllowedForTier,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'
import { parseCheckoutExternalReference } from '@/lib/payments/checkout-external-reference'
import { MODULE_KEYS, type ModuleKey } from '@/services/entitlements.service'
import type {
    CreateCheckoutInput,
    CreateCheckoutResult,
    CreateOneShotInput,
    CreateOneShotResult,
    OneShotAddonRef,
    PaymentsProvider,
    ProviderCheckoutSnapshot,
    ProviderPaymentSnapshot,
    TierUpgradeRef,
    WebhookProcessResult,
} from '@/lib/payments/types'

type WebhookShape = {
    type?: string
    action?: string
    topic?: string
    data?: { id?: string | number }
}

const MODULE_KEY_SET = new Set<string>(MODULE_KEYS)

/**
 * Parsea el `external_reference` dedicado del one-shot de add-on (`addon_oneshot|coachId|moduleKey|termsVersion`,
 * plan 05 F3.2). La 1ª parte literal `addon_oneshot` lo distingue del reference de suscripción
 * (que arranca con el uuid del coach) → el parser de suscripción no lo confunde. Devuelve null
 * si no coincide el formato o la clave de módulo no es válida.
 */
export function parseOneShotAddonReference(reference?: string | null): OneShotAddonRef | null {
    if (!reference) return null
    const parts = reference.split('|')
    if (parts[0]?.trim() !== 'addon_oneshot') return null
    const coachId = parts[1]?.trim()
    const moduleKey = parts[2]?.trim()
    const termsVersion = parts[3]?.trim()
    if (!coachId || !moduleKey || !termsVersion) return null
    if (!MODULE_KEY_SET.has(moduleKey)) return null
    return { coachId, moduleKey: moduleKey as ModuleKey, termsVersion }
}

const TIER_UPGRADE_CYCLES = new Set<string>(['monthly', 'quarterly', 'annual'])

/**
 * `external_reference` dedicado del one-shot de upgrade de tier (FUNDACION F4):
 * `tier_upgrade|coachId|newTier|cycle`. La 1ª parte literal `tier_upgrade` lo distingue
 * tanto del one-shot de add-on (`addon_oneshot|...`) como del reference de suscripción
 * (arranca con el uuid del coach) → precedencia de parse en el webhook:
 * oneShotAddon → tierUpgrade → checkoutRef.
 */
export function buildTierUpgradeExternalReference(
    coachId: string,
    newTier: SubscriptionTier,
    cycle: BillingCycle
): string {
    return `tier_upgrade|${coachId}|${newTier}|${cycle}`
}

/**
 * Parsea el `external_reference` del one-shot de upgrade de tier (`tier_upgrade|...`,
 * FUNDACION F4). Valida que `newTier` exista en `TIER_CONFIG`, que `cycle` sea un
 * BillingCycle válido y que el ciclo esté permitido para ese tier
 * (`isBillingCycleAllowedForTier`). Devuelve null si no coincide el formato o no validan.
 */
export function parseTierUpgradeReference(reference?: string | null): TierUpgradeRef | null {
    if (!reference) return null
    const parts = reference.split('|')
    if (parts[0]?.trim() !== 'tier_upgrade') return null
    const coachId = parts[1]?.trim()
    const newTier = parts[2]?.trim()
    const cycle = parts[3]?.trim()
    if (!coachId || !newTier || !cycle) return null
    if (!(newTier in TIER_CONFIG)) return null
    if (!TIER_UPGRADE_CYCLES.has(cycle)) return null
    const tier = newTier as SubscriptionTier
    const billingCycle = cycle as BillingCycle
    if (!isBillingCycleAllowedForTier(tier, billingCycle)) return null
    return { coachId, newTier: tier, cycle: billingCycle }
}

function getMpAccessToken() {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
    if (!accessToken) throw new Error('Missing MERCADOPAGO_ACCESS_TOKEN')
    return accessToken
}

function buildMpHeaders(accessToken: string) {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
    }
    if (accessToken.startsWith('TEST-')) {
        headers['X-scope'] = 'stage'
    }
    return headers
}

function resolvePayerEmail(coachEmail: string) {
    const configured = process.env.MERCADOPAGO_TEST_PAYER_EMAIL?.trim()
    let normalizedConfigured = ''
    if (configured) {
        if (configured.includes('@')) {
            normalizedConfigured = configured.toLowerCase()
        } else {
            const match = configured.match(/^testuser(\d+)$/i)
            if (match) {
                normalizedConfigured = `test_user_${match[1]}@testuser.com`
            } else {
                normalizedConfigured = `${configured.toLowerCase()}@testuser.com`
            }
        }
    }

    // Modo TEST señalado por MERCADOPAGO_TEST_PAYER_EMAIL (SOLO el entorno Preview lo setea; en prod
    // NUNCA existe → ahí se usa el email real del coach, comportamiento idéntico al actual). Si está,
    // el payer es ese comprador de prueba — sirve para los DOS caminos de prueba de MP:
    //   (a) sandbox: token TEST- + X-scope:stage (buildMpHeaders) — simple pero inestable en preapproval.
    //   (b) credenciales del VENDEDOR de prueba (token APP_USR- de un test user) + comprador de prueba —
    //       el camino que MP recomienda para suscripciones: ambos test users => plata FALSA, entorno
    //       prod-like, sin la flakiness del sandbox. El payer DEBE ser @testuser.com (otro test user).
    if (normalizedConfigured) {
        if (!normalizedConfigured.toLowerCase().endsWith('@testuser.com')) {
            throw new Error(
                'MercadoPago test requiere payer_email @testuser.com. Configura MERCADOPAGO_TEST_PAYER_EMAIL con un comprador de prueba de MP.'
            )
        }
        return normalizedConfigured
    }

    // Sin test payer configurado: producción real. Un coach con email @testuser.com no debe pagar en prod.
    if (coachEmail.toLowerCase().endsWith('@testuser.com')) {
        throw new Error('Con token de produccion, el payer_email no puede ser un test user (@testuser.com).')
    }

    return coachEmail
}

/**
 * Construye el `external_reference` recurrente de suscripción `coachId|tier|cycle[|addon1+addon2]`
 * (round-trip idempotente con `parseCheckoutExternalReference`). La 4ª parte (add-ons) es opcional:
 * solo módulos válidos, deduplicados, orden estable; sin add-ons ⇒ reference de 3 partes (backward
 * compatible con preapprovals vivos).
 *
 * Exportado para que el camino de upgrade (confirm-upgrade / webhook tierUpgrade) reescriba el
 * `external_reference` del preapproval al NUEVO tier|cycle al activar (P0-1 stale-ref revert), de
 * modo que el siguiente evento `preapproval` ya no re-derive el tier viejo.
 */
export function buildCheckoutExternalReference(
    coachId: string,
    tier: SubscriptionTier,
    cycle: BillingCycle,
    addons?: ModuleKey[]
): string {
    const base = `${coachId}|${tier}|${cycle}`
    const liveAddons = [...new Set((addons ?? []).filter((k) => MODULE_KEY_SET.has(k)))]
    if (liveAddons.length === 0) return base
    return `${base}|${liveAddons.join('+')}`
}

function buildExternalReference(input: CreateCheckoutInput) {
    return buildCheckoutExternalReference(input.coachId, input.tier, input.billingCycle, input.addons)
}

async function mpRequest(path: string) {
    const accessToken = getMpAccessToken()
    const response = await fetch(`https://api.mercadopago.com${path}`, {
        headers: buildMpHeaders(accessToken),
    })
    if (!response.ok) {
        const text = await response.text()
        const requestId = response.headers.get('x-request-id')
        throw new Error(`MercadoPago request failed (${response.status})${requestId ? ` [x-request-id: ${requestId}]` : ''}: ${text}`)
    }
    return response.json()
}

async function mpPutJson(path: string, body: Record<string, unknown>) {
    const accessToken = getMpAccessToken()
    const response = await fetch(`https://api.mercadopago.com${path}`, {
        method: 'PUT',
        headers: buildMpHeaders(accessToken),
        body: JSON.stringify(body),
    })
    if (!response.ok) {
        const text = await response.text()
        const requestId = response.headers.get('x-request-id')
        throw new Error(`MercadoPago PUT failed (${response.status})${requestId ? ` [x-request-id: ${requestId}]` : ''}: ${text}`)
    }
    return response.json().catch(() => ({}))
}

async function mpPostJson(path: string, body: Record<string, unknown>) {
    const accessToken = getMpAccessToken()
    const response = await fetch(`https://api.mercadopago.com${path}`, {
        method: 'POST',
        headers: buildMpHeaders(accessToken),
        body: JSON.stringify(body),
    })
    if (!response.ok) {
        const text = await response.text()
        const requestId = response.headers.get('x-request-id')
        throw new Error(`MercadoPago POST failed (${response.status})${requestId ? ` [x-request-id: ${requestId}]` : ''}: ${text}`)
    }
    return response.json()
}

function toSnapshot(preapproval: Record<string, unknown>, fallbackId: string): ProviderCheckoutSnapshot {
    const ar = preapproval.auto_recurring as
        | { end_date?: string | null; transaction_amount?: number | null; start_date?: string | null }
        | undefined
    // `start_date` es la señal de "agendado al corte" del early-slash guard (SLASH-EARLY). MP
    // devuelve el inicio efectivo bajo `auto_recurring.start_date` (load-bearing — el que
    // `createCheckout` envía); el top-level se copia defensivamente. Sin esto el snapshot lo
    // dropea → el guard nunca dispara → un downgrade-al-corte degrada tier/max_clients YA.
    return {
        id: String(preapproval.id ?? fallbackId),
        external_reference: (preapproval.external_reference as string | null | undefined) ?? null,
        status: (preapproval.status as string | null | undefined) ?? null,
        next_payment_date: (preapproval.next_payment_date as string | null | undefined) ?? null,
        start_date: (preapproval.start_date as string | null | undefined) ?? null,
        auto_recurring: ar,
    }
}

/** Lee `auto_recurring.transaction_amount` de un preapproval (monto vigente del próximo cobro). */
function readPreapprovalAmount(preapproval: Record<string, unknown>): number | null {
    const ar = preapproval.auto_recurring as { transaction_amount?: number | null } | undefined
    const amount = ar?.transaction_amount
    return typeof amount === 'number' ? amount : null
}

export class MercadoPagoProvider implements PaymentsProvider {
    name = 'mercadopago' as const

    async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
        const accessToken = getMpAccessToken()
        const payerEmail = resolvePayerEmail(input.coachEmail)
        const externalReference = buildExternalReference(input)
        const cycle = BILLING_CYCLE_CONFIG[input.billingCycle]
        // Use provided startDate (downgrade/cambio de ciclo al corte) or default to 60s from now.
        // NORMALIZAMOS con .toISOString(): el corte viene de current_period_end del DB como
        // '2026-06-28T00:00:00+00:00' (sin milisegundos) y MP rechaza ese formato con 400
        // "Invalid format in auto_recurring.start_date". El default ya usaba .toISOString().
        const startDate = input.startDate
            ? new Date(input.startDate).toISOString()
            : new Date(Date.now() + 60_000).toISOString()
        const endDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 5).toISOString()

        const response = await fetch('https://api.mercadopago.com/preapproval', {
            method: 'POST',
            headers: buildMpHeaders(accessToken),
            body: JSON.stringify({
                reason: input.title,
                external_reference: externalReference,
                payer_email: payerEmail,
                back_url: input.successUrl,
                notification_url: input.webhookUrl,
                // "authorized" requires card_token_id. For checkout link flow we create it as pending.
                status: 'pending',
                auto_recurring: {
                    frequency: cycle.months,
                    frequency_type: 'months',
                    transaction_amount: input.amountClp,
                    currency_id: 'CLP',
                    start_date: startDate,
                    end_date: endDate,
                },
            }),
        })
        if (!response.ok) {
            const text = await response.text()
            const requestId = response.headers.get('x-request-id')
            throw new Error(
                `MercadoPago subscription creation failed (${response.status})${requestId ? ` [x-request-id: ${requestId}]` : ''}: ${text}`
            )
        }
        const payload = await response.json()

        return {
            checkoutId: String(payload.id),
            checkoutUrl: payload.init_point ?? payload.sandbox_init_point ?? '',
        }
    }

    async processWebhook(payload: unknown): Promise<WebhookProcessResult> {
        const body = (payload ?? {}) as WebhookShape
        const maybeId = body.data?.id
        const eventId = maybeId ? String(maybeId) : undefined

        if (!eventId) return { accepted: true }

        const eventType = body.type ?? body.topic ?? body.action ?? ''
        const isPreapprovalEvent = eventType.includes('preapproval') || eventType.includes('subscription')
        if (isPreapprovalEvent) {
            const preapproval = await mpRequest(`/preapproval/${eventId}`)
            const extRef =
                typeof preapproval.external_reference === 'string' ? preapproval.external_reference : null
            const parsed = parseCheckoutExternalReference(extRef)
            return {
                accepted: true,
                eventId,
                eventKind: 'preapproval',
                providerStatus: preapproval.status ?? undefined,
                coachId: parsed?.coachId,
                providerCheckoutId: String(preapproval.id ?? eventId),
                currentPeriodEnd: preapproval.next_payment_date ?? preapproval.auto_recurring?.end_date ?? null,
                externalReference: extRef,
                subscriptionTier: parsed?.tier ?? undefined,
                billingCycle: parsed?.billingCycle ?? undefined,
                // Monto vigente del preapproval: confirma el PUT en eventos `updated` y detecta drift.
                providerAmountClp: readPreapprovalAmount(preapproval),
                addons: parsed?.addons ?? [],
            }
        }

        if (!eventType.includes('payment')) {
            return { accepted: true, eventId, eventKind: 'other' }
        }

        const payment = await mpRequest(`/v1/payments/${eventId}`)
        const extRef = typeof payment.external_reference === 'string' ? payment.external_reference : null
        // Precedencia de parse (FUNDACION F4): el one-shot de add-on trae `addon_oneshot|...`;
        // el one-shot de upgrade de tier trae `tier_upgrade|...`; un cobro recurrente trae el
        // reference de suscripción `coachId|tier|cycle[|addons]`. Cada uno excluye a los siguientes.
        const oneShotAddon = parseOneShotAddonReference(extRef)
        const tierUpgrade = oneShotAddon ? null : parseTierUpgradeReference(extRef)
        const parsed = oneShotAddon || tierUpgrade ? null : parseCheckoutExternalReference(extRef)

        // ⚠️ payment.order.id ≠ preapproval id (Riesgo 2). El match robusto del cobro recurrente
        // contra el preapproval del coach se hace en el webhook por coachId (del external_reference);
        // capturar el payload real para fijar metadata.preapproval_id — validar en sandbox (item 2).
        const paidAt =
            typeof payment.date_approved === 'string'
                ? payment.date_approved
                : typeof payment.date_created === 'string'
                  ? payment.date_created
                  : null

        // Fallback de refund/chargeback (P1-1): una notificación de refund de MP a veces OMITE el
        // external_reference → sin coachId el webhook retorna antes y el refund se PIERDE en silencio.
        // Exponemos el id del preapproval (de metadata.preapproval_id o, defensivamente, del campo
        // top-level) para que el webhook recupere al coach por subscription_mp_id. payment.metadata
        // puede venir undefined → guardas de tipo en cada acceso.
        const preapprovalId =
            (typeof payment.metadata?.preapproval_id === 'string'
                ? payment.metadata.preapproval_id
                : null) ??
            (typeof payment.preapproval_id === 'string' ? payment.preapproval_id : null) ??
            null

        return {
            accepted: true,
            eventId,
            eventKind: 'payment',
            providerStatus: payment.status ?? undefined,
            coachId: oneShotAddon?.coachId ?? tierUpgrade?.coachId ?? parsed?.coachId,
            providerCheckoutId: payment.order?.id ? String(payment.order.id) : undefined,
            providerPaymentId: payment.id != null ? String(payment.id) : eventId,
            paidAt,
            externalReference: extRef,
            subscriptionTier: parsed?.tier ?? undefined,
            billingCycle: parsed?.billingCycle ?? undefined,
            addons: parsed?.addons ?? [],
            oneShotAddon,
            tierUpgrade,
            preapprovalId,
        }
    }

    async fetchCheckoutSnapshot(checkoutId: string): Promise<ProviderCheckoutSnapshot> {
        const encoded = encodeURIComponent(checkoutId)
        const preapproval = (await mpRequest(`/preapproval/${encoded}`)) as Record<string, unknown>
        return toSnapshot(preapproval, checkoutId)
    }

    /**
     * GET /v1/payments/{id}: estado actual de un pago one-shot. Lo usa `confirm-addon` (camino
     * síncrono del add-on prorrateado) para materializar la fila al volver del checkout, sin
     * depender del webhook (que sigue como backstop e idempotente). El `external_reference` trae
     * el reference dedicado `addon_oneshot|coachId|moduleKey|termsVersion`.
     */
    async fetchPaymentSnapshot(paymentId: string): Promise<ProviderPaymentSnapshot> {
        const encoded = encodeURIComponent(paymentId)
        const payment = (await mpRequest(`/v1/payments/${encoded}`)) as Record<string, unknown>
        return {
            id: String(payment.id ?? paymentId),
            status: (payment.status as string | null | undefined) ?? null,
            external_reference: (payment.external_reference as string | null | undefined) ?? null,
        }
    }

    async cancelCheckoutAtProvider(checkoutId: string): Promise<void> {
        const encoded = encodeURIComponent(checkoutId)
        await mpPutJson(`/preapproval/${encoded}`, { status: 'cancelled' })
    }

    /**
     * PUT /preapproval/{id}: sube/baja el monto del próximo cobro sin re-autorizar al pagador
     * (plan 05 F3.1). El body solo toca `auto_recurring.transaction_amount` + `currency_id`.
     *
     * validar en sandbox (item 1): MP no documenta CUÁNDO aplica el nuevo monto. Comportamiento
     * esperado: próximo cobro, sin cargo inmediato; MP notifica al pagador por email. Si el
     * preapproval está `paused`/`cancelled`, el PUT puede fallar — el llamador maneja el error
     * (reversión D5 en alta mensual; alerta de drift en el reconcile). validar en sandbox (item 7).
     */
    async updateCheckoutAmount(checkoutId: string, amountClp: number): Promise<void> {
        const encoded = encodeURIComponent(checkoutId)
        await mpPutJson(`/preapproval/${encoded}`, {
            auto_recurring: {
                transaction_amount: amountClp,
                currency_id: 'CLP',
            },
        })
    }

    /**
     * PUT /preapproval/{id}: como `updateCheckoutAmount` pero ADEMÁS reescribe el
     * `external_reference` del preapproval (MP PUT /preapproval/{id} acepta `external_reference`).
     *
     * Lo usa el camino de upgrade de tier (confirm-upgrade / webhook tierUpgrade) para subir el
     * monto del próximo cobro al NUEVO compuesto Y dejar el reference apuntando al nuevo tier|cycle
     * (P0-1 stale-ref revert): sin esto, el siguiente evento `preapproval` re-derivaría el tier
     * VIEJO del reference y revertiría el upgrade. Construir `externalReference` con
     * `buildCheckoutExternalReference`. Mismo manejo de error que `updateCheckoutAmount`
     * (preapproval `paused`/`cancelled` puede fallar el PUT).
     */
    async updateCheckoutAmountAndRef(
        checkoutId: string,
        amountClp: number,
        externalReference: string
    ): Promise<void> {
        const encoded = encodeURIComponent(checkoutId)
        await mpPutJson(`/preapproval/${encoded}`, {
            auto_recurring: {
                transaction_amount: amountClp,
                currency_id: 'CLP',
            },
            external_reference: externalReference,
        })
    }

    /**
     * Pago one-shot (Checkout Pro clásico vía Preferences, NO preapproval — plan 05 F3.2).
     * El `external_reference` dedicado `addon_oneshot|...` deja al webhook materializar la fila al
     * aprobarse el pago. El monto SIEMPRE lo calcula el server (`getAddonProrationClp`).
     *
     * validar en sandbox (item 9): preference one-shot con monto prorrateado correcto; pago
     * aprobado materializa fila + PUT; abandono = cero filas.
     */
    async createOneShotPayment(input: CreateOneShotInput): Promise<CreateOneShotResult> {
        const accessToken = getMpAccessToken()
        const payerEmail = resolvePayerEmail(input.coachEmail)
        const payload = await mpPostJson('/checkout/preferences', {
            items: [
                {
                    id: input.externalReference,
                    title: input.description,
                    quantity: 1,
                    unit_price: input.amountClp,
                    currency_id: 'CLP',
                },
            ],
            payer: { email: payerEmail },
            external_reference: input.externalReference,
            notification_url: input.webhookUrl,
            back_urls: {
                success: input.successUrl,
                failure: input.failureUrl,
                pending: input.pendingUrl,
            },
            auto_return: 'approved',
        })
        return {
            checkoutUrl: payload.init_point ?? payload.sandbox_init_point ?? '',
            preferenceId: String(payload.id ?? ''),
        }
    }
}
