'use client'

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { MOVEMENT_PATTERNS_V1 } from '@eva/calc'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { Reveal } from '@/components/motion/Reveal'
import { Card } from '@/components/ui/card'
import type { MovementAssessmentWithItems } from '@/domain/assessment/types'

/** Color de la banda de prioridad segun el compuesto (mismos cortes que el reporte). */
function bandColor(composite: number | null): string {
    if (composite == null) return 'var(--text-subtle)'
    if (composite >= 17) return 'var(--success-500)'
    if (composite >= 14) return 'var(--warning-500)'
    return 'var(--danger-500)'
}

function patternFinal(a: MovementAssessmentWithItems, slug: string): number {
    return a.items.find((i) => i.pattern === slug)?.final_score ?? 0
}

/**
 * Evolucion temporal (AC4, con >= 2 finales): barras del compuesto a lo largo del
 * tiempo + comparativa por patron (primera vs ultima evaluacion con flechas). El
 * padre decide cuando renderizar.
 */
export function EvolutionCharts({ finals }: { finals: MovementAssessmentWithItems[] }) {
    const { t, language } = useTranslation()
    if (finals.length < 2) return null

    const locale = language === 'es' ? 'es-CL' : 'en-US'
    const fmtDate = (iso: string) =>
        new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short' })

    const first = finals[0]
    const last = finals[finals.length - 1]

    return (
        <Reveal as="section">
            <h2 className="mb-2.5 font-display text-[17px] font-extrabold tracking-[-0.02em] text-strong">
                {t('assessment.evolution.title')}
            </h2>
            <Card padding="md">
                {/* Barras del compuesto por evaluacion */}
                <p className="sr-only">{t('assessment.evolution.composite')}</p>
                <div className="mb-3.5 flex items-end gap-2">
                    {finals.map((f, i) => {
                        const composite = f.composite_score ?? 0
                        const h = Math.round((composite / 21) * 64) + 8
                        const isLast = i === finals.length - 1
                        return (
                            <div key={f.id} className="flex flex-1 flex-col items-center gap-1.5">
                                <span className="font-mono text-xs font-bold tabular-nums text-strong">
                                    {composite}
                                </span>
                                <div
                                    className="w-full max-w-[54px] rounded-[8px]"
                                    style={{
                                        height: h,
                                        background: bandColor(f.composite_score),
                                        opacity: isLast ? 1 : 0.4,
                                    }}
                                    aria-hidden
                                />
                                <span className="text-[10.5px] text-muted">{fmtDate(f.assessed_at)}</span>
                            </div>
                        )
                    })}
                    <div className="flex-[2]" aria-hidden />
                </div>

                {/* Comparativa por patron: primera vs ultima */}
                <p className="sr-only">
                    {t('assessment.evolution.first')} → {t('assessment.evolution.last')}
                </p>
                <div className="flex flex-col gap-[7px] border-t border-subtle pt-3">
                    {MOVEMENT_PATTERNS_V1.map((def) => {
                        const a = patternFinal(first, def.slug)
                        const b = patternFinal(last, def.slug)
                        const up = b > a
                        const down = b < a
                        const Arrow = up ? ArrowUpRight : down ? ArrowDownRight : Minus
                        const arrowColor = up
                            ? 'text-[color:var(--success-600)]'
                            : down
                              ? 'text-[color:var(--danger-600)]'
                              : 'text-subtle'
                        return (
                            <div key={def.slug} className="flex items-center gap-2.5">
                                <span className="flex-1 text-xs text-body">
                                    {t(`assessment.pattern.${def.slug}`)}
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="font-mono text-xs tabular-nums text-subtle">{a}</span>
                                    <Arrow className={`size-3.5 ${arrowColor}`} aria-hidden />
                                    <span className="font-mono text-[13px] font-bold tabular-nums text-strong">
                                        {b}
                                    </span>
                                </span>
                            </div>
                        )
                    })}
                </div>
            </Card>
        </Reveal>
    )
}
