import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
    BILLING_CYCLE_CONFIG,
    getTierPriceClp,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'
import type { ModuleKey } from '@/services/entitlements.service'
import type { ActivateAddonContext, CancelAddonContext } from '@/services/billing/addons.service'
import {
    getAddonCycleAmountClp,
    getCompositeAmountClp,
    toBillableAddons,
} from '@/services/billing/addons.service'
import { listLive } from '@/infrastructure/db/coach-addons.repository'
import { ADDON_CONFIG, getAddonPaymentRulesForCycle } from '@/lib/constants'
import type {
    AcceptedRule,
    ReceiptAddonLine,
} from '@/lib/email/addon-receipt-templates'

type DB = SupabaseClient<Database>

/** Fila mínima del coach que necesitan los endpoints de add-ons (billing). */
export type CoachBillingRow = {
    id: string
    subscription_tier: string
    subscription_status: string
    billing_cycle: string | null
    current_period_end: string | null
    subscription_mp_id: string | null
}

/**
 * Lee la fila de billing del coach (service-role: las columnas de cobro están en manos de
 * service-role tras el hardening del plan 03/04). El id viene SIEMPRE de la sesión.
 */
export async function fetchCoachBillingRow(
    admin: DB,
    coachId: string
): Promise<CoachBillingRow | null> {
    const { data, error } = await admin
        .from('coaches')
        .select(
            'id, subscription_tier, subscription_status, billing_cycle, current_period_end, subscription_mp_id'
        )
        .eq('id', coachId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    return (data as CoachBillingRow | null) ?? null
}

/** Normaliza el ciclo del coach (default mensual si la columna viene vacía/inválida). */
export function normalizeCycle(raw: string | null): BillingCycle {
    if (raw === 'monthly' || raw === 'quarterly' || raw === 'annual') return raw
    return 'monthly'
}

/** Construye el contexto de alta del service (incl. el corte para el prorrateo trim/anual). */
export function buildActivateContext(
    row: CoachBillingRow,
    coachEmail: string
): ActivateAddonContext {
    return {
        coachId: row.id,
        coachEmail,
        tier: row.subscription_tier as SubscriptionTier,
        cycle: normalizeCycle(row.billing_cycle),
        subscriptionMpId: row.subscription_mp_id ?? '',
        currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end) : new Date(),
    }
}

/** Construye el contexto de baja del service. */
export function buildCancelContext(row: CoachBillingRow): CancelAddonContext {
    return {
        coachId: row.id,
        tier: row.subscription_tier as SubscriptionTier,
        cycle: normalizeCycle(row.billing_cycle),
        subscriptionMpId: row.subscription_mp_id ?? '',
        currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end) : new Date(),
    }
}

/**
 * Desglose del próximo cobro compuesto leído de la DB (filas vivas facturables del coach).
 * EL ÚNICO origen de montos para la respuesta del endpoint y el recibo — la UI nunca calcula.
 */
export type CompositeBreakdown = {
    baseClp: number
    addonLines: ReceiptAddonLine[]
    addonsClp: number
    totalClp: number
}

export async function computeCompositeBreakdown(
    db: DB,
    coachId: string,
    tier: SubscriptionTier,
    cycle: BillingCycle
): Promise<CompositeBreakdown> {
    const live = await listLive(db, coachId)
    const billable = toBillableAddons(live)
    const baseClp = getTierPriceClp(tier, cycle)
    const addonLines: ReceiptAddonLine[] = billable.map((a) => ({
        label: ADDON_CONFIG[a.moduleKey].label,
        cycleAmountClp: getAddonCycleAmountClp(a.priceClpMensual, cycle),
    }))
    const addonsClp = addonLines.reduce((sum, l) => sum + l.cycleAmountClp, 0)
    const totalClp = getCompositeAmountClp(tier, cycle, billable)
    return { baseClp, addonLines, addonsClp, totalClp }
}

/** Texto de las 5 reglas aceptadas, en la variante del ciclo (para el recibo de alta). */
export function acceptedRulesForCycle(cycle: BillingCycle): AcceptedRule[] {
    return getAddonPaymentRulesForCycle(cycle).rules
}

/** Etiqueta del ciclo (es-CL) para el recibo. */
export function cycleLabel(cycle: BillingCycle): string {
    return BILLING_CYCLE_CONFIG[cycle].label
}

/** Etiqueta del módulo (catálogo) para el recibo. */
export function addonLabel(key: ModuleKey): string {
    return ADDON_CONFIG[key].label
}

/** Formatea una fecha ISO a es-CL (o null si no hay fecha). */
export function formatDateEsCl(iso: string | null): string | null {
    if (!iso) return null
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
}
