'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import Image from 'next/image'
import { format, subDays } from 'date-fns'
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    RadialBarChart,
    RadialBar,
    PolarAngleAxis,
} from 'recharts'
import { GlassCard } from '@/components/ui/glass-card'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { PhotoComparisonSlider } from '@/components/coach/PhotoComparisonSlider'
import { cn } from '@/lib/utils'
import {
    avgEnergySince,
    bmiCategory,
    bmiFromMetric,
    energyColor,
    linearRegressionKgPerDay,
} from './profileBodyCompositionUtils'
import { Scale, TrendingDown, TrendingUp, Minus, Camera, ArrowRightLeft } from 'lucide-react'

export type BodyCompCheckInRow = {
    id: string
    created_at: string
    weight?: number | null
    energy_level?: number | null
    notes?: string | null
    front_photo_url?: string | null
}

type ProgressBodyCompositionB6Props = {
    checkIns: BodyCompCheckInRow[]
    heightCm: number | null | undefined
    chartGridColor: string
    chartAxisColor: string
    tooltipBgColor: string
    tooltipBorderColor: string
    tooltipTextColor: string
}

function EnergyStars({ level }: { level: number | null | undefined }) {
    const stars = Math.min(5, Math.max(0, Math.round((level ?? 0) / 2)))
    return (
        <span className="inline-flex gap-0.5" aria-label={`Energía ${level ?? 0} de 10`}>
            {[1, 2, 3, 4, 5].map((i) => (
                <span
                    key={i}
                    className={cn(
                        'text-xs leading-none',
                        i <= stars ? 'text-amber-400' : 'text-muted-foreground/25'
                    )}
                >
                    ★
                </span>
            ))}
        </span>
    )
}

function StatBlock({
    label,
    value,
    sub,
    trend,
}: {
    label: string
    value: string
    sub?: string
    trend?: 'up' | 'down' | 'flat'
}) {
    return (
        <div className="rounded-xl border border-border/40 bg-secondary/20 px-3 py-3 dark:border-white/10">
            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                {label}
            </p>
            <div className="mt-1 flex items-center gap-1.5">
                {trend === 'up' && <TrendingUp className="h-4 w-4 text-emerald-500" />}
                {trend === 'down' && <TrendingDown className="h-4 w-4 text-rose-500" />}
                {trend === 'flat' && <Minus className="h-4 w-4 text-muted-foreground" />}
                <span className="text-lg font-black tabular-nums text-foreground">{value}</span>
            </div>
            {sub ? (
                <p className="mt-0.5 text-[9px] font-semibold text-muted-foreground">{sub}</p>
            ) : null}
        </div>
    )
}

export function ProgressBodyCompositionB6({
    checkIns,
    heightCm,
    chartGridColor,
    chartAxisColor,
    tooltipBgColor,
    tooltipBorderColor,
    tooltipTextColor,
}: ProgressBodyCompositionB6Props) {
    const gradId = useId().replace(/:/g, '')
    const [dotDetail, setDotDetail] = useState<Record<string, unknown> | null>(null)
    const [compareOpen, setCompareOpen] = useState(false)
    const [baseId, setBaseId] = useState<string>('')
    const [compareToId, setCompareToId] = useState<string>('')

    const sortedAsc = useMemo(
        () =>
            [...(checkIns || [])].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            ),
        [checkIns]
    )

    const sortedDesc = useMemo(() => [...sortedAsc].reverse(), [sortedAsc])

    const withWeight = useMemo(
        () => sortedAsc.filter((c) => c.weight != null && Number(c.weight) > 0),
        [sortedAsc]
    )

    const chartData = useMemo(
        () =>
            withWeight.map((c) => ({
                id: c.id,
                date: format(new Date(c.created_at), 'd MMM'),
                dateIso: format(new Date(c.created_at), 'yyyy-MM-dd'),
                weight: Number(c.weight),
                energia: c.energy_level ?? null,
                notes: c.notes ?? '',
                photo: c.front_photo_url ?? null,
                created_at: c.created_at,
            })),
        [withWeight]
    )

    const firstW = withWeight[0]
    const lastW = withWeight[withWeight.length - 1]
    const firstWeight = firstW?.weight != null ? Number(firstW.weight) : null
    const lastWeight = lastW?.weight != null ? Number(lastW.weight) : null
    const totalDelta =
        firstWeight != null && lastWeight != null ? lastWeight - firstWeight : null

    const slopeKgPerDay = useMemo(() => linearRegressionKgPerDay(checkIns), [checkIns])
    const monthlyRate = slopeKgPerDay * 30
    const projected4w =
        lastWeight != null ? lastWeight + slopeKgPerDay * 28 : null

    const lastForBmi = lastW
    const bmi =
        lastForBmi?.weight != null && heightCm
            ? bmiFromMetric(Number(lastForBmi.weight), heightCm)
            : null

    const avgEnergy7 = useMemo(
        () => avgEnergySince(checkIns, subDays(new Date(), 7)),
        [checkIns]
    )

    const photoCheckIns = useMemo(
        () => sortedAsc.filter((c) => c.front_photo_url),
        [sortedAsc]
    )

    useEffect(() => {
        if (photoCheckIns.length === 0) {
            setBaseId('')
            setCompareToId('')
            return
        }
        const first = photoCheckIns[0]!
        const last = photoCheckIns[photoCheckIns.length - 1]!
        setBaseId((prev) => (prev && photoCheckIns.some((p) => p.id === prev) ? prev : first.id))
        setCompareToId((prev) =>
            prev && photoCheckIns.some((p) => p.id === prev) ? prev : last.id
        )
    }, [photoCheckIns])

    const baseCi = photoCheckIns.find((c) => c.id === baseId)
    const compareCi = photoCheckIns.find((c) => c.id === compareToId)

    const energyGaugePct =
        avgEnergy7 != null ? Math.min(100, Math.max(0, Math.round(avgEnergy7 * 10))) : 0
    const gaugeFill =
        energyGaugePct >= 70 ? '#10b981' : energyGaugePct >= 40 ? '#f59e0b' : '#ef4444'

    const bmiMarkerPct =
        bmi != null ? Math.min(100, Math.max(0, ((bmi - 16) / (36 - 16)) * 100)) : 50

    const deltaTrend =
        totalDelta == null
            ? undefined
            : totalDelta > 0.05
              ? 'up'
              : totalDelta < -0.05
                ? 'down'
                : 'flat'

    if (!checkIns?.length) {
        return (
            <GlassCard className="border-dashed border-border/50 p-8 dark:border-white/10">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Scale className="h-4 w-4 shrink-0" />
                    Sin check-ins todavía. La composición y tendencias aparecerán cuando el alumno
                    registre peso y fotos.
                </div>
            </GlassCard>
        )
    }

    return (
        <div className="space-y-6">
            <GlassCard className="relative overflow-hidden border-dashed border-border/50 p-6 dark:border-white/10 md:p-8">
                <div className="pointer-events-none absolute top-0 right-0 -mr-20 -mt-20 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />
                <div className="relative z-10">
                    <h3 className="mb-6 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary">
                        <Scale className="h-4 w-4" /> Peso y tendencia
                    </h3>

                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                        <div className="xl:col-span-2">
                            {chartData.length > 1 ? (
                                <div className="h-[280px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart
                                            data={chartData}
                                            margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                                        >
                                            <defs>
                                                <linearGradient
                                                    id={`wgrad-${gradId}`}
                                                    x1="0"
                                                    y1="0"
                                                    x2="0"
                                                    y2="1"
                                                >
                                                    <stop
                                                        offset="0%"
                                                        stopColor="var(--theme-primary, #007AFF)"
                                                        stopOpacity={0.35}
                                                    />
                                                    <stop
                                                        offset="100%"
                                                        stopColor="var(--theme-primary, #007AFF)"
                                                        stopOpacity={0.02}
                                                    />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid
                                                strokeDasharray="3 3"
                                                stroke={chartGridColor}
                                                vertical={false}
                                            />
                                            <XAxis
                                                dataKey="date"
                                                tick={{ fill: chartAxisColor, fontSize: 9 }}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                tick={{ fill: chartAxisColor, fontSize: 9 }}
                                                axisLine={false}
                                                tickLine={false}
                                                domain={['dataMin - 1', 'dataMax + 1']}
                                                width={40}
                                            />
                                            <Tooltip
                                                content={({ active, payload }) => {
                                                    if (!active || !payload?.length) return null
                                                    const p = payload[0]?.payload as (typeof chartData)[0]
                                                    return (
                                                        <div
                                                            className="max-w-[240px] rounded-lg border px-3 py-2 text-[11px] font-semibold shadow-lg"
                                                            style={{
                                                                backgroundColor: tooltipBgColor,
                                                                borderColor: tooltipBorderColor,
                                                                color: tooltipTextColor,
                                                            }}
                                                        >
                                                            <p className="font-black">{p.dateIso}</p>
                                                            <p className="tabular-nums">{p.weight} kg</p>
                                                            <p className="mt-1 flex items-center gap-2">
                                                                Energía:{' '}
                                                                <EnergyStars level={p.energia} />
                                                                <span className="opacity-80">
                                                                    {p.energia ?? '—'}/10
                                                                </span>
                                                            </p>
                                                            {p.photo ? (
                                                                <div className="relative mt-2 h-16 w-16 overflow-hidden rounded-md border border-border/50">
                                                                    <Image
                                                                        src={p.photo}
                                                                        alt=""
                                                                        fill
                                                                        className="object-cover"
                                                                        sizes="64px"
                                                                        unoptimized
                                                                    />
                                                                </div>
                                                            ) : null}
                                                            {p.notes ? (
                                                                <p className="mt-2 text-[10px] font-medium leading-snug opacity-90 normal-case">
                                                                    {p.notes}
                                                                </p>
                                                            ) : null}
                                                            <p className="mt-2 text-[9px] font-bold uppercase tracking-widest opacity-60">
                                                                Clic en un punto para ampliar
                                                            </p>
                                                        </div>
                                                    )
                                                }}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="weight"
                                                name="Peso (kg)"
                                                stroke="var(--theme-primary, #007AFF)"
                                                strokeWidth={2}
                                                fill={`url(#wgrad-${gradId})`}
                                                dot={(props: {
                                                    cx?: number
                                                    cy?: number
                                                    payload?: (typeof chartData)[0]
                                                }) => {
                                                    const { cx, cy, payload } = props
                                                    if (cx == null || cy == null || !payload) return null
                                                    return (
                                                        <circle
                                                            cx={cx}
                                                            cy={cy}
                                                            r={5}
                                                            fill="var(--theme-primary, #007AFF)"
                                                            stroke="hsl(var(--background))"
                                                            strokeWidth={2}
                                                            className="cursor-pointer"
                                                            onClick={() =>
                                                                setDotDetail({
                                                                    weight: payload.weight,
                                                                    energia: payload.energia,
                                                                    photo: payload.photo,
                                                                    notes: payload.notes,
                                                                })
                                                            }
                                                        />
                                                    )
                                                }}
                                                activeDot={{ r: 7 }}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                                    Hace falta al menos dos pesos para la curva.
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 xl:grid-cols-1 xl:gap-3">
                            <StatBlock
                                label="Peso inicial"
                                value={firstWeight != null ? `${firstWeight.toFixed(1)} kg` : '—'}
                            />
                            <StatBlock
                                label="Peso actual"
                                value={lastWeight != null ? `${lastWeight.toFixed(1)} kg` : '—'}
                            />
                            <StatBlock
                                label="Cambio total"
                                value={
                                    totalDelta != null
                                        ? `${totalDelta > 0 ? '+' : ''}${totalDelta.toFixed(1)} kg`
                                        : '—'
                                }
                                trend={deltaTrend}
                            />
                            <StatBlock
                                label="Ritmo (30d)"
                                value={`${monthlyRate >= 0 ? '+' : ''}${monthlyRate.toFixed(2)} kg/mes`}
                                sub="Regresión sobre ventana reciente"
                            />
                            <StatBlock
                                label="Proyección 4 sem"
                                value={
                                    projected4w != null && withWeight.length >= 2
                                        ? `${projected4w.toFixed(1)} kg`
                                        : '—'
                                }
                                sub="Si continúa la tendencia actual"
                            />
                        </div>
                    </div>
                </div>
            </GlassCard>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <GlassCard className="border-dashed border-border/50 p-6 dark:border-white/10">
                    <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-primary">
                        IMC
                    </h3>
                    {!heightCm || bmi == null ? (
                        <p className="text-sm text-muted-foreground">
                            Añade altura en la ficha del alumno (intake) para ver IMC y la escala.
                        </p>
                    ) : (
                        <>
                            <p className="text-3xl font-black tabular-nums text-foreground">
                                {bmi.toFixed(1)}
                            </p>
                            <p className="mt-1 text-xs font-bold text-muted-foreground">
                                {bmiCategory(bmi)}
                            </p>
                            <div className="relative mt-6">
                                <div className="flex h-3 overflow-hidden rounded-full bg-muted/40 text-[0]">
                                    <div
                                        className="h-full w-[18%] bg-sky-400/80"
                                        title="Bajo peso"
                                    />
                                    <div
                                        className="h-full w-[34%] bg-emerald-500/80"
                                        title="Normal"
                                    />
                                    <div
                                        className="h-full w-[20%] bg-amber-500/80"
                                        title="Sobrepeso"
                                    />
                                    <div className="h-full flex-1 bg-rose-500/75" title="Obesidad" />
                                </div>
                                <div
                                    className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-foreground shadow-md"
                                    style={{ left: `${bmiMarkerPct}%` }}
                                />
                                <div className="mt-2 flex justify-between text-[8px] font-black uppercase tracking-widest text-muted-foreground">
                                    <span>16</span>
                                    <span>18.5</span>
                                    <span>25</span>
                                    <span>30</span>
                                    <span>36</span>
                                </div>
                            </div>
                        </>
                    )}
                </GlassCard>

                <GlassCard className="border-dashed border-border/50 p-6 dark:border-white/10">
                    <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-primary">
                        Energía media (7 días)
                    </h3>
                    {avgEnergy7 == null ? (
                        <p className="text-sm text-muted-foreground">
                            Sin niveles de energía en la última semana.
                        </p>
                    ) : (
                        <div className="flex flex-col items-center">
                            <div className="h-[160px] w-full max-w-[220px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadialBarChart
                                        cx="50%"
                                        cy="75%"
                                        innerRadius="55%"
                                        outerRadius="100%"
                                        data={[{ name: 'e', value: energyGaugePct, fill: gaugeFill }]}
                                        startAngle={180}
                                        endAngle={0}
                                        barSize={14}
                                    >
                                        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                                        <RadialBar
                                            background={{ fill: 'rgba(128,128,128,0.12)' }}
                                            dataKey="value"
                                            cornerRadius={6}
                                        />
                                    </RadialBarChart>
                                </ResponsiveContainer>
                            </div>
                            <p className="-mt-2 text-center text-2xl font-black tabular-nums text-foreground">
                                {avgEnergy7.toFixed(1)}
                                <span className="text-sm font-bold text-muted-foreground">/10</span>
                            </p>
                            <EnergyStars level={avgEnergy7} />
                        </div>
                    )}
                </GlassCard>
            </div>

            {photoCheckIns.length >= 2 && baseCi?.front_photo_url && compareCi?.front_photo_url && (
                <GlassCard className="border-dashed border-border/50 p-6 dark:border-white/10">
                    <h3 className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary">
                        <Camera className="h-4 w-4" /> Comparativa fotos
                    </h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <label className="space-y-1.5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                                Check-in base
                            </span>
                            <select
                                className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-sm font-semibold dark:border-white/15"
                                value={baseId}
                                onChange={(e) => setBaseId(e.target.value)}
                            >
                                {photoCheckIns.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {format(new Date(c.created_at), 'd MMM yyyy')} ·{' '}
                                        {c.weight != null ? `${c.weight} kg` : '—'}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="space-y-1.5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                                Comparar con
                            </span>
                            <select
                                className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-sm font-semibold dark:border-white/15"
                                value={compareToId}
                                onChange={(e) => setCompareToId(e.target.value)}
                            >
                                {photoCheckIns.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {format(new Date(c.created_at), 'd MMM yyyy')} ·{' '}
                                        {c.weight != null ? `${c.weight} kg` : '—'}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    {baseCi && compareCi && baseCi.id !== compareCi.id && (
                        <div className="mt-4 rounded-xl border border-border/40 bg-secondary/15 p-4 text-sm dark:border-white/10">
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                Deltas entre selección
                            </p>
                            <div className="mt-2 grid grid-cols-2 gap-3 font-bold tabular-nums">
                                <div>
                                    <span className="text-muted-foreground">Δ Peso: </span>
                                    {compareCi.weight != null && baseCi.weight != null
                                        ? `${(Number(compareCi.weight) - Number(baseCi.weight) >= 0 ? '+' : '')}${(Number(compareCi.weight) - Number(baseCi.weight)).toFixed(1)} kg`
                                        : '—'}
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Δ Energía: </span>
                                    {compareCi.energy_level != null && baseCi.energy_level != null
                                        ? `${Number(compareCi.energy_level) - Number(baseCi.energy_level)}`
                                        : '—'}
                                </div>
                            </div>
                        </div>
                    )}
                    <Button
                        type="button"
                        className="mt-4 w-full sm:w-auto"
                        disabled={
                            !baseCi?.front_photo_url ||
                            !compareCi?.front_photo_url ||
                            baseCi.id === compareCi.id
                        }
                        onClick={() => setCompareOpen(true)}
                    >
                        <ArrowRightLeft className="mr-2 h-4 w-4" />
                        Abrir comparativa
                    </Button>
                    <PhotoComparisonSlider
                        isOpen={compareOpen}
                        onClose={() => setCompareOpen(false)}
                        beforePhoto={baseCi?.front_photo_url || ''}
                        afterPhoto={compareCi?.front_photo_url || ''}
                        beforeDate={baseCi ? format(new Date(baseCi.created_at), 'd MMM yyyy') : ''}
                        afterDate={compareCi ? format(new Date(compareCi.created_at), 'd MMM yyyy') : ''}
                    />
                </GlassCard>
            )}

            <GlassCard className="border-dashed border-border/50 p-6 dark:border-white/10">
                <h3 className="mb-6 text-xs font-black uppercase tracking-widest text-primary">
                    Línea de tiempo de check-ins
                </h3>
                <div className="relative">
                    <div className="absolute top-2 bottom-2 left-[11px] w-px bg-border/60 dark:bg-white/15" />
                    <ul className="space-y-0">
                        {sortedDesc.map((ci) => (
                            <li key={ci.id} className="relative flex gap-4 pb-8 last:pb-0">
                                <div
                                    className={cn(
                                        'relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full border-2 border-background',
                                        energyColor(ci.energy_level)
                                    )}
                                />
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-primary">
                                            {format(new Date(ci.created_at), "d MMM yyyy · HH:mm")}
                                        </span>
                                        {ci.weight != null ? (
                                            <span className="text-sm font-black tabular-nums text-foreground">
                                                {ci.weight} kg
                                            </span>
                                        ) : null}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                        <span className="text-muted-foreground">Energía:</span>
                                        <EnergyStars level={ci.energy_level} />
                                    </div>
                                    {ci.front_photo_url ? (
                                        <button
                                            type="button"
                                            className="relative block h-36 w-full max-w-xs overflow-hidden rounded-lg border border-border/50 text-left transition-opacity hover:opacity-95"
                                            onClick={() =>
                                                setDotDetail({
                                                    weight: ci.weight,
                                                    energia: ci.energy_level,
                                                    photo: ci.front_photo_url,
                                                    notes: ci.notes,
                                                })
                                            }
                                        >
                                            <Image
                                                src={ci.front_photo_url}
                                                alt=""
                                                fill
                                                className="object-cover"
                                                sizes="320px"
                                                unoptimized
                                            />
                                        </button>
                                    ) : null}
                                    {ci.notes ? (
                                        <p className="text-sm font-medium leading-relaxed text-muted-foreground">
                                            {ci.notes}
                                        </p>
                                    ) : (
                                        <p className="text-xs italic text-muted-foreground/70">
                                            Sin notas
                                        </p>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </GlassCard>

            <Dialog open={!!dotDetail} onOpenChange={(o) => !o && setDotDetail(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xs font-black uppercase tracking-widest">
                            Check-in
                        </DialogTitle>
                    </DialogHeader>
                    {dotDetail && (
                        <div className="space-y-3">
                            {dotDetail.weight != null ? (
                                <p className="text-lg font-black tabular-nums">
                                    {String(dotDetail.weight)} kg
                                </p>
                            ) : null}
                            <div className="flex items-center gap-2">
                                <EnergyStars
                                    level={
                                        typeof dotDetail.energia === 'number'
                                            ? dotDetail.energia
                                            : undefined
                                    }
                                />
                            </div>
                            {dotDetail.photo ? (
                                <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-lg border">
                                    <Image
                                        src={String(dotDetail.photo)}
                                        alt=""
                                        fill
                                        className="object-cover"
                                        sizes="320px"
                                        unoptimized
                                    />
                                </div>
                            ) : null}
                            {dotDetail.notes ? (
                                <p className="text-sm text-muted-foreground">
                                    {String(dotDetail.notes)}
                                </p>
                            ) : null}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
