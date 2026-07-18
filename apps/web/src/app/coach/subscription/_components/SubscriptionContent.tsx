'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import {
    ADDON_CONFIG,
    ADDON_MODULE_KEYS,
    BILLING_CYCLE_CONFIG,
    comparePlanDirection,
    FLOW_ENABLED,
    getDefaultBillingCycleForTier,
    getTierAllowedBillingCycles,
    getTierCapabilities,
    getTierMaxClients,
    getTierPriceClp,
    computeDiscountedClp,
    isBillingCycleAllowedForTier,
    isSaleTier,
    SALE_TIERS,
    TIER_CONFIG,
    TIER_STUDENT_RANGE_LABEL,
    type BillingCycle,
    type DiscountSpec,
    type SaleTier,
    type SubscriptionTier,
} from '@/lib/constants'
import type { ModuleKey } from '@/services/entitlements.service'
import Link from 'next/link'
import { Check, CheckCircle2, Info, Lock, ArrowLeft, ArrowRight, CreditCard, HeartPulse, Activity, Ruler, Utensils, X, type LucideIcon } from 'lucide-react'
import { CouponRedeemCard } from './CouponRedeemCard'

const TIER_BADGE: Partial<Record<SubscriptionTier, { label: string; cls: string }>> = {
    pro:    { label: 'Más popular', cls: 'bg-violet-500/15 text-violet-400' },
    growth: { label: 'Nuevo',       cls: 'bg-emerald-500/15 text-emerald-400' },
}

// Icono por módulo add-on (espejo del kit de diseño Suscripcion.jsx).
const ADDON_ICON: Record<ModuleKey, LucideIcon> = {
    cardio: HeartPulse,
    movement_assessment: Activity,
    body_composition: Ruler,
    nutrition_exchanges: Utensils,
}

// Etiqueta legible de la marca a partir del payment_method_id de MercadoPago (P1-8): 'debvisa' es un id
// de máquina, no una marca. Fallback: el id capitalizado.
const MP_BRAND_LABEL: Record<string, string> = {
    visa: 'Visa', debvisa: 'Visa débito',
    master: 'Mastercard', debmaster: 'Mastercard débito',
    amex: 'American Express', diners: 'Diners',
    maestro: 'Maestro', magna: 'Magna', naranja: 'Naranja', cabal: 'Cabal',
}
function mpBrandLabel(pmid: string | null | undefined): string {
    if (!pmid) return ''
    return MP_BRAND_LABEL[pmid.toLowerCase()] ?? pmid.charAt(0).toUpperCase() + pmid.slice(1)
}

type CoachSubscription = {
    id: string
    subscription_tier: string
    subscription_status: string
    max_clients: number
    billing_cycle: string
    current_period_end: string | null
    payment_provider: string
    // Gateway PERSISTIDO de la sub viva (T5.5): decide si "Cambiar" muestra el form MP o el boton de
    // re-enrolamiento Webpay. NUNCA inferido del `payment_provider` legado (no siempre reflejaba Flow).
    subscription_provider?: string
    card_last4?: string | null
    card_brand?: string | null
}
type SubscriptionEvent = {
    id: string
    provider_status: string | null
    provider: string
    created_at: string
    provider_checkout_id: string | null
    payload: unknown
}

// Espejo de domain/billing CoachAddon (solo lo que la UI necesita; el endpoint expone más).
type CoachAddonView = {
    id: string
    moduleKey: ModuleKey
    status: 'active' | 'cancel_pending' | 'cancelled'
    source: 'self_service' | 'admin_grant'
    firstChargedAt: string | null
    expiresAt: string | null
}
// billing compuesto del endpoint — la UI NUNCA calcula precios por su cuenta (plan 05 F5.3).
type BillingBreakdown = { baseClp: number; addonsClp: number; totalClp: number }

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

// Solo tiers a la venta. Free excluido — el coach no puede bajar manualmente a free (es
// automatico al cancelar). growth/scale fuera de venta (LEGACY): no se ofertan para cambiar.
const tierOptions = SALE_TIERS.filter((t) => t !== 'free')
const cycleOptions = Object.keys(BILLING_CYCLE_CONFIG) as BillingCycle[]

export function SubscriptionContent({ embedded = false }: { embedded?: boolean }) {
    const router = useRouter()
    const searchParams = useSearchParams()
    // Refs para hacer scroll-into-view del banner relevante al setearse (off-screen en móvil).
    const blockedMsgRef = useRef<HTMLDivElement | null>(null)
    const feedbackBannerRef = useRef<HTMLDivElement | null>(null)
    // id estable para semántica de diálogo / aria del modal hecho a mano.
    const upgradeModalTitleId = useId()
    // Restaurar el foco al disparador del modal al cerrarlo (a11y de diálogo).
    const modalTriggerRef = useRef<HTMLElement | null>(null)
    const [coach, setCoach] = useState<CoachSubscription | null>(null)
    // Flag server-only del cambio de tarjeta — llega del endpoint subscription-status (no NEXT_PUBLIC).
    const [changeCardEnabled, setChangeCardEnabled] = useState(false)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // Motivo visible cuando el coach clickea una card de plan bloqueada (cupo / nutrición).
    const [blockedMsg, setBlockedMsg] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)
    const [reason, setReason] = useState('')
    // Panel de cancelación (diseño: ghost danger al pie que revela el motivo). Conserva handleCancel.
    const [showCancelPanel, setShowCancelPanel] = useState(false)
    const [selectedTier, setSelectedTier] = useState<SubscriptionTier>('starter')
    const [selectedCycle, setSelectedCycle] = useState<BillingCycle>('monthly')
    const [events, setEvents] = useState<SubscriptionEvent[]>([])
    const [showUpgradeConfirm, setShowUpgradeConfirm] = useState(false)
    // Alumnos activos standalone (del endpoint) — bloquea downgrades que no caben (OVER_CAPACITY).
    const [activeClientCount, setActiveClientCount] = useState(0)

    // ── Add-ons EXISTENTES (solo lectura — money-safety) ──────────────────────
    // Decisión CEO 2026-07-17: los módulos vienen incluidos en los planes pagos y ya NO se
    // compran/activan/desactivan acá. Las filas coach_addons vivas (cortesías / históricas)
    // se conservan y siguen sumando al desglose: por eso `addons` sigue leyéndose del endpoint.
    const [addons, setAddons] = useState<CoachAddonView[]>([])
    const [billing, setBilling] = useState<BillingBreakdown | null>(null)
    // Cupón vivo (F5): spec re-resuelto server-side → la UI computa el precio descontado de cualquier
    // tier/cycle con la MISMA fn pura (computeDiscountedClp) que cobra el server (mostrado == cobrado).
    const [activeCoupon, setActiveCoupon] = useState<{ code: string | null; discountClp: number; spec: DiscountSpec } | null>(null)

    useEffect(() => {
        let isMounted = true
        ;(async () => {
            setLoading(true)
            try {
                const response = await fetch('/api/payments/subscription-status')
                const payload = await response.json()
                if (!response.ok) throw new Error(payload.error ?? 'No se pudo cargar la suscripción')
                if (!isMounted) return
                // Coaches gestionados por una org O por un team (pool plano) no tienen billing
                // self-service: su plan/módulos los fija el contrato. Redirigimos ambos al dashboard.
                if (
                    payload.coach?.subscription_status === 'org_managed' ||
                    payload.coach?.subscription_status === 'team_managed'
                ) {
                    router.replace('/coach/dashboard')
                    return
                }
                setCoach(payload.coach)
                setChangeCardEnabled(payload.changeCardEnabled === true)
                setEvents(Array.isArray(payload.events) ? payload.events : [])
                setAddons(Array.isArray(payload.addons) ? payload.addons : [])
                setBilling(payload.billing ?? null)
                setActiveCoupon(payload.activeCoupon ?? null)
                setActiveClientCount(typeof payload.activeClientCount === 'number' ? payload.activeClientCount : 0)
                const tier = payload.coach.subscription_tier as SubscriptionTier
                const cycle = payload.coach.billing_cycle as BillingCycle
                // Pre-seleccion para la lista de venta (starter/pro/elite):
                //  - un tier de venta pago (starter/pro/elite) se pre-selecciona a si mismo;
                //  - un tier legacy (growth/scale, fuera de venta) ancla a 'elite' — sin esto un
                //    grandfathered abriria con selectedTier='growth', que ya no se renderiza, y
                //    "Continuar" mandaria un tier que create-preference rechaza (400);
                //  - free / desconocido cae al default 'starter' (el pago mas economico de la lista).
                const preselectTier: SaleTier =
                    tier && isSaleTier(tier) && tier !== 'free'
                        ? tier
                        : tier === 'growth' || tier === 'scale'
                        ? 'elite'
                        : 'starter'
                setSelectedTier(preselectTier)
                if (cycle && cycle in BILLING_CYCLE_CONFIG) {
                    setSelectedCycle(
                        isBillingCycleAllowedForTier(preselectTier, cycle)
                            ? cycle
                            : getDefaultBillingCycleForTier(preselectTier)
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
    }, [router])

    // ── Feedback post-checkout (issue #2) ─────────────────────────────────────
    // Al volver de Mercado Pago, las pantallas de procesamiento redirigen acá con un query param
    // (?addon=success|failure|pending / ?upgrade=success|failure|pending). Sin esto el coach que
    // acaba de pagar aterriza sin acuse de recibo. Mostramos el banner correspondiente, refrescamos
    // el estado (para que el nuevo tier/módulo aparezca) y limpiamos el param para que un refresh no
    // lo re-muestre. Los valores exactos vienen de addon-processing/upgrade-processing + create-preference.
    const checkoutFeedbackHandledRef = useRef(false)
    useEffect(() => {
        if (checkoutFeedbackHandledRef.current) return
        const addon = searchParams.get('addon')
        const upgrade = searchParams.get('upgrade')
        // 'success' = swap MP (Secure Fields, síncrono) · 'updated' = vuelta del redirect de
        // re-enrolamiento Webpay (Flow, T5.5). Mismo banner: para el coach es el mismo resultado.
        const card = searchParams.get('card')
        if (!addon && !upgrade && !card) return
        checkoutFeedbackHandledRef.current = true

        if (addon === 'success') {
            setError(null)
            setSuccessMessage('Tu módulo quedó activo y se suma a tu próximo cobro.')
            void refreshStatus()
        } else if (addon === 'pending') {
            setSuccessMessage(null)
            setError('Tu pago del módulo está siendo procesado. El módulo se activará apenas Mercado Pago confirme el cobro; vuelve a revisar en unos minutos.')
            void refreshStatus()
        } else if (addon === 'failure') {
            setSuccessMessage(null)
            setError('No se pudo completar el pago del módulo. No se realizó ningún cobro.')
        }

        if (upgrade === 'success') {
            setError(null)
            setSuccessMessage('Plan actualizado.')
            void refreshStatus()
        } else if (upgrade === 'pending') {
            setSuccessMessage(null)
            setError('Tu cambio de plan está siendo procesado. El nuevo plan se activará apenas Mercado Pago confirme el cobro; vuelve a revisar en unos minutos.')
            void refreshStatus()
        } else if (upgrade === 'failure') {
            setSuccessMessage(null)
            setError('No se pudo completar el cambio de plan. No se realizó ningún cobro. Puedes intentarlo nuevamente.')
        }

        if (card === 'success' || card === 'updated') {
            setError(null)
            setSuccessMessage('Tarjeta actualizada correctamente.')
            void refreshStatus()
        }

        // Limpiar el param para que un refresh no re-muestre el banner.
        router.replace('/coach/subscription')
    }, [searchParams, router])

    const allowedCycles = getTierAllowedBillingCycles(selectedTier)
    const allowedCycleOptions = cycleOptions.filter((cycle) => allowedCycles.includes(cycle))

    // Scroll del banner de feedback (éxito/error) a la vista al setearse (issue #3): se renderiza al
    // final de la página, off-screen en móvil cuando se dispara desde un control de más arriba.
    useEffect(() => {
        if (!error && !successMessage) return
        feedbackBannerRef.current?.scrollIntoView({ block: 'nearest' })
    }, [error, successMessage])

    // Scroll del banner ámbar de bloqueo a la vista al setearse (issue #3).
    useEffect(() => {
        if (!blockedMsg) return
        blockedMsgRef.current?.scrollIntoView({ block: 'nearest' })
    }, [blockedMsg])

    // ── A11y de diálogo para los modales hechos a mano (issue #4) ──────────────
    // Mantenemos los divs a mano (sin cambiar de primitiva, para no regresar comportamiento) pero
    // sumamos cierre con Escape y restauración del foco al disparador al cerrar. El autofocus del
    // primer interactivo se hace por panel (ref callback). Un único handler cubre los tres modales:
    // el que esté abierto define la acción de cierre.
    const anyModalOpen = showUpgradeConfirm
    function closeAllModals() {
        setShowUpgradeConfirm(false)
    }
    useEffect(() => {
        if (!anyModalOpen) return
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                e.stopPropagation()
                closeAllModals()
            }
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
    }, [anyModalOpen])
    // Restaurar el foco al disparador cuando se cierran TODOS los modales.
    useEffect(() => {
        if (anyModalOpen) return
        const trigger = modalTriggerRef.current
        if (trigger) {
            trigger.focus()
            modalTriggerRef.current = null
        }
    }, [anyModalOpen])

    useEffect(() => {
        if (!isBillingCycleAllowedForTier(selectedTier, selectedCycle)) {
            setSelectedCycle(getDefaultBillingCycleForTier(selectedTier))
        }
    }, [selectedTier, selectedCycle])

    async function handleChangePlan(gateway: 'mercadopago' | 'flow' = 'mercadopago') {
        setSaving(true)
        setError(null)
        setSuccessMessage(null)
        try {
            const response = await fetch('/api/payments/create-preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // addons: [] — los módulos vienen incluidos en el plan (decisión CEO 2026-07-17);
                // ya no viajan add-ons nuevos en el checkout de cambio de plan.
                body: JSON.stringify({ tier: selectedTier, billingCycle: selectedCycle, addons: [], gateway }),
            })
            const payload = await response.json()
            if (!response.ok) {
                // 409 OVER_CAPACITY: el server bloquea bajar a un tier con menos cupo que tus
                // alumnos activos. Mostramos su mensaje (incluye los números N/M) en el banner.
                if (payload.code === 'OVER_CAPACITY') {
                    throw new Error(
                        payload.error ??
                            `Ese plan permite hasta ${payload.maxClients ?? '—'} alumnos y tienes ${payload.activeClients ?? activeClientCount}. Archiva alumnos antes de bajar de plan.`
                    )
                }
                // 409 NUTRITION_ADDON_ON_DOWNGRADE: el server bloquea bajar a un tier sin nutrición
                // mientras haya un add-on de nutrición vivo. Mostramos su mensaje en el banner.
                if (payload.code === 'NUTRITION_ADDON_ON_DOWNGRADE') {
                    throw new Error(
                        payload.error ??
                            'Quita el modulo de Nutricion Pro antes de bajar a este plan.'
                    )
                }
                throw new Error(payload.error ?? 'No se pudo iniciar el cambio de plan')
            }
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
    // Sin add-ons nuevos en el checkout (módulos incluidos en el plan): el compuesto es el plan solo.
    const selectedComposite = selectedPrice
    // F5: precio del plan elegido CON el cupón vivo aplicado. Usa computeDiscountedClp (la MISMA fn pura
    // que el server) sobre el tier/cycle elegido → el preview mostrado == lo que cobrará el
    // server (sin drift). Solo display; el monto real lo recomputa el server en el checkout.
    const selectedCouponResult = activeCoupon
        ? computeDiscountedClp({ baseClp: selectedPrice, addons: [], spec: activeCoupon.spec })
        : null
    const selectedCompositeNet = selectedCouponResult ? selectedCouponResult.netClp : selectedComposite
    const selectedCouponDiscount = selectedCouponResult ? selectedCouponResult.discountClp : 0
    const coachCycle = (coach?.billing_cycle ?? 'monthly') as BillingCycle
    const coachTier = (coach?.subscription_tier ?? 'starter') as SubscriptionTier
    // Dirección del cambio de plan elegido vs el tier vigente — bifurca el copy del modal (issue #1).
    // Espejo de comparePlanDirection del server: 'upgrade' cobra la diferencia prorrateada y activa
    // AHORA; 'downgrade'/'same' (cambio de ciclo) se agendan al corte.
    const selectedDirection = comparePlanDirection(coachTier, selectedTier)
    const hasActivePaidPlan =
        coachTier !== 'free' &&
        (coach?.subscription_status === 'active' || coach?.subscription_status === 'trialing')
    // El copy "upgrade activa ahora" solo aplica a un suscriptor pago ACTIVO (isActiveUpgrade del
    // server). free→paid y reactivación son altas completas, no cambios mid-cycle.
    const isUpgradeNow = hasActivePaidPlan && selectedDirection === 'upgrade'
    // C2 companion: Flow NO soporta el cambio de plan de un coach pago ACTIVO (el server responde
    // 400 FLOW_PLAN_CHANGE_UNSUPPORTED — Ola 5). Solo el alta desde free (upgrade legítimo, alta
    // completa) puede pagar con Flow. Con coach pago activo el modal muestra únicamente MP con su
    // texto 'Confirmar' original — sin ofrecer un botón que reventaría en el server.
    const canUseFlowForPlanChange = FLOW_ENABLED && coachTier === 'free'
    // B2: un coach con SUSCRIPCION Flow ACTIVA no puede cambiar de plan todavia — el server responde 400
    // FLOW_PLAN_CHANGE_UNSUPPORTED por CUALQUIER gateway (confirm-upgrade y el PUT del preapproval son
    // MP-only; changeSubscriptionPlan de Flow se cablea en la proxima ola). La UI no debe dejar pagar algo
    // que revienta en el server → deshabilita Confirmar y avisa. El alta free→paid por Flow no entra aca
    // (coachTier === 'free' → hasActivePaidPlan false).
    const isFlowActivePlanChange = coach?.subscription_provider === 'flow' && hasActivePaidPlan
    // P1-3: ¿el coach tiene un add-on de nutrición por intercambios VIVO? Bloquea bajar a un tier
    // sin nutrición (Starter) hasta quitarlo — espejo del 409 NUTRITION_ADDON_ON_DOWNGRADE del server.
    // Solo ACTIVE bloquea: si ya dio de baja la nutrición (cancel_pending) el downgrade se permite.
    const hasLiveNutrition = addons.some(
        (a) => a.moduleKey === 'nutrition_exchanges' && a.status === 'active'
    )
    // No-op: el tier y ciclo elegidos son idénticos al plan actual → no hay nada que cobrar ni
    // cambiar. Deshabilita "Continuar" (si llegara al server, devuelve 400/no-op igualmente).
    const isNoOpChange = selectedTier === coachTier && selectedCycle === coachCycle

    async function refreshStatus() {
        try {
            const response = await fetch('/api/payments/subscription-status')
            const payload = await response.json()
            if (!response.ok) return
            setCoach(payload.coach)
            setChangeCardEnabled(payload.changeCardEnabled === true)
            setEvents(Array.isArray(payload.events) ? payload.events : [])
            setAddons(Array.isArray(payload.addons) ? payload.addons : [])
            setBilling(payload.billing ?? null)
            setActiveCoupon(payload.activeCoupon ?? null)
            setActiveClientCount(typeof payload.activeClientCount === 'number' ? payload.activeClientCount : 0)
        } catch {
            /* transient — el estado previo sigue visible */
        }
    }

    // Wrapper polimórfico: página standalone (`<main>`) vs pane embebido en Opciones (`<div>`,
    // el SettingsShell ya aporta ancho/padding y su propio `<main>`). Sin cambios de lógica.
    const Wrapper = embedded ? 'div' : 'main'
    const statusBadge = coach
        ? (() => {
              const st = coach.subscription_status
              const label =
                  st === 'active' ? 'Activa' :
                  st === 'canceled' ? 'Cancelada' :
                  st === 'trialing' ? 'En prueba' :
                  st === 'pending_payment' ? 'Procesando' : st
              const cls =
                  st === 'active' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
                  st === 'canceled' ? 'bg-red-500/15 text-red-600 dark:text-red-400' :
                  st === 'trialing' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400' :
                  'bg-amber-500/15 text-amber-600 dark:text-amber-400'
              return (
                  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${cls}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" /> {label}
                  </span>
              )
          })()
        : null

    return (
        <Wrapper className={embedded ? '' : 'mx-auto max-w-2xl px-5 pb-12 pt-6'}>
            {/* TopBar — título · subtítulo · estado. Embebido: el panehd de Opciones ya rotula
                "Suscripción", así que solo mostramos el badge de estado sin back-link redundante. */}
            {embedded ? (
                statusBadge ? <div className="mb-4 flex justify-end">{statusBadge}</div> : null
            ) : (
                <div className="mb-5 flex items-center gap-3">
                    <Link
                        href="/coach/settings"
                        aria-label="Volver a Opciones"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-subtle text-muted transition-colors hover:text-strong"
                    >
                        <ArrowLeft className="h-[18px] w-[18px]" />
                    </Link>
                    <div className="min-w-0 flex-1">
                        <h1 className="font-display text-xl font-extrabold leading-tight tracking-tight text-strong">Suscripción</h1>
                        <p className="text-xs text-muted">Standalone</p>
                    </div>
                    {statusBadge}
                </div>
            )}

            {/* Banners de feedback (arriba, como el diseño) — soft card con icono + cierre */}
            {error ? (
                <div ref={feedbackBannerRef} role="alert" aria-live="assertive" className="mb-3.5 flex items-center gap-2.5 rounded-control bg-[var(--danger-100)] px-3.5 py-2.5">
                    <Info className="h-4 w-4 shrink-0 text-[var(--danger-600)]" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-[13px] font-semibold text-strong">{error}</span>
                    <button type="button" aria-label="Descartar aviso" onClick={() => setError(null)} className="shrink-0 p-1 text-muted hover:text-strong">
                        <X className="h-[15px] w-[15px]" />
                    </button>
                </div>
            ) : null}
            {successMessage ? (
                <div ref={feedbackBannerRef} aria-live="polite" className="mb-3.5 flex items-center gap-2.5 rounded-control bg-[var(--success-100)] px-3.5 py-2.5">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success-600)]" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-[13px] font-semibold text-strong">{successMessage}</span>
                    <button type="button" aria-label="Descartar aviso" onClick={() => setSuccessMessage(null)} className="shrink-0 p-1 text-muted hover:text-strong">
                        <X className="h-[15px] w-[15px]" />
                    </button>
                </div>
            ) : null}

            {loading ? (
                <p role="status" aria-live="polite" className="mb-4 text-sm text-muted">Cargando estado de suscripción...</p>
            ) : null}

            {/* Plan actual — tarjeta inversa (diseño Suscripcion.jsx) */}
            {coach ? (
                <section style={{ background: 'var(--surface-inverse)' }} className="mb-3.5 rounded-card border border-[var(--border-inverse)] p-5 shadow-md">
                    {(() => {
                        // Un tier desconocido (ni venta ni legacy) NO colapsa a 'starter' (mentiría con su label).
                        const isKnownTier = coach.subscription_tier in TIER_CONFIG
                        const t = coach.subscription_tier as SubscriptionTier
                        const tierLabel = isKnownTier ? TIER_CONFIG[t].label : coach.subscription_tier
                        // Total compuesto (base + add-ons) del endpoint — la UI NUNCA calcula precios.
                        const total = billing?.totalClp ?? (isKnownTier ? getTierPriceClp(t, coach.billing_cycle as BillingCycle) : 0)
                        const cycleLabel = BILLING_CYCLE_CONFIG[coachCycle]?.label.toLowerCase() ?? ''
                        const periodDate = coach.current_period_end
                            ? new Date(coach.current_period_end).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
                            : null
                        const couponOff = activeCoupon?.discountClp ?? 0
                        return (
                            <>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-sport-400">Plan actual</p>
                                        <p className="mt-1 font-display text-[26px] font-black leading-none text-on-dark">{tierLabel}</p>
                                        <p className="mt-1.5 text-[13px] text-on-dark-muted">
                                            {coach.subscription_tier === 'free'
                                                ? 'Gratis para siempre'
                                                : periodDate
                                                ? `${coach.subscription_status === 'canceled' ? 'Acceso hasta' : 'Próximo cobro'} · ${periodDate}`
                                                : TIER_STUDENT_RANGE_LABEL[t] ?? ''}
                                        </p>
                                    </div>
                                    {total > 0 ? (
                                        <div className="shrink-0 text-right">
                                            <span className="eva-metric text-sport-400" style={{ fontSize: 28 }}>${total.toLocaleString('es-CL')}</span>
                                            {cycleLabel ? <p className="text-xs text-on-dark-muted">/ {cycleLabel}</p> : null}
                                        </div>
                                    ) : null}
                                </div>

                                {!isKnownTier && (
                                    <p className="mt-2 text-sm font-medium text-amber-400">Plan no reconocido — contacta soporte.</p>
                                )}

                                {/* Desglose (base + módulos + cupón) — la UI NUNCA calcula precios, viene del endpoint */}
                                {coach.subscription_status === 'active' && billing && (
                                    <div className="mt-3.5 flex flex-col gap-1.5 border-t border-[var(--border-inverse)] pt-3.5">
                                        <div className="flex justify-between text-[13px]">
                                            <span className="text-on-dark-muted">Plan {tierLabel}</span>
                                            <span className="eva-mono font-semibold text-on-dark">${billing.baseClp.toLocaleString('es-CL')}</span>
                                        </div>
                                        {billing.addonsClp > 0 && (
                                            <div className="flex justify-between text-[13px]">
                                                <span className="text-on-dark-muted">Módulos</span>
                                                <span className="eva-mono font-semibold text-on-dark">${billing.addonsClp.toLocaleString('es-CL')}</span>
                                            </div>
                                        )}
                                        {couponOff > 0 && activeCoupon && (
                                            <div className="flex justify-between text-[13px]">
                                                <span className="text-on-dark-muted">Cupón {activeCoupon.code}</span>
                                                <span className="eva-mono font-semibold text-emerald-400">−${couponOff.toLocaleString('es-CL')}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Cambiar tarjeta (Modalidad A) — flag ON + sub activa/en prueba o en dunning
                                    (paused/past_due): cambiar la tarjeta es la recuperación del cobro fallido (P0-3b). */}
                                {changeCardEnabled &&
                                    ['active', 'trialing', 'paused', 'past_due'].includes(coach.subscription_status) && (
                                        <div className="mt-3.5 flex items-center gap-2.5 rounded-control bg-white/[0.06] px-3 py-2.5">
                                            <CreditCard className="h-[18px] w-[18px] text-on-dark" />
                                            <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-on-dark">
                                                {coach.card_last4
                                                    ? `${coach.card_brand ? mpBrandLabel(coach.card_brand) + ' ' : ''}···· ${coach.card_last4}`
                                                    : 'Sin tarjeta registrada'}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => router.push('/coach/subscription/update-card')}
                                                className="shrink-0 text-[13px] font-bold text-sport-400 hover:opacity-80"
                                            >
                                                Cambiar
                                            </button>
                                        </div>
                                    )}
                            </>
                        )
                    })()}
                </section>
            ) : null}

            {/* Cupón — código de descuento (cupones, F5) — self-gated: se oculta sin plan pago activo / flag OFF. */}
            <div className="mb-4">
                <CouponRedeemCard />
            </div>

            {/* ── Módulos incluidos — informativo, ya NO es superficie de venta (CEO 2026-07-17):
                los 4 módulos vienen incluidos con cualquier plan pago; no se compran ni se dan de
                baja por separado. El ancla #addons se conserva para deep-links antiguos. ── */}
            {coach ? (
                <section id="addons" className="mb-5">
                    <p className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wide text-muted">Módulos incluidos</p>
                    <div className="overflow-hidden rounded-card border border-subtle bg-surface-card">
                        {ADDON_MODULE_KEYS.map((key, i) => {
                            const cfg = ADDON_CONFIG[key]
                            const Icon = ADDON_ICON[key]
                            const included = hasActivePaidPlan
                            return (
                                <div key={key}>
                                    {i > 0 && <div className="mx-3.5 h-px bg-[var(--border-subtle)]" />}
                                    <div className="flex items-center gap-3 px-3.5 py-3">
                                        <span className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-control ${included ? 'bg-sport-100 text-sport-600' : 'bg-surface-sunken text-subtle'}`}>
                                            <Icon className="h-[18px] w-[18px]" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold text-strong">{cfg.label}</p>
                                            <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${included ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-surface-sunken text-muted'}`}>
                                                {included ? <Check className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                                                {included ? 'Incluido en tu plan' : 'Con plan pago'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {hasActivePaidPlan ? (
                        <p className="mt-2 px-1 text-[11px] text-subtle">
                            Vienen incluidos en tu plan, sin costo extra. Úsalos desde Alumnos › Herramientas.
                        </p>
                    ) : (
                        <p className="mt-3 rounded-control border border-subtle bg-surface-sunken px-3 py-2 text-xs text-muted">
                            Estos módulos vienen incluidos en cualquier plan pago. Elige un plan abajo para activarlos.
                        </p>
                    )}
                </section>
            ) : null}

            {/* Gateado en `coach` cargado: sin esto la sección renderiza con coachTier='starter'
                default (coach=null) y los bloqueos (cupo/nutrición) no aplican → Starter clickeable
                unos segundos hasta que carga subscription-status. coach se setea junto a addons +
                activeClientCount en el mismo fetch → al aparecer la sección, la data está completa. */}
            {coach && (
            <section className="mb-5 space-y-3.5">
                <p className="px-1 text-[13px] font-bold uppercase tracking-wide text-muted">Cambiar plan</p>

                {/* Selector de ciclo — pills full-width (diseño Suscripcion.jsx) */}
                {allowedCycleOptions.length > 1 && (
                    <div className="flex gap-1.5 rounded-control bg-surface-sunken p-1">
                        {allowedCycleOptions.map((cycle) => {
                            const disc = BILLING_CYCLE_CONFIG[cycle].discountPercent
                            return (
                                <button
                                    key={cycle}
                                    type="button"
                                    onClick={() => setSelectedCycle(cycle)}
                                    className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-px rounded-control px-1 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                                        selectedCycle === cycle
                                            ? 'bg-surface-card text-strong shadow-sm'
                                            : 'text-muted hover:text-strong'
                                    }`}
                                >
                                    <span>{BILLING_CYCLE_CONFIG[cycle].label}</span>
                                    {disc > 0 && <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">−{disc}%</span>}
                                </button>
                            )
                        })}
                    </div>
                )}

                <div className="flex flex-col gap-2.5">
                    {tierOptions.map((tier) => {
                        const price = getTierPriceClp(tier, isBillingCycleAllowedForTier(tier, selectedCycle) ? selectedCycle : getDefaultBillingCycleForTier(tier))
                        const isSelected = selectedTier === tier
                        const current = tier === coachTier
                        const badge = TIER_BADGE[tier]
                        const features = TIER_CONFIG[tier].features.slice(0, 3)
                        // Downgrade que no cabe: bajar a un tier con menos cupo que tus alumnos
                        // activos. Se bloquea (mismo guard que el 409 OVER_CAPACITY del server).
                        const tierMaxClients = getTierMaxClients(tier)
                        const wouldExceed =
                            comparePlanDirection(coachTier, tier) === 'downgrade' &&
                            tierMaxClients < activeClientCount
                        // P1-3: bajar a un tier sin nutrición (Starter) con un add-on de nutrición vivo.
                        // Se bloquea (mismo guard que el 409 NUTRITION_ADDON_ON_DOWNGRADE del server).
                        const nutritionBlocks =
                            comparePlanDirection(coachTier, tier) === 'downgrade' &&
                            !getTierCapabilities(tier).canUseNutrition &&
                            hasLiveNutrition
                        const isBlocked = wouldExceed || nutritionBlocks
                        const blockTooltip = wouldExceed
                            ? `Este plan permite hasta ${tierMaxClients} alumnos y tienes ${activeClientCount} activos. Archiva alumnos para poder bajar a este plan.`
                            : nutritionBlocks
                            ? 'Quita el modulo de Nutricion para bajar a este plan.'
                            : undefined
                        // Razón corta siempre visible bajo la card bloqueada (issue #8): el usuario táctil
                        // no debe tener que tocar una card que se ve deshabilitada para enterarse.
                        const shortBlockReason = wouldExceed
                            ? 'Sin cupo para tus alumnos activos.'
                            : nutritionBlocks
                            ? 'Quita el módulo de Nutrición primero.'
                            : undefined
                        const blockReasonId = `tier-block-${tier}`
                        return (
                            <button
                                key={tier}
                                type="button"
                                aria-disabled={isBlocked}
                                aria-describedby={isBlocked ? blockReasonId : undefined}
                                title={blockTooltip}
                                onClick={() => {
                                    if (isBlocked) { setBlockedMsg(blockTooltip ?? 'No puedes seleccionar este plan.'); return }
                                    setBlockedMsg(null)
                                    setSelectedTier(tier)
                                }}
                                className={`relative rounded-control px-4 py-3.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                                    isBlocked
                                        ? 'cursor-not-allowed border-[1.5px] border-subtle opacity-55'
                                        : isSelected
                                        ? 'border-2 border-sport-500 bg-sport-100/40'
                                        : 'border-[1.5px] border-subtle bg-surface-card hover:bg-surface-sunken'
                                }`}
                            >
                                {/* Razón del bloqueo para lectores de pantalla (referida por aria-describedby) */}
                                {isBlocked && (
                                    <span id={blockReasonId} className="sr-only">{blockTooltip}</span>
                                )}
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className="font-display text-[17px] font-extrabold tracking-tight text-strong">{TIER_CONFIG[tier].label}</span>
                                        {current && (
                                            <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Actual</span>
                                        )}
                                        {badge && !isBlocked && (
                                            <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
                                        )}
                                        {isBlocked && <Lock className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden="true" />}
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <span className="eva-metric text-[18px] text-strong">${price.toLocaleString('es-CL')}</span>
                                        <span className="text-[11px] text-muted"> /mes</span>
                                    </div>
                                </div>
                                <p className={`mt-1 text-[12.5px] ${isBlocked ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted'}`}>
                                    {isBlocked
                                        ? (wouldExceed ? `Sin cupo · tienes ${activeClientCount} alumnos` : (shortBlockReason ?? 'No disponible'))
                                        : features.join(' · ')}
                                </p>
                            </button>
                        )
                    })}
                </div>

                {blockedMsg && (
                    <div ref={blockedMsgRef} role="alert" className="flex items-start gap-2 rounded-control border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-600 dark:text-amber-300">
                        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{blockedMsg}</span>
                    </div>
                )}

                {/* Nota informativa: los módulos ya vienen con el plan (sin combo de compra). */}
                <p className="px-1 text-[11.5px] text-subtle">
                    Todos los planes pagos incluyen los 4 módulos profesionales sin costo extra.
                </p>

                {/* Transparencia de precio (real) — desglose del cupón antes del CTA */}
                {selectedCouponDiscount > 0 && activeCoupon && (
                    <div className="rounded-control border border-subtle bg-surface-sunken px-4 py-3 text-[12px]">
                        <p className="font-medium text-emerald-600 dark:text-emerald-400">
                            Cupón {activeCoupon.code} aplicado · −${selectedCouponDiscount.toLocaleString('es-CL')}
                        </p>
                    </div>
                )}

                {/* CTA full-width (diseño) — muestra el precio compuesto neto en la etiqueta */}
                <button
                    type="button"
                    onClick={(e) => { modalTriggerRef.current = e.currentTarget; setShowUpgradeConfirm(true) }}
                    disabled={saving || isNoOpChange}
                    title={isNoOpChange ? 'Ya tienes este plan y ciclo. Elige un plan o ciclo distinto.' : undefined}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-control bg-sport-500 px-5 text-sm font-bold text-white transition-colors hover:bg-sport-600 disabled:opacity-60 disabled:hover:bg-sport-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                    {isNoOpChange ? (
                        'Plan y ciclo actuales'
                    ) : (
                        <>
                            <span>
                                Continuar · {selectedCouponDiscount > 0 && (
                                    <span className="font-normal line-through opacity-70">${selectedComposite.toLocaleString('es-CL')}</span>
                                )} ${selectedCompositeNet.toLocaleString('es-CL')}
                            </span>
                            <ArrowRight className="h-4 w-4" />
                        </>
                    )}
                </button>
            </section>
            )}

            {/* Upgrade confirmation modal — bottom-sheet en <760 (kit sheet()), diálogo centrado en md+ */}
            {showUpgradeConfirm && (
                <div
                    className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--surface-overlay)] md:items-center md:px-4"
                    onClick={() => setShowUpgradeConfirm(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={upgradeModalTitleId}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full rounded-t-sheet bg-surface-card p-6 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] shadow-[var(--shadow-sheet)] max-h-[88dvh] overflow-y-auto md:max-w-md md:rounded-card md:border md:border-subtle md:shadow-2xl md:max-h-[90dvh]"
                    >
                        <div className="mx-auto mb-4 h-1 w-[38px] rounded-full bg-[var(--ink-200)] md:hidden" aria-hidden="true" />
                        <h2 id={upgradeModalTitleId} className="font-display text-xl font-extrabold tracking-tight text-strong">Confirmar cambio de plan</h2>
                        <div className="mt-4 space-y-2 rounded-control border border-subtle bg-surface-sunken p-4 text-sm">
                            {/* Issue #1: el copy depende de la DIRECCIÓN del cambio. Un UPGRADE de un pago
                                activo se activa AHORA y cobra solo la DIFERENCIA prorrateada (el server hace
                                el one-shot); NO mostramos el compuesto completo como si fuera el cargo de hoy.
                                Downgrade y cambio de ciclo SÍ se agendan al corte (el copy original aplica). */}
                            {isUpgradeNow ? (
                                <>
                                    <p className="text-muted">
                                        Tu nuevo plan{' '}
                                        <strong className="text-strong">{TIER_CONFIG[selectedTier].label}</strong>{' '}
                                        se activa <strong className="text-strong">ahora</strong>. Hoy pagas solo la{' '}
                                        <strong className="text-strong">diferencia prorrateada</strong> por los días que
                                        restan de tu ciclo actual.
                                    </p>
                                    <p className="text-muted">
                                        Desde tu próxima renovación se cobra el valor completo{' '}
                                        <strong className="text-strong">
                                            ${getTierPriceClp(selectedTier, coachCycle).toLocaleString('es-CL')} CLP / {BILLING_CYCLE_CONFIG[coachCycle].label.toLowerCase()}
                                        </strong>
                                        {addons.some((a) => a.source === 'self_service' && a.status !== 'cancelled') && (
                                            <span className="text-muted"> (más tus módulos add-on activos)</span>
                                        )}
                                        . El monto exacto de la diferencia se calcula en el checkout seguro de Mercado Pago.
                                    </p>
                                </>
                            ) : (
                                <>
                                    {coach?.current_period_end && (
                                        <p className="text-muted">
                                            Tu plan actual{' '}
                                            <strong className="text-strong">
                                                ({coach.subscription_tier in TIER_CONFIG
                                                    ? TIER_CONFIG[coach.subscription_tier as SubscriptionTier].label
                                                    : coach.subscription_tier})
                                            </strong>{' '}
                                            continúa hasta el{' '}
                                            <strong className="text-strong">
                                                {new Date(coach.current_period_end).toLocaleDateString('es-CL', {
                                                    day: 'numeric', month: 'long', year: 'numeric',
                                                })}
                                            </strong>
                                            .
                                        </p>
                                    )}
                                    <p className="text-muted">
                                        A partir de esa fecha, tu nuevo plan{' '}
                                        <strong className="text-strong">{TIER_CONFIG[selectedTier].label}</strong>{' '}
                                        se activará por{' '}
                                        <strong className="text-strong">
                                            ${selectedCompositeNet.toLocaleString('es-CL')} CLP / {BILLING_CYCLE_CONFIG[selectedCycle].label.toLowerCase()}
                                        </strong>
                                        {selectedCouponDiscount > 0 && activeCoupon && (
                                            <span className="text-emerald-500"> (cupón {activeCoupon.code}: −${selectedCouponDiscount.toLocaleString('es-CL')})</span>
                                        )}
                                        .
                                    </p>
                                </>
                            )}
                            {!TIER_CONFIG[selectedTier].features.includes('Planes de nutrición') &&
                             coach?.subscription_tier &&
                             TIER_CONFIG[coach.subscription_tier as SubscriptionTier]?.features.includes('Planes de nutrición') && (
                                <p className="text-amber-600 dark:text-amber-400 text-xs font-medium">
                                    ⚠ El nuevo plan no incluye el módulo de nutrición. Perderás ese acceso al cambiar.
                                </p>
                            )}
                            {/* Add-ons activos viajan en el cambio de plan: el monto del checkout los incluye */}
                            {addons.some((a) => a.source === 'self_service' && a.status !== 'cancelled') && (
                                <p className="text-muted text-xs">
                                    Tus módulos add-on activos ({addons
                                        .filter((a) => a.source === 'self_service' && a.status !== 'cancelled')
                                        .map((a) => ADDON_CONFIG[a.moduleKey].label)
                                        .join(', ')}) se mantienen y se suman al monto del nuevo plan en el
                                    checkout.
                                </p>
                            )}
                        </div>
                        <div className="mt-4 flex flex-col gap-1.5">
                            {isFlowActivePlanChange && (
                                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                    El cambio de plan con Flow estara disponible pronto.
                                </p>
                            )}
                            <button
                                type="button"
                                onClick={() => { setShowUpgradeConfirm(false); void handleChangePlan('mercadopago') }}
                                disabled={saving || isFlowActivePlanChange}
                                className="flex h-12 w-full items-center justify-center gap-2 rounded-control bg-sport-500 text-sm font-bold text-white transition-colors hover:bg-sport-600 disabled:opacity-60 disabled:hover:bg-sport-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                            >
                                {saving ? 'Procesando...' : canUseFlowForPlanChange ? (
                                    <>
                                        <Image src="/payments/mercadopago.svg" alt="" aria-hidden="true" width={18} height={18} />
                                        <span>Pagar con Mercado Pago</span>
                                    </>
                                ) : 'Confirmar'}
                            </button>
                            {canUseFlowForPlanChange && (
                                <button
                                    type="button"
                                    onClick={() => { setShowUpgradeConfirm(false); void handleChangePlan('flow') }}
                                    disabled={saving}
                                    className="flex h-11 w-full items-center justify-center gap-2 rounded-control border border-default bg-surface-sunken text-sm font-semibold text-strong transition-colors hover:bg-surface-card disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
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
                            )}
                            <button
                                type="button"
                                ref={(el) => { if (el) el.focus() }}
                                onClick={() => setShowUpgradeConfirm(false)}
                                className="h-11 w-full rounded-control text-sm font-semibold text-muted hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <section className="mb-5">
                <p className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wide text-muted">Historial de pagos</p>
                {events.length === 0 ? (
                    <div className="rounded-card border border-subtle bg-surface-card p-4 text-sm text-muted">
                        Aún no hay movimientos de suscripción registrados.
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-card border border-subtle bg-surface-card">
                        {events.map((event, i) => {
                            const amount = extractAmountClpFromEventPayload(event.payload)
                            const dateLabel = new Date(event.created_at).toLocaleDateString('es-CL', {
                                day: 'numeric', month: 'short',
                            })
                            const ref = event.provider_checkout_id?.trim()
                            return (
                                <div key={event.id}>
                                    {i > 0 && <div className="mx-3.5 h-px bg-[var(--border-subtle)]" />}
                                    <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                                        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                            <Check className="h-[15px] w-[15px]" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[13.5px] font-bold text-strong">
                                                {dateLabel}
                                                {event.provider_status ? <span className="font-medium text-muted"> · {event.provider_status}</span> : null}
                                            </p>
                                            <p className="eva-mono text-[11px] text-subtle">{ref ? `${event.provider} · ${ref}` : event.provider}</p>
                                        </div>
                                        <span className="eva-mono shrink-0 text-[13.5px] font-bold text-strong">
                                            {amount != null ? `$${amount.toLocaleString('es-CL')}` : '—'}
                                        </span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
                <p className="mt-2 px-1 text-[11px] text-subtle">
                    Eventos registrados por Mercado Pago y confirmaciones manuales (zona horaria local en fechas).
                </p>
            </section>

            {/* Cancelar suscripción — ghost danger al pie que revela el motivo (diseño) */}
            {!showCancelPanel ? (
                <button
                    type="button"
                    onClick={() => setShowCancelPanel(true)}
                    className="h-11 w-full rounded-control text-sm font-semibold text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
                >
                    Cancelar suscripción
                </button>
            ) : (
                <section className="rounded-card border border-subtle bg-surface-card p-5">
                    <h2 className="font-display text-base font-bold tracking-tight text-strong">Cancelar suscripción</h2>
                    {coach?.current_period_end ? (
                        <p className="mt-2 text-sm text-muted">
                            Conservas acceso hasta el{' '}
                            <strong className="text-strong">
                                {new Date(coach.current_period_end).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </strong>
                            . Después tu cuenta pasa a plan gratuito.
                        </p>
                    ) : (
                        <p className="mt-2 text-sm text-muted">Cuéntanos el motivo para ayudarnos a mejorar.</p>
                    )}
                    <p className="mt-3 text-[13px] font-semibold text-strong">¿Por qué te vas? (nos ayuda a mejorar)</p>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="mt-1.5 w-full rounded-control border border-default bg-surface-sunken p-3 text-sm text-strong outline-none focus:border-[var(--brand)]"
                        rows={3}
                        placeholder="Contanos el motivo…"
                    />
                    <div className="mt-3 flex flex-col gap-2">
                        <button
                            type="button"
                            onClick={handleCancel}
                            disabled={saving || !reason.trim()}
                            className="h-11 w-full rounded-control border border-red-500/30 text-sm font-semibold text-red-600 hover:bg-red-500/10 disabled:opacity-60 disabled:hover:bg-transparent dark:text-red-400"
                        >
                            {saving ? 'Procesando…' : 'Cancelar mi suscripción'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowCancelPanel(false)}
                            className="h-11 w-full rounded-control text-sm font-semibold text-muted hover:text-strong"
                        >
                            Mejor sigo
                        </button>
                    </div>
                </section>
            )}
        </Wrapper>
    )
}
