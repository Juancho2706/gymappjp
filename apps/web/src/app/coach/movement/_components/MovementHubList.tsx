'use client'

import Link from 'next/link'
import { ChevronRight, ClipboardCheck, ClipboardList } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import type { MovementHubData } from '@/services/assessment/movement-assessment.service'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PriorityBadge } from '@/components/movement/PriorityBadge'
import { MovementDisclaimer } from '@/components/movement/MovementDisclaimer'

/** Hub del modulo: alumnos del workspace ACTIVO con su ultimo semaforo y CTA evaluar. */
export function MovementHubList({ data }: { data: MovementHubData }) {
    const { t, language } = useTranslation()
    const locale = language === 'es' ? 'es-CL' : 'en-US'

    return (
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
            <header className="mb-5 flex items-start justify-between gap-3">
                <div>
                    <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em] text-strong">
                        {t('assessment.title')}
                    </h1>
                    <p className="mt-1 text-sm text-muted">{t('assessment.hub.subtitle')}</p>
                </div>
                <span className="inline-flex h-6 shrink-0 items-center rounded-pill bg-sport-100 px-2.5 text-[12px] font-bold text-sport-700">
                    Módulo
                </span>
            </header>

            {data.clients.length === 0 ? (
                <Card padding="lg" className="text-center text-sm text-muted">
                    {t('assessment.hub.empty')}
                </Card>
            ) : (
                <>
                {/* Pista de uso — espejo del info strip del kit (MovementHub) */}
                <div className="mb-3.5 flex items-center gap-2.5 rounded-control bg-surface-sunken px-3.5 py-2.5">
                    <ClipboardCheck className="size-[15px] shrink-0 text-subtle" aria-hidden />
                    <span className="flex-1 text-xs leading-snug text-muted">
                        {t('assessment.hub.hint')}
                    </span>
                </div>
                <Card padding="none">
                    {data.clients.map((c, i) => (
                        <div
                            key={c.client_id}
                            className={`flex items-center gap-3 px-3.5 py-3 ${i > 0 ? 'border-t border-subtle' : ''}`}
                        >
                            <Link
                                href={`/coach/movement/${c.client_id}`}
                                className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-control py-1 outline-none transition-colors hover:bg-surface-sunken focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                            >
                                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--ink-900)] font-display text-[15px] font-extrabold text-sport-400">
                                    {(c.full_name ?? '—').charAt(0).toUpperCase()}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[15px] font-bold text-strong">
                                        {c.full_name ?? '—'}
                                    </p>
                                    <span className="mt-0.5 flex flex-wrap items-center gap-2">
                                        {c.latest_final?.risk_band ? (
                                            <>
                                                <PriorityBadge band={c.latest_final.risk_band} />
                                                <span className="text-xs tabular-nums text-muted">
                                                    {c.latest_final.composite_score}/21 ·{' '}
                                                    {new Date(c.latest_final.assessed_at).toLocaleDateString(locale, {
                                                        day: '2-digit',
                                                        month: 'short',
                                                        year: 'numeric',
                                                    })}
                                                </span>
                                            </>
                                        ) : (
                                            <span className="text-xs text-subtle">
                                                {t('assessment.hub.noAssessment')}
                                            </span>
                                        )}
                                        {c.draft_id && (
                                            <Badge tone="warning" variant="soft" size="sm">
                                                {t('assessment.report.draftPending')}
                                            </Badge>
                                        )}
                                    </span>
                                </div>
                                <ChevronRight className="size-[18px] shrink-0 text-[var(--ink-300)]" aria-hidden />
                            </Link>
                            <Link
                                href={`/coach/movement/${c.client_id}/new`}
                                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control bg-[var(--cta-fill)] px-4 text-xs font-bold text-[var(--text-on-sport)] shadow-[var(--shadow-sm)] transition-opacity hover:opacity-90 active:scale-[0.97]"
                            >
                                <ClipboardList className="size-4" aria-hidden />
                                {c.draft_id ? t('assessment.hub.resume') : t('assessment.hub.evaluate')}
                            </Link>
                        </div>
                    ))}
                </Card>
                </>
            )}

            <MovementDisclaimer className="mt-5" />
        </div>
    )
}
