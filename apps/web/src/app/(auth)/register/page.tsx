'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import Script from 'next/script'
import { Loader2, User, Mail, Lock, Store, CheckCircle2, Sparkles } from 'lucide-react'
import { registerAction, type RegisterState } from './_actions/register.actions'
import { completeOAuthOnboarding, type CompleteOnboardingState } from '@/app/coach/onboarding/complete/_actions/complete.actions'
import { cn } from '@/lib/utils'
import { getCurrentOAuthUserProfile, startCoachGoogleRegistration } from '@/lib/auth/client-oauth'
import {
    ADDON_CONFIG,
    ADDON_MODULE_KEYS,
    getAddonPaymentRulesForCycle,
    BILLING_CYCLE_CONFIG,
    getDefaultBillingCycleForTier,
    getTierAllowedBillingCycles,
    getTierCapabilities,
    getTierBillingCycleSummary,
    getTierNutritionSummary,
    getTierPriceClp,
    isBillingCycleAllowedForTier,
    isSaleTier,
    SALE_TIERS,
    SELF_SERVICE_ADDONS_ENABLED,
    TIER_CONFIG,
    type BillingCycle,
    type SaleTier,
} from '@/lib/constants'
import type { ModuleKey } from '@/services/entitlements.service'

const initialState: RegisterState = {}
const googleInitialState: CompleteOnboardingState = {}
// Solo se ofrecen tiers a la venta (free/starter/pro/elite). growth/scale quedan fuera de venta (grandfathered, ver plan 04).
const tierOptions = SALE_TIERS.map((tier) => [tier, TIER_CONFIG[tier]] as const)
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
                'w-full h-12 text-base font-bold tracking-[-0.01em] rounded-control transition-all duration-200 active:scale-[0.98]',
                'bg-[var(--cta-fill)] text-[var(--text-on-sport)] shadow-[var(--glow-sport)] hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)]',
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

export default function RegisterPage() {
    const [state, formAction] = useActionState(registerAction, initialState)
    const [googleState, googleFormAction] = useActionState(completeOAuthOnboarding, googleInitialState)
    const [step, setStep] = useState<1 | 2 | 3>(1)
    const [fullName, setFullName] = useState('')
    const [brandName, setBrandName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [clientError, setClientError] = useState<string | null>(null)
    const [fromGoogle, setFromGoogle] = useState(false)
    const [tier, setTier] = useState<SaleTier>('starter')
    const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly')
    // Add-ons opcionales del signup (plan 05 F5.5) — solo tiers pagos.
    const [selectedAddons, setSelectedAddons] = useState<ModuleKey[]>([])
    // Código de descuento (REGISTER-CODE): manual (campo colapsado) o auto-aplicado desde ?codigo=.
    // Solo se threadea a /processing (el canje + disclosure SERNAC + consentimiento ocurren allá).
    const [couponCode, setCouponCode] = useState('')
    const [couponFieldOpen, setCouponFieldOpen] = useState(false)
    const [couponAutoApplied, setCouponAutoApplied] = useState(false)
    const selectedTier = useMemo(() => TIER_CONFIG[tier], [tier])
    const selectedPrice = useMemo(() => getTierPriceClp(tier, billingCycle), [tier, billingCycle])
    // Total en vivo = plan + add-ons seleccionados (monto por ciclo, mismos descuentos del plan).
    const addonsCycleTotal = useMemo(() => {
        const { months, discountPercent } = BILLING_CYCLE_CONFIG[billingCycle]
        return selectedAddons.reduce((sum, key) => {
            const gross = ADDON_CONFIG[key].priceClpMensual * months
            return sum + Math.round(gross * (1 - discountPercent / 100))
        }, 0)
    }, [selectedAddons, billingCycle])
    const liveTotal = selectedPrice + addonsCycleTotal
    const allowedCycles = useMemo(() => getTierAllowedBillingCycles(tier), [tier])
    const allowedCycleOptions = useMemo(
        () => cycleOptions.filter(([key]) => allowedCycles.includes(key)),
        [allowedCycles]
    )
    const isFreeTier = tier === 'free'

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)

        if (params.get('from') === 'google') {
            setFromGoogle(true)
            getCurrentOAuthUserProfile().then((profile) => {
                if (profile) {
                    setFullName(profile.fullName)
                    setEmail(profile.email)
                }
            })
        }

        // Auto-apply del código desde el link privado (?codigo=PARTNER20). Camino primario del deal.
        const rawCoupon = params.get('codigo') ?? params.get('coupon')
        if (rawCoupon) {
            setCouponCode(rawCoupon.toUpperCase().replace(/[\s-]+/g, ''))
            setCouponFieldOpen(true)
            setCouponAutoApplied(true)
        }

        const rawTier = params.get('tier')
        const normalizedTier = rawTier === 'starter_lite' ? 'starter' : rawTier
        const queryCycle = params.get('cycle')
        // Solo aceptamos tiers a la venta. Un link viejo con ?tier=growth/scale degrada a 'starter'.
        const nextTier: SaleTier =
            normalizedTier && isSaleTier(normalizedTier)
                ? normalizedTier
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

    // Add-ons solo en tiers pagos; nutrition_exchanges solo en tiers con nutrición (D8).
    // Al cambiar de plan se purgan los add-ons que dejen de ser válidos.
    useEffect(() => {
        if (isFreeTier) {
            if (selectedAddons.length > 0) setSelectedAddons([])
            return
        }
        const caps = getTierCapabilities(tier)
        setSelectedAddons((prev) => {
            const next = prev.filter((k) => (k === 'nutrition_exchanges' ? caps.canUseNutrition : true))
            return next.length === prev.length ? prev : next
        })
    }, [tier, isFreeTier, selectedAddons.length])

    const addonsCsv = selectedAddons.join(',')

    function nextStep() {
        if (step === 1) {
            if (fromGoogle) {
                if (!fullName || !brandName) {
                    setClientError('Completá tu nombre y nombre de marca antes de continuar.')
                    return
                }
            } else {
                if (!fullName || !brandName || !email || password.length < 8) {
                    setClientError('Completa tus datos antes de continuar al paso de plan y pago.')
                    return
                }
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
                <h1 className="text-3xl font-black tracking-[-0.03em] text-text-strong font-display">
                    Creá tu cuenta de coach
                </h1>
                <p className="mt-2 text-text-muted text-sm">
                    {fromGoogle && step === 1
                        ? 'Paso 1 de 3 — Un solo dato más y listo'
                        : isFreeTier
                            ? `Paso ${step} de 3 — Regístrate y accedé gratis`
                            : `Paso ${step} de 3 — Regístrate, elige plan y activa tu suscripción`}
                </p>
            </div>

            {/* Card */}
            <div className="bg-surface-card border border-border-subtle rounded-card p-8 shadow-[var(--shadow-sm)]">
                <form action={fromGoogle ? googleFormAction : formAction} className="space-y-4">
                    <input type="hidden" name="subscription_tier" value={tier} />
                    <input type="hidden" name="billing_cycle" value={billingCycle} />
                    <input type="hidden" name="addons" value={addonsCsv} />
                    <input type="hidden" name="coupon_code" value={couponCode} />
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
                            {!fromGoogle && <input type="hidden" name="email" value={email} />}
                            {!fromGoogle && <input type="hidden" name="password" value={password} />}
                        </>
                    ) : null}
                    {/* When in Google mode and on step 1, pass name+brand as hidden so action reads them */}
                    {fromGoogle && step === 1 && (
                        <>
                            <input type="hidden" name="full_name" value={fullName} />
                            <input type="hidden" name="brand_name" value={brandName} />
                        </>
                    )}

                    <div className="mb-2 flex items-center gap-2">
                        {[1, 2, 3].map((s) => (
                            <div
                                key={s}
                                className={cn(
                                    'h-1.5 flex-1 rounded-pill transition-colors duration-300',
                                    step >= s ? 'bg-sport-500' : 'bg-surface-sunken'
                                )}
                            />
                        ))}
                    </div>

                    {step === 1 ? (
                        <>
                    {fromGoogle && email && (
                        <div className="flex items-center gap-2 rounded-control bg-surface-sunken border border-border-subtle px-3 py-2 text-xs text-text-muted">
                            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                            <span>Cuenta Google: <strong className="text-text-strong">{email}</strong></span>
                        </div>
                    )}

                    {/* Full Name */}
                    <div className="space-y-1.5">
                        <label htmlFor="full_name" className="text-text-strong text-[13px] font-semibold">
                            Nombre completo
                        </label>
                        <div className="relative">
                            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                            <input
                                id="full_name"
                                name={fromGoogle ? undefined : 'full_name'}
                                type="text"
                                placeholder="Juan Pérez"
                                required
                                value={fullName}
                                onChange={(event) => setFullName(event.target.value)}
                                className="w-full pl-10 h-12 bg-surface-card border-[1.5px] border-border-default text-text-strong text-[15px] font-medium rounded-control placeholder:text-text-muted focus:border-sport-600 focus:shadow-[var(--ring-focus)] transition-all outline-none"
                            />
                        </div>
                    </div>

                    {/* Brand Name */}
                    <div className="space-y-1.5">
                        <label htmlFor="brand_name" className="text-text-strong text-[13px] font-semibold">
                            Nombre de tu marca
                        </label>
                        <div className="relative">
                            <Store className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                            <input
                                id="brand_name"
                                name={fromGoogle ? undefined : 'brand_name'}
                                type="text"
                                placeholder="Ej: JotaP Fitness"
                                required
                                value={brandName}
                                onChange={(event) => setBrandName(event.target.value)}
                                className="w-full pl-10 h-12 bg-surface-card border-[1.5px] border-border-default text-text-strong text-[15px] font-medium rounded-control placeholder:text-text-muted focus:border-sport-600 focus:shadow-[var(--ring-focus)] transition-all outline-none"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground pl-1">
                            Tu enlace para alumnos se genera automáticamente con un <strong>código único</strong> — lo encontrarás en tu panel.
                        </p>
                    </div>

                    {/* Email + Password — hidden for Google OAuth */}
                    {!fromGoogle && (
                        <>
                        <div className="space-y-1.5">
                            <label htmlFor="email" className="text-text-strong text-[13px] font-semibold">
                                Email
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    placeholder="coach@ejemplo.com"
                                    autoComplete="email"
                                    required
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    className="w-full pl-10 h-12 bg-surface-card border-[1.5px] border-border-default text-text-strong text-[15px] font-medium rounded-control placeholder:text-text-muted focus:border-sport-600 focus:shadow-[var(--ring-focus)] transition-all outline-none"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="password" className="text-text-strong text-[13px] font-semibold">
                                Contraseña
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
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
                                    className="w-full pl-10 h-12 bg-surface-card border-[1.5px] border-border-default text-text-strong text-[15px] font-medium rounded-control placeholder:text-text-muted focus:border-sport-600 focus:shadow-[var(--ring-focus)] transition-all outline-none"
                                />
                            </div>
                            {password.length > 0 && (() => {
                                const checks = [password.length >= 8, /\d/.test(password), /[a-zA-Z]/.test(password)]
                                const score = checks.filter(Boolean).length
                                return (
                                    <div className="mt-2">
                                        <div className="flex gap-1">
                                            {[0, 1, 2].map((i) => (
                                                <div
                                                    key={i}
                                                    className="h-1 flex-1 rounded-pill"
                                                    style={{
                                                        background:
                                                            i < score
                                                                ? score === 3
                                                                    ? 'var(--success-500)'
                                                                    : score === 2
                                                                        ? 'var(--warning-500)'
                                                                        : 'var(--danger-500)'
                                                                : 'var(--surface-sunken)',
                                                    }}
                                                />
                                            ))}
                                        </div>
                                        <p className="mt-1.5 text-[11px] text-text-muted">
                                            {score === 3 ? 'Contraseña segura ✓' : '8+ caracteres con letras y números.'}
                                        </p>
                                    </div>
                                )
                            })()}
                        </div>
                        </>
                    )}
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
                                        // Paridad con /pricing: pro es el plan destacado ("Más popular").
                                        const isPopular = key === 'pro'
                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => setTier(key)}
                                                className={cn(
                                                    'rounded-card border-[1.5px] p-3.5 text-left transition',
                                                    tier === key
                                                        ? 'border-sport-500 bg-sport-100 shadow-[var(--glow-sport)]'
                                                        : isPopular
                                                            ? 'border-sport-500/50 hover:border-sport-500/70'
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
                                                        {isPopular && (
                                                            <span className="rounded-pill px-1.5 py-0.5 text-[10px] font-bold bg-sport-500 text-[var(--text-on-sport)]">
                                                                Más popular
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span
                                                        className={cn(
                                                            'shrink-0 rounded-pill px-1.5 py-0.5 text-[10px] font-bold',
                                                            caps.canUseNutrition
                                                                ? 'bg-[var(--success-100)] text-[var(--success-600)]'
                                                                : 'bg-[var(--warning-100)] text-[var(--warning-700)]'
                                                        )}
                                                    >
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

                            {/* Paso opcional de add-ons — solo tiers pagos (plan 05 F5.5). Free: oculto. */}
                            {!isFreeTier && SELF_SERVICE_ADDONS_ENABLED && (
                                <section className="space-y-2">
                                    <h2 className="text-sm font-semibold text-foreground">Módulos opcionales</h2>
                                    <p className="text-xs text-muted-foreground">
                                        Suma módulos a tu plan. Se cobran junto a tu suscripción y puedes quitarlos cuando quieras.
                                    </p>
                                    <div className="grid gap-2">
                                        {ADDON_MODULE_KEYS.map((key) => {
                                            const cfg = ADDON_CONFIG[key]
                                            const requiresNutrition = key === 'nutrition_exchanges' && !getTierCapabilities(tier).canUseNutrition
                                            const checked = selectedAddons.includes(key)
                                            return (
                                                <label
                                                    key={key}
                                                    className={cn(
                                                        'flex items-start gap-2 rounded-control border-[1.5px] p-3 text-left transition',
                                                        requiresNutrition
                                                            ? 'border-border-subtle opacity-60'
                                                            : checked
                                                                ? 'border-sport-500 bg-sport-100 cursor-pointer'
                                                                : 'border-border-subtle hover:border-sport-500/40 cursor-pointer'
                                                    )}
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
                                                        className="mt-0.5 h-4 w-4 rounded border-border-default accent-[var(--sport-500)] shrink-0"
                                                    />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="flex items-center justify-between gap-2">
                                                            <span className="font-semibold text-text-strong text-sm">{cfg.label}</span>
                                                            <span className="text-xs font-semibold text-text-strong shrink-0">
                                                                ${cfg.priceClpMensual.toLocaleString('es-CL')} CLP / mes
                                                            </span>
                                                        </span>
                                                        <span className="block text-xs text-text-muted mt-0.5">{cfg.description}</span>
                                                        {requiresNutrition && (
                                                            <span className="mt-1 inline-block text-[11px] font-semibold text-[var(--warning-700)]">
                                                                Requiere un plan con nutrición (Pro o superior).
                                                            </span>
                                                        )}
                                                    </span>
                                                </label>
                                            )
                                        })}
                                    </div>
                                    {selectedAddons.length > 0 && (
                                        <div className="rounded-control border border-border-subtle bg-surface-sunken p-3 text-sm">
                                            <div className="flex justify-between font-semibold text-text-strong">
                                                <span>Total {BILLING_CYCLE_CONFIG[billingCycle].label.toLowerCase()}</span>
                                                <span>${liveTotal.toLocaleString('es-CL')} CLP</span>
                                            </div>
                                            <p className="mt-1 text-xs text-text-muted">Plan ${selectedPrice.toLocaleString('es-CL')} + módulos ${addonsCycleTotal.toLocaleString('es-CL')} CLP</p>
                                        </div>
                                    )}
                                    {/* REGISTER-CODE: código de descuento colapsado (camino primario = link auto-aplicado ?codigo=). */}
                                    <div className="rounded-control border border-border-subtle bg-surface-sunken/60 p-3">
                                        {!couponFieldOpen ? (
                                            <button
                                                type="button"
                                                onClick={() => setCouponFieldOpen(true)}
                                                className="text-sm font-semibold text-sport-600 hover:underline"
                                            >
                                                ¿Tenés un código de descuento?
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

                                    {/* Las 5 reglas de cobro de los módulos, visibles también en el signup */}
                                    {selectedAddons.length > 0 && (
                                        <ol className="space-y-1.5">
                                            {getAddonPaymentRulesForCycle(billingCycle).rules.map((r) => (
                                                <li key={r.number} className="text-[11px] text-muted-foreground">
                                                    <span className="font-semibold text-foreground">{r.title}.</span> {r.text}
                                                </li>
                                            ))}
                                        </ol>
                                    )}
                                </section>
                            )}
                        </>
                    ) : null}

                    {step === 3 ? (
                        <section className="rounded-card border border-border-subtle p-4 space-y-3">
                            <h2 className="font-display font-extrabold tracking-[-0.01em] text-text-strong">
                                {isFreeTier ? 'Tu plan gratuito' : 'Resumen antes de pagar'}
                            </h2>
                            <div className="space-y-1.5 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-text-muted">Plan</span>
                                    <span className="font-semibold text-text-strong">{selectedTier.label}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-text-muted">Alumnos</span>
                                    <span className="font-semibold text-text-strong">Hasta {selectedTier.maxClients}</span>
                                </div>
                                {!isFreeTier && (
                                    <div className="flex justify-between">
                                        <span className="text-text-muted">Facturación</span>
                                        <span className="font-semibold text-text-strong">{BILLING_CYCLE_CONFIG[billingCycle].label}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-text-muted">Nutrición</span>
                                    <span className={cn('font-semibold', getTierCapabilities(tier).canUseNutrition ? 'text-[var(--success-600)]' : 'text-[var(--warning-700)]')}>
                                        {getTierCapabilities(tier).canUseNutrition ? 'Incluida' : 'No incluida'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-text-muted">Tu marca (white-label)</span>
                                    <span className={cn('font-semibold', getTierCapabilities(tier).canUseBranding ? 'text-[var(--success-600)]' : 'text-[var(--warning-700)]')}>
                                        {getTierCapabilities(tier).canUseBranding ? 'Incluida' : 'No incluida'}
                                    </span>
                                </div>
                                {!isFreeTier && selectedAddons.length > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-text-muted">
                                            Módulos ({selectedAddons.map((k) => ADDON_CONFIG[k].label).join(', ')})
                                        </span>
                                        <span className="font-semibold text-text-strong">${addonsCycleTotal.toLocaleString('es-CL')} CLP</span>
                                    </div>
                                )}
                                <div className="flex justify-between border-t border-border-default pt-2 mt-2">
                                    <span className="text-text-muted">{isFreeTier ? 'Costo' : 'Total a pagar'}</span>
                                    <span className="text-lg font-black text-text-strong">
                                        {isFreeTier ? (
                                            <span className="text-[var(--success-600)]">$0 — Gratis</span>
                                        ) : (
                                            `$${liveTotal.toLocaleString('es-CL')} CLP`
                                        )}
                                    </span>
                                </div>
                            </div>
                            {isFreeTier ? (
                                <div className="flex items-start gap-2 pt-1 text-xs text-text-muted">
                                    <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--success-500)]" />
                                    <span>
                                        Sin tarjeta de crédito. Acceso inmediato. Podés hacer upgrade cuando quieras desde tu dashboard.
                                    </span>
                                </div>
                            ) : (
                                <p className="text-xs text-text-muted pt-1">
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
                    {(clientError || state?.error || googleState?.error) && (
                        <div className="animate-fade-in rounded-control border border-transparent bg-[var(--danger-100)] px-4 py-3 text-sm font-semibold text-[var(--danger-600)]">
                            {clientError ?? (fromGoogle ? googleState?.error : state?.error)}
                        </div>
                    )}

                    <div className="rounded-control border border-border-subtle bg-surface-sunken p-3 space-y-3">
                        {/* Checkbox 1: ToS + Privacy (required) */}
                        <label className="flex items-start gap-2 text-xs text-text-muted">
                            <input
                                type="checkbox"
                                name="accept_legal"
                                required
                                className="mt-0.5 h-4 w-4 rounded border-border-default accent-[var(--sport-500)] shrink-0"
                            />
                            <span>
                                Acepto los{' '}
                                <Link href="/legal" className="text-sport-600 hover:opacity-80">
                                    términos de servicio
                                </Link>{' '}
                                y la{' '}
                                <Link href="/privacidad" className="text-sport-600 hover:opacity-80">
                                    política de privacidad
                                </Link>
                                .{' '}
                                <span className="text-[var(--danger-600)] font-medium">*</span>
                            </span>
                        </label>
                        {/* Checkbox 2: Health data consent (required — Ley 21.719 Art. 16) */}
                        <label className="flex items-start gap-2 text-xs text-text-muted">
                            <input
                                type="checkbox"
                                name="accept_health_data"
                                required
                                className="mt-0.5 h-4 w-4 rounded border-border-default accent-[var(--sport-500)] shrink-0"
                            />
                            <span>
                                Acepto el tratamiento de datos de salud de mis alumnos (registros de entrenamiento,
                                nutrición y métricas corporales) para prestar el servicio de coaching digital,
                                conforme a la Ley 21.719.{' '}
                                <span className="text-[var(--danger-600)] font-medium">*</span>
                            </span>
                        </label>
                        {/* Checkbox 3: Marketing (optional — must be unchecked by default) */}
                        <label className="flex items-start gap-2 text-xs text-text-muted">
                            <input
                                type="checkbox"
                                name="accept_marketing"
                                className="mt-0.5 h-4 w-4 rounded border-border-default accent-[var(--sport-500)] shrink-0"
                            />
                            <span>
                                Quiero recibir novedades, ofertas y consejos de EVA por email.{' '}
                                <span className="text-text-muted/60">(opcional)</span>
                            </span>
                        </label>
                    </div>

                    <div className="pt-2 flex gap-2">
                        {step > 1 ? (
                            <button
                                type="button"
                                onClick={prevStep}
                                className="h-12 px-4 rounded-control border-[1.5px] border-border-default bg-surface-card text-sm font-semibold text-text-strong hover:bg-surface-sunken transition-colors"
                            >
                                Atrás
                            </button>
                        ) : null}
                        {step < 3 ? (
                            <button
                                type="button"
                                onClick={nextStep}
                                className="flex-1 h-12 text-base font-bold tracking-[-0.01em] rounded-control transition-all duration-200 active:scale-[0.98] bg-[var(--cta-fill)] text-[var(--text-on-sport)] shadow-[var(--glow-sport)] hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)]"
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

                {/* Google OAuth — hide when already in Google flow */}
                {!fromGoogle && (
                    <>
                        <div className="mt-6 flex items-center gap-3">
                            <div className="flex-1 h-px bg-border-subtle" />
                            <span className="text-xs text-muted-foreground">o registrate con</span>
                            <div className="flex-1 h-px bg-border-subtle" />
                        </div>
                        <button
                            type="button"
                            onClick={startCoachGoogleRegistration}
                            className="mt-4 w-full h-12 flex items-center justify-center gap-2.5 rounded-control border-[1.5px] border-border-default bg-surface-card hover:bg-surface-sunken transition-colors text-sm font-semibold text-text-strong"
                        >
                            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                            Registrarse con Google
                        </button>
                    </>
                )}

                {/* Divider */}
                <div className="mt-6 flex items-center gap-3">
                    <div className="flex-1 h-px bg-border-subtle" />
                    <span className="text-xs text-muted-foreground">¿Ya tienes cuenta?</span>
                    <div className="flex-1 h-px bg-border-subtle" />
                </div>

                <div className="mt-4 text-center">
                    <Link
                        href="/login"
                        className="text-sm text-sport-600 hover:opacity-80 transition-opacity font-semibold"
                    >
                        Iniciar sesión →
                    </Link>
                </div>
            </div>

            <p className="mt-6 text-center text-xs text-text-muted flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {isFreeTier ? 'Registro seguro · Acceso inmediato · Sin tarjeta.' : 'Registro seguro + activación automática de suscripción.'}
            </p>
        </div>
        </>
    )
}
