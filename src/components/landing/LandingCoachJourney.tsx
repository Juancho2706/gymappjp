'use client'

import {
    LayoutDashboard,
    Users,
    Dumbbell,
    Utensils,
    Camera,
    Palette,
    type LucideIcon,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { cn } from '@/lib/utils'

type Chapter = {
    titleKey: string
    bullets: [string, string, string]
    icon: LucideIcon
    className?: string
}

const chapters: Chapter[] = [
    {
        titleKey: 'landing.journey.c1.title',
        bullets: ['landing.journey.c1.b1', 'landing.journey.c1.b2', 'landing.journey.c1.b3'],
        icon: LayoutDashboard,
        className: 'md:col-span-2',
    },
    {
        titleKey: 'landing.journey.c2.title',
        bullets: ['landing.journey.c2.b1', 'landing.journey.c2.b2', 'landing.journey.c2.b3'],
        icon: Users,
    },
    {
        titleKey: 'landing.journey.c3.title',
        bullets: ['landing.journey.c3.b1', 'landing.journey.c3.b2', 'landing.journey.c3.b3'],
        icon: Dumbbell,
        className: 'md:col-span-2',
    },
    {
        titleKey: 'landing.journey.c4.title',
        bullets: ['landing.journey.c4.b1', 'landing.journey.c4.b2', 'landing.journey.c4.b3'],
        icon: Utensils,
    },
    {
        titleKey: 'landing.journey.c5.title',
        bullets: ['landing.journey.c5.b1', 'landing.journey.c5.b2', 'landing.journey.c5.b3'],
        icon: Camera,
        className: 'md:col-span-2',
    },
    {
        titleKey: 'landing.journey.c6.title',
        bullets: ['landing.journey.c6.b1', 'landing.journey.c6.b2', 'landing.journey.c6.b3'],
        icon: Palette,
    },
]

export function LandingCoachJourney() {
    const { t } = useTranslation()

    return (
        <section
            id="recorrido-coach"
            className="relative scroll-mt-28 border-t border-border/40 py-24 sm:py-28 landing-section-alt"
        >
            <div className="pointer-events-none absolute inset-0 landing-noise opacity-50" />
            <div className="relative mx-auto max-w-6xl px-6">
                <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-50px' }}
                    className="mx-auto mb-14 max-w-2xl text-center"
                >
                    <span className="mb-3 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        {t('landing.journey.eyebrow')}
                    </span>
                    <h2 className="font-display text-3xl font-black tracking-tight text-foreground md:text-4xl lg:text-5xl">
                        {t('landing.journey.title')}
                    </h2>
                    <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">{t('landing.journey.subtitle')}</p>
                </motion.div>

                <div className="grid gap-4 md:grid-cols-2">
                    {chapters.map((ch, i) => {
                        const Icon = ch.icon
                        return (
                            <motion.article
                                key={ch.titleKey}
                                initial={{ opacity: 0, y: 18 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: '-30px' }}
                                transition={{ delay: i * 0.04, duration: 0.45 }}
                                className={cn(
                                    'group relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow duration-300 hover:shadow-md dark:bg-card/80',
                                    ch.className
                                )}
                            >
                                <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/[0.07] blur-2xl transition-all duration-500 group-hover:bg-primary/[0.12]" />
                                <div className="relative flex items-start gap-4">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/50 text-primary">
                                        <Icon className="h-5 w-5" aria-hidden />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h3 className="font-display text-lg font-bold text-foreground md:text-xl">{t(ch.titleKey)}</h3>
                                        <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-muted-foreground">
                                            {ch.bullets.map((bk) => (
                                                <li key={bk} className="flex gap-2">
                                                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary/70" aria-hidden />
                                                    <span>{t(bk)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </motion.article>
                        )
                    })}
                </div>
            </div>
        </section>
    )
}
