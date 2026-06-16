import { SUBSCRIPTION_BLOCKED_STATUSES } from '@/lib/constants'

export type CoachSubscriptionRedirect = '/coach/reactivate' | '/coach/dashboard' | null

/**
 * Coaches "managed" (sin billing individual): plan gestionado por la organización (enterprise)
 * o por el team (pool). Acceso completo, sin menú de suscripción/marca propia.
 */
export function isManagedSubscription(status: string | null | undefined): boolean {
    return status === 'org_managed' || status === 'team_managed'
}

/**
 * Returns true if the coach has effective access based on status and period end date.
 * A canceled coach keeps access until current_period_end.
 */
export function hasEffectiveAccess(
    subscriptionStatus: string | null | undefined,
    currentPeriodEnd: string | null | undefined
): boolean {
    if (isManagedSubscription(subscriptionStatus)) return true
    const status = subscriptionStatus ?? ''

    // Gracia hasta current_period_end: cancel voluntario, trial, y dunning INVOLUNTARIO (paused/past_due).
    // P0-3a: un decline de cobro recurrente (sin fondos) NO debe botar al coach al instante en mitad de
    // un período YA pagado — sería una asimetría con el cancel voluntario, que sí conserva acceso. MP
    // reintenta el cobro durante el ciclo; el coach conserva acceso hasta el corte y AHÍ sí se bloquea
    // (el flujo terminal lo pasa a expired al vencer). Sin esto, paused/past_due bloqueaban al instante.
    if (
        status === 'canceled' ||
        status === 'trialing' ||
        status === 'paused' ||
        status === 'past_due'
    ) {
        if (!currentPeriodEnd) return false
        return new Date(currentPeriodEnd).getTime() > Date.now()
    }

    // Estados duros SIN gracia (pending_payment, expired): bloqueo inmediato.
    const blocked = new Set<string>(SUBSCRIPTION_BLOCKED_STATUSES as readonly string[])
    if (blocked.has(status)) return false

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
    // org_managed / team_managed: acceso siempre — plan gestionado por org o team
    if (!subscriptionStatus || isManagedSubscription(subscriptionStatus)) return null

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
