import { TIER_CONFIG, BILLING_CYCLE_CONFIG } from '@/lib/constants'
import type { DiscountSpec } from '@/lib/constants'

/**
 * services/billing/mrr.service — MRR neto por coach para el panel CEO (F0 auditoria 2026-08-05).
 *
 * Espejo EXACTO de `public.admin_coach_net_monthly_clp` (migracion
 * `fix_platform_mrr_net_flow_coupons`): si cambias la formula aca, cambia el SQL, y viceversa.
 * Regla de redondeo = la del motor de cobro (evidencia en `billing_snapshots`):
 * descuento = round(precio * pct/100); neto = precio - descuento.
 */

export { PAID_COACH_OR_FILTER } from '@/lib/constants'

type CycleKey = keyof typeof BILLING_CYCLE_CONFIG

function cycleConfig(billingCycle: string | null | undefined) {
    const key = (billingCycle ?? 'monthly') as CycleKey
    return BILLING_CYCLE_CONFIG[key] ?? BILLING_CYCLE_CONFIG.monthly
}

/** Precio de LISTA mensualizado (incluye descuento de ciclo -10%/-20%, sin cupon). */
export function listMonthlyEquivalentClp(tier: string | null, billingCycle: string | null | undefined): number {
    const monthly = TIER_CONFIG[(tier ?? '') as keyof typeof TIER_CONFIG]?.monthlyPriceClp ?? 0
    const { months, discountPercent } = cycleConfig(billingCycle)
    const cyclePrice = Math.round(monthly * months * (1 - discountPercent / 100))
    return Math.round(cyclePrice / months)
}

/**
 * Neto MENSUALIZADO del coach: precio de ciclo menos su cupon vivo, dividido por los meses
 * del ciclo. `spec` viene de `discountSpecFromSnapshot` (null = sin cupon vivo o expirado).
 * Cupones con target 'module' NO descuentan la base (aplican solo a add-ons).
 */
export function netMonthlyClpForCoach(
    tier: string | null,
    billingCycle: string | null | undefined,
    spec: DiscountSpec | null
): number {
    const monthly = TIER_CONFIG[(tier ?? '') as keyof typeof TIER_CONFIG]?.monthlyPriceClp ?? 0
    const { months, discountPercent } = cycleConfig(billingCycle)
    const cyclePrice = Math.round(monthly * months * (1 - discountPercent / 100))

    let netCycle = cyclePrice
    if (spec && spec.target !== 'module') {
        if (spec.type === 'percent') {
            netCycle = cyclePrice - Math.round((cyclePrice * spec.value) / 100)
        } else if (spec.type === 'fixed_clp') {
            netCycle = Math.max(cyclePrice - Math.round(spec.value), 0)
        }
    }
    return Math.round(netCycle / months)
}
