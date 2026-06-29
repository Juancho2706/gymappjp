'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

const POLL_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutos
const SUCCESS_URL = '/coach/subscription?addon=success'

/** Lee el id del pago del back_url de MP (`payment_id`, fallback `collection_id`). */
function extractPaymentId(searchParams: URLSearchParams): string | undefined {
    return searchParams.get('payment_id') ?? searchParams.get('collection_id') ?? undefined
}

/** Conjunto de módulos vivos del coach (para detectar cuándo materializa el nuevo add-on). */
async function fetchLiveModuleKeys(): Promise<Set<string> | null> {
    try {
        const response = await fetch('/api/payments/subscription-status')
        const raw = await response.text()
        const payload = raw ? JSON.parse(raw) : {}
        if (!response.ok) return null
        const addons = Array.isArray(payload?.addons) ? payload.addons : []
        return new Set(addons.map((a: { moduleKey?: string }) => a.moduleKey).filter(Boolean))
    } catch {
        return null
    }
}

export default function AddonProcessingPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [statusText, setStatusText] = useState('Esperando confirmación de tu pago...')
    const [error, setError] = useState<string | null>(null)
    const [canRetry, setCanRetry] = useState(false)
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const pollStartRef = useRef<number>(0)
    // Baseline de módulos vivos al montar: si el set crece, el nuevo add-on ya materializó
    // (por este camino síncrono o por el webhook backstop) → redirigir.
    const baselineRef = useRef<Set<string> | null>(null)

    const paymentId = useMemo(() => extractPaymentId(searchParams), [searchParams])

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
                baselineRef.current = (await fetchLiveModuleKeys()) ?? new Set()
                return
            }
            try {
                const response = await fetch('/api/payments/confirm-addon', {
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
                // Pendiente: el webhook materializará. Fijamos baseline y dejamos que el poll detecte.
                setStatusText('Tu pago está siendo procesado. Esto puede tardar unos instantes...')
                baselineRef.current = (await fetchLiveModuleKeys()) ?? new Set()
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
                        'El pago está tardando más de lo esperado. Si ya completaste el pago, vuelve a tu suscripción para verificar el módulo.'
                    )
                    setCanRetry(true)
                }
                return
            }

            const live = await fetchLiveModuleKeys()
            if (!alive || !live) return
            const baseline = baselineRef.current
            // El módulo materializó si el set creció respecto al baseline (o si aún no hay baseline
            // pero ya hay al menos un add-on vivo y el confirm síncrono no había corrido).
            const grew = baseline ? live.size > baseline.size : live.size > 0
            if (grew) {
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
                    <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
                )}

                <div role="status" aria-live="polite">
                    <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
                        {error ? 'Problema al procesar' : 'Activando tu módulo'}
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">{error ?? statusText}</p>

                    {!error && (
                        <p className="mt-3 text-xs text-muted-foreground">
                            Te llevaremos de vuelta a tu suscripción cuando el módulo esté activo.
                        </p>
                    )}
                </div>

                {canRetry && (
                    <div className="mt-6 flex flex-col gap-3">
                        <Link
                            href="/coach/subscription"
                            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                            Volver a mi suscripción
                        </Link>
                    </div>
                )}
            </div>
        </main>
    )
}
