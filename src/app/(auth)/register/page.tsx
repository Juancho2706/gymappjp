'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { Loader2, User, Mail, Lock, Store } from 'lucide-react'
import { registerAction, type RegisterState } from './actions'
import { cn } from '@/lib/utils'

const initialState: RegisterState = {}

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
                'Crear Cuenta Gratis'
            )}
        </button>
    )
}

export default function RegisterPage() {
    const [state, formAction] = useActionState(registerAction, initialState)

    return (
        <div className="animate-slide-up">
            {/* Header */}
            <div className="text-center mb-8">
                <h1
                    className="text-3xl font-extrabold tracking-tight text-foreground"
                    style={{ fontFamily: 'var(--font-outfit)' }}
                >
                    Crea tu cuenta
                </h1>
                <p className="mt-2 text-muted-foreground text-sm">
                    30 días gratis para probar todas las funciones
                </p>
            </div>

            {/* Card */}
            <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                <form action={formAction} className="space-y-4">
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

                    <div className="pt-2">
                        <SubmitButton />
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

            <p className="mt-6 text-center text-xs text-muted-foreground">
                Al crear tu cuenta, aceptas nuestros términos de servicio.
            </p>
        </div>
    )
}
