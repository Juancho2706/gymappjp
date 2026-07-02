'use client'

import { useMemo, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import type { BodyCompositionRow } from '@/infrastructure/db/body-composition.repository'
import { readIsakMetrics, type IsakMetricsView } from '@/lib/bodycomp/view-helpers'

type SeriesKey = 'bodyFat' | 'muscle' | 'adipose'

const fmtPct = (v: number) => `${v.toFixed(1)}%`
const fmtKg = (v: number) => `${v.toFixed(1)} kg`

const SERIES: {
    key: SeriesKey
    labelKey: string
    fmt: (v: number) => string
    read: (v: IsakMetricsView) => number
}[] = [
    { key: 'bodyFat', labelKey: 'bodycomp.metric.bodyFat', fmt: fmtPct, read: (v) => v.bodyFat.percent },
    { key: 'muscle', labelKey: 'bodycomp.metric.muscleMass', fmt: fmtKg, read: (v) => v.fractionation.muscle.kg },
    { key: 'adipose', labelKey: 'bodycomp.metric.adiposeMass', fmt: fmtKg, read: (v) => v.fractionation.adipose.kg },
]

/**
 * Tendencia ISAK (read-only, sin delete). AreaChart themeado con var(--theme-primary), draw-in
 * gated por reduced-motion. NUNCA combina con BIA (series filtradas a una sola medicion-metodo).
 */
export function StudentIsakTrend({ rows }: { rows: BodyCompositionRow[] }) {
    const { t, language } = useTranslation()
    const reduce = useReducedMotion()
    const [active, setActive] = useState<SeriesKey>('bodyFat')
    const locale = language === 'es' ? 'es-CL' : 'en-US'

    const series = SERIES.find((s) => s.key === active)!

    const chartData = useMemo(
        () =>
            [...rows]
                .reverse()
                .map((r) => {
                    const v = readIsakMetrics(r)
                    return {
                        date: new Date(r.measured_at).toLocaleDateString(locale, {
                            day: '2-digit',
                            month: 'short',
                        }),
                        value: v ? series.read(v) : null,
                    }
                })
                .filter((d) => d.value != null),
        [rows, series, locale]
    )

    if (chartData.length < 2) return null

    return (
        <Card padding="md" className="gap-0 md:p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <h3 className="mr-auto text-sm font-black uppercase tracking-widest text-muted">
                    {t('bodycomp.student.trend')}
                </h3>
                {SERIES.map((s) => (
                    <button
                        key={s.key}
                        type="button"
                        onClick={() => setActive(s.key)}
                        className={cn(
                            'min-h-11 rounded-pill px-3 py-2 text-xs font-bold transition-colors',
                            active === s.key
                                ? 'bg-[var(--ink-950)] text-white shadow-sm'
                                : 'bg-surface-sunken text-[var(--text-muted)] hover:text-strong'
                        )}
                    >
                        {t(s.labelKey)}
                    </button>
                ))}
            </div>

            <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                        <defs>
                            <linearGradient id="isakTrendFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--theme-primary)" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="var(--theme-primary)" stopOpacity={0.02} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
                        <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} width={42} />
                        <Tooltip
                            contentStyle={{
                                borderRadius: 14,
                                border: '1px solid var(--border-subtle)',
                                background: 'var(--surface-card)',
                                color: 'var(--text-body)',
                                fontSize: 12,
                            }}
                            formatter={(value) => [series.fmt(Number(value)), t(series.labelKey)]}
                        />
                        <Area
                            type="monotone"
                            dataKey="value"
                            stroke="var(--theme-primary)"
                            strokeWidth={2.5}
                            fill="url(#isakTrendFill)"
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                            isAnimationActive={!reduce}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </Card>
    )
}
