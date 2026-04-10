'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import {
    MessageCircle,
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
import { GlassButton } from '@/components/ui/glass-button'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
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

function attentionBadge(score: number) {
    if (score >= 50) {
        return { label: 'Urgente', className: 'bg-rose-500/15 text-rose-500 border-rose-500/30' }
    }
    if (score >= 25) {
        return { label: 'Revisar', className: 'bg-amber-500/15 text-amber-500 border-amber-500/30' }
    }
    return { label: 'Estable', className: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' }
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
        <div className="relative flex min-w-0 max-w-full flex-col gap-6">
            <div className="absolute -top-10 -left-10 w-64 h-64 bg-primary/10 blur-[100px] pointer-events-none z-0" />

            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 relative z-10 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <span className="opacity-0 sm:opacity-100 select-none" aria-hidden>
                    &nbsp;
                </span>
                <span>
                    Última actividad:{' '}
                    <span className="text-foreground">
                        {formatRelativeLastActivity(profileLastActivityAt)}
                    </span>
                </span>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                <div className="flex items-center gap-4 md:gap-6 min-w-0">
                    <div className="w-16 h-16 md:w-24 md:h-24 rounded-2xl md:rounded-[2rem] bg-white dark:bg-white/5 border border-primary/20 flex items-center justify-center flex-shrink-0 shadow-2xl overflow-hidden relative group">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent" />
                        <span className="text-2xl md:text-4xl font-black text-primary uppercase font-display relative z-10">
                            {client.full_name[0]}
                        </span>
                    </div>
                    <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2 md:gap-3">
                            <h1 className="font-display max-w-full text-2xl font-black uppercase leading-none tracking-tighter text-foreground break-words md:text-5xl">
                                {client.full_name}
                            </h1>
                            <Badge
                                variant="outline"
                                className={cn(
                                    'font-black text-[10px] uppercase tracking-widest shrink-0',
                                    active
                                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                        : 'bg-muted text-muted-foreground border-border'
                                )}
                            >
                                {active ? 'Activo' : 'Inactivo'}
                            </Badge>
                            <Badge variant="outline" className={cn('font-black text-[10px] uppercase tracking-widest shrink-0 border', ab.className)}>
                                Score: {attentionScore} · {ab.label}
                            </Badge>
                        </div>
                        <p className="break-all text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            {client.email}
                        </p>
                        <p className="flex w-full min-w-0 flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium normal-case tracking-normal text-muted-foreground [overflow-wrap:anywhere] break-words md:text-xs">
                            <span className="inline-flex items-center gap-1">
                                <Flame className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                                Racha: {streakDays} día{streakDays === 1 ? '' : 's'}
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5 shrink-0" />
                                Cliente desde: {clientSinceLabel}
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <Target className="w-3.5 h-3.5 text-primary shrink-0" />
                                Edad entreno: ~{trainingAge}
                            </span>
                        </p>
                    </div>
                </div>

                <div className="relative z-10 flex w-full min-w-0 max-w-full flex-row flex-wrap items-center gap-2 print:hidden md:gap-3">
                    <GlassButton
                        asChild
                        className={cn(
                            'w-12 h-12 p-0 border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary transition-all',
                            !client.phone && 'opacity-50 grayscale cursor-not-allowed pointer-events-none'
                        )}
                    >
                        {client.phone ? (
                            <a
                                href={`https://wa.me/${client.phone.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <MessageCircle className="w-5 h-5" />
                            </a>
                        ) : (
                            <div>
                                <MessageCircle className="w-5 h-5" />
                            </div>
                        )}
                    </GlassButton>
                    <GlassButton
                        asChild
                        className="flex-1 md:flex-none h-12 px-5 border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary"
                    >
                        <Link
                            href={`/coach/nutrition-plans/client/${clientId}`}
                        >
                            <span className="font-bold uppercase tracking-widest text-[10px]">Nutrición</span>
                        </Link>
                    </GlassButton>
                    <GlassButton
                        asChild
                        className="flex-1 md:flex-none h-12 px-5 bg-primary text-primary-foreground hover:bg-primary/90 border-none shadow-[0_0_20px_-5px_var(--theme-primary)]"
                    >
                        <Link href={`/coach/builder/${clientId}`}>
                            <Zap className="w-4 h-4 mr-2" />
                            <span className="font-bold uppercase tracking-widest text-[10px]">Entrenamiento</span>
                        </Link>
                    </GlassButton>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleExport}
                        className="h-12 px-4 border-dashed border-primary/30 bg-background/80 hover:bg-primary/5 font-bold uppercase tracking-widest text-[10px] gap-2"
                    >
                        <Download className="w-4 h-4" />
                        Exportar
                    </Button>
                </div>
            </div>

            <div className="relative z-10 grid w-full min-w-0 max-w-full grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
                <HeroStatChip
                    label="Peso"
                    value={currentWeightKg > 0 ? `${currentWeightKg} kg` : '—'}
                    sub={
                        weightDeltaKg === 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                                <Minus className="w-3 h-3" /> sin cambio
                            </span>
                        ) : weightDeltaKg > 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-red-500">
                                <TrendingUp className="w-3 h-3" /> +{Math.abs(weightDeltaKg).toFixed(1)} kg
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-0.5 text-emerald-500">
                                <TrendingDown className="w-3 h-3" /> {weightDeltaKg.toFixed(1)} kg
                            </span>
                        )
                    }
                />
                <HeroStatChip
                    label="Adherencia"
                    value={`${adherencePct}%`}
                    sub={<Progress value={adherencePct} className="h-1.5 bg-secondary mt-1" />}
                />
                <HeroStatChip
                    label="Workouts"
                    value={`${workoutsThisWeek}/${workoutsTarget}`}
                    sub={<span className="text-muted-foreground">esta semana</span>}
                    icon={<Dumbbell className="w-3 h-3 text-primary" />}
                />
                <HeroStatChip
                    label="Programa"
                    value={`Sem ${planCur}/${planTot}`}
                    sub={<Progress value={(planCur / planTot) * 100} className="h-1.5 bg-secondary mt-1" />}
                />
                <HeroStatChip
                    label="Comidas hoy"
                    value={`${mealsDone}/${mealsTotal}`}
                    sub={<span className={nutritionPct >= 80 ? 'text-emerald-500' : 'text-amber-500'}>{nutritionPct}% plan</span>}
                    icon={<Utensils className="w-3 h-3 text-emerald-500" />}
                    className="col-span-2 sm:col-span-1"
                />
            </div>
        </div>
    )
}

function parseIsoSafe(s: string | null): Date | null {
    if (!s) return null
    const d = new Date(s.length <= 10 ? `${s}T12:00:00` : s)
    return isFinite(d.getTime()) ? d : null
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
                'min-w-0 max-w-full rounded-2xl border border-border/60 bg-card/80 p-3 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.03] sm:p-4',
                className
            )}
        >
            <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                    {label}
                </span>
                {icon}
            </div>
            <div className="min-w-0 break-words text-base font-black leading-tight text-foreground sm:text-lg">{value}</div>
            <div className="mt-1 min-w-0 text-[10px] font-medium [overflow-wrap:anywhere]">{sub}</div>
        </div>
    )
}
