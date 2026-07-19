'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useReducedMotion } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import type { BodyCompositionRow } from '@/infrastructure/db/body-composition.repository'
import { readIsakMetrics, type IsakMetricsView } from '@/lib/bodycomp/view-helpers'

/** recharts diferido: sale del First Load de `/c/bodycomp`, se carga on-view dentro del `h-56`. */
const BodyCompTrendChart = dynamic(
    () => import('./BodyCompTrendChart').then((m) => ({ default: m.BodyCompTrendChart })),
    {
        ssr: false,
        loading: () => <div className="h-full w-full animate-pulse rounded-card bg-surface-sunken/40" aria-hidden />,
    }
)

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
                <BodyCompTrendChart
                    chartData={chartData}
                    reduce={reduce}
                    fmt={series.fmt}
                    label={t(series.labelKey)}
                    fillId="isakTrendFill"
                />
            </div>
        </Card>
    )
}
