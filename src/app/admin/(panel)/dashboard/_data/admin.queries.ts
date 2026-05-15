import { unstable_cache, unstable_noStore as noStore } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { TIER_CONFIG } from '@/lib/constants'
import type { PlatformOverview, CoachListItem, ClientListItem, LifecycleStage } from './types'

function computeMonthlyRevenue(tier: string | null, cycle: string | null, provider: string | null): number {
    if (!tier || ['beta', 'internal', 'admin'].includes(provider ?? '') || tier === 'free') return 0
    const config = TIER_CONFIG[tier as keyof typeof TIER_CONFIG]
    if (!config) return 0
    if (cycle === 'annual' && 'annualPriceClp' in config && config.annualPriceClp) {
        return Math.round((config.annualPriceClp as number) / 12)
    }
    return config.monthlyPriceClp
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

export const getPlatformOverview = unstable_cache(
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
        ] = await Promise.all([
            admin.rpc('get_platform_coaches_count'),
            admin.rpc('get_platform_clients_count'),
            admin.from('coaches').select('*', { count: 'exact', head: true })
                .in('subscription_status', ['active', 'trialing'])
                .not('payment_provider', 'in', ['beta', 'internal']),
            admin.from('coaches')
                .select('subscription_tier')
                .not('subscription_mp_id', 'is', null)
                .eq('subscription_status', 'active')
                .not('payment_provider', 'in', ['beta', 'internal']),
            admin.from('coaches')
                .select('id, full_name, brand_name, created_at, subscription_status, subscription_tier')
                .order('created_at', { ascending: false })
                .limit(10),
            admin.from('admin_audit_logs')
                .select('id, admin_email, action, target_table, target_id, created_at')
                .order('created_at', { ascending: false })
                .limit(10),
            (admin.rpc as any)('get_platform_mrr_12_months'),
            (admin.rpc as any)('get_platform_coaches_by_tier_monthly'),
            (admin.rpc as any)('get_platform_workout_sessions_30d'),
            (admin.rpc as any)('get_platform_churn_last_30d'),
            (admin.rpc as any)('get_platform_checkins_7d'),
            admin.from('coaches')
                .select('*', { count: 'exact', head: true })
                .eq('payment_provider', 'beta')
                .in('subscription_status', ['active', 'trialing']),
            (admin.rpc as any)('get_platform_trial_conversion_rate'),
        ])

        const totalCoaches = coachesCountRes.data ?? 0
        const totalClients = clientsCountRes.data ?? 0
        const activeCoaches = activeCoachesRes.count ?? 0

        // Build paid coaches by tier for backward compat
        const coachesByTier: Record<string, number> = {}
        if (paidCoachesRes.data) {
            for (const row of paidCoachesRes.data) {
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

        const [expiringSoonRes, pendingPaymentRes] = await Promise.all([
            admin.from('coaches')
                .select('id, full_name, brand_name, current_period_end, subscription_status')
                .in('subscription_status', ['active', 'trialing'])
                .lt('current_period_end', new Date(Date.now() + 7 * 86_400_000).toISOString())
                .gt('current_period_end', new Date().toISOString())
                .order('current_period_end')
                .limit(10),
            admin.from('coaches')
                .select('id, full_name, brand_name, created_at, subscription_tier')
                .eq('subscription_status', 'pending_payment')
                .order('created_at', { ascending: true })
                .limit(20),
        ])

        return {
            totalCoaches,
            totalClients,
            activeCoaches,
            coachesByTier,
            mrrEstimate,
            arrEstimate: mrrEstimate * 12,
            mrrDeltaPct,
            churnLast30d: ((churnRes.data ?? []) as unknown as unknown[]).length,
            checkinsLast7d: (checkinsRes.data as number) ?? 0,
            recentCoachSignups: recentSignupsRes.data ?? [],
            recentAuditEvents: (recentAuditRes.data ?? []) as PlatformOverview['recentAuditEvents'],
            mrrSeries,
            tierMonthlySeries: (tierSeriesRes.data ?? []) as { ym: string; tier: string; coach_count: number }[],
            workoutSessionsSeries: workoutSessionsRes.data ?? [],
            betaInvitesCount: betaInvitesRes.count ?? 0,
            expiringSoon: (expiringSoonRes.data ?? []) as PlatformOverview['expiringSoon'],
            pendingPaymentCoaches: (pendingPaymentRes.data ?? []) as PlatformOverview['pendingPaymentCoaches'],
            trialConversion: (() => {
                const row = (trialConversionRes.data as any[])?.[0]
                const converted = Number(row?.converted ?? 0)
                const total_trials = Number(row?.total_trials ?? 0)
                const pct = total_trials > 0 ? Math.round(converted / total_trials * 100) : null
                return { converted, total_trials, pct }
            })(),
        }
    },
    ['admin-platform-overview'],
    { revalidate: 60, tags: ['admin-dashboard'] }
)

export async function getAllCoachesPaginated(params: {
    search?: string
    status?: string
    tier?: string
    beta?: boolean
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

    const { data, error } = await (admin.rpc as any)('get_admin_coaches_paginated', {
        p_search: params.search || null,
        p_status: params.status || null,
        p_tier:   params.tier   || null,
        p_beta:   params.beta   ?? null,
        p_sort:   params.sort   || 'created_at',
        p_dir:    params.dir    || 'desc',
        p_limit:  pageSize,
        p_offset: offset,
    })

    if (error || !data) {
        // Fallback: direct coaches query if RPC is unavailable
        const { data: fallback } = await admin
            .from('coaches')
            .select('id, full_name, brand_name, slug, subscription_tier, subscription_status, billing_cycle, payment_provider, max_clients, current_period_end, trial_ends_at, created_at')
            .order('created_at', { ascending: false })
            .limit(pageSize)
        if (!fallback) return { coaches: [], total: 0 }
        const coaches: CoachListItem[] = (fallback as any[]).map(r => ({
            id: r.id, full_name: r.full_name, brand_name: r.brand_name, slug: r.slug,
            subscription_tier: r.subscription_tier, subscription_status: r.subscription_status,
            billing_cycle: r.billing_cycle, payment_provider: r.payment_provider,
            max_clients: r.max_clients, current_period_end: r.current_period_end,
            trial_ends_at: r.trial_ends_at, created_at: r.created_at,
            client_count: 0, active_client_count: 0,
            days_until_expiry: r.current_period_end
                ? Math.floor((new Date(r.current_period_end).getTime() - Date.now()) / 86400000)
                : null,
            utilization_pct: 0, last_activity_at: null, coach_last_login_at: null,
            auth_email: null,
            monthly_revenue: computeMonthlyRevenue(r.subscription_tier, r.billing_cycle, r.payment_provider),
            lifecycle_stage: computeLifecycleStage(r.subscription_status, null),
        }))
        return { coaches, total: coaches.length }
    }

    const rows = data as unknown as (Record<string, any> & { total_count: number })[]
    const total = rows[0]?.total_count ?? 0
    const coaches: CoachListItem[] = rows.map((r) => ({
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
        days_until_expiry: r.days_until_expiry,
        utilization_pct: Number(r.utilization_pct),
        last_activity_at: r.last_activity_at,
        coach_last_login_at: r.coach_last_login_at ?? null,
        auth_email: r.auth_email ?? null,
        monthly_revenue: computeMonthlyRevenue(r.subscription_tier, r.billing_cycle, r.payment_provider),
        lifecycle_stage: computeLifecycleStage(r.subscription_status, r.days_until_expiry),
    }))

    const AT_RISK_STAGES = new Set(['active_atRisk', 'expiring_soon', 'pending'])
    const filtered = params.atRisk
        ? coaches.filter(c => AT_RISK_STAGES.has(c.lifecycle_stage))
        : params.stage
            ? coaches.filter(c => c.lifecycle_stage === params.stage)
            : coaches

    const isClientFiltered = params.atRisk || !!params.stage
    return { coaches: filtered, total: isClientFiltered ? filtered.length : total }
}

// Keep old getAllCoaches for backward compat (clients page still uses it)
export async function getAllCoaches(search?: string): Promise<CoachListItem[]> {
    const { coaches } = await getAllCoachesPaginated({ search, pageSize: 500 })
    return coaches
}

export async function getAllCoachesBasic(): Promise<{ id: string; full_name: string | null; brand_name: string | null; slug: string }[]> {
    noStore()
    const admin = createServiceRoleClient()
    const { data } = await admin
        .from('coaches')
        .select('id, full_name, brand_name, slug')
        .order('full_name')
    return (data ?? []) as { id: string; full_name: string | null; brand_name: string | null; slug: string }[]
}

export async function getAllClients(
    search?: string,
    coachId?: string,
    page = 1,
    pageSize = 50
): Promise<{ clients: ClientListItem[]; total: number }> {
    noStore()
    const admin = createServiceRoleClient()
    const offset = (page - 1) * pageSize

    let query = admin
        .from('clients')
        .select('id, full_name, email, coach_id, is_active, is_archived, created_at, onboarding_completed, coaches(full_name)', { count: 'exact' })
        .order('created_at', { ascending: false })

    if (search) {
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
    }
    if (coachId) {
        query = query.eq('coach_id', coachId)
    }

    const { data, error, count } = await query.range(offset, offset + pageSize - 1)
    if (error || !data) return { clients: [], total: 0 }

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

    return { clients, total: count ?? 0 }
}
