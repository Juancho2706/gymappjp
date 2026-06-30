'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
    Flame,
    Star,
    Dumbbell,
    PieChart,
    Scale,
    CalendarRange,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ProgressRing } from '@/components/ui/progress-ring'
import { cn } from '@/lib/utils'
import {
    buildProfileActivityCalendarData,
    longestActivityStreakFromCalendar,
    countWorkoutDaysInRange,
} from './profileOverviewUtils'
import { subDays } from 'date-fns'

type ComplianceShape = {
    workoutsThisWeek?: number
    workoutsPrevWeek?: number
    workoutsTarget?: number
    nutritionWeeklyAvgPct?: number
    nutritionPrevWeeklyAvgPct?: number
    checkInCompliancePercent?: number
    checkInCompliancePercentWeekAgo?: number
    currentStreak?: number
    planCurrentWeek?: number
    planTotalWeeks?: number
    nutritionCompliancePercent?: number
}

type ProfileOverviewB3Props = {
    workoutHistory: any[]
    checkIns: { created_at: string; weight?: number | null }[]
    compliance: ComplianceShape
    /** Deep-link a la Zona A (Progreso) del hogar único de nutrición. No recomputa
     *  el % — solo navega; el valor mostrado es el mismo de `compliance`. */
    onViewNutrition?: () => void
}

const ringSize = 108

export function ProfileOverviewB3({
    workoutHistory,
    checkIns,
    compliance,
    onViewNutrition,
}: ProfileOverviewB3Props) {
    const calendarData = useMemo(
        () => buildProfileActivityCalendarData(workoutHistory, checkIns, 371),
        [workoutHistory, checkIns]
    )

    const longestStreak = useMemo(
        () => longestActivityStreakFromCalendar(calendarData),
        [calendarData]
    )

    const target = Math.max(1, compliance.workoutsTarget ?? 1)
    const wThis = compliance.workoutsThisWeek ?? 0
    const wPrev = compliance.workoutsPrevWeek ?? 0
    const workoutPct = Math.min(100, Math.round((wThis / target) * 100))
    const prevWorkoutPct = Math.min(100, Math.round((wPrev / target) * 100))
    // Delta vs período anterior — null si no hay valor previo REAL (no se fabrica).
    const workoutDelta =
        compliance.workoutsPrevWeek != null ? workoutPct - prevWorkoutPct : null

    const nutAvg = compliance.nutritionWeeklyAvgPct ?? 0
    const nutPrev = compliance.nutritionPrevWeeklyAvgPct ?? 0
    const nutDelta =
        compliance.nutritionPrevWeeklyAvgPct != null ? nutAvg - nutPrev : null

    const checkPct = compliance.checkInCompliancePercent ?? 0
    const checkPctWeekAgo = compliance.checkInCompliancePercentWeekAgo ?? 0
    const checkDelta =
        compliance.checkInCompliancePercentWeekAgo != null ? checkPct - checkPctWeekAgo : null

    const streak = compliance.currentStreak ?? 0
    const planCur = compliance.planCurrentWeek ?? 1
    const planTot = Math.max(1, compliance.planTotalWeeks ?? 4)

    const now = new Date()
    const monthStart = subDays(now, 30)
    const sessions30d = countWorkoutDaysInRange(workoutHistory, monthStart, now)

    const sortedCi = useMemo(
        () =>
            [...(checkIns || [])].sort(
                (a, b) =>
                    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            ),
        [checkIns]
    )
    const weightDelta30d = useMemo(() => {
        if (sortedCi.length < 2) return null
        const latest = sortedCi[0]?.weight
        const baseline = sortedCi.find(
            (c) => new Date(c.created_at).getTime() <= monthStart.getTime()
        )?.weight
        if (latest == null || baseline == null) return null
        return Number((latest - baseline).toFixed(1))
    }, [sortedCi, monthStart])

    const primaryHex = 'var(--sport-500)'
    const emeraldHex = 'var(--success-500)'
    const redHex = 'var(--danger-500)'
    const amberHex = 'var(--warning-500)'

    const nutColor = nutAvg >= 70 ? emeraldHex : nutAvg >= 50 ? amberHex : redHex

    const kpiItems: {
        icon: typeof Star
        label: string
        value: string
        hint: string
        tone: 'ember' | 'sport' | 'success'
    }[] = [
        {
            icon: Flame,
            label: 'Mejor racha',
            value: `${longestStreak} día${longestStreak === 1 ? '' : 's'}`,
            hint: 'histórico',
            tone: 'ember',
        },
        {
            icon: Dumbbell,
            label: 'Sesiones',
            value: `${sessions30d}`,
            hint: 'últimos 30 días',
            tone: 'sport',
        },
        {
            icon: PieChart,
            label: 'Adherencia entreno',
            value: `${workoutPct}%`,
            hint:
                workoutDelta == null
                    ? 'esta semana'
                    : workoutDelta >= 0
                      ? `+${workoutDelta}% vs sem. ant.`
                      : `${workoutDelta}% vs sem. ant.`,
            tone: 'sport',
        },
        {
            icon: Scale,
            label: 'Δ Peso (30d)',
            value: weightDelta30d == null ? '—' : `${weightDelta30d > 0 ? '+' : ''}${weightDelta30d} kg`,
            hint: 'check-ins',
            tone: weightDelta30d != null && weightDelta30d > 0 ? 'ember' : 'success',
        },
        {
            icon: CalendarRange,
            label: 'Sem. programa',
            value: `${planCur} / ${planTot}`,
            hint: 'ciclo activo',
            tone: 'sport',
        },
    ]

    const kpiToneClass: Record<'ember' | 'sport' | 'success', string> = {
        ember: 'bg-[var(--ember-100)] text-[var(--ember-700)]',
        sport: 'bg-sport-100 text-sport-600',
        success: 'bg-[var(--success-100)] text-[var(--success-600)]',
    }

    return (
        <div className="space-y-6">
            <Card padding="md">
                <h3 className="text-xs font-black uppercase tracking-widest text-sport-600">
                    Cumplimiento semanal
                </h3>
                <div className="grid grid-cols-1 justify-items-center gap-8 sm:grid-cols-3">
                    <ComplianceRing
                        label="Entrenamientos"
                        valueText={`${wThis}/${target}`}
                        percentage={workoutPct}
                        delta={workoutDelta}
                        pathColor={primaryHex}
                    />
                    <ComplianceRing
                        label="Nutrición (7d)"
                        valueText={`${nutAvg}%`}
                        percentage={Math.min(100, nutAvg)}
                        delta={nutDelta}
                        pathColor={nutColor}
                        onClick={onViewNutrition}
                        linkLabel="Ver nutrición →"
                    />
                    <ComplianceRing
                        label="Check-in"
                        valueText={`${checkPct}%`}
                        percentage={checkPct}
                        delta={checkDelta}
                        pathColor={checkPct >= 70 ? emeraldHex : checkPct >= 40 ? amberHex : redHex}
                    />
                </div>
            </Card>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {kpiItems.map((item, i) => (
                    <motion.div
                        key={item.label}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05, duration: 0.25 }}
                    >
                        <Card padding="md" className="h-full flex-row items-center gap-3">
                            <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-control', kpiToneClass[item.tone])}>
                                <item.icon className="h-[18px] w-[18px]" />
                            </div>
                            <div className="min-w-0">
                                <p className="font-display text-lg font-black leading-tight text-strong">
                                    {item.value}
                                </p>
                                <p className="mt-0.5 text-[10.5px] font-medium text-muted">
                                    {item.label} · {item.hint}
                                </p>
                            </div>
                        </Card>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}

function ComplianceRing({
    label,
    valueText,
    percentage,
    delta,
    pathColor,
    onClick,
    linkLabel,
}: {
    label: string
    valueText: string
    percentage: number
    /** Delta en pts vs período anterior; `null` ⇒ sin dato previo (se omite el label). */
    delta: number | null
    pathColor: string
    onClick?: () => void
    linkLabel?: string
}) {
    const Wrapper = onClick ? 'button' : 'div'
    return (
        <Wrapper
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            className={cn(
                'flex w-full max-w-[200px] flex-col items-center gap-3',
                onClick &&
                    'rounded-card p-1 transition-colors hover:bg-surface-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]'
            )}
        >
            <ProgressRing value={percentage} size={ringSize} stroke={8} color={pathColor} />
            <div className="space-y-1 text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted">
                    {label}
                </p>
                <p className="font-display text-lg font-black text-strong">{valueText}</p>
                {delta != null ? (
                    <p
                        className={cn(
                            'text-[10px] font-bold',
                            delta > 0
                                ? 'text-[var(--success-600)]'
                                : delta < 0
                                  ? 'text-[var(--danger-600)]'
                                  : 'text-subtle'
                        )}
                    >
                        {delta === 0
                            ? '— vs sem. ant.'
                            : `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta)} pts`}
                    </p>
                ) : null}
                {onClick && linkLabel ? (
                    <p className="text-[10px] font-bold text-sport-600">{linkLabel}</p>
                ) : null}
            </div>
        </Wrapper>
    )
}
