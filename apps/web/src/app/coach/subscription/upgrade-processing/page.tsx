'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

const POLL_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutos
const SUCCESS_URL = '/coach/subscription?upgrade=success'

/** Lee el id del pago del back_url de MP (`payment_id`, fallback `collection_id`). */
function extractPaymentId(searchParams: URLSearchParams): string | undefined {
    return searchParams.get('payment_id') ?? searchParams.get('collection_id') ?? undefined
}

/** Tier vigente del coach (para detectar cuándo el upgrade activa el nuevo tier). */
async function fetchCurrentTier(): Promise<string | null> {
    try {
        const response = await fetch('/api/payments/subscription-status')
        const raw = await response.text()
        const payload = raw ? JSON.parse(raw) : {}
        if (!response.ok) return null
        const tier = payload?.coach?.subscription_tier
        return typeof tier === 'string' ? tier : null
    } catch {
        return null
    }
}

export default function UpgradeProcessingPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [statusText, setStatusText] = useState('Esperando confirmación de tu pago...')
    const [error, setError] = useState<string | null>(null)
    const [canRetry, setCanRetry] = useState(false)
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const pollStartRef = useRef<number>(0)
    // Baseline del tier vigente al montar: cuando el tier cambia respecto al baseline (o alcanza
    // el tier objetivo pasado por query), el upgrade ya activó (este camino síncrono o el webhook).
    const baselineRef = useRef<string | null>(null)

    const paymentId = useMemo(() => extractPaymentId(searchParams), [searchParams])
    // Tier objetivo opcional (la página de suscripción lo agrega al success_url para un match exacto).
    const targetTier = useMemo(() => searchParams.get('tier') ?? null, [searchParams])

    useEffect(() => {
        let alive = true

        function stopPolling() {
            if (pollRef.current) {
                clearInterval(pollRef.current)
                pollRef.current = null
            }
        }

        async function confirmNow() {
            if (!paymentId) {
                // Sin id no podemos confirmar de forma síncrona; caemos al poll (webhook backstop).
                baselineRef.current = await fetchCurrentTier()
                return
            }
            try {
                const response = await fetch('/api/payments/confirm-upgrade', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ paymentId }),
                })
                const raw = await response.text()
                const payload = raw ? JSON.parse(raw) : {}
                if (!alive) return
                if (!response.ok) {
                    throw new Error(payload.error ?? 'No se pudo confirmar el pago.')
                }
                if (payload.status === 'active') {
                    stopPolling()
                    router.replace(SUCCESS_URL)
                    return
                }
                // Pendiente: el webhook activará. Fijamos baseline y dejamos que el poll detecte.
                setStatusText('Tu pago está siendo procesado. Esto puede tardar unos instantes...')
                baselineRef.current = await fetchCurrentTier()
            } catch (err) {
                if (alive) {
                    setError(err instanceof Error ? err.message : 'Error inesperado al confirmar el pago.')
                    setCanRetry(true)
                }
            }
        }

        void confirmNow()
        pollStartRef.current = Date.now()

        pollRef.current = setInterval(async () => {
            if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
                stopPolling()
                if (alive) {
                    setError(
                        'El pago está tardando más de lo esperado. Si ya completaste el pago, vuelve a tu suscripción para verificar tu plan.'
                    )
                    setCanRetry(true)
                }
                return
            }

            const tier = await fetchCurrentTier()
            if (!alive || tier === null) return
            const baseline = baselineRef.current
            // El upgrade activó si el tier alcanzó el objetivo (si se pasó por query) o cambió
            // respecto al baseline tomado al montar.
            const activated = targetTier ? tier === targetTier : baseline !== null && tier !== baseline
            if (activated) {
                stopPolling()
                router.replace(SUCCESS_URL)
            }
        }, 3000)

        return () => {
            alive = false
            stopPolling()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paymentId])

    return (
        <main className="flex min-h-dvh items-center justify-center px-4 py-12 pt-safe pb-safe bg-background">
            <div className="w-full max-w-md rounded-card border border-subtle bg-surface-card p-8 text-center shadow-xl">
                {!error && (
                    <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-[3px] border-sport-500 border-t-transparent" />
                )}

                <div role="status" aria-live="polite">
                    <h1 className="font-display text-xl font-bold tracking-tight text-strong">
                        {error ? 'Problema al procesar' : 'Activando tu nuevo plan'}
                    </h1>
                    <p className="mt-2 text-sm text-muted">{error ?? statusText}</p>

                    {!error && (
                        <p className="mt-3 text-xs text-muted">
                            Te llevaremos de vuelta a tu suscripción cuando tu nuevo plan esté activo.
                        </p>
                    )}
                </div>

                {canRetry && (
                    <div className="mt-6 flex flex-col gap-3">
                        <Link
                            href="/coach/subscription"
                            className="inline-flex h-11 items-center justify-center rounded-control bg-sport-500 px-6 text-sm font-semibold text-white transition-colors hover:bg-sport-600"
                        >
                            Volver a mi suscripción
                        </Link>
                    </div>
                )}
            </div>
        </main>
    )
}
