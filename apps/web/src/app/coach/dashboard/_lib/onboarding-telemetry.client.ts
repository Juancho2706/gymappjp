import type { OnboardingStepKey } from '@eva/onboarding'

/**
 * Telemetría de la guía de inicio (cliente). Todo pasa por `/api/coach/onboarding-events`, que es
 * quien deduplica server-side: `step_completed` tiene índice único parcial por `(coach_id,
 * step_key)` y el resto una ventana de 5 s. `guide_engagement` NO se deduplica a propósito
 * (analítica de frecuencia).
 *
 * Ninguna de estas funciones bloquea la UI ni lanza: la guía tiene que seguir funcionando aunque
 * el endpoint esté caído.
 */

/** Pasos v2 + los dos legacy que el endpoint todavía acepta para las filas históricas. */
export type OnboardingGuideStepKey = OnboardingStepKey | 'first_plan' | 'first_checkin'

export type OnboardingEventType =
    | 'step_completed'
    | 'step_reopened'
    | 'aha_moment'
    | 'guide_engagement'
    | 'onboarding_dismissed'

type EventMetadata = Record<string, string | number | boolean>

async function postOnboardingEvent(
    stepKey: OnboardingGuideStepKey,
    eventType: OnboardingEventType,
    metadata?: EventMetadata
): Promise<void> {
    try {
        await fetch('/api/coach/onboarding-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stepKey, eventType, metadata }),
        })
    } catch {
        /* no bloquear UI */
    }
}

/**
 * Un paso pasó a completado. Se emite UNA vez por paso y por coach: el llamador guarda la lista
 * de pasos ya emitidos en el estado persistido (`onboarding_guide.emitted`) para no reintentar en
 * cada render, y la DB pone el cerrojo final.
 */
export async function postStepCompleted(
    stepKey: OnboardingGuideStepKey,
    metadata?: EventMetadata
): Promise<void> {
    return postOnboardingEvent(stepKey, 'step_completed', metadata)
}

/** El aha (paso 5): el único momento con confeti. */
export async function postAhaMoment(metadata?: EventMetadata): Promise<void> {
    return postOnboardingEvent('aha', 'aha_moment', metadata)
}

/** El coach mandó la guía al pie o cerró la tira. */
export async function postOnboardingDismissed(
    stepKey: OnboardingGuideStepKey,
    metadata?: EventMetadata
): Promise<void> {
    return postOnboardingEvent(stepKey, 'onboarding_dismissed', metadata)
}

/** Interacciones de exploración de la guía (abrir/cerrar, tocar una tarjeta). Sin dedupe. */
export async function postGuideEngagement(
    stepKey: OnboardingGuideStepKey,
    metadata: EventMetadata
): Promise<void> {
    return postOnboardingEvent(stepKey, 'guide_engagement', metadata)
}
