'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import { motion } from 'framer-motion'
import {
    CircularProgressbar,
    buildStyles,
} from 'react-circular-progressbar'
import 'react-circular-progressbar/dist/styles.css'
import { ActivityCalendar } from 'react-activity-calendar'
import {
    Flame,
    Star,
    Dumbbell,
    PieChart,
    Scale,
    CalendarRange,
} from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
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
}

const ringSize = 108

export function ProfileOverviewB3({
    workoutHistory,
    checkIns,
    compliance,
}: ProfileOverviewB3Props) {
    const { resolvedTheme } = useTheme()
    const [themeReady, setThemeReady] = useState(false)
    useEffect(() => {
        setThemeReady(true)
    }, [])
    // Evita mismatch SSR/cliente: en servidor y primer paint, mismo valor que en SSR.
    const isDark = themeReady && resolvedTheme === 'dark'

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
    const workoutDelta = workoutPct - prevWorkoutPct

    const nutAvg = compliance.nutritionWeeklyAvgPct ?? 0
    const nutPrev = compliance.nutritionPrevWeeklyAvgPct ?? 0
    const nutDelta = nutAvg - nutPrev

    const checkPct = compliance.checkInCompliancePercent ?? 0
    const checkPctWeekAgo = compliance.checkInCompliancePercentWeekAgo ?? 0
    const checkDelta = checkPct - checkPctWeekAgo

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

    const primaryHex = 'var(--theme-primary, #007AFF)'
    const emeraldHex = '#10b981'
    const redHex = '#ef4444'
    const amberHex = '#f59e0b'

    const nutColor = nutAvg >= 70 ? emeraldHex : nutAvg >= 50 ? amberHex : redHex

    const themeLight: [string, string, string, string, string] = [
        '#e8e8ec',
        'rgba(0, 122, 255, 0.22)',
        'rgba(0, 122, 255, 0.45)',
        'rgba(0, 122, 255, 0.68)',
        'rgb(0, 122, 255)',
    ]
    const themeDark: [string, string, string, string, string] = [
        '#1a1a1e',
        'rgba(96, 165, 250, 0.28)',
        'rgba(96, 165, 250, 0.48)',
        'rgba(96, 165, 250, 0.72)',
        'rgb(147, 197, 253)',
    ]

    const kpiItems = [
        {
            icon: Star,
            label: 'Mejor racha',
            value: `${longestStreak} día${longestStreak === 1 ? '' : 's'}`,
            hint: 'histórico (heatmap)',
        },
        {
            icon: Dumbbell,
            label: 'Sesiones',
            value: `${sessions30d}`,
            hint: 'últimos 30 días',
        },
        {
            icon: PieChart,
            label: 'Adherencia entreno',
            value: `${workoutPct}%`,
            hint: workoutDelta >= 0 ? `+${workoutDelta}% vs sem. ant.` : `${workoutDelta}% vs sem. ant.`,
        },
        {
            icon: Scale,
            label: 'Δ Peso (30d)',
            value: weightDelta30d == null ? '—' : `${weightDelta30d > 0 ? '+' : ''}${weightDelta30d} kg`,
            hint: 'check-ins',
        },
        {
            icon: CalendarRange,
            label: 'Sem. programa',
            value: `${planCur} / ${planTot}`,
            hint: 'ciclo activo',
        },
    ]

    return (
        <div className="space-y-6">
            <GlassCard className="p-6 border-dashed border-border/50 dark:border-white/10 relative overflow-hidden">
                <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-6">
                    Cumplimiento semanal
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 justify-items-center">
                    <ComplianceRing
                        label="Entrenamientos"
                        valueText={`${wThis}/${target}`}
                        percentage={workoutPct}
                        delta={workoutDelta}
                        pathColor={primaryHex}
                        trailColor={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}
                        textColor={isDark ? '#fafafa' : '#111'}
                    />
                    <ComplianceRing
                        label="Nutrición (7d)"
                        valueText={`${nutAvg}%`}
                        percentage={Math.min(100, nutAvg)}
                        delta={nutDelta}
                        pathColor={nutColor}
                        trailColor={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}
                        textColor={isDark ? '#fafafa' : '#111'}
                    />
                    <ComplianceRing
                        label="Check-in"
                        valueText={`${checkPct}%`}
                        percentage={checkPct}
                        delta={checkDelta}
                        pathColor={checkPct >= 70 ? emeraldHex : checkPct >= 40 ? amberHex : redHex}
                        trailColor={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}
                        textColor={isDark ? '#fafafa' : '#111'}
                    />
                </div>
            </GlassCard>

            <GlassCard className="p-6 border-dashed border-border/50 dark:border-white/10 overflow-x-auto">
                <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-4">
                    Historial de actividad
                </h3>
                <div className="min-w-[780px] flex justify-center py-2">
                    <ActivityCalendar
                        data={calendarData}
                        blockSize={11}
                        blockMargin={3}
                        fontSize={11}
                        colorScheme={isDark ? 'dark' : 'light'}
                        theme={{
                            light: themeLight,
                            dark: themeDark,
                        }}
                        labels={{
                            months: [
                                'Ene',
                                'Feb',
                                'Mar',
                                'Abr',
                                'May',
                                'Jun',
                                'Jul',
                                'Ago',
                                'Sep',
                                'Oct',
                                'Nov',
                                'Dic',
                            ],
                            weekdays: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
                            legend: { less: 'Menos', more: 'Más' },
                            totalCount: `{{count}} días activos en {{year}}`,
                        }}
                    />
                </div>
            </GlassCard>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {kpiItems.map((item, i) => (
                    <motion.div
                        key={item.label}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05, duration: 0.25 }}
                    >
                        <GlassCard
                            className={cn(
                                'p-3 h-full border border-border/50 dark:border-white/10',
                                'hover:shadow-[0_0_24px_-8px_hsl(var(--primary)/0.35)] transition-shadow duration-300'
                            )}
                        >
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <item.icon className="w-3.5 h-3.5 text-primary shrink-0" />
                                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                                    {item.label}
                                </span>
                            </div>
                            <p className="text-xl font-black text-foreground">{item.value}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">{item.hint}</p>
                        </GlassCard>
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
    trailColor,
    textColor,
}: {
    label: string
    valueText: string
    percentage: number
    delta: number
    pathColor: string
    trailColor: string
    textColor: string
}) {
    return (
        <div className="flex flex-col items-center gap-3 w-full max-w-[200px]">
            <div style={{ width: ringSize, height: ringSize }}>
                <CircularProgressbar
                    value={percentage}
                    text={`${percentage}%`}
                    strokeWidth={8}
                    styles={buildStyles({
                        pathColor,
                        trailColor,
                        textColor,
                        textSize: '22px',
                    })}
                />
            </div>
            <div className="text-center space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {label}
                </p>
                <p className="text-lg font-black text-foreground">{valueText}</p>
                <p
                    className={cn(
                        'text-[10px] font-bold',
                        delta > 0 ? 'text-emerald-500' : delta < 0 ? 'text-rose-500' : 'text-muted-foreground'
                    )}
                >
                    {delta > 0 ? '↑' : delta < 0 ? '↓' : '—'} vs sem. anterior
                    {delta !== 0 ? ` (${delta > 0 ? '+' : ''}${delta} pts)` : ''}
                </p>
            </div>
        </div>
    )
}
