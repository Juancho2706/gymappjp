'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useReducedMotion } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import type { BodyCompositionRow } from '@/infrastructure/db/body-composition.repository'
import { readBiaMetrics } from '@/lib/bodycomp/view-helpers'

/** recharts diferido: sale del First Load de `/c/bodycomp`, se carga on-view dentro del `h-56`. */
const BodyCompTrendChart = dynamic(
    () => import('./BodyCompTrendChart').then((m) => ({ default: m.BodyCompTrendChart })),
    {
        ssr: false,
        loading: () => <div className="h-full w-full animate-pulse rounded-card bg-surface-sunken/40" aria-hidden />,
    }
)

type SeriesKey = 'bodyFatPercent' | 'skeletalMuscleMassKg'

const fmtPct = (v: number) => `${v.toFixed(1)}%`
const fmtKg = (v: number) => `${v.toFixed(1)} kg`

const SERIES: { key: SeriesKey; labelKey: string; fmt: (v: number) => string }[] = [
    { key: 'bodyFatPercent', labelKey: 'bodycomp.metric.bodyFat', fmt: fmtPct },
    { key: 'skeletalMuscleMassKg', labelKey: 'bodycomp.metric.muscleMass', fmt: fmtKg },
]

/**
 * Tendencia BIA (read-only, sin delete). AreaChart themeado con var(--theme-primary) (NO el
 * #007AFF del coach); el draw-in (`isAnimationActive`) es el momento de delight, gated por
 * reduced-motion. NUNCA combina ISAK en la misma curva (% grasa de metodos distintos no comparan).
 */
export function StudentBiaTrend({ rows }: { rows: BodyCompositionRow[] }) {
    const { t, language } = useTranslation()
    const reduce = useReducedMotion()
    const [active, setActive] = useState<SeriesKey>('bodyFatPercent')
    const locale = language === 'es' ? 'es-CL' : 'en-US'

    const series = SERIES.find((s) => s.key === active)!

    const chartData = useMemo(
        () =>
            [...rows]
                .reverse()
                .map((r) => {
                    const v = readBiaMetrics(r)[active]
                    return {
                        date: new Date(r.measured_at).toLocaleDateString(locale, {
                            day: '2-digit',
                            month: 'short',
                        }),
                        value: typeof v === 'number' ? v : null,
                    }
                })
                .filter((d) => d.value != null),
        [rows, active, locale]
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
                    fillId="biaTrendFill"
                />
            </div>
        </Card>
    )
}
