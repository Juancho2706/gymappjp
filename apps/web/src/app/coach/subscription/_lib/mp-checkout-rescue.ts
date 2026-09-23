import {
    BILLING_CYCLE_CONFIG,
    isBillingCycleAllowedForTier,
    isSaleTier,
    type BillingCycle,
    type SaleTier,
} from '@/lib/constants'

/**
 * Rescate «volvió de Mercado Pago sin pagar» (caso Cristóbal / happy-training, 23-09).
 *
 * Los 6 coaches que pagan por Flow usan Redcompra o prepago, y 4 de ellos intentaron primero con
 * Mercado Pago y volvieron sin pagar. Al salir hacia MP desde el alta free dejamos una marca en
 * sessionStorage (sobrevive a la navegación externa y al «atrás» dentro de la misma pestaña);
 * si el coach vuelve a /coach/subscription todavía free, la pantalla le ofrece Webpay con el
 * mismo plan ya elegido.
 *
 * sessionStorage y no localStorage: la marca es de ESTA pestaña y de ESTE intento. Otra pestaña u
 * otro día no tienen por qué heredar «¿no pudiste terminar?».
 */

export const MP_RESCUE_STORAGE_KEY = 'eva:mp-checkout-pending'

/** Pasado este tiempo la marca ya no describe un intento reciente: se ignora. */
export const MP_RESCUE_TTL_MS = 2 * 60 * 60 * 1000

export type MpRescueMark = {
    tier: Exclude<SaleTier, 'free'>
    cycle: BillingCycle
    at: number
}

export function serializeMpRescueMark(tier: string, cycle: string, now: number): string {
    return JSON.stringify({ tier, cycle, at: now })
}

/**
 * Valida la marca cruda. Todo lo que no sea un intento reciente de un plan A LA VENTA con un ciclo
 * permitido para ese plan se descarta: la marca decide qué plan se pre-selecciona y viaja a
 * create-preference, así que un valor viejo o manipulado no puede colarse (el server re-valida
 * igual; esto evita pintar una tarjeta con un plan que el checkout rechazaría).
 */
export function parseMpRescueMark(raw: string | null, now: number): MpRescueMark | null {
    if (!raw) return null
    let data: unknown
    try {
        data = JSON.parse(raw)
    } catch {
        return null
    }
    if (!data || typeof data !== 'object') return null
    const { tier, cycle, at } = data as Record<string, unknown>
    if (typeof tier !== 'string' || typeof cycle !== 'string' || typeof at !== 'number') return null
    if (!Number.isFinite(at) || at > now || now - at > MP_RESCUE_TTL_MS) return null
    if (!isSaleTier(tier) || tier === 'free') return null
    if (!(cycle in BILLING_CYCLE_CONFIG)) return null
    if (!isBillingCycleAllowedForTier(tier, cycle as BillingCycle)) return null
    return { tier, cycle: cycle as BillingCycle, at }
}

// sessionStorage puede no existir (SSR) o lanzar (Safari privado, cookies bloqueadas): el rescate
// es una ayuda, jamás un motivo para romper el checkout.
function storage(): Storage | null {
    try {
        return typeof window === 'undefined' ? null : window.sessionStorage
    } catch {
        return null
    }
}

export function readMpRescueMark(now: number): MpRescueMark | null {
    try {
        return parseMpRescueMark(storage()?.getItem(MP_RESCUE_STORAGE_KEY) ?? null, now)
    } catch {
        return null
    }
}

export function writeMpRescueMark(tier: string, cycle: string, now: number): void {
    try {
        storage()?.setItem(MP_RESCUE_STORAGE_KEY, serializeMpRescueMark(tier, cycle, now))
    } catch {
        /* sin storage no hay rescate; el checkout sigue igual */
    }
}

export function clearMpRescueMark(): void {
    try {
        storage()?.removeItem(MP_RESCUE_STORAGE_KEY)
    } catch {
        /* idem */
    }
}
