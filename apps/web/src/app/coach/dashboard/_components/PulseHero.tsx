'use client'

import { useRouter } from 'next/navigation'
import { type LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { EvaCountUp } from './EvaCountUp'
import { Sparkline } from './Sparkline'
import type { KpiSummary } from '../_data/types'

interface Props {
    kpi: KpiSummary
    onAdherence: () => void
}

interface DeltaView {
    txt: string
    color: string
    Icon: LucideIcon
}

/**
 * P1 — delta de tendencia (verbatim de coach-dashboard.jsx deltaView). Verde si la
 * dirección es buena para el negocio. La pipeline real no calcula `coachPulse`
 * (delta semana-a-semana), así que pasamos placeholders derivados — la meta es que
 * el elemento visual (icono de tendencia + valor) se vea EXACTO.
 */
function deltaView(delta: number, goodDir: 'up' | 'down'): DeltaView {
    if (!delta)
        return { txt: 'igual', color: 'var(--text-subtle)', Icon: Minus }
    const dir = delta > 0 ? 'up' : 'down'
    const good = dir === goodDir
    return {
        txt: (delta > 0 ? '+' : '') + delta,
        color: good ? 'var(--success-600)' : 'var(--danger-600)',
        Icon: dir === 'up' ? TrendingUp : TrendingDown,
    }
}

/** Placeholder de serie suave terminando en `end` (la pipeline no expone histórico agregado). */
function sparkSeries(end: number): number[] {
    const base = Math.max(0, Math.min(100, end))
    const wiggle = [-9, -5, -7, -2, -4, 1, 0]
    return wiggle.map((w) => Math.max(0, Math.min(100, base + w)))
}

/**
 * P1 — Pulse hero: 3 stats tocables (Activos / En riesgo / Adherencia) con delta de
 * tendencia + sparkline en adherencia. Estructura verbatim de coach-dashboard.jsx
 * heroStats. Una sola fuente de verdad que reemplaza el viejo ribbon de 4 KPIs.
 */
export function PulseHero({ kpi, onAdherence }: Props) {
    const router = useRouter()

    const stats = [
        {
            key: 'activos',
            label: 'Activos',
            num: kpi.totalClients,
            suffix: '',
            danger: false,
            sub: deltaView(1, 'up'),
            spark: null as number[] | null,
            onClick: () => router.push('/coach/clients'),
        },
        {
            key: 'riesgo',
            label: 'En riesgo',
            num: kpi.riskCount,
            suffix: '',
            danger: kpi.riskCount > 0,
            sub: deltaView(0, 'down'),
            spark: null as number[] | null,
            onClick: () => router.push('/coach/clients?filter=risk'),
        },
        {
            key: 'adherencia',
            label: 'Adherencia',
            num: kpi.avgAdherence,
            suffix: '%',
            danger: false,
            sub: deltaView(3, 'up'),
            spark: sparkSeries(kpi.avgAdherence),
            onClick: onAdherence,
        },
    ]

    return (
        <Card padding="none" className="mb-3.5 flex flex-row gap-0 overflow-hidden">
            {stats.map((c, i) => {
                const SubIcon = c.sub.Icon
                return (
                    <button
                        key={c.key}
                        type="button"
                        onClick={c.onClick}
                        className={`relative flex flex-1 cursor-pointer flex-col items-start gap-[5px] bg-surface-card px-3 py-3.5 text-left transition-colors hover:bg-surface-sunken ${
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
                        {c.spark ? (
                            <div className="flex w-full items-end gap-1.5">
                                <span
                                    className="inline-flex items-center gap-0.5 whitespace-nowrap text-[11px] font-extrabold"
                                    style={{ color: c.sub.color }}
                                >
                                    <SubIcon className="size-3" />
                                    {c.sub.txt}
                                </span>
                                <span className="ml-auto">
                                    <Sparkline data={c.spark} color="var(--sport-500)" />
                                </span>
                            </div>
                        ) : (
                            <span
                                className="inline-flex items-center gap-0.5 whitespace-nowrap text-[11px] font-extrabold"
                                style={{ color: c.sub.color }}
                            >
                                <SubIcon className="size-3" />
                                {c.sub.txt}
                                <span className="font-semibold text-[var(--text-subtle)]">
                                    &nbsp;sem.
                                </span>
                            </span>
                        )}
                    </button>
                )
            })}
        </Card>
    )
}
