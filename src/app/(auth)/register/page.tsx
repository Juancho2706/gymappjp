'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import Script from 'next/script'
import { Loader2, User, Mail, Lock, Store, CheckCircle2, Sparkles } from 'lucide-react'
import { registerAction, type RegisterState } from './actions'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
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

const initialState: RegisterState = {}
const tierOptions = Object.entries(TIER_CONFIG) as [SubscriptionTier, (typeof TIER_CONFIG)[SubscriptionTier]][]
const cycleOptions = Object.entries(BILLING_CYCLE_CONFIG) as [
    BillingCycle,
    (typeof BILLING_CYCLE_CONFIG)[BillingCycle],
][]

function SubmitButton({ isFreeTier }: { isFreeTier: boolean }) {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className={cn(
                'w-full h-12 text-base font-semibold rounded-xl transition-all duration-200',
                'bg-primary hover:opacity-90 text-primary-foreground',
                'shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30',
                'disabled:opacity-60 disabled:cursor-not-allowed'
            )}
        >
            {pending ? (
                <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creando tu cuenta...
                </span>
            ) : isFreeTier ? (
                'Crear mi cuenta gratuita'
            ) : (
                'Crear Cuenta'
            )}
        </button>
    )
}

async function handleGoogleOAuth() {
    const supabase = createClient()
    const origin = window.location.origin
    await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${origin}/auth/register-callback` },
    })
}

export default function RegisterPage() {
    const [state, formAction] = useActionState(registerAction, initialState)
    const [step, setStep] = useState<1 | 2 | 3>(1)
    const [fullName, setFullName] = useState('')
    const [brandName, setBrandName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [clientError, setClientError] = useState<string | null>(null)
    const [tier, setTier] = useState<SubscriptionTier>('starter')
    const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly')
    const selectedTier = useMemo(() => TIER_CONFIG[tier], [tier])
    const selectedPrice = useMemo(() => getTierPriceClp(tier, billingCycle), [tier, billingCycle])
    const allowedCycles = useMemo(() => getTierAllowedBillingCycles(tier), [tier])
    const allowedCycleOptions = useMemo(
        () => cycleOptions.filter(([key]) => allowedCycles.includes(key)),
        [allowedCycles]
    )
    const isFreeTier = tier === 'free'

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const rawTier = params.get('tier')
        const normalizedTier =
            rawTier === 'starter_lite' ? 'starter' : rawTier
        const queryCycle = params.get('cycle')
        const nextTier =
            normalizedTier && normalizedTier in TIER_CONFIG
                ? (normalizedTier as SubscriptionTier)
                : 'starter'
        setTier(nextTier)
        if (queryCycle && queryCycle in BILLING_CYCLE_CONFIG) {
            const candidateCycle = queryCycle as BillingCycle
            setBillingCycle(
                isBillingCycleAllowedForTier(nextTier, candidateCycle)
                    ? candidateCycle
                    : getDefaultBillingCycleForTier(nextTier)
            )
            return
        }
        setBillingCycle(getDefaultBillingCycleForTier(nextTier))
    }, [])

    useEffect(() => {
        if (!isFreeTier && !isBillingCycleAllowedForTier(tier, billingCycle)) {
            setBillingCycle(getDefaultBillingCycleForTier(tier))
        }
    }, [tier, billingCycle, isFreeTier])

    function nextStep() {
        if (step === 1) {
            if (!fullName || !brandName || !email || password.length < 8) {
                setClientError('Completa tus datos antes de continuar al paso de plan y pago.')
                return
            }
        }
        setClientError(null)
        setStep((prev) => (prev === 1 ? 2 : 3))
    }

    function prevStep() {
        setStep((prev) => (prev === 3 ? 2 : 1))
    }

    return (
        <>
        {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
        )}
        <div className="w-full max-w-md mx-auto animate-slide-up">
            {/* Header */}
            <div className="text-center mb-8 flex flex-col items-center">
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground font-display">
                    Crea tu cuenta
                </h1>
                <p className="mt-2 text-muted-foreground text-sm">
                    {isFreeTier
                        ? `Paso ${step} de 3 — Regístrate y accedé gratis`
                        : `Paso ${step} de 3 — Regístrate, elige plan y activa tu suscripción`}
                </p>
            </div>

            {/* Card */}
            <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                <form action={formAction} className="space-y-4">
                    <input type="hidden" name="subscription_tier" value={tier} />
                    <input type="hidden" name="billing_cycle" value={billingCycle} />
                    {/* Honeypot — bots fill this, humans don't */}
                    <input
                        name="website"
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }}
                        aria-hidden="true"
                    />
                    {step !== 1 ? (
                        <>
                            <input type="hidden" name="full_name" value={fullName} />
                            <input type="hidden" name="brand_name" value={brandName} />
                            <input type="hidden" name="email" value={email} />
                            <input type="hidden" name="password" value={password} />
                        </>
                    ) : null}

                    <div className="mb-2 flex items-center gap-2">
                        {[1, 2, 3].map((s) => (
                            <div
                                key={s}
                                className={cn(
                                    'h-2 flex-1 rounded-full',
                                    step >= s ? 'bg-primary' : 'bg-border'
                                )}
                            />
                        ))}
                    </div>

                    {step === 1 ? (
                        <>
                    {/* Full Name */}
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
                                placeholder="Juan Pérez"
                                required
                                value={fullName}
                                onChange={(event) => setFullName(event.target.value)}
                                className="w-full pl-10 h-12 bg-secondary border border-border text-foreground rounded-xl placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                            />
                        </div>
                    </div>

                    {/* Brand Name */}
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
                                value={brandName}
                                onChange={(event) => setBrandName(event.target.value)}
                                className="w-full pl-10 h-12 bg-secondary border border-border text-foreground rounded-xl placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground pl-1">
                            Se generará tu URL automáticamente: omnicoach.app/<strong>tu-marca</strong>
                        </p>
                    </div>

                    {/* Email */}
                    <div className="space-y-1.5">
                        <label htmlFor="email" className="text-foreground text-sm font-medium">
                            Email
                        </label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            <input
                                id="email"
                                name="email"
                                type="email"
                                placeholder="coach@ejemplo.com"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                className="w-full pl-10 h-12 bg-secondary border border-border text-foreground rounded-xl placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                            />
                        </div>
                    </div>

                    {/* Password */}
                    <div className="space-y-1.5">
                        <label htmlFor="password" className="text-foreground text-sm font-medium">
                            Contraseña
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            <input
                                id="password"
                                name="password"
                                type="password"
                                placeholder="Mínimo 8 caracteres"
                                autoComplete="new-password"
                                required
                                minLength={8}
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                className="w-full pl-10 h-12 bg-secondary border border-border text-foreground rounded-xl placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                            />
                        </div>
                    </div>
                        </>
                    ) : null}

                    {step === 2 ? (
                        <>
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
                                                onClick={() => setTier(key)}
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
                                                    <span
                                                        className={cn(
                                                            'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                                                            caps.canUseNutrition
                                                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                                                : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                                        )}
                                                    >
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
                                                        <>
                                                            ${displayPrice.toLocaleString('es-CL')} CLP /{' '}
                                                            {BILLING_CYCLE_CONFIG[defaultCycleForKey].label.toLowerCase()}
                                                        </>
                                                    )}
                                                </p>
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
                        </>
                    ) : null}

                    {step === 3 ? (
                        <section className="rounded-xl border border-border p-4 space-y-3">
                            <h2 className="font-semibold text-foreground">
                                {isFreeTier ? 'Tu plan gratuito' : 'Resumen antes de pagar'}
                            </h2>
                            <div className="space-y-1.5 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Plan</span>
                                    <span className="font-semibold text-foreground">{selectedTier.label}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Alumnos</span>
                                    <span className="font-semibold text-foreground">Hasta {selectedTier.maxClients}</span>
                                </div>
                                {!isFreeTier && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Facturación</span>
                                        <span className="font-semibold text-foreground">{BILLING_CYCLE_CONFIG[billingCycle].label}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Nutrición</span>
                                    <span className={cn('font-semibold', getTierCapabilities(tier).canUseNutrition ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
                                        {getTierCapabilities(tier).canUseNutrition ? 'Incluida' : 'No incluida'}
                                    </span>
                                </div>
                                <div className="flex justify-between border-t border-border pt-2 mt-2">
                                    <span className="text-muted-foreground">{isFreeTier ? 'Costo' : 'Total a pagar'}</span>
                                    <span className="text-lg font-black text-foreground">
                                        {isFreeTier ? (
                                            <span className="text-emerald-600 dark:text-emerald-400">$0 — Gratis</span>
                                        ) : (
                                            `$${selectedPrice.toLocaleString('es-CL')} CLP`
                                        )}
                                    </span>
                                </div>
                            </div>
                            {isFreeTier ? (
                                <div className="flex items-start gap-2 pt-1 text-xs text-muted-foreground">
                                    <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-500" />
                                    <span>
                                        Sin tarjeta de crédito. Acceso inmediato. Podés hacer upgrade cuando quieras desde tu dashboard.
                                    </span>
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground pt-1">
                                    Al crear tu cuenta, te llevaremos directamente al checkout de MercadoPago para completar el pago.
                                </p>
                            )}
                        </section>
                    ) : null}

                    {/* Cloudflare Turnstile — invisible challenge, resolves silently for humans */}
                    {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
                        <div
                            className="cf-turnstile"
                            data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
                            data-appearance="interaction-only"
                        />
                    )}

                    {/* Error */}
                    {(clientError || state?.error) && (
                        <div className="animate-fade-in rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                            {state.error ?? clientError}
                        </div>
                    )}

                    <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-3">
                        {/* Checkbox 1: ToS + Privacy (required) */}
                        <label className="flex items-start gap-2 text-xs text-muted-foreground">
                            <input
                                type="checkbox"
                                name="accept_legal"
                                required
                                className="mt-0.5 h-4 w-4 rounded border-border shrink-0"
                            />
                            <span>
                                Acepto los{' '}
                                <Link href="/legal" className="text-primary hover:opacity-80">
                                    términos de servicio
                                </Link>{' '}
                                y la{' '}
                                <Link href="/privacidad" className="text-primary hover:opacity-80">
                                    política de privacidad
                                </Link>
                                .{' '}
                                <span className="text-destructive font-medium">*</span>
                            </span>
                        </label>
                        {/* Checkbox 2: Health data consent (required — Ley 21.719 Art. 16) */}
                        <label className="flex items-start gap-2 text-xs text-muted-foreground">
                            <input
                                type="checkbox"
                                name="accept_health_data"
                                required
                                className="mt-0.5 h-4 w-4 rounded border-border shrink-0"
                            />
                            <span>
                                Acepto el tratamiento de datos de salud de mis alumnos (registros de entrenamiento,
                                nutrición y métricas corporales) para prestar el servicio de coaching digital,
                                conforme a la Ley 21.719.{' '}
                                <span className="text-destructive font-medium">*</span>
                            </span>
                        </label>
                        {/* Checkbox 3: Marketing (optional — must be unchecked by default) */}
                        <label className="flex items-start gap-2 text-xs text-muted-foreground">
                            <input
                                type="checkbox"
                                name="accept_marketing"
                                className="mt-0.5 h-4 w-4 rounded border-border shrink-0"
                            />
                            <span>
                                Quiero recibir novedades, ofertas y consejos de EVA por email.{' '}
                                <span className="text-muted-foreground/60">(opcional)</span>
                            </span>
                        </label>
                    </div>

                    <div className="pt-2 flex gap-2">
                        {step > 1 ? (
                            <button
                                type="button"
                                onClick={prevStep}
                                className="h-12 px-4 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground"
                            >
                                Atrás
                            </button>
                        ) : null}
                        {step < 3 ? (
                            <button
                                type="button"
                                onClick={nextStep}
                                className="flex-1 h-12 text-base font-semibold rounded-xl transition-all duration-200 bg-primary hover:opacity-90 text-primary-foreground"
                            >
                                Continuar
                            </button>
                        ) : (
                            <div className="flex-1">
                                <SubmitButton isFreeTier={isFreeTier} />
                            </div>
                        )}
                    </div>
                </form>

                {/* Google OAuth */}
                <div className="mt-6 flex items-center gap-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground">o registrate con</span>
                    <div className="flex-1 h-px bg-border" />
                </div>

                <button
                    type="button"
                    onClick={handleGoogleOAuth}
                    className="mt-4 w-full h-11 flex items-center justify-center gap-2.5 rounded-xl border border-border bg-card hover:bg-secondary transition-colors text-sm font-medium text-foreground"
                >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Continuar con Google
                </button>

                {/* Divider */}
                <div className="mt-6 flex items-center gap-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground">¿Ya tienes cuenta?</span>
                    <div className="flex-1 h-px bg-border" />
                </div>

                <div className="mt-4 text-center">
                    <Link
                        href="/login"
                        className="text-sm text-primary hover:opacity-80 transition-opacity font-medium"
                    >
                        Iniciar sesión →
                    </Link>
                </div>
            </div>

            <p className="mt-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {isFreeTier ? 'Registro seguro · Acceso inmediato · Sin tarjeta.' : 'Registro seguro + activación automática de suscripción.'}
            </p>
        </div>
        </>
    )
}
