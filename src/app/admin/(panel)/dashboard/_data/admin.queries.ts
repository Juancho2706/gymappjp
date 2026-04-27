import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/server'
import { TIER_CONFIG } from '@/lib/constants'
import type { PlatformOverview, CoachListItem, ClientListItem } from './types'

export const getPlatformOverview = cache(async (): Promise<PlatformOverview> => {
    const admin = await createAdminClient()

    const [
        coachesCountRes,
        clientsCountRes,
        activeCoachesRes,
        paidCoachesByTierRes,
        recentSignupsRes,
        signupsSeriesRes,
        workoutSessionsRes,
        subscriptionEventsRes,
        betaInvitesRes,
    ] = await Promise.all([
        admin.rpc('get_platform_coaches_count'),
        admin.rpc('get_platform_clients_count'),
        admin.from('coaches').select('*', { count: 'exact', head: true })
            .in('subscription_status', ['active', 'trialing']),
        admin.from('coaches')
            .select('subscription_tier')
            .not('subscription_mp_id', 'is', null)
            .in('subscription_status', ['active', 'trialing']),
        admin.from('coaches')
            .select('id, full_name, brand_name, created_at, subscription_status, subscription_tier')
            .order('created_at', { ascending: false })
            .limit(10),
        admin.rpc('get_platform_coach_signups_last_6_months'),
        admin.rpc('get_platform_workout_sessions_30d'),
        admin.rpc('get_platform_subscription_events_series'),
        admin.from('coaches')
            .select('*', { count: 'exact', head: true })
            .is('subscription_mp_id', null)
            .in('subscription_status', ['active', 'trialing']),
    ])

    const totalCoaches = coachesCountRes.data ?? 0
    const totalClients = clientsCountRes.data ?? 0
    const activeCoaches = activeCoachesRes.count ?? 0

    // Build paid coachesByTier map (only coaches with real MercadoPago payment)
    const paidCoachesByTier: Record<string, number> = {}
    if (paidCoachesByTierRes.data) {
        for (const row of paidCoachesByTierRes.data) {
            const tier = row.subscription_tier ?? 'unknown'
            paidCoachesByTier[tier] = (paidCoachesByTier[tier] ?? 0) + 1
        }
    }

    // Estimate MRR from paid coaches * tier prices
    let mrrEstimate = 0
    for (const [tier, count] of Object.entries(paidCoachesByTier)) {
        const config = TIER_CONFIG[tier as keyof typeof TIER_CONFIG]
        if (config) {
            mrrEstimate += count * config.monthlyPriceClp
        }
    }

    // MRR delta vs previous month (proxy from subscription events)
    const subEvents = subscriptionEventsRes.data ?? []
    const currentMonthEvents = subEvents[subEvents.length - 1]?.event_count ?? 0
    const previousMonthEvents = subEvents[subEvents.length - 2]?.event_count ?? 0
    const mrrDeltaPct = previousMonthEvents > 0
        ? Math.round(((currentMonthEvents - previousMonthEvents) / previousMonthEvents) * 100)
        : null

    return {
        totalCoaches,
        totalClients,
        activeCoaches,
        coachesByTier: paidCoachesByTier,
        mrrEstimate,
        mrrDeltaPct,
        recentCoachSignups: recentSignupsRes.data ?? [],
        coachSignupsSeries: signupsSeriesRes.data ?? [],
        workoutSessionsSeries: workoutSessionsRes.data ?? [],
        subscriptionEventsSeries: subEvents,
        betaInvitesCount: betaInvitesRes.count ?? 0,
    }
})

export async function getAllCoaches(search?: string): Promise<CoachListItem[]> {
    const admin = await createAdminClient()

    let query = admin
        .from('coaches')
        .select('id, full_name, brand_name, slug, subscription_tier, subscription_status, max_clients, billing_cycle, current_period_end, created_at')
        .order('created_at', { ascending: false })

    if (search) {
        query = query.or(`full_name.ilike.%${search}%,brand_name.ilike.%${search}%,slug.ilike.%${search}%`)
    }

    const { data: coaches, error } = await query.limit(500)
    if (error || !coaches) return []

    // Get client counts per coach
    const coachIds = coaches.map(c => c.id)
    const { data: clientCounts } = await admin
        .from('clients')
        .select('coach_id')
        .in('coach_id', coachIds)

    const countMap = new Map<string, number>()
    for (const c of clientCounts ?? []) {
        countMap.set(c.coach_id, (countMap.get(c.coach_id) ?? 0) + 1)
    }

    return coaches.map(c => ({
        ...c,
        client_count: countMap.get(c.id) ?? 0,
    }))
}

export async function getAllClients(search?: string, coachId?: string): Promise<ClientListItem[]> {
    const admin = await createAdminClient()

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
