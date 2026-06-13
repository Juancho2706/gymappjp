'use client'

import { useReducedMotion } from 'framer-motion'
import {
    Line,
    LineChart,
    PolarAngleAxis,
    PolarGrid,
    PolarRadiusAxis,
    Radar,
    RadarChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    Legend,
} from 'recharts'
import { MOVEMENT_PATTERNS_V1 } from '@eva/calc'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { Reveal } from '@/components/motion/Reveal'
import type { MovementAssessmentWithItems } from '@/domain/assessment/types'

/**
 * Evolucion temporal (AC4, con >= 2 finales): linea del compuesto + radar de los 7
 * patrones (primera vs ultima evaluacion). El padre decide cuando renderizar.
 */
export function EvolutionCharts({ finals }: { finals: MovementAssessmentWithItems[] }) {
    const { t, language } = useTranslation()
    const reduce = useReducedMotion()
    if (finals.length < 2) return null

    const locale = language === 'es' ? 'es-CL' : 'en-US'
    const linePoints = finals.map((a) => ({
        date: new Date(a.assessed_at).toLocaleDateString(locale, { day: '2-digit', month: 'short' }),
        composite: a.composite_score ?? 0,
    }))

    const first = finals[0]
    const last = finals[finals.length - 1]
    const radarData = MOVEMENT_PATTERNS_V1.map((def) => ({
        pattern: t(`assessment.pattern.${def.slug}`),
        first: first.items.find((i) => i.pattern === def.slug)?.final_score ?? 0,
        last: last.items.find((i) => i.pattern === def.slug)?.final_score ?? 0,
    }))

    return (
        <Reveal as="section" className="rounded-2xl border border-border bg-card p-4 sm:p-6">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                {t('assessment.evolution.title')}
            </h2>

            <div className="mt-4 h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={linePoints} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
                        <YAxis domain={[0, 21]} tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
                        <Tooltip
                            formatter={(value) => [String(value), t('assessment.evolution.composite')]}
                            contentStyle={{ borderRadius: 12, fontSize: 12 }}
                        />
                        <Line
                            type="monotone"
                            dataKey="composite"
                            name={t('assessment.evolution.composite')}
                            stroke="#10B981"
                            strokeWidth={2.5}
                            dot={{ r: 4 }}
                            isAnimationActive={!reduce}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-6 h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} outerRadius="70%">
                        <PolarGrid stroke="currentColor" opacity={0.2} />
                        <PolarAngleAxis dataKey="pattern" tick={{ fontSize: 10 }} />
                        <PolarRadiusAxis domain={[0, 3]} tickCount={4} tick={{ fontSize: 10 }} />
                        <Radar
                            name={t('assessment.evolution.first')}
                            dataKey="first"
                            stroke="#94a3b8"
                            fill="#94a3b8"
                            fillOpacity={0.25}
                            isAnimationActive={!reduce}
                        />
                        <Radar
                            name={t('assessment.evolution.last')}
                            dataKey="last"
                            stroke="#10B981"
                            fill="#10B981"
                            fillOpacity={0.35}
                            isAnimationActive={!reduce}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                    </RadarChart>
                </ResponsiveContainer>
            </div>
        </Reveal>
    )
}
