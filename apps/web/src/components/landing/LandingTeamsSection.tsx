'use client'

import { motion } from 'framer-motion'
import { Activity, ArrowRight, Palette, Settings2, Users2 } from 'lucide-react'
import { SALES_EMAIL } from '@/lib/brand-assets'
import { useTranslation } from '@/lib/i18n/LanguageContext'

/**
 * Seccion Teams de la landing (plan 02 / F2). Reemplaza a la antigua
 * `LandingEnterpriseSection` en el mismo slot. Acento emerald (D2 — color de
 * marca EVA `#10B981`). REGLA DURA (memoria project-movida-commercial): CERO
 * numeros de precio aqui — ni "$X", ni rangos, ni "ahorra X%", ni UF.
 */

type ValueProp = {
    icon: typeof Users2
    titleKey: string
    descKey: string
}

const VALUE_PROPS: ValueProp[] = [
    { icon: Users2, titleKey: 'landing.teams.prop1.title', descKey: 'landing.teams.prop1.desc' },
    { icon: Palette, titleKey: 'landing.teams.prop2.title', descKey: 'landing.teams.prop2.desc' },
    { icon: Activity, titleKey: 'landing.teams.prop3.title', descKey: 'landing.teams.prop3.desc' },
    { icon: Settings2, titleKey: 'landing.teams.prop4.title', descKey: 'landing.teams.prop4.desc' },
]

export function LandingTeamsSection() {
    const { t } = useTranslation()

    return (
        <section
            id="teams"
            className="relative scroll-mt-28 border-t border-border/50 py-16 sm:py-24"
            aria-labelledby="teams-section-heading"
        >
            <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.5 }}
                    className="mb-12 text-center"
                >
                    <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
                        {t('landing.teams.eyebrow')}
                    </span>

                    <h2
                        id="teams-section-heading"
                        className="mt-5 font-display text-3xl font-black tracking-tight text-foreground sm:text-4xl"
                    >
                        {t('landing.teams.title')}
                    </h2>
                </motion.div>

                {/* Value props */}
                <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {VALUE_PROPS.map((prop, i) => (
                        <motion.div
                            key={prop.titleKey}
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: '-40px' }}
                            transition={{ duration: 0.4, delay: i * 0.08 }}
                            className="rounded-2xl border border-border bg-card p-5 transition-colors duration-300 hover:border-emerald-500/40"
                        >
                            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
                                <prop.icon
                                    className="h-5 w-5 text-emerald-600 dark:text-emerald-400"
                                    aria-hidden
                                    strokeWidth={1.5}
                                />
                            </div>
                            <h3 className="mb-1 text-sm font-bold text-foreground">
                                {t(prop.titleKey)}
                            </h3>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                {t(prop.descKey)}
                            </p>
                        </motion.div>
                    ))}
                </div>

                {/* CTA card */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 backdrop-blur-sm sm:p-8 dark:bg-emerald-500/[0.06]"
                >
                    <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-lg font-black text-foreground">
                                {t('landing.teams.cta')}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {t('landing.teams.ctaSub')}
                            </p>
                        </div>

                        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                            <a
                                href="/api/contact-teams?src=teams-section"
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 text-sm font-bold text-white shadow-[0_2px_12px_rgba(16,185,129,0.3)] transition-all hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-emerald-950"
                            >
                                {t('landing.teams.cta')}
                                <ArrowRight className="h-4 w-4" aria-hidden />
                            </a>
                            <span className="text-[11px] text-muted-foreground">
                                {SALES_EMAIL}
                            </span>
                        </div>
                    </div>
                </motion.div>
            </div>
        </section>
    )
}
