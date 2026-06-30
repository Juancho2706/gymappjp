'use client'

import Link from 'next/link'
import { ArrowLeft, PersonStanding } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { Card } from '@/components/ui/card'
import type { MovementAssessmentWithItems } from '@/domain/assessment/types'
import { AssessmentReportCard } from './AssessmentReportCard'
import { EvolutionCharts } from './EvolutionCharts'
import { MovementDisclaimer } from './MovementDisclaimer'

/** Vista del alumno: ultimo reporte final + evolucion + disclaimer (read-only). */
export function StudentMovementView({
    basePath,
    finals,
}: {
    basePath: string
    finals: MovementAssessmentWithItems[]
}) {
    const { t } = useTranslation()
    const latest = finals.length > 0 ? finals[finals.length - 1] : null

    return (
        <div className="min-h-dvh bg-surface-app pb-20">
            <header className="sticky top-0 z-40 border-b border-subtle bg-surface-app/95 px-4 py-4 pt-safe backdrop-blur-xl">
                <Link
                    href={`${basePath}/dashboard`}
                    className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:text-strong"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    {t('assessment.student.back')}
                </Link>
                <div className="mt-2 flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-sport-100 text-sport-600">
                        <PersonStanding className="h-[22px] w-[22px]" aria-hidden />
                    </span>
                    <div className="min-w-0">
                        <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em] text-strong">
                            {t('assessment.student.title')}
                        </h1>
                        <p className="mt-0.5 text-sm text-muted">{t('assessment.student.intro')}</p>
                    </div>
                </div>
            </header>

            <main className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6">
                {latest ? (
                    <>
                        <AssessmentReportCard assessment={latest} />
                        {finals.length >= 2 ? (
                            <EvolutionCharts finals={finals} />
                        ) : (
                            <p className="rounded-card border border-subtle bg-surface-sunken px-4 py-4 text-center text-xs text-muted">
                                {t('assessment.evolution.needTwo')}
                            </p>
                        )}
                    </>
                ) : (
                    <Card padding="lg" className="gap-0 text-center">
                        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-card bg-surface-sunken text-subtle">
                            <PersonStanding className="h-7 w-7" aria-hidden />
                        </div>
                        <p className="text-sm text-muted">{t('assessment.student.empty')}</p>
                        <MovementDisclaimer className="mt-4 text-left" />
                    </Card>
                )}
            </main>
        </div>
    )
}
