'use client'

import { motion } from 'framer-motion'
import { useTranslation } from '@/lib/i18n/LanguageContext'

const cards = [
    {
        tagKey: 'landing.usecases.card1.tag',
        titleKey: 'landing.usecases.card1.title',
        bodyKey: 'landing.usecases.card1.body',
    },
    {
        tagKey: 'landing.usecases.card2.tag',
        titleKey: 'landing.usecases.card2.title',
        bodyKey: 'landing.usecases.card2.body',
    },
    {
        tagKey: 'landing.usecases.card3.tag',
        titleKey: 'landing.usecases.card3.title',
        bodyKey: 'landing.usecases.card3.body',
    },
] as const

export function LandingUseCases() {
    const { t } = useTranslation()

    return (
        <section id="casos" className="relative scroll-mt-28 py-24 sm:py-28">
            <div className="mx-auto mb-12 max-w-2xl px-6 text-center">
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                >
                    <span className="mb-3 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        {t('landing.usecases.eyebrow')}
                    </span>
                    <h2 className="font-display text-3xl font-black tracking-tight text-foreground md:text-4xl">
                        {t('landing.usecases.title')}
                    </h2>
                    <p className="mt-3 text-sm text-muted-foreground md:text-base">{t('landing.usecases.subtitle')}</p>
                </motion.div>
            </div>

            <div className="mx-auto grid max-w-6xl gap-6 px-6 md:grid-cols-3">
                {cards.map((card, i) => (
                    <motion.article
                        key={card.titleKey}
                        initial={{ opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '-40px' }}
                        transition={{ delay: i * 0.06 }}
                        className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-7 shadow-sm dark:bg-card/80"
                    >
                        <div className="pointer-events-none absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-primary/[0.06] blur-3xl" />
                        <span className="relative w-fit rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                            {t(card.tagKey)}
                        </span>
                        <h3 className="relative mt-4 text-lg font-bold text-foreground">{t(card.titleKey)}</h3>
                        <p className="relative mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{t(card.bodyKey)}</p>
                    </motion.article>
                ))}
            </div>
        </section>
    )
}
