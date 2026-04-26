'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { Loader2, Lock, Mail, BarChart2, Users, Dumbbell, Sparkles, ArrowRight } from 'lucide-react'
import { loginAction, type LoginState } from './actions'
import { LandingBrandMark } from '@/components/landing/LandingBrandMark'
import { ThemeToggle } from '@/components/ThemeToggle'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

const initialState: LoginState = {}

const FEATURES = [
    { icon: Users, label: 'Gestión de alumnos', desc: 'Directorio completo con métricas de adherencia' },
    { icon: Dumbbell, label: 'Planes de entrenamiento', desc: 'Builder drag & drop con variantes A/B' },
    { icon: BarChart2, label: 'Analítica del negocio', desc: 'MRR, sesiones, crecimiento de alumnos' },
]

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
                'disabled:opacity-60 disabled:cursor-not-allowed',
                'flex items-center justify-center gap-2'
            )}
        >
            {pending ? (
                <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Iniciando sesión...
                </>
            ) : (
                <>
                    Ingresar al Panel
                    <ArrowRight className="w-4 h-4" />
                </>
            )}
        </button>
    )
}

export default function CoachLoginPage() {
    const [state, formAction] = useActionState(loginAction, initialState)

    return (
        <div className="w-full flex flex-col lg:flex-row">
            {/* Left branding panel — full viewport height */}
            <div className="hidden lg:flex lg:flex-col lg:w-[52%] xl:w-[55%] relative overflow-hidden bg-background border-r border-border/60 px-12 xl:px-16 py-12 min-h-screen">
                {/* Background gradient + grid */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-sky-500/5 pointer-events-none" />
                <div
                    className="absolute inset-0 opacity-[0.035] pointer-events-none"
                    style={{ backgroundImage: 'linear-gradient(rgba(0,0,0,.15) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.15) 1px,transparent 1px)', backgroundSize: '40px 40px' }}
                    aria-hidden
                />

                {/* Logo */}
                <div className="relative z-10 flex items-center justify-between">
                    <LandingBrandMark iconClassName="h-9 w-9" />
                    <ThemeToggle />
                </div>

                {/* Headline — vertically centered in remaining space */}
                <div className="relative z-10 flex-1 flex flex-col justify-center py-16">
                    <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 backdrop-blur-sm px-3 py-1.5 mb-8 w-fit">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-medium text-muted-foreground">Plataforma para coaches</span>
                    </div>
                    <h1 className="font-display text-4xl xl:text-5xl font-black leading-[1.1] tracking-tighter text-foreground mb-5">
                        Tu negocio de fitness,{' '}
                        <span className="bg-gradient-to-r from-primary to-sky-500 bg-clip-text text-transparent">
                            profesionalizado
                        </span>
                    </h1>
                    <p className="text-muted-foreground text-base leading-relaxed max-w-sm mb-12">
                        Gestiona alumnos, crea rutinas y planes de nutrición desde un solo panel.
                    </p>

                    {/* Feature list */}
                    <div className="space-y-6">
                        {FEATURES.map(({ icon: Icon, label, desc }, i) => (
                            <motion.div
                                key={label}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.1 * i + 0.3, duration: 0.5 }}
                                className="flex items-start gap-4"
                            >
                                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                                    <Icon className="h-4.5 w-4.5 text-primary" aria-hidden />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-foreground">{label}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Bottom */}
                <div className="relative z-10">
                    <p className="text-xs text-muted-foreground">
                        &copy; {new Date().getFullYear()} EVA. Todos los derechos reservados.
                    </p>
                </div>
            </div>

            {/* Right form panel */}
            <div className="flex-1 flex flex-col justify-center min-h-screen px-6 py-12 sm:px-10 lg:px-16 xl:px-20">
                {/* Mobile header */}
                <div className="flex items-center justify-between mb-10 lg:hidden">
                    <LandingBrandMark iconClassName="h-8 w-8" />
                    <ThemeToggle />
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="w-full max-w-sm mx-auto"
                >
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold tracking-tight text-foreground">
                            Bienvenido de vuelta
                        </h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Ingresa tus credenciales para acceder al panel
                        </p>
                    </div>

                    <form action={formAction} className="space-y-5">
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

                        {state?.error && (
                            <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                                {state.error}
                            </div>
                        )}

                        <div className="pt-1">
                            <SubmitButton />
                        </div>
                    </form>

                    <div className="mt-6 flex items-center gap-3">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs text-muted-foreground">¿Nuevo en EVA?</span>
                        <div className="flex-1 h-px bg-border" />
                    </div>

                    <div className="mt-4 text-center">
                        <Link
                            href="/register"
                            className="inline-flex items-center gap-1.5 text-sm text-primary hover:opacity-80 transition-opacity font-medium"
                        >
                            Crear cuenta
                            <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>
                </motion.div>
            </div>
        </div>
    )
}
