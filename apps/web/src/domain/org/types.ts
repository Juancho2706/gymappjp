export type OrgMemberStatus = 'active' | 'invited' | 'suspended'

export type OrgBillingStatus = 'active' | 'past_due' | 'canceled' | 'suspended'

export type OrgPlan = 'starter' | 'pro' | 'enterprise'

export type OrgContext = {
    orgId: string
    orgSlug: string
    orgName: string
    plan: OrgPlan
    billingStatus: OrgBillingStatus
}
