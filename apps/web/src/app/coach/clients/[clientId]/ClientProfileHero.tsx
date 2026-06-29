'use client'

import type { ReactNode, SVGProps } from 'react'

function WhatsAppIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
    )
}
import Link from 'next/link'
import {
    Zap,
    Download,
    Flame,
    Calendar,
    TrendingUp,
    TrendingDown,
    Minus,
    Dumbbell,
    Utensils,
    Target,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatTrainingAgeLabel, formatRelativeLastActivity } from './profileOverviewUtils'

type HeroCompliance = {
    workoutsThisWeek?: number
    workoutsTarget?: number
    nutritionCompliancePercent?: number
    todayMealsDone?: number
    todayMealsTotal?: number
    planCurrentWeek?: number
    planTotalWeeks?: number
    currentStreak?: number
}

type ClientProfileHeroProps = {
    clientId: string
    client: {
        full_name: string
        email: string
        phone: string | null
        subscription_start_date: string | null
        created_at: string
        is_active: boolean | null
    }
    compliance: HeroCompliance
    profileLastActivityAt: string | null
    attentionScore: number
    currentWeightKg: number
    weightDeltaKg: number
    nutritionPlansLength: number
    nutritionFirstPlanId?: string
}

function attentionBadge(score: number): { label: string; tone: 'danger' | 'warning' | 'success' } {
    if (score >= 50) return { label: 'Urgente', tone: 'danger' }
    if (score >= 25) return { label: 'Revisar', tone: 'warning' }
    return { label: 'Estable', tone: 'success' }
}

export function ClientProfileHero({
    clientId,
    client,
    compliance,
    profileLastActivityAt,
    attentionScore,
    currentWeightKg,
    weightDeltaKg,
    nutritionPlansLength,
    nutritionFirstPlanId,
}: ClientProfileHeroProps) {
    const streakDays = compliance.currentStreak ?? 0
    const trainingAge = formatTrainingAgeLabel(
        client.subscription_start_date,
        client.created_at
    )
    const clientSince = parseIsoSafe(client.subscription_start_date || client.created_at)
    const clientSinceLabel = clientSince
        ? clientSince.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })
        : '—'

    const workoutsThisWeek = compliance.workoutsThisWeek ?? 0
    const workoutsTarget = Math.max(1, compliance.workoutsTarget ?? 1)
    const adherencePct = Math.min(100, Math.round((workoutsThisWeek / workoutsTarget) * 100))
    const nutritionPct = compliance.nutritionCompliancePercent ?? 0
    const mealsDone = compliance.todayMealsDone ?? 0
    const mealsTotal = Math.max(1, compliance.todayMealsTotal ?? 1)
    const planCur = compliance.planCurrentWeek ?? 1
    const planTot = Math.max(1, compliance.planTotalWeeks ?? 1)

    const ab = attentionBadge(attentionScore)
    const active = client.is_active !== false

    const handleExport = () => {
        window.print()
    }

    return (
        <div className="relative flex min-w-0 max-w-full flex-col gap-3">
            {/* Acciones + última actividad (TopBar de la ficha) */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-[10px] font-bold tracking-widest text-muted uppercase">
                    Última actividad:{' '}
                    <span className="text-strong">
                        {formatRelativeLastActivity(profileLastActivityAt)}
                    </span>
                </span>

                <div className="flex w-full min-w-0 max-w-full flex-row flex-wrap items-center gap-2 print:hidden sm:w-auto">
                    {client.phone ? (
                        <a
                            href={`https://wa.me/${client.phone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Contactar por WhatsApp"
                            className="flex h-12 w-12 items-center justify-center rounded-control border border-[#25D366]/40 bg-[#25D366]/10 text-[#25D366] transition-all hover:bg-[#25D366]/20"
                        >
                            <WhatsAppIcon className="h-5 w-5" />
                        </a>
                    ) : (
                        <div
                            aria-label="Sin número de teléfono"
                            className="pointer-events-none flex h-12 w-12 cursor-not-allowed items-center justify-center rounded-control border border-subtle bg-surface-sunken text-muted opacity-40 grayscale"
                        >
                            <WhatsAppIcon className="h-5 w-5" />
                        </div>
                    )}
                    <Link
                        href={`/coach/nutrition-plans/client/${clientId}`}
                        className="flex h-12 flex-1 items-center justify-center rounded-control border border-default bg-surface-card px-5 text-[10px] font-bold tracking-widest text-strong uppercase transition-colors hover:bg-surface-sunken sm:flex-none"
                    >
                        Nutrición
                    </Link>
                    <Link
                        href={`/coach/builder/${clientId}`}
                        className="flex h-12 flex-1 items-center justify-center gap-2 rounded-control bg-[var(--cta-fill)] px-5 text-[10px] font-bold tracking-widest text-[var(--text-on-sport)] uppercase shadow-[var(--glow-sport)] transition-colors hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)] sm:flex-none"
                    >
                        <Zap className="h-4 w-4" />
                        Entrenamiento
                    </Link>
                    <button
                        type="button"
                        onClick={handleExport}
                        className="flex h-12 items-center gap-2 rounded-control border border-default bg-surface-card px-4 text-[10px] font-bold tracking-widest text-strong uppercase transition-colors hover:bg-surface-sunken"
                    >
                        <Download className="h-4 w-4" />
                        Exportar
                    </button>
                </div>
            </div>

            {/* Hero inverso: identidad + 5 chips */}
            <Card variant="inverse" padding="lg" className="gap-0">
                <div className="flex items-start gap-4">
                    <div className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border-inverse)] bg-white/[0.07] shadow-[var(--shadow-md)] md:h-20 md:w-20">
                        <span className="font-display relative z-10 text-2xl font-black text-on-dark uppercase md:text-3xl">
                            {client.full_name[0]}
                        </span>
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="font-display max-w-full text-2xl font-black tracking-tighter text-on-dark break-words md:text-3xl">
                                {client.full_name}
                            </h1>
                            <Badge tone={active ? 'success' : 'neutral'} size="sm">
                                {active ? 'Activo' : 'Inactivo'}
                            </Badge>
                            <Badge tone={ab.tone} size="sm">
                                Score {attentionScore} · {ab.label}
                            </Badge>
                        </div>
                        <p className="truncate text-[12.5px] text-on-dark-muted">{client.email}</p>
                        <p className="flex w-full min-w-0 flex-wrap gap-x-3.5 gap-y-1 text-[11.5px] text-on-dark-muted [overflow-wrap:anywhere] break-words">
                            <span className="inline-flex items-center gap-1">
                                <Flame className="h-3.5 w-3.5 shrink-0 text-[var(--ember-400)]" />
                                {streakDays} d de racha
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5 shrink-0" />
                                Desde {clientSinceLabel}
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <Target className="h-3.5 w-3.5 shrink-0 text-[var(--sport-400)]" />
                                ~{trainingAge}
                            </span>
                        </p>
                    </div>
                </div>

                <div className="mt-3.5 grid w-full min-w-0 max-w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    <HeroStatChip
                        label="Peso"
                        value={currentWeightKg > 0 ? `${currentWeightKg} kg` : '—'}
                        sub={
                            weightDeltaKg === 0 ? (
                                <span className="inline-flex items-center gap-0.5 text-on-dark-muted">
                                    <Minus className="h-3 w-3" /> sin cambio
                                </span>
                            ) : weightDeltaKg > 0 ? (
                                <span className="inline-flex items-center gap-0.5 text-[var(--ember-400)]">
                                    <TrendingUp className="h-3 w-3" /> +{Math.abs(weightDeltaKg).toFixed(1)} kg
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-0.5 text-[var(--success-500)]">
                                    <TrendingDown className="h-3 w-3" /> {weightDeltaKg.toFixed(1)} kg
                                </span>
                            )
                        }
                    />
                    <HeroStatChip
                        label="Adherencia"
                        value={`${adherencePct}%`}
                        sub={<HeroChipBar value={adherencePct} />}
                    />
                    <HeroStatChip
                        label="Workouts"
                        value={`${workoutsThisWeek}/${workoutsTarget}`}
                        sub={<span className="text-on-dark-muted">esta semana</span>}
                        icon={<Dumbbell className="h-3 w-3 text-[var(--sport-400)]" />}
                    />
                    <HeroStatChip
                        label="Programa"
                        value={`Sem ${planCur}/${planTot}`}
                        sub={<HeroChipBar value={(planCur / planTot) * 100} />}
                    />
                    <HeroStatChip
                        label="Comidas hoy"
                        value={`${mealsDone}/${mealsTotal}`}
                        sub={
                            <span className={nutritionPct >= 80 ? 'text-[var(--success-500)]' : 'text-[var(--warning-500)]'}>
                                {nutritionPct}% plan
                            </span>
                        }
                        icon={<Utensils className="h-3 w-3 text-[var(--ember-400)]" />}
                        className="col-span-2 sm:col-span-1"
                    />
                </div>
            </Card>
        </div>
    )
}

function parseIsoSafe(s: string | null): Date | null {
    if (!s) return null
    const d = new Date(s.length <= 10 ? `${s}T12:00:00` : s)
    return isFinite(d.getTime()) ? d : null
}

function HeroChipBar({ value }: { value: number }) {
    return (
        <div className="mt-1.5 h-1 overflow-hidden rounded-pill bg-[var(--border-inverse)]">
            <div
                className="h-full rounded-pill bg-sport-500"
                style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
            />
        </div>
    )
}

function HeroStatChip({
    label,
    value,
    sub,
    icon,
    className,
}: {
    label: string
    value: string
    sub?: ReactNode
    icon?: React.ReactNode
    className?: string
}) {
    return (
        <div
            className={cn(
                'min-w-0 max-w-full rounded-control border border-[var(--border-inverse)] bg-white/[0.07] p-2.5',
                className
            )}
        >
            <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[10px] tracking-[0.03em] text-on-dark-muted">
                    {label}
                </span>
                {icon}
            </div>
            <div className="font-display min-w-0 break-words text-base font-black tabular-nums text-on-dark">
                {value}
            </div>
            <div className="mt-0.5 min-w-0 text-[10.5px] font-bold [overflow-wrap:anywhere]">{sub}</div>
        </div>
    )
}
