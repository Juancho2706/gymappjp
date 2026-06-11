'use client'

import Link from 'next/link'
import { ClipboardList, FilePen } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import type { MovementHubData } from '@/services/assessment/movement-assessment.service'
import { PriorityBadge } from '@/components/movement/PriorityBadge'
import { MovementDisclaimer } from '@/components/movement/MovementDisclaimer'

/** Hub del modulo: alumnos del workspace ACTIVO con su ultimo semaforo y CTA evaluar. */
export function MovementHubList({ data }: { data: MovementHubData }) {
    const { t, language } = useTranslation()
    const locale = language === 'es' ? 'es-CL' : 'en-US'

    return (
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
            <header className="mb-5">
                <h1 className="text-2xl font-bold text-foreground">{t('assessment.title')}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t('assessment.hub.subtitle')}</p>
            </header>

            {data.clients.length === 0 ? (
                <p className="rounded-2xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                    {t('assessment.hub.empty')}
                </p>
            ) : (
                <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border bg-card">
                    {data.clients.map((c) => (
                        <li key={c.client_id} className="flex items-center justify-between gap-3 px-4 py-3">
                            <Link
                                href={`/coach/movement/${c.client_id}`}
                                className="min-h-11 min-w-0 flex-1 py-1"
                            >
                                <p className="truncate text-sm font-semibold text-foreground">
                                    {c.full_name ?? '—'}
                                </p>
                                <span className="mt-1 flex flex-wrap items-center gap-2">
                                    {c.latest_final?.risk_band ? (
                                        <>
                                            <PriorityBadge band={c.latest_final.risk_band} />
                                            <span className="text-xs tabular-nums text-muted-foreground">
                                                {c.latest_final.composite_score}/21 ·{' '}
                                                {new Date(c.latest_final.assessed_at).toLocaleDateString(locale, {
                                                    day: '2-digit',
                                                    month: 'short',
                                                    year: 'numeric',
                                                })}
                                            </span>
                                        </>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">
                                            {t('assessment.hub.noAssessment')}
                                        </span>
                                    )}
                                    {c.draft_id && (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                                            <FilePen className="h-3 w-3" aria-hidden />
                                            {t('assessment.report.draftPending')}
                                        </span>
                                    )}
                                </span>
                            </Link>
                            <Link
                                href={`/coach/movement/${c.client_id}/new`}
                                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow transition-opacity hover:opacity-90"
                            >
                                <ClipboardList className="h-4 w-4" aria-hidden />
                                {c.draft_id ? t('assessment.hub.resume') : t('assessment.hub.evaluate')}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}

            <MovementDisclaimer className="mt-5" />
        </div>
    )
}
