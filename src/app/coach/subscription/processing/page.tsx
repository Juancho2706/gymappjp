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

export default function SubscriptionProcessingPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [statusText, setStatusText] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [canRetry, setCanRetry] = useState(false)
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const pollStartRef = useRef<number>(0)

    const preapprovalId = useMemo(
        () => extractPreapprovalId(searchParams.get('subscription') ?? '', searchParams),
        [searchParams]
    )
    const fromRegister = searchParams.get('from') === 'register'
    const rawTierParam = searchParams.get('tier')
    const normalizedTierParam = rawTierParam === 'starter_lite' ? 'starter' : rawTierParam
    const tierFromUrl = (
        normalizedTierParam && normalizedTierParam in TIER_CONFIG ? normalizedTierParam : 'starter'
    ) as SubscriptionTier
    const cycleFromUrl = (searchParams.get('cycle') ?? 'monthly') as BillingCycle

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
        let alive = true

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
                const response = await fetch('/api/payments/subscription-status')
                const raw = await response.text()
                const payload = raw ? JSON.parse(raw) : {}
                if (!alive || !response.ok) return

                const currentStatus = payload?.coach?.subscription_status
                if (currentStatus === 'active') {
                    if (pollRef.current) {
                        clearInterval(pollRef.current)
                        pollRef.current = null
                    }
                    window.location.href = '/coach/dashboard?subscription=active'
                }
            } catch {
                // Keep polling — transient network error
            }
        }, 3000)

        return () => {
            alive = false
            if (pollRef.current) {
                clearInterval(pollRef.current)
                pollRef.current = null
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cycleFromUrl, fromRegister, preapprovalId, tierFromUrl])

    return (
        <main className="flex min-h-dvh items-center justify-center px-4 py-12 bg-background">
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

                <h1 className="text-xl font-bold text-foreground">
                    {error ? 'Problema al procesar' : 'Procesando tu suscripción'}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    {error ?? statusText}
                </p>

                {!error && (
                    <p className="mt-3 text-xs text-muted-foreground/60">
                        Te redirigiremos automáticamente cuando tu suscripción esté activa.
                    </p>
                )}

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
