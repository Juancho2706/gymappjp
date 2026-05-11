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
import { Zap, Crown, Rocket, TrendingUp, Building2, Check, Leaf, type LucideIcon } from 'lucide-react'

const TIER_ICON: Record<SubscriptionTier, LucideIcon> = {
    free: Leaf, starter: Zap, pro: Rocket, elite: Crown, growth: TrendingUp, scale: Building2,
}
const TIER_COLOR: Record<SubscriptionTier, string> = {
    free: 'text-slate-400', starter: 'text-sky-400', pro: 'text-violet-400',
    elite: 'text-amber-400', growth: 'text-emerald-400', scale: 'text-rose-400',
}
const TIER_ICON_BG: Record<SubscriptionTier, string> = {
    free: 'bg-slate-500/10 border-slate-500/20', starter: 'bg-sky-500/10 border-sky-500/20',
    pro: 'bg-violet-500/10 border-violet-500/20', elite: 'bg-amber-500/10 border-amber-500/20',
    growth: 'bg-emerald-500/10 border-emerald-500/20', scale: 'bg-rose-500/10 border-rose-500/20',
}
const TIER_BADGE: Partial<Record<SubscriptionTier, { label: string; cls: string }>> = {
    pro:    { label: 'Más popular', cls: 'bg-violet-500/15 text-violet-400' },
    growth: { label: 'Nuevo',       cls: 'bg-emerald-500/15 text-emerald-400' },
}

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

// Free is excluded — coaches can't manually downgrade to free; it's automatic on cancellation
const tierOptions = (Object.keys(TIER_CONFIG) as SubscriptionTier[]).filter((t) => t !== 'free')
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
        <main className="mx-auto max-w-4xl px-4 py-8">
            <h1 className="text-2xl font-extrabold text-foreground">Mi Suscripción</h1>
            <p className="mt-1 text-sm text-muted-foreground">
                Gestioná tu plan, frecuencia de cobro y cancelación.
            </p>

    
            {loading ? (
                <p className="mt-6 text-sm text-muted-foreground">Cargando estado de suscripción...</p>
            ) : null}

            {coach ? (
                <section className="mt-6 rounded-2xl border border-border bg-card p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Plan actual</p>
                    <div className="flex items-start gap-4">
                        {(() => {
                            const t = (coach.subscription_tier in TIER_CONFIG ? coach.subscription_tier : 'starter') as SubscriptionTier
                            const TierIcon = TIER_ICON[t]
                            return (
                                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${TIER_ICON_BG[t]}`}>
                                    <TierIcon className={`h-5 w-5 ${TIER_COLOR[t]}`} />
                                </div>
                            )
                        })()}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-foreground text-lg">
                                    {(() => {
                                        const t = coach.subscription_tier as SubscriptionTier
                                        return (t in TIER_CONFIG) ? TIER_CONFIG[t].label : coach.subscription_tier
                                    })()}
                                </p>
                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    coach.subscription_status === 'active'          ? 'bg-emerald-500/15 text-emerald-500' :
                                    coach.subscription_status === 'canceled'        ? 'bg-red-500/15 text-red-400' :
                                    coach.subscription_status === 'trialing'        ? 'bg-blue-500/15 text-blue-400' :
                                    'bg-amber-500/15 text-amber-400'
                                }`}>
                                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                    {coach.subscription_status === 'active'          ? 'Activo' :
                                     coach.subscription_status === 'canceled'        ? 'Cancelado' :
                                     coach.subscription_status === 'trialing'        ? 'En prueba' :
                                     coach.subscription_status === 'pending_payment' ? 'Procesando' :
                                     coach.subscription_status}
                                </span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                {TIER_STUDENT_RANGE_LABEL[coach.subscription_tier as SubscriptionTier] ?? ''}
                            </p>
                            {coach.current_period_end ? (
                                <p className="text-sm text-muted-foreground mt-1">
                                    {coach.subscription_status === 'canceled' ? 'Acceso hasta' : 'Próximo cobro'}:{' '}
                                    <span className="font-semibold text-foreground">
                                        {new Date(coach.current_period_end).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
                                    </span>
                                    {coach.subscription_status === 'active' && (() => {
                                        const t = coach.subscription_tier as SubscriptionTier
                                        const c = coach.billing_cycle as BillingCycle
                                        const price = getTierPriceClp(t, c)
                                        return price > 0 ? <span className="text-muted-foreground"> · ${price.toLocaleString('es-CL')} CLP</span> : null
                                    })()}
                                </p>
                            ) : coach.subscription_tier === 'free' ? (
                                <p className="text-sm text-muted-foreground mt-1">
                                    Sin fecha de vencimiento · <span className="text-foreground font-semibold">Gratis para siempre</span>
                                </p>
                            ) : null}
                        </div>
                    </div>
                </section>
            ) : null}

            <section className="mt-6 rounded-2xl border border-border bg-card p-5 space-y-5">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <h2 className="text-lg font-semibold text-foreground">Cambiar plan</h2>
                    {/* Cycle pills — shown per selected tier */}
                    {allowedCycleOptions.length > 1 && (
                        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-secondary/50 p-1">
                            {allowedCycleOptions.map((cycle) => (
                                <button
                                    key={cycle}
                                    type="button"
                                    onClick={() => setSelectedCycle(cycle)}
                                    className={`flex items-center rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors sm:px-3 ${
                                        selectedCycle === cycle
                                            ? 'bg-background text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {BILLING_CYCLE_CONFIG[cycle].label}
                                    {cycle === 'annual' && (
                                        <span className="ml-1 rounded bg-emerald-500/15 px-1 py-0.5 text-[9px] font-bold text-emerald-400">−20%</span>
                                    )}
                                    {cycle === 'quarterly' && (
                                        <span className="ml-1 rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-bold text-amber-400">−10%</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {tierOptions.map((tier) => {
                        const TierIcon = TIER_ICON[tier]
                        const cycleForPrice = allowedCycleOptions.includes(selectedCycle)
                            ? selectedCycle
                            : getDefaultBillingCycleForTier(tier)
                        const price = getTierPriceClp(tier, isBillingCycleAllowedForTier(tier, selectedCycle) ? selectedCycle : getDefaultBillingCycleForTier(tier))
                        const monthlyPrice = getTierPriceClp(tier, 'monthly')
                        const isSelected = selectedTier === tier
                        const badge = TIER_BADGE[tier]
                        const hasNutrition = !getTierNutritionSummary(tier).startsWith('Sin')
                        const features = TIER_CONFIG[tier].features.slice(0, 3)
                        return (
                            <button
                                key={tier}
                                type="button"
                                onClick={() => setSelectedTier(tier)}
                                className={`relative rounded-2xl border p-4 text-left transition-all ${
                                    isSelected
                                        ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30'
                                        : 'border-border hover:border-border/80 hover:bg-secondary/30'
                                }`}
                            >
                                {badge && (
                                    <span className={`absolute right-3 top-3 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                                        {badge.label}
                                    </span>
                                )}

                                <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl border ${TIER_ICON_BG[tier]}`}>
                                    <TierIcon className={`h-4.5 w-4.5 ${TIER_COLOR[tier]}`} />
                                </div>

                                <p className="font-bold text-foreground">{TIER_CONFIG[tier].label}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">{TIER_STUDENT_RANGE_LABEL[tier]}</p>

                                <div className="mt-3">
                                    <span className="text-xl font-extrabold text-foreground">
                                        ${price.toLocaleString('es-CL')}
                                    </span>
                                    <span className="text-xs text-muted-foreground"> CLP/mes</span>
                                    {selectedCycle === 'annual' && isBillingCycleAllowedForTier(tier, 'annual') && (
                                        <p className="text-[10px] text-muted-foreground mt-0.5">
                                            ${(price * 12).toLocaleString('es-CL')} cobrado anualmente
                                        </p>
                                    )}
                                </div>

                                <ul className="mt-3 space-y-1.5">
                                    {features.map((f) => (
                                        <li key={f} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                                            <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
                                            {f}
                                        </li>
                                    ))}
                                </ul>

                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                                        {getTierBillingCycleSummary(tier)}
                                    </span>
                                    <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                                        hasNutrition
                                            ? 'bg-emerald-500/15 text-emerald-500'
                                            : 'bg-amber-500/15 text-amber-500'
                                    }`}>
                                        {getTierNutritionSummary(tier)}
                                    </span>
                                </div>
                            </button>
                        )
                    })}
                </div>

                <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-secondary/30 px-4 py-3">
                    <div>
                        <p className="text-xs text-muted-foreground">Total a pagar</p>
                        <p className="text-lg font-extrabold text-foreground">
                            ${selectedPrice.toLocaleString('es-CL')} CLP
                            <span className="text-sm font-normal text-muted-foreground"> / {BILLING_CYCLE_CONFIG[selectedCycle].label.toLowerCase()}</span>
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowUpgradeConfirm(true)}
                        disabled={saving}
                        className="shrink-0 h-10 rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors disabled:opacity-60"
                    >
                        Continuar →
                    </button>
                </div>
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
