'use client'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import type { BodyCompositionRow } from '@/infrastructure/db/body-composition.repository'
import { deviceLabel, formatKg, readIsakMetrics, type IsakMetricsView } from '@/lib/bodycomp/view-helpers'
import { CountUpValue } from './CountUpValue'

type CompKey = keyof IsakMetricsView['fractionation']

/** Orden visual y color (--chart-1..5) de los 5 componentes del fraccionamiento Kerr. */
const COMPONENTS: { key: CompKey; labelKey: string; chart: string }[] = [
    { key: 'muscle', labelKey: 'bodycomp.component.muscle', chart: 'var(--chart-1)' },
    { key: 'adipose', labelKey: 'bodycomp.component.adipose', chart: 'var(--chart-2)' },
    { key: 'bone', labelKey: 'bodycomp.component.bone', chart: 'var(--chart-3)' },
    { key: 'residual', labelKey: 'bodycomp.component.residual', chart: 'var(--chart-4)' },
    { key: 'skin', labelKey: 'bodycomp.component.skin', chart: 'var(--chart-5)' },
]

const fmtPct = (v: number) => `${v.toFixed(1)}%`

/**
 * Resumen ISAK (read-only) de la ULTIMA medicion: barra apilada de fraccionamiento Kerr 5C
 * themeada con --chart-1..5, count-up en los headlines (% grasa, somatotipo) y badge "Preliminar"
 * mientras !is_validated. NUNCA combina con BIA.
 */
export function StudentIsakSummary({ rows }: { rows: BodyCompositionRow[] }) {
    const { t } = useTranslation()
    const latest = rows[0]
    const view = latest ? readIsakMetrics(latest) : null
    if (!latest || !view) return null
    const { fractionation: f, somatotype: s, bodyFat } = view
    const isValidated = latest.is_validated

    return (
        <Card padding="md" className="gap-0 md:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-black uppercase tracking-widest text-muted">
                    {t('bodycomp.student.latest')}
                </h2>
                <div className="flex items-center gap-2">
                    {!isValidated && (
                        <span className="rounded-full bg-[var(--warning-100)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--warning-700)]">
                            {t('bodycomp.student.preliminary')}
                        </span>
                    )}
                    <span className="text-[11px] font-semibold text-muted">{deviceLabel(latest)}</span>
                </div>
            </div>

            {/* Headlines: % grasa + somatotipo con count-up */}
            <div className="grid grid-cols-2 gap-2">
                <div className="rounded-control border border-subtle bg-surface-sunken px-3 py-2.5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted">
                        {t('bodycomp.metric.bodyFat')}
                    </p>
                    <CountUpValue
                        value={bodyFat.percent}
                        format={fmtPct}
                        className="mt-0.5 block text-lg font-black tabular-nums text-strong"
                    />
                    <p className="text-[9px] font-semibold text-muted">{bodyFat.equation}</p>
                </div>
                <div className="rounded-control border border-subtle bg-surface-sunken px-3 py-2.5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted">
                        {t('bodycomp.metric.somatotype')}
                    </p>
                    <p className="mt-0.5 text-sm font-black tabular-nums text-strong">
                        {s.endomorphy.toFixed(1)} – {s.mesomorphy.toFixed(1)} – {s.ectomorphy.toFixed(1)}
                    </p>
                    <p className="text-[9px] font-semibold text-muted">{t('bodycomp.metric.somatotypeAxes')}</p>
                </div>
            </div>

            {/* Composicion: barra apilada Kerr 5C (--chart-1..5) */}
            <div className="mt-4">
                <p className="mb-1.5 text-[9px] font-black uppercase tracking-widest text-muted">
                    {t('bodycomp.student.composition')}
                </p>
                <div className="flex h-4 w-full overflow-hidden rounded-full bg-surface-sunken">
                    {COMPONENTS.map(({ key, chart }) => {
                        // M4: null-guard del pct (default 0) y clamp a [0,100] — la suma de los 5
                        // componentes Kerr puede pasar de 100% y desbordaria la barra.
                        const raw = (f[key] as { pct: number | null | undefined }).pct
                        const pct = Math.min(Math.max(raw ?? 0, 0), 100)
                        return (
                            <div
                                key={key}
                                className="h-full"
                                style={{ width: `${pct}%`, backgroundColor: chart }}
                                aria-hidden
                            />
                        )
                    })}
                </div>
                <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
                    {COMPONENTS.map(({ key, labelKey, chart }) => {
                        const comp = f[key] as { kg: number; pct: number }
                        return (
                            <li key={key} className="flex items-center gap-1.5 text-[11px]">
                                <span
                                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                                    style={{ backgroundColor: chart }}
                                    aria-hidden
                                />
                                <span className="font-semibold text-muted">{t(labelKey)}</span>
                                <span className="ml-auto font-bold tabular-nums text-strong">
                                    {comp.pct.toFixed(1)}%
                                </span>
                            </li>
                        )
                    })}
                </ul>
            </div>

            {/* Validez interna del fraccionamiento (Σ masas vs peso medido) */}
            <p className="mt-3 text-[10px] text-muted">
                Σ {formatKg(f.predictedMassKg)} · {formatKg(f.measuredWeightKg)} ·{' '}
                <span
                    className={cn(
                        Math.abs(f.massDifferenceKg) <= 3
                            ? 'text-[var(--success-600)]'
                            : 'text-[var(--warning-600)]'
                    )}
                >
                    {f.massDifferenceKg > 0 ? '+' : ''}
                    {formatKg(f.massDifferenceKg)}
                </span>
            </p>
        </Card>
    )
}
