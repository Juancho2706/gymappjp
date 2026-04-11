'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
    BILLING_CYCLE_CONFIG,
    getTierPriceClp,
    TIER_CONFIG,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'

const tierOptions = Object.entries(TIER_CONFIG) as [SubscriptionTier, (typeof TIER_CONFIG)[SubscriptionTier]][]
const cycleOptions = Object.entries(BILLING_CYCLE_CONFIG) as [BillingCycle, (typeof BILLING_CYCLE_CONFIG)[BillingCycle]][]

export default function ReactivatePage() {
    const searchParams = useSearchParams()
    const [tier, setTier] = useState<SubscriptionTier>(() => {
        const queryTier = searchParams.get('tier')
        if (queryTier && queryTier in TIER_CONFIG) return queryTier as SubscriptionTier
        return 'starter'
    })
    const [billingCycle, setBillingCycle] = useState<BillingCycle>(() => {
        const queryCycle = searchParams.get('cycle')
        if (queryCycle && queryCycle in BILLING_CYCLE_CONFIG) return queryCycle as BillingCycle
        return 'monthly'
    })
    const [isLoading, setIsLoading] = useState(false)
    const [isConfirming, setIsConfirming] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const hasAutoCheckedRef = useRef(false)
    const hasAutoStartedCheckoutRef = useRef(false)
    const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const selectedTier = useMemo(() => TIER_CONFIG[tier], [tier])
    const selectedPrice = useMemo(() => getTierPriceClp(tier, billingCycle), [tier, billingCycle])
    const monthlyBase = useMemo(() => TIER_CONFIG[tier].monthlyPriceClp, [tier])
    const paymentStatus = searchParams.get('payment')
    const rawSubscriptionParam = searchParams.get('subscription') ?? ''
    const decodedSubscriptionParam = (() => {
        try {
            return decodeURIComponent(rawSubscriptionParam)
        } catch {
            return rawSubscriptionParam
        }
    })()
    const fromSuccessfulCheckout =
        rawSubscriptionParam === 'success' ||
        decodedSubscriptionParam === 'success' ||
        rawSubscriptionParam.startsWith('success%3F') ||
        decodedSubscriptionParam.startsWith('success?')

    const preapprovalIdFromUrl = (() => {
        const direct = searchParams.get('preapproval_id')
        if (direct) return direct

        // MercadoPago can sometimes return `subscription=success?preapproval_id=...`
        const nestedIndex = decodedSubscriptionParam.indexOf('preapproval_id=')
        if (nestedIndex === -1) return undefined

        const nested = decodedSubscriptionParam.slice(nestedIndex + 'preapproval_id='.length)
        const ampIndex = nested.indexOf('&')
        return ampIndex === -1 ? nested : nested.slice(0, ampIndex)
    })()

    const confirmSubscription = useCallback(async (preapprovalId?: string, silent = false) => {
        setIsConfirming(true)
        if (!silent) setError(null)
        try {
            const response = await fetch('/api/payments/confirm-subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(preapprovalId ? { preapprovalId } : {}),
            })
            const raw = await response.text()
            const payload = raw ? JSON.parse(raw) : {}
            if (!response.ok) throw new Error(payload.error ?? 'No se pudo confirmar la suscripción.')

            if (payload.subscriptionStatus === 'active') {
                if (pollingIntervalRef.current) {
                    clearInterval(pollingIntervalRef.current)
                    pollingIntervalRef.current = null
                }
                window.location.href = '/coach/dashboard?subscription=active'
                return
            }

            if (!silent) {
                setError('Tu pago fue creado, pero la suscripción aún aparece pendiente. Reintenta en unos segundos.')
            }
        } catch (err) {
            if (!silent) {
                setError(err instanceof Error ? err.message : 'Error inesperado')
            }
        } finally {
            setIsConfirming(false)
        }
    }, [])

    useEffect(() => {
        if (!fromSuccessfulCheckout || hasAutoCheckedRef.current) return
        hasAutoCheckedRef.current = true

        void confirmSubscription(preapprovalIdFromUrl, true)

        pollingIntervalRef.current = setInterval(async () => {
            try {
                const response = await fetch('/api/payments/subscription-status')
                const raw = await response.text()
                const payload = raw ? JSON.parse(raw) : {}
                if (!response.ok) return
                if (payload?.coach?.subscription_status === 'active') {
                    if (pollingIntervalRef.current) {
                        clearInterval(pollingIntervalRef.current)
                        pollingIntervalRef.current = null
                    }
                    window.location.href = '/coach/dashboard?subscription=active'
                }
            } catch {
                // Ignore transient polling errors.
            }
        }, 4000)

        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current)
                pollingIntervalRef.current = null
            }
        }
    }, [confirmSubscription, fromSuccessfulCheckout, preapprovalIdFromUrl])

    const handleCheckout = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        try {
            const response = await fetch('/api/payments/create-preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tier, billingCycle }),
            })
            const raw = await response.text()
            const payload = raw ? JSON.parse(raw) : {}
            if (!response.ok) throw new Error(payload.error ?? 'No se pudo iniciar el pago.')
            if (!payload.checkoutUrl) throw new Error('No se recibió URL de pago.')
            window.location.href = payload.checkoutUrl
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error inesperado')
        } finally {
            setIsLoading(false)
        }
    }, [billingCycle, tier])

    useEffect(() => {
        const fromRegister = searchParams.get('from') === 'register'
        const canAutostart = fromRegister && !fromSuccessfulCheckout && !paymentStatus
        if (!canAutostart || hasAutoStartedCheckoutRef.current) return
        hasAutoStartedCheckoutRef.current = true
        void handleCheckout()
    }, [fromSuccessfulCheckout, handleCheckout, paymentStatus, searchParams])

    return (
        <main className="mx-auto max-w-3xl px-4 py-10">
            <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
                <h1 className="text-2xl font-bold text-foreground">Reactivar suscripción</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    Tu acceso de coach está pausado. Elige un plan y continúa al checkout para reactivar tu cuenta.
                </p>
                {searchParams.get('from') === 'register' ? (
                    <p className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                        Cuenta creada. Te falta completar el pago para activar acceso total al dashboard.
                    </p>
                ) : null}

                {paymentStatus === 'failure' ? (
                    <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                        El pago no se completó. Puedes intentarlo nuevamente.
                    </p>
                ) : null}

                {paymentStatus === 'pending' ? (
                    <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                        Tu pago quedó pendiente. Espera unos minutos y vuelve a verificar.
                    </p>
                ) : null}

                <section className="mt-6">
                    <h2 className="text-sm font-semibold text-foreground">Tier</h2>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {tierOptions.map(([key, option]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setTier(key)}
                                className={`rounded-xl border p-4 text-left transition ${tier === key
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border hover:border-primary/40'
                                    }`}
                            >
                                <p className="font-semibold text-foreground">{option.label}</p>
                                <p className="text-xs text-muted-foreground">Hasta {option.maxClients} alumnos</p>
                                <p className="mt-1 text-sm font-semibold text-foreground">
                                    ${option.monthlyPriceClp.toLocaleString('es-CL')} CLP / mes
                                </p>
                            </button>
                        ))}
                    </div>
                </section>

                <section className="mt-6">
                    <h2 className="text-sm font-semibold text-foreground">Frecuencia de pago</h2>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                        {cycleOptions.map(([key, option]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setBillingCycle(key)}
                                className={`rounded-xl border p-4 text-left transition ${billingCycle === key
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border hover:border-primary/40'
                                    }`}
                            >
                                <p className="font-semibold text-foreground">{option.label}</p>
                                <p className="text-xs text-muted-foreground">
                                    {option.discountPercent > 0 ? `Ahorro ${option.discountPercent}%` : 'Sin descuento'}
                                </p>
                                <p className="mt-1 text-sm font-semibold text-foreground">
                                    ${getTierPriceClp(tier, key).toLocaleString('es-CL')} CLP
                                </p>
                            </button>
                        ))}
                    </div>
                </section>

                <section className="mt-6 rounded-xl border border-border p-4">
                    <p className="text-sm text-muted-foreground">
                        Plan seleccionado: <span className="font-semibold text-foreground">{selectedTier.label}</span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Precio: <span className="font-semibold text-foreground">${selectedPrice.toLocaleString('es-CL')} CLP</span>
                        {billingCycle !== 'monthly' ? (
                            <span className="ml-2 text-xs">(mensual base ${monthlyBase.toLocaleString('es-CL')} CLP)</span>
                        ) : null}
                    </p>
                    <ul className="mt-3 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                        {selectedTier.features.map((feature) => (
                            <li key={feature}>{feature}</li>
                        ))}
                    </ul>
                </section>

                {error ? (
                    <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                        {error}
                    </p>
                ) : null}

                <button
                    type="button"
                    onClick={handleCheckout}
                    disabled={isLoading}
                    className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                    {isLoading ? 'Redirigiendo...' : 'Continuar al pago'}
                </button>

                <button
                    type="button"
                    onClick={() => confirmSubscription(preapprovalIdFromUrl)}
                    disabled={isConfirming}
                    className="mt-3 inline-flex h-11 items-center justify-center rounded-xl border border-border px-6 text-sm font-semibold text-foreground hover:bg-secondary/40 disabled:opacity-60"
                >
                    {isConfirming ? 'Verificando...' : 'Ya pagué, verificar acceso'}
                </button>
            </div>
        </main>
    )
}
