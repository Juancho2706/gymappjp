'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BILLING_CYCLE_CONFIG, TIER_CONFIG, type BillingCycle, type SubscriptionTier } from '@/lib/constants'

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
    const [canRetry, setCanRetry] = useState(false)
    // Cambio agendado al corte (downgrade / cambio de ciclo): confirm-subscription responde
    // { scheduled: true } sin mutar al coach (el tier vivo NO cambia hasta el corte). En ese caso
    // dejamos de pollear y mostramos un estado de confirmación claro con la fecha del corte.
    const [scheduledCutDate, setScheduledCutDate] = useState<string | null>(null)
    const [scheduled, setScheduled] = useState(false)
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const pollStartRef = useRef<number>(0)

    const preapprovalId = useMemo(
        () => extractPreapprovalId(searchParams.get('subscription') ?? '', searchParams),
        [searchParams]
    )
    const fromRegister = searchParams.get('from') === 'register'
    const rawTierParam = searchParams.get('tier')
    const normalizedTierParam = rawTierParam === 'starter_lite' ? 'starter'
        : rawTierParam === 'free' ? null  // free coaches don't use this page
        : rawTierParam
    // LEGACY: `in TIER_CONFIG` valida contra TODAS las entradas (incluidas growth/scale, ya
    // fuera de venta). Se queda intencionalmente: esta pantalla solo muestra el label de lo que
    // se está pagando; un coach grandfathered con un cargo legacy en vuelo debe ver su tier real,
    // no un fallback a 'starter'. No es una superficie de venta.
    const tierFromUrl = (
        normalizedTierParam && normalizedTierParam in TIER_CONFIG ? normalizedTierParam : 'starter'
    ) as SubscriptionTier
    const cycleFromUrl = (searchParams.get('cycle') ?? 'monthly') as BillingCycle
    // Add-ons del signup (plan 05 F5.5): CSV en el query → array en el body del POST.
    // Sin esta lectura el CSV moría en la URL. El botón Reintentar lo conserva gratis (reusa
    // startCheckoutFromRegister). create-preference re-valida (whitelist + coherencia D8).
    const addonsFromUrl = useMemo(() => {
        const raw = searchParams.get('addons')
        if (!raw) return [] as string[]
        return raw.split(',').map((s) => s.trim()).filter(Boolean)
    }, [searchParams])

    const tierLabel = TIER_CONFIG[tierFromUrl]?.label ?? tierFromUrl
    const cycleLabel = BILLING_CYCLE_CONFIG[cycleFromUrl]?.label ?? cycleFromUrl

    async function startCheckoutFromRegister() {
        setError(null)
        setCanRetry(false)
        setStatusText('Preparando tu suscripción...')
        try {
            const response = await fetch('/api/payments/create-preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tier: tierFromUrl,
                    billingCycle: cycleFromUrl,
                    ...(addonsFromUrl.length > 0 ? { addons: addonsFromUrl } : {}),
                }),
            })
            const raw = await response.text()
            const payload = raw ? JSON.parse(raw) : {}
            if (!response.ok) {
                throw new Error(payload.error ?? 'No se pudo iniciar el checkout.')
            }
            if (!payload.checkoutUrl) {
                throw new Error('No se recibió URL de checkout.')
            }
            setStatusText('Redirigiendo a MercadoPago...')
            window.location.href = payload.checkoutUrl
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error inesperado al iniciar checkout.')
            setCanRetry(true)
        }
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
            void startCheckoutFromRegister()
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
    }, [cycleFromUrl, fromRegister, preapprovalId, tierFromUrl])

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
                <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
                    <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-2xl text-primary">
                        ✓
                    </div>

                    {(tierFromUrl || cycleFromUrl) && (
                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                            {tierLabel} · {cycleLabel}
                        </div>
                    )}

                    <div role="status" aria-live="polite">
                        <h1 className="text-xl font-bold text-foreground">Cambio agendado</h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {cutLabel
                                ? `Tu cambio se aplicará el ${cutLabel}.`
                                : 'Tu cambio se aplicará al final de tu ciclo actual.'}
                        </p>
                        <p className="mt-3 text-xs text-muted-foreground">
                            Conservas tu plan actual hasta esa fecha. No necesitas hacer nada más.
                        </p>
                    </div>

                    <div className="mt-6 flex flex-col gap-3">
                        <Link
                            href="/coach/subscription"
                            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                            Volver a mi suscripción
                        </Link>
                    </div>
                </div>
            </main>
        )
    }

    return (
        <main className="flex min-h-dvh items-center justify-center px-4 py-12 pt-safe pb-safe bg-background">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
                {!error && (
                    <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
                )}

                {/* Plan info */}
                {(tierFromUrl || cycleFromUrl) && (
                    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        {tierLabel} · {cycleLabel}
                    </div>
                )}

                <div role="status" aria-live="polite">
                    <h1 className="text-xl font-bold text-foreground">
                        {error ? 'Problema al procesar' : 'Procesando tu suscripción'}
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {error ?? statusText}
                    </p>

                    {!error && (
                        <p className="mt-3 text-xs text-muted-foreground">
                            Te redirigiremos automáticamente cuando tu suscripción esté activa.
                        </p>
                    )}
                </div>

                <div className="mt-6 flex flex-col gap-3">
                    {canRetry && fromRegister && !preapprovalId ? (
                        <button
                            type="button"
                            onClick={() => void startCheckoutFromRegister()}
                            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                            Reintentar
                        </button>
                    ) : canRetry ? (
                        <Link
                            href="/coach/reactivate"
                            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                            Ir a reactivación
                        </Link>
                    ) : null}

                    <Link
                        href="/coach/reactivate"
                        className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-6 text-sm font-semibold text-foreground hover:bg-secondary/40 transition-colors"
                    >
                        Ir a reactivación
                    </Link>
                </div>
            </div>
        </main>
    )
}
