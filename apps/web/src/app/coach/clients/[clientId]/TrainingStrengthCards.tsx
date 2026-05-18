'use client'

import { useMemo } from 'react'
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    ResponsiveContainer,
    Tooltip,
    ReferenceDot,
    CartesianGrid,
} from 'recharts'
import { GlassCard } from '@/components/ui/glass-card'
import { Dumbbell, TrendingDown, TrendingUp, Minus, Star } from 'lucide-react'
import {
    selectStrengthCardExercises,
    strengthTrendDeltaKg,
    maxOneRMIndex,
    type ExerciseStrengthSeries,
} from './profileTrainingAnalytics'

type TrainingStrengthCardsProps = {
    workoutHistory: any[]
    /** Si viene del padre, evita recalcular. */
    exercises?: ExerciseStrengthSeries[]
    chartGridColor: string
    chartAxisColor: string
    tooltipBgColor: string
    tooltipBorderColor: string
    tooltipTextColor: string
    maxCards?: number
}

function StrengthExerciseCard({
    data,
    gradientKey,
    chartGridColor,
    chartAxisColor,
    tooltipBgColor,
    tooltipBorderColor,
    tooltipTextColor,
}: {
    data: ExerciseStrengthSeries
    gradientKey: string
    chartGridColor: string
    chartAxisColor: string
    tooltipBgColor: string
    tooltipBorderColor: string
    tooltipTextColor: string
}) {
    const { series, exerciseName, muscleGroup } = data
    const latest = series[series.length - 1]!
    const delta = strengthTrendDeltaKg(series)
    const maxIdx = maxOneRMIndex(series)
    const maxPoint = series[maxIdx]!
    const gradId = `str-grad-${gradientKey}`

    return (
        <GlassCard className="relative flex flex-col overflow-hidden border-dashed border-border/50 p-5 dark:border-white/10">
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
            <div className="relative z-10 mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-xs font-black uppercase tracking-tight text-foreground leading-tight line-clamp-2">
                        {exerciseName}
                    </h3>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                        {muscleGroup}
                    </p>
                </div>
                <Dumbbell className="h-4 w-4 shrink-0 text-primary opacity-80" />
            </div>

            <div className="relative z-10 mb-1 flex flex-wrap items-end gap-2">
                <span className="text-2xl font-black tabular-nums text-foreground">
                    {latest.oneRm}
                    <span className="ml-1 text-xs font-bold text-muted-foreground">kg</span>
                </span>
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground pb-1">
                    1RM est.
                </span>
            </div>

            <div className="relative z-10 mb-4 flex items-center gap-1.5 text-[11px] font-bold">
                {delta == null || delta === 0 ? (
                    <span className="flex items-center gap-1 text-muted-foreground">
                        <Minus className="h-3.5 w-3.5" /> Sin cambio en el periodo
                    </span>
                ) : delta > 0 ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <TrendingUp className="h-3.5 w-3.5" /> +{delta} kg en el periodo
                    </span>
                ) : (
                    <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                        <TrendingDown className="h-3.5 w-3.5" /> {delta} kg en el periodo
                    </span>
                )}
            </div>

            <div className="relative z-10 mb-3 h-[140px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                        <defs>
                            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--theme-primary, #007AFF)" stopOpacity={0.45} />
                                <stop offset="100%" stopColor="var(--theme-primary, #007AFF)" stopOpacity={0.02} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                        <XAxis
                            dataKey="dateKey"
                            tick={{ fill: chartAxisColor, fontSize: 8 }}
                            tickFormatter={(d: string) => d.slice(8, 10) + '/' + d.slice(5, 7)}
                            axisLine={false}
                            tickLine={false}
                            interval="preserveStartEnd"
                        />
                        <YAxis
                            domain={['auto', 'auto']}
                            tick={{ fill: chartAxisColor, fontSize: 9 }}
                            axisLine={false}
                            tickLine={false}
                            width={36}
                        />
                        <Tooltip
                            content={({ active, payload }) => {
                                if (!active || !payload?.length) return null
                                const p = payload[0]?.payload as ExerciseStrengthSeries['series'][0]
                                return (
                                    <div
                                        className="rounded-lg border px-2.5 py-2 text-[10px] font-semibold shadow-md"
                                        style={{
                                            backgroundColor: tooltipBgColor,
                                            borderColor: tooltipBorderColor,
                                            color: tooltipTextColor,
                                        }}
                                    >
                                        <p className="font-black">{p.label}</p>
                                        <p className="tabular-nums">1RM est. {p.oneRm} kg</p>
                                        <p className="opacity-80">
                                            Serie: {p.weightKg} kg × {p.reps}
                                        </p>
                                    </div>
                                )
                            }}
                        />
                        <Area
                            type="monotone"
                            dataKey="oneRm"
                            stroke="var(--theme-primary, #007AFF)"
                            strokeWidth={2}
                            fill={`url(#${gradId})`}
                            dot={false}
                            activeDot={{ r: 4 }}
                        />
                        <ReferenceDot
                            x={maxPoint.dateKey}
                            y={maxPoint.oneRm}
                            r={5}
                            fill="#f59e0b"
                            stroke="#fff"
                            strokeWidth={2}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            <div className="relative z-10 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/40 pt-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground dark:border-white/10">
                <span className="inline-flex items-center gap-1 text-foreground/90 normal-case font-semibold tracking-normal">
                    <Star className="h-3 w-3 text-amber-500" />
                    Pico {maxPoint.oneRm} kg ({maxPoint.label})
                </span>
                <span>
                    Última: {latest.weightKg} kg × {latest.reps}
                </span>
            </div>
        </GlassCard>
    )
}

export function TrainingStrengthCards({
    workoutHistory,
    exercises: exercisesProp,
    chartGridColor,
    chartAxisColor,
    tooltipBgColor,
    tooltipBorderColor,
    tooltipTextColor,
    maxCards = 4,
}: TrainingStrengthCardsProps) {
    const exercises = useMemo(
        () =>
            exercisesProp !== undefined
                ? exercisesProp
                : selectStrengthCardExercises(workoutHistory || [], maxCards),
        [exercisesProp, workoutHistory, maxCards]
    )

    if (exercises.length === 0) return null

    return (
        <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary">
                <Dumbbell className="h-4 w-4" /> Fuerza — 1RM estimado (Epley)
            </h3>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {exercises.map((ex, i) => (
                    <StrengthExerciseCard
                        key={ex.exerciseId}
                        gradientKey={String(i)}
                        data={ex}
                        chartGridColor={chartGridColor}
                        chartAxisColor={chartAxisColor}
                        tooltipBgColor={tooltipBgColor}
                        tooltipBorderColor={tooltipBorderColor}
                        tooltipTextColor={tooltipTextColor}
                    />
                ))}
            </div>
        </div>
    )
}
