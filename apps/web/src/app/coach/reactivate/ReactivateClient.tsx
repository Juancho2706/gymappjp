'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Users } from 'lucide-react'
import {
    BILLING_CYCLE_CONFIG,
    FLOW_ENABLED,
    getDefaultBillingCycleForTier,
    getTierAllowedBillingCycles,
    getTierBillingCycleSummary,
    getTierNutritionSummary,
    getTierPriceClp,
    isBillingCycleAllowedForTier,
    isSaleTier,
    SALE_TIERS,
    SUBSCRIPTION_BLOCKED_STATUSES,
    TIER_CONFIG,
    type BillingCycle,
    type SaleTier,
    type SubscriptionTier,
} from '@/lib/constants'
import type { ModuleKey } from '@/services/entitlements.service'
import { resolveCheckoutError, type CheckoutErrorCopy } from '@/lib/payments/checkout-errors'
import { useCaptureCheckoutFailed, useCaptureCheckoutStarted } from '@/lib/posthog/events'
import { effectiveTierLimit } from '../_lib/effective-limit'
import { formatStudentAccessDate, resolveStudentGraceEndsAt } from '@/lib/student-access'
import { ReactivateCouponCard } from './_components/ReactivateCouponCard'
import {
    computeReactivatePrice,
    reactivateDiscountLabel,
    type ReactivateActiveDiscount,
} from './_lib/reactivate-price'
import { ReactivateArchivePanel, type ReactivateArchiveClient } from './_components/ReactivateArchivePanel'

// Solo se ofertan tiers a la venta (pricing v2: free/pro/elite — starter salió de la venta,
// mismo trato que growth/scale: LEGACY, grandfathered, fuera de la oferta).
const tierOptions = SALE_TIERS.map((key) => [key, TIER_CONFIG[key]] as const)
const cycleOptions = Object.entries(BILLING_CYCLE_CONFIG) as [
    BillingCycle,
    (typeof BILLING_CYCLE_CONFIG)[BillingCycle],
][]

interface ReactivateClientProps {
    currentTier: SubscriptionTier
    activeClientCount: number
    /** Alumnos standalone activos (archivables) — panel de salida del deadlock de cupo. */
    activeClients?: ReactivateArchiveClient[]
    subscriptionStatus: string | null
    /** Ancla de la gracia de ALUMNOS (period_end vigente al corte) para el banner de presion. */
    currentPeriodEnd?: string | null
    /** coaches.paid_access_ended_at (migracion B-datos) — gana sobre currentPeriodEnd al anclar. */
    paidAccessEndedAt?: string | null
    /**
     * Ex-add-ons pagos cancelados recientemente. OBSOLETO (CEO 2026-07-17): los módulos vienen
     * incluidos en los planes pagos y ya no se recompran al reactivar. Se acepta por
     * compatibilidad con el server page, pero la UI lo ignora.
     */
    recentlyCancelledAddons?: ModuleKey[]
    /** Flag de cupones (COUPON_REDEMPTION_ENABLED) leído server-side: muestra el canje de código. */
    couponsEnabled?: boolean
    /**
     * Cupón YA VIVO del coach (no el que se tipea acá), resuelto server-side con la RPC
     * `resolve_active_discount` — la MISMA redención que `create-preference` re-resuelve para
     * hornear el monto del checkout. Con esto el precio se muestra descontado ANTES de ir a la
     * pasarela (el coach bloqueado veía $29.990 y recién pagaba $14.995 en Flow). null = sin cupón
     * ⇒ la pantalla queda exactamente como antes.
     */
    activeDiscount?: ReactivateActiveDiscount | null
    /**
     * `coaches.created_at` — ancla de la escalera de grandfather (3 peldaños: pre-v2 3 · v2 2 ·
     * v3 1). Se usa SOLO para proyectar los tiers que el coach todavía no tiene: es lo que el
     * write-path grabará en `max_clients` si contrata ese plan. null ⇒ fail-safe generoso.
     */
    coachCreatedAt?: string | null
    /**
     * `coaches.max_clients` — el cupo REAL del coach en su tier ACTUAL.
     *
     * En Pricing v3 el grandfather vive en esta COLUMNA, no en la fecha: el backfill del día D
     * (2026-08-21) bajó a 1 solo a los free con 0/1 alumnos y dejó su fila intacta a los que ya
     * tenían 2+ (conservan el cupo por USO). Por eso un coach viejo en free con columna 3 debe
     * seguir viendo «Free: hasta 3» acá — y no el 1 del catálogo ni el 3 de la escalera por
     * casualidad. null/ausente ⇒ se cae a la escalera de fecha.
     */
    coachMaxClients?: number | null
}

export function ReactivateClient({ currentTier, activeClientCount, activeClients = [], subscriptionStatus, currentPeriodEnd = null, paidAccessEndedAt = null, couponsEnabled = false, coachCreatedAt = null, coachMaxClients = null, activeDiscount = null }: ReactivateClientProps) {
    const searchParams = useSearchParams()
    // E1 (P8): checkout_started gated por consentimiento (no-op si el coach no acepto cookies).
    const captureCheckoutStarted = useCaptureCheckoutStarted()
    // Gemelo de checkout_started (A3): sin esto, un checkout que muere ANTES de la pasarela es
    // indistinguible en el embudo de uno que el coach abandono en MercadoPago. Esta es la puerta
    // MAS transitada del checkout — el gate de suscripcion deposita aca a todo coach en
    // `pending_payment` y el auto-arranque de `?from=register` dispara solo.
    const captureCheckoutFailed = useCaptureCheckoutFailed()

    // Límite REAL de alumnos de ESTE coach por tier — jamás el catálogo plano. Pricing v3: para el
    // tier ACTUAL manda la COLUMNA (ahí vive el grandfather tras el backfill por uso del 21-08); la
    // escalera de fecha solo proyecta los tiers que aún no tiene, que es exactamente lo que el
    // write-path (activate-free / confirms de pago) escribirá en `max_clients` al contratarlos.
    const limitFor = useCallback(
        (t: SubscriptionTier) =>
            effectiveTierLimit({ tier: t, currentTier, coachMaxClients, coachCreatedAt }),
        [coachCreatedAt, coachMaxClients, currentTier]
    )

    // Pre-select the minimum viable tier for the coach's current client count,
    // anchored to their actual tier. Los tiers fuera de venta anclan al vecino de la lista
    // (la reactivacion publica nunca resucita un tier muerto): starter (pricing v2) y sus
    // deep-links viejos (?tier=starter / starter_lite) anclan a 'pro'; growth/scale a 'elite'
    // (quien supere elite ve el puente a Teams, no un auto-bump).
    const initialTier = useMemo<SaleTier>(() => {
        const raw = searchParams.get('tier')
        const queryTier = raw === 'starter_lite' || raw === 'starter' ? 'pro' : raw
        // starter se chequea ANTES de isSaleTier: el guard tipa SaleTier (que aún incluye starter
        // por compat) pero en runtime devuelve false para starter — chequearlo después haría que
        // TS lo crea inalcanzable (TS2367) aunque es el caso real del grandfathered.
        const candidate: SaleTier =
            queryTier && isSaleTier(queryTier)
                ? queryTier
                : currentTier === 'starter'
                ? 'pro'
                : isSaleTier(currentTier)
                ? currentTier
                : 'elite'
        // If the candidate can't cover current clients, bump up to the minimum viable sale tier.
        // Si ni siquiera elite (el techo de venta) los cubre, anclamos a elite y la UI muestra
        // el bloque "conversemos de EVA Teams" (boton de pago deshabilitado). Los límites son los
        // del COACH (columna en su tier actual, escalera en los demás), no el catálogo: un pro viejo
        // con columna 30 y 28 alumnos sigue cabiendo en Pro.
        if (limitFor(candidate) < activeClientCount) {
            return SALE_TIERS.find((t) => limitFor(t) >= activeClientCount) ?? 'elite'
        }
        return candidate
    }, [searchParams, currentTier, activeClientCount, limitFor])

    const [tier, setTier] = useState<SaleTier>(initialTier)
    const [billingCycle, setBillingCycle] = useState<BillingCycle>(() => {
        const queryCycle = searchParams.get('cycle')
        if (queryCycle && queryCycle in BILLING_CYCLE_CONFIG) return queryCycle as BillingCycle
        return 'monthly'
    })
    const [isLoading, setIsLoading] = useState(false)
    const [isConfirming, setIsConfirming] = useState(false)
    const [isActivatingFree, setIsActivatingFree] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // P1 — copy humano del fallo del CHECKOUT (código del server → mensaje + salidas). Convive con
    // `error`, que sigue sirviendo a confirm-subscription y activate-free: esos mensajes ya eran
    // humanos y no traen `code`. Lo que este estado mata es el JSON crudo del gateway pintado en el
    // banner rojo — esta era la última puerta del checkout que todavía se lo mostraba al coach.
    const [errorCopy, setErrorCopy] = useState<CheckoutErrorCopy | null>(null)
    // Medio del último intento: "Reintentar" repite el MISMO medio que falló.
    const [lastGateway, setLastGateway] = useState<'mercadopago' | 'flow'>('mercadopago')
    const hasAutoCheckedRef = useRef(false)
    const hasAutoStartedCheckoutRef = useRef(false)
    const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const selectedTier = useMemo(() => TIER_CONFIG[tier], [tier])
    const selectedPrice = useMemo(() => getTierPriceClp(tier, billingCycle), [tier, billingCycle])
    const monthlyBase = useMemo(() => TIER_CONFIG[tier].monthlyPriceClp, [tier])
    // Precio del tier/ciclo elegido CON el cupón vivo aplicado, por la MISMA fn pura
    // (`computeDiscountedClp`) con la que `getCompositeAmountClp` hornea el monto que cobra
    // `create-preference` ⇒ mostrado == cobrado, sin drift. Sin cupón: list == net (UI intacta).
    const selectedPriceView = useMemo(
        () => computeReactivatePrice(selectedPrice, activeDiscount),
        [selectedPrice, activeDiscount]
    )
    const hasDiscount = selectedPriceView.discountClp > 0
    // La radio-card pinta el número MENSUAL: un `fixed_clp` es un monto por COBRO, así que
    // prorratearlo a "por mes" en un ciclo trimestral/anual mentiría. El % sí es proporcional.
    // Fuera de ese caso la card muestra lista y el resumen de abajo lleva el neto real del ciclo.
    const cardDiscount = useMemo(() => {
        if (!activeDiscount) return null
        return activeDiscount.type === 'percent' || billingCycle === 'monthly' ? activeDiscount : null
    }, [activeDiscount, billingCycle])
    const allowedCycleOptions = useMemo(
        () => cycleOptions.filter(([key]) => getTierAllowedBillingCycles(tier).includes(key)),
        [tier]
    )

    const tierBlockedByClients = useMemo(() => limitFor(tier) < activeClientCount, [tier, activeClientCount, limitFor])

    // La cartera supera el plan mas alto a la venta (elite, con SU límite grandfathered): ya no hay
    // tier al que auto-subir (growth/scale fuera de venta). Puente a EVA Teams y pago deshabilitado.
    const exceedsTopSaleTier = useMemo(
        () => activeClientCount > limitFor('elite'),
        [activeClientCount, limitFor]
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
        if (!silent) {
            setError(null)
            setErrorCopy(null)
        }
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
        setErrorCopy(null)
        setLastGateway(gateway)
        // E1 (P8): funnel de checkout — el coach confirmo la reactivacion y se va a pedir la
        // preference/enrolamiento. Gated por consentimiento (no-op sin opt-in), sin PII.
        captureCheckoutStarted({ tier, billingCycle, gateway, source: 'reactivate' })
        // Causa estable para checkout_failed. Se fija ANTES de cada throw porque el catch solo ve el
        // Error (el `code` del server viaja en el payload, no en el mensaje). 'unknown' = ni siquiera
        // hubo respuesta parseable (red caida / JSON roto). Mismo vocabulario que `processing/page.tsx`.
        let failureCode = 'unknown'
        try {
            const response = await fetch('/api/payments/create-preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tier,
                    billingCycle,
                    gateway,
                    // Sin add-ons: los módulos vienen incluidos en el plan (CEO 2026-07-17).
                }),
            })
            const raw = await response.text()
            const payload = raw ? JSON.parse(raw) : {}
            if (!response.ok) {
                failureCode = typeof payload.code === 'string' ? payload.code : `http_${response.status}`
                throw new Error(payload.error ?? 'No se pudo iniciar el pago.')
            }
            if (!payload.checkoutUrl) {
                failureCode = 'missing_checkout_url'
                throw new Error('No se recibió URL de pago.')
            }
            window.location.href = payload.checkoutUrl
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Error inesperado'
            captureCheckoutFailed({
                tier,
                billingCycle,
                gateway,
                source: 'reactivate',
                code: failureCode,
                message,
            })
            // P1: el coach ve un mensaje humano y una salida, nunca el JSON crudo del gateway.
            // Webpay se ofrece como plan B solo si el flag está encendido Y no es el medio que
            // acaba de fallar: la reactivación NO es `isActiveUpgrade`, así que create-preference
            // la acepta por Flow (route.ts:203-227) — el botón que se ofrece existe de verdad.
            setErrorCopy(
                resolveCheckoutError({
                    code: failureCode,
                    message,
                    flowAvailable: FLOW_ENABLED && gateway !== 'flow',
                })
            )
        } finally {
            setIsLoading(false)
        }
    }, [billingCycle, captureCheckoutFailed, captureCheckoutStarted, tier])

    const handleActivateFree = useCallback(async () => {
        setIsActivatingFree(true)
        setError(null)
        setErrorCopy(null)
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
        // Free no tiene checkout: jamás auto-disparar create-preference con tier='free' (el enum
        // del server solo acepta pro/elite y respondería 400).
        const canAutostart = fromRegister && !fromSuccessfulCheckout && !paymentStatus && tier !== 'free'
        if (!canAutostart || hasAutoStartedCheckoutRef.current) return
        hasAutoStartedCheckoutRef.current = true
        void handleCheckout()
    }, [fromSuccessfulCheckout, handleCheckout, paymentStatus, searchParams, tier])

    // Cupo free de ESTE coach: si YA está en free manda su columna (grandfather por uso de
    // Pricing v3); si viene de un plan pago se proyecta con la escalera (pre-v2 3 · v2 2 · v3 1).
    // El server (activate-free) revalida contra la misma fuente — mostrado == aplicado.
    const freeLimit = limitFor('free')
    // Cualquier estado bloqueado que canda el panel (expired/pending_payment/past_due/paused pasada
    // la gracia) sufre el mismo deadlock de cupo. El gate de dinero real lo re-valida el endpoint.
    const isBlockedStatus = (SUBSCRIPTION_BLOCKED_STATUSES as readonly string[]).includes(subscriptionStatus ?? '')
    const canActivateFree = activeClientCount <= freeLimit && isBlockedStatus

    // Salida del deadlock de cupo: coach bloqueado + sobre-cupo puede archivar hasta ≤3 y volver
    // a Free sin pagar (solo si hay alumnos archivables). El flip real lo cierra activate-free.
    const canGoFreeByArchiving =
        activeClientCount > freeLimit &&
        activeClients.length > 0 &&
        isBlockedStatus

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

            {/* Banner warning (kit Reactivar): alumnos con fecha de corte. Politica CEO 2026-07-18:
                los alumnos conservan acceso 7 dias post fin del periodo pagado (coalesce
                paid_access_ended_at → current_period_end) y luego quedan en solo-lectura. La presion
                de reactivar vive AQUI (el banner del alumno es discreto y sin countdown). Sin ancla
                de fecha => copy generico (degradacion, p.ej. period_end NULLeado sin backfill). */}
            {(() => {
                const graceEndsAt = resolveStudentGraceEndsAt(paidAccessEndedAt, currentPeriodEnd)
                const graceActive = graceEndsAt != null && graceEndsAt.getTime() > Date.now()
                return (
                    <div className="mb-4 flex items-center gap-3 rounded-card border border-[var(--warning-500)] bg-[var(--warning-100)] p-4">
                        <AlertTriangle className="h-[22px] w-[22px] shrink-0 text-[var(--warning-600)]" />
                        <p className="text-[13px] leading-snug text-[var(--warning-600)]">
                            {activeClientCount > 0 && graceEndsAt ? (
                                graceActive ? (
                                    <>
                                        Tus <strong>{activeClientCount} alumno{activeClientCount !== 1 ? 's' : ''}</strong> perderán
                                        acceso el <strong>{formatStudentAccessDate(graceEndsAt)}</strong>. Elige un plan para
                                        reactivar antes del corte.
                                    </>
                                ) : (
                                    <>
                                        Tus <strong>{activeClientCount} alumno{activeClientCount !== 1 ? 's' : ''}</strong> quedaron
                                        en solo-lectura el <strong>{formatStudentAccessDate(graceEndsAt)}</strong>: ven su plan e
                                        historial, pero no pueden registrar. Elige un plan para devolverles el acceso.
                                    </>
                                )
                            ) : activeClientCount > 0 ? (
                                <>
                                    Tus <strong>{activeClientCount} alumno{activeClientCount !== 1 ? 's' : ''}</strong> están en
                                    pausa. Elige un plan para reactivar el acceso.
                                </>
                            ) : (
                                <>Sin un plan activo no puedes gestionar alumnos ni rutinas. Elige un plan para reactivar el acceso.</>
                            )}
                        </p>
                    </div>
                )
            })()}

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
                    // Límite del COACH para este tier (columna si es su tier actual, escalera si
                    // es un plan al que se movería), no el del catálogo de venta.
                    const coachLimit = limitFor(key)
                    const tooSmall = coachLimit < activeClientCount
                    const active = tier === key
                    // Neto del cupón vivo SOLO en la card seleccionada (es el plan que se cobra).
                    // Sin cupón, `netClp === option.monthlyPriceClp` y el render es el de siempre.
                    const cardPrice = computeReactivatePrice(option.monthlyPriceClp, active ? cardDiscount : null)
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
                                <span className="block text-[12.5px] text-muted">Hasta {coachLimit} alumno{coachLimit !== 1 ? 's' : ''}</span>
                                {tooSmall && (
                                    <span className="block text-[12px] font-medium text-[var(--danger-600)]">
                                        No cubre tus {activeClientCount} alumnos
                                    </span>
                                )}
                            </span>
                            <span className="shrink-0 text-right">
                                {cardPrice.discountClp > 0 && (
                                    <span className="block text-[12px] text-muted line-through">
                                        ${cardPrice.listClp.toLocaleString('es-CL')}
                                    </span>
                                )}
                                <span className="eva-metric block text-[18px] text-strong">
                                    ${cardPrice.netClp.toLocaleString('es-CL')}
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
                            Debes archivar {activeClientCount - limitFor(tier)} alumno{activeClientCount - limitFor(tier) !== 1 ? 's' : ''} antes de continuar con Plan {selectedTier.label}.{' '}
                            <a href="#reactivate-archive" className="underline font-medium">Archivar alumnos aquí →</a>
                        </p>
                    </div>
                </div>
            ) : null}

            {canGoFreeByArchiving && (
                <ReactivateArchivePanel
                    clients={activeClients}
                    activeClientCount={activeClientCount}
                    freeLimit={freeLimit}
                />
            )}

            <section className="mb-4 rounded-card border border-subtle bg-surface-card p-4">
                <p className="text-sm text-muted">
                    Plan seleccionado: <span className="font-semibold text-strong">{selectedTier.label}</span>
                </p>
                <p className="mt-1 text-sm text-muted">
                    Precio:{' '}
                    {hasDiscount && (
                        <>
                            <span className="eva-metric text-muted line-through">
                                ${selectedPriceView.listClp.toLocaleString('es-CL')}
                            </span>{' '}
                        </>
                    )}
                    <span className="eva-metric text-strong">${selectedPriceView.netClp.toLocaleString('es-CL')} CLP</span>
                    {billingCycle !== 'monthly' && (
                        <span className="ml-2 text-xs">(mensual base ${monthlyBase.toLocaleString('es-CL')} CLP)</span>
                    )}
                </p>
                {hasDiscount && activeDiscount && (
                    <p className="mt-1.5">
                        <span className="inline-flex items-center rounded-full bg-[var(--success-100)] px-2.5 py-0.5 text-[11.5px] font-bold text-[var(--success-700)]">
                            {reactivateDiscountLabel(activeDiscount, selectedPriceView.discountClp)}
                        </span>
                    </p>
                )}
                <p className="mt-1 text-sm text-muted">
                    Módulos profesionales: <span className="font-semibold text-[var(--success-600)]">incluidos en tu plan</span>
                </p>
                <ul className="mt-3 list-disc space-y-1 pl-4 text-sm text-muted">
                    {selectedTier.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                    ))}
                </ul>
            </section>

            {/* Canje de código de descuento (reactivación). Solo con tier pago + flag ON; el monto
                descontado lo aplica create-preference al "Continuar al pago". */}
            <ReactivateCouponCard tier={tier} billingCycle={billingCycle} couponsEnabled={couponsEnabled} />

            {/* Fallo del CHECKOUT: título + qué pasó + qué hacer + salidas, mismo contrato de copy
                que `/coach/subscription/processing` (las acciones las decide `resolveCheckoutError`,
                no esta pantalla). El banner plano de abajo se conserva intacto para los mensajes de
                confirm-subscription / activate-free, que ya eran humanos y no traen código. */}
            {errorCopy ? (
                <div className="mt-4 flex items-start gap-2.5 rounded-control bg-[var(--danger-100)] px-3.5 py-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger-600)]" />
                    <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-strong">{errorCopy.title}</p>
                        <p className="mt-0.5 text-[13px] text-muted">{errorCopy.message}</p>
                        {errorCopy.hint && (
                            <p className="mt-1 text-xs text-muted">{errorCopy.hint}</p>
                        )}
                        {errorCopy.actions.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-2">
                                {errorCopy.actions.map((action, i) =>
                                    action.kind === 'contact' ? (
                                        <a
                                            key={action.kind}
                                            href={action.href}
                                            className={
                                                i === 0
                                                    ? 'inline-flex h-9 items-center justify-center rounded-control bg-sport-500 px-4 text-xs font-semibold text-white transition-colors hover:bg-sport-600'
                                                    : 'inline-flex h-9 items-center justify-center rounded-control border border-default bg-surface-card px-4 text-xs font-semibold text-strong transition-colors hover:bg-surface-sunken'
                                            }
                                        >
                                            {action.label}
                                        </a>
                                    ) : (
                                        <button
                                            key={action.kind}
                                            type="button"
                                            disabled={isLoading}
                                            onClick={() =>
                                                void handleCheckout(
                                                    action.kind === 'try_flow' ? 'flow' : lastGateway
                                                )
                                            }
                                            className={
                                                i === 0
                                                    ? 'inline-flex h-9 items-center justify-center rounded-control bg-sport-500 px-4 text-xs font-semibold text-white transition-colors hover:bg-sport-600 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                                                    : 'inline-flex h-9 items-center justify-center rounded-control border border-default bg-surface-card px-4 text-xs font-semibold text-strong transition-colors hover:bg-surface-sunken disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                                            }
                                        >
                                            {action.label}
                                        </button>
                                    )
                                )}
                            </div>
                        )}
                    </div>
                </div>
            ) : error ? (
                <div className="mt-4 flex items-center gap-2.5 rounded-control bg-[var(--danger-100)] px-3.5 py-2.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--danger-600)]" />
                    <p className="text-[13px] font-semibold text-strong">{error}</p>
                </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-2">
                {tier === 'free' ? (
                    <>
                        {/* Free no pasa por checkout (el enum de create-preference solo acepta pro/elite):
                            la salida es activate-free, que revalida server-side estado bloqueado + cupo
                            (escribe max_clients con tierMaxClientsFor, la escalera de 3 peldaños). */}
                        <button
                            type="button"
                            onClick={handleActivateFree}
                            disabled={isActivatingFree || tierBlockedByClients || !isBlockedStatus}
                            title={!isBlockedStatus ? 'Disponible cuando tu suscripción quede vencida o pausada.' : undefined}
                            className="flex h-12 w-full items-center justify-center gap-2 rounded-control bg-sport-500 px-5 text-sm font-bold text-white transition-colors hover:bg-sport-600 disabled:opacity-60 disabled:hover:bg-sport-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        >
                            {isActivatingFree ? 'Activando...' : (
                                <>
                                    <span>Activar plan gratuito (sin costo)</span>
                                    <ArrowRight className="h-4 w-4" />
                                </>
                            )}
                        </button>
                        <p className="text-xs text-muted">
                            El plan gratuito cubre hasta {freeLimit} alumno{freeLimit !== 1 ? 's' : ''} activo{freeLimit !== 1 ? 's' : ''}. Tus datos y tu historial quedan intactos.
                        </p>
                    </>
                ) : (
                <>
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
                                {/* Límite del COACH: su columna `max_clients` si ya está en free
                                    (grandfather por uso, Pricing v3), si no la escalera de fecha. */}
                                Tienes {activeClientCount} alumno{activeClientCount !== 1 ? 's' : ''} activo{activeClientCount !== 1 ? 's' : ''}. Tu plan gratuito cubre hasta {freeLimit} alumno{freeLimit !== 1 ? 's' : ''} — calificas sin archivar a nadie.
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
                                {/* Límite del COACH por tier (columna en el actual, escalera en los
                                    demás) — no el label del catálogo de venta. */}
                                <td className="px-4 py-2.5 text-muted">Hasta {limitFor(key)} alumno{limitFor(key) !== 1 ? 's' : ''}</td>
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
