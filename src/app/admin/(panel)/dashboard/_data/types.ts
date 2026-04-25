export interface PlatformOverview {
    totalCoaches: number
    totalClients: number
    activeCoaches: number
    coachesByTier: Record<string, number>
    mrrEstimate: number
    mrrDeltaPct: number | null
    recentCoachSignups: {
        id: string
        full_name: string | null
        brand_name: string | null
        created_at: string
        subscription_status: string | null
        subscription_tier: string | null
    }[]
    coachSignupsSeries: { ym: string; coach_count: number }[]
    workoutSessionsSeries: { day: string; sessions: number }[]
    subscriptionEventsSeries: { ym: string; event_count: number }[]
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
    current_period_end: string | null
    created_at: string
    client_count: number
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
