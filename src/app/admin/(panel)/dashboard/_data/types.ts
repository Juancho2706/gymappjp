export interface PlatformOverview {
    totalCoaches: number
    totalClients: number
    activeCoaches: number
    coachesByTier: Record<string, number>
    mrrEstimate: number
    arrEstimate: number
    mrrDeltaPct: number | null
    churnLast30d: number
    checkinsLast7d: number
    recentCoachSignups: {
        id: string
        full_name: string | null
        brand_name: string | null
        created_at: string
        subscription_status: string | null
        subscription_tier: string | null
    }[]
    recentAuditEvents: {
        id: string
        admin_email: string
        action: string
        target_table: string | null
        target_id: string | null
        created_at: string
    }[]
    expiringSoon: {
        id: string
        full_name: string | null
        brand_name: string | null
        current_period_end: string | null
        subscription_status: string | null
    }[]
    mrrSeries: { ym: string; mrr_clp: number; coach_count: number }[]
    tierMonthlySeries: { ym: string; tier: string; coach_count: number }[]
    workoutSessionsSeries: { day: string; sessions: number }[]
    betaInvitesCount: number
}

export interface CoachListItem {
    id: string
    full_name: string | null
    brand_name: string | null
    slug: string
    subscription_tier: string | null
    subscription_status: string | null
    max_clients: number | null
    billing_cycle: string | null
    payment_provider: string | null
    current_period_end: string | null
    trial_ends_at: string | null
    created_at: string
    client_count: number
    active_client_count: number
    days_until_expiry: number | null
    utilization_pct: number
    last_activity_at: string | null
}

export interface ClientListItem {
    id: string
    full_name: string
    email: string
    coach_id: string
    coach_name: string | null
    is_active: boolean | null
    created_at: string
    onboarding_completed: boolean
}
