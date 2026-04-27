import { unstable_cache } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

export interface FinanzasData {
    mrrEstimate: number
    arrEstimate: number
    paidCoachCount: number
    arpc: number
    mrrSeries: { ym: string; mrr_clp: number; coach_count: number }[]
    churnSeries: { ym: string; churned_count: number }[]
    revenueByCycle: { billing_cycle: string; mrr_clp: number; coach_count: number }[]
    revenueByTier: { tier: string; mrr_clp: number; coach_count: number }[]
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

const TIER_PRICES: Record<string, number> = {
    starter: 19990,
    pro: 29990,
    elite: 44990,
    scale: 64990,
}

export const getFinanzasData = unstable_cache(
    async (): Promise<FinanzasData> => {
        const admin = createServiceRoleClient()

        const [
            paidCoachesRes,
            mrrSeriesRes,
            churnSeriesRes,
            revByCycleRes,
            revByTierRes,
            eventsRes,
        ] = await Promise.all([
            admin.from('coaches')
                .select('id, full_name, brand_name, subscription_tier')
                .eq('subscription_status', 'active')
                .not('subscription_mp_id', 'is', null)
                .neq('payment_provider', 'beta'),
            (admin.rpc as any)('get_platform_mrr_12_months'),
            (admin.rpc as any)('get_platform_churn_monthly'),
            (admin.rpc as any)('get_platform_revenue_by_cycle'),
            (admin.rpc as any)('get_platform_revenue_by_tier'),
            admin.from('subscription_events')
                .select('id, coach_id, provider, provider_event_id, provider_status, payload, created_at')
                .order('created_at', { ascending: false })
                .limit(50),
        ])

        const paidCoaches = paidCoachesRes.data ?? []
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
            recentEvents,
        }
    },
    ['admin-finanzas'],
    { revalidate: 300, tags: ['admin-finanzas'] }
)
