export type BillingCycle = 'monthly' | 'quarterly' | 'annual'
export type PaymentProvider = 'mercadopago' | 'stripe' | 'admin'
export type SubscriptionTier = 'free' | 'starter' | 'pro' | 'elite' | 'growth' | 'scale'

export type SubscriptionStatus =
    | 'active'
    | 'trialing'
    | 'canceled'
    | 'past_due'
    | 'expired'
    | 'paused'
    | 'pending_payment'
    | 'pending_email'
    | 'org_managed'

export type TierConfig = {
    label: string
    maxClients: number
    monthlyPriceClp: number
    annualPriceClp?: number
    features: string[]
    isMostAffordable?: boolean
}

export type TierCapabilities = {
    canUseNutrition: boolean
    canUseBranding: boolean
    canUseAdvancedReports: boolean
    canCreateCustomExercises: boolean
    canImportClients: boolean
}

export type CoachOrgContext = {
    coachId: string | null
    orgId: string | null
    orgRole: 'org_owner' | 'org_admin' | 'coach' | null
    isOrgMember: boolean
    isOrgAdmin: boolean
    isOrgUser: boolean
}
