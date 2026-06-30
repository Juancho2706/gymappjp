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

/** Columna I/D/Ú: etiqueta de lado arriba, valor mono debajo (rojo si es el lado débil). */
function SideCell({ label, value, weak }: { label: string; value: number | null; weak: boolean }) {
    return (
        <div className="w-[30px] text-center">
            <div className="text-[8.5px] font-bold uppercase text-subtle">{label}</div>
            <div
                className={cn(
                    'font-mono text-[15px] font-bold tabular-nums',
                    weak ? 'text-[color:var(--danger-600)]' : 'text-body'
                )}
            >
                {value != null ? value : '—'}
            </div>
        </div>
    )
}

function ItemRow({ item, index }: { item: MovementAssessmentItem; index: number }) {
    const { t } = useTranslation()
    const weakLeft =
        item.is_per_side && item.score_left != null && item.score_right != null && item.score_left < item.score_right
    const weakRight =
        item.is_per_side && item.score_left != null && item.score_right != null && item.score_right < item.score_left

    return (
        <>
            {index > 0 && <div className="mx-3.5 h-px bg-subtle" aria-hidden />}
            <div className="flex items-center gap-2.5 px-3.5 py-[11px]">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-strong">{t(`assessment.pattern.${item.pattern}`)}</p>
                    {item.comment && <p className="mt-0.5 text-xs text-muted">{item.comment}</p>}
                    {(item.pain || item.clearing_positive === true) && (
                        <span className="mt-[3px] flex flex-wrap gap-1.5">
                            {item.pain && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[color:var(--danger-600)]">
                                    <AlertTriangle className="size-3" aria-hidden />
                                    {t('assessment.flag.pain')}
                                </span>
                            )}
                            {item.clearing_positive === true && (
                                <span className="inline-flex items-center text-[10px] font-bold text-[color:var(--warning-600)]">
                                    ● {t('assessment.report.clearing')}+
                                </span>
                            )}
                        </span>
                    )}
                </div>
                {item.is_per_side ? (
                    <div className="mr-1 flex gap-1.5">
                        <SideCell label={t('assessment.side.leftAbbr')} value={item.score_left} weak={weakLeft} />
                        <SideCell label={t('assessment.side.rightAbbr')} value={item.score_right} weak={weakRight} />
                    </div>
                ) : (
                    <div className="mr-1">
                        <SideCell label="Ú" value={item.score_single} weak={false} />
                    </div>
                )}
                <span
                    className={cn(
                        'inline-flex size-[30px] shrink-0 items-center justify-center rounded-[8px] font-display text-sm font-black tabular-nums',
                        scoreSquareBg(item.final_score),
                        scoreTone(item.final_score)
                    )}
                >
                    {item.final_score}
                </span>
            </div>
        </>
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

            {/* 7 patrones — filas (lado débil resaltado, cuadro de puntaje final) */}
            <div>
                <h2 className="mb-2.5 font-display text-[17px] font-extrabold tracking-[-0.02em] text-strong">
                    {language === 'es' ? 'Patrones' : 'Patterns'}
                </h2>
                <Card padding="none" className="overflow-hidden">
                    {orderedItems.map((item, i) => (
                        <ItemRow key={item.id} item={item} index={i} />
                    ))}
                </Card>
            </div>

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
