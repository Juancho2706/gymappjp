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
import { Trophy, AlertTriangle, BarChart3, Target, Calendar } from 'lucide-react'
import type { MuscleVolumeRow } from './profileDataHelpers'
import { DayNavigator } from '@/app/c/[coach_slug]/nutrition/_components/DayNavigator'
import { getClientWorkoutForDate, getClientWorkoutActivityDates } from './actions'
import { getTodayInSantiago } from '@/lib/date-utils'
import {
    findWeeklyWeightPRs,
    buildDailyTonnageSeries,
    detectVolumeImbalances,
    selectStrengthCardExercises,
    type WeeklyWeightPR,
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
                        ¡Nuevo récord de peso! — {top.exerciseName}:{' '}
                        <span className="text-primary tabular-nums">{top.newWeightKg} kg</span>
                        {top.newReps > 0 && (
                            <span className="text-muted-foreground font-bold text-xs">
                                {' '}
                                ×{top.newReps}
                            </span>
                        )}
                    </p>
                    <p className="text-[11px] font-semibold text-muted-foreground mt-0.5">
                        Antes: {top.prevWeightKg} kg
                        {top.prevReps > 0 ? ` ×${top.prevReps}` : ''}
                        {top.pctChange != null && (
                            <span className="text-emerald-600 dark:text-emerald-400 ml-2">
                                (+{top.pctChange}%)
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
    const hasStrength = strengthCards.length > 0

    if (!hasRadar && !hasBars && weeklyPRs.length === 0 && !hasStrength) {
        return null
    }

    return (
        <div className="space-y-6">
            <WeeklyPRBanner prs={weeklyPRs} />

            {hasStrength && (
                <TrainingStrengthCards
                    workoutHistory={workoutHistory || []}
                    exercises={strengthCards}
                    chartGridColor={chartGridColor}
                    chartAxisColor={chartAxisColor}
                    tooltipBgColor={tooltipBgColor}
                    tooltipBorderColor={tooltipBorderColor}
                    tooltipTextColor={tooltipTextColor}
                    maxCards={4}
                />
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

            {/* ── Historial por fecha ── */}
            <GlassCard className="p-4 space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" /> Ver sesión por fecha
                </h3>
                <DayNavigator
                    selectedDate={historyDate}
                    onDateChange={handleHistoryDateChange}
                    adherenceDates={activityDates}
                    isLoading={isPending}
                />
                {historyDate !== santiagoTodayIso && (
                    <div className="pt-1">
                        {isPending && (
                            <p className="text-sm text-muted-foreground text-center py-6 animate-pulse">Cargando…</p>
                        )}
                        {!isPending && historyLoaded && historyData.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-6">
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
    // Agrupar sets por ejercicio
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

    return (
        <div className="space-y-3">
            {planTitle && (
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                    Plan: {planTitle}
                </p>
            )}
            {[...byExercise.values()].map(({ name, muscle, sets }) => (
                <div key={name} className="rounded-xl border border-border/40 bg-muted/10 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-black">{name}</p>
                        {muscle && (
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                                {muscle}
                            </span>
                        )}
                    </div>
                    <ul className="space-y-0.5">
                        {sets
                            .sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0))
                            .map((s, i) => (
                                <li key={i} className="text-[11px] font-mono text-muted-foreground">
                                    #{s.set_number ?? i + 1} · {s.weight_kg ?? '—'} kg × {s.reps_done ?? '—'} reps
                                    {s.rpe != null ? ` · RPE ${s.rpe}` : ''}
                                </li>
                            ))}
                    </ul>
                </div>
            ))}
        </div>
    )
}
