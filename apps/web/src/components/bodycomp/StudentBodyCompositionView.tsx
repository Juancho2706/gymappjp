'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Gauge, Info } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { fadeSlideLeft } from '@/lib/animation-presets'
import { RevealStagger, RevealItem } from '@/components/motion/Reveal'
import type { BodyCompositionRow } from '@/infrastructure/db/body-composition.repository'
import { StudentBiaSummary } from './StudentBiaSummary'
import { StudentBiaTrend } from './StudentBiaTrend'
import { StudentIsakSummary } from './StudentIsakSummary'
import { StudentIsakTrend } from './StudentIsakTrend'

type Method = 'bia' | 'isak'

/**
 * Vista del alumno (read-only): sus mediciones de composicion corporal + evolucion.
 * Espeja la estructura de StudentMovementView (header sticky back-to-dashboard, max-w, empty state),
 * con foco visual: count-up en las cards, draw-in de los charts (gated por reduced-motion), barra
 * apilada de fraccionamiento Kerr y switcher de metodo (solo si ambos metodos tienen data).
 */
export function StudentBodyCompositionView({
    basePath,
    bia,
    isak,
}: {
    basePath: string
    bia: BodyCompositionRow[]
    isak: BodyCompositionRow[]
}) {
    const { t } = useTranslation()
    const reduce = useReducedMotion()
    const hasBia = bia.length > 0
    const hasIsak = isak.length > 0
    const hasBoth = hasBia && hasIsak

    // Metodo inicial: el primero que tenga data (BIA tiene prioridad por ser el captura del coach).
    const [method, setMethod] = useState<Method>(hasBia ? 'bia' : 'isak')
    const active: Method = hasBoth ? method : hasBia ? 'bia' : 'isak'

    return (
        <div className="min-h-dvh bg-surface-app pb-20">
            <header className="sticky top-0 z-40 border-b border-subtle bg-surface-app/95 px-4 py-4 pt-safe backdrop-blur-xl">
                <div className="flex items-center gap-3">
                    <Link
                        href={`${basePath}/dashboard`}
                        aria-label={t('bodycomp.student.back')}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-surface-sunken text-strong transition-colors hover:bg-surface-card"
                    >
                        <ChevronLeft className="h-5 w-5" aria-hidden />
                    </Link>
                    <div className="min-w-0 flex-1">
                        <h1 className="font-display text-[26px] font-black leading-[1.1] tracking-[-0.03em] text-strong">
                            {t('bodycomp.student.title')}
                        </h1>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--success-100)] px-2.5 py-1 text-[11px] font-bold text-[var(--success-700)]">
                        Módulo
                    </span>
                </div>
                <p className="mt-2 text-sm text-muted">{t('bodycomp.student.intro')}</p>
            </header>

            <main className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6">
                {hasBia || hasIsak ? (
                    <>
                        {/* Switcher de metodo: solo si AMBOS metodos tienen data. */}
                        {hasBoth && (
                            <div className="flex gap-1 rounded-control bg-surface-sunken p-1">
                                {([
                                    { key: 'bia', label: t('bodycomp.student.methodBia') },
                                    { key: 'isak', label: t('bodycomp.student.methodIsak') },
                                ] as const).map((m) => (
                                    <button
                                        key={m.key}
                                        type="button"
                                        onClick={() => setMethod(m.key)}
                                        className={cn(
                                            'min-h-12 flex-1 rounded-[10px] px-3 py-2 text-sm font-bold transition-colors',
                                            active === m.key
                                                ? 'bg-surface-card text-strong shadow-sm'
                                                : 'text-muted hover:text-strong'
                                        )}
                                        style={active === m.key ? { color: 'var(--theme-primary)' } : undefined}
                                    >
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={active}
                                variants={fadeSlideLeft}
                                initial={reduce ? false : 'hidden'}
                                animate="show"
                                exit={reduce ? undefined : 'hidden'}
                                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                            >
                                <RevealStagger className="space-y-5">
                                    {active === 'bia' ? (
                                        <>
                                            <RevealItem>
                                                <StudentBiaSummary rows={bia} />
                                            </RevealItem>
                                            <RevealItem>
                                                {bia.length >= 2 ? (
                                                    <StudentBiaTrend rows={bia} />
                                                ) : (
                                                    <NeedTwo />
                                                )}
                                            </RevealItem>
                                        </>
                                    ) : (
                                        <>
                                            <RevealItem>
                                                <StudentIsakSummary rows={isak} />
                                            </RevealItem>
                                            <RevealItem>
                                                {isak.length >= 2 ? (
                                                    <StudentIsakTrend rows={isak} />
                                                ) : (
                                                    <NeedTwo />
                                                )}
                                            </RevealItem>
                                        </>
                                    )}
                                </RevealStagger>
                            </motion.div>
                        </AnimatePresence>

                        <Disclaimer />
                    </>
                ) : (
                    <Card padding="lg" className="gap-0 text-center">
                        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-card bg-surface-sunken text-subtle">
                            <Gauge className="h-7 w-7" aria-hidden />
                        </div>
                        <p className="text-sm text-muted">{t('bodycomp.student.empty')}</p>
                        <Disclaimer className="mt-4 text-left" />
                    </Card>
                )}
            </main>
        </div>
    )
}

function NeedTwo() {
    const { t } = useTranslation()
    return (
        <p className="rounded-card border border-subtle bg-surface-sunken px-4 py-4 text-center text-xs text-muted">
            {t('bodycomp.student.needTwo')}
        </p>
    )
}

function Disclaimer({ className }: { className?: string }) {
    const { t } = useTranslation()
    return (
        <p
            className={cn(
                'flex items-start gap-2 rounded-control border border-subtle bg-surface-sunken px-3 py-2 text-xs leading-relaxed text-muted',
                className
            )}
        >
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {t('bodycomp.student.disclaimer')}
        </p>
    )
}
