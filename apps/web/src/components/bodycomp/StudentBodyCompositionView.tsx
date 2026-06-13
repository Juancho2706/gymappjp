'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Info } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { cn } from '@/lib/utils'
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
        <div className="min-h-dvh bg-background pb-20">
            <header className="sticky top-0 z-40 border-b border-border/10 bg-background/95 px-4 py-4 pt-safe backdrop-blur-xl">
                <Link
                    href={`${basePath}/dashboard`}
                    className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    {t('bodycomp.student.back')}
                </Link>
                <h1 className="mt-2 text-2xl font-bold text-foreground">{t('bodycomp.student.title')}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t('bodycomp.student.intro')}</p>
            </header>

            <main className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6">
                {hasBia || hasIsak ? (
                    <>
                        {/* Switcher de metodo: solo si AMBOS metodos tienen data. */}
                        {hasBoth && (
                            <div className="flex gap-1.5 rounded-2xl bg-secondary/30 p-1.5">
                                {([
                                    { key: 'bia', label: t('bodycomp.student.methodBia') },
                                    { key: 'isak', label: t('bodycomp.student.methodIsak') },
                                ] as const).map((m) => (
                                    <button
                                        key={m.key}
                                        type="button"
                                        onClick={() => setMethod(m.key)}
                                        className={cn(
                                            'min-h-12 flex-1 rounded-xl px-3 py-2 text-sm font-bold transition-colors',
                                            active === m.key
                                                ? 'bg-background text-foreground shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground'
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
                    <div className="rounded-2xl border border-border bg-card px-4 py-10 text-center">
                        <p className="text-sm text-muted-foreground">{t('bodycomp.student.empty')}</p>
                        <Disclaimer className="mt-4 text-left" />
                    </div>
                )}
            </main>
        </div>
    )
}

function NeedTwo() {
    const { t } = useTranslation()
    return (
        <p className="rounded-2xl border border-border bg-card px-4 py-4 text-center text-xs text-muted-foreground">
            {t('bodycomp.student.needTwo')}
        </p>
    )
}

function Disclaimer({ className }: { className?: string }) {
    const { t } = useTranslation()
    return (
        <p
            className={cn(
                'flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground',
                className
            )}
        >
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {t('bodycomp.student.disclaimer')}
        </p>
    )
}
