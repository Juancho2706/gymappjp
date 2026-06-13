'use client'

import { motion } from 'framer-motion'
import { Activity, ClipboardCheck, Ruler, Salad, Sparkles } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'

/**
 * Seccion "Modulos profesionales" de la landing. Presenta los 4 modulos de pago
 * (cardio, movimiento, composicion corporal, nutricion por intercambios) como
 * add-ons profesionales que se suman al plan, mas el mensaje de que vienen mas.
 * REGLA DURA (memoria project-movida-commercial): CERO numeros de precio aqui —
 * "de pago" se comunica con copy, nunca con cifras (los precios llegan post-cierre).
 * Acento NEUTRAL (no emerald) para no competir con la seccion Teams ni con el CTA
 * de registro (primary). Va despues del pricing preview.
 */

type ModuleItem = {
    icon: typeof Activity
    titleKey: string
    descKey: string
}

const MODULES: ModuleItem[] = [
    { icon: Activity, titleKey: 'landing.modules.m1.title', descKey: 'landing.modules.m1.desc' },
    { icon: ClipboardCheck, titleKey: 'landing.modules.m2.title', descKey: 'landing.modules.m2.desc' },
    { icon: Ruler, titleKey: 'landing.modules.m3.title', descKey: 'landing.modules.m3.desc' },
    { icon: Salad, titleKey: 'landing.modules.m4.title', descKey: 'landing.modules.m4.desc' },
]

export function LandingModulesSection() {
    const { t } = useTranslation()

    return (
        <section
            id="modulos"
            className="relative scroll-mt-28 border-t border-border/50 py-16 sm:py-24"
            aria-labelledby="modules-section-heading"
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
                    <span className="inline-flex items-center rounded-full border border-border bg-secondary/60 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                        {t('landing.modules.eyebrow')}
                    </span>

                    <h2
                        id="modules-section-heading"
                        className="mt-5 font-display text-3xl font-black tracking-tight text-foreground sm:text-4xl"
                    >
                        {t('landing.modules.title')}
                    </h2>
                    <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                        {t('landing.modules.subtitle')}
                    </p>
                </motion.div>

                {/* Module cards */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {MODULES.map((mod, i) => (
                        <motion.div
                            key={mod.titleKey}
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: '-40px' }}
                            transition={{ duration: 0.4, delay: i * 0.08 }}
                            className="rounded-2xl border border-border bg-card p-5 transition-colors duration-300 hover:border-primary/40"
                        >
                            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-secondary/60">
                                <mod.icon
                                    className="h-5 w-5 text-foreground"
                                    aria-hidden
                                    strokeWidth={1.5}
                                />
                            </div>
                            <h3 className="mb-1 text-sm font-bold text-foreground">
                                {t(mod.titleKey)}
                            </h3>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                {t(mod.descKey)}
                            </p>
                        </motion.div>
                    ))}
                </div>

                {/* "más en camino" footnote */}
                <motion.p
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    className="mt-8 flex items-center justify-center gap-2 text-center text-xs font-medium text-muted-foreground"
                >
                    <Sparkles className="h-4 w-4 text-primary" aria-hidden strokeWidth={1.5} />
                    {t('landing.modules.footnote')}
                </motion.p>
            </div>
        </section>
    )
}
