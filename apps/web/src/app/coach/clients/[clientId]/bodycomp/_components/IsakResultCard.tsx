'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { IsakMetricsView } from '@/lib/bodycomp/view-helpers'
import { formatKg, formatPct } from '@/lib/bodycomp/view-helpers'

const COMPONENT_LABELS: { key: keyof IsakMetricsView['fractionation']; label: string }[] = [
    { key: 'muscle', label: 'Muscular' },
    { key: 'adipose', label: 'Adiposo' },
    { key: 'bone', label: 'Óseo' },
    { key: 'residual', label: 'Residual' },
    { key: 'skin', label: 'Piel' },
]

/**
 * Tarjeta de resultado ISAK: 5 componentes (kg + %), somatotipo y % grasa. Mientras
 * `isValidated` es false, el % grasa lleva el label "preliminar" (SPEC AC7) y NO se trata como
 * dato definitivo. Sin datos de BIA en esta tarjeta (metodos no se mezclan).
 */
export function IsakResultCard({
    view,
    isValidated,
    title = 'Resultado',
}: {
    view: IsakMetricsView
    isValidated: boolean
    title?: string
}) {
    const { fractionation: f, somatotype: s, bodyFat } = view

    return (
        <Card padding="md">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                    {title}
                </h3>
                {!isValidated && (
                    <Badge tone="warning" variant="soft" size="sm">
                        Preliminar
                    </Badge>
                )}
            </div>

            {/* 5 componentes Kerr */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {COMPONENT_LABELS.map(({ key, label }) => {
                    const comp = f[key] as { kg: number; pct: number }
                    return (
                        <div key={key} className="rounded-control bg-surface-sunken px-3 py-2.5">
                            <p className="text-[9px] font-bold uppercase tracking-[0.06em] text-muted">
                                {label}
                            </p>
                            <p className="mt-0.5 font-display text-base font-black tabular-nums text-strong">
                                {formatKg(comp.kg)}
                            </p>
                            <p className="text-[10px] font-semibold text-muted">{formatPct(comp.pct)}</p>
                        </div>
                    )
                })}
            </div>

            {/* Validez interna del fraccionamiento (Σ masas vs peso medido) */}
            <p className="mt-2 text-[10px] text-muted">
                Σ masas {formatKg(f.predictedMassKg)} · peso {formatKg(f.measuredWeightKg)} · Δ{' '}
                <span
                    className={cn(
                        'font-bold',
                        Math.abs(f.massDifferenceKg) <= 3
                            ? 'text-[var(--success-600)]'
                            : 'text-[var(--warning-700)]'
                    )}
                >
                    {f.massDifferenceKg > 0 ? '+' : ''}
                    {formatKg(f.massDifferenceKg)}
                </span>
            </p>

            {/* Somatotipo + % grasa */}
            <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-control bg-surface-sunken px-3 py-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-[0.06em] text-muted">
                        Somatotipo
                    </p>
                    <p className="mt-0.5 font-display text-sm font-black tabular-nums text-strong">
                        {s.endomorphy.toFixed(1)} – {s.mesomorphy.toFixed(1)} – {s.ectomorphy.toFixed(1)}
                    </p>
                    <p className="text-[9px] font-semibold text-muted">Endo – Meso – Ecto</p>
                </div>
                <div className="rounded-control bg-surface-sunken px-3 py-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-[0.06em] text-muted">
                        % Grasa {!isValidated && '(prelim.)'}
                    </p>
                    <p className="mt-0.5 font-display text-lg font-black tabular-nums text-strong">
                        {formatPct(bodyFat.percent)}
                    </p>
                    <p className="text-[9px] font-semibold text-muted">{bodyFat.equation}</p>
                </div>
            </div>
        </Card>
    )
}
