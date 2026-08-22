'use client'

import { useMemo, useRef } from 'react'
import { Check, Minus, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    BILLING_CYCLE_CONFIG,
    getDefaultBillingCycleForTier,
    getTierAllowedBillingCycles,
    getTierCapabilities,
    getTierMaxClients,
    getTierPriceClp,
    SALE_TIERS,
    studentCountLabel,
    TIER_CONFIG,
    type BillingCycle,
    type SaleTier,
} from '@/lib/constants'

// Solo se ofrecen tiers a la venta (free/pro/elite — pricing v2). starter salió de venta;
// growth/scale siguen fuera de venta (grandfathered, ver plan 04).
const tierOptions = SALE_TIERS.map((tier) => [tier, TIER_CONFIG[tier]] as const)
const cycleOptions = Object.entries(BILLING_CYCLE_CONFIG) as [
    BillingCycle,
    (typeof BILLING_CYCLE_CONFIG)[BillingCycle],
][]

export type PlanStepProps = {
    tier: SaleTier
    setTier: (tier: SaleTier) => void
    billingCycle: BillingCycle
    setBillingCycle: (cycle: BillingCycle) => void
    couponCode: string
    setCouponCode: (code: string) => void
    couponFieldOpen: boolean
    setCouponFieldOpen: (open: boolean) => void
    couponAutoApplied: boolean
    /**
     * `?tier=free` explícito en la URL. El único enlace que la app del alumno abre hacia la web es
     * el sello «Hecho con EVA» → `/hecho-con-eva` → `/register?tier=free`, y App Review cuenta los
     * toques: una grilla de planes con precios a dos toques del sello es exactamente el camino de
     * compra fuera de la tienda que prohíbe la guideline 3.1.1. Con esta bandera el paso de plan no
     * pinta ni la grilla ni una cifra — el alta sigue mandando `subscription_tier=free` igual.
     */
    freeOnly: boolean
}

/** Paso 2 del alta: elegir plan (grilla) o, con `?tier=free`, confirmar el gratuito sin precios. */
export function PlanStep({
    tier,
    setTier,
    billingCycle,
    setBillingCycle,
    couponCode,
    setCouponCode,
    couponFieldOpen,
    setCouponFieldOpen,
    couponAutoApplied,
    freeOnly,
}: PlanStepProps) {
    // Radiogroup del selector de plan: navegación por flechas con roving tabindex.
    const tierGroupRef = useRef<HTMLDivElement>(null)
    const isFreeTier = tier === 'free'
    const allowedCycles = useMemo(() => getTierAllowedBillingCycles(tier), [tier])
    const allowedCycleOptions = useMemo(
        () => cycleOptions.filter(([key]) => allowedCycles.includes(key)),
        [allowedCycles]
    )

    // Navegación por teclado del radiogroup de planes (patrón WAI-ARIA: flechas mueven
    // la selección + el foco; Home/End a los extremos). Space/Enter selecciona vía onClick.
    function handleTierKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
        let next = index
        switch (event.key) {
            case 'ArrowDown':
            case 'ArrowRight':
                next = (index + 1) % tierOptions.length
                break
            case 'ArrowUp':
            case 'ArrowLeft':
                next = (index - 1 + tierOptions.length) % tierOptions.length
                break
            case 'Home':
                next = 0
                break
            case 'End':
                next = tierOptions.length - 1
                break
            default:
                return
        }
        event.preventDefault()
        setTier(tierOptions[next][0])
        const radios = tierGroupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
        radios?.[next]?.focus()
    }

    if (freeOnly) {
        return (
            <>
                <div>
                    <h1 className="font-display text-2xl font-black tracking-[-0.02em] text-text-strong">
                        Tu plan
                    </h1>
                    <p className="mt-1 text-[13.5px] text-text-muted">Creas tu cuenta y entras hoy mismo.</p>
                </div>
                <section className="space-y-2">
                    <div className="rounded-card border-[1.5px] border-sport-500 bg-sport-100 p-4">
                        <div className="flex items-start gap-3">
                            <span
                                aria-hidden="true"
                                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sport-500/15 text-sport-600"
                            >
                                <Sparkles className="h-[18px] w-[18px]" />
                            </span>
                            <div className="min-w-0">
                                <p className="font-display text-[15px] font-black tracking-[-0.01em] text-text-strong">
                                    Plan gratuito
                                </p>
                                {/* El cupo sale de @eva/tiers (studentCountLabel), no de un literal:
                                    si mañana Free cambia de cupo, esta tarjeta lo sigue sola. */}
                                <p className="mt-1 text-[13px] text-text-body">
                                    {studentCountLabel(getTierMaxClients('free'))} · con tu marca · sin tarjeta
                                </p>
                            </div>
                        </div>
                    </div>
                    <p className="text-[12.5px] text-text-muted">
                        Puedes cambiar de plan cuando quieras desde tu cuenta.
                    </p>
                </section>
            </>
        )
    }

    return (
        <>
            <div>
                <h1 className="font-display text-2xl font-black tracking-[-0.02em] text-text-strong">
                    Elige tu plan
                </h1>
                <p className="mt-1 text-[13.5px] text-text-muted">Cambia o cancela cuando quieras. Empieza gratis si quieres probar.</p>
            </div>
            <section className="space-y-2">
                <div
                    ref={tierGroupRef}
                    role="radiogroup"
                    aria-label="Elige tu plan"
                    className="grid gap-2.5"
                >
                    {tierOptions.map(([key, option], index) => {
                        const caps = getTierCapabilities(key)
                        const defaultCycleForKey = getDefaultBillingCycleForTier(key)
                        const displayPrice = getTierPriceClp(key, defaultCycleForKey)
                        const cycleLabel = BILLING_CYCLE_CONFIG[defaultCycleForKey].label.toLowerCase()
                        const isFree = key === 'free'
                        // Paridad con /pricing: pro es el plan destacado ("Más popular").
                        const isPopular = key === 'pro'
                        const selected = tier === key
                        // Features clave por tarjeta — strings EXACTOS de @eva/tiers (no se inventan).
                        // La fila "no incluida" (dash) muestra la escalera de upgrade.
                        const features = [
                            { label: option.maxClients === 1 ? '1 alumno' : `Hasta ${option.maxClients} alumnos`, included: true },
                            // Nutrición base (V2) no tiene gate de tier: incluida en todos los
                            // planes, Free incluido. `caps.canUseNutrition` solo gatea la compra
                            // del add-on en billing, por eso esta fila no lo consulta.
                            { label: 'Planes de nutrición', included: true },
                            // Pricing v2 (P3): los 4 módulos van incluidos en TODOS los planes,
                            // Free incluido — el gate server ya los libera (hasPaidModuleAccess).
                            { label: '4 módulos profesionales incluidos', included: true },
                            { label: 'Branding personalizado', included: caps.canUseBranding },
                        ]
                        return (
                            <button
                                key={key}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                aria-label={option.label}
                                tabIndex={selected ? 0 : -1}
                                onClick={() => setTier(key)}
                                onKeyDown={(event) => handleTierKeyDown(event, index)}
                                className={cn(
                                    'group relative w-full rounded-card border-[1.5px] p-4 text-left transition-all duration-200',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                                    selected
                                        ? 'border-sport-500 bg-sport-100 shadow-[var(--glow-sport)]'
                                        : isPopular
                                            ? 'border-sport-500/50 hover:border-sport-500/70 hover:bg-surface-sunken/40'
                                            : 'border-border-subtle hover:border-sport-500/40 hover:bg-surface-sunken/40'
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    {/* Indicador de radio — refuerzo visual de la semántica role=radio */}
                                    <span
                                        aria-hidden="true"
                                        className={cn(
                                            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                                            selected
                                                ? 'border-sport-500 bg-sport-500'
                                                : 'border-border-default group-hover:border-sport-500/60'
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'h-2 w-2 rounded-full bg-[var(--text-on-sport)] transition-transform duration-200',
                                                selected ? 'scale-100' : 'scale-0'
                                            )}
                                        />
                                    </span>

                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="font-display text-[15px] font-black tracking-[-0.01em] text-text-strong">
                                                {option.label}
                                            </span>
                                            {isFree && (
                                                <span className="rounded-pill bg-[var(--success-100)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--success-600)]">
                                                    Gratis para siempre
                                                </span>
                                            )}
                                            {isPopular && (
                                                <span className="rounded-pill bg-sport-500 px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-on-sport)]">
                                                    Más popular
                                                </span>
                                            )}
                                        </div>

                                        <div className="mt-1 flex items-baseline gap-1">
                                            {isFree ? (
                                                <>
                                                    <span className="font-display text-xl font-black text-[var(--success-600)]">$0</span>
                                                    <span className="text-xs font-semibold text-text-muted">· Sin tarjeta</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="font-display text-xl font-black text-text-strong">
                                                        ${displayPrice.toLocaleString('es-CL')}
                                                    </span>
                                                    <span className="text-xs font-medium text-text-muted">CLP / {cycleLabel}</span>
                                                </>
                                            )}
                                        </div>

                                        <ul className="mt-2.5 space-y-1">
                                            {features.map((feature) => (
                                                <li
                                                    key={feature.label}
                                                    className={cn(
                                                        'flex items-center gap-1.5 text-[12.5px]',
                                                        feature.included ? 'text-text-body' : 'text-text-subtle'
                                                    )}
                                                >
                                                    {feature.included ? (
                                                        <Check className="h-3.5 w-3.5 shrink-0 text-sport-600" aria-hidden="true" />
                                                    ) : (
                                                        <Minus className="h-3.5 w-3.5 shrink-0 text-text-subtle" aria-hidden="true" />
                                                    )}
                                                    <span className={cn(!feature.included && 'line-through decoration-1')}>
                                                        {feature.label}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </section>

            {allowedCycleOptions.length > 1 && (
                <section className="space-y-2">
                    <h2 className="text-sm font-semibold text-foreground">Frecuencia de pago</h2>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                        {allowedCycleOptions.map(([key, option]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setBillingCycle(key)}
                                className={cn(
                                    'rounded-card border-[1.5px] p-3 text-left transition',
                                    billingCycle === key
                                        ? 'border-sport-500 bg-sport-100'
                                        : 'border-border-subtle hover:border-sport-500/40'
                                )}
                            >
                                <p className="font-semibold text-text-strong text-sm">{option.label}</p>
                                <p className="text-xs text-text-muted">
                                    {option.discountPercent > 0 ? `Ahorro ${option.discountPercent}%` : 'Sin descuento'}
                                </p>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {/* Módulos: incluidos en TODOS los planes, Free incluido (pricing v2 P3 —
                el gate server ya los libera). Ya no se compran como add-ons en el signup. */}
            <section className="space-y-2">
                <div className="rounded-control border border-border-subtle bg-surface-sunken p-3">
                    <p className="text-sm font-semibold text-text-strong">Módulos profesionales incluidos</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                        Cardio, Evaluación de movimiento, Composición corporal y Nutrición Pro vienen con todos los planes — Free incluido, sin costo extra.
                    </p>
                </div>
                {/* REGISTER-CODE: código de descuento colapsado (camino primario = link
                    auto-aplicado ?codigo=). Solo aplica a planes pagos. */}
                {!isFreeTier && (
                    <div className="rounded-control border border-border-subtle bg-surface-sunken/60 p-3">
                        {!couponFieldOpen ? (
                            <button
                                type="button"
                                onClick={() => setCouponFieldOpen(true)}
                                className="text-sm font-semibold text-sport-600 hover:underline"
                            >
                                ¿Tienes un código de descuento?
                            </button>
                        ) : couponAutoApplied && couponCode ? (
                            <p className="text-sm text-[var(--success-600)]">
                                Código <span className="font-mono font-semibold">{couponCode}</span> aplicado. Verás el descuento con su detalle antes de pagar.
                            </p>
                        ) : (
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">Código de descuento</label>
                                <input
                                    value={couponCode}
                                    onChange={(e) => setCouponCode(e.target.value.toUpperCase().replace(/[\s-]+/g, ''))}
                                    placeholder="PARTNER20"
                                    className="w-full h-11 rounded-control border-[1.5px] border-border-default bg-surface-card px-3 text-sm font-mono uppercase text-text-strong focus:outline-none focus:border-sport-600 focus:shadow-[var(--ring-focus)]"
                                />
                                <p className="mt-1 text-[11px] text-text-muted">El descuento se confirma con su detalle antes del primer cobro.</p>
                            </div>
                        )}
                    </div>
                )}
            </section>
        </>
    )
}
