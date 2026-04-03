'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { Loader2, Lock, Mail } from 'lucide-react'
import { loginAction, type LoginState } from './actions'
import { cn } from '@/lib/utils'

const initialState: LoginState = {}

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
                    Iniciando sesión...
                </span>
            ) : (
                'Ingresar al Panel'
            )}
        </button>
    )
}

export default function CoachLoginPage() {
    const [state, formAction] = useActionState(loginAction, initialState)

    return (
        <div className="animate-slide-up">
            {/* Header */}
            <div className="text-center mb-8 flex flex-col items-center">
                <h1
                    className="text-3xl font-extrabold tracking-tight text-foreground font-display"
                >
                    Bienvenido de vuelta
                </h1>
                <p className="mt-2 text-muted-foreground text-sm">
                    Ingresa tus credenciales para acceder al panel
                </p>
            </div>

            {/* Card */}
            <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                <form action={formAction} className="space-y-5">
                    {/* Email */}
                    <div className="space-y-2">
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
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label htmlFor="password" className="text-foreground text-sm font-medium">
                                Contraseña
                            </label>
                            <Link
                                href="/forgot-password"
                                className="text-xs text-primary hover:opacity-80 transition-opacity"
                            >
                                ¿Olvidaste tu contraseña?
                            </Link>
                        </div>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            <input
                                id="password"
                                name="password"
                                type="password"
                                placeholder="••••••••"
                                autoComplete="current-password"
                                required
                                className="w-full pl-10 h-12 bg-secondary border border-border text-foreground rounded-xl placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                            />
                        </div>
                    </div>

                    {/* Error message */}
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
                    <span className="text-xs text-muted-foreground">¿Nuevo en COACH OP?</span>
                    <div className="flex-1 h-px bg-border" />
                </div>

                <div className="mt-4 text-center">
                    <Link
                        href="/register"
                        className="text-sm text-primary hover:opacity-80 transition-opacity font-medium"
                    >
                        Crear cuenta →
                    </Link>
                </div>
            </div>

            {/* Footer */}
            <p className="mt-6 text-center text-xs text-muted-foreground">
                &copy; {new Date().getFullYear()} COACH OP. Todos los derechos reservados.
            </p>
        </div>
    )
}
