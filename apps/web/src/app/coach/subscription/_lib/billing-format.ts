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
