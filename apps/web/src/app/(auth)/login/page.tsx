import { Suspense } from 'react'
import { BarChart2, Users, Dumbbell, Sparkles } from 'lucide-react'
import { LandingBrandMark } from '@/components/landing/LandingBrandMark'
import { ThemeToggle } from '@/components/ThemeToggle'
import { readFailCount, CAPTCHA_THRESHOLD } from '@/lib/auth/fail-counter'
import { getTurnstileSiteKey } from '@/lib/auth/turnstile'
import { getAuthErrorMessage } from '@/lib/auth/error-messages'
import { CoachLoginForm } from './_components/CoachLoginForm'

const FEATURES = [
    { icon: Users, label: 'Gestión de alumnos', desc: 'Directorio completo con métricas de adherencia' },
    { icon: Dumbbell, label: 'Planes de entrenamiento', desc: 'Builder drag & drop con variantes A/B' },
    { icon: BarChart2, label: 'Analítica del negocio', desc: 'MRR, sesiones, crecimiento de alumnos' },
]

interface CoachLoginPageProps {
    searchParams: Promise<{ error?: string }>
}

export default async function CoachLoginPage({ searchParams }: CoachLoginPageProps) {
    const params = await searchParams
    const failCount = await readFailCount('coach')
    const showCaptcha = failCount >= CAPTCHA_THRESHOLD
    const turnstileSiteKey = getTurnstileSiteKey()
    const urlError = getAuthErrorMessage(params.error, 'coach')

    return (
        <div className="w-full flex flex-col lg:flex-row">
            {/* Left branding panel */}
            <div className="hidden lg:flex lg:flex-col lg:w-[52%] xl:w-[55%] relative overflow-hidden bg-background border-r border-border/60 px-12 xl:px-16 py-12 min-h-dvh">
                <div
                    className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-sky-500/5 pointer-events-none"
                    aria-hidden="true"
                />
                <div
                    className="absolute inset-0 opacity-[0.035] pointer-events-none"
                    style={{
                        backgroundImage:
                            'linear-gradient(rgba(0,0,0,.15) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.15) 1px,transparent 1px)',
                        backgroundSize: '40px 40px',
                    }}
                    aria-hidden="true"
                />

                <div className="relative z-10 flex items-center justify-between">
                    <LandingBrandMark iconClassName="h-9 w-9" />
                    <ThemeToggle />
                </div>

                <div className="relative z-10 flex-1 flex flex-col justify-center py-16">
                    <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 backdrop-blur-sm px-3 py-1.5 mb-8 w-fit">
                        <Sparkles className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
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

                    <ul className="space-y-6" aria-label="Características principales">
                        {FEATURES.map(({ icon: Icon, label, desc }) => (
                            <li key={label} className="flex items-start gap-4">
                                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                                    <Icon className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-foreground">{label}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="relative z-10">
                    <p className="text-xs text-muted-foreground">
                        &copy; {new Date().getFullYear()} EVA. Todos los derechos reservados.
                    </p>
                </div>
            </div>

            {/* Right form panel */}
            <div className="flex-1 flex flex-col justify-center min-h-dvh px-6 py-12 sm:px-10 lg:px-16 xl:px-20">
                {/* Mobile header */}
                <div className="flex items-center justify-between mb-10 lg:hidden">
                    <LandingBrandMark iconClassName="h-8 w-8" />
                    <ThemeToggle />
                </div>

                <div className="w-full max-w-sm mx-auto">
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold tracking-tight text-foreground">
                            Bienvenido de vuelta
                        </h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Ingresa tus credenciales para acceder al panel
                        </p>
                    </div>

                    <Suspense>
                        <CoachLoginForm
                            urlError={urlError}
                            showCaptcha={showCaptcha}
                            turnstileSiteKey={turnstileSiteKey}
                        />
                    </Suspense>
                </div>
            </div>
        </div>
    )
}
