import { unstable_cache } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { TIER_CONFIG } from '@/lib/constants'
import type { PlatformOverview, CoachListItem, ClientListItem } from './types'

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
        ] = await Promise.all([
            admin.rpc('get_platform_coaches_count'),
            admin.rpc('get_platform_clients_count'),
            admin.from('coaches').select('*', { count: 'exact', head: true })
                .in('subscription_status', ['active', 'trialing']),
            admin.from('coaches')
                .select('subscription_tier')
                .not('subscription_mp_id', 'is', null)
                .eq('subscription_status', 'active'),
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
    sort?: string
    dir?: string
    page?: number
    pageSize?: number
}): Promise<{ coaches: CoachListItem[]; total: number }> {
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

    if (error || !data) return { coaches: [], total: 0 }

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
    }))

    return { coaches, total }
}

// Keep old getAllCoaches for backward compat (clients page still uses it)
export async function getAllCoaches(search?: string): Promise<CoachListItem[]> {
    const { coaches } = await getAllCoachesPaginated({ search, pageSize: 500 })
    return coaches
}

export async function getAllClients(search?: string, coachId?: string): Promise<ClientListItem[]> {
    const admin = createServiceRoleClient()

    let query = admin
        .from('clients')
        .select('id, full_name, email, coach_id, is_active, created_at, onboarding_completed, coaches(full_name)')
        .order('created_at', { ascending: false })

    if (search) {
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
    }
    if (coachId) {
        query = query.eq('coach_id', coachId)
    }

    const { data, error } = await query.limit(500)
    if (error || !data) return []

    return data.map((c: any) => ({
        id: c.id,
        full_name: c.full_name,
        email: c.email,
        coach_id: c.coach_id,
        coach_name: c.coaches?.full_name ?? null,
        is_active: c.is_active,
        created_at: c.created_at,
        onboarding_completed: c.onboarding_completed,
    }))
}
