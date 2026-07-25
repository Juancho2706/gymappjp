'use client'

import { usePostHog } from 'posthog-js/react'
import { useCallback } from 'react'
import type { SubscriptionTier } from '@/lib/constants'

/** Identify coach after login/registration (only when they opted in). */
export function useIdentifyCoach() {
    const ph = usePostHog()
    return useCallback(
        (coachId: string, tier: SubscriptionTier, hasConsent: boolean) => {
            if (!ph || !hasConsent) return
            ph.identify(coachId, { tier, platform: 'coach' })
        },
        [ph]
    )
}

/** Coach hit a feature gate (nutrition, branding, client limit). */
export function useCaptureUpgradeGate() {
    const ph = usePostHog()
    return useCallback(
        (gate: 'nutrition' | 'branding' | 'client_limit', currentTier: SubscriptionTier, currentLimit?: number) => {
            ph?.capture('upgrade_gate_hit', { gate, current_tier: currentTier, current_limit: currentLimit })
        },
        [ph]
    )
}

/** Coach dismissed the upgrade modal without upgrading. */
export function useCaptureUpgradeDismissed() {
    const ph = usePostHog()
    return useCallback(
        (gate: string, currentTier: SubscriptionTier) => {
            ph?.capture('upgrade_modal_dismissed', { gate, current_tier: currentTier })
        },
        [ph]
    )
}

/** Coach clicked upgrade CTA — initiated the upgrade flow. */
export function useCaptureUpgradeInitiated() {
    const ph = usePostHog()
    return useCallback(
        (source: string, targetTier: SubscriptionTier, currentTier: SubscriptionTier) => {
            ph?.capture('upgrade_initiated', { source, target_tier: targetTier, current_tier: currentTier })
        },
        [ph]
    )
}

/**
 * Coach clicked a module catalog CTA — captures purchase intent per module.
 * Contexts: `standalone_mailto` (interino, plan 05 lo cambia a `self_service`),
 * `team_manager_mailto` (gestor de equipo escribe a contacto). PostHog ya está
 * gated por el consentimiento de cookies (no-op sin `ph`); cero servicios nuevos.
 */
export function useCaptureModuleInterest() {
    const ph = usePostHog()
    return useCallback(
        (
            moduleKey: string,
            ctaContext: 'standalone_mailto' | 'team_manager_mailto' | 'self_service',
            tier: SubscriptionTier
        ) => {
            ph?.capture('module_interest_cta_clicked', {
                module_key: moduleKey,
                cta_context: ctaContext,
                tier,
            })
        },
        [ph]
    )
}

/** Coach completed registration — free or paid. */
export function useCaptureRegistration() {
    const ph = usePostHog()
    return useCallback(
        (tier: SubscriptionTier, billingCycle?: string) => {
            ph?.capture('coach_registered', { tier, billing_cycle: billingCycle ?? null })
        },
        [ph]
    )
}

/**
 * Funnel de add-ons self-service (plan 05 F5.8 — analítica PASIVA, NO superficie de venta:
 * no muestra precios ni CTAs, solo observa, por eso no viola la regla anti-hostigamiento).
 *
 * Embudo:
 *   addon_catalog_viewed   → la sección Add-ons de /coach/subscription quedó visible
 *   addon_modal_opened     → el coach abrió el modal de confirmación de un módulo
 *   addon_terms_accepted   → marcó el checkbox de aceptación de las 5 reglas
 *   addon_confirmed        → pulsó el CTA final (mensual: alta directa; trim/anual: redirige)
 *   addon_oneshot_redirected → (solo MercadoPago) redirigido al checkout del one-shot
 *   addon_flow_applied     → (solo Flow) cambio de plan síncrono aplicado sin redirect
 *
 * Propiedades: `module_key`, `billing_cycle`, `tier` — SIN montos ni datos personales
 * (PostHog ya está gated por el consentimiento de cookies: no-op sin `ph`).
 */
export type AddonFunnelEvent =
    | 'addon_catalog_viewed'
    | 'addon_modal_opened'
    | 'addon_terms_accepted'
    | 'addon_confirmed'
    | 'addon_oneshot_redirected'
    | 'addon_flow_applied'

export type AddonFunnelProps = {
    module_key?: string
    billing_cycle?: string
    tier?: SubscriptionTier
}

export function useCaptureAddonFunnel() {
    const ph = usePostHog()
    return useCallback(
        (event: AddonFunnelEvent, props?: AddonFunnelProps) => {
            ph?.capture(event, {
                module_key: props?.module_key ?? null,
                billing_cycle: props?.billing_cycle ?? null,
                tier: props?.tier ?? null,
            })
        },
        [ph]
    )
}

/**
 * Eventos de producto del ALUMNO (superficie /c). El provider de PostHog vive en el layout raíz, así
 * que también envuelve la zona del alumno. Como el resto, están gated por el consentimiento de cookies
 * (no-op sin `ph`) y NO llevan montos ni datos personales:
 *
 *   student_workout_launched  → el alumno disparó el Despegue (tap en el CTA o en una day-card)
 *   student_workout_completed → el alumno finalizó la sesión (pantalla de resumen visible)
 */
export function useCaptureStudentWorkoutLaunched() {
    const ph = usePostHog()
    return useCallback(
        (props?: { start_path?: string }) => {
            ph?.capture('student_workout_launched', { start_path: props?.start_path ?? null })
        },
        [ph]
    )
}

export function useCaptureStudentWorkoutCompleted() {
    const ph = usePostHog()
    return useCallback(
        (props?: { plan_id?: string }) => {
            ph?.capture('student_workout_completed', { plan_id: props?.plan_id ?? null })
        },
        [ph]
    )
}
