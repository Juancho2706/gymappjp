'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

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
    const [statusText, setStatusText] = useState('Validando pago con MercadoPago...')
    const [error, setError] = useState<string | null>(null)
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const preapprovalId = useMemo(
        () => extractPreapprovalId(searchParams.get('subscription') ?? '', searchParams),
        [searchParams]
    )

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
                    router.replace('/coach/dashboard?subscription=active')
                    return
                }
            } catch (err) {
                if (alive) {
                    setError(err instanceof Error ? err.message : 'Error inesperado al validar el pago.')
                }
            }
        }

        void confirmNow()
        setStatusText('Esperando confirmación de suscripción...')

        pollRef.current = setInterval(async () => {
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
                    router.replace('/coach/dashboard?subscription=active')
                }
            } catch {
                // Keep polling.
            }
        }, 3000)

        return () => {
            alive = false
            if (pollRef.current) {
                clearInterval(pollRef.current)
                pollRef.current = null
            }
        }
    }, [preapprovalId, router])

    return (
        <main className="mx-auto max-w-2xl px-4 py-12">
            <div className="rounded-2xl border border-border bg-card p-8 text-center">
                <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <h1 className="text-2xl font-bold text-foreground">Validando tu pago</h1>
                <p className="mt-3 text-sm text-muted-foreground">
                    {statusText} Te redirigiremos automáticamente al dashboard cuando tu suscripción esté activa.
                </p>

                {error ? (
                    <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                        {error}
                    </p>
                ) : null}

                <button
                    type="button"
                    onClick={() => router.replace('/coach/reactivate')}
                    className="mt-6 inline-flex h-11 items-center justify-center rounded-xl border border-border px-6 text-sm font-semibold text-foreground hover:bg-secondary/40"
                >
                    Volver a reactivación
                </button>
            </div>
        </main>
    )
}
