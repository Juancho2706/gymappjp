// Helpers de formato/parseo de billing para la página de suscripción del coach.
// PURE + sync, sin estado ni 'use client': la UI NUNCA calcula precios (el server es la
// fuente de verdad del cobro); esto es solo display/parseo de payloads ya emitidos.
// Extraído verbatim de page.tsx (Fase 2 — split de god-file, behavior-preserving).

// Etiqueta legible de la marca a partir del payment_method_id de MercadoPago (P1-8): 'debvisa' es un id
// de máquina, no una marca. Fallback: el id capitalizado.
const MP_BRAND_LABEL: Record<string, string> = {
    visa: 'Visa', debvisa: 'Visa débito',
    master: 'Mastercard', debmaster: 'Mastercard débito',
    amex: 'American Express', diners: 'Diners',
    maestro: 'Maestro', magna: 'Magna', naranja: 'Naranja', cabal: 'Cabal',
}

export function mpBrandLabel(pmid: string | null | undefined): string {
    if (!pmid) return ''
    return MP_BRAND_LABEL[pmid.toLowerCase()] ?? pmid.charAt(0).toUpperCase() + pmid.slice(1)
}

export function extractAmountClpFromEventPayload(payload: unknown): number | null {
    if (!payload || typeof payload !== 'object') return null
    const root = payload as Record<string, unknown>
    const candidates = [
        root.transaction_amount,
        (root.auto_recurring as Record<string, unknown> | undefined)?.transaction_amount,
        (root.data as Record<string, unknown> | undefined)?.transaction_amount,
    ]
    for (const c of candidates) {
        const n = typeof c === 'number' ? c : typeof c === 'string' ? Number.parseFloat(c) : Number.NaN
        if (!Number.isNaN(n) && n > 0) return Math.round(n)
    }
    return null
}

// ── Historial de pagos en lenguaje del coach (QA escritorio 24-09) ──────────────────────────────
// `subscription_events.provider_status` mezcla estados reales de los gateways (approved, rejected…)
// con marcas internas (`flow_checkout_intent`, `superseded_by_mp`…). La pantalla los pintaba crudos
// y siempre con un check verde: abrir Webpay y volver sin pagar se veía como
// «24 sept · flow_checkout_intent», igual que un pago aprobado.

export type SubscriptionEventTone = 'success' | 'danger' | 'neutral'

export type SubscriptionEventView = {
    /** Qué pasó, en palabras del coach. Jamás el estado crudo del gateway. */
    label: string
    tone: SubscriptionEventTone
    /** Medio que informó el movimiento; null cuando no aplica (activar el plan Free no pasa por un gateway). */
    source: string | null
}

const PROVIDER_LABEL: Record<string, string> = {
    mercadopago: 'Mercado Pago',
    flow: 'Webpay (Flow)',
}

const STATUS_VIEW: Record<string, Omit<SubscriptionEventView, 'source'>> = {
    approved: { label: 'Pago aprobado', tone: 'success' },
    authorized: { label: 'Suscripción activada', tone: 'success' },
    card_changed: { label: 'Tarjeta actualizada', tone: 'success' },
    pending: { label: 'Pago pendiente', tone: 'neutral' },
    in_process: { label: 'Pago en revisión', tone: 'neutral' },
    scheduled: { label: 'Cobro programado', tone: 'neutral' },
    paused: { label: 'Suscripción pausada', tone: 'neutral' },
    cancelled: { label: 'Suscripción cancelada', tone: 'neutral' },
    canceled: { label: 'Suscripción cancelada', tone: 'neutral' },
    refunded: { label: 'Pago devuelto', tone: 'neutral' },
    rejected: { label: 'Pago rechazado', tone: 'danger' },
    charged_back: { label: 'Contracargo', tone: 'danger' },
}

// Marcas de plomería que ningún coach necesita ver: el intento de checkout (se escribe ANTES de
// que el coach pague o no), los relevos entre gateways y los candados/verificaciones internas.
const INTERNAL_STATUSES = new Set([
    'orphan_persist_failed',
    'tier_upgrade_pending',
    'card_change_pending',
    'card_change_cycle_drift',
    'card_change_unverified',
])

export function isInternalSubscriptionEvent(status: string | null | undefined): boolean {
    if (!status) return false
    return status.endsWith('_checkout_intent') || status.startsWith('superseded_') || INTERNAL_STATUSES.has(status)
}

export function providerLabel(provider: string | null | undefined): string | null {
    if (!provider) return null
    return PROVIDER_LABEL[provider.toLowerCase()] ?? provider.charAt(0).toUpperCase() + provider.slice(1)
}

export function describeSubscriptionEvent(event: {
    provider_status: string | null
    provider: string | null
}): SubscriptionEventView {
    const status = event.provider_status?.toLowerCase() ?? ''
    // `activate-free` escribe 'active' con el gateway por defecto (mercadopago), pero no hubo cobro.
    if (status === 'active') return { label: 'Plan Free activado', tone: 'neutral', source: null }
    const view = STATUS_VIEW[status] ?? { label: 'Movimiento de suscripción', tone: 'neutral' as const }
    return { ...view, source: providerLabel(event.provider) }
}
