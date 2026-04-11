import { SUBSCRIPTION_BLOCKED_STATUSES } from '@/lib/constants'

export type CoachSubscriptionRedirect = '/coach/reactivate' | '/coach/dashboard' | null

/**
 * Pure subscription gate logic used by middleware for /coach/* routes.
 */
export function resolveCoachSubscriptionRedirect(
    pathname: string,
    subscriptionStatus: string | null | undefined
): CoachSubscriptionRedirect {
    const isReactivatePage = pathname.startsWith('/coach/reactivate')
    const isSubscriptionProcessingPage = pathname.startsWith('/coach/subscription/processing')
    const isSubscriptionGatePage = isReactivatePage || isSubscriptionProcessingPage
    const blocked = new Set<string>(SUBSCRIPTION_BLOCKED_STATUSES as readonly string[])
    const isBlocked = blocked.has(subscriptionStatus ?? '')

    if (isBlocked && !isSubscriptionGatePage) {
        return '/coach/reactivate'
    }
    if (!isBlocked && isSubscriptionGatePage) {
        return '/coach/dashboard'
    }
    return null
}
