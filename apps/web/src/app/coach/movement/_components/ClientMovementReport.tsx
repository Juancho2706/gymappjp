'use client'

import Link from 'next/link'
import { ArrowLeft, ClipboardList, Printer } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import type { MovementClientDetail } from '@/services/assessment/movement-assessment.service'
import { Card } from '@/components/ui/card'
import { AssessmentReportCard } from '@/components/movement/AssessmentReportCard'
import { EvolutionCharts } from '@/components/movement/EvolutionCharts'
import { PriorityBadge } from '@/components/movement/PriorityBadge'
import { DeleteAssessmentButton } from './DeleteAssessmentButton'

/**
 * Detalle del alumno: ultimo reporte final + evolucion (>=2 finales) + historial
 * con eliminar (final inmutable) + CTA evaluar/retomar + print.
 */
export function ClientMovementReport({
    clientId,
    detail,
}: {
    clientId: string
    detail: MovementClientDetail
}) {
    const { t, language } = useTranslation()
    const locale = language === 'es' ? 'es-CL' : 'en-US'

    const finals = detail.finals
    const latest = finals.length > 0 ? finals[finals.length - 1] : null
    const draft = detail.assessments.find((a) => a.status === 'draft') ?? null

    return (
        <div className="mx-auto w-full max-w-3xl px-4 py-6 pb-16">
            <header className="mb-5">
                <Link
                    href="/coach/movement"
                    className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-strong"
                >
                    <ArrowLeft className="size-4" aria-hidden />
                    {t('assessment.title')}
                </Link>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                    <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em] text-strong">
                        {detail.clientName ?? '—'}
                    </h1>
                    <span className="flex flex-wrap gap-2">
                        {latest && (
                            <Link
                                href={`/coach/movement/${clientId}/print?assessment=${latest.id}`}
                                target="_blank"
                                className="inline-flex min-h-11 items-center gap-1.5 rounded-control border-[1.5px] border-default bg-surface-card px-4 text-xs font-bold text-strong transition-colors hover:bg-surface-sunken"
                            >
                                <Printer className="size-4" aria-hidden />
                                {t('assessment.report.print')}
                            </Link>
                        )}
                        <Link
                            href={`/coach/movement/${clientId}/new`}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-control bg-[var(--cta-fill)] px-4 text-xs font-bold text-[var(--text-on-sport)] shadow-[var(--shadow-sm)] transition-opacity hover:opacity-90 active:scale-[0.97]"
                        >
                            <ClipboardList className="size-4" aria-hidden />
                            {draft ? t('assessment.report.resumeDraft') : t('assessment.report.newAssessment')}
                        </Link>
                    </span>
                </div>
            </header>

            {latest ? (
                <div className="space-y-5">
                    <AssessmentReportCard assessment={latest} />

                    {finals.length >= 2 ? (
                        <EvolutionCharts finals={finals} />
                    ) : (
                        <Card padding="md" className="text-center text-xs text-muted">
                            {t('assessment.evolution.needTwo')}
                        </Card>
                    )}

                    <Card padding="md">
                        <h2 className="text-sm font-bold uppercase tracking-[0.06em] text-muted">
                            {t('assessment.report.history')}
                        </h2>
                        <ul className="mt-2 divide-y divide-[color:var(--border-subtle)]">
                            {[...finals].reverse().map((a) => (
                                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                                    <span className="flex items-center gap-3">
                                        {a.risk_band && <PriorityBadge band={a.risk_band} />}
                                        <span className="font-mono text-sm tabular-nums text-strong">
                                            {a.composite_score}/21
                                        </span>
                                        <span className="text-xs text-muted">
                                            {new Date(a.assessed_at).toLocaleDateString(locale, {
                                                day: '2-digit',
                                                month: 'short',
                                                year: 'numeric',
                                            })}
                                        </span>
                                    </span>
                                    <DeleteAssessmentButton clientId={clientId} assessmentId={a.id} />
                                </li>
                            ))}
                        </ul>
                    </Card>
                </div>
            ) : (
                <Card padding="lg" className="text-center">
                    <p className="text-sm text-muted">{t('assessment.report.empty')}</p>
                    <Link
                        href={`/coach/movement/${clientId}/new`}
                        className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-control bg-[var(--cta-fill)] px-5 text-sm font-bold text-[var(--text-on-sport)] shadow-[var(--glow-sport)] transition-opacity hover:opacity-90 active:scale-[0.97]"
                    >
                        <ClipboardList className="size-4" aria-hidden />
                        {draft ? t('assessment.report.resumeDraft') : t('assessment.report.emptyCta')}
                    </Link>
                </Card>
            )}
        </div>
    )
}
