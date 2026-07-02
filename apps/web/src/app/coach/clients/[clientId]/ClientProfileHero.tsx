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
    Download,
    MoreVertical,
    Flame,
    Calendar,
    Activity,
    TrendingUp,
    TrendingDown,
    Minus,
    Target,
    HeartPulse,
    PersonStanding,
    Scale,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatTrainingAgeLabel, formatRelativeLastActivity } from './profileOverviewUtils'
import {
    deriveClientStatus,
    type ClientStatus,
    type ClientStatusLevel,
} from './clientStatusUtils'

type HeroCompliance = {
    workoutsThisWeek?: number
    workoutsTarget?: number
    nutritionCompliancePercent?: number
    todayMealsDone?: number
    todayMealsTotal?: number
    planCurrentWeek?: number
    planTotalWeeks?: number
    currentStreak?: number
    /** Días restantes del ciclo (el objeto lo trae; se declara para el status del hero). */
    planDaysRemaining?: number
}

/** Nivel de estado → tono del badge único (danger/warning/success). */
const STATUS_TONE: Record<ClientStatusLevel, 'danger' | 'warning' | 'success'> = {
    urgent: 'danger',
    attention: 'warning',
    ok: 'success',
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
    /** Nombre del programa activo — alimenta el eyebrow "{PROGRAMA} · Semana {N}". */
    activeProgramName?: string | null
    /** Entitlements de módulos movida (espejo del gate server-side). */
    moduleFlags?: { cardio: boolean; movement: boolean; bodycomp: boolean }
    /**
     * Estado unificado del alumno ya computado server-side (con las señales crudas
     * precisas: días sin check-in/entrenar, adherencia 30d, días de ciclo). Si no se
     * pasa, el hero cae a un fallback derivado de las señales que ya recibe.
     */
    status?: ClientStatus
}

export function ClientProfileHero({
    clientId,
    client,
    compliance,
    profileLastActivityAt,
    attentionScore,
    currentWeightKg,
    weightDeltaKg,
    activeProgramName,
    moduleFlags,
    status: statusProp,
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
    const planCur = compliance.planCurrentWeek ?? null

    // Eyebrow del TopBar: "{PROGRAMA} · Semana {N}" (el programa/semana ya no vive en un chip del hero).
    const programName = activeProgramName?.trim() || null
    const eyebrow = programName
        ? `${programName}${planCur != null ? ` · Semana ${planCur}` : ''}`
        : planCur != null
          ? `Semana ${planCur}`
          : 'Sin programa activo'

    // UN solo estado (badge + motivos + score en tooltip). Si el server no lo
    // computó (statusProp), fallback con las señales disponibles en el hero: sin
    // días crudos de check-in/entreno (no llegan por props hoy) los motivos precisos
    // quedan al wiring server-side; el nivel se sostiene con el attentionScore.
    const status =
        statusProp ??
        deriveClientStatus({
            attentionScore,
            daysSinceCheckin: null,
            daysSinceWorkout: null,
            hasActiveWorkoutProgram: Boolean(programName),
            nutritionAdherencePct: null,
            planDaysRemaining: compliance.planDaysRemaining ?? null,
        })

    // Accesos a módulos de pago como botones-ícono pequeños (gateados por entitlement).
    const moduleButtons = [
        moduleFlags?.cardio
            ? { href: `/coach/cardio/${clientId}`, label: 'Perfil cardio', Icon: HeartPulse }
            : null,
        moduleFlags?.movement
            ? {
                  href: `/coach/movement/${clientId}`,
                  label: 'Screening de movimiento',
                  Icon: PersonStanding,
              }
            : null,
        moduleFlags?.bodycomp
            ? {
                  href: `/coach/clients/${clientId}/bodycomp`,
                  label: 'Composición corporal',
                  Icon: Scale,
              }
            : null,
    ].filter(
        (b): b is { href: string; label: string; Icon: typeof HeartPulse } => b !== null
    )

    const waHref = client.phone ? `https://wa.me/${client.phone.replace(/\D/g, '')}` : null

    const handleExport = () => {
        window.print()
    }

    return (
        <div className="relative flex min-w-0 max-w-full flex-col gap-3">
            {/* TopBar: eyebrow "{PROGRAMA} · Semana {N}" + nombre · acciones (exportar / más) */}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="truncate text-[10px] font-bold tracking-widest text-muted uppercase">
                        {eyebrow}
                    </div>
                    <h1 className="font-display max-w-full text-2xl font-black tracking-tighter text-strong break-words md:text-3xl">
                        {client.full_name}
                    </h1>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 print:hidden">
                    <button
                        type="button"
                        onClick={handleExport}
                        aria-label="Exportar PDF"
                        title="Exportar PDF"
                        className="flex h-10 w-10 items-center justify-center rounded-control border border-default bg-surface-card text-strong shadow-[var(--shadow-sm)] transition-colors hover:bg-surface-sunken"
                    >
                        <Download className="h-[18px] w-[18px]" />
                    </button>
                    <button
                        type="button"
                        aria-label="Más opciones"
                        title="Más opciones"
                        className="flex h-10 w-10 items-center justify-center rounded-control border border-default bg-surface-card text-strong shadow-[var(--shadow-sm)] transition-colors hover:bg-surface-sunken"
                    >
                        <MoreVertical className="h-[18px] w-[18px]" />
                    </button>
                </div>
            </div>

            {/* Hero inverso: identidad + 4 chips (2×2) */}
            <Card variant="inverse" padding="lg" className="gap-0">
                <div className="flex items-start gap-4">
                    <span
                        className="relative flex h-16 w-16 flex-shrink-0 rounded-full md:h-20 md:w-20"
                        style={{ padding: 2, background: `var(--${STATUS_TONE[status.level]}-500)` }}
                    >
                        <span
                            className="flex h-full w-full items-center justify-center rounded-full font-display text-xl font-extrabold tracking-[-0.02em] md:text-2xl"
                            style={{
                                background: 'var(--surface-inverse)',
                                color: 'var(--sport-400)',
                                border: '2px solid var(--surface-card)',
                            }}
                        >
                            {initialsOf(client.full_name)}
                        </span>
                    </span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Badge
                                tone={STATUS_TONE[status.level]}
                                size="sm"
                                title={`Score de atención: ${status.score}`}
                            >
                                {status.label}
                            </Badge>
                            {status.reasons.length > 0 && (
                                <span className="min-w-0 text-[11.5px] text-on-dark-muted [overflow-wrap:anywhere]">
                                    {status.reasons.join(' · ')}
                                </span>
                            )}
                        </div>
                        <p className="truncate text-[12.5px] text-on-dark-muted">{client.email}</p>
                        <p className="flex w-full min-w-0 flex-wrap gap-x-3.5 gap-y-1 text-[11.5px] text-on-dark-muted [overflow-wrap:anywhere] break-words">
                            <span className="inline-flex items-center gap-1">
                                <Flame className="h-3.5 w-3.5 shrink-0 text-[var(--ember-400)]" />
                                {streakDays} d de racha de actividad
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <Activity className="h-3.5 w-3.5 shrink-0 text-[var(--sport-400)]" />
                                {formatRelativeLastActivity(profileLastActivityAt)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5 shrink-0" />
                                Desde {clientSinceLabel}
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <Target className="h-3.5 w-3.5 shrink-0" />
                                ~{trainingAge}
                            </span>
                        </p>
                    </div>
                </div>

                {/* 4 chips (2×2, sin hueco impar) — el programa/semana vive en el eyebrow, no acá */}
                <div className="mt-3.5 grid w-full min-w-0 max-w-full grid-cols-2 gap-2">
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
                    />
                    <HeroStatChip
                        label="Comidas hoy"
                        value={`${mealsDone}/${mealsTotal}`}
                        sub={
                            <span className={nutritionPct >= 80 ? 'text-[var(--success-500)]' : 'text-[var(--warning-500)]'}>
                                {nutritionPct}% plan
                            </span>
                        }
                    />
                </div>
            </Card>

            {/* WhatsApp + accesos a módulos: MOVIDOS (rediseño CD nuevo) — WhatsApp + check-in +
                builder viven en la barra de acciones FLOTANTE (ProfileFloatingActions) y los módulos
                en la sección "Módulos" al final del Resumen. El hero ya no los duplica. */}
        </div>
    )
}

function parseIsoSafe(s: string | null): Date | null {
    if (!s) return null
    const d = new Date(s.length <= 10 ? `${s}T12:00:00` : s)
    return isFinite(d.getTime()) ? d : null
}

function initialsOf(name?: string | null): string {
    return (
        (name ?? '')
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => w[0])
            .join('')
            .toUpperCase() || '?'
    )
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
