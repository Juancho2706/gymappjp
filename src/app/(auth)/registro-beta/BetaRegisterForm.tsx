'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { Loader2, User, Mail, Lock, Store, Sparkles } from 'lucide-react'
import { betaRegisterAction, type BetaRegisterState } from './actions'
import { cn } from '@/lib/utils'

const initialState: BetaRegisterState = {}

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
                'Activar acceso beta'
            )}
        </button>
    )
}

export function BetaRegisterForm({ token }: { token: string }) {
    const [state, formAction] = useActionState(betaRegisterAction, initialState)

    return (
        <div className="w-full max-w-md mx-auto animate-slide-up">
            {/* Header */}
            <div className="text-center mb-8 flex flex-col items-center">
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground font-display">
                    Acceso Beta
                </h1>
                <p className="mt-2 text-muted-foreground text-sm">
                    Fuiste invitado a probar la plataforma
                </p>
            </div>

            {/* Beta badge */}
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/8 px-4 py-3">
                <Sparkles className="w-5 h-5 text-primary shrink-0" />
                <div>
                    <p className="text-sm font-semibold text-foreground">20 días de plan Pro gratis</p>
                    <p className="text-xs text-muted-foreground">Sin tarjeta de crédito. Hasta 30 alumnos. Nutrición incluida.</p>
                </div>
            </div>

            {/* Card */}
            <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                <form action={formAction} className="space-y-4">
                    <input type="hidden" name="invite_token" value={token} />

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
                                className="w-full pl-10 h-12 bg-secondary border border-border text-foreground rounded-xl placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground pl-1">
                            Se generará tu URL: eva-app.cl/<strong>tu-marca</strong>
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
                                className="w-full pl-10 h-12 bg-secondary border border-border text-foreground rounded-xl placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                            />
                        </div>
                    </div>

                    {/* Error */}
                    {state?.error && (
                        <div className="animate-fade-in rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                            {state.error}
                        </div>
                    )}

                    {/* Legal */}
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

                    <div className="pt-2">
                        <SubmitButton />
                    </div>
                </form>

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
        </div>
    )
}
