'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Users } from 'lucide-react'
import {
    ADDON_CONFIG,
    ADDON_MODULE_KEYS,
    BILLING_CYCLE_CONFIG,
    FLOW_ENABLED,
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

    const handleCheckout = useCallback(async (gateway: 'mercadopago' | 'flow' = 'mercadopago') => {
        setIsLoading(true)
        setError(null)
        try {
            const response = await fetch('/api/payments/create-preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tier,
                    billingCycle,
                    gateway,
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
        <main className="mx-auto w-full max-w-2xl px-5 pb-12 pt-6">
            {/* TopBar — título · subtítulo (diseño Reactivar.jsx) */}
            <div className="mb-5">
                <h1 className="font-display text-xl font-extrabold leading-tight tracking-tight text-strong">Reactivar plan</h1>
                <p className="text-xs text-muted">Tu suscripción está pausada</p>
            </div>

            {subscriptionBlocked && (
                <div className="mb-3.5 flex items-start gap-2.5 rounded-card bg-[var(--warning-100)] px-3.5 py-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning-600)]" />
                    <div className="min-w-0 text-[13px]">
                        <p className="font-semibold text-strong">Acceso restringido</p>
                        <p className="mt-0.5 text-muted">
                            Tu cuenta quedó con un estado de suscripción que bloquea el panel. Al completar el pago,
                            recuperarás el acceso de inmediato.
                        </p>
                    </div>
                </div>
            )}

            {searchParams.get('from') === 'register' && (
                <div className="mb-3.5 flex items-center gap-2.5 rounded-card bg-[var(--success-100)] px-3.5 py-2.5">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success-600)]" />
                    <p className="text-[13px] font-semibold text-strong">
                        Cuenta creada. Te falta completar el pago para activar acceso total al dashboard.
                    </p>
                </div>
            )}

            {paymentStatus === 'failure' && (
                <div className="mb-3.5 flex items-center gap-2.5 rounded-card bg-[var(--danger-100)] px-3.5 py-2.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--danger-600)]" />
                    <p className="text-[13px] font-semibold text-strong">El pago no se completó. Puedes intentarlo nuevamente.</p>
                </div>
            )}

            {paymentStatus === 'pending' && (
                <div className="mb-3.5 flex items-center gap-2.5 rounded-card bg-[var(--warning-100)] px-3.5 py-2.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--warning-600)]" />
                    <p className="text-[13px] font-semibold text-strong">Tu pago quedó pendiente. Espera unos minutos y vuelve a verificar.</p>
                </div>
            )}

            {/* Banner warning (kit Reactivar): alumnos en pausa */}
            <div className="mb-4 flex items-center gap-3 rounded-card border border-[var(--warning-500)] bg-[var(--warning-100)] p-4">
                <AlertTriangle className="h-[22px] w-[22px] shrink-0 text-[var(--warning-600)]" />
                <p className="text-[13px] leading-snug text-[var(--warning-600)]">
                    {activeClientCount > 0 ? (
                        <>
                            Tus <strong>{activeClientCount} alumno{activeClientCount !== 1 ? 's' : ''}</strong> están en
                            pausa. Elige un plan para reactivar el acceso.
                        </>
                    ) : (
                        <>Sin un plan activo no puedes gestionar alumnos ni rutinas. Elige un plan para reactivar el acceso.</>
                    )}
                </p>
            </div>

            {/* Ciclo — pill segmentado centrado (kit Reactivar) */}
            <div className="mb-4 flex justify-center">
                <div className="inline-flex gap-1 rounded-full bg-surface-sunken p-[3px]">
                    {allowedCycleOptions.map(([key, option]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setBillingCycle(key)}
                            className={`min-h-[38px] rounded-full px-4 py-[7px] text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                billingCycle === key ? 'bg-surface-card text-strong shadow-sm' : 'text-muted hover:text-strong'
                            }`}
                        >
                            {option.label}
                            {option.discountPercent > 0 && (
                                <span className="ml-1 text-[11px] font-bold text-[var(--success-700)]">−{option.discountPercent}%</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tier — radio-cards (kit Reactivar) */}
            <div className="mb-4 flex flex-col gap-2.5">
                {tierOptions.map(([key, option]) => {
                    const tooSmall = option.maxClients < activeClientCount
                    const active = tier === key
                    return (
                        <button
                            key={key}
                            type="button"
                            disabled={tooSmall}
                            onClick={() => !tooSmall && setTier(key)}
                            title={tooSmall ? `Tienes ${activeClientCount} alumnos activos — este plan no los cubre` : undefined}
                            className={`flex items-center gap-3.5 rounded-control p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                                tooSmall
                                    ? 'cursor-not-allowed border-[1.5px] border-subtle bg-surface-card opacity-55'
                                    : active
                                    ? 'border-2 border-sport-500 bg-surface-card'
                                    : 'border border-subtle bg-surface-card hover:bg-surface-sunken'
                            }`}
                        >
                            <span
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                                    active ? 'bg-sport-500 text-white' : 'border-2 border-strong'
                                }`}
                                aria-hidden="true"
                            >
                                {active && <Check className="h-3.5 w-3.5" />}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                    <span className="font-display text-[17px] font-extrabold tracking-tight text-strong">{option.label}</span>
                                    {key === 'pro' && (
                                        <span className="inline-flex items-center rounded-full bg-sport-500 px-2 py-0.5 text-[10px] font-bold text-white">Popular</span>
                                    )}
                                </span>
                                <span className="block text-[12.5px] text-muted">Hasta {option.maxClients} alumnos</span>
                                {tooSmall && (
                                    <span className="block text-[12px] font-medium text-[var(--danger-600)]">
                                        No cubre tus {activeClientCount} alumnos
                                    </span>
                                )}
                            </span>
                            <span className="shrink-0 text-right">
                                <span className="eva-metric block text-[18px] text-strong">
                                    ${option.monthlyPriceClp.toLocaleString('es-CL')}
                                </span>
                                <span className="text-[11px] text-subtle">/mes</span>
                            </span>
                        </button>
                    )
                })}
            </div>

            {exceedsTopSaleTier ? (
                <div className="mb-4 flex items-start gap-2.5 rounded-card bg-[var(--sport-100)] px-3.5 py-3 text-[13px]">
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-sport-600" />
                    <div>
                        <p className="font-semibold text-strong">Tu cartera supera el plan más alto</p>
                        <p className="mt-0.5 text-muted">
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
                <div className="mb-4 flex items-start gap-2.5 rounded-card bg-[var(--danger-100)] px-3.5 py-3 text-[13px]">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger-600)]" />
                    <div>
                        <p className="font-semibold text-strong">Plan insuficiente</p>
                        <p className="mt-0.5 text-[var(--danger-600)]">
                            Debes archivar {activeClientCount - getTierMaxClients(tier)} alumno{activeClientCount - getTierMaxClients(tier) !== 1 ? 's' : ''} antes de continuar con Plan {selectedTier.label}.{' '}
                            <Link href="/coach/clients" className="underline font-medium">Ir a mis alumnos →</Link>
                        </p>
                    </div>
                </div>
            ) : null}

            {/* Ex-add-ons pre-marcados (deseleccionables) — plan 05 F5.6. Solo con la compra activa. */}
            {SELF_SERVICE_ADDONS_ENABLED && recentlyCancelledAddons.length > 0 && (
                <section className="mb-4">
                    <h2 className="px-1 text-[13px] font-bold uppercase tracking-wide text-muted">Volver a sumar tus módulos</h2>
                    <p className="mt-1 px-1 text-xs text-muted">
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
                                    className={`flex items-start gap-2 rounded-control border p-3 text-left transition ${
                                        requiresNutrition
                                            ? 'border-subtle bg-surface-card opacity-60'
                                            : checked
                                                ? 'border-sport-500 bg-sport-100/40 cursor-pointer'
                                                : 'border-subtle bg-surface-card hover:bg-surface-sunken cursor-pointer'
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
                                            <span className="text-sm font-semibold text-strong">{cfg.label}</span>
                                            <span className="shrink-0 text-xs font-semibold text-strong">
                                                ${cfg.priceClpMensual.toLocaleString('es-CL')} CLP / mes
                                            </span>
                                        </span>
                                        {requiresNutrition && (
                                            <span className="mt-1 inline-block text-[11px] font-medium text-[var(--warning-600)]">
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

            <section className="mb-4 rounded-card border border-subtle bg-surface-card p-4">
                <p className="text-sm text-muted">
                    Plan seleccionado: <span className="font-semibold text-strong">{selectedTier.label}</span>
                </p>
                <p className="mt-1 text-sm text-muted">
                    Precio: <span className="eva-metric text-strong">${selectedPrice.toLocaleString('es-CL')} CLP</span>
                    {billingCycle !== 'monthly' && (
                        <span className="ml-2 text-xs">(mensual base ${monthlyBase.toLocaleString('es-CL')} CLP)</span>
                    )}
                </p>
                {selectedAddons.length > 0 && (
                    <p className="mt-1 text-sm text-muted">
                        Módulos ({selectedAddons.map((k) => ADDON_CONFIG[k].label).join(', ')}):{' '}
                        <span className="font-semibold text-strong">+${addonsCycleTotal.toLocaleString('es-CL')} CLP</span>
                        {' · '}Total <span className="font-semibold text-strong">${(selectedPrice + addonsCycleTotal).toLocaleString('es-CL')} CLP</span>
                    </p>
                )}
                <ul className="mt-3 list-disc space-y-1 pl-4 text-sm text-muted">
                    {selectedTier.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                    ))}
                </ul>
            </section>

            {/* Canje de código de descuento (reactivación). Solo con tier pago + flag ON; el monto
                descontado lo aplica create-preference al "Continuar al pago". */}
            <ReactivateCouponCard tier={tier} billingCycle={billingCycle} couponsEnabled={couponsEnabled} />

            {error && (
                <div className="mt-4 flex items-center gap-2.5 rounded-control bg-[var(--danger-100)] px-3.5 py-2.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--danger-600)]" />
                    <p className="text-[13px] font-semibold text-strong">{error}</p>
                </div>
            )}

            <div className="mt-6 flex flex-col gap-2">
                <button
                    type="button"
                    onClick={() => void handleCheckout('mercadopago')}
                    disabled={isLoading || tierBlockedByClients || exceedsTopSaleTier}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-control bg-sport-500 px-5 text-sm font-bold text-white transition-colors hover:bg-sport-600 disabled:opacity-60 disabled:hover:bg-sport-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                    {isLoading ? 'Redirigiendo...' : (
                        <>
                            {FLOW_ENABLED && (
                                <Image src="/payments/mercadopago.svg" alt="" aria-hidden="true" width={18} height={18} />
                            )}
                            <span>Continuar al pago con Mercado Pago</span>
                            <ArrowRight className="h-4 w-4" />
                        </>
                    )}
                </button>

                {FLOW_ENABLED && (
                    <>
                        <button
                            type="button"
                            onClick={() => void handleCheckout('flow')}
                            disabled={isLoading || tierBlockedByClients || exceedsTopSaleTier}
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-control border border-default px-6 text-sm font-semibold text-strong hover:bg-surface-sunken transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        >
                            <Image
                                src="/payments/webpay-light.svg"
                                alt=""
                                aria-hidden="true"
                                width={73}
                                height={18}
                                className="dark:hidden"
                            />
                            <Image
                                src="/payments/webpay-dark.svg"
                                alt=""
                                aria-hidden="true"
                                width={73}
                                height={18}
                                className="hidden dark:block"
                            />
                            <span>Pagar con Webpay (Flow)</span>
                        </button>
                        <p className="text-xs text-muted">
                            Webpay procesado por Flow.cl — tarjetas de crédito, débito y prepago chilenas.
                        </p>
                    </>
                )}

                <button
                    type="button"
                    onClick={() => confirmSubscription(preapprovalIdFromUrl)}
                    disabled={isConfirming}
                    className="inline-flex h-11 w-full items-center justify-center rounded-control border border-default px-6 text-sm font-semibold text-strong hover:bg-surface-sunken disabled:opacity-60"
                >
                    {isConfirming ? 'Verificando...' : 'Ya pagué, verificar acceso'}
                </button>
            </div>

            {canActivateFree && (
                <div className="mt-6 rounded-card border border-subtle bg-surface-sunken px-4 py-4">
                    <div className="flex items-start gap-2.5">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success-600)]" />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-strong">Continuar con plan gratuito</p>
                            <p className="mt-0.5 text-xs text-muted">
                                Tienes {activeClientCount} alumno{activeClientCount !== 1 ? 's' : ''} activo{activeClientCount !== 1 ? 's' : ''}. El plan gratuito cubre hasta 3 alumnos — calificas sin archivar a nadie.
                            </p>
                            <button
                                type="button"
                                onClick={handleActivateFree}
                                disabled={isActivatingFree}
                                className="mt-3 inline-flex h-9 items-center justify-center rounded-control border border-default bg-surface-card px-4 text-xs font-semibold text-strong transition-colors hover:bg-surface-sunken disabled:opacity-60"
                            >
                                {isActivatingFree ? 'Activando...' : 'Activar plan gratuito (sin costo)'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Comparativa (riqueza extra sobre el kit) — re-tokenizada EVA DS */}
            <section className="mt-6 overflow-x-auto rounded-card border border-subtle">
                <h2 className="border-b border-subtle bg-surface-sunken px-4 py-3 text-sm font-semibold text-strong">
                    Comparativa rápida de planes
                </h2>
                <table className="w-full min-w-[520px] text-left text-sm">
                    <thead>
                        <tr className="border-b border-subtle text-xs font-semibold uppercase tracking-wide text-muted">
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
                                className={`border-b border-subtle last:border-0 ${tier === key ? 'bg-sport-100/40' : ''}`}
                            >
                                <td className="px-4 py-2.5 font-medium text-strong">{option.label}</td>
                                <td className="px-4 py-2.5 text-muted">{TIER_STUDENT_RANGE_LABEL[key]}</td>
                                <td className="px-4 py-2.5 text-strong">
                                    ${option.monthlyPriceClp.toLocaleString('es-CL')} CLP
                                </td>
                                <td className="px-4 py-2.5 text-xs text-muted">
                                    {getTierBillingCycleSummary(key)}
                                </td>
                                <td className="px-4 py-2.5 text-xs text-muted">
                                    {getTierNutritionSummary(key)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            <p className="mt-4 text-xs text-subtle">
                Pagos procesados por Mercado Pago (PCI). EVA no almacena los datos de tu tarjeta.
            </p>
        </main>
    )
}
