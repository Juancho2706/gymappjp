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
                'w-full h-12 text-base font-semibold rounded-xl transition-all duration-200',
                'bg-primary hover:opacity-90 text-primary-foreground',
                'shadow-lg shadow-primary/20 disabled:opacity-60 disabled:cursor-not-allowed'
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
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground font-display">
                    Un último paso
                </h1>
                <p className="mt-2 text-muted-foreground text-sm">
                    Completá tu perfil y elegí tu plan para empezar
                </p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-8 shadow-sm space-y-6">
                <form action={formAction} className="space-y-5">
                    <input type="hidden" name="subscription_tier" value={tier} />
                    <input type="hidden" name="billing_cycle" value={billingCycle} />

                    {/* Name */}
                    <div className="space-y-1.5">
                        <label htmlFor="full_name" className="text-foreground text-sm font-medium">
                            Nombre completo
                        </label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            <input
                                id="full_name"
                                name="full_name"
                                type="text"
                                defaultValue={defaultName}
                                placeholder="Juan Pérez"
                                required
                                minLength={2}
                                className="w-full pl-10 h-12 bg-secondary border border-border text-foreground rounded-xl placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                            />
                        </div>
                    </div>

                    {/* Brand */}
                    <div className="space-y-1.5">
                        <label htmlFor="brand_name" className="text-foreground text-sm font-medium">
                            Nombre de tu marca
                        </label>
                        <div className="relative">
                            <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            <input
                                id="brand_name"
                                name="brand_name"
                                type="text"
                                placeholder="Ej: JotaP Fitness"
                                required
                                minLength={2}
                                className="w-full pl-10 h-12 bg-secondary border border-border text-foreground rounded-xl placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                            />
                        </div>
                    </div>

                    {/* Plan selection */}
                    <section className="space-y-2">
                        <h2 className="text-sm font-semibold text-foreground">Elegí tu plan</h2>
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
                                            'rounded-xl border p-3 text-left transition',
                                            tier === key
                                                ? 'border-primary bg-primary/10'
                                                : 'border-border hover:border-primary/40'
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-1.5">
                                                <p className="font-semibold text-foreground">{option.label}</p>
                                                {isFree && (
                                                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-slate-500/15 text-slate-600 dark:text-slate-400">
                                                        Gratis para siempre
                                                    </span>
                                                )}
                                            </div>
                                            <span className={cn(
                                                'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                                                caps.canUseNutrition
                                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                            )}>
                                                {nutritionText}
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Hasta {option.maxClients} alumnos · {cycleText}
                                        </p>
                                        <p className="text-sm text-foreground mt-1 font-medium">
                                            {isFree ? (
                                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">$0 · Sin tarjeta</span>
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
                                            'rounded-xl border p-3 text-left transition',
                                            billingCycle === key
                                                ? 'border-primary bg-primary/10'
                                                : 'border-border hover:border-primary/40'
                                        )}
                                    >
                                        <p className="font-semibold text-foreground text-sm">{option.label}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {option.discountPercent > 0 ? `Ahorro ${option.discountPercent}%` : 'Sin descuento'}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Price summary */}
                    {!isFreeTier && (
                        <div className="rounded-xl border border-border bg-secondary/40 p-3 flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Total</span>
                            <span className="font-bold text-foreground">${selectedPrice.toLocaleString('es-CL')} CLP / {BILLING_CYCLE_CONFIG[billingCycle].label.toLowerCase()}</span>
                        </div>
                    )}

                    {/* Legal checkboxes */}
                    <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-3">
                        <label className="flex items-start gap-2 text-xs text-muted-foreground">
                            <input type="checkbox" name="accept_legal" required className="mt-0.5 h-4 w-4 rounded border-border shrink-0" />
                            <span>
                                Acepto los{' '}
                                <Link href="/legal" className="text-primary hover:opacity-80">términos de servicio</Link>
                                {' '}y la{' '}
                                <Link href="/privacidad" className="text-primary hover:opacity-80">política de privacidad</Link>.{' '}
                                <span className="text-destructive font-medium">*</span>
                            </span>
                        </label>
                        <label className="flex items-start gap-2 text-xs text-muted-foreground">
                            <input type="checkbox" name="accept_health_data" required className="mt-0.5 h-4 w-4 rounded border-border shrink-0" />
                            <span>
                                Acepto el tratamiento de datos de salud de mis alumnos conforme a la Ley 21.719.{' '}
                                <span className="text-destructive font-medium">*</span>
                            </span>
                        </label>
                        <label className="flex items-start gap-2 text-xs text-muted-foreground">
                            <input type="checkbox" name="accept_marketing" className="mt-0.5 h-4 w-4 rounded border-border shrink-0" />
                            <span>Quiero recibir novedades y ofertas de EVA. <span className="text-muted-foreground/60">(opcional)</span></span>
                        </label>
                    </div>

                    {state?.error && (
                        <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                            {state.error}
                        </div>
                    )}

                    <SubmitButton isFreeTier={isFreeTier} />
                </form>

                <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    {isFreeTier ? 'Sin tarjeta · Acceso inmediato.' : 'Registro seguro + activación automática.'}
                </p>

                {isFreeTier && (
                    <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-1.5">
                        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-primary" /> Plan Free incluye:
                        </p>
                        {['3 alumnos activos', 'Entrenos ilimitados', 'App para tus alumnos', 'Check-ins'].map(item => (
                            <div key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                                {item}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
