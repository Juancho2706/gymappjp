import type {
    CreateCheckoutInput,
    CreateCheckoutResult,
    CreateOneShotInput,
    CreateOneShotResult,
    PaymentsProvider,
    ProviderCheckoutSnapshot,
    ProviderPaymentSnapshot,
    WebhookProcessResult,
} from '@/lib/payments/types'
import { buildSignedFlowBody, signFlowParams, type FlowParams } from '@/lib/payments/providers/flow-signature'
import {
    mapFlowPaymentStatus,
    mapFlowSubscriptionStatus,
    normalizeFlowOneShotPayment,
    normalizeFlowRecurringInvoice,
    parseFlowRecurringCommerceOrder,
    type FlowInvoice,
    type FlowPaymentStatus,
} from '@/lib/payments/providers/flow-normalize'
import { parseOneShotAddonReference, parseTierUpgradeReference } from '@/lib/payments/providers/mercadopago'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

/**
 * FlowProvider — adaptador REST de Flow.cl (Webpay). Segunda implementacion de `PaymentsProvider`
 * detras del puerto multi-gateway (plan pagos-multigateway-flow).
 *
 * Ola 2 = metodos OUTBOUND (llamadas salientes a Flow, validadas contra sandbox):
 *   createCheckout (Fase 1: enrolar tarjeta) · createOneShotPayment · fetchPaymentSnapshot ·
 *   fetchCheckoutSnapshot · cancelCheckoutAtProvider.
 * Diferidos (throw etiquetado):
 *   processWebhook → Ola 3 (ruta webhook + auth firmada + resolucion de coachId por DB).
 *   updateCheckoutAmount / updateCheckoutAmountAndRef → Ola 5 (modelo de items/changePlan de Flow).
 *   updateCardAtProvider / fetchCardTokenSummary → Ola 4 (cambio de tarjeta es REDIRECT en Flow, no
 *   un card token sincrono como MP).
 *
 * Firma HMAC-SHA256 en `flow-signature.ts`; normalizacion de webhooks en `flow-normalize.ts`.
 * Config por env (leida LAZY por llamada, para que `new FlowProvider()` no truene sin env):
 *   FLOW_API_KEY, FLOW_SECRET_KEY, FLOW_API_BASE (default sandbox = fail-safe a plata FALSA).
 */
export class FlowProvider implements PaymentsProvider {
    name = 'flow' as const

    private config() {
        const apiKey = process.env.FLOW_API_KEY
        const secretKey = process.env.FLOW_SECRET_KEY
        // Default sandbox a proposito: una mala config apunta a plata FALSA, nunca a cobrar de verdad.
        // Prod DEBE setear FLOW_API_BASE=https://www.flow.cl/api explicitamente. `.replace(/\/+$/,'')`:
        // una barra final (typo de env comun) daria `.../api//payment/create` → 404 en TODA llamada Flow.
        const apiBase = process.env.FLOW_API_BASE?.trim().replace(/\/+$/, '') || 'https://sandbox.flow.cl/api'
        if (!apiKey || !secretKey) throw new Error('Missing FLOW_API_KEY / FLOW_SECRET_KEY')
        return { apiKey, secretKey, apiBase }
    }

    /** Extrae `{code, message}` del error de Flow (shape oficial) para un throw legible. */
    private async parseError(res: Response, service: string): Promise<never> {
        const text = await res.text().catch(() => '')
        let code: unknown, message: unknown
        try {
            const json = JSON.parse(text)
            code = json?.code
            message = json?.message
        } catch {
            /* body no-JSON */
        }
        throw new Error(`Flow ${service} failed (HTTP ${res.status})${code != null ? ` code=${code}` : ''}: ${message ?? text}`)
    }

    /** POST firmado (application/x-www-form-urlencoded). El `apiKey` se inyecta acá. */
    private async flowPost(service: string, params: FlowParams): Promise<Record<string, unknown>> {
        const { apiKey, secretKey, apiBase } = this.config()
        const body = buildSignedFlowBody({ ...params, apiKey }, secretKey)
        const res = await fetch(`${apiBase}/${service}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        })
        if (!res.ok) return this.parseError(res, service)
        return (await res.json().catch(() => ({}))) as Record<string, unknown>
    }

    /** GET firmado (params + `s` en el query string). El `apiKey` se inyecta acá. */
    private async flowGet(service: string, params: FlowParams): Promise<Record<string, unknown>> {
        const { apiKey, secretKey, apiBase } = this.config()
        const withKey = { ...params, apiKey }
        const usp = new URLSearchParams()
        for (const [k, v] of Object.entries(withKey)) usp.append(k, String(v))
        usp.append('s', signFlowParams(withKey, secretKey))
        const res = await fetch(`${apiBase}/${service}?${usp.toString()}`, { method: 'GET' })
        if (!res.ok) return this.parseError(res, service)
        return (await res.json().catch(() => ({}))) as Record<string, unknown>
    }

    /**
     * ALTA RECURRENTE — Fase 1 (enrolamiento de tarjeta por Webpay). NO crea la suscripcion todavia:
     * Flow exige un `customerId` con tarjeta enrolada ANTES de `subscription/create` (flujo de dos
     * fases, ver PLAN §"Flujo de DOS FASES"). Devuelve la URL de enrolamiento como `checkoutUrl` (ahi
     * el coach ve Webpay y entra su tarjeta) y el `customerId` como `checkoutId` (a persistir en
     * `coaches.provider_customer_id`). La Fase 2 (`plans/create` + `subscription/create`) la corre
     * `confirm-subscription` al volver (Ola 3/4).
     */
    async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
        // Reusar el customer ya enrolado si viene; si no, crearlo.
        let customerId = input.existingCustomerId?.trim() || null
        if (!customerId) {
            const created = await this.flowPost('customer/create', {
                name: input.coachId,
                email: input.coachEmail,
                externalId: input.coachId,
            })
            customerId = created.customerId != null ? String(created.customerId) : null
            if (!customerId) throw new Error('Flow customer/create: sin customerId en la respuesta')
        }
        // url_return: a donde Flow devuelve el browser Y postea el `token` del enrolamiento; ahi la
        // Fase 2 llama customer/getRegisterStatus + crea la suscripcion. PIN sandbox: confirmar que el
        // POST de retorno trae `token` y que successUrl es el handler correcto (Ola 3/4).
        const register = await this.flowPost('customer/register', {
            customerId,
            url_return: input.successUrl,
        })
        const url = register.url != null ? String(register.url) : null
        const token = register.token != null ? String(register.token) : null
        if (!url || !token) throw new Error('Flow customer/register: sin url/token en la respuesta')
        return { checkoutId: customerId, checkoutUrl: `${url}?token=${token}` }
    }

    /**
     * PAGO ONE-SHOT (proration de add-on trim/anual, diferencia de tier-upgrade). `payment/create`
     * clasico → Webpay visible (confianza). El `commerceOrder` transporta nuestro `externalReference`
     * dedicado (`addon_oneshot|...` / `tier_upgrade|...`) que el webhook parsea. Validado en Fase 0.
     */
    async createOneShotPayment(input: CreateOneShotInput): Promise<CreateOneShotResult> {
        const created = await this.flowPost('payment/create', {
            commerceOrder: input.externalReference,
            subject: input.description,
            currency: 'CLP',
            amount: input.amountClp,
            email: input.coachEmail,
            paymentMethod: 9, // todos los medios (incluye Webpay)
            urlConfirmation: input.webhookUrl,
            urlReturn: input.successUrl,
        })
        const url = created.url != null ? String(created.url) : null
        const token = created.token != null ? String(created.token) : null
        if (!url || !token) throw new Error('Flow payment/create: sin url/token en la respuesta')
        return {
            checkoutUrl: `${url}?token=${token}`,
            preferenceId: created.flowOrder != null ? String(created.flowOrder) : '',
        }
    }

    /**
     * Estado de un pago one-shot por su `flowOrder` (== nuestro `providerPaymentId`). Lo usa el camino
     * sincrono `confirm-addon`. `status` se mapea al vocabulario del pipeline (mapProviderStatus).
     */
    async fetchPaymentSnapshot(paymentId: string): Promise<ProviderPaymentSnapshot> {
        const p = await this.flowGet('payment/getStatusByFlowOrder', { flowOrder: paymentId })
        return {
            id: p.flowOrder != null ? String(p.flowOrder) : paymentId,
            status: mapFlowPaymentStatus(p.status as number | null | undefined),
            external_reference: (p.commerceOrder as string | null | undefined) ?? null,
        }
    }

    /**
     * Estado de la suscripcion recurrente por `subscriptionId` (== nuestro `checkoutId` Flow). Lo usa
     * `confirm-subscription` (reconcile sincrono). Mapea el shape de Flow al `ProviderCheckoutSnapshot`
     * MP-shaped: `next_payment_date`=proxima invoice, `auto_recurring.end_date`=fin del periodo.
     */
    async fetchCheckoutSnapshot(checkoutId: string): Promise<ProviderCheckoutSnapshot> {
        const sub = await this.flowGet('subscription/get', { subscriptionId: checkoutId })
        return {
            id: sub.subscriptionId != null ? String(sub.subscriptionId) : checkoutId,
            external_reference: null, // Flow no lleva nuestro ref en la sub; el tier vive en `coaches`.
            status: mapFlowSubscriptionStatus(sub.status as number | null | undefined),
            next_payment_date: (sub.next_invoice_date as string | null | undefined) ?? null,
            start_date: (sub.subscription_start as string | null | undefined) ?? null,
            auto_recurring: {
                end_date: (sub.period_end as string | null | undefined) ?? null,
                transaction_amount: null, // monto = plan+items; se reconcilia contra invoices, no acá.
                start_date: (sub.period_start as string | null | undefined) ?? null,
            },
        }
    }

    /**
     * Cancela la suscripcion recurrente CONSERVANDO el acceso hasta fin del periodo pagado
     * (`at_period_end=1`). La maquina de estados EVA (canceled con current_period_end) no cambia.
     */
    async cancelCheckoutAtProvider(checkoutId: string): Promise<void> {
        await this.flowPost('subscription/cancel', { subscriptionId: checkoutId, at_period_end: 1 })
    }

    /**
     * Resuelve el coachId de una suscripcion Flow por `subscriptionId → coaches.subscription_provider_external_id`
     * (service-role, RLS-bypass). Divergencia con MP a proposito: el `commerceOrder` de un cobro recurrente
     * de Flow lo GENERA Flow (`sus_<subId>_<invId>_...`) y NO lleva nuestro coachId, asi que —a diferencia
     * del MP provider, que lo saca del external_reference sin tocar DB— aca hace falta el lookup. Null si no
     * hay coach con esa sub (webhook huerfano → el pipeline ackea 200 sin actuar). Aislado y mockeable.
     */
    private async resolveCoachIdBySubscriptionId(subscriptionId: string): Promise<string | null> {
        const admin = createServiceRoleClient()
        const { data, error } = await admin
            .from('coaches')
            .select('id')
            .eq('subscription_provider_external_id', subscriptionId)
            .maybeSingle()
        // ⚠️ money-safety (panel Ola 3): distinguir "no hay coach" (huerfano → null → 200, no reintenta)
        // de "la query FALLO" (timeout / pooler saturado / >1 fila). Ignorar el error confundiria un hipo
        // transitorio con un huerfano → el pipeline ackearia 200 → Flow NO reintenta → cobro real perdido.
        // Tiramos ante error para que processWebhook propague → pipeline 502 → Flow reintenta en segundos.
        if (error) throw new Error(`Flow coachId lookup failed: ${error.message}`)
        return data?.id ?? null
    }

    /**
     * Procesa el webhook de Flow. Flow SOLO manda un `token` por POST (nunca el estado) → confianza =
     * RE-CONSULTA FIRMADA. Camino:
     *   1. `payment/getStatus(token)` firmado → trae el `commerceOrder` (el discriminador).
     *   2. `commerceOrder` = nuestro ref (`addon_oneshot|...` / `tier_upgrade|...`) → ONE-SHOT: coachId sale
     *      del ref (puro, sin DB), normaliza el payment.
     *   3. `commerceOrder` = ref de Flow (`sus_<subId>_<invId>_...`) → COBRO RECURRENTE: resuelve coachId por
     *      DB (subscriptionId → coaches), re-consulta `invoice/get(invId)` firmado (trae status + period_end
     *      + payment) y normaliza. coachId huerfano → `accepted:true` sin coachId (pipeline ackea 200).
     *   4. cualquier otra cosa → `accepted:false`.
     * NOTA: refund/chargeback NO llega por aca — Flow lo notifica por el `urlCallBack` del refund
     * (refund/getStatus, callback separado). Su manejo money-safety (cancelar la sub en Flow) es T3.7.
     */
    async processWebhook(payload: unknown): Promise<WebhookProcessResult> {
        const token =
            payload && typeof payload === 'object' && 'token' in payload
                ? String((payload as { token?: unknown }).token ?? '')
                : ''
        if (!token) return { accepted: false }

        const payment = (await this.flowGet('payment/getStatus', { token })) as FlowPaymentStatus
        const commerceOrder = payment.commerceOrder ?? null

        // (2) ONE-SHOT: el commerceOrder es NUESTRO ref dedicado → coachId del ref, sin DB.
        if (parseOneShotAddonReference(commerceOrder) || parseTierUpgradeReference(commerceOrder)) {
            return normalizeFlowOneShotPayment(payment)
        }

        // (3) COBRO RECURRENTE: commerceOrder generado por Flow (`sus_<subId>_<invId>_...`).
        const rec = parseFlowRecurringCommerceOrder(commerceOrder)
        if (rec) {
            const coachId = await this.resolveCoachIdBySubscriptionId(rec.subscriptionId)
            // Huerfano (sub cancelada/desconocida): aceptar sin coachId → el pipeline loguea y ackea 200
            // (no reintenta en loop) en vez de romper. El reconcile cron es el backstop.
            if (!coachId) return { accepted: true }
            const invoice = (await this.flowGet('invoice/get', { invoiceId: rec.invoiceId })) as FlowInvoice
            return normalizeFlowRecurringInvoice(invoice, coachId)
        }

        // (4) commerceOrder no reconocido → no lo movemos.
        return { accepted: false }
    }

    async updateCheckoutAmount(_checkoutId: string, _amountClp: number, _idempotencyKey?: string): Promise<void> {
        // Ola 5: Flow no tiene "PUT monto"; el monto = plan + items + coupon. Se traduce a
        // subscription/addItem | deleteItem | changePlan segun el diff (port semantico extendido).
        throw new Error('FlowProvider.updateCheckoutAmount: not implemented (Ola 5 — items/changePlan)')
    }

    async updateCheckoutAmountAndRef(
        _checkoutId: string,
        _amountClp: number,
        _externalReference: string,
        _idempotencyKey?: string
    ): Promise<void> {
        // Ola 5: el rewrite de external_reference es no-op en Flow (el tier vive en `coaches`); el
        // ajuste de monto es addItem/deleteItem/changePlan como updateCheckoutAmount.
        throw new Error('FlowProvider.updateCheckoutAmountAndRef: not implemented (Ola 5 — items/changePlan)')
    }

    async updateCardAtProvider(_checkoutId: string, _cardTokenId: string, _idempotencyKey: string): Promise<void> {
        // Ola 4: en Flow el cambio de tarjeta es un REDIRECT (customer/register de nuevo → Webpay), no
        // un card token sincrono como MP. El endpoint/UI de change-card bifurca por gateway.
        throw new Error('FlowProvider.updateCardAtProvider: not implemented (Ola 4 — redirect change-card)')
    }

    async fetchCardTokenSummary(_cardTokenId: string): Promise<{ last4: string | null }> {
        // Ola 4: Flow no usa card tokens (cambio de tarjeta por redirect). El last4 sale de
        // customer/getRegisterStatus (last4CardDigits) en el flujo de enrolamiento, no de un token.
        throw new Error('FlowProvider.fetchCardTokenSummary: not implemented (Ola 4 — sin card token en Flow)')
    }
}
