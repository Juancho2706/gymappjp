'use client'

import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { EvaCountUp } from './EvaCountUp'
import type { KpiSummary } from '../_data/types'

interface Props {
    kpi: KpiSummary
    onAdherence: () => void
}

/**
 * P1 — Pulse hero: 3 tappable stats (Activos / En riesgo / Adherencia). Single
 * source of truth that replaces the old 4-KPI strip (no "Ingresos", no charts).
 * Structure verbatim from coach-dashboard.jsx heroStats. The design's per-stat
 * week-over-week delta + sparkline come from D.coachPulse, which the real pipeline
 * doesn't compute — we degrade to an honest contextual sub-line per stat.
 */
export function PulseHero({ kpi, onAdherence }: Props) {
    const router = useRouter()

    const stats = [
        {
            key: 'activos',
            label: 'Activos',
            num: kpi.totalClients,
            suffix: '',
            sub: 'alumnos',
            subColor: 'var(--text-subtle)',
            danger: false,
            onClick: () => router.push('/coach/clients'),
        },
        {
            key: 'riesgo',
            label: 'En riesgo',
            num: kpi.riskCount,
            suffix: '',
            sub: kpi.riskCount > 0 ? 'requieren atención' : 'todo al día',
            subColor:
                kpi.riskCount > 0 ? 'var(--danger-600)' : 'var(--success-600)',
            danger: kpi.riskCount > 0,
            onClick: () => router.push('/coach/clients?filter=risk'),
        },
        {
            key: 'adherencia',
            label: 'Adherencia',
            num: kpi.avgAdherence,
            suffix: '%',
            sub: `Nutrición ${kpi.avgNutrition}%`,
            subColor: 'var(--text-subtle)',
            danger: false,
            onClick: onAdherence,
        },
    ]

    return (
        <Card padding="none" className="mb-3.5 flex flex-row gap-0 overflow-hidden">
            {stats.map((c, i) => (
                <button
                    key={c.key}
                    type="button"
                    onClick={c.onClick}
                    className={`relative flex flex-1 cursor-pointer flex-col items-start gap-1.5 bg-surface-card px-3 py-3.5 text-left transition-colors hover:bg-surface-sunken ${
                        i > 0 ? 'border-l border-[var(--border-subtle)]' : ''
                    }`}
                >
                    <span className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                        {c.label}
                    </span>
                    <span
                        className="font-display text-[27px] font-black leading-none tabular-nums tracking-[-0.02em]"
                        style={{
                            color: c.danger
                                ? 'var(--danger-600)'
                                : 'var(--text-strong)',
                        }}
                    >
                        <EvaCountUp value={c.num} suffix={c.suffix} />
                    </span>
                    <span
                        className="inline-flex items-center gap-0.5 whitespace-nowrap text-[11px] font-bold"
                        style={{ color: c.subColor }}
                    >
                        {c.sub}
                    </span>
                </button>
            ))}
        </Card>
    )
}
