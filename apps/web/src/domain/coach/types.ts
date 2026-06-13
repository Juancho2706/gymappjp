// Tipos de tiers/ciclos: fuente única en @eva/tiers (paquete puro, compartido web+mobile — plan 04 F6).
// domain/ RE-EXPORTA del paquete (mismo patrón que packages/schemas; respeta "domain no importa de lib/").
export type { BillingCycle, SubscriptionTier, SaleTier, TierConfig, TierCapabilities } from '@eva/tiers'

export type PaymentProvider = 'mercadopago' | 'stripe' | 'admin'

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
    | 'team_managed'

export type CoachOrgContext = {
    coachId: string | null
    orgId: string | null
    orgRole: 'org_owner' | 'org_admin' | 'coach' | null
    isOrgMember: boolean
    isOrgAdmin: boolean
    isOrgUser: boolean
}
