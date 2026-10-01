import { cache } from 'react'
import { unstable_noStore as noStore } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { TIER_CONFIG } from '@/lib/constants'
import {
    countActiveAdminCoaches,
    countBetaAdminInvites,
    findActiveCouponRedemptionsByIds,
    findAdminAuditLogs,
    findAdminBasicCoaches,
    findAdminCoachBillingRows,
    findAdminCoachesFallback,
    findAdminClientsForDashboard,
    findExpiringSoonAdminCoaches,
    findPaidAdminCoachTiers,
    findPendingPaymentAdminCoaches,
    findRecentAdminCoachSignups,
} from '@/infrastructure/db'
import { discountSpecFromSnapshot } from '@/services/billing/discount.service'
import { isPayingCoach, netMonthlyClpForCoach } from '@/services/billing/mrr.service'
import { effectivePeriodEndIso, wholeDaysUntil } from '@/services/billing/period-end'
import type { PlatformOverview, CoachListItem, ClientListItem, LifecycleStage } from './types'

type CoachListItemSansMrr = Omit<CoachListItem, 'monthly_revenue'>

/**
 * Vencimiento REAL (Flow corregido a hora de Chile, ver `effectivePeriodEndIso`) y sus días. Los
 * días se recalculan acá desde ese instante —no se usa `days_until_expiry` de la RPC— para que el
 * número, la fecha impresa, el health y el «en riesgo» digan lo mismo.
 */
function expiryFields(
    currentPeriodEnd: string | null,
    trialEndsAt: string | null,
    paymentProvider: string | null,
    nowMs: number
): { expires_at: string | null; days_until_expiry: number | null } {
    const expiresAt =
        effectivePeriodEndIso(currentPeriodEnd, paymentProvider) ?? effectivePeriodEndIso(trialEndsAt, null)
    return {
        expires_at: expiresAt,
        days_until_expiry: expiresAt ? wholeDaysUntil(expiresAt, nowMs) : null,
    }
}

/**
 * MRR por fila = lo que de verdad paga al mes: MISMA fórmula que Finanzas y la ficha
 * (`netMonthlyClpForCoach` + cupón vivo) y solo si paga de verdad (`isPayingCoach`). Antes era el
 * precio de lista para cualquier tier pago ⇒ MDR (cupón 50 %) figuraba con $29.990 y demos o
 * cancelados sin suscripción sumaban MRR. Corre solo sobre la página ya cortada (≤ pageSize ids).
 */
async function withNetMrr(
    admin: ReturnType<typeof createServiceRoleClient>,
    items: CoachListItemSansMrr[]
): Promise<CoachListItem[]> {
    const candidateIds = items
        .filter((c) => c.subscription_status === 'active' && (c.payment_provider === 'mercadopago' || c.payment_provider === 'flow'))
        .map((c) => c.id)
    const billingRows = await findAdminCoachBillingRows(admin, candidateIds)
    const billingById = new Map(billingRows.map((b) => [b.id, b]))

    const redemptionIds = billingRows
        .map((b) => b.active_coupon_redemption_id)
        .filter((id): id is string => Boolean(id))
    const redemptions = await findActiveCouponRedemptionsByIds(admin, redemptionIds)
    const specByRedemptionId = new Map(
        redemptions.map((r) => [r.id, discountSpecFromSnapshot(r.discount_value_snapshot, r.applied_cycles_remaining)])
    )

    return items.map((c) => {
        const billing = billingById.get(c.id)
        const paying = billing
            ? isPayingCoach({
                subscription_status: c.subscription_status,
                payment_provider: c.payment_provider,
                subscription_mp_id: billing.subscription_mp_id,
                subscription_provider_external_id: billing.subscription_provider_external_id,
            })
            : false
        const spec = billing?.active_coupon_redemption_id
            ? specByRedemptionId.get(billing.active_coupon_redemption_id) ?? null
            : null
        return {
            ...c,
            monthly_revenue: paying ? netMonthlyClpForCoach(c.subscription_tier, c.billing_cycle, spec) : 0,
        }
    })
}

function computeLifecycleStage(status: string | null, daysLeft: number | null | undefined): LifecycleStage {
    if (status === 'pending_payment') return 'pending'
    if (status === 'trialing') return 'new_trial'
    if (status === 'expired') return 'expired'
    if (status === 'canceled') {
        if (daysLeft !== null && daysLeft !== undefined && daysLeft > 0) return 'expiring_soon'
        return 'churned'
    }
    if (status === 'active') {
        if (daysLeft !== null && daysLeft !== undefined && daysLeft <= 14) return 'active_atRisk'
        return 'active_healthy'
    }
    return 'active_healthy'
}

export const getPlatformOverview = cache(
    async (): Promise<PlatformOverview> => {
        const admin = createServiceRoleClient()

        const [
            coachesCountRes,
            clientsCountRes,
            activeCoachesRes,
            paidCoachesRes,
            recentSignupsRes,
            recentAuditRes,
            mrrSeriesRes,
            tierSeriesRes,
            workoutSessionsRes,
            churnRes,
            checkinsRes,
            betaInvitesRes,
            trialConversionRes,
            expiringSoonRes,
            pendingPaymentRes,
        ] = await Promise.all([
            admin.rpc('get_platform_coaches_count'),
            admin.rpc('get_platform_clients_count'),
            countActiveAdminCoaches(admin),
            findPaidAdminCoachTiers(admin),
            findRecentAdminCoachSignups(admin, 10),
            findAdminAuditLogs(admin, 10),
            (admin.rpc as any)('get_platform_mrr_12_months'),
            (admin.rpc as any)('get_platform_coaches_by_tier_monthly'),
            (admin.rpc as any)('get_platform_workout_sessions_30d'),
            (admin.rpc as any)('get_platform_churn_last_30d'),
            (admin.rpc as any)('get_platform_checkins_7d'),
            countBetaAdminInvites(admin),
            (admin.rpc as any)('get_platform_trial_conversion_rate'),
            // Antes iban en un segundo Promise.all sin depender de nada del primero —
            // un round-trip extra gratis por render (F2 08-05).
            findExpiringSoonAdminCoaches(
                admin,
                new Date(Date.now() + 7 * 86_400_000).toISOString(),
                new Date().toISOString(),
                10
            ),
            findPendingPaymentAdminCoaches(admin, 20),
        ])

        const totalCoaches = coachesCountRes.data ?? 0
        const totalClients = clientsCountRes.data ?? 0
        const activeCoaches = activeCoachesRes

        // Build paid coaches by tier for backward compat
        const coachesByTier: Record<string, number> = {}
        if (paidCoachesRes) {
            for (const row of paidCoachesRes) {
                const tier = row.subscription_tier ?? 'unknown'
                coachesByTier[tier] = (coachesByTier[tier] ?? 0) + 1
            }
        }

        // Current MRR from last entry in mrr series
        const mrrSeries = (mrrSeriesRes.data ?? []) as { ym: string; mrr_clp: number; coach_count: number }[]
        const latestMrr = mrrSeries[mrrSeries.length - 1]?.mrr_clp ?? 0
        const prevMrr = mrrSeries[mrrSeries.length - 2]?.mrr_clp ?? 0

        // Fallback: calculate from paid coaches if series is empty
        let mrrEstimate = latestMrr
        if (mrrEstimate === 0) {
            for (const [tier, count] of Object.entries(coachesByTier)) {
                const config = TIER_CONFIG[tier as keyof typeof TIER_CONFIG]
                if (config) mrrEstimate += count * config.monthlyPriceClp
            }
        }

        const mrrDeltaPct = prevMrr > 0
            ? parseFloat(((mrrEstimate - prevMrr) / prevMrr * 100).toFixed(1))
            : null

        // Deltas derivados de series que YA viajan (sin queries nuevas, F2 08-05):
        // sesiones = ultimos 7 dias vs los 7 anteriores de la serie de 30.
        const sessionsSeries = (workoutSessionsRes.data ?? []) as { day: string; sessions: number }[]
        const sessionsLast7d = sessionsSeries.slice(-7).reduce((s, d) => s + (d.sessions ?? 0), 0)
        const sessionsPrev7d = sessionsSeries.slice(-14, -7).reduce((s, d) => s + (d.sessions ?? 0), 0)
        const sessions7dDeltaPct = sessionsPrev7d > 0
            ? parseFloat(((sessionsLast7d - sessionsPrev7d) / sessionsPrev7d * 100).toFixed(1))
            : null

        // Coaches activos mes contra mes desde la serie por tier (suma de todos los tiers).
        const tierMonthly = (tierSeriesRes.data ?? []) as { ym: string; tier: string; coach_count: number }[]
        const coachesByMonth = new Map<string, number>()
        for (const r of tierMonthly) {
            coachesByMonth.set(r.ym, (coachesByMonth.get(r.ym) ?? 0) + Number(r.coach_count ?? 0))
        }
        const monthKeys = [...coachesByMonth.keys()].sort()
        const coachesThisMonth = coachesByMonth.get(monthKeys[monthKeys.length - 1] ?? '') ?? 0
        const coachesPrevMonth = coachesByMonth.get(monthKeys[monthKeys.length - 2] ?? '') ?? 0
        const activeCoachesDeltaMoM = monthKeys.length >= 2 ? coachesThisMonth - coachesPrevMonth : null

        // Filas de churn: el RPC devuelve quien/tier/cuando y antes se descartaba todo
        // haciendo .length — la informacion mas accionable del panel (F2 08-05).
        const churnRows = ((churnRes.data ?? []) as any[]).map((r) => ({
            coach_id: String(r.coach_id ?? ''),
            coach_name: (r.coach_name ?? null) as string | null,
            tier: (r.tier ?? null) as string | null,
            churned_at: String(r.churned_at ?? ''),
        }))

        return {
            totalCoaches,
            totalClients,
            activeCoaches,
            coachesByTier,
            mrrEstimate,
            arrEstimate: mrrEstimate * 12,
            mrrDeltaPct,
            churnLast30d: churnRows.length,
            churnRecent: churnRows,
            checkinsLast7d: (checkinsRes.data as number) ?? 0,
            sessionsLast7d,
            sessions7dDeltaPct,
            activeCoachesDeltaMoM,
            recentCoachSignups: recentSignupsRes,
            recentAuditEvents: recentAuditRes as PlatformOverview['recentAuditEvents'],
            mrrSeries,
            tierMonthlySeries: (tierSeriesRes.data ?? []) as { ym: string; tier: string; coach_count: number }[],
            workoutSessionsSeries: workoutSessionsRes.data ?? [],
            betaInvitesCount: betaInvitesRes,
            expiringSoon: expiringSoonRes.map((c) => ({
                id: c.id,
                full_name: c.full_name,
                brand_name: c.brand_name,
                current_period_end: c.current_period_end,
                expires_at: effectivePeriodEndIso(c.current_period_end, c.payment_provider),
                subscription_status: c.subscription_status,
            })),
            pendingPaymentCoaches: pendingPaymentRes as PlatformOverview['pendingPaymentCoaches'],
            trialConversion: (() => {
                const row = (trialConversionRes.data as any[])?.[0]
                const converted = Number(row?.converted ?? 0)
                const total_trials = Number(row?.total_trials ?? 0)
                const pct = total_trials > 0 ? Math.round(converted / total_trials * 100) : null
                return { converted, total_trials, pct }
            })(),
        }
    }
)

export async function getAllCoachesPaginated(params: {
    search?: string
    status?: string
    tier?: string
    beta?: boolean
    provider?: string
    stage?: string
    atRisk?: boolean
    sort?: string
    dir?: string
    page?: number
    pageSize?: number
}): Promise<{ coaches: CoachListItem[]; total: number }> {
    noStore()
    const admin = createServiceRoleClient()
    const pageSize = params.pageSize ?? 50
    const page = params.page ?? 1
    const offset = (page - 1) * pageSize

    // stage/atRisk/provider no existen en el RPC: si estan activos se trae el universo
    // (cap 1000) y se filtra + pagina ACA. Antes se filtraba la pagina ya cortada y el
    // total quedaba corrupto ("solo en riesgo" mostraba solo los de la pagina 1, y el
    // filtro por proveedor directamente no filtraba) (ROTO-2/ROTO-5, F0 08-05).
    const needsClientFilter = Boolean(params.stage || params.atRisk || params.provider)

    const { data, error } = await (admin.rpc as any)('get_admin_coaches_paginated', {
        p_search: params.search || null,
        p_status: params.status || null,
        p_tier:   params.tier   || null,
        p_beta:   params.beta   ?? null,
        p_sort:   params.sort   || 'created_at',
        p_dir:    params.dir    || 'desc',
        p_limit:  needsClientFilter ? 1000 : pageSize,
        p_offset: needsClientFilter ? 0 : offset,
    })

    const nowMs = Date.now()

    if (error || !data) {
        // Fallback: direct coaches query if RPC is unavailable
        const fallback = await findAdminCoachesFallback(admin, pageSize)
        if (!fallback) return { coaches: [], total: 0 }
        const coaches: CoachListItemSansMrr[] = (fallback as any[]).map(r => ({
            id: r.id, full_name: r.full_name, brand_name: r.brand_name, slug: r.slug,
            subscription_tier: r.subscription_tier, subscription_status: r.subscription_status,
            billing_cycle: r.billing_cycle, payment_provider: r.payment_provider,
            max_clients: r.max_clients, current_period_end: r.current_period_end,
            trial_ends_at: r.trial_ends_at, created_at: r.created_at,
            client_count: 0, active_client_count: 0, demo_client_count: 0,
            ...expiryFields(r.current_period_end, r.trial_ends_at, r.payment_provider, nowMs),
            utilization_pct: 0, last_activity_at: null, coach_last_active_at: null,
            auth_email: null,
            lifecycle_stage: computeLifecycleStage(r.subscription_status, null),
        }))
        return { coaches: await withNetMrr(admin, coaches), total: coaches.length }
    }

    const rows = data as unknown as (Record<string, any> & { total_count: number })[]
    const total = rows[0]?.total_count ?? 0
    const coaches: CoachListItemSansMrr[] = rows.map((r) => {
        const expiry = expiryFields(r.current_period_end, r.trial_ends_at, r.payment_provider, nowMs)
        return {
            id: r.id,
            full_name: r.full_name,
            brand_name: r.brand_name,
            slug: r.slug,
            subscription_tier: r.subscription_tier,
            subscription_status: r.subscription_status,
            billing_cycle: r.billing_cycle,
            payment_provider: r.payment_provider,
            max_clients: r.max_clients,
            current_period_end: r.current_period_end,
            trial_ends_at: r.trial_ends_at,
            created_at: r.created_at,
            client_count: Number(r.client_count),
            active_client_count: Number(r.active_client_count),
            // `?? 0`: la columna es nueva en la RPC — si el entorno todavía corre una versión previa
            // el listado degrada a "sin demos" en vez de pintar NaN junto al cupo.
            demo_client_count: Number(r.demo_client_count ?? 0),
            ...expiry,
            utilization_pct: Number(r.utilization_pct),
            last_activity_at: r.last_activity_at,
            coach_last_active_at: r.coach_last_active_at ?? null,
            auth_email: r.auth_email ?? null,
            lifecycle_stage: computeLifecycleStage(r.subscription_status, expiry.days_until_expiry),
        }
    })

    const AT_RISK_STAGES = new Set(['active_atRisk', 'expiring_soon', 'pending'])
    let filtered = coaches
    if (params.provider) filtered = filtered.filter(c => c.payment_provider === params.provider)
    if (params.atRisk) {
        filtered = filtered.filter(c => AT_RISK_STAGES.has(c.lifecycle_stage))
    } else if (params.stage) {
        filtered = filtered.filter(c => c.lifecycle_stage === params.stage)
    }

    if (needsClientFilter) {
        return { coaches: await withNetMrr(admin, filtered.slice(offset, offset + pageSize)), total: filtered.length }
    }
    return { coaches: await withNetMrr(admin, coaches), total }
}

// Keep old getAllCoaches for backward compat (clients page still uses it)
export async function getAllCoaches(search?: string): Promise<CoachListItem[]> {
    const { coaches } = await getAllCoachesPaginated({ search, pageSize: 500 })
    return coaches
}

export async function getAllCoachesBasic(): Promise<{ id: string; full_name: string | null; brand_name: string | null; slug: string }[]> {
    noStore()
    const admin = createServiceRoleClient()
    return findAdminBasicCoaches(admin)
}

export type AdminClientsEstado = 'activo' | 'inactivo' | 'archivado'
export type AdminClientsOnboarding = 'completo' | 'pendiente'

/**
 * Los alumnos de prueba (`is_demo = true`) NO se listan ni entran en `total` (pedido del owner
 * 05-09): viajan aparte en `demoTotal` solo como dato informativo.
 * Los filtros de estado/onboarding viajan a PostgREST (no se filtra en cliente):
 * de otro modo solo recortarian los 50 de la pagina visible y `total`/paginacion
 * mentirian sobre el universo real (misma clase de bug que ROTO-4 con `q`).
 */
export async function getAllClients(
    search?: string,
    coachId?: string,
    page = 1,
    pageSize = 50,
    estado?: AdminClientsEstado,
    onboarding?: AdminClientsOnboarding
): Promise<{ clients: ClientListItem[]; total: number; demoTotal: number }> {
    noStore()
    const admin = createServiceRoleClient()
    const offset = (page - 1) * pageSize

    const { clients: data, total, demoTotal } = await findAdminClientsForDashboard(admin, {
        search,
        coachId,
        estado,
        onboarding,
        pageSize,
        offset,
    })

    const clients = data.map((c: any) => ({
        id: c.id,
        full_name: c.full_name,
        email: c.email,
        coach_id: c.coach_id,
        coach_name: c.coaches?.full_name ?? null,
        is_active: c.is_active,
        is_archived: c.is_archived ?? false,
        created_at: c.created_at,
        onboarding_completed: c.onboarding_completed,
    }))

    return { clients, total, demoTotal }
}
