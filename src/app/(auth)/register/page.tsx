'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { Loader2, User, Mail, Lock, Store, CheckCircle2 } from 'lucide-react'
import { registerAction, type RegisterState } from './actions'
import { cn } from '@/lib/utils'
import {
    BILLING_CYCLE_CONFIG,
    getTierPriceClp,
    TIER_CONFIG,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'

const initialState: RegisterState = {}
const tierOptions = Object.entries(TIER_CONFIG) as [SubscriptionTier, (typeof TIER_CONFIG)[SubscriptionTier]][]
const cycleOptions = Object.entries(BILLING_CYCLE_CONFIG) as [BillingCycle, (typeof BILLING_CYCLE_CONFIG)[BillingCycle]][]

function SubmitButton() {
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
            ) : (
                'Crear Cuenta'
            )}
        </button>
    )
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

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const queryTier = params.get('tier')
        const queryCycle = params.get('cycle')
        if (queryTier && queryTier in TIER_CONFIG) {
            setTier(queryTier as SubscriptionTier)
        }
        if (queryCycle && queryCycle in BILLING_CYCLE_CONFIG) {
            setBillingCycle(queryCycle as BillingCycle)
        }
    }, [])

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
        <div className="animate-slide-up">
            {/* Header */}
            <div className="text-center mb-8 flex flex-col items-center">
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground font-display">
                    Crea tu cuenta
                </h1>
                <p className="mt-2 text-muted-foreground text-sm">
                    Paso {step} de 3 — Regístrate, elige plan y activa tu suscripción
                </p>
            </div>

            {/* Card */}
            <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                <form action={formAction} className="space-y-4">
                    <input type="hidden" name="subscription_tier" value={tier} />
                    <input type="hidden" name="billing_cycle" value={billingCycle} />
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
                                    {tierOptions.map(([key, option]) => (
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
                                            <p className="font-semibold text-foreground">{option.label}</p>
                                            <p className="text-xs text-muted-foreground">Hasta {option.maxClients} alumnos</p>
                                            <p className="text-sm text-foreground mt-1">
                                                ${option.monthlyPriceClp.toLocaleString('es-CL')} CLP / mes
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </section>

                            <section className="space-y-2">
                                <h2 className="text-sm font-semibold text-foreground">Frecuencia de pago</h2>
                                <div className="grid grid-cols-3 gap-2">
                                    {cycleOptions.map(([key, option]) => (
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
                        </>
                    ) : null}

                    {step === 3 ? (
                        <section className="rounded-xl border border-border p-4 space-y-3">
                            <h2 className="font-semibold text-foreground">Resumen antes de pagar</h2>
                            <p className="text-sm text-muted-foreground">
                                Plan: <span className="text-foreground font-semibold">{selectedTier.label}</span>
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Precio: <span className="text-foreground font-semibold">${selectedPrice.toLocaleString('es-CL')} CLP</span>
                            </p>
                            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                                {selectedTier.features.slice(0, 4).map((feature) => (
                                    <li key={feature}>{feature}</li>
                                ))}
                            </ul>
                            <p className="text-xs text-muted-foreground">
                                Al crear tu cuenta, te llevaremos al checkout para completar la suscripción.
                            </p>
                        </section>
                    ) : null}

                    {/* Error */}
                    {(clientError || state?.error) && (
                        <div className="animate-fade-in rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                            {clientError ?? state.error}
                        </div>
                    )}

                    <div className="rounded-xl border border-border bg-secondary/40 p-3">
                        <label className="flex items-start gap-2 text-xs text-muted-foreground">
                            <input
                                type="checkbox"
                                name="accept_legal"
                                required
                                className="mt-0.5 h-4 w-4 rounded border-border"
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
                                .
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
                                <SubmitButton />
                            </div>
                        )}
                    </div>
                </form>

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
                Registro seguro + activación automática de suscripción.
            </p>
        </div>
    )
}

