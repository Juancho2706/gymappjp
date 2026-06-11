'use client'

import { useMemo, useState, useTransition } from 'react'
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import { GlassCard } from '@/components/ui/glass-card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Trash2 } from 'lucide-react'
import type { BodyCompositionRow } from '@/infrastructure/db/body-composition.repository'
import { IsakResultCard } from './IsakResultCard'
import {
    deltaVsPrev,
    deviceLabel,
    formatKg,
    formatPct,
    readIsakMetrics,
    type IsakMetricsView,
} from './bodycompView'
import { deleteBodyCompositionAction } from '../_actions/body-composition.actions'

type IsakSeriesKey = 'bodyFat' | 'muscle' | 'adipose'

const SERIES: { key: IsakSeriesKey; label: string; fmt: (v: number) => string; read: (v: IsakMetricsView) => number }[] = [
    { key: 'bodyFat', label: '% Grasa', fmt: formatPct, read: (v) => v.bodyFat.percent },
    { key: 'muscle', label: 'Masa muscular', fmt: formatKg, read: (v) => v.fractionation.muscle.kg },
    { key: 'adipose', label: 'Masa adiposa', fmt: formatKg, read: (v) => v.fractionation.adipose.kg },
]

/**
 * Panel de tendencia ISAK — serie temporal de antropometria (Kerr/Heath-Carter/%grasa). Muestra
 * la tarjeta de resultado de la medicion mas reciente (5C + somatotipo + %grasa "preliminar" si
 * !is_validated). NUNCA combina con BIA.
 */
export function IsakTrendPanel({
    clientId,
    rows,
}: {
    clientId: string
    rows: BodyCompositionRow[]
}) {
    const [active, setActive] = useState<IsakSeriesKey>('bodyFat')
    const [pending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    const series = SERIES.find((s) => s.key === active)!

    const pick = useMemo(
        () => (r: BodyCompositionRow) => {
            const v = readIsakMetrics(r)
            return v ? series.read(v) : null
        },
        [series]
    )

    const chartData = useMemo(
        () =>
            [...rows]
                .reverse()
                .map((r) => ({
                    date: new Date(r.measured_at).toLocaleDateString('es-CL', {
                        day: '2-digit',
                        month: 'short',
                    }),
                    value: pick(r),
                }))
                .filter((d) => d.value != null),
        [rows, pick]
    )

    const latest = rows[0]
    const latestView = latest ? readIsakMetrics(latest) : null
    const latestDelta = rows.length ? deltaVsPrev(rows, 0, pick) : null

    if (rows.length === 0) {
        return (
            <GlassCard className="p-6 text-center">
                <p className="text-sm text-muted-foreground">
                    Aún no hay mediciones de antropometría (ISAK) para este alumno.
                </p>
            </GlassCard>
        )
    }

    return (
        <div className="space-y-3">
            {latestView && (
                <IsakResultCard
                    view={latestView}
                    isValidated={latest!.is_validated}
                    title="Última medición"
                />
            )}

            <GlassCard className="p-4 md:p-5">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    {SERIES.map((s) => (
                        <button
                            key={s.key}
                            type="button"
                            onClick={() => setActive(s.key)}
                            className={cn(
                                'min-h-11 rounded-xl px-3 py-2 text-xs font-bold transition-colors',
                                active === s.key
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-secondary/40 text-muted-foreground hover:bg-secondary/60'
                            )}
                        >
                            {s.label}
                        </button>
                    ))}
                    {latestDelta != null && (
                        <span
                            className={cn(
                                'ml-auto text-xs font-bold tabular-nums',
                                latestDelta > 0 ? 'text-rose-500' : latestDelta < 0 ? 'text-emerald-500' : 'text-muted-foreground'
                            )}
                        >
                            Δ {latestDelta > 0 ? '+' : ''}
                            {series.fmt(latestDelta)}
                        </span>
                    )}
                </div>

                <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                            <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" width={42} />
                            <Tooltip
                                contentStyle={{
                                    borderRadius: 12,
                                    border: '1px solid var(--border)',
                                    background: 'var(--background)',
                                    fontSize: 12,
                                }}
                                formatter={(value) => [series.fmt(Number(value)), series.label]}
                            />
                            <Line
                                type="monotone"
                                dataKey="value"
                                stroke="#10B981"
                                strokeWidth={2.5}
                                dot={{ r: 3 }}
                                activeDot={{ r: 5 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </GlassCard>

            {error && <p className="text-xs font-semibold text-rose-500">{error}</p>}

            <ul className="space-y-2">
                {rows.map((r) => {
                    const v = readIsakMetrics(r)
                    return (
                        <li
                            key={r.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-secondary/20 px-3 py-2.5 dark:border-white/10"
                        >
                            <div className="min-w-0">
                                <p className="text-xs font-bold text-foreground">
                                    {deviceLabel(r)}
                                    {!r.is_validated && (
                                        <span className="ml-2 text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400">
                                            Preliminar
                                        </span>
                                    )}
                                </p>
                                {v && (
                                    <p className="truncate text-[11px] text-muted-foreground">
                                        {formatPct(v.bodyFat.percent)} grasa · {formatKg(v.fractionation.muscle.kg)} músculo
                                    </p>
                                )}
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11 shrink-0 text-muted-foreground hover:text-rose-500"
                                disabled={pending}
                                aria-label="Eliminar medición"
                                onClick={() =>
                                    startTransition(async () => {
                                        setError(null)
                                        const res = await deleteBodyCompositionAction(r.id, clientId)
                                        if (res.error) setError(res.error)
                                    })
                                }
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}
