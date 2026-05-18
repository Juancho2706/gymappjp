'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import confetti from 'canvas-confetti'
import { useReducedMotion } from 'framer-motion'
import {
    ResponsiveContainer,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Radar,
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
} from 'recharts'
import { GlassCard } from '@/components/ui/glass-card'
import { cn } from '@/lib/utils'
import { Trophy, AlertTriangle, BarChart3, Target, Calendar, Clock, Dumbbell } from 'lucide-react'
import type { MuscleVolumeRow } from './profileDataHelpers'
import { DayNavigator } from '@/app/c/[coach_slug]/nutrition/_components/DayNavigator'
import { getClientWorkoutForDate, getClientWorkoutActivityDates } from './actions'
import { getTodayInSantiago } from '@/lib/date-utils'
import {
    findWeeklyWeightPRs,
    buildDailyTonnageSeries,
    detectVolumeImbalances,
    selectStrengthCardExercises,
    buildExerciseStrengthSeriesMap,
    type WeeklyWeightPR,
    type ExerciseStrengthSeries,
} from './profileTrainingAnalytics'
import { TrainingStrengthCards } from './TrainingStrengthCards'

type TrainingTabB4PanelsProps = {
    clientId: string
    santiagoTodayIso: string
    workoutHistory: any[]
    muscleVolumeByGroup: MuscleVolumeRow[]
    chartGridColor: string
    chartAxisColor: string
    tooltipBgColor: string
    tooltipBorderColor: string
    tooltipTextColor: string
}

function WeeklyPRBanner({ prs }: { prs: WeeklyWeightPR[] }) {
    const reduceMotion = useReducedMotion()
    const fired = useRef(false)

    useEffect(() => {
        if (prs.length === 0 || reduceMotion) return
        if (fired.current) return
        fired.current = true
        const t = window.setTimeout(() => {
            confetti({
                particleCount: 90,
                spread: 62,
                startVelocity: 28,
                origin: { y: 0.2, x: 0.5 },
                colors: ['#007AFF', '#10b981', '#f59e0b', '#a855f7', '#ffffff'],
            })
        }, 280)
        return () => window.clearTimeout(t)
    }, [prs.length, reduceMotion])

    if (prs.length === 0) return null

    const top = prs[0]!
    const more = prs.length - 1

    return (
        <div
            className={cn(
                'relative overflow-hidden rounded-2xl border border-amber-500/35 bg-gradient-to-r from-amber-500/15 via-primary/10 to-emerald-500/10',
                'px-5 py-4 shadow-[0_0_40px_-12px_rgba(245,158,11,0.45)]'
            )}
        >
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-400/20 blur-2xl pointer-events-none" />
            <div className="relative z-10 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <Trophy className="h-6 w-6 shrink-0" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Esta semana</span>
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-foreground leading-snug">
                        ¡Nuevo récord 1RM! — {top.exerciseName}:{' '}
                        <span className="text-primary tabular-nums">{top.newWeightKg} kg ×{top.newReps}</span>
                        <span className="ml-2 text-[10px] font-bold bg-primary/10 text-primary rounded px-1.5 py-0.5 tabular-nums">
                            1RM {top.newOneRm} kg
                        </span>
                    </p>
                    <p className="text-[11px] font-semibold text-muted-foreground mt-0.5">
                        Antes: {top.prevWeightKg} kg ×{top.prevReps} · 1RM {top.prevOneRm} kg
                        {top.pctChange != null && (
                            <span className="text-emerald-600 dark:text-emerald-400 ml-2">
                                (+{top.pctChange}% 1RM)
                            </span>
                        )}
                        {more > 0 && (
                            <span className="ml-2 text-foreground/80">
                                +{more} ejercicio{more === 1 ? '' : 's'} más
                            </span>
                        )}
                    </p>
                </div>
            </div>
        </div>
    )
}

export function TrainingTabB4Panels({
    clientId,
    santiagoTodayIso,
    workoutHistory,
    muscleVolumeByGroup,
    chartGridColor,
    chartAxisColor,
    tooltipBgColor,
    tooltipBorderColor,
    tooltipTextColor,
}: TrainingTabB4PanelsProps) {
    const [isPending, startTransition] = useTransition()
    const [historyDate, setHistoryDate] = useState(santiagoTodayIso)
    const [historyData, setHistoryData] = useState<Awaited<ReturnType<typeof getClientWorkoutForDate>>>([])
    const [historyLoaded, setHistoryLoaded] = useState(false)
    const [activityDates, setActivityDates] = useState<Set<string>>(new Set())
    const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null)

    useEffect(() => {
        getClientWorkoutActivityDates(clientId).then((dates) => setActivityDates(new Set(dates)))
    }, [clientId])

    const handleHistoryDateChange = (date: string) => {
        setHistoryDate(date)
        if (date === santiagoTodayIso) {
            setHistoryData([])
            setHistoryLoaded(false)
            return
        }
        startTransition(async () => {
            const data = await getClientWorkoutForDate(clientId, date)
            setHistoryData(data)
            setHistoryLoaded(true)
        })
    }
    const weeklyPRs = useMemo(
        () => findWeeklyWeightPRs(workoutHistory || [], new Date()),
        [workoutHistory]
    )

    const tonnageSeries = useMemo(
        () => buildDailyTonnageSeries(workoutHistory || [], 21),
        [workoutHistory]
    )

    const imbalances = useMemo(
        () => detectVolumeImbalances(muscleVolumeByGroup || [], 6, 2),
        [muscleVolumeByGroup]
    )

    const radarData = useMemo(() => {
        const rows = [...(muscleVolumeByGroup || [])]
            .filter((r) => r.volume > 0)
            .sort((a, b) => b.volume - a.volume)
            .slice(0, 8)
        const maxV = Math.max(...rows.map((r) => r.volume), 1)
        return rows.map((r) => ({
            subject:
                r.muscleGroup.length > 10
                    ? `${r.muscleGroup.slice(0, 9)}…`
                    : r.muscleGroup,
            fullName: r.muscleGroup,
            pct: Math.round((r.volume / maxV) * 100),
        }))
    }, [muscleVolumeByGroup])

    const hasRadar = radarData.length >= 3
    const hasBars = tonnageSeries.length > 0

    const strengthCards = useMemo(
        () => selectStrengthCardExercises(workoutHistory || [], 4),
        [workoutHistory]
    )

    const allExerciseSeries = useMemo(
        () => buildExerciseStrengthSeriesMap(workoutHistory || []),
        [workoutHistory]
    )

    const muscleGroupOptions = useMemo(() => {
        const counts = new Map<string, number>()
        for (const s of allExerciseSeries.values()) {
            const mg = s.muscleGroup
            if (mg && mg !== '—' && s.series.length > 0) {
                counts.set(mg, (counts.get(mg) ?? 0) + 1)
            }
        }
        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([group, count]) => ({ group, count }))
    }, [allExerciseSeries])

    const filteredStrengthExercises = useMemo((): ExerciseStrengthSeries[] => {
        if (!selectedMuscle) return strengthCards
        return [...allExerciseSeries.values()]
            .filter((s) => s.muscleGroup === selectedMuscle && s.series.length > 0)
            .sort((a, b) => b.totalVolume - a.totalVolume)
    }, [selectedMuscle, allExerciseSeries, strengthCards])

    const recentWorkoutDates = useMemo(
        () => [...activityDates].sort().slice(-10).reverse(),
        [activityDates]
    )

    const hasStrength = allExerciseSeries.size > 0

    if (!hasRadar && !hasBars && weeklyPRs.length === 0 && !hasStrength) {
        return null
    }

    return (
        <div className="space-y-6">
            <WeeklyPRBanner prs={weeklyPRs} />

            {hasStrength && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Dumbbell className="h-4 w-4 text-primary" />
                        <h3 className="text-xs font-black uppercase tracking-widest text-primary">
                            Fuerza — 1RM estimado (Epley)
                        </h3>
                    </div>

                    {muscleGroupOptions.length > 1 && (
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setSelectedMuscle(null)}
                                className={cn(
                                    'rounded-xl border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all',
                                    !selectedMuscle
                                        ? 'border-transparent text-white shadow-md'
                                        : 'border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/60 dark:hover:bg-white/10'
                                )}
                                style={!selectedMuscle ? { backgroundColor: 'var(--theme-primary)' } : {}}
                            >
                                Todos
                            </button>
                            {muscleGroupOptions.map(({ group, count }) => {
                                const isActive = selectedMuscle === group
                                return (
                                    <button
                                        key={group}
                                        type="button"
                                        onClick={() => setSelectedMuscle(isActive ? null : group)}
                                        className={cn(
                                            'rounded-xl border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all',
                                            isActive
                                                ? 'border-transparent text-white shadow-md'
                                                : 'border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/60 dark:hover:bg-white/10'
                                        )}
                                        style={isActive ? { backgroundColor: 'var(--theme-primary)' } : {}}
                                    >
                                        {group}
                                        <span className="ml-1 opacity-60">({count})</span>
                                    </button>
                                )
                            })}
                        </div>
                    )}

                    <TrainingStrengthCards
                        workoutHistory={workoutHistory || []}
                        exercises={filteredStrengthExercises}
                        chartGridColor={chartGridColor}
                        chartAxisColor={chartAxisColor}
                        tooltipBgColor={tooltipBgColor}
                        tooltipBorderColor={tooltipBorderColor}
                        tooltipTextColor={tooltipTextColor}
                        maxCards={selectedMuscle ? 20 : 4}
                    />
                </div>
            )}

            {(hasRadar || hasBars) && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {hasRadar && (
                        <GlassCard className="relative overflow-hidden border-dashed border-border/50 p-5 dark:border-white/10">
                            <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
                            <h3 className="relative z-10 mb-1 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary">
                                <Target className="h-4 w-4" /> Balance muscular (30d)
                            </h3>
                            <p className="relative z-10 mb-4 text-[10px] font-medium text-muted-foreground">
                                Volumen relativo por grupo (normalizado al máximo del periodo).
                            </p>
                            <div className="relative z-10 h-[280px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                                        <PolarGrid stroke={chartGridColor} />
                                        <PolarAngleAxis
                                            dataKey="subject"
                                            tick={{ fill: chartAxisColor, fontSize: 9 }}
                                        />
                                        <PolarRadiusAxis
                                            angle={30}
                                            domain={[0, 100]}
                                            tick={{ fill: chartAxisColor, fontSize: 9 }}
                                        />
                                        <Radar
                                            name="Volumen"
                                            dataKey="pct"
                                            stroke="var(--theme-primary, #007AFF)"
                                            fill="var(--theme-primary, #007AFF)"
                                            fillOpacity={0.35}
                                        />
                                        <Tooltip
                                            content={({ active, payload }) => {
                                                if (!active || !payload?.length) return null
                                                const row = payload[0]?.payload as {
                                                    fullName?: string
                                                    pct?: number
                                                }
                                                return (
                                                    <div
                                                        className="rounded-lg border px-3 py-2 text-[11px] font-semibold shadow-md"
                                                        style={{
                                                            backgroundColor: tooltipBgColor,
                                                            borderColor: tooltipBorderColor,
                                                            color: tooltipTextColor,
                                                        }}
                                                    >
                                                        <p className="font-black">{row.fullName}</p>
                                                        <p className="opacity-90 tabular-nums">
                                                            {row.pct}% del máximo del periodo
                                                        </p>
                                                    </div>
                                                )
                                            }}
                                        />
                                    </RadarChart>
                                </ResponsiveContainer>
                            </div>
                            {imbalances.length > 0 && (
                                <div className="relative z-10 mt-3 space-y-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5">
                                    {imbalances.slice(0, 2).map((im, i) => (
                                        <div
                                            key={`${im.weaker}-${i}`}
                                            className="flex gap-2 text-[11px] font-semibold text-amber-800 dark:text-amber-200/90"
                                        >
                                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                                            <span>
                                                Posible desequilibrio: <strong>{im.stronger}</strong> ~
                                                {im.ratio}× más volumen que <strong>{im.weaker}</strong>.
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </GlassCard>
                    )}

                    {hasBars && (
                        <GlassCard className="relative overflow-hidden border-dashed border-border/50 p-5 dark:border-white/10">
                            <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
                            <h3 className="relative z-10 mb-1 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary">
                                <BarChart3 className="h-4 w-4" /> Tonelaje por día
                            </h3>
                            <p className="relative z-10 mb-4 text-[10px] font-medium text-muted-foreground">
                                Σ (peso × reps) agrupado por fecha de registro.
                            </p>
                            <div className="relative z-10 h-[280px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={tonnageSeries} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                                        <XAxis
                                            dataKey="label"
                                            tick={{ fill: chartAxisColor, fontSize: 9 }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            tick={{ fill: chartAxisColor, fontSize: 9 }}
                                            axisLine={false}
                                            tickLine={false}
                                            tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                                        />
                                        <Tooltip
                                            content={({ active, payload }) => {
                                                if (!active || !payload?.length) return null
                                                const pt = payload[0]?.payload
                                                const v = Number(pt?.tonnage ?? 0)
                                                const avg = Number(pt?.movingAvg ?? 0)
                                                const label = String(pt?.label ?? '')
                                                return (
                                                    <div
                                                        className="rounded-lg border px-3 py-2 text-[11px] font-semibold shadow-md"
                                                        style={{
                                                            backgroundColor: tooltipBgColor,
                                                            borderColor: tooltipBorderColor,
                                                            color: tooltipTextColor,
                                                        }}
                                                    >
                                                        <p className="font-black mb-1">{label}</p>
                                                        <p className="tabular-nums opacity-90">
                                                            Tonelaje: {v.toLocaleString('es-ES')} kg·rep
                                                        </p>
                                                        <p className="tabular-nums opacity-70 text-[10px]">
                                                            Media 7 ses.: {avg.toLocaleString('es-ES')} kg·rep
                                                        </p>
                                                    </div>
                                                )
                                            }}
                                        />
                                        <Bar
                                            dataKey="tonnage"
                                            fill="var(--theme-primary, #007AFF)"
                                            radius={[4, 4, 0, 0]}
                                            opacity={0.7}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="movingAvg"
                                            stroke="var(--theme-primary, #007AFF)"
                                            strokeWidth={2}
                                            dot={false}
                                            strokeDasharray="4 3"
                                        />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </GlassCard>
                    )}
                </div>
            )}

            {/* ── Historial de entrenamientos ── */}
            <GlassCard className="relative overflow-hidden border-dashed border-border/50 dark:border-white/10 p-5 space-y-5">
                <div className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full blur-3xl pointer-events-none opacity-5"
                    style={{ backgroundColor: 'var(--theme-primary)' }} />

                {/* Header */}
                <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                            style={{ backgroundColor: 'color-mix(in srgb, var(--theme-primary) 12%, transparent)' }}
                        >
                            <Clock className="h-4 w-4" style={{ color: 'var(--theme-primary)' }} />
                        </div>
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--theme-primary)' }}>
                                Historial de entrenamientos
                            </h3>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mt-0.5">
                                {recentWorkoutDates.length > 0
                                    ? `Últimas ${recentWorkoutDates.length} sesiones registradas`
                                    : 'Sin sesiones aún'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Session tiles */}
                {recentWorkoutDates.length > 0 ? (
                    <div className="relative z-10 grid grid-cols-5 gap-2 sm:grid-cols-10">
                        {recentWorkoutDates.map((date) => {
                            const dt = new Date(date + 'T12:00:00')
                            const dayName = dt.toLocaleDateString('es-ES', { weekday: 'short' })
                            const dayNum = dt.toLocaleDateString('es-ES', { day: '2-digit' })
                            const month = dt.toLocaleDateString('es-ES', { month: 'short' })
                            const isSelected = historyDate === date
                            return (
                                <button
                                    key={date}
                                    type="button"
                                    onClick={() => handleHistoryDateChange(date)}
                                    className={cn(
                                        'flex flex-col items-center gap-0.5 rounded-xl border py-2.5 px-1 transition-all duration-200 active:scale-95',
                                        isSelected
                                            ? 'border-transparent text-white shadow-lg scale-105'
                                            : 'border-border/40 bg-muted/20 text-muted-foreground hover:border-primary/30 hover:bg-muted/50 dark:hover:bg-white/5'
                                    )}
                                    style={
                                        isSelected
                                            ? {
                                                backgroundColor: 'var(--theme-primary)',
                                                boxShadow: '0 4px 20px color-mix(in srgb, var(--theme-primary) 45%, transparent)',
                                            }
                                            : {}
                                    }
                                >
                                    <span className={cn('text-[8px] font-black uppercase tracking-widest capitalize leading-none', isSelected ? 'text-white/70' : 'text-muted-foreground/60')}>
                                        {dayName}
                                    </span>
                                    <span className={cn('text-base font-black tabular-nums leading-tight', isSelected ? 'text-white' : 'text-foreground')}>
                                        {dayNum}
                                    </span>
                                    <span className={cn('text-[8px] font-bold uppercase leading-none', isSelected ? 'text-white/70' : 'text-muted-foreground/60')}>
                                        {month}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                ) : (
                    <p className="relative z-10 py-6 text-center text-sm text-muted-foreground">
                        Sin sesiones registradas.
                    </p>
                )}

                {/* Date picker (búsqueda) */}
                <div className="relative z-10 space-y-2 border-t border-border/30 pt-4 dark:border-white/10">
                    <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">
                        <Calendar className="h-3 w-3" /> Buscar sesión por fecha
                    </p>
                    <DayNavigator
                        selectedDate={historyDate}
                        onDateChange={handleHistoryDateChange}
                        adherenceDates={activityDates}
                        isLoading={isPending}
                    />
                </div>

                {/* Session detail */}
                {historyDate !== santiagoTodayIso && (
                    <div className="relative z-10 border-t border-border/30 pt-4 dark:border-white/10">
                        {isPending && (
                            <p className="animate-pulse py-6 text-center text-sm text-muted-foreground">
                                Cargando sesión…
                            </p>
                        )}
                        {!isPending && historyLoaded && historyData.length === 0 && (
                            <p className="py-6 text-center text-sm text-muted-foreground">
                                Sin entrenamiento registrado para este día.
                            </p>
                        )}
                        {!isPending && historyData.length > 0 && (
                            <WorkoutDayReadOnly logs={historyData} />
                        )}
                    </div>
                )}
            </GlassCard>
        </div>
    )
}

// ── Sub-componente: vista de sesión de entrenamiento (solo lectura) ──────────
type WorkoutLog = Awaited<ReturnType<typeof getClientWorkoutForDate>>[number]

function WorkoutDayReadOnly({ logs }: { logs: WorkoutLog[] }) {
    const byExercise = new Map<string, { name: string; muscle: string; sets: WorkoutLog[] }>()

    for (const log of logs) {
        const block = (log as any).workout_blocks
        const exercise = block?.exercises
        const key = exercise?.name ?? 'Ejercicio'
        if (!byExercise.has(key)) {
            byExercise.set(key, {
                name: exercise?.name ?? 'Ejercicio',
                muscle: exercise?.muscle_group ?? '',
                sets: [],
            })
        }
        byExercise.get(key)!.sets.push(log)
    }

    const planTitle = (logs[0] as any)?.workout_blocks?.workout_plans?.title
    const exercises = [...byExercise.values()]
    const totalSets = logs.length
    const totalVolume = logs.reduce((s, l) => s + ((l.weight_kg ?? 0) * (l.reps_done ?? 0)), 0)

    return (
        <div className="space-y-3">
            {/* Session meta bar */}
            <div className="flex flex-wrap items-center gap-3">
                {planTitle && (
                    <span className="rounded-lg border border-border/50 bg-muted/30 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        {planTitle}
                    </span>
                )}
                <span className="rounded-lg border border-border/50 bg-muted/30 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {exercises.length} ejercicio{exercises.length !== 1 ? 's' : ''}
                </span>
                <span className="rounded-lg border border-border/50 bg-muted/30 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {totalSets} sets
                </span>
                {totalVolume > 0 && (
                    <span
                        className="rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest"
                        style={{
                            color: 'var(--theme-primary)',
                            borderColor: 'color-mix(in srgb, var(--theme-primary) 30%, transparent)',
                            backgroundColor: 'color-mix(in srgb, var(--theme-primary) 8%, transparent)',
                        }}
                    >
                        {Math.round(totalVolume).toLocaleString('es-ES')} kg·rep
                    </span>
                )}
            </div>

            {/* Exercise list */}
            <div className="space-y-2">
                {exercises.map(({ name, muscle, sets }, exIdx) => {
                    const sortedSets = [...sets].sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0))
                    return (
                        <div
                            key={name}
                            className="overflow-hidden rounded-xl border border-border/40 bg-muted/10 dark:border-white/8"
                        >
                            <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-border/30 dark:border-white/5">
                                <div className="flex items-center gap-2 min-w-0">
                                    <div
                                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[9px] font-black text-white"
                                        style={{ backgroundColor: 'var(--theme-primary)' }}
                                    >
                                        {exIdx + 1}
                                    </div>
                                    <p className="text-xs font-black uppercase tracking-tight truncate">{name}</p>
                                </div>
                                {muscle && (
                                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">
                                        {muscle}
                                    </span>
                                )}
                            </div>
                            <div className="px-3 py-2 space-y-1">
                                {sortedSets.map((s, i) => (
                                    <div key={i} className="flex items-center gap-3 text-[11px]">
                                        <span className="w-6 shrink-0 font-black tabular-nums text-muted-foreground/50 text-[10px]">
                                            #{s.set_number ?? i + 1}
                                        </span>
                                        <span className="font-black tabular-nums text-foreground">
                                            {s.weight_kg ?? '—'}
                                            <span className="text-muted-foreground font-bold"> kg</span>
                                        </span>
                                        <span className="text-muted-foreground font-bold">×</span>
                                        <span className="font-black tabular-nums text-foreground">
                                            {s.reps_done ?? '—'}
                                            <span className="text-muted-foreground font-bold"> reps</span>
                                        </span>
                                        {s.rpe != null && (
                                            <span className="ml-auto rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                                RPE {s.rpe}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
