import { SUBSCRIPTION_BLOCKED_STATUSES } from '@/lib/constants'
import { getTierMaxClients } from '@eva/tiers'

export type CoachSubscriptionRedirect = '/coach/reactivate' | '/coach/dashboard' | null

export type CoachSubscriptionGateContext = {
    subscriptionTier?: string | null
    activeStandaloneClientCount?: number | null
    workspaceType?: string | null
    /**
     * Cupo free EFECTIVO del coach (pricing v2, P2): `coaches.max_clients` cuando existe, o
     * `tierMaxClientsFor('free', created_at)` — lo resuelve el caller (proxy) que tiene la fila.
     * Sin este dato se cae al catálogo de venta (coaches nuevos); un free VIEJO mide contra su 3.
     */
    freeClientLimit?: number | null
}

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
 *
 * `now` es inyectable (default `Date.now()` a nivel de firma, no en render) para que toda la cadena
 * pura del gate sea determinista end-to-end: quien inyecta `now` arriba (resolveStudentAccessState,
 * resolveCoachSubscriptionRedirect) lo propaga hasta acá y no queda ningún reloj real escondido.
 */
export function hasEffectiveAccess(
    subscriptionStatus: string | null | undefined,
    currentPeriodEnd: string | null | undefined,
    now: number = Date.now()
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
        return new Date(currentPeriodEnd).getTime() > now
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
    currentPeriodEnd?: string | null,
    now: number = Date.now(),
    context?: CoachSubscriptionGateContext,
): CoachSubscriptionRedirect {
    // org_managed / team_managed: acceso siempre — plan gestionado por org o team
    if (!subscriptionStatus || isManagedSubscription(subscriptionStatus)) return null

    const isReactivatePage = pathname.startsWith('/coach/reactivate')
    // Pantallas TRANSACCIONALES del checkout (vuelta de la pasarela). Las dos deben pasar el gate
    // aunque el coach esté BLOQUEADO: son justamente el paso que lo desbloquea.
    //   · /coach/subscription/processing      → back_url de Mercado Pago (confirm-subscription).
    //   · /coach/subscription/flow-processing → urlReturn de Flow vía /flow/retorno (confirm-enrollment).
    // Incidente 2026-09-01 (coach expirada reactivando por Flow): solo `processing` estaba exento, el
    // proxy rebotaba `flow-processing` a /coach/reactivate?reason=subscription_blocked y la Fase 2
    // (confirm-enrollment) NUNCA corría — tarjeta enrolada en Flow, sub jamás creada, loop infinito.
    const isSubscriptionProcessingPage =
        pathname.startsWith('/coach/subscription/processing') ||
        pathname.startsWith('/coach/subscription/flow-processing')
    const isSubscriptionGatePage = isReactivatePage || isSubscriptionProcessingPage
    const isFreeStandaloneOverCapacity =
        context?.subscriptionTier === 'free' &&
        context.workspaceType === 'coach_standalone' &&
        typeof context.activeStandaloneClientCount === 'number' &&
        // Pricing v2 (P2): medir contra el cupo EFECTIVO del coach (columna/grandfather) cuando el
        // caller lo aporta — con el catálogo nuevo (free 2) un free VIEJO con sus 3 de siempre
        // quedaría expulsado a /coach/reactivate sin este dato.
        context.activeStandaloneClientCount > (context.freeClientLimit ?? getTierMaxClients('free'))
    const isBlocked = !hasEffectiveAccess(subscriptionStatus, currentPeriodEnd, now) || isFreeStandaloneOverCapacity

    if (isBlocked && !isSubscriptionGatePage) {
        return '/coach/reactivate'
    }
    // ── A1 (ola checkout 25-08): expulsar del gate SOLO desde /coach/reactivate ──────────────────
    // `/coach/reactivate` es la pantalla del BLOQUEO: un coach CON acceso no tiene nada que hacer
    // ahí, y devolverlo al dashboard sigue siendo lo correcto.
    //
    // `/coach/subscription/processing` NO es eso: es la pantalla TRANSACCIONAL del checkout, y desde
    // A1 la usan coaches CON acceso. El alta con tier pago ya no nace en `pending_payment` — nace
    // free+active — y el registro la manda derecho a `?from=register&tier=pro`; con la regla vieja,
    // el gate la rebotaba al dashboard y el checkout no llegaba a empezar NUNCA. El mismo rebote ya
    // rompía en silencio la VUELTA de MercadoPago del coach free que compra (back_url =
    // /coach/subscription/processing): aterrizaba en el dashboard, `confirm-subscription` no corría
    // y el alta quedaba colgada del webhook. Un coach con acceso que entra sin checkout en curso ve
    // la pantalla resolver sola (la propia página navega al dashboard al confirmar), así que no hace
    // falta que el gate lo eche.
    if (!isBlocked && isReactivatePage) {
        return '/coach/dashboard'
    }
    return null
}
