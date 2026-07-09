import type {
    CreateCheckoutInput,
    CreateCheckoutResult,
    CreateOneShotInput,
    CreateOneShotResult,
    PaymentsProvider,
    ProviderCheckoutSnapshot,
    ProviderPaymentSnapshot,
    SubscriptionChangeResult,
    SubscriptionCompositeInput,
    WebhookProcessResult,
} from '@/lib/payments/types'
import { buildSignedFlowBody, signFlowParams, type FlowParams } from '@/lib/payments/providers/flow-signature'
import {
    mapFlowPaymentStatus,
    mapFlowSubscriptionStatus,
    normalizeFlowOneShotPayment,
    normalizeFlowRecurringInvoice,
    parseFlowDate,
    parseFlowRecurringCommerceOrder,
    type FlowInvoice,
    type FlowPaymentStatus,
} from '@/lib/payments/providers/flow-normalize'
import { parseOneShotAddonReference, parseTierUpgradeReference } from '@/lib/payments/providers/mercadopago'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

type FlowCycle = 'monthly' | 'quarterly' | 'annual'

/**
 * planId DETERMINISTICO por monto: `eva_<tier>_<cycle>_<amountClp>` (ej. `eva_pro_monthly_29990`).
 * UNICA fuente del id de plan de Flow — la comparten el alta (createSubscriptionForEnrolledCustomer)
 * y todo cambio de compuesto (changeSubscriptionPlan/updateCheckoutAmount). Un monto distinto = plan
 * NUEVO, garantizando que Flow cobra EXACTAMENTE el compuesto que EVA calculo (sin drift).
 */
function planIdFor(tier: string, cycle: FlowCycle, amountClp: number): string {
    return `eva_${tier}_${cycle}_${amountClp}`
}

/**
 * Mapeo ciclo → intervalo de Flow (enum REAL: 1=dia · 2=semana · 3=mes · 4=anio):
 *   monthly → 3×1 · quarterly → 3×3 · annual → 4×1.
 */
function flowIntervalFor(cycle: FlowCycle): { interval: number; interval_count: number } {
    return cycle === 'monthly'
        ? { interval: 3, interval_count: 1 }
        : cycle === 'quarterly'
          ? { interval: 3, interval_count: 3 }
          : { interval: 4, interval_count: 1 } // annual
}

/**
 * FlowProvider — adaptador REST de Flow.cl (Webpay). Segunda implementacion de `PaymentsProvider`
 * detras del puerto multi-gateway (plan pagos-multigateway-flow).
 *
 * Ola 2 = metodos OUTBOUND (llamadas salientes a Flow, validadas contra sandbox):
 *   createCheckout (Fase 1: enrolar tarjeta) · createOneShotPayment · fetchPaymentSnapshot ·
 *   fetchCheckoutSnapshot · cancelCheckoutAtProvider.
 * Ola 5 = cambios de compuesto sobre sub viva (puerto semantico T5.1): changeSubscriptionPlan /
 *   add/removeSubscriptionItem (ensure-plan deterministico + subscription/changePlan) + los
 *   updateCheckoutAmount/AndRef del cupon-expira (traducidos a changePlan; tier/cycle salen del coach) +
 *   startCardReenrollment (T5.5: cambio de tarjeta = redirect de re-enrolamiento, el endpoint
 *   /api/payments/change-card bifurca por `coaches.subscription_provider`).
 * Diferidos (throw etiquetado, quedan FUERA del puerto `PaymentsProvider` a proposito):
 *   updateCardAtProvider / fetchCardTokenSummary → el shape MP (card token sincrono) no aplica a Flow;
 *   el cambio de tarjeta real de Flow es `startCardReenrollment` (metodo Flow-especifico, no del puerto).
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

    /**
     * Busca el customerId de un customer YA creado en Flow por nuestro `externalId` (= coachId).
     * Recuperacion del caso "customer huerfano": creado en Flow pero nunca persistido en coaches.
     * `customer/list` pagina con {total, hasMore, data[]}; su `filter` NO matchea externalId ni email
     * (validado en sandbox: el name ademas se guarda sin guiones) → se escanea data[] por externalId.
     * Cap de 10 paginas x 100 (bastan por anos; si algun dia se supera, el throw original burbujea).
     */
    private async findCustomerIdByExternalId(externalId: string): Promise<string | null> {
        for (let page = 0; page < 10; page++) {
            const res = await this.flowGet('customer/list', { start: page * 100, limit: 100 })
            const data = Array.isArray(res.data) ? (res.data as Array<Record<string, unknown>>) : []
            const hit = data.find((c) => String(c.externalId ?? '') === externalId)
            if (hit?.customerId != null) return String(hit.customerId)
            if (!res.hasMore || data.length === 0) break
        }
        return null
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
     * plans/create IDEMPOTENTE de un plan deterministico por monto (`eva_<tier>_<cycle>_<amountClp>`).
     * Extraido de createSubscriptionForEnrolledCustomer para reusarlo desde changeSubscriptionPlan /
     * updateCheckoutAmount (cada cambio de compuesto Flow = plan NUEVO). IDEMPOTENTE por construccion:
     * el planId es deterministico, asi que un reintento (o dos coaches con el MISMO combo) apuntan al
     * MISMO plan — correcto, plan compartido con el amount ya congelado. DATO REAL (sandbox 2026-07-09):
     * plans/create con planId duplicado responde HTTP 401 {code:501,"...This planId has already been
     * used"} → el regex DEBE matchear ese mensaje real; exist/ya existe/duplicad quedan como red
     * defensiva por si Flow cambia el copy. Cualquier OTRO error se re-lanza (no lo tragamos).
     * urlCallback EN EL PLAN = donde Flow notifica los cobros recurrentes (money-critical).
     */
    private async ensurePlan(
        planId: string,
        name: string,
        amountClp: number,
        cycle: FlowCycle,
        webhookUrl: string
    ): Promise<void> {
        const { interval, interval_count } = flowIntervalFor(cycle)
        try {
            await this.flowPost('plans/create', {
                planId,
                name,
                currency: 'CLP',
                amount: amountClp,
                interval,
                interval_count,
                urlCallback: webhookUrl,
                charges_retries_number: 3,
            })
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            if (!/already been used|exist|ya existe|duplicad/i.test(msg)) throw e
            // Plan ya existe (mismo monto por construccion del planId) → seguir.
        }
    }

    /** URL del webhook de Flow para el urlCallback del plan (recurrentes). Igual que confirm-enrollment. */
    private defaultFlowWebhookUrl(): string {
        const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
        const token = process.env.FLOW_WEBHOOK_TOKEN
        return token
            ? `${appUrl}/api/payments/flow/webhook?token=${encodeURIComponent(token)}`
            : `${appUrl}/api/payments/flow/webhook`
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
            try {
                const created = await this.flowPost('customer/create', {
                    name: input.coachId,
                    email: input.coachEmail,
                    externalId: input.coachId,
                })
                customerId = created.customerId != null ? String(created.customerId) : null
            } catch (error) {
                // HOTFIX (incidente go-live 2026-07-09): si un intento previo creo el customer en Flow
                // pero el request murio ANTES de persistir provider_customer_id (fallo posterior del
                // route / doble-click), Flow rechaza el externalId duplicado (code 501 "There is a
                // customer with this externalId") y el coach quedaba BRICKEADO. Recuperamos el customer
                // huerfano escaneando customer/list por externalId (validado: el filter de Flow NO
                // matchea por externalId ni email → hay que escanear data[]).
                const message = error instanceof Error ? error.message : String(error)
                if (/customer with this externalId/i.test(message)) {
                    customerId = await this.findCustomerIdByExternalId(input.coachId)
                }
                if (!customerId) throw error
            }
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

    // ── Metodos Flow-especificos (flujo de DOS FASES) ────────────────────────────
    // NO van al puerto `PaymentsProvider` (MP es de una fase): son publicos extra de la clase,
    // llamados directamente por el flujo de alta recurrente de Flow (confirm-subscription, Ola 4).

    /**
     * CAMBIO DE TARJETA (Ola 5, T5.5) — RE-ENROLAR por redirect. A diferencia de MP (card token
     * sincrono via Secure Fields), Flow no tiene un "PUT tarjeta": la unica forma de reemplazarla
     * es volver a pasar el customer por Webpay (`customer/register`, MISMO customerId). La tarjeta
     * nueva reemplaza a la anterior EN EL CUSTOMER; la suscripcion viva sigue cobrando —a la tarjeta
     * nueva— sin tocar plan/monto/ciclo (Flow resuelve el cobro por customer, no por tarjeta).
     * Calca la Fase 1 de `createCheckout` (mismo shape `url+token`) pero sobre un customer YA
     * existente: exige el `customerId` persistido en `coaches.provider_customer_id` (el caller
     * responde 409 si no hay uno — este metodo nunca crea un customer nuevo).
     */
    async startCardReenrollment(customerId: string, urlReturn: string): Promise<{ redirectUrl: string }> {
        const register = await this.flowPost('customer/register', {
            customerId,
            url_return: urlReturn,
        })
        const url = register.url != null ? String(register.url) : null
        const token = register.token != null ? String(register.token) : null
        if (!url || !token) {
            throw new Error('Flow customer/register: sin url/token en la respuesta (re-enrollment de tarjeta)')
        }
        return { redirectUrl: `${url}?token=${token}` }
    }

    /**
     * FASE 2a — ¿la tarjeta del customer YA quedo enrolada? Tras el redirect de enrolamiento
     * (Fase 1 = customer/register → Webpay), el browser vuelve y hay que confirmar que la tarjeta
     * se guardo ANTES de crear la suscripcion. Shape real confirmado en sandbox: al enrolar,
     * `pay_mode` flipea 'manual'→'auto' y aparecen `creditCardType` + `last4CardDigits` +
     * `registerDate` (antes de enrolar los tres son null). Exigimos creditCardType Y registerDate
     * presentes (no basta uno) para no dar por enrolado un customer a medias.
     */
    async getCustomerEnrollmentStatus(customerId: string): Promise<{ enrolled: boolean; cardType: string | null; last4: string | null }> {
        const c = await this.flowGet('customer/get', { customerId })
        const cardType = c.creditCardType != null ? String(c.creditCardType) : null
        const last4 = c.last4CardDigits != null ? String(c.last4CardDigits) : null
        const registerDate = c.registerDate != null ? String(c.registerDate) : null
        const enrolled = !!cardType && !!registerDate
        return { enrolled, cardType: cardType || null, last4: last4 || null }
    }

    /**
     * FASE 2b — crea la suscripcion recurrente para un customer con tarjeta YA enrolada
     * (plans/create + subscription/create). Flow COBRA INMEDIATO al crear la sub (la primera
     * invoice viene pagada al toque en la respuesta → `firstInvoice`).
     *
     * DECISION v1 (monto horneado en el plan): el monto compuesto (base + addons − descuento, que
     * el caller calcula con getCompositeAmountClp — UNICA fuente de verdad de la plata) va HORNEADO
     * en el `amount` del plan. El planId es DETERMINISTICO POR MONTO: `eva_<tier>_<cycle>_<amountClp>`
     * (ej. `eva_pro_monthly_29990`). Consecuencia: un cambio de monto (cupon expira, add-on nuevo) =
     * plan NUEVO. Garantiza que Flow cobra EXACTAMENTE el compuesto (sin drift). DECISION Ola 5: todo
     * cambio de compuesto (changeSubscriptionPlan) reusa este MISMO camino (ensure-plan deterministico
     * nuevo + subscription/changePlan) — los items reales de Flow quedan diferidos (via no validada).
     *
     * Intervalos (enum REAL de Flow: 1=dia · 2=semana · 3=mes · 4=anio):
     *   monthly → interval 3, count 1 · quarterly → interval 3, count 3 · annual → interval 4, count 1.
     */
    async createSubscriptionForEnrolledCustomer(input: {
        customerId: string
        tier: string
        cycle: 'monthly' | 'quarterly' | 'annual'
        amountClp: number
        planLabel: string
        webhookUrl: string
    }): Promise<{
        subscriptionId: string
        planId: string
        periodEnd: string | null
        firstInvoice: { id: string; paid: boolean; paidAmountClp: number | null } | null
    }> {
        const planId = planIdFor(input.tier, input.cycle, input.amountClp)
        // Paso 1 — plan deterministico por monto (idempotente; extraido a ensurePlan para reuso desde
        // changeSubscriptionPlan/updateCheckoutAmount). urlCallback EN EL PLAN = donde Flow notifica los
        // cobros recurrentes de este plan (money-critical).
        await this.ensurePlan(planId, input.planLabel, input.amountClp, input.cycle, input.webhookUrl)

        // Paso 2 — subscription/create. Flow cobra la primera invoice al toque.
        const sub = await this.flowPost('subscription/create', { planId, customerId: input.customerId })
        const subscriptionId = sub.subscriptionId != null ? String(sub.subscriptionId) : null
        if (!subscriptionId) throw new Error('Flow subscription/create: sin subscriptionId en la respuesta')

        const invoices = Array.isArray(sub.invoices) ? (sub.invoices as Array<Record<string, unknown>>) : []
        const inv = invoices[0]
        const firstInvoice = inv
            ? {
                  id: String(inv.id),
                  paid: Number(inv.status) === 1, // Number(): Flow stringifica el status
                  paidAmountClp: inv.amount != null ? Number(inv.amount) : null,
              }
            : null

        return {
            subscriptionId,
            planId,
            periodEnd: parseFlowDate(sub.period_end as string | null | undefined),
            firstInvoice,
        }
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

    /**
     * Resuelve tier+cycle del coach dueño de una sub Flow por
     * `subscription_provider_external_id → coaches` (service-role, RLS-bypass). Lo necesita
     * updateCheckoutAmount: la firma del puerto solo trae el MONTO, pero Flow hornea el plan por
     * `eva_<tier>_<cycle>_<amount>` → tier/cycle salen del coach row. Divergencia con MP a proposito
     * (MP mueve el monto sin conocer tier/cycle). Null si no hay coach con esa sub. Tira ante error de
     * query (no lo confunde con "no hay coach" — un hipo transitorio no debe tragarse un cambio de plata).
     */
    private async resolveCoachTierCycleBySubscriptionId(
        subscriptionId: string
    ): Promise<{ tier: string; cycle: FlowCycle } | null> {
        const admin = createServiceRoleClient()
        const { data, error } = await admin
            .from('coaches')
            .select('subscription_tier, billing_cycle')
            .eq('subscription_provider_external_id', subscriptionId)
            .maybeSingle()
        if (error) throw new Error(`Flow tier/cycle lookup failed: ${error.message}`)
        if (!data) return null
        return { tier: String(data.subscription_tier), cycle: data.billing_cycle as FlowCycle }
    }

    /**
     * Cambia el plan/compuesto de una sub Flow VIVA al `input.amountClp`. Flow NO tiene "PUT monto":
     * el camino es ensure-plan deterministico nuevo (`eva_<tier>_<cycle>_<amountClp>`) +
     * `subscription/changePlan` → cambio INMEDIATO en la MISMA sub.
     *
     * MONEY-SAFETY (VALIDADO sandbox 2026-07-09): changePlan responde HTTP 200 con `{balance}`.
     *   - SUBIDA de monto → balance POSITIVO: Flow EMITE+COBRA al instante una invoice por la
     *     diferencia (validado 5000→14990 → invoice $9.990 pagada). `chargedNowClp = balance`.
     *     El caller NUNCA suma un one-shot propio encima (seria DOBLE cobro).
     *   - BAJADA de monto → balance NEGATIVO: credito absorbido por Flow (invoice $0).
     *     `creditClp = |balance|`, sin cargo.
     */
    async changeSubscriptionPlan(
        subscriptionRef: string,
        input: SubscriptionCompositeInput
    ): Promise<SubscriptionChangeResult> {
        const newPlanId = planIdFor(input.tier, input.cycle, input.amountClp)
        await this.ensurePlan(newPlanId, input.planLabel, input.amountClp, input.cycle, input.webhookUrl)
        const res = await this.flowPost('subscription/changePlan', {
            subscriptionId: subscriptionRef,
            newPlanId,
        })
        // U17: tras un changePlan EXITOSO, refrescar `coaches.provider_plan_id` al planId NUEVO
        // (service-role, best-effort tragable). El drift del cron `flow-reconcile` compara el monto
        // horneado en `provider_plan_id` contra el compuesto esperado; sin este refresco, tras CUALQUIER
        // changePlan (cupón, add-on, sync del cron) el `provider_plan_id` queda RANCIO y el cron
        // alertaría/sincronizaría en falso PARA SIEMPRE. Cubre todos los caminos que pasan por acá:
        // updateCheckoutAmount / updateCheckoutAmountAndRef / add-removeSubscriptionItem / changePlan directo.
        try {
            const admin = createServiceRoleClient()
            await admin
                .from('coaches')
                .update({ provider_plan_id: newPlanId })
                .eq('subscription_provider_external_id', subscriptionRef)
        } catch (persistErr) {
            console.error('[flow] no se pudo refrescar provider_plan_id tras changePlan (no crítico)', {
                subscriptionRef,
                newPlanId,
                message: persistErr instanceof Error ? persistErr.message : String(persistErr),
            })
        }
        // Flow stringifica los numeros → Number(). balance>0 = cobrado ya; balance<0 = credito.
        const balance = res.balance != null ? Number(res.balance) : 0
        return {
            applied: true,
            chargedNowClp: balance > 0 ? balance : null,
            creditClp: balance < 0 ? Math.abs(balance) : null,
        }
    }

    /**
     * add/removeSubscriptionItem en Flow v1 = alias semanticos de changeSubscriptionPlan: el "item"
     * es el compuesto YA horneado por el service (`input.amountClp` trae base ± add-ons − descuento).
     * El efecto money es identico al changePlan (subida cobra la diferencia; bajada acredita). La
     * granularidad de items REALES de Flow (subscription/addItem/deleteItem) queda diferida hasta que
     * esa via se valide contra sandbox — el resultado de plata no cambia.
     */
    async addSubscriptionItem(
        subscriptionRef: string,
        input: SubscriptionCompositeInput
    ): Promise<SubscriptionChangeResult> {
        return this.changeSubscriptionPlan(subscriptionRef, input)
    }

    async removeSubscriptionItem(
        subscriptionRef: string,
        input: SubscriptionCompositeInput
    ): Promise<SubscriptionChangeResult> {
        return this.changeSubscriptionPlan(subscriptionRef, input)
    }

    /**
     * Ajusta el monto del proximo cobro de una sub Flow al `amountClp`. Es el camino
     * provider-agnostico del cupon-expira del webhook (que solo conoce el MONTO nuevo). Flow no tiene
     * "PUT monto" → resuelve tier/cycle del coach por DB (la firma del puerto no los trae) y hace
     * ensure-plan + changePlan al nuevo compuesto (misma mecanica que changeSubscriptionPlan). El
     * `idempotencyKey` de MP no aplica en Flow (el planId deterministico ya es la clave de dedup: dos
     * changePlan al mismo monto convergen al mismo plan). Tira si no hay coach para esa sub (huerfano
     * = no debemos mover plata a ciegas).
     */
    async updateCheckoutAmount(checkoutId: string, amountClp: number, _idempotencyKey?: string): Promise<void> {
        const ctx = await this.resolveCoachTierCycleBySubscriptionId(checkoutId)
        if (!ctx) throw new Error(`Flow updateCheckoutAmount: sin coach para la suscripcion ${checkoutId}`)
        await this.changeSubscriptionPlan(checkoutId, {
            tier: ctx.tier,
            cycle: ctx.cycle,
            amountClp,
            planLabel: `EVA ${ctx.tier} (${ctx.cycle})`,
            webhookUrl: this.defaultFlowWebhookUrl(),
        })
    }

    /**
     * En Flow el rewrite de `external_reference` es NO-OP: EVA es la fuente de verdad del tier
     * (vive en `coaches`, no en un ref del provider) → esto ELIMINA la clase de bug MP stale-ref
     * (el siguiente evento no re-deriva un tier viejo). Solo aplica el ajuste de monto como
     * updateCheckoutAmount; el `externalReference` se ignora a proposito.
     */
    async updateCheckoutAmountAndRef(
        checkoutId: string,
        amountClp: number,
        _externalReference: string,
        idempotencyKey?: string
    ): Promise<void> {
        await this.updateCheckoutAmount(checkoutId, amountClp, idempotencyKey)
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
