import type { WebhookProcessResult } from '@/lib/payments/types'
import { parseOneShotAddonReference, parseTierUpgradeReference } from '@/lib/payments/providers/mercadopago'

/**
 * flow-normalize — funciones PURAS (sin red, sin DB, sin reloj) que traducen cada forma de respuesta
 * de Flow.cl al `WebhookProcessResult` normalizado que `runWebhookPipeline` (agnostico del gateway) ya
 * sabe procesar. Es MONEY CODE: acá se decide "¿a este coach le cobraron y por cuanto?". Shapes/enums
 * confirmados contra el OpenAPI oficial de Flow (developers.flow.cl/es-openApiFlow.yaml).
 *
 * ⚠️ ENUMS NO HOMOGENEOS entre entidades Flow (nunca reusar un mapa entre ellas):
 *   - payment/getStatus.status : 1 pendiente · 2 PAGADA · 3 rechazada · 4 anulada
 *   - invoice/get.status       : 0 impago   · 1 PAGADO · 2 anulado
 *   - subscription/get.status  : 0 inactivo · 1 activa · 2 trial · 4 cancelada  (NO existe 3)
 *   - refund status (string)   : created · accepted · rejected · refunded · canceled
 *
 * `providerStatus` se emite con el vocabulario que entiende `mapProviderStatus` (subscription-state.ts):
 *   'approved'|'authorized'→active · 'pending'→pending_payment · 'rejected'|'refunded'|'charged_back'→expired
 *   · 'cancelled'→canceled · 'trialing'→trialing.
 *
 * Resolucion de coachId (money-safety): en one-shots viene del `commerceOrder` que NOSOTROS
 * controlamos (== nuestro externalReference) → puro. En recurrentes/lifecycle/refund Flow NO trae
 * nuestro ref → el coachId lo resuelve `FlowProvider.processWebhook` por
 * `subscriptionId → coaches.subscription_provider_external_id` (DB) y lo pasa como argumento.
 */

/**
 * Parsea el `commerceOrder` GENERADO POR FLOW de un cobro recurrente. Formato observado en la captura
 * real de sandbox: `sus_<subscriptionId>_<invoiceId>_<fecha>` (ej. `sus_f7254c813f_1167928_2026-07-05 19:55`).
 * A diferencia de los one-shots, este ref NO lo controlamos nosotros → de aca sacamos el subscriptionId
 * (para resolver coachId por DB) y el invoiceId (para re-consultar invoice/get). Null si no matchea.
 * PIN sandbox (Ola 6): confirmar que el urlCallback del cobro recurrente entrega un token que resuelve a
 * ESTE commerceOrder via payment/getStatus (el payload del urlCallback de plan no se valido en vivo aun).
 */
export function parseFlowRecurringCommerceOrder(commerceOrder?: string | null): { subscriptionId: string; invoiceId: string } | null {
    if (!commerceOrder) return null
    const m = commerceOrder.match(/^(sus_[0-9a-z]+)_(\d+)_/i)
    if (!m) return null
    return { subscriptionId: m[1], invoiceId: m[2] }
}

/** payment/getStatus (y `invoice.payment`) — subset money-relevante. */
export type FlowPaymentStatus = {
    flowOrder?: number | string | null
    commerceOrder?: string | null
    // Flow serializa numericos como STRING a veces (confirmado: amount "1000"); los mappers coercionan.
    status?: number | string | null
    amount?: number | string | null
    payer?: string | null
    /** Datos del pago EFECTIVO (solo presentes si status=2). `date` = fecha real de pago. */
    paymentData?: { date?: string | null; amount?: number | null; media?: string | null } | null
}

/** invoice/get — subset money-relevante (cobro recurrente de una suscripcion). */
export type FlowInvoice = {
    id?: number | string | null
    subscriptionId?: string | null
    customerId?: string | null
    amount?: number | null
    period_start?: string | null
    period_end?: string | null
    due_date?: string | null
    status?: number | string | null
    /** PaymentStatus del cobro de esta invoice (presente si se cobro). */
    payment?: FlowPaymentStatus | null
}

/** subscription/get — subset lifecycle. */
export type FlowSubscription = {
    subscriptionId?: string | null
    planId?: string | null
    customerId?: string | null
    status?: number | string | null
    morose?: number | string | null
    period_start?: string | null
    period_end?: string | null
    next_invoice_date?: string | null
}

/** refund/getStatus — RefundStatus. */
export type FlowRefundStatus = {
    flowRefundOrder?: string | null
    status?: string | null
    amount?: number | null
    date?: string | null
}

/**
 * Normaliza una fecha de Flow (`yyyy-mm-dd hh:mm:ss` o `yyyy-mm-dd`) a un string ISO-parseable.
 * PIN sandbox: Flow reporta en hora de Chile; el offset exacto (TZ/DST) se confirma con un cobro
 * real. Para v1 se pasa el timestamp tal cual normalizado (dedup del snapshot es por payment id, no
 * por fecha; el desfase solo afecta el display de charged_at/current_period_end en el borde).
 */
export function parseFlowDate(value?: string | null): string | null {
    if (!value) return null
    const trimmed = value.trim()
    if (!trimmed) return null
    // `yyyy-mm-dd hh:mm:ss` → `yyyy-mm-ddThh:mm:ss` para que Date.parse sea consistente cross-runtime.
    return trimmed.includes(' ') ? trimmed.replace(' ', 'T') : trimmed
}

/**
 * payment/getStatus.status → vocabulario del pipeline. Coerciona con Number() ANTES de comparar: Flow
 * serializa numericos como STRING a veces (confirmado con amount "1000"); un `status "2"` con `=== 2`
 * estricto caeria a 'rejected' → un pago APROBADO se leeria como rechazado (add-on pagado sin entregar).
 */
export function mapFlowPaymentStatus(status?: number | string | null): 'approved' | 'rejected' | 'pending' {
    const s = status == null ? null : Number(status)
    if (s === 2) return 'approved' // pagada
    if (s === 1) return 'pending' // pendiente de pago
    return 'rejected' // 3 rechazada · 4 anulada · NaN/desconocido → no hubo cobro exitoso
}

/**
 * PAGO ONE-SHOT (add-on trim/anual o diferencia de tier-upgrade). El `commerceOrder` == nuestro
 * `externalReference` dedicado (`addon_oneshot|...` / `tier_upgrade|...`) → coachId + tipo PUROS.
 * Precedencia de parse: addon → tier-upgrade (misma que el webhook MP). Si no matchea ninguno, NO es
 * un one-shot que reconozcamos (probable cobro recurrente ruteado mal) → `accepted:false`.
 */
export function normalizeFlowOneShotPayment(payment: FlowPaymentStatus): WebhookProcessResult {
    const commerceOrder = payment.commerceOrder ?? null
    const oneShotAddon = parseOneShotAddonReference(commerceOrder)
    const tierUpgrade = oneShotAddon ? null : parseTierUpgradeReference(commerceOrder)
    const coachId = oneShotAddon?.coachId ?? tierUpgrade?.coachId ?? null
    if (!coachId) return { accepted: false }

    const providerStatus = mapFlowPaymentStatus(payment.status)
    return {
        accepted: true,
        eventKind: 'payment',
        providerStatus,
        coachId,
        externalReference: commerceOrder,
        providerPaymentId: payment.flowOrder != null ? String(payment.flowOrder) : null,
        paidAt: parseFlowDate(payment.paymentData?.date),
        oneShotAddon,
        tierUpgrade,
    }
}

/**
 * COBRO RECURRENTE (invoice de una suscripcion Flow). `coachId` resuelto upstream por processWebhook
 * (subscriptionId → coaches). invoice.status: 1 pagado → cobro exitoso; 0 impago → dunning; 2 anulado
 * → sin cobro. Se marca `isRecurringAuthorizedPayment` para que caiga en la rama recurrente autonoma
 * del pipeline (snapshot + first-charge de add-ons + avance de periodo / o past_due si rechazado).
 */
export function normalizeFlowRecurringInvoice(invoice: FlowInvoice, coachId: string): WebhookProcessResult {
    // Number(): Flow puede stringificar. Guardamos el string vacio/whitespace → null (ausente), porque
    // `Number('')` es 0 y confundiria un status faltante con impago (0) → dunning falso.
    const rawStatus = invoice.status
    const status =
        rawStatus == null || (typeof rawStatus === 'string' && rawStatus.trim() === '') ? null : Number(rawStatus)
    // ⚠️ money-safety (panel Ola 3): SOLO status 0 (impago) y 1 (pagado) son eventos de cobro ACCIONABLES.
    // Cualquier otra cosa — 2 (anulada), null, o un codigo no modelado (schema drift de Flow) — es un
    // NO-OP TERMINAL: `accepted:true` SIN coachId → el pipeline ackea 200 sin mutar al coach. Esto evita
    // DOS bugs: (1) devolver accepted:false daria HTTP 400 → Flow reintenta en loop una notificacion no
    // accionable (quema API firmada); (2) dejar caer un status desconocido a 'rejected' dispararia dunning
    // FALSO (past_due + email "pago fallido" = evidencia SERNAC incorrecta). Un fallo transitorio de la
    // consulta NO llega aca: flowGet tira ante !res.ok → 502 → Flow reintenta (no es un 200 malformado).
    if (status !== 0 && status !== 1) return { accepted: true }
    const paid = status === 1
    // Clave de idempotencia ESTABLE = el id de invoice (1 invoice = 1 cobro por periodo, SIEMPRE presente).
    // El flowOrder del payment es CONDICIONAL (solo si se cobro): keyear por el haria que el MISMO cobro
    // cambie de clave segun si `payment` vino poblado → doble billing_snapshot + doble decremento del ciclo
    // del cupon. El namespace `invoice:` no colisiona con el keyspace (flowOrder pelado) de los one-shots.
    const providerPaymentId =
        invoice.id != null
            ? `invoice:${String(invoice.id)}`
            : invoice.payment?.flowOrder != null
              ? String(invoice.payment.flowOrder)
              : null
    return {
        accepted: true,
        eventKind: 'payment',
        isRecurringAuthorizedPayment: true,
        providerStatus: paid ? 'approved' : 'rejected', // status 0 (impago) → dunning; 1 (pagado) → approved
        coachId,
        providerPaymentId,
        paidAt: paid ? parseFlowDate(invoice.payment?.paymentData?.date) : null,
        // period_end = fin del periodo pagado → avanza coaches.current_period_end (money-critical).
        currentPeriodEnd: paid ? parseFlowDate(invoice.period_end) : null,
    }
}

/** subscription/get.status → vocabulario del pipeline (lifecycle). Number() como mapFlowPaymentStatus. */
export function mapFlowSubscriptionStatus(status?: number | string | null): 'authorized' | 'trialing' | 'cancelled' | 'pending' {
    const s = status == null ? null : Number(status)
    if (s === 1) return 'authorized' // activa
    if (s === 2) return 'trialing' // en trial
    if (s === 4) return 'cancelled' // cancelada (NO existe 3)
    return 'pending' // 0 inactivo / desconocido
}

/**
 * LIFECYCLE de la suscripcion (creada/activa/cancelada). `coachId` resuelto upstream. Emite
 * `eventKind:'preapproval'` (el pipeline lo reconcilia). `providerAmountClp` = null: en Flow el monto
 * de la sub = plan + items + coupon, no viene en subscription/get de forma directa (el drift de monto
 * se valida contra invoices en el reconcile, no acá).
 */
export function normalizeFlowSubscriptionLifecycle(sub: FlowSubscription, coachId: string): WebhookProcessResult {
    return {
        accepted: true,
        eventKind: 'preapproval',
        providerStatus: mapFlowSubscriptionStatus(sub.status),
        coachId,
        providerCheckoutId: sub.subscriptionId ?? undefined,
        providerAmountClp: null,
        currentPeriodEnd: parseFlowDate(sub.period_end),
    }
}

/**
 * REFUND. Emite `providerStatus:'refunded'` SOLO cuando el reembolso quedo `refunded` (efectivo);
 * `accepted`/`created`/`rejected`/`canceled` no mueven plata todavia → `accepted:false` (no-op).
 * `coachId` resuelto upstream (RefundStatus NO trae commerceOrder → se mapea por el flowRefundOrder /
 * registro del refund que EVA inicio).
 *
 * ⚠️ MONEY-SAFETY (panel Ola 2, findings D1/architect) — este shape SOLO expira al coach por el camino
 * canonico del pipeline (mapProviderStatus('refunded')='expired'); ese camino NO llama
 * `cancelCheckoutAtProvider`, y la rama FIX-7 (que si cancela en el provider) es MP-shaped: matchea por
 * `coaches.subscription_mp_id`, columna que un coach Flow NO tiene → INALCANZABLE para Flow. Por lo
 * tanto, tras un refund la suscripcion sigue VIVA en Flow y RE-COBRA la tarjeta el proximo ciclo.
 * ⇒ Ola 3 (la ruta de webhook de Flow / processWebhook) DEBE, ante un refund/chargeback, llamar
 * EXPLICITAMENTE `provider.cancelCheckoutAtProvider(coach.subscription_provider_external_id)` (=Flow
 * subscription/cancel) + escribir la fila de auditoria, ANTES de dejar que el pipeline expire al coach.
 * NO asumir que el pipeline cancela la sub. Test de ese comportamiento = DoD de Ola 3.
 */
export function normalizeFlowRefund(refund: FlowRefundStatus, coachId: string): WebhookProcessResult {
    if (refund.status !== 'refunded') return { accepted: false }
    return {
        accepted: true,
        eventKind: 'payment',
        providerStatus: 'refunded',
        coachId,
        providerPaymentId: refund.flowRefundOrder ?? null,
    }
}
