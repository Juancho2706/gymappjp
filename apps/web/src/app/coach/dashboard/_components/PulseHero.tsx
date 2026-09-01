'use client'

import { useRouter } from 'next/navigation'
import { type LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { EvaCountUp } from './EvaCountUp'
import { Sparkline } from './Sparkline'
import type { KpiDelta, KpiSummary } from '../_data/types'

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
 * Tono del delta → token de color del DS. Los mismos tres que usa `DesktopBento` en el bento de
 * escritorio, para que el hero móvil y el desktop pinten idéntico en claro, oscuro y white-label.
 */
const TONE_COLOR: Record<NonNullable<KpiDelta>['tone'], string> = {
    positive: 'var(--success-600)',
    negative: 'var(--danger-600)',
    neutral: 'var(--text-muted)',
}

/**
 * P1 — delta de tendencia (estructura verbatim de coach-dashboard.jsx deltaView).
 *
 * El texto viene ARMADO desde la capa de datos (`_lib/kpi-deltas`), así que el hero móvil, el
 * bento de escritorio y RN dicen exactamente lo mismo: acá no se redacta copy ni se decide si
 * subir es bueno (eso ya está en `tone`). El ícono sigue el SIGNO del cambio, no su bondad.
 *
 * `null` = sin comparación honesta ⇒ el stat no pinta línea de delta y jamás inventa un número.
 */
function deltaView(delta: KpiDelta): DeltaView | null {
    if (!delta) return null
    return {
        txt: delta.text,
        color: TONE_COLOR[delta.tone],
        Icon: delta.value > 0 ? TrendingUp : delta.value < 0 ? TrendingDown : Minus,
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
            sub: deltaView(kpi.deltas.clients),
            caption: undefined as string | undefined,
            spark: null as number[] | null,
            onClick: () => router.push('/coach/clients'),
        },
        {
            key: 'riesgo',
            label: 'En riesgo',
            num: kpi.riskCount,
            suffix: '',
            danger: kpi.riskCount > 0,
            // Sin delta hasta el snapshot diario (fase 2 del mini-plan 7C): el riesgo de hace una
            // semana no es reconstruible. La caption describe el número, no una tendencia — es la
            // misma línea que el bento de escritorio, para no contar dos historias distintas.
            sub: deltaView(kpi.deltas.risk),
            caption: 'requieren revisión' as string | undefined,
            spark: null as number[] | null,
            onClick: () => router.push('/coach/clients?filter=risk'),
        },
        {
            key: 'adherencia',
            label: 'Adherencia',
            num: kpi.avgAdherence,
            suffix: '%',
            danger: false,
            sub: deltaView(kpi.deltas.adherence),
            caption: undefined as string | undefined,
            spark: sparkSeries(kpi.avgAdherence),
            onClick: onAdherence,
        },
    ]

    return (
        <Card padding="none" className="mb-3.5 flex flex-row gap-0 overflow-hidden">
            {stats.map((c, i) => {
                const sub = c.sub
                /* Delta real → caption fija → nada. El texto del servidor es una frase completa
                   («+2 vs. ayer»), no un número suelto, así que la línea YA NO es
                   `whitespace-nowrap`: en un stat de ~95 px envuelve en vez de desbordar. */
                const subLine = sub ? (
                    <span
                        className="inline-flex min-w-0 items-start gap-0.5 text-[11px] font-extrabold leading-[1.25]"
                        style={{ color: sub.color }}
                    >
                        <sub.Icon className="mt-px size-3 shrink-0" />
                        {sub.txt}
                    </span>
                ) : c.caption ? (
                    <span className="min-w-0 text-[11px] font-semibold leading-[1.25] text-[var(--text-muted)]">
                        {c.caption}
                    </span>
                ) : null
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
                            className="eva-metric text-[27px] leading-none"
                            style={{
                                color: c.danger
                                    ? 'var(--danger-600)'
                                    : 'var(--text-strong)',
                            }}
                        >
                            <EvaCountUp value={c.num} suffix={c.suffix} />
                        </span>
                        {c.spark ? (
                            /* `flex-wrap`: con la frase completa del delta ya no caben lado a lado
                               en un stat angosto, así que la sparkline baja sola a la línea de
                               abajo (y sigue a la derecha) en vez de aplastar el texto. */
                            <div className="flex w-full flex-wrap items-end gap-x-1.5 gap-y-1">
                                {subLine}
                                <span className="ml-auto">
                                    <Sparkline data={c.spark} color="var(--sport-500)" />
                                </span>
                            </div>
                        ) : (
                            subLine
                        )}
                    </button>
                )
            })}
        </Card>
    )
}
