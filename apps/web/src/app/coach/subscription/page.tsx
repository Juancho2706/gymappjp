'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    ADDON_CONFIG,
    ADDON_MODULE_KEYS,
    ADDON_PAYMENT_RULES,
    BILLING_CYCLE_CONFIG,
    comparePlanDirection,
    getAddonPaymentRulesForCycle,
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
import { useCaptureAddonFunnel } from '@/lib/posthog/events'
import { Zap, Crown, Rocket, TrendingUp, Building2, Check, Leaf, HelpCircle, Puzzle, Lock, Gift, type LucideIcon } from 'lucide-react'

// growth/scale: LEGACY (fuera de venta). Se mantienen en los mapas de display porque el PLAN
// ACTUAL de un coach grandfathered puede ser legacy y debe renderizar su icono/color correcto.
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
    const [coach, setCoach] = useState<CoachSubscription | null>(null)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // Motivo visible cuando el coach clickea una card de plan bloqueada (cupo / nutrición).
    const [blockedMsg, setBlockedMsg] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)
    const [reason, setReason] = useState('')
    const [selectedTier, setSelectedTier] = useState<SubscriptionTier>('starter')
    const [selectedCycle, setSelectedCycle] = useState<BillingCycle>('monthly')
    const [events, setEvents] = useState<SubscriptionEvent[]>([])
    const [showUpgradeConfirm, setShowUpgradeConfirm] = useState(false)
    // Alumnos activos standalone (del endpoint) — bloquea downgrades que no caben (OVER_CAPACITY).
    const [activeClientCount, setActiveClientCount] = useState(0)

    // ── Add-ons (plan 05 F5) ──────────────────────────────────────────────────
    const [addons, setAddons] = useState<CoachAddonView[]>([])
    const [billing, setBilling] = useState<BillingBreakdown | null>(null)
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

    useEffect(() => {
        let isMounted = true
        ;(async () => {
            setLoading(true)
            try {
                const response = await fetch('/api/payments/subscription-status')
                const payload = await response.json()
                if (!response.ok) throw new Error(payload.error ?? 'No se pudo cargar la suscripción')
                if (!isMounted) return
                if (payload.coach?.subscription_status === 'org_managed') {
                    router.replace('/coach/dashboard')
                    return
                }
                setCoach(payload.coach)
                setEvents(Array.isArray(payload.events) ? payload.events : [])
                setAddons(Array.isArray(payload.addons) ? payload.addons : [])
                setBilling(payload.billing ?? null)
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

    const allowedCycles = getTierAllowedBillingCycles(selectedTier)
    const allowedCycleOptions = cycleOptions.filter((cycle) => allowedCycles.includes(cycle))

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
                            'Quita el modulo de Nutricion por intercambios antes de bajar a este plan.'
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
    const coachCycle = (coach?.billing_cycle ?? 'monthly') as BillingCycle
    const coachTier = (coach?.subscription_tier ?? 'starter') as SubscriptionTier
    const hasActivePaidPlan =
        coachTier !== 'free' &&
        (coach?.subscription_status === 'active' || coach?.subscription_status === 'trialing')
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
            setEvents(Array.isArray(payload.events) ? payload.events : [])
            setAddons(Array.isArray(payload.addons) ? payload.addons : [])
            setBilling(payload.billing ?? null)
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
                            // Un tier desconocido (ni venta ni legacy — data corrupta o tier nuevo
                            // sin display) NO colapsa a 'starter' (mentiria con su icono/color).
                            // Estado de error explicito: icono neutro + label crudo + aviso (abajo).
                            const isKnownTier = coach.subscription_tier in TIER_CONFIG
                            if (!isKnownTier) {
                                return (
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40">
                                        <HelpCircle className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                )
                            }
                            const t = coach.subscription_tier as SubscriptionTier
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
                            {!(coach.subscription_tier in TIER_CONFIG) && (
                                <p className="mt-1 text-sm font-medium text-amber-600 dark:text-amber-400">
                                    Plan no reconocido — contacta soporte.
                                </p>
                            )}
                            {coach.current_period_end ? (
                                <p className="text-sm text-muted-foreground mt-1">
                                    {coach.subscription_status === 'canceled' ? 'Acceso hasta' : 'Próximo cobro'}:{' '}
                                    <span className="font-semibold text-foreground">
                                        {new Date(coach.current_period_end).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
                                    </span>
                                    {coach.subscription_status === 'active' && (() => {
                                        // Total compuesto (base + add-ons) del endpoint — la UI NUNCA calcula precios.
                                        const total = billing?.totalClp ?? getTierPriceClp(coach.subscription_tier as SubscriptionTier, coach.billing_cycle as BillingCycle)
                                        return total > 0 ? <span className="text-muted-foreground"> · ${total.toLocaleString('es-CL')} CLP</span> : null
                                    })()}
                                </p>
                            ) : coach.subscription_tier === 'free' ? (
                                <p className="text-sm text-muted-foreground mt-1">
                                    Sin fecha de vencimiento · <span className="text-foreground font-semibold">Gratis para siempre</span>
                                </p>
                            ) : null}
                            {/* Desglose compuesto (base + add-ons) — solo si hay add-ons facturables */}
                            {coach.subscription_status === 'active' && billing && billing.addonsClp > 0 && (
                                <div className="mt-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs">
                                    <div className="flex justify-between text-muted-foreground">
                                        <span>Plan base</span>
                                        <span className="text-foreground">${billing.baseClp.toLocaleString('es-CL')} CLP</span>
                                    </div>
                                    <div className="mt-0.5 flex justify-between text-muted-foreground">
                                        <span>Módulos add-on</span>
                                        <span className="text-foreground">${billing.addonsClp.toLocaleString('es-CL')} CLP</span>
                                    </div>
                                    <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold text-foreground">
                                        <span>Total próximo cobro</span>
                                        <span>${billing.totalClp.toLocaleString('es-CL')} CLP</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            ) : null}

            {/* ── Add-ons (módulos) — superficie de venta permitida #2 (anti-hostigamiento) ── */}
            {coach ? (
                <section id="addons" className="mt-6 rounded-2xl border border-border bg-card p-5">
                    <div className="flex items-center gap-2">
                        <Puzzle className="h-5 w-5 text-primary" />
                        <h2 className="text-lg font-semibold text-foreground">Módulos add-on</h2>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Suma módulos a tu plan según los necesites. Cada módulo se cobra junto a tu suscripción
                        y puedes quitarlo cuando quieras.
                    </p>

                    <div className="mt-4 space-y-3">
                        {ADDON_MODULE_KEYS.map((key) => {
                            const cfg = ADDON_CONFIG[key]
                            const row = addonForKey(key)
                            // Estado por módulo (plan 05 F5.1).
                            const isCourtesy = row?.source === 'admin_grant'
                            const isActive = row?.status === 'active' && row.source === 'self_service'
                            const isCancelPendingCharged = row?.status === 'cancel_pending' && row.source === 'self_service' && row.firstChargedAt !== null
                            const isCommitted = row?.status === 'cancel_pending' && row.source === 'self_service' && row.firstChargedAt === null
                            // D8: nutrition_exchanges requiere tier con nutrición (Pro+).
                            const requiresNutritionTier = key === 'nutrition_exchanges' && !getTierCapabilities(coachTier).canUseNutrition
                            const canAdd = hasActivePaidPlan && !requiresNutritionTier && !row

                            return (
                                <div key={key} className="rounded-xl border border-border dark:border-white/10 p-4">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold text-foreground">{cfg.label}</p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">{cfg.description}</p>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            {isCourtesy ? (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-500">
                                                    <Gift className="h-3 w-3" /> Cortesía EVA
                                                </span>
                                            ) : isActive ? (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-500">
                                                    <Check className="h-3 w-3" /> Activo
                                                </span>
                                            ) : isCancelPendingCharged ? (
                                                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-500">
                                                    Se desactiva el {row?.expiresAt ? new Date(row.expiresAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' }) : 'fin del período'}
                                                </span>
                                            ) : isCommitted ? (
                                                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-500">
                                                    Comprometido hasta el primer cobro
                                                </span>
                                            ) : requiresNutritionTier ? (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                                                    <Lock className="h-3 w-3" /> Requiere plan Pro+
                                                </span>
                                            ) : (
                                                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                                                    Disponible
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Acción Agregar / Quitar */}
                                    <div className="mt-3 flex items-center justify-between gap-3">
                                        <span className="text-xs text-muted-foreground">
                                            ${cfg.priceClpMensual.toLocaleString('es-CL')} CLP / mes
                                            {coachCycle !== 'monthly' && (
                                                <span className="ml-1">
                                                    ({coachCycle === 'annual' ? 'tu ciclo anual descuenta 20%' : 'tu ciclo trimestral descuenta 10%'})
                                                </span>
                                            )}
                                        </span>
                                        {isActive || isCancelPendingCharged || isCommitted ? (
                                            <button
                                                type="button"
                                                disabled={addonSaving || isCancelPendingCharged || isCommitted || !SELF_SERVICE_ADDONS_ENABLED}
                                                onClick={() => { setCancelAddonEffective(undefined); setCancelAddonKey(key) }}
                                                className="shrink-0 h-9 rounded-xl border border-border px-4 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
                                            >
                                                {isCancelPendingCharged || isCommitted ? 'Baja solicitada' : 'Quitar'}
                                            </button>
                                        ) : canAdd ? (
                                            <button
                                                type="button"
                                                disabled={addonSaving || !SELF_SERVICE_ADDONS_ENABLED}
                                                onClick={() => openAddonModal(key)}
                                                className="shrink-0 h-9 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                                            >
                                                Agregar
                                            </button>
                                        ) : null}
                                    </div>

                                    {isCourtesy && (
                                        <p className="mt-2 text-[11px] text-muted-foreground">
                                            Activo sin costo por cortesía de EVA. No se incluye en tu cobro.
                                        </p>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    {!hasActivePaidPlan && (
                        <p className="mt-4 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                            Los módulos add-on están disponibles con un plan pago activo.
                        </p>
                    )}
                    {hasActivePaidPlan && !SELF_SERVICE_ADDONS_ENABLED && (
                        <p className="mt-4 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                            La compra y baja de módulos estará disponible muy pronto. Si necesitas un módulo ahora,
                            escríbenos a <a href="mailto:contacto@eva-app.cl" className="text-primary hover:opacity-80">contacto@eva-app.cl</a>.
                        </p>
                    )}
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
                        return (
                            <button
                                key={tier}
                                type="button"
                                aria-disabled={isBlocked}
                                title={blockTooltip}
                                onClick={() => {
                                    if (isBlocked) { setBlockedMsg(blockTooltip ?? 'No puedes seleccionar este plan.'); return }
                                    setBlockedMsg(null)
                                    setSelectedTier(tier)
                                }}
                                className={`relative rounded-2xl border p-4 text-left transition-all ${
                                    isBlocked
                                        ? 'cursor-not-allowed border-border opacity-50'
                                        : isSelected
                                        ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30'
                                        : 'border-border hover:border-border/80 hover:bg-secondary/30'
                                }`}
                            >
                                {badge && !isBlocked && (
                                    <span className={`absolute right-3 top-3 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                                        {badge.label}
                                    </span>
                                )}
                                {isBlocked && (
                                    <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                        <Lock className="h-3 w-3" /> {wouldExceed ? 'Sin cupo' : 'Nutrición'}
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

                {blockedMsg && (
                    <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-600 dark:text-amber-300">
                        <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{blockedMsg}</span>
                    </div>
                )}

                {/* Combo plan + add-ons (plan 05): elegí módulos para pagarlos JUNTO al plan en un
                    solo checkout. Visible solo con el flag de lanzamiento (en prod oculto). */}
                {SELF_SERVICE_ADDONS_ENABLED && (
                    <div className="rounded-xl border border-border bg-card p-4">
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <Puzzle className="h-3.5 w-3.5" /> Sumar módulos (opcional · se pagan junto al plan)
                        </p>
                        <div className="space-y-1.5">
                            {ADDON_MODULE_KEYS.map((key) => {
                                const cfg = ADDON_CONFIG[key]
                                const needsNutrition =
                                    key === 'nutrition_exchanges' && !getTierCapabilities(selectedTier).canUseNutrition
                                const checked = upgradeAddons.includes(key)
                                return (
                                    <label
                                        key={key}
                                        className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                                            needsNutrition
                                                ? 'cursor-not-allowed border-border opacity-50'
                                                : 'cursor-pointer border-border hover:bg-secondary/40'
                                        }`}
                                    >
                                        <span className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                disabled={needsNutrition}
                                                checked={checked}
                                                onChange={(e) =>
                                                    setUpgradeAddons((prev) =>
                                                        e.target.checked
                                                            ? [...new Set([...prev, key])]
                                                            : prev.filter((k) => k !== key)
                                                    )
                                                }
                                                className="h-4 w-4 rounded border-border"
                                            />
                                            <span className="text-foreground">{cfg.label}</span>
                                            {needsNutrition && (
                                                <span className="text-[10px] font-semibold text-amber-500">requiere Pro+</span>
                                            )}
                                        </span>
                                        <span className="text-muted-foreground">
                                            ${cfg.priceClpMensual.toLocaleString('es-CL')}/mes
                                        </span>
                                    </label>
                                )
                            })}
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-secondary/30 px-4 py-3">
                    <div>
                        <p className="text-xs text-muted-foreground">
                            {upgradeAddons.length > 0 ? 'Total (plan + módulos)' : 'Total a pagar'}
                        </p>
                        <p className="text-lg font-extrabold text-foreground">
                            ${selectedComposite.toLocaleString('es-CL')} CLP
                            <span className="text-sm font-normal text-muted-foreground"> / {BILLING_CYCLE_CONFIG[selectedCycle].label.toLowerCase()}</span>
                        </p>
                        {upgradeAddons.length > 0 && (
                            <p className="text-[11px] text-muted-foreground">
                                plan ${selectedPrice.toLocaleString('es-CL')} + {upgradeAddons.length} módulo(s) ${upgradeAddonsCycleTotal.toLocaleString('es-CL')}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowUpgradeConfirm(true)}
                        disabled={saving || isNoOpChange}
                        title={isNoOpChange ? 'Ya tienes este plan y ciclo. Elige un plan o ciclo distinto.' : undefined}
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
                                    ${selectedComposite.toLocaleString('es-CL')} CLP / {BILLING_CYCLE_CONFIG[selectedCycle].label.toLowerCase()}
                                </strong>
                                {upgradeAddons.length > 0 && (
                                    <span className="text-muted-foreground">
                                        {' '}(plan ${selectedPrice.toLocaleString('es-CL')} + {upgradeAddons.map((k) => ADDON_CONFIG[k].label).join(', ')})
                                    </span>
                                )}
                                .
                            </p>
                            {!TIER_CONFIG[selectedTier].features.includes('Planes de nutrición') &&
                             coach?.subscription_tier &&
                             TIER_CONFIG[coach.subscription_tier as SubscriptionTier]?.features.includes('Planes de nutrición') && (
                                <p className="text-amber-600 dark:text-amber-400 text-xs font-medium">
                                    ⚠ El nuevo plan no incluye el módulo de nutrición. Perderás ese acceso al cambiar.
                                </p>
                            )}
                            {/* Add-ons activos viajan en el cambio de plan: el monto del checkout los incluye */}
                            {addons.some((a) => a.source === 'self_service' && a.status !== 'cancelled') && (
                                <p className="text-muted-foreground text-xs">
                                    Tus módulos add-on activos ({addons
                                        .filter((a) => a.source === 'self_service' && a.status !== 'cancelled')
                                        .map((a) => ADDON_CONFIG[a.moduleKey].label)
                                        .join(', ')}) se mantienen y se suman al monto del nuevo plan en el
                                    checkout.
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

            {/* ── Modal de confirmación de ALTA de add-on (plan 05 F5.2) ── */}
            {addonModalKey && (() => {
                const cfg = ADDON_CONFIG[addonModalKey]
                const rules = getAddonPaymentRulesForCycle(coachCycle)
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
                        <div className="w-full max-w-lg rounded-2xl border border-border dark:border-white/10 bg-card dark:bg-zinc-950 p-6 shadow-2xl max-h-[90dvh] overflow-y-auto">
                            <h2 className="text-lg font-bold text-foreground">Agregar {cfg.label}</h2>
                            <p className="mt-1 text-sm text-muted-foreground">{cfg.description}</p>

                            {/* Desglose: el total compuesto en vivo lo da el endpoint (billing.totalClp) */}
                            <div className="mt-4 space-y-1.5 rounded-xl border border-border bg-secondary/40 p-4 text-sm">
                                <div className="flex justify-between text-muted-foreground">
                                    <span>Tu plan ({TIER_CONFIG[coachTier]?.label ?? coachTier})</span>
                                    <span className="text-foreground">${(billing?.baseClp ?? getTierPriceClp(coachTier, coachCycle)).toLocaleString('es-CL')} CLP</span>
                                </div>
                                <div className="flex justify-between text-muted-foreground">
                                    <span>{cfg.label}</span>
                                    <span className="text-foreground">${cfg.priceClpMensual.toLocaleString('es-CL')} CLP / mes</span>
                                </div>
                                <p className="pt-1 text-xs text-muted-foreground">
                                    Pagas ahora un monto único prorrateado por los días que restan de tu ciclo.
                                    Desde la renovación, el valor del módulo se suma a tu cobro habitual. El monto exacto
                                    del pago inicial se calcula en el checkout seguro de Mercado Pago.
                                </p>
                            </div>

                            {/* Las 5 reglas textuales (variante por ciclo) */}
                            <div className="mt-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condiciones de cobro</p>
                                <ol className="mt-2 space-y-2">
                                    {rules.rules.map((r) => (
                                        <li key={r.number} className="text-xs text-muted-foreground">
                                            <span className="font-semibold text-foreground">{r.title}.</span> {r.text}
                                        </li>
                                    ))}
                                </ol>
                            </div>

                            {/* Checkbox obligatorio: habilita el CTA */}
                            <label className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
                                <input
                                    type="checkbox"
                                    checked={addonTermsAccepted}
                                    onChange={(e) => {
                                        setAddonTermsAccepted(e.target.checked)
                                        if (e.target.checked) {
                                            captureAddonFunnel('addon_terms_accepted', { module_key: addonModalKey, billing_cycle: coachCycle, tier: coachTier })
                                        }
                                    }}
                                    className="mt-0.5 h-4 w-4 rounded border-border shrink-0"
                                />
                                <span>Acepto estas condiciones de cobro, renovación y término.</span>
                            </label>

                            <div className="mt-5 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setAddonModalKey(null)}
                                    className="flex-1 h-10 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleAddAddon()}
                                    disabled={!addonTermsAccepted || addonSaving || !SELF_SERVICE_ADDONS_ENABLED}
                                    className="flex-1 h-10 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                                >
                                    {addonSaving ? 'Procesando...' : 'Ir a pagar'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            })()}

            {/* ── Modal de BAJA de add-on (plan 05 F5.2) ── */}
            {cancelAddonKey && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
                    <div className="w-full max-w-md rounded-2xl border border-border dark:border-white/10 bg-card dark:bg-zinc-950 p-6 shadow-2xl">
                        {cancelAddonEffective === undefined ? (
                            <>
                                <h2 className="text-lg font-bold text-foreground">Quitar {ADDON_CONFIG[cancelAddonKey].label}</h2>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    Conservas el acceso hasta el final del período que ya pagaste. No hay reembolsos por
                                    fracciones no usadas. ¿Confirmas que quieres quitar este módulo?
                                </p>
                                <div className="mt-5 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setCancelAddonKey(null)}
                                        className="flex-1 h-10 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground"
                                    >
                                        Volver
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void handleCancelAddon()}
                                        disabled={addonSaving || !SELF_SERVICE_ADDONS_ENABLED}
                                        className="flex-1 h-10 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                                    >
                                        {addonSaving ? 'Procesando...' : 'Quitar módulo'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <h2 className="text-lg font-bold text-foreground">Baja registrada</h2>
                                <p className="mt-2 text-sm text-muted-foreground" data-testid="addon-cancel-effective">
                                    {cancelAddonEffective
                                        ? `Conservas el acceso a ${ADDON_CONFIG[cancelAddonKey].label} hasta el ${new Date(cancelAddonEffective).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}. Sin reembolso de fracciones.`
                                        : `Tu primer cobro incluirá igualmente ${ADDON_CONFIG[cancelAddonKey].label} (compromiso mínimo de un ciclo). Después de ese cobro se programa su término. Sin reembolso de fracciones.`}
                                </p>
                                <div className="mt-5">
                                    <button
                                        type="button"
                                        onClick={() => { setCancelAddonKey(null); setCancelAddonEffective(undefined) }}
                                        className="h-10 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                                    >
                                        Entendido
                                    </button>
                                </div>
                            </>
                        )}
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
