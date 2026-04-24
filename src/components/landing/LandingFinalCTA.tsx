'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

const fadeUp = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.25, 0.4, 0.25, 1] as const } },
}

const primaryCta =
    'inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-bold px-8 py-4 rounded-full text-base transition-all shadow-[var(--shadow-glow-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function LandingFinalCTA() {
    const { t } = useTranslation()
    return (
        <section className="landing-section-final relative border-t border-border/40 py-24 sm:py-28 landing-section-alt">
            <div className="absolute inset-0 bg-gradient-to-t from-primary/[0.04] to-transparent pointer-events-none" />

            <motion.div
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className="relative max-w-3xl mx-auto px-6 text-center"
            >
                <h2 className="text-4xl md:text-5xl font-black text-foreground mb-6 leading-tight font-display tracking-tight">
                    {t('landing.final.title1')}
                    <br />
                    <span className="bg-gradient-to-r from-primary to-sky-500 bg-clip-text text-transparent">
                        {t('landing.final.title2')}
                    </span>
                </h2>
                <p className="text-muted-foreground text-base md:text-lg mb-10 max-w-lg mx-auto leading-relaxed">
                    {t('landing.final.subtitle')}
                </p>
                <Link href="/register?tier=pro&cycle=monthly" className={`${primaryCta} text-lg px-10 py-5`}>
                    {t('landing.final.cta')}
                    <ArrowRight className="w-5 h-5" aria-hidden />
                </Link>
            </motion.div>
        </section>
    )
}
