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

/**
 * Eventos de nutricion (programa nutrition-flows-redesign, T1.0). Los KPI que responde cada
 * evento estan en docs/specs/nutrition-flows-redesign/BASELINE.md. Como el resto: gated por
 * consentimiento (no-op sin `ph`), sin montos ni datos personales.
 *
 *   student_nutrition_intake      → un registro exitoso, por metodo (taps/dia y mix de metodos)
 *   student_nutrition_correction  → embudo abrir→guardar/retirar (abandono de correcciones)
 *   coach_nutrition_builder_opened / coach_nutrition_plan_published → tiempo-crear-plan por editor
 *   coach_nutrition_template_applied → uso real de plantillas (se dispara desde T1.5)
 */
// `substitution` (T2.4): el alumno registro un reemplazo AUTORIZADO por su coach. Se separa de
// `item_tap` a proposito — es la senal de si los reemplazos que el coach define se usan de verdad.
export type StudentNutritionIntakeMethod =
  | 'item_tap'
  | 'bulk_slot'
  | 'portion_chip'
  | 'free_search'
  | 'substitution'

export function useCaptureStudentNutritionIntake() {
    const ph = usePostHog()
    return useCallback(
        (method: StudentNutritionIntakeMethod) => {
            ph?.capture('student_nutrition_intake', { method })
        },
        [ph]
    )
}

export function useCaptureStudentNutritionCorrection() {
    const ph = usePostHog()
    return useCallback(
        (action: 'opened' | 'saved' | 'voided') => {
            ph?.capture('student_nutrition_correction', { action })
        },
        [ph]
    )
}

export function useCaptureCoachNutritionBuilderOpened() {
    const ph = usePostHog()
    return useCallback(
        (mode: 'create' | 'edit' | 'template') => {
            ph?.capture('coach_nutrition_builder_opened', { mode })
        },
        [ph]
    )
}

export function useCaptureCoachNutritionPlanPublished() {
    const ph = usePostHog()
    return useCallback(
        (editor: 'wizard' | 'quick_edit' | 'editor', durationMs: number) => {
            ph?.capture('coach_nutrition_plan_published', { editor, duration_ms: durationMs })
        },
        [ph]
    )
}

export function useCaptureCoachNutritionTemplateApplied() {
    const ph = usePostHog()
    return useCallback(
        (source: 'library' | 'picker') => {
            ph?.capture('coach_nutrition_template_applied', { source })
        },
        [ph]
    )
}

/**
 * Funnel de adquisicion/checkout (Pricing v2, tarea E1 — invariante P8: baseline en PostHog
 * ANTES de encender Meta Ads). Como todo lo demas de este modulo: gated por el consentimiento
 * de cookies (init con opt_out por defecto ⇒ capture es no-op hasta el opt-in del banner) y
 * SIN PII en propiedades — tier/ciclo/gateway si; email o nombres jamas.
 *
 *   pricing_viewed       → /pricing quedo visible (pageview propio del funnel; ver PricingTracker)
 *   pricing_plan_clicked → click en el CTA de un plan de /pricing ({ tier })
 *   checkout_started     → el usuario confirmo y se pide la preference/enrolamiento al server
 *   checkout_confirmed   → la confirmacion aterrizo visible (processing / flow-processing /
 *                          upgrade-processing); result separa activacion inmediata de cambio agendado
 *
 * Los checkout_* preceden una navegacion DURA (redirect a MP/Webpay o al dashboard): van con
 * send_instantly + sendBeacon para que el evento no muera con la pagina (el batch normal si moriria).
 */
export type CheckoutGateway = 'mercadopago' | 'flow'
export type CheckoutStartSource = 'subscription' | 'reactivate' | 'register'

export function useCaptureCheckoutStarted() {
    const ph = usePostHog()
    return useCallback(
        (props: {
            tier: SubscriptionTier
            billingCycle: string
            gateway: CheckoutGateway
            source: CheckoutStartSource
        }) => {
            ph?.capture(
                'checkout_started',
                {
                    tier: props.tier,
                    billing_cycle: props.billingCycle,
                    gateway: props.gateway,
                    source: props.source,
                },
                { send_instantly: true, transport: 'sendBeacon' }
            )
        },
        [ph]
    )
}

export function useCaptureCheckoutConfirmed() {
    const ph = usePostHog()
    return useCallback(
        // tier/billingCycle nullable a proposito: la vuelta estandar de MP llega a /processing SIN
        // tier ni cycle en la URL — mandar el fallback visual ('starter'/'monthly') envenenaria el
        // funnel, mejor null honesto.
        (props: {
            tier: SubscriptionTier | null
            billingCycle: string | null
            gateway: CheckoutGateway
            result: 'active' | 'scheduled'
        }) => {
            ph?.capture(
                'checkout_confirmed',
                {
                    tier: props.tier,
                    billing_cycle: props.billingCycle,
                    gateway: props.gateway,
                    result: props.result,
                },
                { send_instantly: true, transport: 'sendBeacon' }
            )
        },
        [ph]
    )
}
