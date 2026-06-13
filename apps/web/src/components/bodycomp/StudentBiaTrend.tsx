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
import { GlassCard } from '@/components/ui/glass-card'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import type { BodyCompositionRow } from '@/infrastructure/db/body-composition.repository'
import { readBiaMetrics } from '@/lib/bodycomp/view-helpers'

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
        <GlassCard className="p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <h3 className="mr-auto text-sm font-black uppercase tracking-widest text-muted-foreground">
                    {t('bodycomp.student.trend')}
                </h3>
                {SERIES.map((s) => (
                    <button
                        key={s.key}
                        type="button"
                        onClick={() => setActive(s.key)}
                        className={cn(
                            'min-h-11 rounded-xl px-3 py-2 text-xs font-bold transition-colors',
                            active === s.key
                                ? 'text-primary-foreground'
                                : 'bg-secondary/40 text-muted-foreground hover:bg-secondary/60'
                        )}
                        style={active === s.key ? { backgroundColor: 'var(--theme-primary)' } : undefined}
                    >
                        {t(s.labelKey)}
                    </button>
                ))}
            </div>

            <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                        <defs>
                            <linearGradient id="biaTrendFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--theme-primary)" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="var(--theme-primary)" stopOpacity={0.02} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
                        <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} width={42} />
                        <Tooltip
                            contentStyle={{
                                borderRadius: 12,
                                border: '1px solid var(--border)',
                                background: 'var(--background)',
                                fontSize: 12,
                            }}
                            formatter={(value) => [series.fmt(Number(value)), t(series.labelKey)]}
                        />
                        <Area
                            type="monotone"
                            dataKey="value"
                            stroke="var(--theme-primary)"
                            strokeWidth={2.5}
                            fill="url(#biaTrendFill)"
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                            isAnimationActive={!reduce}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </GlassCard>
    )
}
