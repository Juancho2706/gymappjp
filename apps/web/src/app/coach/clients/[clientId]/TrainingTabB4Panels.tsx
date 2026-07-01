'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import confetti from 'canvas-confetti'
import { useReducedMotion } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
    Trophy,
    AlertTriangle,
    BarChart3,
    Target,
    CalendarSearch,
    Clock,
    Dumbbell,
    Moon,
} from 'lucide-react'
import type { MuscleVolumeRow } from './profileDataHelpers'
import { getClientWorkoutForDate, getClientWorkoutActivityDates } from './_actions/client-detail.actions'
import {
    findWeeklyWeightPRs,
    buildDailyTonnageSeries,
    detectVolumeImbalances,
    selectStrengthCardExercises,
    buildExerciseStrengthSeriesMap,
    strengthTrendDeltaKg,
    type WeeklyWeightPR,
    type ExerciseStrengthSeries,
} from './profileTrainingAnalytics'

type TrainingTabB4PanelsProps = {
    clientId: string
    santiagoTodayIso: string
    workoutHistory: any[]
    muscleVolumeByGroup: MuscleVolumeRow[]
    // Chart-color props del padre (recharts en otras pestañas). Esta pestaña dibuja sus
    // charts con SVG/CSS inline (tokens semánticos que siguen el tema) → no se usan aquí.
    chartGridColor: string
    chartAxisColor: string
    tooltipBgColor: string
    tooltipBorderColor: string
    tooltipTextColor: string
}

// ── Título de sección (dark) ─────────────────────────────────────────────────
function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <h3 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-sport-600">
            {icon}
            {children}
        </h3>
    )
}

// ── Banner PR de la semana (gradient claro · acento celebratorio) ─────────────
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
        <Card
            padding="md"
            className="gap-0 border-[var(--ember-200)]"
            style={{ background: 'linear-gradient(135deg, var(--ember-100), var(--sport-100))' }}
        >
            <div className="mb-2 flex items-center gap-2.5 text-[var(--ember-700)]">
                <Trophy className="h-5 w-5 shrink-0" />
                <span className="text-[13px] font-black uppercase tracking-[0.02em]">
                    Récord de la semana
                </span>
            </div>
            <div className="flex flex-wrap items-baseline gap-2.5">
                <span className="text-base font-black text-strong">{top.exerciseName}</span>
                <span className="font-display text-xl font-black tabular-nums text-strong">
                    {top.newWeightKg} kg × {top.newReps}
                </span>
                {top.pctChange != null && (
                    <Badge tone="success" size="sm">
                        +{top.pctChange}% 1RM
                    </Badge>
                )}
            </div>
            <p className="mt-1 text-xs font-semibold text-muted">
                Antes: {top.prevWeightKg} kg × {top.prevReps} · e1RM {top.prevOneRm} → {top.newOneRm} kg
                {more > 0 && ` · +${more} ejercicio${more === 1 ? '' : 's'} más`}
            </p>
        </Card>
    )
}

// ── Tarjeta 1RM por ejercicio (área Epley SVG, dark) ──────────────────────────
function StrengthSparkCard({ ex }: { ex: ExerciseStrengthSeries }) {
    const pts = ex.series.map((p) => p.oneRm)
    const n = pts.length
    const mn = Math.min(...pts)
    const mx = Math.max(...pts)
    const span = mx - mn || 1
    const maxIdx = pts.indexOf(mx)
    const xy = pts.map(
        (v, i) => [n > 1 ? (i / (n - 1)) * 100 : 50, 100 - ((v - mn) / span) * 76 - 8] as [number, number]
    )
    const line = xy.map((p) => p.join(',')).join(' ')
    const area = `0,100 ${line} 100,100`
    const delta = strengthTrendDeltaKg(ex.series)
    const latest = ex.series[n - 1]!
    const peak = xy[maxIdx]!

    return (
        <Card padding="md" className="gap-0">
            <div className="truncate text-[13px] font-bold leading-tight text-strong">{ex.exerciseName}</div>
            <div className="mb-1.5 text-[11px] text-muted">{ex.muscleGroup}</div>
            <div className="flex items-baseline gap-1.5">
                <span className="font-display text-xl font-black tabular-nums text-strong">{latest.oneRm}</span>
                <span className="text-[10.5px] text-muted">kg 1RM</span>
            </div>
            <div
                className="mb-1.5 text-[11px] font-bold"
                style={{ color: delta == null ? 'var(--text-muted)' : delta >= 0 ? 'var(--success-600)' : 'var(--danger-600)' }}
            >
                {delta == null
                    ? 'Sin cambio en el periodo'
                    : `${delta >= 0 ? '+' : ''}${delta} kg período`}
            </div>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="block h-[46px] w-full">
                <polygon points={area} fill="var(--sport-500)" opacity={0.16} />
                {n > 1 && (
                    <polyline
                        points={line}
                        fill="none"
                        stroke="var(--sport-500)"
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                )}
                <circle cx={peak[0]} cy={peak[1]} r={2.6} fill="var(--ember-500)" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="mt-1 text-[10px] text-muted">
                Última: {latest.weightKg} kg × {latest.reps}
            </div>
        </Card>
    )
}

// ── Radar de balance muscular (SVG, dark) ─────────────────────────────────────
function DarkRadar({ data }: { data: { label: string; v: number }[] }) {
    const n = data.length
    const cx = 50
    const cy = 50
    const R = 38
    const pt = (i: number, r: number): [number, number] => {
        const ang = (Math.PI * 2 * i) / n - Math.PI / 2
        return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]
    }
    const rings = [0.25, 0.5, 0.75, 1]
    const poly = data.map((d, i) => pt(i, (R * d.v) / 100).join(',')).join(' ')

    return (
        <svg viewBox="0 0 100 100" className="mx-auto block h-auto w-full max-w-[280px] overflow-visible">
            {rings.map((r, ri) => (
                <polygon
                    key={ri}
                    points={data.map((_, i) => pt(i, R * r).join(',')).join(' ')}
                    fill="none"
                    stroke="var(--border-subtle)"
                    strokeWidth={0.5}
                    vectorEffect="non-scaling-stroke"
                />
            ))}
            {data.map((_, i) => {
                const [x, y] = pt(i, R)
                return (
                    <line
                        key={i}
                        x1={cx}
                        y1={cy}
                        x2={x}
                        y2={y}
                        stroke="var(--border-subtle)"
                        strokeWidth={0.5}
                        vectorEffect="non-scaling-stroke"
                    />
                )
            })}
            <polygon points={poly} fill="var(--sport-500)" opacity={0.2} />
            <polygon
                points={poly}
                fill="none"
                stroke="var(--sport-500)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
            />
            {data.map((d, i) => {
                const [x, y] = pt(i, R + 7)
                return (
                    <text
                        key={i}
                        x={x}
                        y={y}
                        fontSize={4.4}
                        fill="var(--text-muted)"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        style={{ fontWeight: 700 }}
                    >
                        {d.label}
                    </text>
                )
            })}
        </svg>
    )
}

export function TrainingTabB4Panels({
    clientId,
    santiagoTodayIso,
    workoutHistory,
    muscleVolumeByGroup,
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
        if (!date || date === santiagoTodayIso) {
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
            label: r.muscleGroup.length > 10 ? `${r.muscleGroup.slice(0, 9)}…` : r.muscleGroup,
            v: Math.round((r.volume / maxV) * 100),
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

    const totalStrengthExercises = useMemo(
        () => [...allExerciseSeries.values()].filter((s) => s.series.length > 0).length,
        [allExerciseSeries]
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

    // ── Tonelaje: últimas 7 sesiones (Σ peso×reps por día) ────────────────────
    const tonnageBars = useMemo(() => tonnageSeries.slice(-7), [tonnageSeries])
    const tonnageMax = useMemo(() => Math.max(...tonnageBars.map((p) => p.tonnage), 1), [tonnageBars])
    const tonnageAvg = useMemo(() => {
        if (tonnageBars.length === 0) return 0
        return Math.round(tonnageBars.reduce((s, p) => s + p.tonnage, 0) / tonnageBars.length)
    }, [tonnageBars])
    const DOW_INITIALS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

    if (!hasRadar && !hasBars && weeklyPRs.length === 0 && !hasStrength) {
        return null
    }

    return (
        <div className="space-y-5">
            {/* ── Banner PR de la semana ── */}
            <WeeklyPRBanner prs={weeklyPRs} />

            {/* ── Fuerza — 1RM estimado (Epley) ── */}
            {hasStrength && (
                <div>
                    <SectionTitle icon={<Dumbbell className="h-4 w-4" />}>
                        Fuerza — 1RM estimado (Epley)
                    </SectionTitle>

                    {muscleGroupOptions.length > 1 && (
                        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
                            <button
                                type="button"
                                onClick={() => setSelectedMuscle(null)}
                                className={cn(
                                    'h-8 shrink-0 rounded-pill border-[1.5px] px-3 text-[12.5px] font-bold transition-colors',
                                    !selectedMuscle
                                        ? 'border-sport-500 bg-sport-500 text-white'
                                        : 'border-[var(--border-subtle)] bg-surface-sunken text-muted hover:text-strong'
                                )}
                            >
                                Todos · {totalStrengthExercises}
                            </button>
                            {muscleGroupOptions.map(({ group, count }) => {
                                const isActive = selectedMuscle === group
                                return (
                                    <button
                                        key={group}
                                        type="button"
                                        onClick={() => setSelectedMuscle(isActive ? null : group)}
                                        className={cn(
                                            'h-8 shrink-0 rounded-pill border-[1.5px] px-3 text-[12.5px] font-bold transition-colors',
                                            isActive
                                                ? 'border-sport-500 bg-sport-500 text-white'
                                                : 'border-[var(--border-subtle)] bg-surface-sunken text-muted hover:text-strong'
                                        )}
                                    >
                                        {group} · {count}
                                    </button>
                                )
                            })}
                        </div>
                    )}

                    {filteredStrengthExercises.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-4">
                            {filteredStrengthExercises.map((ex) => (
                                <StrengthSparkCard key={ex.exerciseId} ex={ex} />
                            ))}
                        </div>
                    ) : (
                        <Card padding="md">
                            <p className="text-center text-[13px] text-muted">
                                Sin series de fuerza para este grupo.
                            </p>
                        </Card>
                    )}
                </div>
            )}

            {/* ── Balance muscular + Tonelaje ── */}
            {(hasRadar || hasBars) && (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    {hasRadar && (
                        <Card padding="md">
                            <SectionTitle icon={<Target className="h-4 w-4" />}>
                                Balance muscular · 30 días
                            </SectionTitle>
                            <DarkRadar data={radarData} />
                            {imbalances.length > 0 && (
                                <div
                                    className="mt-2.5 flex items-center gap-2"
                                    style={{
                                        padding: '9px 11px',
                                        borderRadius: 'var(--radius-md)',
                                        background: 'var(--warning-100)',
                                    }}
                                >
                                    <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--warning-600)]" />
                                    <span className="text-xs font-semibold text-[var(--warning-700)]">
                                        Posible desequilibrio: {imbalances[0]!.stronger} ~{imbalances[0]!.ratio}× más
                                        volumen que {imbalances[0]!.weaker}
                                    </span>
                                </div>
                            )}
                        </Card>
                    )}

                    {hasBars && (
                        <Card padding="md">
                            <SectionTitle icon={<BarChart3 className="h-4 w-4" />}>
                                Tonelaje por sesión · 7 días
                            </SectionTitle>
                            <div className="relative h-[90px]">
                                <div
                                    className="absolute left-0 right-0 z-[1] h-0"
                                    style={{
                                        top: `${100 - (tonnageAvg / tonnageMax) * 100}%`,
                                        borderTop: '1.5px dashed var(--text-muted)',
                                    }}
                                />
                                <div className="flex h-full items-end gap-2">
                                    {tonnageBars.map((p, i) => {
                                        const dt = new Date(p.dateKey + 'T12:00:00')
                                        const isLast = i === tonnageBars.length - 1
                                        return (
                                            <div
                                                key={p.dateKey}
                                                className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                                                title={`${p.label} · ${p.tonnage.toLocaleString('es-ES')} kg·rep`}
                                            >
                                                <div
                                                    className="w-full"
                                                    style={{
                                                        height: `${Math.max(2, (p.tonnage / tonnageMax) * 100)}%`,
                                                        background: isLast
                                                            ? 'var(--sport-500)'
                                                            : 'var(--border-default)',
                                                        borderRadius: 'var(--radius-xs)',
                                                    }}
                                                />
                                                <span className="text-[10px] font-bold text-muted">
                                                    {DOW_INITIALS[dt.getDay()]}
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
                                <span className="w-3.5" style={{ borderTop: '1.5px dashed var(--text-muted)' }} />
                                Media móvil 7 ses.
                            </div>
                        </Card>
                    )}
                </div>
            )}

            {/* ── Historial de sesiones + navegador ── */}
            <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                    <SectionTitle icon={<Clock className="h-4 w-4" />}>Historial de sesiones</SectionTitle>
                    <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-muted">
                        <CalendarSearch className="h-[15px] w-[15px]" />
                        <input
                            type="date"
                            value={historyDate !== santiagoTodayIso ? historyDate : ''}
                            onChange={(e) => handleHistoryDateChange(e.target.value || santiagoTodayIso)}
                            style={{
                                height: 32,
                                padding: '0 8px',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-subtle)',
                                background: 'var(--surface-card)',
                                color: 'var(--text-strong)',
                                fontSize: 12,
                                outline: 'none',
                            }}
                        />
                    </label>
                </div>

                {/* Pills de sesiones recientes */}
                {recentWorkoutDates.length > 0 ? (
                    <div className="mb-3 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
                        {recentWorkoutDates.map((date) => {
                            const dt = new Date(date + 'T12:00:00')
                            const dayNum = dt.toLocaleDateString('es-ES', { day: '2-digit' })
                            const month = dt.toLocaleDateString('es-ES', { month: 'short' })
                            const isSelected = historyDate === date
                            return (
                                <button
                                    key={date}
                                    type="button"
                                    onClick={() => handleHistoryDateChange(date)}
                                    className={cn(
                                        'flex w-[58px] shrink-0 flex-col items-center gap-0.5 rounded-[var(--radius-md)] border-[1.5px] py-2 transition-colors',
                                        isSelected
                                            ? 'border-sport-500 bg-sport-100'
                                            : 'border-[var(--border-subtle)] bg-surface-sunken hover:border-sport-400'
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'font-display text-base font-black leading-none tabular-nums',
                                            isSelected ? 'text-sport-700' : 'text-strong'
                                        )}
                                    >
                                        {dayNum}
                                    </span>
                                    <span
                                        className={cn(
                                            'text-[9.5px] uppercase leading-none',
                                            isSelected ? 'text-sport-700' : 'text-muted'
                                        )}
                                    >
                                        {month}
                                    </span>
                                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--success-500)]" />
                                </button>
                            )
                        })}
                    </div>
                ) : (
                    <Card padding="md" className="mb-3">
                        <p className="text-center text-[13px] text-muted">Sin sesiones registradas aún.</p>
                    </Card>
                )}

                {/* Detalle de sesión / empty-state */}
                {historyDate !== santiagoTodayIso && (
                    <>
                        {isPending && (
                            <Card padding="lg">
                                <p className="animate-pulse text-center text-[13px] text-muted">
                                    Cargando sesión…
                                </p>
                            </Card>
                        )}
                        {!isPending && historyLoaded && historyData.length === 0 && (
                            <Card padding="lg" className="items-center text-center">
                                <Moon className="mb-1.5 h-6 w-6 text-muted opacity-70" />
                                <p className="text-[13.5px] text-muted">
                                    Sin entrenamiento registrado para este día
                                </p>
                            </Card>
                        )}
                        {!isPending && historyData.length > 0 && <WorkoutDayReadOnly logs={historyData} />}
                    </>
                )}
            </div>
        </div>
    )
}

// ── Sub-componente: vista de sesión de entrenamiento (solo lectura, theme-aware) ─
type WorkoutLog = Awaited<ReturnType<typeof getClientWorkoutForDate>>[number]

/** Traduce el modo de progresión del bloque a etiqueta legible + valor. */
function progressionLabel(mode?: string | null, value?: number | null): string | null {
    switch (mode) {
        case 'weekly_linear':
            return value != null ? `Lineal +${value}/sem` : 'Lineal'
        case 'double':
            return 'Doble progresión'
        default:
            return null
    }
}

/** Peso prescrito para la serie: preferir el congelado al momento del log, fallback al bloque. */
function targetWeightForSet(s: WorkoutLog): number | null {
    const frozen = (s as any).target_weight_at_log as number | null | undefined
    if (frozen != null) return frozen
    const blockTarget = (s as any).workout_blocks?.target_weight_kg as number | null | undefined
    return blockTarget ?? null
}

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

    return (
        <Card padding="md" className="gap-0">
            <div className="mb-2.5 flex items-baseline justify-between gap-3">
                <div className="text-[14.5px] font-black text-strong">{planTitle || 'Sesión'}</div>
                <div className="shrink-0 text-[11.5px] text-muted">
                    {exercises.length} ej. · {totalSets} sets
                </div>
            </div>

            <div className="space-y-3">
                {exercises.map(({ name, muscle, sets }) => {
                    const sortedSets = [...sets].sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0))
                    // Prescripción/progresión: propiedad del BLOQUE → leer una sola vez por ejercicio.
                    const block = (sortedSets[0] as any)?.workout_blocks
                    const prog = progressionLabel(block?.progression_mode, block?.progression_value)
                    const metaWeight = block?.target_weight_kg as number | null | undefined
                    const metaReps = block?.reps as string | null | undefined
                    const metaSets = block?.sets as number | null | undefined
                    const metaRir = block?.rir as string | null | undefined
                    const metaTempo = block?.tempo as string | null | undefined
                    const metaParts = [
                        metaWeight != null ? `${metaWeight}kg` : null,
                        metaReps ? `×${metaReps}` : null,
                        metaSets != null ? `· ${metaSets} series` : null,
                        metaRir ? `· RIR ${metaRir}` : null,
                        metaTempo ? `· tempo ${metaTempo}` : null,
                    ].filter(Boolean)
                    return (
                        <div key={name}>
                            <div className="mb-1 flex items-center gap-2">
                                <span className="text-[13px] font-bold text-strong">{name}</span>
                                {muscle && <span className="text-[11px] text-muted">{muscle}</span>}
                            </div>
                            {/* Micro-línea de prescripción + progresión (una vez por ejercicio) */}
                            {(metaParts.length > 0 || prog) && (
                                <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px]">
                                    {metaParts.length > 0 && (
                                        <span className="text-muted">
                                            <span className="uppercase tracking-widest text-[9px]">Meta</span>{' '}
                                            {metaParts.join(' ')}
                                        </span>
                                    )}
                                    {prog && (
                                        <span className="rounded-[var(--radius-xs)] border border-subtle bg-surface-sunken px-1.5 py-[1px] text-muted">
                                            {prog}
                                        </span>
                                    )}
                                </div>
                            )}
                            <div className="flex flex-wrap gap-1.5">
                                {sortedSets.map((s, si) => {
                                    const target = targetWeightForSet(s)
                                    const done = s.weight_kg
                                    const cmp =
                                        target != null && done != null
                                            ? done > target
                                                ? 'over'
                                                : done < target
                                                  ? 'under'
                                                  : 'eq'
                                            : null
                                    const weightClass =
                                        cmp === 'over'
                                            ? 'text-[var(--success-600)]'
                                            : cmp === 'under'
                                              ? 'text-[var(--warning-600)]'
                                              : 'text-strong'
                                    return (
                                        <span
                                            key={si}
                                            className="rounded-[var(--radius-xs)] border border-subtle bg-surface-sunken px-1.5 py-[3px] text-[11.5px] text-strong"
                                            style={{ fontFamily: 'var(--font-mono)' }}
                                        >
                                            {s.set_number ?? si + 1}:{' '}
                                            <span className={cmp ? weightClass : undefined}>
                                                {done != null ? `${done}kg` : 'PC'}
                                            </span>{' '}
                                            × {s.reps_done ?? '—'}
                                            {s.rpe != null ? ` · RPE ${s.rpe}` : ''}
                                            {s.rir != null ? ` · RIR ${s.rir}` : ''}
                                        </span>
                                    )
                                })}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Explicabilidad inline: leyenda de la jerga */}
            <p className="mt-2.5 border-t border-subtle pt-2 text-[10px] leading-relaxed text-muted">
                <span className="text-strong">Meta</span> = prescrito · color del peso: los que{' '}
                <span className="text-[var(--success-600)]">superan</span> /{' '}
                <span className="text-[var(--warning-600)]">no alcanzan</span> la meta.{' '}
                <span className="text-strong">RPE</span> = esfuerzo percibido 6-10 (10 = al fallo).{' '}
                <span className="text-strong">RIR</span> = reps en reserva (0 = al fallo).
            </p>
        </Card>
    )
}
