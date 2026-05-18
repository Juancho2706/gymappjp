export type OnboardingGuideStepKey =
    | 'profile_branding'
    | 'first_client'
    | 'first_plan'
    | 'first_checkin'

/**
 * Eventos de exploración de la guía (viñetas, Three). `guide_engagement` sin dedupe en API.
 */
export async function postGuideEngagement(
    stepKey: OnboardingGuideStepKey,
    metadata: Record<string, string | number | boolean>
): Promise<void> {
    try {
        await fetch('/api/coach/onboarding-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                stepKey,
                eventType: 'guide_engagement',
                metadata,
            }),
        })
    } catch {
        /* no bloquear UI */
    }
}
