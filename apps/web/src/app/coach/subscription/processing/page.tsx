'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import {
    BILLING_CYCLE_CONFIG,
    BILLING_CYCLE_PRICE_SUFFIX,
    FLOW_ENABLED,
    LEGACY_TIER_ALIASES,
    TIER_CONFIG,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'
import {
    CHECKOUT_TIER_MISSING,
    resolveCheckoutError,
    type CheckoutErrorCopy,
} from '@/lib/payments/checkout-errors'
import {
    useCaptureCheckoutConfirmed,
    useCaptureCheckoutFailed,
    useCaptureCheckoutGatewayOpened,
    useCaptureCheckoutStarted,
    type CheckoutGateway,
} from '@/lib/posthog/events'

const POLL_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

function extractPreapprovalId(rawSubscriptionParam: string, searchParams: URLSearchParams) {
    const direct = searchParams.get('preapproval_id')
    if (direct) return direct

    const decoded = (() => {
        try {
            return decodeURIComponent(rawSubscriptionParam)
        } catch {
            return rawSubscriptionParam
        }
    })()

    const nestedIndex = decoded.indexOf('preapproval_id=')
    if (nestedIndex === -1) return undefined

    const nested = decoded.slice(nestedIndex + 'preapproval_id='.length)
    const ampIndex = nested.indexOf('&')
    return ampIndex === -1 ? nested : nested.slice(0, ampIndex)
}

/**
 * Lo que el SERVER dice de este checkout, ya creado y listo para pagarse. El monto y el tier salen
 * de la respuesta de create-preference (compuesto neto, con cupón y add-ons ya aplicados): esta
 * pantalla NUNCA calcula ni hardcodea un precio. `amountClp` es null si el server no lo mandó —
 * mejor no mostrar monto que mostrar uno inventado.
 */
type CheckoutPreview = {
    checkoutUrl: string
    amountClp: number | null
    tier: SubscriptionTier
    billingCycle: BillingCycle
}

/** Fecha del corte (current_period_end) para mostrar cuándo se aplica un cambio agendado. */
async function fetchCurrentPeriodEnd(): Promise<string | null> {
    try {
        const response = await fetch('/api/payments/subscription-status')
        const raw = await response.text()
        const payload = raw ? JSON.parse(raw) : {}
        if (!response.ok) return null
        const end = payload?.coach?.current_period_end
        return typeof end === 'string' ? end : null
    } catch {
        return null
    }
}

export default function SubscriptionProcessingPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [statusText, setStatusText] = useState('')
    const [error, setError] = useState<string | null>(null)
    // P1 — copy humano del fallo del checkout (código del server → mensaje + salidas concretas).
    // Convive con `error`, que sigue sirviendo a los mensajes del confirm/poll: esos ya eran humanos
    // y no traen `code`. Lo que este estado mata es el JSON crudo del gateway pintado en pantalla.
    const [errorCopy, setErrorCopy] = useState<CheckoutErrorCopy | null>(null)
    // P2 — el checkout YA existe en el gateway pero todavía no redirigimos. Antes esta pantalla era
    // un spinner de 3 s que teletransportaba al coach a MercadoPago sin decirle qué iba a pasar ni
    // cuánto se cobraba (los 2 abandonos de la campaña murieron ahí). Ahora el salto lo decide él.
    const [checkoutPreview, setCheckoutPreview] = useState<CheckoutPreview | null>(null)
    // El salto al gateway ya se disparó: los botones se apagan mientras el navegador navega (una
    // navegación full-page puede tardar; sin esto el coach vuelve a apretar y pide otro checkout).
    const [redirecting, setRedirecting] = useState(false)
    // Medio del último intento: el botón "Reintentar" repite el MISMO medio que falló.
    const [lastGateway, setLastGateway] = useState<CheckoutGateway>('mercadopago')
    const [canRetry, setCanRetry] = useState(false)
    // Cambio agendado al corte (downgrade / cambio de ciclo): confirm-subscription responde
    // { scheduled: true } sin mutar al coach (el tier vivo NO cambia hasta el corte). En ese caso
    // dejamos de pollear y mostramos un estado de confirmación claro con la fecha del corte.
    const [scheduledCutDate, setScheduledCutDate] = useState<string | null>(null)
    const [scheduled, setScheduled] = useState(false)
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const pollStartRef = useRef<number>(0)
    // REGISTER-CODE: disclosure del cupón antes del primer checkout. El consentimiento = el botón
    // "Confirmar y pagar con descuento" (R4.2). Código inválido NUNCA bloquea (cae a precio lleno).
    const [couponPhase, setCouponPhase] = useState<'idle' | 'preview' | 'applying'>('idle')
    const [couponPreview, setCouponPreview] = useState<{
        baseBeforeDiscountClp: number
        discountClp: number
        totalClp: number
        couponCode: string
        durationLabel: string
        termsText: string
    } | null>(null)

    const preapprovalId = useMemo(
        () => extractPreapprovalId(searchParams.get('subscription') ?? '', searchParams),
        [searchParams]
    )
    const fromRegister = searchParams.get('from') === 'register'
    const couponFromUrl = searchParams.get('coupon')
    const rawTierParam = searchParams.get('tier')
    // Los deep-links de venta viejos (?tier=starter / starter_lite) se rescatan con el alias
    // canónico; `free` no usa esta pantalla. Todo lo demás viaja crudo al filtro de abajo.
    const normalizedTierParam = rawTierParam === 'free' ? null
        : rawTierParam ? (LEGACY_TIER_ALIASES[rawTierParam] ?? rawTierParam)
        : null
    // `in TIER_CONFIG` valida contra TODAS las entradas (incluidas growth/scale, ya fuera de
    // venta). Se queda intencionalmente: esta pantalla solo muestra el label de lo que se está
    // pagando; un coach grandfathered con un cargo legacy en vuelo debe ver su tier real. No es
    // una superficie de venta.
    //
    // Retiro de Starter (S2, D2=A): sin un tier del catálogo esto queda en `null` y NO cae a un
    // literal inventado. Antes caía al plan retirado y la pantalla decía «Starter · Mensual» a un
    // coach que estaba pagando Pro/Elite — y peor: ese literal viajaba al POST de create-preference.
    const tierFromQuery: SubscriptionTier | null =
        normalizedTierParam && normalizedTierParam in TIER_CONFIG
            ? (normalizedTierParam as SubscriptionTier)
            : null
    /** SOLO el chip de plan. `null` ⇒ no se pinta chip: mejor ningún plan que uno inventado. */
    const tierForDisplay: SubscriptionTier | null = tierFromQuery
    /**
     * Todo lo que viaja al SERVER o al funnel: POST a `create-preference`, `checkout_started`,
     * `checkout_failed`, `checkout_confirmed` y el `tier` del `CheckoutPreview`. `null` ⇒ no hay
     * checkout que iniciar (ver `startCheckoutFromRegister`).
     */
    const tierForCheckout: SubscriptionTier | null = tierFromQuery
    const cycleFromUrl = (searchParams.get('cycle') ?? 'monthly') as BillingCycle
    // Add-ons del signup (plan 05 F5.5): CSV en el query → array en el body del POST.
    // Sin esta lectura el CSV moría en la URL. El botón Reintentar lo conserva gratis (reusa
    // startCheckoutFromRegister). create-preference re-valida (whitelist + coherencia D8).
    const addonsFromUrl = useMemo(() => {
        const raw = searchParams.get('addons')
        if (!raw) return [] as string[]
        return raw.split(',').map((s) => s.trim()).filter(Boolean)
    }, [searchParams])

    const tierLabel = tierForDisplay ? TIER_CONFIG[tierForDisplay]?.label ?? tierForDisplay : null
    const cycleLabel = BILLING_CYCLE_CONFIG[cycleFromUrl]?.label ?? cycleFromUrl

    // Dos fuentes de error conviven: `errorCopy` (fallo del checkout, con código y salidas) y
    // `error` (mensajes del confirm/poll, que ya eran humanos y no traen código). El render se
    // resuelve con una sola pareja título/mensaje para no duplicar ramas.
    const errorTitle = errorCopy?.title ?? (error ? 'Problema al procesar' : null)
    const errorMessage = errorCopy?.message ?? error
    const hasError = errorMessage != null

    // E1 (P8) — funnel de checkout en PostHog, gated por consentimiento (no-op sin opt-in).
    const captureCheckoutStarted = useCaptureCheckoutStarted()
    const captureCheckoutConfirmed = useCaptureCheckoutConfirmed()
    // Gemelo de checkout_started: sin esto un checkout que muere antes de la pasarela es
    // INDISTINGUIBLE en el embudo de uno que el coach abandono en MercadoPago.
    const captureCheckoutFailed = useCaptureCheckoutFailed()
    // El tramo que abrio P2: la card de confirmacion partio "pedir la preference" de "salir hacia
    // la pasarela". Sin este evento, el coach que ve la card y aprieta "Volver" se lee igual que el
    // que abandono adentro de MercadoPago.
    const captureCheckoutGatewayOpened = useCaptureCheckoutGatewayOpened()
    // Para checkout_confirmed SOLO va lo que la URL trae de verdad: la vuelta estandar de MP llega
    // sin tier/cycle y un fallback visual contaminaria el dato. Desde D2=A es exactamente
    // `tierForCheckout` (ya null cuando la URL no trae un tier del catálogo), asi que no hay una
    // tercera variable: el funnel y el money-path miran el MISMO valor.
    const cycleForFunnel = searchParams.get('cycle')
    // Una sola vez por aterrizaje: confirmNow y el poll comparten el mismo desenlace 'active'.
    const confirmedFiredRef = useRef(false)
    function fireCheckoutConfirmed(result: 'active' | 'scheduled') {
        if (confirmedFiredRef.current) return
        confirmedFiredRef.current = true
        captureCheckoutConfirmed({
            tier: tierForCheckout,
            billingCycle: cycleForFunnel,
            gateway: 'mercadopago',
            result,
        })
    }

    // P3 — ¿se puede pagar con Webpay (Flow) DESDE ACÁ? El backend acepta Flow para el ALTA
    // (registro y free→pago); lo que rechaza con 400 FLOW_PLAN_CHANGE_UNSUPPORTED es el cambio de
    // plan de un coach pago ACTIVO, que nunca aterriza en esta pantalla en modo ida. Con el flag
    // apagado el gate real sigue siendo server-side (create-preference rechaza gateway 'flow').
    const canPayWithFlow = FLOW_ENABLED && fromRegister && !preapprovalId

    /**
     * D2=A: la URL no dice qué plan se estaba contratando ⇒ no se inventa uno.
     *
     * No hay POST a `create-preference` NI eventos de funnel: un `checkout_started` con un tier
     * inventado ensucia el embudo más que su ausencia. La salida (elegir plan en `/pricing`) la
     * pinta el render, porque `checkout-errors.ts` es puro y no conoce rutas.
     */
    function failWithMissingTier() {
        setError(null)
        setCheckoutPreview(null)
        setRedirecting(false)
        setCanRetry(false)
        setStatusText('')
        setErrorCopy(
            resolveCheckoutError({
                code: CHECKOUT_TIER_MISSING,
                message: 'No pudimos saber qué plan estabas contratando.',
            })
        )
    }

    async function startCheckoutFromRegister(gateway: CheckoutGateway = 'mercadopago') {
        if (!tierForCheckout) {
            failWithMissingTier()
            return
        }
        setError(null)
        setErrorCopy(null)
        setCheckoutPreview(null)
        setRedirecting(false)
        setLastGateway(gateway)
        setCanRetry(false)
        setStatusText('Preparando tu suscripción...')
        // E1 (P8): el registro pago confirmo su plan y se va a pedir la preference. Aca tier/cycle
        // SI vienen en la URL (el register redirige con ambos), son lo que viaja al server.
        captureCheckoutStarted({
            tier: tierForCheckout,
            billingCycle: cycleFromUrl,
            gateway,
            source: 'register',
        })
        // Causa estable para checkout_failed. Se fija ANTES de cada throw porque el catch solo ve
        // el Error (el `code` del server viaja en el payload, no en el mensaje). 'unknown' = ni
        // siquiera hubo respuesta parseable (red caida / JSON roto).
        let failureCode = 'unknown'
        try {
            const response = await fetch('/api/payments/create-preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tier: tierForCheckout,
                    billingCycle: cycleFromUrl,
                    gateway,
                    ...(addonsFromUrl.length > 0 ? { addons: addonsFromUrl } : {}),
                }),
            })
            const raw = await response.text()
            const payload = raw ? JSON.parse(raw) : {}
            if (!response.ok) {
                failureCode = typeof payload.code === 'string' ? payload.code : `http_${response.status}`
                throw new Error(payload.error ?? 'No se pudo iniciar el checkout.')
            }
            if (!payload.checkoutUrl) {
                failureCode = 'missing_checkout_url'
                throw new Error('No se recibió URL de checkout.')
            }
            // Webpay/Flow: el coach ya eligió el medio DESDE la card de confirmación (ya vio plan y
            // monto), así que el enrolamiento arranca de inmediato. MercadoPago es el que pasa por
            // la card, porque es el medio al que se llega sin haberlo elegido.
            if (gateway === 'flow') {
                setStatusText('Redirigiendo a Webpay...')
                window.location.href = payload.checkoutUrl
                return
            }
            setStatusText('')
            setCheckoutPreview({
                checkoutUrl: payload.checkoutUrl,
                // Monto y plan SIEMPRE del server (compuesto neto: cupón y add-ons ya aplicados).
                amountClp:
                    typeof payload.amountClp === 'number' && payload.amountClp > 0
                        ? payload.amountClp
                        : null,
                tier:
                    typeof payload.tier === 'string' && payload.tier in TIER_CONFIG
                        ? (payload.tier as SubscriptionTier)
                        : tierForCheckout,
                billingCycle:
                    typeof payload.billingCycle === 'string' && payload.billingCycle in BILLING_CYCLE_CONFIG
                        ? (payload.billingCycle as BillingCycle)
                        : cycleFromUrl,
            })
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Error inesperado al iniciar checkout.'
            captureCheckoutFailed({
                tier: tierForCheckout,
                billingCycle: cycleFromUrl,
                gateway,
                source: 'register',
                code: failureCode,
                message,
            })
            // P1: el coach ve un mensaje humano y una salida, nunca el JSON crudo del gateway.
            // Webpay se ofrece como plan B solo si el backend lo soporta acá Y no es el que falló.
            setErrorCopy(
                resolveCheckoutError({
                    code: failureCode,
                    message,
                    flowAvailable: canPayWithFlow && gateway !== 'flow',
                })
            )
            setCanRetry(true)
        }
    }

    // Carga el preview del cupón (sin escribir). Si falla, NO bloquea: nota suave + checkout a precio lleno.
    async function loadCouponPreview() {
        try {
            const res = await fetch('/api/payments/redeem-coupon-signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: couponFromUrl, commit: false }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok || !data.preview) {
                // Código inválido/no-elegible → NO bloquea: checkout a precio lleno (silencioso).
                void startCheckoutFromRegister()
                return
            }
            setCouponPreview(data.preview)
            setCouponPhase('preview')
        } catch {
            void startCheckoutFromRegister()
        }
    }

    // Consentimiento SERNAC (R4.2): "Confirmar y pagar" = aplicar el cupón (commit) y RECIÉN ahí al checkout.
    async function confirmCouponAndCheckout() {
        setCouponPhase('applying')
        try {
            const res = await fetch('/api/payments/redeem-coupon-signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: couponFromUrl, commit: true }),
            })
            const data = await res.json().catch(() => ({}))
            // ya aplicado (reintento) = éxito
            if (!res.ok && data?.code !== 'ALREADY_HAS_COUPON' && data?.code !== 'ALREADY_REDEEMED') {
                setError(data?.error ?? 'No se pudo aplicar el código.')
                setCanRetry(true)
                setCouponPhase('idle')
                return
            }
        } catch {
            // commit falló por red: seguimos al checkout igual (el reconcile/cron ajusta el estado del cupón).
        }
        void startCheckoutFromRegister()
    }

    useEffect(() => {
        // Guard: free coaches are active without payment — redirect to dashboard
        if (rawTierParam === 'free') {
            router.replace('/coach/dashboard')
            return
        }
    }, [rawTierParam, router])

    useEffect(() => {
        if (rawTierParam === 'free') return
        let alive = true

        // Detiene cualquier poll en curso (cambio agendado al corte o activación inmediata).
        function stopPolling() {
            if (pollRef.current) {
                clearInterval(pollRef.current)
                pollRef.current = null
            }
        }

        // Cambio AGENDADO al corte: el confirm responde { scheduled: true } sin mutar al coach.
        // El tier vivo NO cambia hasta el corte, así que pollear hasta alcanzarlo dispararía un
        // timeout falso. Cortamos el poll y mostramos la confirmación con la fecha del corte.
        async function handleScheduled() {
            stopPolling()
            // E1 (P8): cambio agendado al corte — el confirm aterrizo visible sin activacion inmediata.
            fireCheckoutConfirmed('scheduled')
            const cutDate = await fetchCurrentPeriodEnd()
            if (!alive) return
            setScheduledCutDate(cutDate)
            setScheduled(true)
        }

        async function confirmNow() {
            try {
                const response = await fetch('/api/payments/confirm-subscription', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(preapprovalId ? { preapprovalId } : {}),
                })
                const raw = await response.text()
                const payload = raw ? JSON.parse(raw) : {}
                if (!alive) return
                if (!response.ok) {
                    throw new Error(payload.error ?? 'No se pudo validar el pago.')
                }
                if (payload.scheduled) {
                    await handleScheduled()
                    return
                }
                if (payload.subscriptionStatus === 'active') {
                    // E1 (P8): confirm visible — sendBeacon en el hook para sobrevivir al redirect.
                    fireCheckoutConfirmed('active')
                    window.location.href = '/coach/dashboard?subscription=active'
                }
            } catch (err) {
                if (alive) {
                    setError(err instanceof Error ? err.message : 'Error inesperado al validar el pago.')
                    setCanRetry(true)
                }
            }
        }

        if (fromRegister && !preapprovalId) {
            // D2=A: sin tier del catálogo no arranca NADA del alta (ni el preview del cupón, que
            // termina encadenando el checkout). El coach ve el error con la salida a /pricing.
            if (!tierForCheckout) {
                failWithMissingTier()
                return () => {
                    alive = false
                    if (pollRef.current) {
                        clearInterval(pollRef.current)
                        pollRef.current = null
                    }
                }
            }
            // Con código → disclosure SERNAC primero (preview→consent→commit→checkout). Sin código → checkout directo.
            if (couponFromUrl) {
                void loadCouponPreview()
            } else {
                void startCheckoutFromRegister()
            }
            return () => {
                alive = false
                if (pollRef.current) {
                    clearInterval(pollRef.current)
                    pollRef.current = null
                }
            }
        }

        void confirmNow()
        setStatusText('Esperando confirmación de tu pago...')
        pollStartRef.current = Date.now()

        // Poll RE-CALLS confirm-subscription (idempotent) every 5s — NOT subscription-status (the
        // coach ROW only advances via webhook, which the MP test sandbox never delivers). This makes
        // the base plan activate SYNCHRONOUSLY once MP authorizes the preapproval, mirroring the
        // add-on path — no webhook needed. 5s (not 3s) keeps it comfortably under any rate budget;
        // confirm-subscription is intentionally NOT rate-limited (its brute-force vector is closed by
        // the fail-closed ownership guard).
        pollRef.current = setInterval(async () => {
            // Timeout: if polling too long, stop and show error
            if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
                if (pollRef.current) {
                    clearInterval(pollRef.current)
                    pollRef.current = null
                }
                if (alive) {
                    try {
                        const response = await fetch('/api/payments/subscription-status')
                        const raw = await response.text()
                        const payload = raw ? JSON.parse(raw) : {}
                        const currentStatus = payload?.coach?.subscription_status
                        if (currentStatus === 'pending_payment') {
                            setError(
                                'Hubo un problema al confirmar tu pago. Vuelve a intentarlo desde reactivación o contacta soporte si el cargo aparece en Mercado Pago.'
                            )
                        } else {
                            setError(
                                'El pago está tardando más de lo esperado. Si ya completaste el pago, haz clic en "Verificar acceso".'
                            )
                        }
                    } catch {
                        setError(
                            'El pago está tardando más de lo esperado. Si ya completaste el pago, haz clic en "Verificar acceso".'
                        )
                    }
                    setCanRetry(true)
                }
                return
            }

            try {
                const response = await fetch('/api/payments/confirm-subscription', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(preapprovalId ? { preapprovalId } : {}),
                })
                const raw = await response.text()
                const payload = raw ? JSON.parse(raw) : {}
                if (!alive || !response.ok) return

                if (payload.scheduled) {
                    await handleScheduled()
                    return
                }

                if (payload.subscriptionStatus === 'active') {
                    stopPolling()
                    // E1 (P8): confirm visible via poll — mismo evento, una sola vez (ref guard).
                    fireCheckoutConfirmed('active')
                    window.location.href = '/coach/dashboard?subscription=active'
                }
            } catch {
                // Keep polling — transient network error
            }
        }, 5000)

        return () => {
            alive = false
            if (pollRef.current) {
                clearInterval(pollRef.current)
                pollRef.current = null
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cycleFromUrl, fromRegister, preapprovalId, tierForCheckout])

    // Cambio agendado al corte: estado de confirmación dedicado (sin spinner ni timeout falso).
    if (scheduled) {
        const cutLabel = scheduledCutDate
            ? new Date(scheduledCutDate).toLocaleDateString('es-CL', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            })
            : null
        return (
            <main className="flex min-h-dvh items-center justify-center px-4 py-12 pt-safe pb-safe bg-background">
                <div className="w-full max-w-md rounded-card border border-subtle bg-surface-card p-8 text-center shadow-xl">
                    <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--success-100)] text-2xl text-[var(--success-600)]">
                        ✓
                    </div>

                    {tierForDisplay && (
                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sport-500/30 bg-sport-100 px-3 py-1 text-xs font-semibold text-sport-600">
                            {tierLabel} · {cycleLabel}
                        </div>
                    )}

                    <div role="status" aria-live="polite">
                        <h1 className="font-display text-xl font-bold tracking-tight text-strong">Cambio agendado</h1>
                        <p className="mt-2 text-sm text-muted">
                            {cutLabel
                                ? `Tu cambio se aplicará el ${cutLabel}.`
                                : 'Tu cambio se aplicará al final de tu ciclo actual.'}
                        </p>
                        <p className="mt-3 text-xs text-muted">
                            Conservas tu plan actual hasta esa fecha. No necesitas hacer nada más.
                        </p>
                    </div>

                    <div className="mt-6 flex flex-col gap-3">
                        <Link
                            href="/coach/subscription"
                            className="inline-flex h-11 items-center justify-center rounded-control bg-sport-500 px-6 text-sm font-semibold text-white transition-colors hover:bg-sport-600"
                        >
                            Volver a mi suscripción
                        </Link>
                    </div>
                </div>
            </main>
        )
    }

    // REGISTER-CODE: disclosure SERNAC del descuento, server-priced, ANTES del primer cobro (R4.2).
    // `!checkoutPreview`: el commit del cupón deja couponPhase en 'applying' y encadena el checkout;
    // sin este guard la card de confirmación (P2) quedaría tapada por el disclosure ya cumplido.
    if (
        (couponPhase === 'preview' || couponPhase === 'applying') &&
        couponPreview &&
        !checkoutPreview &&
        !error &&
        !errorCopy
    ) {
        const clp = (n: number) => `$${n.toLocaleString('es-CL')}`
        return (
            <main className="flex min-h-dvh items-center justify-center px-4 py-12 pt-safe pb-safe bg-background">
                <div className="w-full max-w-md rounded-card border border-subtle bg-surface-card p-8 shadow-xl">
                    <h1 className="font-display text-xl font-bold tracking-tight text-strong">Confirma tu descuento</h1>
                    <p className="mt-2 text-sm text-muted">{couponPreview.termsText}</p>
                    <div className="mt-4 rounded-control border border-subtle bg-surface-sunken p-4 text-sm">
                        <div className="flex justify-between text-muted">
                            <span>Precio normal</span>
                            <span className="line-through">{clp(couponPreview.baseBeforeDiscountClp)}</span>
                        </div>
                        <div className="flex justify-between text-[var(--success-600)]">
                            <span>Descuento ({couponPreview.durationLabel})</span>
                            <span>−{clp(couponPreview.discountClp)}</span>
                        </div>
                        <div className="mt-1 flex justify-between border-t border-default pt-1 font-semibold text-strong">
                            <span>Pagas</span>
                            <span>{clp(couponPreview.totalClp)}</span>
                        </div>
                    </div>
                    <div className="mt-6 flex flex-col gap-3">
                        <button
                            type="button"
                            onClick={() => void confirmCouponAndCheckout()}
                            disabled={couponPhase === 'applying'}
                            className="inline-flex h-11 items-center justify-center rounded-control bg-sport-500 px-6 text-sm font-semibold text-white transition-colors hover:bg-sport-600 disabled:opacity-60"
                        >
                            {couponPhase === 'applying' ? 'Aplicando…' : 'Confirmar y pagar con descuento'}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setCouponPhase('idle')
                                setCouponPreview(null)
                                void startCheckoutFromRegister()
                            }}
                            className="inline-flex h-11 items-center justify-center rounded-control border border-default px-6 text-sm font-semibold text-strong hover:bg-surface-sunken"
                        >
                            Continuar sin código
                        </button>
                    </div>
                </div>
            </main>
        )
    }

    // ── P2: paso previo a MercadoPago ────────────────────────────────────────────────────────────
    // El checkout ya está creado en el gateway (por eso hubo spinner), pero el salto lo aprieta el
    // coach: primero ve QUÉ plan, CUÁNTO se cobra, POR DÓNDE se cobra y que puede volverse sin
    // perder nada. Plan y monto salen de la respuesta del server — cero precios en el cliente.
    if (checkoutPreview && !error && !errorCopy) {
        const previewTierLabel = TIER_CONFIG[checkoutPreview.tier]?.label ?? checkoutPreview.tier
        const previewCycleLabel =
            BILLING_CYCLE_CONFIG[checkoutPreview.billingCycle]?.label ?? checkoutPreview.billingCycle
        return (
            <main className="flex min-h-dvh items-center justify-center px-4 py-12 pt-safe pb-safe bg-background">
                <div className="w-full max-w-md rounded-card border border-subtle bg-surface-card p-8 shadow-xl">
                    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sport-500/30 bg-sport-100 px-3 py-1 text-xs font-semibold text-sport-600">
                        {previewTierLabel} · {previewCycleLabel}
                    </div>
                    <h1 className="font-display text-xl font-bold tracking-tight text-strong">
                        Confirma tu suscripción
                    </h1>

                    <div className="mt-4 flex items-baseline justify-between gap-3 rounded-control border border-subtle bg-surface-sunken p-4">
                        <span className="min-w-0 text-sm font-semibold text-strong">Plan {previewTierLabel}</span>
                        {checkoutPreview.amountClp != null ? (
                            <span className="shrink-0 text-right">
                                <span className="eva-metric text-[22px] text-strong">
                                    ${checkoutPreview.amountClp.toLocaleString('es-CL')}
                                </span>
                                <span className="text-[11px] text-muted">
                                    {' '}
                                    {BILLING_CYCLE_PRICE_SUFFIX[checkoutPreview.billingCycle]}
                                </span>
                            </span>
                        ) : null}
                    </div>

                    <p className="mt-3 text-sm text-muted">
                        Se cobra por MercadoPago — puedes cancelar cuando quieras.
                    </p>
                    {/* TODO(owner): garantía de 30 días visible acá (C5 del informe de checkout 25-08).
                        Pendiente de confirmación del owner: no se promete hasta que exista la decisión. */}

                    <div className="mt-6 flex flex-col gap-3">
                        <button
                            type="button"
                            disabled={redirecting}
                            onClick={() => {
                                // Tier/ciclo del SERVER (los de la card), no los de la URL: es lo
                                // que el coach acaba de ver y lo que se va a cobrar.
                                captureCheckoutGatewayOpened({
                                    tier: checkoutPreview.tier,
                                    billingCycle: checkoutPreview.billingCycle,
                                    gateway: 'mercadopago',
                                    source: 'register',
                                })
                                setRedirecting(true)
                                window.location.href = checkoutPreview.checkoutUrl
                            }}
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-control bg-sport-500 px-6 text-sm font-semibold text-white transition-colors hover:bg-sport-600 disabled:opacity-60 disabled:hover:bg-sport-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        >
                            <Image src="/payments/mercadopago.svg" alt="" aria-hidden="true" width={18} height={18} />
                            <span>{redirecting ? 'Redirigiendo…' : 'Continuar a MercadoPago'}</span>
                        </button>

                        {/* P3: el otro medio real. Solo se ofrece donde el backend lo soporta (alta). */}
                        {canPayWithFlow && (
                            <button
                                type="button"
                                disabled={redirecting}
                                onClick={() => {
                                    // Webpay tambien SALE de esta card: el enrolamiento de Flow
                                    // redirige apenas responde el server, asi que el evento del
                                    // tramo se emite en el click igual que el de MercadoPago.
                                    captureCheckoutGatewayOpened({
                                        tier: checkoutPreview.tier,
                                        billingCycle: checkoutPreview.billingCycle,
                                        gateway: 'flow',
                                        source: 'register',
                                    })
                                    void startCheckoutFromRegister('flow')
                                }}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-control border border-default px-6 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                            >
                                <Image
                                    src="/payments/webpay-light.svg"
                                    alt=""
                                    aria-hidden="true"
                                    width={73}
                                    height={18}
                                    className="dark:hidden"
                                />
                                <Image
                                    src="/payments/webpay-dark.svg"
                                    alt=""
                                    aria-hidden="true"
                                    width={73}
                                    height={18}
                                    className="hidden dark:block"
                                />
                                <span>Pagar con Webpay</span>
                            </button>
                        )}

                        {/* Verdadero desde la ola 25-08: el alta pago ya NO nace bloqueada en
                            pending_payment, así que volverse deja la cuenta usable (A1). */}
                        <Link
                            href="/coach/dashboard"
                            className="inline-flex h-11 items-center justify-center rounded-control px-6 text-sm font-semibold text-muted transition-colors hover:text-strong"
                        >
                            Volver — tu cuenta queda activa igual
                        </Link>
                    </div>
                </div>
            </main>
        )
    }

    return (
        <main className="flex min-h-dvh items-center justify-center px-4 py-12 pt-safe pb-safe bg-background">
            <div className="w-full max-w-md rounded-card border border-subtle bg-surface-card p-8 text-center shadow-xl">
                {!hasError && (
                    <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-[3px] border-sport-500 border-t-transparent" />
                )}

                {/* Plan info */}
                {tierForDisplay && (
                    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sport-500/30 bg-sport-100 px-3 py-1 text-xs font-semibold text-sport-600">
                        {tierLabel} · {cycleLabel}
                    </div>
                )}

                <div role="status" aria-live="polite">
                    <h1 className="font-display text-xl font-bold tracking-tight text-strong">
                        {hasError ? errorTitle : 'Procesando tu suscripción'}
                    </h1>
                    <p className="mt-2 text-sm text-muted">
                        {hasError ? errorMessage : statusText}
                    </p>

                    {errorCopy?.hint ? (
                        <p className="mt-2 text-xs text-muted">{errorCopy.hint}</p>
                    ) : null}

                    {!hasError && (
                        <p className="mt-3 text-xs text-muted">
                            Te redirigiremos automáticamente cuando tu suscripción esté activa.
                        </p>
                    )}
                </div>

                <div className="mt-6 flex flex-col gap-3">
                    {/* D2=A: la URL no traía plan. `checkout-errors.ts` es puro y no conoce rutas
                        (no se le agrega un `kind` nuevo), así que la salida la pinta la PÁGINA:
                        elegir plan es lo único que destraba este caso — reintentar lo mismo no. */}
                    {errorCopy?.code === CHECKOUT_TIER_MISSING ? (
                        <Link
                            href="/pricing"
                            className="inline-flex h-11 items-center justify-center rounded-control bg-sport-500 px-6 text-sm font-semibold text-white transition-colors hover:bg-sport-600"
                        >
                            Elegir mi plan
                        </Link>
                    ) : null}
                    {/* P1: las salidas las decide el copy del error (reintentar el MISMO medio /
                        probar Webpay / escribirnos), no la pantalla. */}
                    {errorCopy ? (
                        errorCopy.actions.map((action, i) =>
                            action.kind === 'contact' ? (
                                <a
                                    key={action.kind}
                                    href={action.href}
                                    className={
                                        i === 0
                                            ? 'inline-flex h-11 items-center justify-center rounded-control bg-sport-500 px-6 text-sm font-semibold text-white transition-colors hover:bg-sport-600'
                                            : 'inline-flex h-11 items-center justify-center rounded-control border border-default px-6 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken'
                                    }
                                >
                                    {action.label}
                                </a>
                            ) : (
                                <button
                                    key={action.kind}
                                    type="button"
                                    onClick={() =>
                                        void startCheckoutFromRegister(
                                            action.kind === 'try_flow' ? 'flow' : lastGateway
                                        )
                                    }
                                    className={
                                        i === 0
                                            ? 'inline-flex h-11 items-center justify-center rounded-control bg-sport-500 px-6 text-sm font-semibold text-white transition-colors hover:bg-sport-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
                                            : 'inline-flex h-11 items-center justify-center rounded-control border border-default px-6 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
                                    }
                                >
                                    {action.label}
                                </button>
                            )
                        )
                    ) : canRetry && fromRegister && !preapprovalId ? (
                        <button
                            type="button"
                            onClick={() => void startCheckoutFromRegister()}
                            className="inline-flex h-11 items-center justify-center rounded-control bg-sport-500 px-6 text-sm font-semibold text-white transition-colors hover:bg-sport-600"
                        >
                            Reintentar
                        </button>
                    ) : canRetry ? (
                        <Link
                            href="/coach/reactivate"
                            className="inline-flex h-11 items-center justify-center rounded-control bg-sport-500 px-6 text-sm font-semibold text-white transition-colors hover:bg-sport-600"
                        >
                            Ir a reactivación
                        </Link>
                    ) : null}

                    <Link
                        href="/coach/reactivate"
                        className="inline-flex h-11 items-center justify-center rounded-control border border-default px-6 text-sm font-semibold text-strong hover:bg-surface-sunken transition-colors"
                    >
                        Ir a reactivación
                    </Link>
                </div>
            </div>
        </main>
    )
}
