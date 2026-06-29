'use client'

import { Card } from '@/components/ui/card'
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
        <Card className="p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                    {title}
                </h3>
                {!isValidated && (
                    <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                        Preliminar
                    </span>
                )}
            </div>

            {/* 5 componentes Kerr */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {COMPONENT_LABELS.map(({ key, label }) => {
                    const comp = f[key] as { kg: number; pct: number }
                    return (
                        <div
                            key={key}
                            className="rounded-xl border border-border/40 bg-secondary/20 px-3 py-2.5"
                        >
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                                {label}
                            </p>
                            <p className="mt-0.5 text-base font-black tabular-nums text-foreground">
                                {formatKg(comp.kg)}
                            </p>
                            <p className="text-[10px] font-semibold text-muted-foreground">
                                {formatPct(comp.pct)}
                            </p>
                        </div>
                    )
                })}
            </div>

            {/* Validez interna del fraccionamiento (Σ masas vs peso medido) */}
            <p className="mt-2 text-[10px] text-muted-foreground">
                Σ masas {formatKg(f.predictedMassKg)} · peso {formatKg(f.measuredWeightKg)} · Δ{' '}
                <span
                    className={cn(
                        Math.abs(f.massDifferenceKg) <= 3 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                    )}
                >
                    {f.massDifferenceKg > 0 ? '+' : ''}
                    {formatKg(f.massDifferenceKg)}
                </span>
            </p>

            {/* Somatotipo + % grasa */}
            <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-border/40 bg-secondary/20 px-3 py-2.5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                        Somatotipo
                    </p>
                    <p className="mt-0.5 text-sm font-black tabular-nums text-foreground">
                        {s.endomorphy.toFixed(1)} – {s.mesomorphy.toFixed(1)} – {s.ectomorphy.toFixed(1)}
                    </p>
                    <p className="text-[9px] font-semibold text-muted-foreground">Endo – Meso – Ecto</p>
                </div>
                <div className="rounded-xl border border-border/40 bg-secondary/20 px-3 py-2.5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                        % Grasa {!isValidated && '(prelim.)'}
                    </p>
                    <p className="mt-0.5 text-lg font-black tabular-nums text-foreground">
                        {formatPct(bodyFat.percent)}
                    </p>
                    <p className="text-[9px] font-semibold text-muted-foreground">{bodyFat.equation}</p>
                </div>
            </div>
        </Card>
    )
}
