'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
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
        <div className="min-h-dvh bg-background pb-20">
            <header className="sticky top-0 z-40 border-b border-border/10 bg-background/95 px-4 py-4 pt-safe backdrop-blur-xl">
                <Link
                    href={`${basePath}/dashboard`}
                    className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    {t('assessment.student.back')}
                </Link>
                <h1 className="mt-2 text-2xl font-bold text-foreground">{t('assessment.student.title')}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t('assessment.student.intro')}</p>
            </header>

            <main className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6">
                {latest ? (
                    <>
                        <AssessmentReportCard assessment={latest} />
                        {finals.length >= 2 ? (
                            <EvolutionCharts finals={finals} />
                        ) : (
                            <p className="rounded-2xl border border-border bg-card px-4 py-4 text-center text-xs text-muted-foreground">
                                {t('assessment.evolution.needTwo')}
                            </p>
                        )}
                    </>
                ) : (
                    <div className="rounded-2xl border border-border bg-card px-4 py-10 text-center">
                        <p className="text-sm text-muted-foreground">{t('assessment.student.empty')}</p>
                        <MovementDisclaimer className="mt-4 text-left" />
                    </div>
                )}
            </main>
        </div>
    )
}
