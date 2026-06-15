import { cache } from 'react'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { TIER_CONFIG } from '@/lib/constants'
import { isAddonBillable } from '@/services/billing/addons.service'
import { MODULE_KEYS, type ModuleKey } from '@/services/entitlements.service'
import { getTestCoachIds } from '@/lib/test-accounts'
import { MODULE_LABELS } from '../../_components/module-labels'

export interface FinanzasData {
    mrrEstimate: number
    arrEstimate: number
    paidCoachCount: number
    arpc: number
    mrrSeries: { ym: string; mrr_clp: number; coach_count: number }[]
    churnSeries: { ym: string; churned_count: number }[]
    revenueByCycle: { billing_cycle: string; mrr_clp: number; coach_count: number }[]
    revenueByTier: { tier: string; mrr_clp: number; coach_count: number }[]
    /** Conteo de cuentas legacy (growth/scale) por status/ciclo — dashboard de extinción del grandfather (D4/mejora #5). */
    legacyTierCounts: { subscription_tier: string; subscription_status: string; billing_cycle: string | null; total: number }[]
    recentEvents: {
        id: string
        coach_id: string | null
        coach_name: string | null
        provider: string | null
        provider_event_id: string | null
        provider_status: string | null
        payload: Record<string, unknown> | null
        created_at: string
    }[]
}

// Precio mensual derivado de TIER_CONFIG (fuente única) — antes era una tercera copia hardcodeada que divergió (plan 04 F4.2).
const TIER_PRICES: Record<string, number> = Object.fromEntries(
    (Object.keys(TIER_CONFIG) as Array<keyof typeof TIER_CONFIG>).map(t => [t, TIER_CONFIG[t].monthlyPriceClp])
)

// Nota de arquitectura: se usa `React.cache` (no `unstable_cache`) por la regla del repo
// (unstable_cache es incompatible con el contexto de cookies de Supabase SSR). Acá NO hay riesgo
// adicional porque la query corre con `createServiceRoleClient()` SIN cookies — es el patrón correcto.
export const getFinanzasData = cache(
    async (): Promise<FinanzasData> => {
        const admin = createServiceRoleClient()

        const [
            paidCoachesRes,
            mrrSeriesRes,
            churnSeriesRes,
            revByCycleRes,
            revByTierRes,
            legacyTierCountsRes,
            eventsRes,
            testIds,
        ] = await Promise.all([
            admin.from('coaches')
                .select('id, full_name, brand_name, subscription_tier')
                .eq('subscription_status', 'active')
                .not('subscription_mp_id', 'is', null)
                .not('payment_provider', 'in', ['beta', 'internal']),
            (admin.rpc as any)('get_platform_mrr_12_months'),
            (admin.rpc as any)('get_platform_churn_monthly'),
            (admin.rpc as any)('get_platform_revenue_by_cycle'),
            (admin.rpc as any)('get_platform_revenue_by_tier'),
            // RPC de la migración F4.1 (consolidación tiers): conteo legacy growth/scale por status/ciclo.
            (admin.rpc as any)('get_legacy_tier_counts'),
            admin.from('subscription_events')
                .select('id, coach_id, provider, provider_event_id, provider_status, payload, created_at')
                .order('created_at', { ascending: false })
                .limit(50),
            // Cuentas de prueba a excluir de las métricas agregadas en TS (los RPCs de MRR
            // se filtran en SQL con el mismo predicado — ver migración exclude_test_coaches).
            getTestCoachIds(admin),
        ])

        // Excluir cuentas de prueba del cálculo TS de MRR/ARPC (los RPCs ya las excluyen en SQL).
        const paidCoaches = (paidCoachesRes.data ?? []).filter((c) => !testIds.has(c.id))
        const mrrEstimate = paidCoaches.reduce((sum, c) => sum + (TIER_PRICES[c.subscription_tier ?? ''] ?? 0), 0)
        const paidCoachCount = paidCoaches.length
        const arpc = paidCoachCount > 0 ? Math.round(mrrEstimate / paidCoachCount) : 0

        // Enrich events with coach names
        const coachIds = [...new Set((eventsRes.data ?? []).map(e => e.coach_id).filter(Boolean))]
        let coachMap: Record<string, string> = {}
        if (coachIds.length > 0) {
            const { data: coaches } = await admin.from('coaches')
                .select('id, full_name, brand_name')
                .in('id', coachIds as string[])
            for (const c of coaches ?? []) {
                coachMap[c.id] = c.brand_name || c.full_name || c.id
            }
        }

        const recentEvents = (eventsRes.data ?? []).map(e => ({
            id: e.id,
            coach_id: e.coach_id,
            coach_name: e.coach_id ? (coachMap[e.coach_id] ?? null) : null,
            provider: e.provider,
            provider_event_id: e.provider_event_id,
            provider_status: e.provider_status,
            payload: e.payload as Record<string, unknown> | null,
            created_at: e.created_at,
        }))

        return {
            mrrEstimate,
            arrEstimate: mrrEstimate * 12,
            paidCoachCount,
            arpc,
            mrrSeries: (mrrSeriesRes.data ?? []) as unknown as { ym: string; mrr_clp: number; coach_count: number }[],
            churnSeries: (churnSeriesRes.data ?? []) as unknown as { ym: string; churned_count: number }[],
            revenueByCycle: (revByCycleRes.data ?? []) as unknown as { billing_cycle: string; mrr_clp: number; coach_count: number }[],
            revenueByTier: (revByTierRes.data ?? []) as unknown as { tier: string; mrr_clp: number; coach_count: number }[],
            legacyTierCounts: (legacyTierCountsRes.data ?? []) as unknown as { subscription_tier: string; subscription_status: string; billing_cycle: string | null; total: number }[],
            recentEvents,
        }
    }
)

// ── Métricas de adopción de add-ons (plan 05 / F6.3) ──────────────────────────────

export interface AddonAdoptionRow {
    moduleKey: ModuleKey
    label: string
    /** Coaches con un add-on PAGO (self_service) facturable vivo de este módulo. */
    payingCoaches: number
    /** Cortesías del CEO vivas (admin_grant) de este módulo — NO facturan, se reportan aparte. */
    grantedCoaches: number
}

export interface AddonChurnRow {
    /** Mes YYYY-MM de la baja (cancelled_at de filas self_service). */
    ym: string
    cancelled: number
}

export interface AddonMetrics {
    /** MRR mensualizado de add-ons = Σ del precio MENSUAL congelado de las filas pagas facturables. */
    addonMrrClp: number
    /** Add-ons pagos facturables vivos (filas, no coaches). */
    billableAddonCount: number
    /** Coaches con al menos un add-on pago facturable vivo. */
    coachesWithAddons: number
    adoptionByModule: AddonAdoptionRow[]
    churnSeries: AddonChurnRow[]
}

/**
 * Métricas de add-ons para el panel /admin (service-role, junto a finanzas). El monto compuesto
 * y la facturabilidad se derivan con las MISMAS funciones del motor (`isAddonBillable`), nunca se
 * re-implementan acá. MRR mensualizado = Σ del precio mensual congelado (`price_clp`) de las filas
 * pagas facturables — la mensualización del descuento por ciclo se cancela al volver al mensual.
 * Las cortesías (`admin_grant`, price 0) se reportan aparte (NO entran al MRR).
 */
export const getAddonMetrics = cache(async (): Promise<AddonMetrics> => {
    const admin = createServiceRoleClient()

    // Filas vivas (active|cancel_pending) — facturabilidad se filtra en TS con isAddonBillable.
    // testIds: cuentas de prueba a excluir del MRR/adopción/churn de add-ons (mismo predicado
    // que finanzas y los RPCs de MRR).
    const [liveRes, churnRes, testIds] = await Promise.all([
        admin
            .from('coach_addons')
            .select('coach_id, module_key, status, source, price_clp, first_charged_at')
            .in('status', ['active', 'cancel_pending']),
        admin
            .from('coach_addons')
            .select('coach_id, cancelled_at')
            .eq('source', 'self_service')
            .eq('status', 'cancelled')
            .not('cancelled_at', 'is', null)
            .order('cancelled_at', { ascending: false })
            .limit(2000),
        getTestCoachIds(admin),
    ])

    const liveRows = (liveRes.data ?? []) as Array<{
        coach_id: string
        module_key: string
        status: string
        source: string
        price_clp: number
        first_charged_at: string | null
    }>

    let addonMrrClp = 0
    let billableAddonCount = 0
    const coachesWithAddons = new Set<string>()
    const payingByModule: Record<string, Set<string>> = {}
    const grantedByModule: Record<string, Set<string>> = {}
    for (const key of MODULE_KEYS) {
        payingByModule[key] = new Set()
        grantedByModule[key] = new Set()
    }

    for (const row of liveRows) {
        if (testIds.has(row.coach_id)) continue // cuenta de prueba — no contamina MRR/adopción
        if (!(row.module_key in payingByModule)) continue // módulo desconocido — defensivo
        if (row.source === 'admin_grant') {
            grantedByModule[row.module_key].add(row.coach_id)
            continue
        }
        // self_service: solo cuenta al MRR/adopción si es facturable (regla 3/4).
        const billable = isAddonBillable({
            status: row.status as 'active' | 'cancel_pending' | 'cancelled',
            firstChargedAt: row.first_charged_at,
        })
        if (!billable) continue
        addonMrrClp += row.price_clp
        billableAddonCount += 1
        coachesWithAddons.add(row.coach_id)
        payingByModule[row.module_key].add(row.coach_id)
    }

    const adoptionByModule: AddonAdoptionRow[] = MODULE_KEYS.map((key) => ({
        moduleKey: key,
        label: MODULE_LABELS[key],
        payingCoaches: payingByModule[key].size,
        grantedCoaches: grantedByModule[key].size,
    }))

    // Churn por mes (bajas self_service: cancelled_at agrupado YYYY-MM).
    const churnMap = new Map<string, number>()
    for (const row of (churnRes.data ?? []) as Array<{ coach_id: string; cancelled_at: string | null }>) {
        if (testIds.has(row.coach_id)) continue // cuenta de prueba — no contamina churn
        if (!row.cancelled_at) continue
        const ym = row.cancelled_at.slice(0, 7)
        churnMap.set(ym, (churnMap.get(ym) ?? 0) + 1)
    }
    const churnSeries: AddonChurnRow[] = [...churnMap.entries()]
        .map(([ym, cancelled]) => ({ ym, cancelled }))
        .sort((a, b) => a.ym.localeCompare(b.ym))
        .slice(-12)

    return {
        addonMrrClp,
        billableAddonCount,
        coachesWithAddons: coachesWithAddons.size,
        adoptionByModule,
        churnSeries,
    }
})

// ── Detalle de add-ons por coach (monitoreo del lanzamiento) ──────────────────────
// Vista read-only para el CEO: quién tiene cada add-on, con qué origen (pago vs cortesía),
// estado y si hay evidencia de cobro. Detecta anomalías ("alguien se salta el pago" o tiene
// un problema): self_service cobrado SIN billing_snapshot, o activo sin primer cobro. Marca
// las cuentas de prueba (no son clientes reales). NO excluye cuentas de prueba — el CEO quiere
// ver TODO acá (a diferencia del MRR, que sí las excluye).

export interface CoachAddonDetailRow {
    coachId: string
    coachLabel: string
    moduleKey: string
    moduleLabel: string
    source: string
    status: string
    priceClp: number
    firstChargedAt: string | null
    expiresAt: string | null
    isTest: boolean
    /** Anomalía a revisar (null = sin alertas). */
    flag: string | null
}

export const getCoachAddonsDetail = cache(async (): Promise<CoachAddonDetailRow[]> => {
    const admin = createServiceRoleClient()
    const [rowsRes, snapRes, testIds] = await Promise.all([
        admin
            .from('coach_addons')
            .select('coach_id, module_key, source, status, price_clp, first_charged_at, expires_at, created_at')
            .in('status', ['active', 'cancel_pending'])
            .order('created_at', { ascending: false })
            .limit(500),
        admin.from('billing_snapshots').select('coach_id'),
        getTestCoachIds(admin),
    ])

    const rows = (rowsRes.data ?? []) as Array<{
        coach_id: string
        module_key: string
        source: string
        status: string
        price_clp: number
        first_charged_at: string | null
        expires_at: string | null
    }>
    if (rows.length === 0) return []

    const coachesWithSnapshot = new Set(
        ((snapRes.data ?? []) as Array<{ coach_id: string }>).map((r) => r.coach_id)
    )

    // Etiqueta del coach en un solo fetch por los ids presentes (brand_name || full_name || slug).
    const coachIds = [...new Set(rows.map((r) => r.coach_id))]
    const { data: coachRows } = await admin
        .from('coaches')
        .select('id, full_name, brand_name, slug')
        .in('id', coachIds)
    const coachById = new Map(
        ((coachRows ?? []) as Array<{
            id: string
            full_name: string | null
            brand_name: string | null
            slug: string | null
        }>).map((c) => [c.id, c])
    )

    return rows.map((r) => {
        const c = coachById.get(r.coach_id)
        const coachLabel = c?.brand_name || c?.full_name || c?.slug || r.coach_id
        let flag: string | null = null
        if (r.source === 'self_service' && r.first_charged_at && !coachesWithSnapshot.has(r.coach_id)) {
            flag = 'Pago sin evidencia (sin billing_snapshot)'
        } else if (r.source === 'self_service' && r.status === 'active' && !r.first_charged_at) {
            flag = 'Activo sin primer cobro'
        }
        return {
            coachId: r.coach_id,
            coachLabel,
            moduleKey: r.module_key,
            moduleLabel: (MODULE_LABELS as Record<string, string>)[r.module_key] ?? r.module_key,
            source: r.source,
            status: r.status,
            priceClp: r.price_clp,
            firstChargedAt: r.first_charged_at,
            expiresAt: r.expires_at,
            isTest: testIds.has(r.coach_id),
            flag,
        }
    })
})
