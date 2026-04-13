'use client'

import { useEffect, useState } from 'react'
import {
    BILLING_CYCLE_CONFIG,
    getDefaultBillingCycleForTier,
    getTierAllowedBillingCycles,
    getTierBillingCycleSummary,
    getTierNutritionSummary,
    getTierPriceClp,
    isBillingCycleAllowedForTier,
    TIER_CONFIG,
    TIER_STUDENT_RANGE_LABEL,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'

type CoachSubscription = {
    id: string
    subscription_tier: string
    subscription_status: string
    max_clients: number
    billing_cycle: string
    current_period_end: string | null
    payment_provider: string
}
type SubscriptionEvent = {
    id: string
    provider_status: string | null
    provider: string
    created_at: string
}

const tierOptions = Object.keys(TIER_CONFIG) as SubscriptionTier[]
const cycleOptions = Object.keys(BILLING_CYCLE_CONFIG) as BillingCycle[]

export default function CoachSubscriptionPage() {
    const [coach, setCoach] = useState<CoachSubscription | null>(null)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)
    const [reason, setReason] = useState('')
    const [selectedTier, setSelectedTier] = useState<SubscriptionTier>('starter')
    const [selectedCycle, setSelectedCycle] = useState<BillingCycle>('monthly')
    const [events, setEvents] = useState<SubscriptionEvent[]>([])

    useEffect(() => {
        let isMounted = true
        ;(async () => {
            setLoading(true)
            try {
                const response = await fetch('/api/payments/subscription-status')
                const payload = await response.json()
                if (!response.ok) throw new Error(payload.error ?? 'No se pudo cargar la suscripción')
                if (!isMounted) return
                setCoach(payload.coach)
                setEvents(Array.isArray(payload.events) ? payload.events : [])
                const tier = payload.coach.subscription_tier as SubscriptionTier
                const cycle = payload.coach.billing_cycle as BillingCycle
                if (tier && tier in TIER_CONFIG) setSelectedTier(tier)
                if (tier && tier in TIER_CONFIG && cycle && cycle in BILLING_CYCLE_CONFIG) {
                    setSelectedCycle(
                        isBillingCycleAllowedForTier(tier, cycle)
                            ? cycle
                            : getDefaultBillingCycleForTier(tier)
                    )
                }
            } catch (err) {
                if (isMounted) setError(err instanceof Error ? err.message : 'Error inesperado')
            } finally {
                if (isMounted) setLoading(false)
            }
        })()
        return () => {
            isMounted = false
        }
    }, [])

    const allowedCycles = getTierAllowedBillingCycles(selectedTier)
    const allowedCycleOptions = cycleOptions.filter((cycle) => allowedCycles.includes(cycle))

    useEffect(() => {
        if (!isBillingCycleAllowedForTier(selectedTier, selectedCycle)) {
            setSelectedCycle(getDefaultBillingCycleForTier(selectedTier))
        }
    }, [selectedTier, selectedCycle])

    async function handleChangePlan() {
        setSaving(true)
        setError(null)
        setSuccessMessage(null)
        try {
            const response = await fetch('/api/payments/create-preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tier: selectedTier, billingCycle: selectedCycle }),
            })
            const payload = await response.json()
            if (!response.ok) throw new Error(payload.error ?? 'No se pudo iniciar el cambio de plan')
            if (!payload.checkoutUrl) throw new Error('No se recibió URL de checkout')
            window.location.href = payload.checkoutUrl
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error inesperado')
            setSaving(false)
        }
    }

    async function handleCancel() {
        if (!coach) return
        if (!reason.trim()) {
            setError('Cuéntanos una razón para cancelar.')
            return
        }
        setSaving(true)
        setError(null)
        setSuccessMessage(null)
        try {
            const response = await fetch('/api/payments/cancel-subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason }),
            })
            if (!response.ok) {
                const payload = await response.json()
                throw new Error(payload.error ?? 'No se pudo procesar la cancelación.')
            }
            setSuccessMessage('Suscripción cancelada. Puedes reactivarla cuando quieras desde esta misma página.')
            setCoach((prev) => (prev ? { ...prev, subscription_status: 'canceled', current_period_end: null } : prev))
            setReason('')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error inesperado')
        } finally {
            setSaving(false)
        }
    }

    const selectedPrice = getTierPriceClp(selectedTier, selectedCycle)

    return (
        <main className="mx-auto max-w-4xl px-4 py-10">
            <h1 className="text-2xl font-bold text-foreground">Mi Suscripción</h1>
            <p className="mt-2 text-sm text-muted-foreground">
                Gestiona tu plan, frecuencia de cobro y ajustes de suscripción.
            </p>

            <section className="mt-6 rounded-2xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold text-foreground">Cómo funcionan los planes</h2>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    <li>
                        <span className="font-semibold text-foreground">Solo mensual:</span> Starter Lite (1–5), Starter
                        (6–10) y Pro (11–30). Sin nutrición en Starter Lite y Starter; Pro incluye nutrición.
                    </li>
                    <li>
                        <span className="font-semibold text-foreground">Solo trimestral o anual:</span> Elite (31–60) y
                        Scale (61–100). Incluyen nutrición.
                    </li>
                </ul>
            </section>

            {loading ? (
                <p className="mt-6 text-sm text-muted-foreground">Cargando estado de suscripción...</p>
            ) : null}

            {coach ? (
                <section className="mt-6 rounded-2xl border border-border bg-card p-5">
                    <p className="text-sm text-muted-foreground">
                        Estado actual: <span className="font-semibold text-foreground">{coach.subscription_status}</span>
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                        Plan actual:{' '}
                        <span className="font-semibold text-foreground">
                            {(() => {
                                const t = coach.subscription_tier as SubscriptionTier
                                if (!(t in TIER_CONFIG)) return coach.subscription_tier
                                return `${TIER_CONFIG[t].label} · ${TIER_STUDENT_RANGE_LABEL[t]}`
                            })()}
                        </span>
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                        Próximo corte:{' '}
                        <span className="font-semibold text-foreground">
                            {coach.current_period_end ? new Date(coach.current_period_end).toLocaleDateString('es-CL') : 'No disponible'}
                        </span>
                    </p>
                </section>
            ) : null}

            <section className="mt-6 rounded-2xl border border-border bg-card p-5">
                <h2 className="text-lg font-semibold text-foreground">Cambiar plan</h2>
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {tierOptions.map((tier) => (
                        <button
                            key={tier}
                            type="button"
                            onClick={() => setSelectedTier(tier)}
                            className={`rounded-xl border p-3 text-left ${
                                selectedTier === tier ? 'border-primary bg-primary/10' : 'border-border'
                            }`}
                        >
                            <p className="font-semibold text-foreground">{TIER_CONFIG[tier].label}</p>
                            <p className="text-xs text-muted-foreground">
                                {TIER_STUDENT_RANGE_LABEL[tier]} · Hasta {TIER_CONFIG[tier].maxClients} alumnos
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    {getTierBillingCycleSummary(tier)}
                                </span>
                                <span
                                    className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                        getTierNutritionSummary(tier).startsWith('Sin')
                                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                                            : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                    }`}
                                >
                                    {getTierNutritionSummary(tier)}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-3">
                    {allowedCycleOptions.map((cycle) => (
                        <button
                            key={cycle}
                            type="button"
                            onClick={() => setSelectedCycle(cycle)}
                            className={`rounded-xl border p-3 text-left ${
                                selectedCycle === cycle ? 'border-primary bg-primary/10' : 'border-border'
                            }`}
                        >
                            <p className="font-semibold text-foreground">{BILLING_CYCLE_CONFIG[cycle].label}</p>
                        </button>
                    ))}
                </div>

                <p className="mt-4 text-sm text-muted-foreground">
                    Nuevo monto estimado: <span className="font-semibold text-foreground">${selectedPrice.toLocaleString('es-CL')} CLP</span>
                </p>

                <button
                    type="button"
                    onClick={handleChangePlan}
                    disabled={saving}
                    className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                    {saving ? 'Procesando...' : 'Continuar cambio de plan'}
                </button>
            </section>

            <section className="mt-6 rounded-2xl border border-border bg-card p-5">
                <h2 className="text-lg font-semibold text-foreground">Historial reciente</h2>
                {events.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">Sin eventos recientes de suscripción.</p>
                ) : (
                    <div className="mt-3 space-y-2">
                        {events.map((event) => (
                            <div
                                key={event.id}
                                className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                            >
                                <p className="text-sm text-foreground">
                                    {event.provider} · {event.provider_status ?? 'sin estado'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {new Date(event.created_at).toLocaleString('es-CL')}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="mt-6 rounded-2xl border border-border bg-card p-5">
                <h2 className="text-lg font-semibold text-foreground">Cancelar suscripción</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                    Cuéntanos el motivo para ayudarnos a mejorar.
                </p>
                <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="mt-3 w-full rounded-xl border border-border bg-secondary p-3 text-sm text-foreground outline-none focus:border-primary"
                    rows={4}
                    placeholder="Ejemplo: no usaré la app este mes..."
                />
                <button
                    type="button"
                    onClick={handleCancel}
                    disabled={saving}
                    className="mt-3 inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
                >
                    Enviar solicitud de cancelación
                </button>
            </section>

            {error ? (
                <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {error}
                </p>
            ) : null}
            {successMessage ? (
                <p className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                    {successMessage}
                </p>
            ) : null}
        </main>
    )
}
