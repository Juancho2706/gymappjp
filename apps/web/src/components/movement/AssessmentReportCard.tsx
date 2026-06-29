'use client'

import { AlertTriangle, Scale, Zap } from 'lucide-react'
import { MOVEMENT_PATTERNS_V1 } from '@eva/calc'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { cn } from '@/lib/utils'
import { Reveal } from '@/components/motion/Reveal'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { MovementAssessmentItem, MovementAssessmentWithItems } from '@/domain/assessment/types'
import type { PriorityBand } from '@/domain/assessment/types'
import { MovementDisclaimer } from './MovementDisclaimer'

/** Color del semáforo de prioridad por banda (alta = danger ... baja = success). */
const BAND_COLOR: Record<PriorityBand, string> = {
    high: 'var(--danger-500)',
    moderate: 'var(--warning-500)',
    low: 'var(--success-500)',
}

function bandLabelKey(band: PriorityBand): string {
    return `assessment.band.${band}`
}

function scoreTone(score: number): string {
    if (score <= 0) return 'text-[color:var(--danger-600)]'
    if (score === 1) return 'text-[color:var(--warning-600)]'
    return 'text-strong'
}

/** Cuadrado de puntaje final (0 danger · 1 warning · 2-3 neutro). */
function scoreSquareBg(score: number): string {
    if (score <= 0) return 'bg-[var(--danger-100)]'
    if (score === 1) return 'bg-[var(--warning-100)]'
    return 'bg-surface-sunken'
}

function SideScore({ value, weak }: { value: number | null; weak: boolean }) {
    if (value == null) return <span className="text-muted">—</span>
    return (
        <span
            className={cn(
                'inline-flex size-7 items-center justify-center rounded-[8px] text-sm font-bold tabular-nums',
                weak
                    ? 'bg-[var(--danger-100)] text-[color:var(--danger-600)]'
                    : 'bg-surface-sunken text-body'
            )}
        >
            {value}
        </span>
    )
}

function ItemRow({ item }: { item: MovementAssessmentItem }) {
    const { t } = useTranslation()
    const weakLeft =
        item.is_per_side && item.score_left != null && item.score_right != null && item.score_left < item.score_right
    const weakRight =
        item.is_per_side && item.score_left != null && item.score_right != null && item.score_right < item.score_left

    return (
        <tr className="border-b border-subtle last:border-0">
            <td className="py-2.5 pr-2">
                <p className="text-sm font-semibold text-strong">{t(`assessment.pattern.${item.pattern}`)}</p>
                {item.comment && <p className="mt-0.5 text-xs text-muted">{item.comment}</p>}
                <span className="mt-1 flex flex-wrap gap-1.5">
                    {item.pain && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[color:var(--danger-600)]">
                            <AlertTriangle className="size-3" aria-hidden />
                            {t('assessment.flag.pain')}
                        </span>
                    )}
                    {item.clearing_positive === true && (
                        <span className="inline-flex items-center text-[10px] font-bold text-[color:var(--warning-600)]">
                            {t('assessment.report.clearing')}: {t('assessment.report.clearingPositive')}
                        </span>
                    )}
                </span>
            </td>
            <td className="px-2 py-2.5 text-center">
                {item.is_per_side ? (
                    <span className="inline-flex items-center gap-1.5">
                        <SideScore value={item.score_left} weak={weakLeft} />
                        <span className="text-xs text-muted">/</span>
                        <SideScore value={item.score_right} weak={weakRight} />
                    </span>
                ) : (
                    <SideScore value={item.score_single} weak={false} />
                )}
            </td>
            <td className="py-2.5 pl-2 text-right">
                <span
                    className={cn(
                        'inline-flex size-[30px] items-center justify-center rounded-[8px] font-display text-sm font-black tabular-nums',
                        scoreSquareBg(item.final_score),
                        scoreTone(item.final_score)
                    )}
                >
                    {item.final_score}
                </span>
            </td>
        </tr>
    )
}

/**
 * Reporte de una evaluacion final: semaforo + compuesto + banderas + tabla de 7
 * patrones (lado debil resaltado) + notas + disclaimer (AC5 SIEMPRE visible).
 */
export function AssessmentReportCard({ assessment }: { assessment: MovementAssessmentWithItems }) {
    const { t, language } = useTranslation()
    const orderedItems = MOVEMENT_PATTERNS_V1.map((def) =>
        assessment.items.find((i) => i.pattern === def.slug)
    ).filter((i): i is MovementAssessmentItem => i != null)

    const assessedAt = new Date(assessment.assessed_at).toLocaleDateString(
        language === 'es' ? 'es-CL' : 'en-US',
        { day: 'numeric', month: 'long', year: 'numeric' }
    )

    return (
        <Reveal as="section" className="space-y-4">
            {/* Semáforo de prioridad + compuesto (hero oscuro) */}
            <Card variant="inverse" padding="lg">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        {assessment.risk_band && (
                            <span className="inline-flex items-center gap-2 rounded-pill bg-white/10 px-3 py-1.5">
                                <span
                                    className="size-2.5 rounded-full"
                                    style={{ background: BAND_COLOR[assessment.risk_band] }}
                                    aria-hidden
                                />
                                <span className="text-xs font-bold text-on-dark">
                                    {t(bandLabelKey(assessment.risk_band))}
                                </span>
                            </span>
                        )}
                        <p className="mt-3 flex items-baseline gap-1.5">
                            <span className="font-display text-[46px] font-black leading-none tabular-nums tracking-[-0.03em] text-on-dark">
                                {assessment.composite_score ?? '—'}
                            </span>
                            <span className="text-base font-semibold text-on-dark-muted">/21</span>
                        </p>
                        <p className="mt-1.5 text-xs text-on-dark-muted">
                            {t('assessment.report.assessedAt')} {assessedAt}
                        </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {assessment.has_pain && (
                            <Badge tone="danger" variant="solid" size="sm" icon={<Zap />}>
                                {t('assessment.flag.pain')}
                            </Badge>
                        )}
                        {assessment.has_asymmetry && (
                            <Badge tone="warning" variant="solid" size="sm" icon={<Scale />}>
                                {t('assessment.flag.asymmetry')}
                            </Badge>
                        )}
                    </div>
                </div>
            </Card>

            {/* Tabla de 7 patrones */}
            <Card padding="md">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[320px] border-collapse">
                        <thead>
                            <tr className="border-b border-subtle text-left text-[11px] uppercase tracking-[0.06em] text-muted">
                                <th className="py-2 pr-2 font-bold">{t('assessment.report.pattern')}</th>
                                <th className="px-2 py-2 text-center font-bold">
                                    {t('assessment.side.leftAbbr')}/{t('assessment.side.rightAbbr')}
                                </th>
                                <th className="py-2 pl-2 text-right font-bold">{t('assessment.report.final')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orderedItems.map((item) => (
                                <ItemRow key={item.id} item={item} />
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            {assessment.notes && (
                <Card padding="md">
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                        {t('assessment.report.notes')}
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-body">{assessment.notes}</p>
                </Card>
            )}

            <MovementDisclaimer />
        </Reveal>
    )
}
