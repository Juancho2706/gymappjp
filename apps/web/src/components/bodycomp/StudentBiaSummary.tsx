'use client'

import { ArrowDown, ArrowUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import type { BodyCompositionRow } from '@/infrastructure/db/body-composition.repository'
import { deltaVsPrev, deviceLabel, readBiaMetrics } from '@/lib/bodycomp/view-helpers'
import type { BiaMetrics } from '@eva/bodycomp'
import { CountUpValue } from './CountUpValue'

type MetricDef = {
    key: keyof BiaMetrics
    labelKey: string
    fmt: (v: number) => string
    /** true => subir es bueno (verde). Default false => subir es malo (rojo). */
    higherIsBetter?: boolean
}

const fmtPct = (v: number) => `${v.toFixed(1)}%`
const fmtKg = (v: number) => `${v.toFixed(1)} kg`
const fmtL = (v: number) => `${v.toFixed(1)} L`
const fmtKcal = (v: number) => `${Math.round(v)} kcal`
const fmtDeg = (v: number) => `${v.toFixed(1)}°`
const fmtNum = (v: number) => `${v.toFixed(1)}`

const METRICS: MetricDef[] = [
    { key: 'bodyFatPercent', labelKey: 'bodycomp.metric.bodyFat', fmt: fmtPct },
    { key: 'skeletalMuscleMassKg', labelKey: 'bodycomp.metric.muscleMass', fmt: fmtKg, higherIsBetter: true },
    { key: 'fatMassKg', labelKey: 'bodycomp.metric.fatMass', fmt: fmtKg },
    { key: 'visceralFatLevel', labelKey: 'bodycomp.metric.visceralFat', fmt: fmtNum },
    { key: 'basalMetabolicRateKcal', labelKey: 'bodycomp.metric.bmr', fmt: fmtKcal, higherIsBetter: true },
    { key: 'phaseAngleDeg', labelKey: 'bodycomp.metric.phaseAngle', fmt: fmtDeg, higherIsBetter: true },
    { key: 'totalBodyWaterL', labelKey: 'bodycomp.metric.bodyWater', fmt: fmtL },
]

/**
 * Tarjeta resumen de la ULTIMA medicion BIA con count-up por metrica y delta vs la medicion
 * anterior del MISMO metodo (verde = mejora, rojo = empeora; en musculo/BMR/fase subir es bueno).
 * Solo muestra las metricas presentes en el jsonb (BIA es un superset opcional del dispositivo).
 */
export function StudentBiaSummary({ rows }: { rows: BodyCompositionRow[] }) {
    const { t } = useTranslation()
    const latest = rows[0]
    if (!latest) return null
    const metrics = readBiaMetrics(latest)
    const present = METRICS.filter((m) => typeof metrics[m.key] === 'number')

    return (
        <Card padding="md" className="gap-0 md:p-5">
            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-black uppercase tracking-widest text-muted">
                    {t('bodycomp.student.latest')}
                </h2>
                <span className="text-[11px] font-semibold text-muted">{deviceLabel(latest)}</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {present.map((m) => {
                    const value = metrics[m.key] as number
                    const delta = deltaVsPrev(rows, 0, (r) => {
                        const v = readBiaMetrics(r)[m.key]
                        return typeof v === 'number' ? v : null
                    })
                    return (
                        <div
                            key={m.key}
                            className="rounded-control border border-subtle bg-surface-sunken px-3 py-2.5"
                        >
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted">
                                {t(m.labelKey)}
                            </p>
                            <CountUpValue
                                value={value}
                                format={m.fmt}
                                className="mt-0.5 block text-base font-black tabular-nums text-strong"
                            />
                            {delta != null && delta !== 0 && (
                                <DeltaBadge delta={delta} higherIsBetter={m.higherIsBetter} fmt={m.fmt} />
                            )}
                        </div>
                    )
                })}
            </div>
        </Card>
    )
}

function DeltaBadge({
    delta,
    higherIsBetter,
    fmt,
}: {
    delta: number
    higherIsBetter?: boolean
    fmt: (v: number) => string
}) {
    const isImprovement = higherIsBetter ? delta > 0 : delta < 0
    const Icon = delta > 0 ? ArrowUp : ArrowDown
    return (
        <span
            className={cn(
                'mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-bold tabular-nums',
                isImprovement ? 'text-[var(--success-500)]' : 'text-[var(--danger-500)]'
            )}
        >
            <Icon className="h-3 w-3" aria-hidden />
            {fmt(Math.abs(delta))}
        </span>
    )
}
