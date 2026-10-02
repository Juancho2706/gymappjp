import { getSantiagoUtcBoundsForDay } from '@/lib/date-utils'

/**
 * services/billing/period-end — instante REAL en que termina lo pagado (= cuándo toca el próximo
 * cobro), para mostrarlo en el panel admin.
 *
 * - MercadoPago: `coaches.current_period_end` ya es un instante verdadero (`next_payment_date`).
 * - Flow: `period_end` llega como DÍA de pared de Chile sin zona (`2026-10-01 00:00:00`) y es el
 *   ÚLTIMO día INCLUIDO del período (doc API Flow: `next_invoice_date` = `period_end` + 1 día).
 *   `parseFlowDate` lo guarda tal cual y Postgres lo lee como UTC ⇒ el panel decía «vence 30/09
 *   21:00» a coaches que Flow cobra el 02/10 (Movens y MDR, 30-09). Acá ese día se traduce a las
 *   00:00 de Chile del día SIGUIENTE, que es cuando Flow emite el cobro.
 *
 * Solo lectura/display: el pipeline de cobro (paid-expiry, flow-reconcile) sigue usando la columna
 * cruda. Guardia: un coach Flow con hora distinta de 00:00:00Z no viene de Flow (p. ej. «Reactivar
 * +30 días» del admin) ⇒ se respeta tal cual.
 */
export function effectivePeriodEndIso(
    currentPeriodEnd: string | null | undefined,
    paymentProvider: string | null | undefined
): string | null {
    if (!currentPeriodEnd) return null
    const ms = Date.parse(currentPeriodEnd)
    if (Number.isNaN(ms)) return null
    const stored = new Date(ms)
    if (paymentProvider !== 'flow') return stored.toISOString()

    const isFlowWallDate =
        stored.getUTCHours() === 0 &&
        stored.getUTCMinutes() === 0 &&
        stored.getUTCSeconds() === 0 &&
        stored.getUTCMilliseconds() === 0
    if (!isFlowWallDate) return stored.toISOString()

    // Día siguiente al último incluido, en aritmética de calendario (sin zona de por medio).
    const nextDay = new Date(ms + 86_400_000).toISOString().slice(0, 10)
    return getSantiagoUtcBoundsForDay(nextDay).startIso
}

/**
 * Días enteros hasta `endIso`, truncados hacia cero: mismo número que daba la RPC
 * (`EXTRACT(day FROM end - now())`), así umbrales de riesgo/health no cambian de regla.
 */
export function wholeDaysUntil(endIso: string, nowMs: number): number {
    return Math.trunc((Date.parse(endIso) - nowMs) / 86_400_000)
}
