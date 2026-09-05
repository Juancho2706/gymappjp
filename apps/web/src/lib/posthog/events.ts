'use client'

import { usePostHog } from 'posthog-js/react'
import { useCallback } from 'react'
import type { SubscriptionTier } from '@/lib/constants'
import { PRICING_VERSION, type RegistrationMethod } from '@/lib/posthog/registration'

/**
 * Identify coach after login/registration (only when they opted in).
 *
 * `role: 'coach'` (SEC-01, 05-09): antes solo viajaba `platform: 'coach'` — nombre que se pisa con
 * el `platform: 'web'`/`'ios'`/`'android'` que ya usan otros eventos (`coach_registered`, el init
 * del provider). `role` es la propiedad nueva y estable para segmentar coach vs alumno en persons
 * y en cohortes; `platform: 'coach'` se deja intacto para no romper insights/cohorts existentes
 * que ya filtran por ese valor.
 */
export function useIdentifyCoach() {
    const ph = usePostHog()
    return useCallback(
        (coachId: string, tier: SubscriptionTier, hasConsent: boolean) => {
            if (!ph || !hasConsent) return
            ph.identify(coachId, { tier, platform: 'coach', role: 'coach' })
        },
        [ph]
    )
}

/**
 * Coach hit a feature gate (nutrition, branding, client limit).
 *
 * `active` (Pricing v3, 21-08): alumnos activos al momento del rechazo. Es lo que separa «choqué
 * el muro de Free con 1 alumno» de «lo choqué con 25»: sin ese número el gate de cupo solo dice
 * que alguien chocó, no cuánta cartera hay detrás del upgrade. Opcional — los gates que no son de
 * cupo (nutrition/branding) no lo mandan. Sin PII, como todo este módulo.
 */
export function useCaptureUpgradeGate() {
    const ph = usePostHog()
    return useCallback(
        (
            gate: 'nutrition' | 'branding' | 'client_limit',
            currentTier: SubscriptionTier,
            currentLimit?: number,
            active?: number
        ) => {
            ph?.capture('upgrade_gate_hit', {
                gate,
                current_tier: currentTier,
                current_limit: currentLimit,
                active: active ?? null,
            })
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

/**
 * Coach completed registration — free or paid.
 *
 * DEVUELVE el CaptureResult de posthog (truthy = el evento salio de verdad, undefined = pre-init u
 * opted-out) para que `CoachRegisteredTracker` pueda reintentar con `useDeferredCapture`. No se
 * dispara desde /register: los dos Server Actions del wizard terminan en `redirect()`, asi que el
 * cliente jamas ve el exito — el disparo vive en los aterrizajes post-alta.
 *
 * `pricing_version` (owner 2026-08-21): sella con qué catálogo se dio de alta el coach. Sin esta
 * marca, las cohortes de altas quedan mezcladas con las de Pricing v2 (Free 2 alumnos, sin
 * white-label) y cualquier lectura de activación post-corte compara peras con manzanas. Es un
 * literal a propósito (`PRICING_VERSION`): cuando el catálogo cambie de nuevo, se sube en un solo
 * lugar y las cohortes se separan solas — nunca derivar la versión de la fecha del evento.
 *
 * `platform: 'web'` (W7.1): este hook SOLO corre en el navegador, así que la constante no es una
 * suposición. Las altas de la app las emite el servidor (`lib/posthog/registration-events.ts`) con
 * `ios`/`android`; entre las dos fuentes la propiedad queda poblada en el 100 % de las altas.
 * `source: 'client'` deja auditable de dónde salió cada fila si alguna vez hay duplicados.
 */
export function useCaptureRegistration() {
    const ph = usePostHog()
    return useCallback(
        (tier: SubscriptionTier, method: RegistrationMethod, billingCycle?: string) =>
            ph?.capture('coach_registered', {
                tier,
                billing_cycle: billingCycle ?? null,
                method,
                platform: 'web',
                pricing_version: PRICING_VERSION,
                source: 'client',
            }),
        [ph]
    )
}

/**
 * register_submitted — el visitante termino el wizard de /register y el Server Action arranco.
 *
 * NO es `checkout_started` a proposito, aunque el paso se parezca: ese evento YA lo emite
 * `/coach/subscription/processing` con `source: 'register'` (page.tsx, startCheckoutFromRegister)
 * cuando de verdad se pide la preference. Duplicarlo en el submit inflaria el paso del funnel con
 * altas que el server todavia puede rechazar (email tomado, turnstile, tope de free por IP) y
 * romperia el contrato escrito arriba («se pide la preference/enrolamiento al server»).
 *
 * Este evento cubre el hueco REAL entre `pricing_plan_clicked` y `checkout_started`: cuantos
 * terminan el wizard — y para el tier FREE es la UNICA señal del embudo, porque el alta gratis nunca
 * pasa por checkout.
 *
 *   method: 'email' | 'google' — el alta por Google usa otro Server Action (onboarding/complete).
 *
 * Precede una navegacion: send_instantly + sendBeacon, igual que los checkout_*.
 *
 * `platform`/`pricing_version` (W7.1): el wizard `/register` es web y solo web — el alta desde la
 * app no pasa por acá, va directo a `api/mobile/auth/**`. Van las mismas dos propiedades que
 * `coach_registered` para que los dos pasos del embudo se puedan cortar por el mismo eje.
 */
export function useCaptureRegisterSubmitted() {
    const ph = usePostHog()
    return useCallback(
        (props: { tier: SubscriptionTier; billingCycle: string; method: RegistrationMethod }) => {
            ph?.capture(
                'register_submitted',
                {
                    tier: props.tier,
                    billing_cycle: props.billingCycle,
                    method: props.method,
                    platform: 'web',
                    pricing_version: PRICING_VERSION,
                },
                { send_instantly: true, transport: 'sendBeacon' }
            )
        },
        [ph]
    )
}

/**
 * register_failed — el Server Action del alta RECHAZÓ el intento y devolvió un error al wizard.
 *
 * Cierra el hueco mas caro del embudo: `register_submitted` existia, `coach_registered` existia, y
 * entre los dos no habia NADA. Caso medido el 20-08 01:43 UTC: un visitante con `utm_source=meta`
 * mando `register_submitted` 3 veces en 28 s, el action lo rechazo las 3 y no quedo rastro en
 * ningun lado — ni log, ni Sentry, ni evento. Clic pagado, alta perdida, causa desconocida.
 *
 *   code: la causa estable que devuelve el action (`RegisterState.code` /
 *         `CompleteOnboardingState.code`). Los del alta por Google vienen prefijados `oauth_`.
 *         `unknown` = rechazo sin codigo; si aparece, hay una rama que no pasa por `reject()`.
 *
 * SIN `send_instantly`: un rechazo NO precede una navegacion — la pagina se queda pintando el
 * error, asi que el batch normal alcanza y no hay riesgo de perderlo por un unload.
 */
export function useCaptureRegisterFailed() {
    const ph = usePostHog()
    return useCallback(
        (props: { tier: SubscriptionTier; billingCycle: string; method: RegistrationMethod; code: string }) => {
            ph?.capture('register_failed', {
                tier: props.tier,
                billing_cycle: props.billingCycle,
                method: props.method,
                code: props.code,
            })
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
 *   pricing_viewed          → /pricing quedo visible (pageview propio del funnel; ver PricingTracker)
 *   pricing_plan_clicked    → click en el CTA de un plan de /pricing ({ tier })
 *   checkout_started        → el usuario confirmo y se pide la preference/enrolamiento al server
 *   checkout_failed         → el server NO devolvio checkout: el paso murio antes de la pasarela
 *   checkout_gateway_opened → el usuario apreto el boton que lo saca HACIA la pasarela
 *   checkout_confirmed      → la confirmacion aterrizo visible (processing / flow-processing /
 *                             upgrade-processing); result separa activacion inmediata de cambio agendado
 *
 * checkout_started, checkout_gateway_opened y checkout_confirmed preceden una navegacion DURA
 * (redirect a MP/Webpay o al dashboard): van con send_instantly + sendBeacon para que el evento no
 * muera con la pagina (el batch normal si moriria). checkout_failed NO — un fallo deja la pantalla
 * pintando el error, sin unload.
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

/**
 * checkout_gateway_opened — el usuario apreto el boton que lo saca HACIA la pasarela.
 *
 * Existe por un tramo NUEVO del embudo (P2, ola 25-08): `/coach/subscription/processing` ya no
 * teletransporta al coach a MercadoPago apenas llega la preference — le muestra una card con plan,
 * monto y medio de pago, y el salto lo aprieta el. Eso partio en dos lo que antes era un solo paso:
 * `checkout_started` (se PIDIO el checkout al server) y este evento (el coach de verdad SALIO hacia
 * la pasarela). Sin el, un coach que ve la card y aprieta «Volver» es indistinguible de uno que
 * abandono adentro de MercadoPago: los dos leen como `checkout_started` sin `checkout_confirmed`.
 *
 * `checkout_started` NO se movio: sigue marcando el pedido de la preference, que es lo que el resto
 * de las superficies (subscription, reactivate) siguen haciendo sin card intermedia.
 *
 *   gateway: por donde sale (mercadopago | flow). El coach puede elegir el otro medio EN la card.
 *   source:  la puerta desde la que arranco el checkout, igual que en checkout_started/failed.
 *
 * CON `send_instantly` + `sendBeacon`: el click es un `window.location.href` inmediato — el batch
 * normal de posthog-js se flushea por timer y moriria con la pagina.
 */
export function useCaptureCheckoutGatewayOpened() {
    const ph = usePostHog()
    return useCallback(
        (props: {
            tier: SubscriptionTier
            billingCycle: string
            gateway: CheckoutGateway
            source: CheckoutStartSource
        }) => {
            ph?.capture(
                'checkout_gateway_opened',
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

/**
 * checkout_failed — el checkout murio ANTES de la pasarela: create-preference no devolvio un
 * `checkoutUrl` usable (4xx/5xx del server, respuesta sin URL, o la red se cayo en el POST).
 *
 * Es el gemelo de `register_failed` para el paso del dinero, y cierra el hueco mas caro del embudo:
 * entre `checkout_started` y `checkout_confirmed` no habia NADA. Caso medido el 25-08 15:08:54 UTC:
 * un coach apreto Confirmar en /coach/subscription, MercadoPago devolvio 400 `guest_site_mismatch`
 * ("Payer is associated with a different site"), el 500 quedo SOLO en los logs de Vercel y el embudo
 * de PostHog no registro nada — leido en PostHog, ese coach «vio el precio y no compro».
 *
 *   code:    causa estable. El `code` del server cuando existe (OVER_CAPACITY, UPGRADE_IN_FLIGHT,
 *            NET_NOT_CHARGEABLE, GATEWAY_SWITCH_PENDING, FLOW_PLAN_CHANGE_UNSUPPORTED,
 *            GATEWAY_EMAIL_REJECTED, FEATURE_DISABLED); `http_<status>` cuando el server respondio
 *            un error SIN code (el 500 del catch generico cae aca); `missing_checkout_url` cuando
 *            respondio 200 sin URL; `unknown` cuando ni siquiera hubo respuesta parseable (red).
 *   message: el texto que VE el coach, recortado. Sirve para leer la causa real de los `http_500`
 *            (ahi viaja el mensaje crudo del gateway) sin abrir los logs de Vercel.
 *
 * SIN `send_instantly`: un fallo NO precede una navegacion — la pantalla se queda pintando el error,
 * asi que el batch normal alcanza. Sin PII (el mensaje del gateway nunca lleva el email del pagador).
 */
const CHECKOUT_FAILED_MESSAGE_MAX = 300

export function useCaptureCheckoutFailed() {
    const ph = usePostHog()
    return useCallback(
        (props: {
            tier: SubscriptionTier
            billingCycle: string
            gateway: CheckoutGateway
            source: CheckoutStartSource
            code: string
            message: string
        }) => {
            ph?.capture('checkout_failed', {
                tier: props.tier,
                billing_cycle: props.billingCycle,
                gateway: props.gateway,
                source: props.source,
                error_code: props.code,
                error_message: props.message.slice(0, CHECKOUT_FAILED_MESSAGE_MAX),
            })
        },
        [ph]
    )
}

export function useCaptureCheckoutConfirmed() {
    const ph = usePostHog()
    return useCallback(
        // tier/billingCycle nullable a proposito: la vuelta estandar de MP llega a /processing SIN
        // tier ni cycle en la URL — mandar el fallback visual de la pantalla envenenaria el
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
