'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import Script from 'next/script'
import { Loader2, User, Mail, Lock, Store, CheckCircle2, ChevronLeft, ArrowRight, Check, CreditCard } from 'lucide-react'
import { registerAction, type RegisterState } from './_actions/register.actions'
import { PlanStep } from './_components/PlanStep'
import { SummaryStep } from './_components/SummaryStep'
import { completeOAuthOnboarding, type CompleteOnboardingState } from '@/app/coach/onboarding/complete/_actions/complete.actions'
import { cn } from '@/lib/utils'
import { getCurrentOAuthUserProfile } from '@/lib/auth/client-oauth'
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton'
import { useCaptureRegisterFailed, useCaptureRegisterSubmitted } from '@/lib/posthog/events'
import {
    BILLING_CYCLE_CONFIG,
    getDefaultBillingCycleForTier,
    getTierPriceClp,
    isBillingCycleAllowedForTier,
    isSaleTier,
    type BillingCycle,
    type SaleTier,
} from '@/lib/constants'

const initialState: RegisterState = {}
const googleInitialState: CompleteOnboardingState = {}

function SubmitButton({
    isFreeTier,
    tier,
    billingCycle,
    method,
}: {
    isFreeTier: boolean
    tier: SaleTier
    billingCycle: BillingCycle
    method: 'email' | 'google'
}) {
    const { pending } = useFormStatus()
    const captureRegisterSubmitted = useCaptureRegisterSubmitted()
    // `pending` de useFormStatus pasa a false→true recién cuando el navegador validó el form
    // (required, checkboxes legales) y el Server Action arrancó: es el único punto client-side donde
    // «el alta se envió» es cierto. A propósito NO se engancha un `onSubmit` al <form action={...}>:
    // el action de React 19 corre por su propio camino y un handler extra ahí es la clase de cosa
    // que rompe un submit sin avisar. Al volver un error el pending baja y un reintento vuelve a
    // contar, que es lo correcto (es otro intento de alta).
    const wasPending = useRef(false)
    useEffect(() => {
        if (pending && !wasPending.current) {
            captureRegisterSubmitted({ tier, billingCycle, method })
        }
        wasPending.current = pending
    }, [pending, tier, billingCycle, method, captureRegisterSubmitted])
    return (
        <button
            type="submit"
            disabled={pending}
            className={cn(
                'w-full h-14 flex items-center justify-center gap-2 text-[17px] font-bold tracking-[-0.01em] rounded-control transition-all duration-200 active:scale-[0.98]',
                'bg-[var(--cta-fill)] text-[var(--text-on-sport)] shadow-[var(--glow-sport)] hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)]',
                'disabled:opacity-60 disabled:cursor-not-allowed'
            )}
        >
            {pending ? (
                <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creando tu cuenta...
                </>
            ) : isFreeTier ? (
                <>
                    Empezar gratis
                    <ArrowRight className="w-4 h-4" />
                </>
            ) : (
                <>
                    Continuar al pago
                    <CreditCard className="w-4 h-4" />
                </>
            )}
        </button>
    )
}

function CheckTile({ className }: { className?: string }) {
    return (
        <span
            className={cn(
                'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] border-2 border-strong bg-transparent text-[var(--text-on-sport)] transition-colors',
                'peer-checked:border-transparent peer-checked:bg-sport-500',
                'peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--focus-ring)]',
                '[&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100',
                className
            )}
        >
            <Check className="h-3.5 w-3.5" />
        </span>
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
    // Pricing v2: pro es el plan DESTACADO en la vitrina, pero el default del wizard es FREE.
    // Llegar sin `?tier` significa que el visitante entró por un CTA de alta genérico —y todos los
    // CTA genéricos dicen «gratis»—, así que abrir en un plan de pago rompe la promesa y manda a un
    // checkout que nadie pidió. Los CTA de pago mandan su tier explícito.
    const [tier, setTier] = useState<SaleTier>('free')
    // `?tier=free` EXPLÍCITO en la URL — distinto del default. El sello «Hecho con EVA» de la app
    // del alumno abre `/hecho-con-eva` y su único CTA es `/register?tier=free`: con la grilla de
    // planes en el paso 2, el sello quedaba a dos toques de una vitrina de precios, que es
    // exactamente lo que la guideline 3.1.1 de App Review no perdona en la app iOS. Con la bandera
    // en true el alta no muestra ni la grilla ni una cifra; el `subscription_tier=free` que viaja
    // al server action es el mismo de siempre. Sin `?tier=free` (o con otro tier) no cambia nada.
    const [freeOnly, setFreeOnly] = useState(false)
    const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly')
    // Código de descuento (REGISTER-CODE): manual (campo colapsado) o auto-aplicado desde ?codigo=.
    // Solo se threadea a /processing (el canje + disclosure SERNAC + consentimiento ocurren allá).
    const [couponCode, setCouponCode] = useState('')
    const [couponFieldOpen, setCouponFieldOpen] = useState(false)
    const [couponAutoApplied, setCouponAutoApplied] = useState(false)
    const selectedPrice = useMemo(() => getTierPriceClp(tier, billingCycle), [tier, billingCycle])
    // Total en vivo = solo el plan: los módulos vienen INCLUIDOS en los planes pagos
    // (decisión CEO 2026-07-17) y ya no se compran como add-ons en el signup.
    const liveTotal = selectedPrice
    const isFreeTier = tier === 'free'
    const captureRegisterFailed = useCaptureRegisterFailed()

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
        const queryCycle = params.get('cycle')
        // Solo aceptamos tiers a la venta (free/pro/elite). Un link viejo con
        // ?tier=starter/starter_lite/growth/scale (fuera de venta) degrada a 'free': ante un tier
        // que ya no existe, el default seguro es el que no cobra.
        const nextTier: SaleTier =
            rawTier && isSaleTier(rawTier)
                ? rawTier
                : 'free'
        setTier(nextTier)
        // Sin precios SOLO cuando el link pidió el gratuito de forma explícita: el default (llegar
        // sin `?tier`) sigue mostrando la grilla, que es la vitrina del alta web.
        setFreeOnly(rawTier === 'free')
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

    // register_failed: el rechazo del server es el único desenlace del alta que NO navega (el éxito
    // redirige y se mide en el aterrizaje), así que sin este disparo el intento fallido no deja
    // rastro en ninguna parte — el caso del 20-08 01:43 UTC, 3 rechazos seguidos de un clic pagado
    // sin una sola señal de por qué.
    //
    // El guardia es la IDENTIDAD del objeto de estado, no el texto del error: `useActionState`
    // devuelve un objeto NUEVO por cada resultado del action, así que dos rechazos idénticos
    // seguidos cuentan dos veces (correcto: son dos intentos). El ref arranca en `initialState`
    // para saltarse el render inicial, y absorbe los re-runs por cambio de tier/ciclo — cambiar de
    // plan con un error en pantalla no puede re-emitir el evento.
    const reportedEmailStateRef = useRef<RegisterState>(initialState)
    useEffect(() => {
        if (reportedEmailStateRef.current === state) return
        reportedEmailStateRef.current = state
        if (!state?.error) return
        captureRegisterFailed({ tier, billingCycle, method: 'email', code: state.code ?? 'unknown' })
    }, [state, tier, billingCycle, captureRegisterFailed])

    const reportedGoogleStateRef = useRef<CompleteOnboardingState>(googleInitialState)
    useEffect(() => {
        if (reportedGoogleStateRef.current === googleState) return
        reportedGoogleStateRef.current = googleState
        if (!googleState?.error) return
        captureRegisterFailed({ tier, billingCycle, method: 'google', code: googleState.code ?? 'unknown' })
    }, [googleState, tier, billingCycle, captureRegisterFailed])

    function nextStep() {
        if (step === 1) {
            if (fromGoogle) {
                if (!fullName || !brandName) {
                    setClientError('Completa tu nombre y nombre de marca antes de continuar.')
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
        scrollPaneToTop()
    }

    function prevStep() {
        setStep((prev) => (prev === 3 ? 2 : 1))
        scrollPaneToTop()
    }

    // El panel del auth-layout es el scroll container (overflow-y-auto): al cambiar de paso
    // conserva el scroll anterior y el título queda tapado por el header sticky. Reset a 0.
    function scrollPaneToTop() {
        requestAnimationFrame(() => {
            let node: HTMLElement | null = document.querySelector('form[action]')
            while (node) {
                if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) break
                node = node.parentElement
            }
            if (node) node.scrollTo({ top: 0 })
            window.scrollTo({ top: 0 })
        })
    }

    return (
        <>
        {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
        )}
        <div className="w-full max-w-md mx-auto animate-slide-up">
            {/* Header sticky del wizard — back-chevron + "Paso X de N" + barras de progreso */}
            {/* SIN -mt-14: el margen negativo + sticky en el panel con pt-14 re-anclaba el header
                56px abajo de su posición de flow → tapaba el título en TODOS los pasos.
                `-top-14` ANULA el `pt-14` del scroller de `(auth)/layout.tsx`: el sticky se ancla al
                borde del CONTENT box, así que con `top-0` la barra se clavaba 56 px abajo y el hero
                seguía scrolleando visible —y cortándose— en esa franja. Medido en producción: el
                punto de anclaje es exactamente `padding-top del scroller + top`, así que -56 px lo
                lleva a 0. No sacar el `pt-14` del layout: lo comparten login/forgot/reset, y el
                chevron de login está posicionado dentro de esa franja. (QA del dueño 2026-08-18.) */}
            <div className="sticky -top-14 z-10 bg-surface-app pt-3.5 pb-3">
                <div className="flex items-center gap-2.5">
                    {step > 1 ? (
                        <button
                            type="button"
                            onClick={prevStep}
                            aria-label="Atrás"
                            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-surface-sunken text-text-strong transition-colors hover:bg-[color-mix(in_oklab,var(--surface-sunken)_88%,#000)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                        >
                            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                        </button>
                    ) : (
                        <Link
                            href="/"
                            aria-label="Volver al inicio"
                            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-surface-sunken text-text-strong transition-colors hover:bg-[color-mix(in_oklab,var(--surface-sunken)_88%,#000)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                        >
                            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                        </Link>
                    )}
                    <div className="flex-1">
                        <div className="mb-1.5 flex items-baseline justify-between">
                            <span className="text-[12.5px] font-bold text-text-strong">Paso {step} de 3</span>
                            <span className="text-xs text-text-subtle">{['Tu cuenta', 'Tu plan', 'Confirmar'][step - 1]}</span>
                        </div>
                        <div className="flex gap-1">
                            {[1, 2, 3].map((s) => (
                                <div
                                    key={s}
                                    className={cn(
                                        'h-1 flex-1 rounded-pill transition-colors duration-300',
                                        step >= s ? 'bg-sport-500' : 'bg-surface-sunken'
                                    )}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Contenido full-bleed del wizard */}
            <div className="pt-2">
                <form action={fromGoogle ? googleFormAction : formAction} className="space-y-4">
                    <input type="hidden" name="subscription_tier" value={tier} />
                    <input type="hidden" name="billing_cycle" value={billingCycle} />
                    {/* Sin add-ons en el signup: los módulos vienen incluidos en el plan (CEO 2026-07-17). */}
                    <input type="hidden" name="addons" value="" />
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

                    {(clientError || state?.error || googleState?.error) && (
                        <div className="animate-fade-in rounded-control border border-transparent bg-[var(--danger-100)] px-4 py-3 text-sm font-semibold text-[var(--danger-600)]">
                            {clientError ?? (fromGoogle ? googleState?.error : state?.error)}
                        </div>
                    )}

                    {step === 1 ? (
                        <>
                    <div>
                        <h1 className="font-display text-[26px] font-black leading-[1.1] tracking-[-0.02em] text-text-strong">
                            Crea tu cuenta de coach
                        </h1>
                        <p className="mt-1.5 text-sm text-text-muted">Tu marca, tus alumnos, tu negocio — en una sola app.</p>
                        {/* Freno anti registro-coach-por-accidente: los alumnos entran por /c/<coach>,
                            nunca por aquí (caso real 2026-08-05: alumna eliminada creó cuenta coach free). */}
                        <div className="mt-3 rounded-control border border-border-subtle bg-surface-sunken px-3 py-2.5 text-xs leading-relaxed text-text-muted">
                            Estás creando una cuenta de <strong className="text-text-strong">entrenador</strong>.
                            ¿Eres alumno? No te registres aquí —{' '}
                            <Link href="/login" className="font-bold text-sport-600 hover:opacity-80 transition-opacity">
                                entra por el link o código de tu coach
                            </Link>.
                        </div>
                    </div>
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
                        <PlanStep
                            tier={tier}
                            setTier={setTier}
                            billingCycle={billingCycle}
                            setBillingCycle={setBillingCycle}
                            couponCode={couponCode}
                            setCouponCode={setCouponCode}
                            couponFieldOpen={couponFieldOpen}
                            setCouponFieldOpen={setCouponFieldOpen}
                            couponAutoApplied={couponAutoApplied}
                            freeOnly={freeOnly}
                        />
                    ) : null}

                    {step === 3 ? (
                        <SummaryStep
                            tier={tier}
                            billingCycle={billingCycle}
                            totalClp={liveTotal}
                            freeOnly={freeOnly}
                        />
                    ) : null}

                    {/* Cloudflare Turnstile — montado desde el paso 1 (el token viaja en el submit),
                       visible solo en Confirmar */}
                    {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
                        <div className={step === 3 ? undefined : 'hidden'}>
                            <div
                                className="cf-turnstile"
                                data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
                                data-appearance="interaction-only"
                            />
                        </div>
                    )}

                    {step === 3 ? (
                        <div className="flex flex-col gap-0.5">
                            {/* Checkbox 1: ToS + Privacy (required) */}
                            <label className="flex cursor-pointer items-start gap-2.5 py-1.5 text-[13px] leading-[1.45] text-text-muted">
                                <input type="checkbox" name="accept_legal" required className="peer sr-only" />
                                <CheckTile className="mt-px" />
                                <span>
                                    Acepto los{' '}
                                    <Link href="/legal" className="font-bold text-sport-600 hover:opacity-80">
                                        términos de servicio
                                    </Link>{' '}
                                    y la{' '}
                                    <Link href="/privacidad" className="font-bold text-sport-600 hover:opacity-80">
                                        política de privacidad
                                    </Link>
                                    .{' '}
                                    <span className="text-[var(--danger-600)] font-medium">*</span>
                                </span>
                            </label>
                            {/* Checkbox 2: Health data consent (required — Ley 21.719 Art. 16) */}
                            <label className="flex cursor-pointer items-start gap-2.5 py-1.5 text-[13px] leading-[1.45] text-text-muted">
                                <input type="checkbox" name="accept_health_data" required className="peer sr-only" />
                                <CheckTile className="mt-px" />
                                <span>
                                    Acepto el tratamiento de datos de salud de mis alumnos (registros de entrenamiento,
                                    nutrición y métricas corporales) para prestar el servicio de coaching digital,
                                    conforme a la Ley 21.719.{' '}
                                    <span className="text-[var(--danger-600)] font-medium">*</span>
                                </span>
                            </label>
                            {/* Checkbox 3: Marketing (optional — must be unchecked by default) */}
                            <label className="flex cursor-pointer items-start gap-2.5 py-1.5 text-[13px] leading-[1.45] text-text-muted">
                                <input type="checkbox" name="accept_marketing" className="peer sr-only" />
                                <CheckTile className="mt-px" />
                                <span>
                                    Quiero recibir novedades, ofertas y consejos de EVA por email.{' '}
                                    <span className="text-text-subtle">(opcional)</span>
                                </span>
                            </label>
                        </div>
                    ) : null}

                    <div className="pt-2">
                        {step < 3 ? (
                            <button
                                type="button"
                                onClick={nextStep}
                                className="w-full h-14 flex items-center justify-center gap-2 text-[17px] font-bold tracking-[-0.01em] rounded-control transition-all duration-200 active:scale-[0.98] bg-[var(--cta-fill)] text-[var(--text-on-sport)] shadow-[var(--glow-sport)] hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)]"
                            >
                                Continuar
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        ) : (
                            <SubmitButton
                                isFreeTier={isFreeTier}
                                tier={tier}
                                billingCycle={billingCycle}
                                method={fromGoogle ? 'google' : 'email'}
                            />
                        )}
                    </div>
                </form>

                {/* Google OAuth — solo en el paso 1; hide when already in Google flow */}
                {step === 1 && !fromGoogle && (
                    <>
                        <div className="my-[18px] flex items-center gap-3">
                            <div className="flex-1 h-px bg-border-subtle" />
                            <span className="text-xs font-semibold text-text-subtle">o</span>
                            <div className="flex-1 h-px bg-border-subtle" />
                        </div>
                        <div className="mt-4">
                            <GoogleSignInButton intent="register" />
                        </div>
                    </>
                )}

                {step === 1 && (
                    <div className="pt-5 pb-2 text-center text-[13px] text-text-muted">
                        ¿Ya tienes cuenta?{' '}
                        <Link
                            href="/login"
                            className="font-bold text-sport-600 hover:opacity-80 transition-opacity"
                        >
                            Inicia sesión
                        </Link>
                    </div>
                )}
            </div>

            <p className="mt-6 text-center text-xs text-text-muted flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {isFreeTier ? 'Registro seguro · Acceso inmediato · Sin tarjeta.' : 'Registro seguro + activación automática de suscripción.'}
            </p>
        </div>
        </>
    )
}
