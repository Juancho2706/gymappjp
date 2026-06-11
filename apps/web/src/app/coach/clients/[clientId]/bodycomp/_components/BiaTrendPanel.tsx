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
import { deltaVsPrev, deviceLabel, formatKg, formatPct, readBiaMetrics } from './bodycompView'
import { deleteBodyCompositionAction } from '../_actions/body-composition.actions'

type BiaSeriesKey = 'bodyFatPercent' | 'skeletalMuscleMassKg'

const SERIES: { key: BiaSeriesKey; label: string; fmt: (v: number) => string }[] = [
    { key: 'bodyFatPercent', label: '% Grasa', fmt: formatPct },
    { key: 'skeletalMuscleMassKg', label: 'Masa muscular', fmt: formatKg },
]

/**
 * Panel de tendencia BIA — serie temporal de UN metodo (bioimpedancia). NUNCA combina datos ISAK
 * en la misma curva (los % grasa de metodos distintos no son comparables). Delta vs la medicion
 * anterior del MISMO metodo + etiqueta dispositivo+fecha.
 */
export function BiaTrendPanel({
    clientId,
    rows,
}: {
    clientId: string
    rows: BodyCompositionRow[]
}) {
    const [active, setActive] = useState<BiaSeriesKey>('bodyFatPercent')
    const [pending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    const pick = useMemo(
        () => (r: BodyCompositionRow) => {
            const v = readBiaMetrics(r)[active]
            return typeof v === 'number' ? v : null
        },
        [active]
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

    const latestDelta = rows.length ? deltaVsPrev(rows, 0, pick) : null
    const series = SERIES.find((s) => s.key === active)!

    if (rows.length === 0) {
        return (
            <GlassCard className="p-6 text-center">
                <p className="text-sm text-muted-foreground">
                    Aún no hay mediciones de bioimpedancia para este alumno.
                </p>
            </GlassCard>
        )
    }

    return (
        <div className="space-y-3">
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
                                stroke="#007AFF"
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
                    const m = readBiaMetrics(r)
                    return (
                        <li
                            key={r.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-secondary/20 px-3 py-2.5 dark:border-white/10"
                        >
                            <div className="min-w-0">
                                <p className="text-xs font-bold text-foreground">{deviceLabel(r)}</p>
                                <p className="truncate text-[11px] text-muted-foreground">
                                    {m.bodyFatPercent != null && `${formatPct(m.bodyFatPercent)} grasa`}
                                    {m.skeletalMuscleMassKg != null && ` · ${formatKg(m.skeletalMuscleMassKg)} músculo`}
                                </p>
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
