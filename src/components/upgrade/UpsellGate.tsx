import Link from 'next/link'
import { Check } from 'lucide-react'
import { UpgradeGateTracker } from '@/components/analytics/UpgradeGateTracker'
import type { SubscriptionTier } from '@/lib/constants'

export type UpsellGateVariant = 'custom_exercises' | 'client_import'

interface UpsellGateConfig {
    gate: string
    icon: React.ReactNode
    accentColor: string
    title: string
    subtitle: React.ReactNode
    features: string[]
    ctaLabel: string
    mockupLeft: React.ReactNode
    mockupRight: React.ReactNode
}

const VIOLET_ACCENT = {
    gradient: 'from-violet-500/10 via-card to-card',
    border: 'border-violet-500/20',
    iconBg: 'bg-violet-500/15 border-violet-500/20',
    iconText: 'text-violet-400',
    check: 'text-violet-400',
    mockupBorder: 'border-violet-400/40',
    mockupBar: 'bg-violet-500',
    mockupBadge: 'text-violet-400',
    mockupFill: 'bg-violet-400/25',
    mockupFillLight: 'bg-violet-400/15',
    mockupItemBorder: 'border-violet-500/25',
    mockupItemBg: 'bg-violet-500/15',
    blob: 'bg-violet-400/15',
    cta: 'bg-violet-500 hover:bg-violet-400',
    priceBadgeBg: 'bg-violet-500/15',
    priceBadgeText: 'text-violet-500',
    priceAccent: 'text-violet-400',
}

const EMERALD_ACCENT = {
    gradient: 'from-emerald-500/10 via-card to-card',
    border: 'border-emerald-500/20',
    iconBg: 'bg-emerald-500/15 border-emerald-500/20',
    iconText: 'text-emerald-400',
    check: 'text-emerald-400',
    mockupBorder: 'border-emerald-400/40',
    mockupBar: 'bg-emerald-500',
    mockupBadge: 'text-emerald-400',
    mockupFill: 'bg-emerald-400/25',
    mockupFillLight: 'bg-emerald-400/15',
    mockupItemBorder: 'border-emerald-500/25',
    mockupItemBg: 'bg-emerald-500/15',
    blob: 'bg-emerald-400/15',
    cta: 'bg-emerald-500 hover:bg-emerald-400',
    priceBadgeBg: 'bg-emerald-500/15',
    priceBadgeText: 'text-emerald-500',
    priceAccent: 'text-emerald-400',
}

interface Props {
    variant: UpsellGateVariant
    currentTier: SubscriptionTier
}

export function UpsellGate({ variant, currentTier }: Props) {
    const isExercises = variant === 'custom_exercises'
    const c = isExercises ? VIOLET_ACCENT : EMERALD_ACCENT

    const title = isExercises ? 'Mi Biblioteca de Ejercicios' : 'Importar Alumnos desde Excel'

    const subtitle = isExercises
        ? <>Creá tus propios ejercicios con video de YouTube y apareceran en el builder. Disponible en <span className="font-semibold text-foreground">Starter</span>.</>
        : <>Migrá toda tu cartera de alumnos desde Excel en minutos, sin cargar uno por uno. Disponible en <span className="font-semibold text-foreground">Starter</span>.</>

    const features = isExercises
        ? [
            'Ejercicios propios con video YouTube unlisted',
            'Aparecen en el builder junto a los del sistema',
            'Filtrá por "Solo míos" para encontrarlos rápido',
            'Soft-delete: borrá sin romper planes históricos',
          ]
        : [
            'Importá hasta 1.000 alumnos desde .xlsx / .csv',
            'Detección automática de columnas (nombre, email, tel)',
            'Preview con errores marcados antes de confirmar',
            'Cumplimiento Ley 19.628 — checkbox de consentimiento',
          ]

    const ctaLabel = isExercises
        ? 'Crear mi biblioteca con Starter →'
        : 'Importar alumnos con Starter →'

    return (
        <div className="p-4 md:p-8 max-w-2xl mx-auto animate-fade-in space-y-4">
            <UpgradeGateTracker gate={variant} currentTier={currentTier} />

            {/* Hero */}
            <div className={`relative overflow-hidden rounded-2xl border ${c.border} bg-gradient-to-br ${c.gradient} p-6`}>
                <div className="relative z-10">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${c.iconBg} border mb-4`}>
                        {isExercises ? (
                            <svg className={`h-6 w-6 ${c.iconText}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                            </svg>
                        ) : (
                            <svg className={`h-6 w-6 ${c.iconText}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                        )}
                    </div>
                    <h1 className="text-2xl font-extrabold text-foreground">{title}</h1>
                    <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">{subtitle}</p>
                </div>
                <div className={`pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full ${c.blob} blur-3xl`} />
            </div>

            {/* Before / after mockup */}
            <div className="grid grid-cols-2 gap-3">
                <div className="overflow-hidden rounded-2xl border border-border bg-card">
                    <div className="flex items-center gap-2 bg-[#007AFF] px-3 py-2.5">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                            <span className="text-[9px] font-bold text-white">E</span>
                        </div>
                        <span className="text-[11px] font-semibold text-white/90">EVA Fitness</span>
                    </div>
                    <div className="space-y-2 p-3">
                        <div className="h-2 w-full rounded-full bg-[#007AFF]/15" />
                        <div className="h-1.5 w-3/4 rounded-full bg-muted" />
                        <div className="h-1.5 w-1/2 rounded-full bg-muted" />
                        <div className="mt-2.5 h-7 w-full rounded-lg bg-[#007AFF]/10 border border-[#007AFF]/20" />
                        <div className="h-7 w-full rounded-lg bg-muted/50" />
                    </div>
                    <p className="px-3 pb-3 text-[10px] text-muted-foreground/60">Sin acceso (ahora)</p>
                </div>
                <div className={`overflow-hidden rounded-2xl border ${c.mockupBorder} bg-card`}>
                    <div className={`flex items-center gap-2 ${c.mockupBar} px-3 py-2.5`}>
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25">
                            <span className="text-[9px] font-bold text-white">T</span>
                        </div>
                        <span className="text-[11px] font-semibold text-white">Tu Marca</span>
                    </div>
                    <div className="space-y-2 p-3">
                        <div className={`h-2 w-full rounded-full ${c.mockupFill}`} />
                        <div className={`h-1.5 w-3/4 rounded-full ${c.mockupFillLight}`} />
                        <div className="h-1.5 w-1/2 rounded-full bg-muted" />
                        <div className={`mt-2.5 h-7 w-full rounded-lg ${c.mockupItemBg} border ${c.mockupItemBorder}`} />
                        <div className="h-7 w-full rounded-lg bg-muted/50" />
                    </div>
                    <p className={`px-3 pb-3 text-[10px] font-medium ${c.mockupBadge}`}>Con Starter ✓</p>
                </div>
            </div>

            {/* Pricing + features + CTA */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-5">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Disponible en Starter</p>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mt-1.5">
                        <span className="text-2xl font-extrabold text-foreground">$19.990</span>
                        <span className="text-sm text-muted-foreground">/mes</span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className={`text-sm font-semibold ${c.priceAccent}`}>$15.992/mes anual</span>
                        <span className={`rounded-md ${c.priceBadgeBg} px-1.5 py-0.5 text-[10px] font-bold ${c.priceBadgeText}`}>−20%</span>
                    </div>
                </div>

                <ul className="space-y-2.5">
                    {features.map((feat) => (
                        <li key={feat} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                            <Check className={`mt-0.5 h-4 w-4 shrink-0 ${c.check}`} />
                            {feat}
                        </li>
                    ))}
                </ul>

                <Link
                    href="/coach/subscription?upgrade=starter"
                    className={`flex h-11 w-full items-center justify-center rounded-xl ${c.cta} px-6 text-sm font-semibold text-white transition-colors`}
                >
                    {ctaLabel}
                </Link>
                <p className="text-center text-xs text-muted-foreground">Sin permanencia · Cancelá cuando quieras</p>
            </div>
        </div>
    )
}
