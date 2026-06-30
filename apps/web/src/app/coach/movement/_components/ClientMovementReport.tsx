'use client'

import Link from 'next/link'
import { ArrowLeft, ClipboardCheck, LineChart, Printer } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import type { MovementClientDetail } from '@/services/assessment/movement-assessment.service'
import { Card } from '@/components/ui/card'
import { AssessmentReportCard } from '@/components/movement/AssessmentReportCard'
import { EvolutionCharts } from '@/components/movement/EvolutionCharts'
import { PriorityBadge } from '@/components/movement/PriorityBadge'
import { DeleteAssessmentButton } from './DeleteAssessmentButton'

/** Color del punto del semáforo por banda (alta = danger ... baja = success). */
const BAND_DOT: Record<string, string> = {
    high: 'var(--danger-500)',
    moderate: 'var(--warning-500)',
    low: 'var(--success-500)',
}

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
            {/* TopBar: volver + título + badge Módulo */}
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
                    <span className="inline-flex h-6 shrink-0 items-center rounded-pill bg-sport-100 px-2.5 text-[12px] font-bold text-sport-700">
                        Módulo
                    </span>
                </div>
            </header>

            {latest ? (
                <div className="space-y-5">
                    <AssessmentReportCard assessment={latest} />

                    {finals.length >= 2 ? (
                        <EvolutionCharts finals={finals} />
                    ) : (
                        <Card padding="md" className="flex items-center gap-2.5">
                            <LineChart className="size-[17px] shrink-0 text-subtle" aria-hidden />
                            <span className="text-[13px] text-muted">{t('assessment.evolution.needTwo')}</span>
                        </Card>
                    )}

                    {/* Historial — filas con semáforo + eliminar inline */}
                    <section>
                        <h2 className="mb-2.5 font-display text-[17px] font-extrabold tracking-[-0.02em] text-strong">
                            {t('assessment.report.history')}
                        </h2>
                        <Card padding="none" className="overflow-hidden">
                            {[...finals].reverse().map((a, i) => (
                                <div key={a.id}>
                                    {i > 0 && <div className="mx-3.5 h-px bg-subtle" aria-hidden />}
                                    <div className="flex items-center gap-3 px-3.5 py-3">
                                        <span
                                            className="size-2.5 shrink-0 rounded-full"
                                            style={{ background: a.risk_band ? BAND_DOT[a.risk_band] : 'var(--text-subtle)' }}
                                            aria-hidden
                                        />
                                        <div className="min-w-0 flex-1">
                                            {a.risk_band ? (
                                                <p className="text-sm font-semibold text-strong">
                                                    {t(`assessment.band.${a.risk_band}`)}
                                                </p>
                                            ) : (
                                                <PriorityBadge band="low" />
                                            )}
                                            <p className="font-mono text-xs tabular-nums text-muted">
                                                {a.composite_score}/21 ·{' '}
                                                {new Date(a.assessed_at).toLocaleDateString(locale, {
                                                    day: '2-digit',
                                                    month: 'short',
                                                    year: 'numeric',
                                                })}
                                            </p>
                                        </div>
                                        <DeleteAssessmentButton clientId={clientId} assessmentId={a.id} />
                                    </div>
                                </div>
                            ))}
                        </Card>
                    </section>

                    {/* Acciones inferiores */}
                    <div className="flex gap-2.5">
                        <Link
                            href={`/coach/movement/${clientId}/print?assessment=${latest.id}`}
                            target="_blank"
                            className="inline-flex min-h-12 items-center gap-1.5 rounded-control border-[1.5px] border-default bg-surface-card px-4 text-sm font-bold text-strong transition-colors hover:bg-surface-sunken"
                        >
                            <Printer className="size-[18px]" aria-hidden />
                            {language === 'es' ? 'Imprimir' : 'Print'}
                        </Link>
                        <Link
                            href={`/coach/movement/${clientId}/new`}
                            className="inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-control bg-[var(--cta-fill)] px-4 text-sm font-bold text-[var(--text-on-sport)] shadow-[var(--shadow-sm)] transition-opacity hover:opacity-90 active:scale-[0.99]"
                        >
                            <ClipboardCheck className="size-[18px]" aria-hidden />
                            {draft ? t('assessment.report.resumeDraft') : t('assessment.report.newAssessment')}
                        </Link>
                    </div>
                </div>
            ) : (
                <Card padding="lg" className="text-center">
                    <p className="text-sm text-muted">{t('assessment.report.empty')}</p>
                    <Link
                        href={`/coach/movement/${clientId}/new`}
                        className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-control bg-[var(--cta-fill)] px-5 text-sm font-bold text-[var(--text-on-sport)] shadow-[var(--glow-sport)] transition-opacity hover:opacity-90 active:scale-[0.97]"
                    >
                        <ClipboardCheck className="size-4" aria-hidden />
                        {draft ? t('assessment.report.resumeDraft') : t('assessment.report.emptyCta')}
                    </Link>
                </Card>
            )}
        </div>
    )
}
