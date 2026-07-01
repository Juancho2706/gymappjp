'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
    ADDON_CONFIG,
    ADDON_MODULE_KEYS,
    ADDON_PAYMENT_RULES,
    BILLING_CYCLE_CONFIG,
    comparePlanDirection,
    getAddonPaymentRulesForCycle,
    getDefaultBillingCycleForTier,
    getTierAllowedBillingCycles,
    getTierCapabilities,
    getTierMaxClients,
    getTierPriceClp,
    computeDiscountedClp,
    isBillingCycleAllowedForTier,
    isSaleTier,
    SALE_TIERS,
    SELF_SERVICE_ADDONS_ENABLED,
    TIER_CONFIG,
    TIER_STUDENT_RANGE_LABEL,
    type BillingCycle,
    type DiscountSpec,
    type SaleTier,
    type SubscriptionTier,
} from '@/lib/constants'
import type { ModuleKey } from '@/services/entitlements.service'
import { useCaptureAddonFunnel } from '@/lib/posthog/events'
import Link from 'next/link'
import { Check, CheckCircle2, Info, Puzzle, Lock, Gift, ArrowLeft, ArrowRight, CreditCard, HeartPulse, Activity, Ruler, Utensils, X, type LucideIcon } from 'lucide-react'
import { CouponRedeemCard } from './_components/CouponRedeemCard'

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

export default function CoachSubscriptionPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    // Refs para hacer scroll-into-view del banner relevante al setearse (off-screen en móvil).
    const blockedMsgRef = useRef<HTMLDivElement | null>(null)
    const feedbackBannerRef = useRef<HTMLDivElement | null>(null)
    // ids estables para semántica de diálogo / aria de los modales hechos a mano.
    const upgradeModalTitleId = useId()
    const addonModalTitleId = useId()
    const cancelAddonModalTitleId = useId()
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

    // ── Add-ons (plan 05 F5) ──────────────────────────────────────────────────
    const [addons, setAddons] = useState<CoachAddonView[]>([])
    const [billing, setBilling] = useState<BillingBreakdown | null>(null)
    // Cupón vivo (F5): spec re-resuelto server-side → la UI computa el precio descontado de cualquier
    // tier/cycle con la MISMA fn pura (computeDiscountedClp) que cobra el server (mostrado == cobrado).
    const [activeCoupon, setActiveCoupon] = useState<{ code: string | null; discountClp: number; spec: DiscountSpec } | null>(null)
    const [addonModalKey, setAddonModalKey] = useState<ModuleKey | null>(null)
    const [addonTermsAccepted, setAddonTermsAccepted] = useState(false)
    const [addonSaving, setAddonSaving] = useState(false)
    const [cancelAddonKey, setCancelAddonKey] = useState<ModuleKey | null>(null)
    const [cancelAddonEffective, setCancelAddonEffective] = useState<string | null | undefined>(undefined)
    const captureAddonFunnel = useCaptureAddonFunnel()

    // Add-ons NUEVOS elegidos durante el cambio/alta de plan: se pagan JUNTO al plan en UN solo
    // checkout (el server arma el monto compuesto en create-preference; el webhook materializa las
    // filas coach_addons al confirmar el pago). Visible solo con el flag de lanzamiento (en prod
    // oculto hasta el flip). Espejo del combo del signup (register/page.tsx).
    const [upgradeAddons, setUpgradeAddons] = useState<ModuleKey[]>([])
    // nutrition_exchanges requiere Pro+: si el tier elegido no la soporta, sacarla de la selección
    // (el server igual la rechazaría con 400, pero la UI no debe ofrecer algo inusable).
    useEffect(() => {
        if (getTierCapabilities(selectedTier).canUseNutrition) return
        setUpgradeAddons((prev) =>
            prev.includes('nutrition_exchanges') ? prev.filter((k) => k !== 'nutrition_exchanges') : prev
        )
    }, [selectedTier])
    // Issue #12: un módulo que ya tiene fila VIVA no debe viajar en el combo del cambio de plan
    // (lo cobraría dos veces / el server lo rechazaría). Lo sacamos de la selección si aparece vivo
    // tras un refresh de estado.
    useEffect(() => {
        const liveKeys = new Set(addons.filter((a) => a.status !== 'cancelled').map((a) => a.moduleKey))
        setUpgradeAddons((prev) => {
            const next = prev.filter((k) => !liveKeys.has(k))
            return next.length === prev.length ? prev : next
        })
    }, [addons])

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
        if (!addon && !upgrade) return
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
            setError('No se pudo completar el pago del módulo. No se realizó ningún cobro. Puedes intentarlo nuevamente desde el catálogo de módulos.')
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
    const anyModalOpen = showUpgradeConfirm || addonModalKey !== null || cancelAddonKey !== null
    function closeAllModals() {
        setShowUpgradeConfirm(false)
        setAddonModalKey(null)
        setCancelAddonKey(null)
        setCancelAddonEffective(undefined)
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

    // Funnel add-ons (analítica pasiva): catálogo visible una vez cargado el coach.
    const catalogViewedRef = useRef(false)
    useEffect(() => {
        if (catalogViewedRef.current || !coach) return
        catalogViewedRef.current = true
        captureAddonFunnel('addon_catalog_viewed', {
            billing_cycle: (coach.billing_cycle ?? 'monthly') as BillingCycle,
            tier: coach.subscription_tier as SubscriptionTier,
        })
    }, [coach, captureAddonFunnel])

    async function handleChangePlan() {
        setSaving(true)
        setError(null)
        setSuccessMessage(null)
        try {
            const response = await fetch('/api/payments/create-preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tier: selectedTier, billingCycle: selectedCycle, addons: upgradeAddons }),
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
    // Total compuesto en vivo = plan + add-ons elegidos (mismo descuento por ciclo del plan). Es
    // SOLO el preview de la UI; el monto real lo recalcula el server en el checkout (nunca confía
    // en montos del cliente).
    const upgradeAddonsCycleTotal = upgradeAddons.reduce((sum, key) => {
        const { months, discountPercent } = BILLING_CYCLE_CONFIG[selectedCycle]
        return sum + Math.round(ADDON_CONFIG[key].priceClpMensual * months * (1 - discountPercent / 100))
    }, 0)
    const selectedComposite = selectedPrice + upgradeAddonsCycleTotal
    // F5: precio del plan elegido CON el cupón vivo aplicado. Usa computeDiscountedClp (la MISMA fn pura
    // que el server) sobre el composite del tier/cycle elegido → el preview mostrado == lo que cobrará el
    // server (sin drift). Solo display; el monto real lo recomputa el server en el checkout.
    const selectedAddonLines = upgradeAddons.map((key) => {
        const { months, discountPercent } = BILLING_CYCLE_CONFIG[selectedCycle]
        return {
            moduleKey: key,
            cycleAmountClp: Math.round(ADDON_CONFIG[key].priceClpMensual * months * (1 - discountPercent / 100)),
        }
    })
    const selectedCouponResult = activeCoupon
        ? computeDiscountedClp({ baseClp: selectedPrice, addons: selectedAddonLines, spec: activeCoupon.spec })
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
    // P1-3: ¿el coach tiene un add-on de nutrición por intercambios VIVO? Bloquea bajar a un tier
    // sin nutrición (Starter) hasta quitarlo — espejo del 409 NUTRITION_ADDON_ON_DOWNGRADE del server.
    // Solo ACTIVE bloquea: si ya dio de baja la nutrición (cancel_pending) el downgrade se permite.
    const hasLiveNutrition = addons.some(
        (a) => a.moduleKey === 'nutrition_exchanges' && a.status === 'active'
    )
    // No-op: el tier y ciclo elegidos son idénticos al plan actual → no hay nada que cobrar ni
    // cambiar. Deshabilita "Continuar" (si llegara al server, devuelve 400/no-op igualmente).
    const isNoOpChange = selectedTier === coachTier && selectedCycle === coachCycle

    // ── Add-ons: estado de cada módulo a partir de las filas vivas del endpoint ──
    function addonForKey(key: ModuleKey): CoachAddonView | undefined {
        // Una fila paga (self_service) manda sobre el grant para mostrar acción de baja;
        // si solo hay grant, mostramos "Cortesía EVA".
        const live = addons.filter((a) => a.moduleKey === key && a.status !== 'cancelled')
        return live.find((a) => a.source === 'self_service') ?? live.find((a) => a.source === 'admin_grant')
    }

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

    function openAddonModal(key: ModuleKey) {
        setAddonTermsAccepted(false)
        setAddonModalKey(key)
        captureAddonFunnel('addon_modal_opened', { module_key: key, billing_cycle: coachCycle, tier: coachTier })
    }

    async function handleAddAddon() {
        if (!addonModalKey || !addonTermsAccepted) return
        const key = addonModalKey
        setAddonSaving(true)
        setError(null)
        setSuccessMessage(null)
        captureAddonFunnel('addon_confirmed', { module_key: key, billing_cycle: coachCycle, tier: coachTier })
        try {
            const response = await fetch('/api/payments/addons', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ moduleKey: key, acceptedTermsVersion: ADDON_PAYMENT_RULES.version }),
            })
            const payload = await response.json()
            if (!response.ok) throw new Error(payload.error ?? 'No se pudo agregar el módulo.')
            // Todos los ciclos: el endpoint devuelve la URL del one-shot prorrateado → redirige a MP.
            if (payload.kind === 'one_shot_checkout' && payload.checkoutUrl) {
                captureAddonFunnel('addon_oneshot_redirected', { module_key: key, billing_cycle: coachCycle, tier: coachTier })
                window.location.href = payload.checkoutUrl
                return
            }
            throw new Error('No se pudo iniciar el pago del módulo.')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error inesperado')
        } finally {
            setAddonSaving(false)
        }
    }

    async function handleCancelAddon() {
        if (!cancelAddonKey) return
        const key = cancelAddonKey
        setAddonSaving(true)
        setError(null)
        setSuccessMessage(null)
        try {
            const response = await fetch('/api/payments/addons/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ moduleKey: key }),
            })
            const payload = await response.json()
            if (!response.ok) throw new Error(payload.error ?? 'No se pudo quitar el módulo.')
            setCancelAddonEffective(payload.effectiveAt ?? null)
            await refreshStatus()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error inesperado')
            setCancelAddonKey(null)
        } finally {
            setAddonSaving(false)
        }
    }

    return (
        <main className="mx-auto max-w-2xl px-5 pb-12 pt-6">
            {/* TopBar — título · subtítulo · estado */}
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
                {coach
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
                    : null}
            </div>

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

            {/* ── Módulos add-on — superficie de venta permitida #2 (anti-hostigamiento) ── */}
            {coach ? (
                <section id="addons" className="mb-5">
                    <p className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wide text-muted">Módulos add-on</p>
                    <div className="overflow-hidden rounded-card border border-subtle bg-surface-card">
                        {ADDON_MODULE_KEYS.map((key, i) => {
                            const cfg = ADDON_CONFIG[key]
                            const Icon = ADDON_ICON[key]
                            const row = addonForKey(key)
                            // Estado por módulo (plan 05 F5.1).
                            const isCourtesy = row?.source === 'admin_grant'
                            const isActive = row?.status === 'active' && row.source === 'self_service'
                            const isCancelPendingCharged = row?.status === 'cancel_pending' && row.source === 'self_service' && row.firstChargedAt !== null
                            const isCommitted = row?.status === 'cancel_pending' && row.source === 'self_service' && row.firstChargedAt === null
                            // D8: nutrition_exchanges requiere tier con nutrición (Pro+).
                            const requiresNutritionTier = key === 'nutrition_exchanges' && !getTierCapabilities(coachTier).canUseNutrition
                            const canAdd = hasActivePaidPlan && !requiresNutritionTier && !row
                            const lit = isActive || isCourtesy
                            // Badge de estado (texto + paleta), espejo del modState del diseño.
                            const badge: { label: string; cls: string; icon: 'gift' | 'check' | 'lock' | null } =
                                isCourtesy
                                    ? { label: 'Activo sin costo', cls: 'bg-sky-500/15 text-sky-600 dark:text-sky-400', icon: 'gift' }
                                    : isActive
                                    ? { label: 'Activo', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', icon: 'check' }
                                    : isCancelPendingCharged
                                    ? { label: `Se desactiva el ${row?.expiresAt ? new Date(row.expiresAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' }) : 'fin del período'}`, cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', icon: null }
                                    : isCommitted
                                    ? { label: 'Baja programada', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', icon: null }
                                    : requiresNutritionTier
                                    ? { label: 'Requiere plan Pro+', cls: 'bg-surface-sunken text-muted', icon: 'lock' }
                                    : { label: `$${cfg.priceClpMensual.toLocaleString('es-CL')}/mes`, cls: 'bg-surface-sunken text-muted', icon: null }
                            return (
                                <div key={key}>
                                    {i > 0 && <div className="mx-3.5 h-px bg-[var(--border-subtle)]" />}
                                    <div className="flex items-center gap-3 px-3.5 py-3">
                                        <span className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-control ${lit ? 'bg-sport-100 text-sport-600' : 'bg-surface-sunken text-subtle'}`}>
                                            <Icon className="h-[18px] w-[18px]" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold text-strong">{cfg.label}</p>
                                            <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
                                                {badge.icon === 'gift' && <Gift className="h-3 w-3" />}
                                                {badge.icon === 'check' && <Check className="h-3 w-3" />}
                                                {badge.icon === 'lock' && <Lock className="h-3 w-3" />}
                                                {badge.label}
                                            </span>
                                        </div>
                                        {/* Acción Agregar / Quitar */}
                                        {isActive || isCancelPendingCharged || isCommitted ? (
                                            <button
                                                type="button"
                                                disabled={addonSaving || isCancelPendingCharged || isCommitted || !SELF_SERVICE_ADDONS_ENABLED}
                                                onClick={(e) => { modalTriggerRef.current = e.currentTarget; setCancelAddonEffective(undefined); setCancelAddonKey(key) }}
                                                className="shrink-0 h-9 rounded-control px-3.5 text-xs font-semibold text-[var(--danger-600)] hover:bg-[var(--danger-100)] disabled:opacity-60 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                                            >
                                                {isCancelPendingCharged || isCommitted ? 'Baja solicitada' : 'Quitar'}
                                            </button>
                                        ) : canAdd ? (
                                            <button
                                                type="button"
                                                disabled={addonSaving || !SELF_SERVICE_ADDONS_ENABLED}
                                                onClick={(e) => { modalTriggerRef.current = e.currentTarget; openAddonModal(key) }}
                                                className="shrink-0 h-9 rounded-control border border-default bg-surface-sunken px-3.5 text-xs font-semibold text-strong hover:bg-surface-card disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                                            >
                                                Agregar
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {!hasActivePaidPlan && (
                        <p className="mt-3 rounded-control border border-subtle bg-surface-sunken px-3 py-2 text-xs text-muted">
                            Los módulos add-on están disponibles con un plan pago activo.
                        </p>
                    )}
                    {hasActivePaidPlan && !SELF_SERVICE_ADDONS_ENABLED && (
                        <p className="mt-3 rounded-control border border-subtle bg-surface-sunken px-3 py-2 text-xs text-muted">
                            La compra y baja de módulos estará disponible muy pronto. Si necesitas un módulo ahora,
                            escríbenos a <a href="mailto:contacto@eva-app.cl" className="text-primary hover:opacity-80">contacto@eva-app.cl</a>.
                        </p>
                    )}
                    {hasActivePaidPlan && SELF_SERVICE_ADDONS_ENABLED && (
                        <p className="mt-2 px-1 text-[11px] text-subtle">
                            Activá un módulo acá; usalo desde Alumnos › Herramientas. Cada uno se cobra aparte de tu plan.
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
                                        ? (wouldExceed ? `Sin cupo · tenés ${activeClientCount} alumnos` : (shortBlockReason ?? 'No disponible'))
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

                {/* Combo plan + add-ons (plan 05): elegí módulos para pagarlos JUNTO al plan en un
                    solo checkout. Visible solo con el flag de lanzamiento (en prod oculto). */}
                {SELF_SERVICE_ADDONS_ENABLED && (
                    <div className="rounded-control border border-subtle bg-surface-card p-4">
                        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                            <Puzzle className="h-3.5 w-3.5" aria-hidden="true" /> Sumar módulos (opcional · se pagan junto al plan)
                        </p>
                        {/* Aclaración (issue #12): estos módulos se cobran CON el plan al corte; el catálogo
                            "Agregar ahora" de arriba cobra una proración inmediata. Dos superficies distintas. */}
                        <p className="mb-2 text-[11px] text-muted">
                            Se cobran junto a tu plan en el mismo checkout y toman efecto al corte. Si necesitas
                            un módulo de inmediato, usa &quot;Agregar&quot; en la sección Módulos add-on (cobro prorrateado ahora).
                        </p>
                        <div className="space-y-1.5">
                            {ADDON_MODULE_KEYS.map((key) => {
                                const cfg = ADDON_CONFIG[key]
                                const needsNutrition =
                                    key === 'nutrition_exchanges' && !getTierCapabilities(selectedTier).canUseNutrition
                                // Un módulo con fila VIVA (activa/cortesía/baja-pendiente) ya está contratado:
                                // no debe ofrecerse acá (lo cobraría dos veces / el server lo rechazaría).
                                const alreadyLive = !!addonForKey(key)
                                const disabled = needsNutrition || alreadyLive
                                const checked = upgradeAddons.includes(key)
                                return (
                                    <label
                                        key={key}
                                        className={`flex items-center justify-between gap-2 rounded-control border px-3 py-2 text-sm ${
                                            disabled
                                                ? 'cursor-not-allowed border-subtle opacity-50'
                                                : 'cursor-pointer border-subtle hover:bg-surface-sunken'
                                        }`}
                                    >
                                        <span className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                disabled={disabled}
                                                checked={checked && !alreadyLive}
                                                onChange={(e) =>
                                                    setUpgradeAddons((prev) =>
                                                        e.target.checked
                                                            ? [...new Set([...prev, key])]
                                                            : prev.filter((k) => k !== key)
                                                    )
                                                }
                                                className="h-4 w-4 rounded border-border"
                                            />
                                            <span className="text-strong">{cfg.label}</span>
                                            {alreadyLive ? (
                                                <span className="text-[10px] font-semibold text-emerald-500">ya activo</span>
                                            ) : needsNutrition ? (
                                                <span className="text-[10px] font-semibold text-amber-500">requiere Pro+</span>
                                            ) : null}
                                        </span>
                                        <span className="text-muted">
                                            ${cfg.priceClpMensual.toLocaleString('es-CL')}/mes
                                        </span>
                                    </label>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Transparencia de precio (real) — desglose cupón/combo antes del CTA */}
                {(selectedCouponDiscount > 0 || upgradeAddons.length > 0) && (
                    <div className="rounded-control border border-subtle bg-surface-sunken px-4 py-3 text-[12px]">
                        {selectedCouponDiscount > 0 && activeCoupon && (
                            <p className="font-medium text-emerald-600 dark:text-emerald-400">
                                Cupón {activeCoupon.code} aplicado · −${selectedCouponDiscount.toLocaleString('es-CL')}
                            </p>
                        )}
                        {upgradeAddons.length > 0 && (
                            <p className="text-muted">
                                plan ${selectedPrice.toLocaleString('es-CL')} + {upgradeAddons.length} módulo(s) ${upgradeAddonsCycleTotal.toLocaleString('es-CL')}
                            </p>
                        )}
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
                                    {upgradeAddons.length > 0 && (
                                        <p className="text-muted text-xs">
                                            Nota: en un upgrade de plan, los módulos elegidos en &quot;Sumar módulos&quot;
                                            ({upgradeAddons.map((k) => ADDON_CONFIG[k].label).join(', ')}) no se incluyen en
                                            este cobro inmediato. Agrégalos desde la sección Módulos add-on cuando el plan esté activo.
                                        </p>
                                    )}
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
                                        {upgradeAddons.length > 0 && (
                                            <span className="text-muted">
                                                {' '}(plan ${selectedPrice.toLocaleString('es-CL')} + {upgradeAddons.map((k) => ADDON_CONFIG[k].label).join(', ')})
                                            </span>
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
                            <button
                                type="button"
                                onClick={() => { setShowUpgradeConfirm(false); void handleChangePlan() }}
                                disabled={saving}
                                className="h-12 w-full rounded-control bg-sport-500 text-sm font-bold text-white transition-colors hover:bg-sport-600 disabled:opacity-60 disabled:hover:bg-sport-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                            >
                                {saving ? 'Procesando...' : 'Confirmar'}
                            </button>
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

            {/* ── Modal de confirmación de ALTA de add-on (plan 05 F5.2) ── */}
            {addonModalKey && (() => {
                const cfg = ADDON_CONFIG[addonModalKey]
                const rules = getAddonPaymentRulesForCycle(coachCycle)
                return (
                    <div
                        className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--surface-overlay)] md:items-center md:px-4"
                        onClick={() => setAddonModalKey(null)}
                    >
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby={addonModalTitleId}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full rounded-t-sheet bg-surface-card p-6 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] shadow-[var(--shadow-sheet)] max-h-[88dvh] overflow-y-auto md:max-w-lg md:rounded-card md:border md:border-subtle md:shadow-2xl md:max-h-[90dvh]"
                        >
                            <div className="mx-auto mb-4 h-1 w-[38px] rounded-full bg-[var(--ink-200)] md:hidden" aria-hidden="true" />
                            <h2 id={addonModalTitleId} className="font-display text-xl font-extrabold tracking-tight text-strong">Agregar {cfg.label}</h2>
                            <p className="mt-1 text-sm text-muted">{cfg.description}</p>

                            {/* Desglose: el total compuesto en vivo lo da el endpoint (billing.totalClp) */}
                            <div className="mt-4 space-y-1.5 rounded-control border border-subtle bg-surface-sunken p-4 text-sm">
                                <div className="flex justify-between text-muted">
                                    <span>Tu plan ({TIER_CONFIG[coachTier]?.label ?? coachTier})</span>
                                    <span className="text-strong">${(billing?.baseClp ?? getTierPriceClp(coachTier, coachCycle)).toLocaleString('es-CL')} CLP</span>
                                </div>
                                <div className="flex justify-between text-muted">
                                    <span>{cfg.label}</span>
                                    <span className="text-strong">${cfg.priceClpMensual.toLocaleString('es-CL')} CLP / mes</span>
                                </div>
                                <p className="pt-1 text-xs text-muted">
                                    Pagas ahora un monto único prorrateado por los días que restan de tu ciclo.
                                    Desde la renovación, el valor del módulo se suma a tu cobro habitual. El monto exacto
                                    del pago inicial se calcula en el checkout seguro de Mercado Pago.
                                </p>
                                {activeCoupon &&
                                    activeCoupon.spec.type === 'percent' &&
                                    (activeCoupon.spec.target === 'total' ||
                                        (activeCoupon.spec.target === 'module' &&
                                            (activeCoupon.spec.moduleKeys?.includes(addonModalKey ?? '') ?? false))) && (
                                        <p className="pt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                            Tu cupón {activeCoupon.code} ({Math.min(100, Math.max(0, activeCoupon.spec.value))}%)
                                            también se aplica a este módulo: el pago prorrateado y tu cobro mensual vienen con
                                            el descuento.
                                        </p>
                                    )}
                            </div>

                            {/* Las 5 reglas textuales (variante por ciclo) */}
                            <div className="mt-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Condiciones de cobro</p>
                                <ol className="mt-2 space-y-2">
                                    {rules.rules.map((r) => (
                                        <li key={r.number} className="text-xs text-muted">
                                            <span className="font-semibold text-strong">{r.title}.</span> {r.text}
                                        </li>
                                    ))}
                                </ol>
                            </div>

                            {/* Checkbox obligatorio: habilita el CTA. Autofocus al abrir (primer interactivo). */}
                            <label className="mt-4 flex items-start gap-2 text-xs text-muted">
                                <input
                                    type="checkbox"
                                    ref={(el) => { if (el) el.focus() }}
                                    checked={addonTermsAccepted}
                                    onChange={(e) => {
                                        setAddonTermsAccepted(e.target.checked)
                                        if (e.target.checked) {
                                            captureAddonFunnel('addon_terms_accepted', { module_key: addonModalKey, billing_cycle: coachCycle, tier: coachTier })
                                        }
                                    }}
                                    className="mt-0.5 h-4 w-4 rounded border-border shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                                />
                                <span>Acepto estas condiciones de cobro, renovación y término.</span>
                            </label>

                            <div className="mt-5 flex flex-col gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => void handleAddAddon()}
                                    disabled={!addonTermsAccepted || addonSaving || !SELF_SERVICE_ADDONS_ENABLED}
                                    className="flex h-12 w-full items-center justify-center gap-2 rounded-control bg-sport-500 text-sm font-bold text-white transition-colors hover:bg-sport-600 disabled:opacity-60 disabled:hover:bg-sport-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                                >
                                    {addonSaving ? 'Procesando...' : (
                                        <>
                                            <span>Ir a pagar</span>
                                            <ArrowRight className="h-4 w-4" />
                                        </>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAddonModalKey(null)}
                                    className="h-11 w-full rounded-control text-sm font-semibold text-muted hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                )
            })()}

            {/* ── Modal de BAJA de add-on (plan 05 F5.2) ── */}
            {cancelAddonKey && (
                <div
                    className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--surface-overlay)] md:items-center md:px-4"
                    onClick={() => { setCancelAddonKey(null); setCancelAddonEffective(undefined) }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={cancelAddonModalTitleId}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full rounded-t-sheet bg-surface-card p-6 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] shadow-[var(--shadow-sheet)] max-h-[88dvh] overflow-y-auto md:max-w-md md:rounded-card md:border md:border-subtle md:shadow-2xl md:max-h-[90dvh]"
                    >
                        <div className="mx-auto mb-4 h-1 w-[38px] rounded-full bg-[var(--ink-200)] md:hidden" aria-hidden="true" />
                        {cancelAddonEffective === undefined ? (
                            <>
                                <h2 id={cancelAddonModalTitleId} className="font-display text-xl font-extrabold tracking-tight text-strong">Quitar {ADDON_CONFIG[cancelAddonKey].label}</h2>
                                <p className="mt-2 text-sm text-muted">
                                    Conservas el acceso hasta el final del período que ya pagaste. No hay reembolsos por
                                    fracciones no usadas. ¿Confirmas que quieres quitar este módulo?
                                </p>
                                <div className="mt-5 flex flex-col gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => void handleCancelAddon()}
                                        disabled={addonSaving || !SELF_SERVICE_ADDONS_ENABLED}
                                        className="h-12 w-full rounded-control border border-[var(--danger-100)] text-sm font-bold text-[var(--danger-600)] transition-colors hover:bg-[var(--danger-100)] disabled:opacity-60 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger-500)] focus-visible:ring-offset-2"
                                    >
                                        {addonSaving ? 'Procesando...' : 'Quitar módulo'}
                                    </button>
                                    <button
                                        type="button"
                                        ref={(el) => { if (el) el.focus() }}
                                        onClick={() => setCancelAddonKey(null)}
                                        className="h-11 w-full rounded-control text-sm font-semibold text-muted hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                                    >
                                        Volver
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <h2 id={cancelAddonModalTitleId} className="font-display text-xl font-extrabold tracking-tight text-strong">Baja registrada</h2>
                                <p className="mt-2 text-sm text-muted" data-testid="addon-cancel-effective">
                                    {cancelAddonEffective
                                        ? `Conservas el acceso a ${ADDON_CONFIG[cancelAddonKey].label} hasta el ${new Date(cancelAddonEffective).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}. Sin reembolso de fracciones.`
                                        : `Tu primer cobro incluirá igualmente ${ADDON_CONFIG[cancelAddonKey].label} (compromiso mínimo de un ciclo). Después de ese cobro se programa su término. Sin reembolso de fracciones.`}
                                </p>
                                <div className="mt-5">
                                    <button
                                        type="button"
                                        ref={(el) => { if (el) el.focus() }}
                                        onClick={() => { setCancelAddonKey(null); setCancelAddonEffective(undefined) }}
                                        className="h-12 w-full rounded-control bg-sport-500 text-sm font-bold text-white transition-colors hover:bg-sport-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                                    >
                                        Entendido
                                    </button>
                                </div>
                            </>
                        )}
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
                            Conservás acceso hasta el{' '}
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
        </main>
    )
}
