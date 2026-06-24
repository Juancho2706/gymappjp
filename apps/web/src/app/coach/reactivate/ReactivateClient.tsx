'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, CheckCircle, Users } from 'lucide-react'
import {
    ADDON_CONFIG,
    ADDON_MODULE_KEYS,
    BILLING_CYCLE_CONFIG,
    getDefaultBillingCycleForTier,
    getTierAllowedBillingCycles,
    getTierBillingCycleSummary,
    getTierCapabilities,
    getTierMaxClients,
    getTierNutritionSummary,
    getTierPriceClp,
    isBillingCycleAllowedForTier,
    isSaleTier,
    SALE_TIERS,
    SELF_SERVICE_ADDONS_ENABLED,
    TIER_CONFIG,
    TIER_STUDENT_RANGE_LABEL,
    type BillingCycle,
    type SaleTier,
    type SubscriptionTier,
} from '@/lib/constants'
import type { ModuleKey } from '@/services/entitlements.service'
import { ReactivateCouponCard } from './_components/ReactivateCouponCard'

// Solo se ofertan tiers a la venta (free/starter/pro/elite). growth/scale quedan fuera (LEGACY).
const tierOptions = SALE_TIERS.map((key) => [key, TIER_CONFIG[key]] as const)
const cycleOptions = Object.entries(BILLING_CYCLE_CONFIG) as [
    BillingCycle,
    (typeof BILLING_CYCLE_CONFIG)[BillingCycle],
][]

interface ReactivateClientProps {
    currentTier: SubscriptionTier
    activeClientCount: number
    subscriptionStatus: string | null
    /** Ex-add-ons pagos cancelados recientemente (plan 05 F5.6) — pre-marcados, deseleccionables. */
    recentlyCancelledAddons?: ModuleKey[]
    /** Flag de cupones (COUPON_REDEMPTION_ENABLED) leído server-side: muestra el canje de código. */
    couponsEnabled?: boolean
}

export function ReactivateClient({ currentTier, activeClientCount, subscriptionStatus, recentlyCancelledAddons = [], couponsEnabled = false }: ReactivateClientProps) {
    const searchParams = useSearchParams()

    // Pre-select the minimum viable tier for the coach's current client count,
    // anchored to their actual tier (not always starter). growth/scale ya no se venden:
    // un currentTier/query legacy ancla a 'elite' (D4 — la reactivacion publica nunca
    // resucita un tier muerto; quien supere elite ve el puente a Teams, no un auto-bump).
    const initialTier = useMemo<SaleTier>(() => {
        const raw = searchParams.get('tier')
        const queryTier = raw === 'starter_lite' ? 'starter' : raw
        const candidate: SaleTier =
            queryTier && isSaleTier(queryTier)
                ? queryTier
                : isSaleTier(currentTier)
                ? currentTier
                : 'elite'
        // If the candidate can't cover current clients, bump up to the minimum viable sale tier.
        // Si ni siquiera elite (el techo de venta) los cubre, anclamos a elite y la UI muestra
        // el bloque "conversemos de EVA Teams" (boton de pago deshabilitado).
        if (TIER_CONFIG[candidate].maxClients < activeClientCount) {
            return SALE_TIERS.find((t) => TIER_CONFIG[t].maxClients >= activeClientCount) ?? 'elite'
        }
        return candidate
    }, [searchParams, currentTier, activeClientCount])

    const [tier, setTier] = useState<SaleTier>(initialTier)
    const [billingCycle, setBillingCycle] = useState<BillingCycle>(() => {
        const queryCycle = searchParams.get('cycle')
        if (queryCycle && queryCycle in BILLING_CYCLE_CONFIG) return queryCycle as BillingCycle
        return 'monthly'
    })
    // Pre-marca ex-add-ons (deseleccionables). Solo cuando la compra self-service está activa.
    const [selectedAddons, setSelectedAddons] = useState<ModuleKey[]>(
        SELF_SERVICE_ADDONS_ENABLED ? recentlyCancelledAddons : []
    )
    const [isLoading, setIsLoading] = useState(false)
    const [isConfirming, setIsConfirming] = useState(false)
    const [isActivatingFree, setIsActivatingFree] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const hasAutoCheckedRef = useRef(false)
    const hasAutoStartedCheckoutRef = useRef(false)
    const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const selectedTier = useMemo(() => TIER_CONFIG[tier], [tier])
    const selectedPrice = useMemo(() => getTierPriceClp(tier, billingCycle), [tier, billingCycle])
    const monthlyBase = useMemo(() => TIER_CONFIG[tier].monthlyPriceClp, [tier])
    const allowedCycleOptions = useMemo(
        () => cycleOptions.filter(([key]) => getTierAllowedBillingCycles(tier).includes(key)),
        [tier]
    )

    const tierBlockedByClients = useMemo(() => getTierMaxClients(tier) < activeClientCount, [tier, activeClientCount])

    // Add-ons: nutrition_exchanges solo en tier con nutrición (D8). Purga al cambiar de plan.
    useEffect(() => {
        const caps = getTierCapabilities(tier)
        setSelectedAddons((prev) => {
            const next = prev.filter((k) => (k === 'nutrition_exchanges' ? caps.canUseNutrition : true))
            return next.length === prev.length ? prev : next
        })
    }, [tier])

    // Total en vivo de add-ons (monto por ciclo, mismos descuentos del plan). El precio se
    // re-congela a lista VIGENTE en la fila nueva (no hereda el viejo) — server-side.
    const addonsCycleTotal = useMemo(() => {
        const { months, discountPercent } = BILLING_CYCLE_CONFIG[billingCycle]
        return selectedAddons.reduce((sum, key) => {
            const gross = ADDON_CONFIG[key].priceClpMensual * months
            return sum + Math.round(gross * (1 - discountPercent / 100))
        }, 0)
    }, [selectedAddons, billingCycle])

    // La cartera supera el plan mas alto a la venta (elite): ya no hay tier al que auto-subir
    // (growth/scale estan fuera de venta). Mostramos el puente a EVA Teams y deshabilitamos el pago.
    const exceedsTopSaleTier = useMemo(
        () => activeClientCount > getTierMaxClients('elite'),
        [activeClientCount]
    )

    const paymentStatus = searchParams.get('payment')
    const subscriptionBlocked = searchParams.get('reason') === 'subscription_blocked'
    const rawSubscriptionParam = searchParams.get('subscription') ?? ''
    const decodedSubscriptionParam = (() => {
        try { return decodeURIComponent(rawSubscriptionParam) } catch { return rawSubscriptionParam }
    })()
    const fromSuccessfulCheckout =
        rawSubscriptionParam === 'success' ||
        decodedSubscriptionParam === 'success' ||
        rawSubscriptionParam.startsWith('success%3F') ||
        decodedSubscriptionParam.startsWith('success?')

    const preapprovalIdFromUrl = (() => {
        const direct = searchParams.get('preapproval_id')
        if (direct) return direct
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
                if (pollingIntervalRef.current) { clearInterval(pollingIntervalRef.current); pollingIntervalRef.current = null }
                window.location.href = '/coach/dashboard?subscription=active'
                return
            }
            if (!silent) setError('Tu pago fue creado, pero la suscripción aún aparece pendiente. Reintenta en unos segundos.')
        } catch (err) {
            if (!silent) setError(err instanceof Error ? err.message : 'Error inesperado')
        } finally {
            setIsConfirming(false)
        }
    }, [])

    useEffect(() => {
        if (!isBillingCycleAllowedForTier(tier, billingCycle)) {
            setBillingCycle(getDefaultBillingCycleForTier(tier))
        }
    }, [tier, billingCycle])

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
                    if (pollingIntervalRef.current) { clearInterval(pollingIntervalRef.current); pollingIntervalRef.current = null }
                    window.location.href = '/coach/dashboard?subscription=active'
                }
            } catch { /* ignore */ }
        }, 4000)
        return () => { if (pollingIntervalRef.current) { clearInterval(pollingIntervalRef.current); pollingIntervalRef.current = null } }
    }, [confirmSubscription, fromSuccessfulCheckout, preapprovalIdFromUrl])

    const handleCheckout = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        try {
            const response = await fetch('/api/payments/create-preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tier,
                    billingCycle,
                    // Add-ons pre-marcados viajan en external_reference del preapproval nuevo (D4 —
                    // sin one-shot: el preapproval nace con el ciclo completo compuesto).
                    ...(selectedAddons.length > 0 ? { addons: selectedAddons } : {}),
                }),
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
    }, [billingCycle, tier, selectedAddons])

    const handleActivateFree = useCallback(async () => {
        setIsActivatingFree(true)
        setError(null)
        try {
            const response = await fetch('/api/payments/activate-free', { method: 'POST' })
            const raw = await response.text()
            const payload = raw ? JSON.parse(raw) : {}
            if (!response.ok) throw new Error(payload.error ?? 'No se pudo activar el plan gratuito.')
            window.location.href = '/coach/dashboard'
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error inesperado')
        } finally {
            setIsActivatingFree(false)
        }
    }, [])

    useEffect(() => {
        const fromRegister = searchParams.get('from') === 'register'
        const canAutostart = fromRegister && !fromSuccessfulCheckout && !paymentStatus
        if (!canAutostart || hasAutoStartedCheckoutRef.current) return
        hasAutoStartedCheckoutRef.current = true
        void handleCheckout()
    }, [fromSuccessfulCheckout, handleCheckout, paymentStatus, searchParams])

    const canActivateFree = activeClientCount <= getTierMaxClients('free') &&
        (subscriptionStatus === 'pending_payment' || subscriptionStatus === 'expired')

    return (
        <main className="mx-auto max-w-4xl px-4 py-10 bg-background dark:bg-zinc-950">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900/80 md:p-8">
                <h1 className="text-2xl font-bold text-foreground md:text-3xl">Reactivar tu suscripción</h1>
                <p className="mt-2 text-sm text-muted-foreground md:text-base">
                    Sin un plan activo no puedes gestionar alumnos ni rutinas. Elige el plan que mejor se ajuste a tu
                    negocio y completa el pago seguro con Mercado Pago.
                </p>

                {subscriptionBlocked && (
                    <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                        <p className="font-semibold text-foreground dark:text-amber-50">Acceso restringido</p>
                        <p className="mt-1 text-muted-foreground dark:text-amber-100/90">
                            Tu cuenta quedó con un estado de suscripción que bloquea el panel. Al completar el pago,
                            recuperarás el acceso de inmediato.
                        </p>
                    </div>
                )}

                {searchParams.get('from') === 'register' && (
                    <p className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
                        Cuenta creada. Te falta completar el pago para activar acceso total al dashboard.
                    </p>
                )}

                {paymentStatus === 'failure' && (
                    <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
                        El pago no se completó. Puedes intentarlo nuevamente.
                    </p>
                )}

                {paymentStatus === 'pending' && (
                    <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
                        Tu pago quedó pendiente. Espera unos minutos y vuelve a verificar.
                    </p>
                )}

                <section className="mt-8 overflow-x-auto rounded-xl border border-border dark:border-white/10">
                    <h2 className="border-b border-border bg-muted/40 px-4 py-3 text-sm font-semibold text-foreground dark:border-white/10 dark:bg-white/5">
                        Comparativa rápida de planes
                    </h2>
                    <table className="w-full min-w-[520px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:border-white/10">
                                <th className="px-4 py-2">Plan</th>
                                <th className="px-4 py-2">Alumnos</th>
                                <th className="px-4 py-2">Desde / mes</th>
                                <th className="px-4 py-2">Cobros</th>
                                <th className="px-4 py-2">Nutrición</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tierOptions.map(([key, option]) => (
                                <tr
                                    key={key}
                                    className={`border-b border-border/80 last:border-0 dark:border-white/5 ${tier === key ? 'bg-primary/5 dark:bg-primary/10' : ''}`}
                                >
                                    <td className="px-4 py-2.5 font-medium text-foreground">{option.label}</td>
                                    <td className="px-4 py-2.5 text-muted-foreground">{TIER_STUDENT_RANGE_LABEL[key]}</td>
                                    <td className="px-4 py-2.5 text-foreground">
                                        ${option.monthlyPriceClp.toLocaleString('es-CL')} CLP
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                        {getTierBillingCycleSummary(key)}
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                        {getTierNutritionSummary(key)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>

                <p className="mt-4 text-xs text-muted-foreground">
                    Pagos procesados por Mercado Pago (PCI). EVA no almacena los datos de tu tarjeta.
                </p>

                <section className="mt-6">
                    <h2 className="text-sm font-semibold text-foreground">Tier</h2>
                    {activeClientCount > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            Tienes <strong>{activeClientCount}</strong> alumno{activeClientCount !== 1 ? 's' : ''} activo{activeClientCount !== 1 ? 's' : ''}. Los planes que no los cubren están desactivados.
                        </p>
                    )}
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {tierOptions.map(([key, option]) => {
                            const tooSmall = option.maxClients < activeClientCount
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    disabled={tooSmall}
                                    onClick={() => !tooSmall && setTier(key)}
                                    title={tooSmall ? `Tienes ${activeClientCount} alumnos activos — este plan no los cubre` : undefined}
                                    className={`rounded-xl border p-4 text-left transition ${
                                        tier === key
                                            ? 'border-primary bg-primary/10'
                                            : tooSmall
                                            ? 'border-border/30 opacity-40 cursor-not-allowed'
                                            : 'border-border hover:border-primary/40'
                                    }`}
                                >
                                    <p className="font-semibold text-foreground">{option.label}</p>
                                    <p className="text-xs text-muted-foreground">Hasta {option.maxClients} alumnos</p>
                                    <p className="mt-1 text-sm font-semibold text-foreground">
                                        ${option.monthlyPriceClp.toLocaleString('es-CL')} CLP / mes
                                    </p>
                                    {tooSmall && (
                                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                                            No cubre tus {activeClientCount} alumnos
                                        </p>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </section>

                {exceedsTopSaleTier ? (
                    <div className="mt-4 flex items-start gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
                        <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <div>
                            <p className="font-semibold text-foreground">Tu cartera supera el plan más alto</p>
                            <p className="mt-0.5 text-muted-foreground">
                                Tienes {activeClientCount} alumnos activos, más de los que cubre nuestro plan
                                individual más alto. Conversemos de EVA Teams, pensado para carteras grandes y
                                equipos de profesionales.{' '}
                                <a
                                    href="mailto:contacto@eva-app.cl?subject=Quiero%20conocer%20EVA%20Teams"
                                    className="font-medium underline"
                                >
                                    Escríbenos a contacto@eva-app.cl →
                                </a>
                            </p>
                        </div>
                    </div>
                ) : tierBlockedByClients ? (
                    <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                        <div>
                            <p className="font-semibold text-red-800 dark:text-red-200">Plan insuficiente</p>
                            <p className="mt-0.5 text-red-700 dark:text-red-300">
                                Debes archivar {activeClientCount - getTierMaxClients(tier)} alumno{activeClientCount - getTierMaxClients(tier) !== 1 ? 's' : ''} antes de continuar con Plan {selectedTier.label}.{' '}
                                <Link href="/coach/clients" className="underline font-medium">Ir a mis alumnos →</Link>
                            </p>
                        </div>
                    </div>
                ) : null}

                <section className="mt-6">
                    <h2 className="text-sm font-semibold text-foreground">Frecuencia de pago</h2>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                        {allowedCycleOptions.map(([key, option]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setBillingCycle(key)}
                                className={`rounded-xl border p-4 text-left transition ${
                                    billingCycle === key ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'
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

                {/* Ex-add-ons pre-marcados (deseleccionables) — plan 05 F5.6. Solo con la compra activa. */}
                {SELF_SERVICE_ADDONS_ENABLED && recentlyCancelledAddons.length > 0 && (
                    <section className="mt-6">
                        <h2 className="text-sm font-semibold text-foreground">Volver a sumar tus módulos</h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Tenías estos módulos activos. Vuelven pre-seleccionados al precio de lista vigente —
                            quita los que no necesites.
                        </p>
                        <div className="mt-3 grid gap-2">
                            {ADDON_MODULE_KEYS.filter((k) => recentlyCancelledAddons.includes(k)).map((key) => {
                                const cfg = ADDON_CONFIG[key]
                                const requiresNutrition = key === 'nutrition_exchanges' && !getTierCapabilities(tier).canUseNutrition
                                const checked = selectedAddons.includes(key)
                                return (
                                    <label
                                        key={key}
                                        className={`flex items-start gap-2 rounded-xl border p-3 text-left transition ${
                                            requiresNutrition
                                                ? 'border-border opacity-60'
                                                : checked
                                                    ? 'border-primary bg-primary/10 cursor-pointer'
                                                    : 'border-border hover:border-primary/40 cursor-pointer'
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={requiresNutrition}
                                            onChange={(e) =>
                                                setSelectedAddons((prev) =>
                                                    e.target.checked ? [...prev, key] : prev.filter((k) => k !== key)
                                                )
                                            }
                                            className="mt-0.5 h-4 w-4 rounded border-border shrink-0"
                                        />
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center justify-between gap-2">
                                                <span className="font-semibold text-foreground text-sm">{cfg.label}</span>
                                                <span className="text-xs font-semibold text-foreground shrink-0">
                                                    ${cfg.priceClpMensual.toLocaleString('es-CL')} CLP / mes
                                                </span>
                                            </span>
                                            {requiresNutrition && (
                                                <span className="mt-1 inline-block text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                                    Requiere un plan con nutrición (Pro o superior).
                                                </span>
                                            )}
                                        </span>
                                    </label>
                                )
                            })}
                        </div>
                    </section>
                )}

                <section className="mt-6 rounded-xl border border-border p-4">
                    <p className="text-sm text-muted-foreground">
                        Plan seleccionado: <span className="font-semibold text-foreground">{selectedTier.label}</span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Precio: <span className="font-semibold text-foreground">${selectedPrice.toLocaleString('es-CL')} CLP</span>
                        {billingCycle !== 'monthly' && (
                            <span className="ml-2 text-xs">(mensual base ${monthlyBase.toLocaleString('es-CL')} CLP)</span>
                        )}
                    </p>
                    {selectedAddons.length > 0 && (
                        <p className="mt-1 text-sm text-muted-foreground">
                            Módulos ({selectedAddons.map((k) => ADDON_CONFIG[k].label).join(', ')}):{' '}
                            <span className="font-semibold text-foreground">+${addonsCycleTotal.toLocaleString('es-CL')} CLP</span>
                            {' · '}Total <span className="font-semibold text-foreground">${(selectedPrice + addonsCycleTotal).toLocaleString('es-CL')} CLP</span>
                        </p>
                    )}
                    <ul className="mt-3 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                        {selectedTier.features.map((feature) => (
                            <li key={feature}>{feature}</li>
                        ))}
                    </ul>
                </section>

                {/* Canje de código de descuento (reactivación). Solo con tier pago + flag ON; el monto
                    descontado lo aplica create-preference al "Continuar al pago". */}
                <ReactivateCouponCard tier={tier} billingCycle={billingCycle} couponsEnabled={couponsEnabled} />

                {error && (
                    <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                        {error}
                    </p>
                )}

                <div className="mt-6 flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={handleCheckout}
                        disabled={isLoading || tierBlockedByClients || exceedsTopSaleTier}
                        className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-md transition hover:opacity-95 disabled:opacity-60 w-full md:w-auto md:min-w-[220px]"
                    >
                        {isLoading ? 'Redirigiendo...' : 'Continuar al pago con Mercado Pago'}
                    </button>

                    <button
                        type="button"
                        onClick={() => confirmSubscription(preapprovalIdFromUrl)}
                        disabled={isConfirming}
                        className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-6 text-sm font-semibold text-foreground hover:bg-secondary/40 disabled:opacity-60 dark:border-white/15 w-full md:w-auto"
                    >
                        {isConfirming ? 'Verificando...' : 'Ya pagué, verificar acceso'}
                    </button>
                </div>

                {canActivateFree && (
                    <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4 dark:border-white/10 dark:bg-zinc-800/50">
                        <div className="flex items-start gap-2">
                            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-foreground">Continuar con plan gratuito</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    Tenés {activeClientCount} alumno{activeClientCount !== 1 ? 's' : ''} activo{activeClientCount !== 1 ? 's' : ''}. El plan gratuito cubre hasta 3 alumnos — calificás sin archivar a nadie.
                                </p>
                                <button
                                    type="button"
                                    onClick={handleActivateFree}
                                    disabled={isActivatingFree}
                                    className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                >
                                    {isActivatingFree ? 'Activando...' : 'Activar plan gratuito (sin costo)'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </main>
    )
}
