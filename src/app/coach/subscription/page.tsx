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
    provider_checkout_id: string | null
    payload: unknown
}

function extractAmountClpFromEventPayload(payload: unknown): number | null {
    if (!payload || typeof payload !== 'object') return null
    const root = payload as Record<string, unknown>
    const candidates = [
        root.transaction_amount,
        (root.auto_recurring as Record<string, unknown> | undefined)?.transaction_amount,
        (root.data as Record<string, unknown> | undefined)?.transaction_amount,
    ]
    for (const c of candidates) {
        const n = typeof c === 'number' ? c : typeof c === 'string' ? Number.parseFloat(c) : Number.NaN
        if (!Number.isNaN(n) && n > 0) return Math.round(n)
    }
    return null
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
    const [showUpgradeConfirm, setShowUpgradeConfirm] = useState(false)

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
            setSuccessMessage('Suscripción cancelada. Conservas acceso hasta el final del período que ya pagaste.')
            // Preserve current_period_end — the grace period logic depends on it
            setCoach((prev) => (prev ? { ...prev, subscription_status: 'canceled' } : prev))
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

            <section className="mt-6 rounded-2xl border border-border dark:border-white/10 bg-card dark:bg-zinc-950 p-5">
                <h2 className="text-sm font-semibold text-foreground">Cómo funcionan los planes</h2>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    <li>
                        <span className="font-semibold text-foreground">Solo mensual:</span> Starter (1–10) y Pro
                        (11–30). Sin nutrición en Starter; Pro incluye nutrición.
                    </li>
                    <li>
                        <span className="font-semibold text-foreground">Elite (31–60) y Scale (61–100):</span> mensual,
                        trimestral o anual; son los únicos planes con prepago trimestral o anual. Incluyen nutrición.
                    </li>
                </ul>
            </section>

            {loading ? (
                <p className="mt-6 text-sm text-muted-foreground">Cargando estado de suscripción...</p>
            ) : null}

            {coach ? (
                <section className="mt-6 rounded-2xl border border-border dark:border-white/10 bg-card dark:bg-zinc-950 p-5">
                    {/* Status badge */}
                    <div className="flex items-center gap-2 mb-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                            coach.subscription_status === 'active' ? 'bg-emerald-500/15 text-emerald-500' :
                            coach.subscription_status === 'canceled' ? 'bg-red-500/15 text-red-400' :
                            coach.subscription_status === 'trialing' ? 'bg-blue-500/15 text-blue-400' :
                            'bg-amber-500/15 text-amber-400'
                        }`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            {coach.subscription_status === 'active' ? 'Activo' :
                             coach.subscription_status === 'canceled' ? 'Cancelado — acceso hasta el período pagado' :
                             coach.subscription_status === 'trialing' ? 'En prueba' :
                             coach.subscription_status === 'pending_payment' ? 'Procesando pago' :
                             coach.subscription_status}
                        </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Plan:{' '}
                        <span className="font-semibold text-foreground">
                            {(() => {
                                const t = coach.subscription_tier as SubscriptionTier
                                if (!(t in TIER_CONFIG)) return coach.subscription_tier
                                return `${TIER_CONFIG[t].label} · ${TIER_STUDENT_RANGE_LABEL[t]}`
                            })()}
                        </span>
                    </p>
                    {coach.current_period_end ? (
                        <p className="text-sm text-muted-foreground mt-1">
                            {coach.subscription_status === 'canceled' ? 'Acceso hasta' : 'Próximo cobro'}:{' '}
                            <span className="font-semibold text-foreground">
                                {new Date(coach.current_period_end).toLocaleDateString('es-CL', {
                                    day: 'numeric', month: 'long', year: 'numeric',
                                })}
                            </span>
                            {coach.subscription_status === 'active' && (() => {
                                const t = coach.subscription_tier as SubscriptionTier
                                const c = coach.billing_cycle as BillingCycle
                                const price = getTierPriceClp(t, c)
                                return price > 0 ? (
                                    <span className="text-muted-foreground"> · ${price.toLocaleString('es-CL')} CLP</span>
                                ) : null
                            })()}
                        </p>
                    ) : null}
                    {coach.subscription_status === 'active' && coach.payment_provider === 'mercadopago' && coach.current_period_end && (
                        <p className="mt-2 text-xs text-muted-foreground/60">
                            Mercado Pago tiene autorizado el débito automático para esa fecha.
                        </p>
                    )}
                </section>
            ) : null}

            <section className="mt-6 rounded-2xl border border-border dark:border-white/10 bg-card dark:bg-zinc-950 p-5">
                <h2 className="text-lg font-semibold text-foreground">Cambiar plan</h2>
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {tierOptions.map((tier) => {
                        const defaultCycle = getDefaultBillingCycleForTier(tier)
                        const defaultPrice = getTierPriceClp(tier, defaultCycle)
                        return (
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
                            <p className="mt-2 text-sm font-bold text-foreground">
                                ${defaultPrice.toLocaleString('es-CL')} CLP
                                <span className="text-xs font-normal text-muted-foreground">
                                    {' '}/ {BILLING_CYCLE_CONFIG[defaultCycle].label.toLowerCase()}
                                </span>
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
                        )
                    })}
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
                    onClick={() => setShowUpgradeConfirm(true)}
                    disabled={saving}
                    className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                    Continuar cambio de plan
                </button>
            </section>

            {/* Upgrade confirmation modal */}
            {showUpgradeConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
                    <div className="w-full max-w-md rounded-2xl border border-border dark:border-white/10 bg-card dark:bg-zinc-950 p-6 shadow-2xl">
                        <h2 className="text-lg font-bold text-foreground">Confirmar cambio de plan</h2>
                        <div className="mt-4 space-y-2 rounded-xl border border-border bg-secondary/40 p-4 text-sm">
                            {coach?.current_period_end && (
                                <p className="text-muted-foreground">
                                    Tu plan actual{' '}
                                    <strong className="text-foreground">
                                        ({coach.subscription_tier in TIER_CONFIG
                                            ? TIER_CONFIG[coach.subscription_tier as SubscriptionTier].label
                                            : coach.subscription_tier})
                                    </strong>{' '}
                                    continúa hasta el{' '}
                                    <strong className="text-foreground">
                                        {new Date(coach.current_period_end).toLocaleDateString('es-CL', {
                                            day: 'numeric', month: 'long', year: 'numeric',
                                        })}
                                    </strong>
                                    .
                                </p>
                            )}
                            <p className="text-muted-foreground">
                                A partir de esa fecha, tu nuevo plan{' '}
                                <strong className="text-foreground">{TIER_CONFIG[selectedTier].label}</strong>{' '}
                                se activará por{' '}
                                <strong className="text-foreground">
                                    ${selectedPrice.toLocaleString('es-CL')} CLP / {BILLING_CYCLE_CONFIG[selectedCycle].label.toLowerCase()}
                                </strong>
                                .
                            </p>
                            {!TIER_CONFIG[selectedTier].features.includes('Planes de nutrición') &&
                             coach?.subscription_tier &&
                             TIER_CONFIG[coach.subscription_tier as SubscriptionTier]?.features.includes('Planes de nutrición') && (
                                <p className="text-amber-600 dark:text-amber-400 text-xs font-medium">
                                    ⚠ El nuevo plan no incluye el módulo de nutrición. Perderás ese acceso al cambiar.
                                </p>
                            )}
                        </div>
                        <div className="mt-4 flex gap-3">
                            <button
                                type="button"
                                onClick={() => setShowUpgradeConfirm(false)}
                                className="flex-1 h-10 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => { setShowUpgradeConfirm(false); void handleChangePlan() }}
                                disabled={saving}
                                className="flex-1 h-10 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                            >
                                {saving ? 'Procesando...' : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <section className="mt-6 rounded-2xl border border-border dark:border-white/10 bg-card dark:bg-zinc-950 p-5">
                <h2 className="text-lg font-semibold text-foreground">Historial de pagos</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                    Eventos registrados por Mercado Pago y confirmaciones manuales (zona horaria local en fechas).
                </p>
                {events.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">Aún no hay movimientos de suscripción registrados.</p>
                ) : (
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                            <thead>
                                <tr className="border-b border-border dark:border-white/10 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    <th className="py-2 pr-3">Fecha</th>
                                    <th className="py-2 pr-3">Estado</th>
                                    <th className="py-2 pr-3">Monto</th>
                                    <th className="py-2">Referencia</th>
                                </tr>
                            </thead>
                            <tbody>
                                {events.map((event) => {
                                    const amount = extractAmountClpFromEventPayload(event.payload)
                                    const dateLabel = new Date(event.created_at).toLocaleString('es-CL', {
                                        dateStyle: 'short',
                                        timeStyle: 'short',
                                    })
                                    const ref = event.provider_checkout_id?.trim()
                                    return (
                                        <tr key={event.id} className="border-b border-border/80 dark:border-white/5 last:border-0">
                                            <td className="py-2.5 pr-3 text-foreground">{dateLabel}</td>
                                            <td className="py-2.5 pr-3">
                                                <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-foreground">
                                                    {event.provider_status ?? '—'}
                                                </span>
                                            </td>
                                            <td className="py-2.5 pr-3 text-foreground">
                                                {amount != null ? `$${amount.toLocaleString('es-CL')} CLP` : '—'}
                                            </td>
                                            <td className="py-2.5 text-xs text-muted-foreground">
                                                {ref ? `${event.provider} · ${ref}` : event.provider}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="mt-6 rounded-2xl border border-border dark:border-white/10 bg-card dark:bg-zinc-950 p-5">
                <h2 className="text-lg font-semibold text-foreground">Cancelar suscripción</h2>
                {coach?.current_period_end ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                        Al cancelar,{' '}
                        <strong className="text-foreground">conservarás acceso hasta el{' '}
                        {new Date(coach.current_period_end).toLocaleDateString('es-CL', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                        })}</strong>
                        . Después de esa fecha tu cuenta quedará suspendida.
                    </p>
                ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                        Cuéntanos el motivo para ayudarnos a mejorar.
                    </p>
                )}
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
