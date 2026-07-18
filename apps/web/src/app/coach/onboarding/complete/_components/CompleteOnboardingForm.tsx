'use client'

import { useActionState, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { Loader2, User, Store, CheckCircle2, Sparkles } from 'lucide-react'
import { completeOAuthOnboarding, type CompleteOnboardingState } from '../_actions/complete.actions'
import { cn } from '@/lib/utils'
import {
    BILLING_CYCLE_CONFIG,
    getDefaultBillingCycleForTier,
    getTierAllowedBillingCycles,
    getTierCapabilities,
    getTierBillingCycleSummary,
    getTierNutritionSummary,
    getTierPriceClp,
    isBillingCycleAllowedForTier,
    TIER_CONFIG,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'

const initialState: CompleteOnboardingState = {}
const tierOptions = Object.entries(TIER_CONFIG) as [SubscriptionTier, (typeof TIER_CONFIG)[SubscriptionTier]][]
const cycleOptions = Object.entries(BILLING_CYCLE_CONFIG) as [BillingCycle, (typeof BILLING_CYCLE_CONFIG)[BillingCycle]][]

function SubmitButton({ isFreeTier }: { isFreeTier: boolean }) {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className={cn(
                'w-full h-12 text-base font-bold tracking-[-0.01em] rounded-control transition-all duration-200 active:scale-[0.98]',
                'bg-[var(--cta-fill)] text-[var(--text-on-sport)] shadow-[var(--glow-sport)] hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)]',
                'disabled:opacity-60 disabled:cursor-not-allowed'
            )}
        >
            {pending ? (
                <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {isFreeTier ? 'Creando tu cuenta...' : 'Preparando pago...'}
                </span>
            ) : isFreeTier ? (
                'Empezar gratis →'
            ) : (
                'Continuar al pago →'
            )}
        </button>
    )
}

export function CompleteOnboardingForm({ defaultName }: { defaultName: string }) {
    const [state, formAction] = useActionState(completeOAuthOnboarding, initialState)
    const [tier, setTier] = useState<SubscriptionTier>('free')
    const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly')

    const isFreeTier = tier === 'free'
    const allowedCycles = useMemo(() => getTierAllowedBillingCycles(tier), [tier])
    const allowedCycleOptions = useMemo(
        () => cycleOptions.filter(([key]) => allowedCycles.includes(key)),
        [allowedCycles]
    )
    const selectedPrice = useMemo(() => getTierPriceClp(tier, billingCycle), [tier, billingCycle])

    function handleTierChange(newTier: SubscriptionTier) {
        setTier(newTier)
        const def = getDefaultBillingCycleForTier(newTier)
        setBillingCycle(isBillingCycleAllowedForTier(newTier, billingCycle) ? billingCycle : def)
    }

    return (
        <div className="w-full max-w-md mx-auto animate-slide-up">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-black tracking-[-0.03em] text-text-strong font-display">
                    Un último paso
                </h1>
                <p className="mt-2 text-text-muted text-sm">
                    Completa tu perfil y elige tu plan para empezar
                </p>
            </div>

            <div className="bg-surface-card border border-border-subtle rounded-card p-8 shadow-[var(--shadow-sm)] space-y-6">
                <form action={formAction} className="space-y-5">
                    <input type="hidden" name="subscription_tier" value={tier} />
                    <input type="hidden" name="billing_cycle" value={billingCycle} />

                    {/* Name */}
                    <div className="space-y-1.5">
                        <label htmlFor="full_name" className="text-text-strong text-[13px] font-semibold">
                            Nombre completo
                        </label>
                        <div className="relative">
                            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                            <input
                                id="full_name"
                                name="full_name"
                                type="text"
                                defaultValue={defaultName}
                                placeholder="Juan Pérez"
                                required
                                minLength={2}
                                className="w-full pl-10 h-12 bg-surface-card border-[1.5px] border-border-default text-text-strong text-[15px] font-medium rounded-control placeholder:text-text-muted focus:border-sport-600 focus:shadow-[var(--ring-focus)] transition-all outline-none"
                            />
                        </div>
                    </div>

                    {/* Brand */}
                    <div className="space-y-1.5">
                        <label htmlFor="brand_name" className="text-text-strong text-[13px] font-semibold">
                            Nombre de tu marca
                        </label>
                        <div className="relative">
                            <Store className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                            <input
                                id="brand_name"
                                name="brand_name"
                                type="text"
                                placeholder="Ej: JotaP Fitness"
                                required
                                minLength={2}
                                className="w-full pl-10 h-12 bg-surface-card border-[1.5px] border-border-default text-text-strong text-[15px] font-medium rounded-control placeholder:text-text-muted focus:border-sport-600 focus:shadow-[var(--ring-focus)] transition-all outline-none"
                            />
                        </div>
                    </div>

                    {/* Plan selection */}
                    <section className="space-y-2">
                        <h2 className="text-sm font-semibold text-foreground">Elige tu plan</h2>
                        <div className="grid gap-2">
                            {tierOptions.map(([key, option]) => {
                                const caps = getTierCapabilities(key)
                                const nutritionText = getTierNutritionSummary(key)
                                const cycleText = getTierBillingCycleSummary(key)
                                const defaultCycleForKey = getDefaultBillingCycleForTier(key)
                                const displayPrice = getTierPriceClp(key, defaultCycleForKey)
                                const isFree = key === 'free'
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => handleTierChange(key)}
                                        className={cn(
                                            'rounded-card border-[1.5px] p-3.5 text-left transition',
                                            tier === key
                                                ? 'border-sport-500 bg-sport-100 shadow-[var(--glow-sport)]'
                                                : 'border-border-subtle hover:border-sport-500/40'
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-1.5">
                                                <p className="font-semibold text-text-strong">{option.label}</p>
                                                {isFree && (
                                                    <span className="rounded-pill px-1.5 py-0.5 text-[10px] font-bold bg-[var(--success-100)] text-[var(--success-600)]">
                                                        Gratis para siempre
                                                    </span>
                                                )}
                                            </div>
                                            <span className={cn(
                                                'shrink-0 rounded-pill px-1.5 py-0.5 text-[10px] font-bold',
                                                caps.canUseNutrition
                                                    ? 'bg-[var(--success-100)] text-[var(--success-600)]'
                                                    : 'bg-[var(--warning-100)] text-[var(--warning-700)]'
                                            )}>
                                                {nutritionText}
                                            </span>
                                        </div>
                                        <p className="text-xs text-text-muted mt-0.5">
                                            Hasta {option.maxClients} alumnos · {cycleText}
                                        </p>
                                        <p className="text-sm text-text-body mt-1 font-medium">
                                            {isFree ? (
                                                <span className="text-[var(--success-600)] font-bold">$0 · Sin tarjeta</span>
                                            ) : (
                                                <>${displayPrice.toLocaleString('es-CL')} CLP / {BILLING_CYCLE_CONFIG[defaultCycleForKey].label.toLowerCase()}</>
                                            )}
                                        </p>
                                    </button>
                                )
                            })}
                        </div>
                    </section>

                    {/* Billing cycle (only for paid) */}
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

                    {/* Price summary */}
                    {!isFreeTier && (
                        <div className="rounded-control border border-border-subtle bg-surface-sunken p-3 flex items-center justify-between text-sm">
                            <span className="text-text-muted">Total</span>
                            <span className="font-bold text-text-strong">${selectedPrice.toLocaleString('es-CL')} CLP / {BILLING_CYCLE_CONFIG[billingCycle].label.toLowerCase()}</span>
                        </div>
                    )}

                    {/* Legal checkboxes */}
                    <div className="rounded-control border border-border-subtle bg-surface-sunken p-3 space-y-3">
                        <label className="flex items-start gap-2 text-xs text-text-muted">
                            <input type="checkbox" name="accept_legal" required className="mt-0.5 h-4 w-4 rounded border-border-default accent-[var(--sport-500)] shrink-0" />
                            <span>
                                Acepto los{' '}
                                <Link href="/legal" className="text-sport-600 hover:opacity-80">términos de servicio</Link>
                                {' '}y la{' '}
                                <Link href="/privacidad" className="text-sport-600 hover:opacity-80">política de privacidad</Link>.{' '}
                                <span className="text-[var(--danger-600)] font-medium">*</span>
                            </span>
                        </label>
                        <label className="flex items-start gap-2 text-xs text-text-muted">
                            <input type="checkbox" name="accept_health_data" required className="mt-0.5 h-4 w-4 rounded border-border-default accent-[var(--sport-500)] shrink-0" />
                            <span>
                                Acepto el tratamiento de datos de salud de mis alumnos conforme a la Ley 21.719.{' '}
                                <span className="text-[var(--danger-600)] font-medium">*</span>
                            </span>
                        </label>
                        <label className="flex items-start gap-2 text-xs text-text-muted">
                            <input type="checkbox" name="accept_marketing" className="mt-0.5 h-4 w-4 rounded border-border-default accent-[var(--sport-500)] shrink-0" />
                            <span>Quiero recibir novedades y ofertas de EVA. <span className="text-text-muted/60">(opcional)</span></span>
                        </label>
                    </div>

                    {state?.error && (
                        <div className="rounded-control border border-transparent bg-[var(--danger-100)] px-4 py-3 text-sm font-semibold text-[var(--danger-600)]">
                            {state.error}
                        </div>
                    )}

                    <SubmitButton isFreeTier={isFreeTier} />
                </form>

                <p className="text-center text-xs text-text-muted flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success-500)]" />
                    {isFreeTier ? 'Sin tarjeta · Acceso inmediato.' : 'Registro seguro + activación automática.'}
                </p>

                {isFreeTier && (
                    <div className="rounded-control bg-sport-100 border border-sport-500/20 p-3 space-y-1.5">
                        <p className="text-xs font-semibold text-text-strong flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-sport-600" /> Plan Free incluye:
                        </p>
                        {['3 alumnos activos', 'Entrenos ilimitados', 'App para tus alumnos', 'Check-ins'].map(item => (
                            <div key={item} className="flex items-center gap-2 text-xs text-text-muted">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[var(--success-500)]" />
                                {item}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
