import { SUBSCRIPTION_BLOCKED_STATUSES } from '@/lib/constants'

export type CoachSubscriptionRedirect = '/coach/reactivate' | '/coach/dashboard' | null

/**
 * Returns true if the coach has effective access based on status and period end date.
 * A canceled coach keeps access until current_period_end.
 */
export function hasEffectiveAccess(
    subscriptionStatus: string | null | undefined,
    currentPeriodEnd: string | null | undefined
): boolean {
    if (subscriptionStatus === 'org_managed') return true
    const status = subscriptionStatus ?? ''
    const blocked = new Set<string>(SUBSCRIPTION_BLOCKED_STATUSES as readonly string[])

    if (blocked.has(status)) return false

    // 'canceled' and 'trialing' coaches retain access only until current_period_end
    if (status === 'canceled' || status === 'trialing') {
        if (!currentPeriodEnd) return false
        return new Date(currentPeriodEnd).getTime() > Date.now()
    }

    return true
}

/**
 * Pure subscription gate logic used by middleware for /coach/* routes.
 */
export function resolveCoachSubscriptionRedirect(
    pathname: string,
    subscriptionStatus: string | null | undefined,
    currentPeriodEnd?: string | null
): CoachSubscriptionRedirect {
    // Gap 3: org_managed coaches always have access — plan managed by org
    if (!subscriptionStatus || subscriptionStatus === 'org_managed') return null

    const isReactivatePage = pathname.startsWith('/coach/reactivate')
    const isSubscriptionProcessingPage = pathname.startsWith('/coach/subscription/processing')
    const isSubscriptionGatePage = isReactivatePage || isSubscriptionProcessingPage
    const isBlocked = !hasEffectiveAccess(subscriptionStatus, currentPeriodEnd)

    if (isBlocked && !isSubscriptionGatePage) {
        return '/coach/reactivate'
    }
    if (!isBlocked && isSubscriptionGatePage) {
        return '/coach/dashboard'
    }
    return null
}
