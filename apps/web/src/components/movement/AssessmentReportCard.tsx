'use client'

import { AlertTriangle, Scale } from 'lucide-react'
import { MOVEMENT_PATTERNS_V1 } from '@eva/calc'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { cn } from '@/lib/utils'
import { Reveal } from '@/components/motion/Reveal'
import type { MovementAssessmentItem, MovementAssessmentWithItems } from '@/domain/assessment/types'
import { PriorityBadge } from './PriorityBadge'
import { MovementDisclaimer } from './MovementDisclaimer'

function scoreTone(score: number): string {
    if (score <= 0) return 'text-red-600 dark:text-red-400'
    if (score === 1) return 'text-amber-600 dark:text-amber-400'
    return 'text-foreground'
}

function SideScore({ value, weak }: { value: number | null; weak: boolean }) {
    if (value == null) return <span className="text-muted-foreground">—</span>
    return (
        <span
            className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold tabular-nums',
                weak
                    ? 'bg-red-500/10 text-red-700 ring-1 ring-red-500/30 dark:text-red-300'
                    : 'bg-muted text-foreground'
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
        <tr className="border-b border-border/60 last:border-0">
            <td className="py-2.5 pr-2">
                <p className="text-sm font-medium text-foreground">{t(`assessment.pattern.${item.pattern}`)}</p>
                {item.comment && <p className="mt-0.5 text-xs text-muted-foreground">{item.comment}</p>}
                <span className="mt-1 flex flex-wrap gap-1.5">
                    {item.pain && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300">
                            <AlertTriangle className="h-3 w-3" aria-hidden />
                            {t('assessment.flag.pain')}
                        </span>
                    )}
                    {item.clearing_positive === true && (
                        <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300">
                            {t('assessment.report.clearing')}: {t('assessment.report.clearingPositive')}
                        </span>
                    )}
                </span>
            </td>
            <td className="px-2 py-2.5 text-center">
                {item.is_per_side ? (
                    <span className="inline-flex items-center gap-1.5">
                        <SideScore value={item.score_left} weak={weakLeft} />
                        <span className="text-xs text-muted-foreground">/</span>
                        <SideScore value={item.score_right} weak={weakRight} />
                    </span>
                ) : (
                    <SideScore value={item.score_single} weak={false} />
                )}
            </td>
            <td className={cn('px-2 py-2.5 text-center text-base font-bold tabular-nums', scoreTone(item.final_score))}>
                {item.final_score}
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
        <Reveal as="section" className="rounded-2xl border border-border bg-card p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {t('assessment.band.label')}
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                        {assessment.risk_band && <PriorityBadge band={assessment.risk_band} size="lg" />}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                        {t('assessment.report.assessedAt')} {assessedAt}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('assessment.composite')}</p>
                    <p className="text-3xl font-extrabold tabular-nums text-foreground">
                        {assessment.composite_score ?? '—'}
                        <span className="text-base font-semibold text-muted-foreground">/21</span>
                    </p>
                </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                {assessment.has_pain && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-700 dark:text-red-300">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                        {t('assessment.flag.pain')}
                    </span>
                )}
                {assessment.has_asymmetry && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                        <Scale className="h-3.5 w-3.5" aria-hidden />
                        {t('assessment.flag.asymmetry')}
                    </span>
                )}
            </div>

            <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[320px] border-collapse">
                    <thead>
                        <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                            <th className="py-2 pr-2 font-semibold">{t('assessment.report.pattern')}</th>
                            <th className="px-2 py-2 text-center font-semibold">
                                {t('assessment.side.left')[0]}/{t('assessment.side.right')[0]}
                            </th>
                            <th className="px-2 py-2 text-center font-semibold">{t('assessment.report.final')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orderedItems.map((item) => (
                            <ItemRow key={item.id} item={item} />
                        ))}
                    </tbody>
                </table>
            </div>

            {assessment.notes && (
                <div className="mt-4 rounded-xl bg-muted/40 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('assessment.report.notes')}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{assessment.notes}</p>
                </div>
            )}

            <MovementDisclaimer className="mt-4" />
        </Reveal>
    )
}
