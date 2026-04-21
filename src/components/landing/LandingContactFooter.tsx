'use client'

import Link from 'next/link'
import { ArrowRight, Mail } from 'lucide-react'
import { LandingBrandMark } from '@/components/landing/LandingBrandMark'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { motion } from 'framer-motion'

export function LandingContactFooter() {
    const { t } = useTranslation()
    const year = new Date().getFullYear()

    return (
        <>
            <section
                id="contacto"
                className="relative scroll-mt-28 border-t border-border/50 bg-muted/20 py-20 sm:py-24"
            >
                <div className="mx-auto max-w-6xl px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="mx-auto max-w-xl text-center"
                    >
                        <h2 className="font-display text-3xl font-black tracking-tight text-foreground md:text-4xl">
                            {t('landing.contact.title')}
                        </h2>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">{t('landing.contact.subtitle')}</p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 14 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="mx-auto mt-10 flex max-w-lg flex-col items-center gap-6 rounded-2xl border border-border bg-card p-8 text-center shadow-sm dark:bg-card/90"
                    >
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
                            <Mail className="h-6 w-6" aria-hidden />
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t('landing.contact.emailLabel')}</p>
                            <a
                                href="mailto:contacto@eva-app.cl"
                                className="mt-1 inline-block text-lg font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
                            >
                                contacto@eva-app.cl
                            </a>
                        </div>
                        <Link
                            href="/register?tier=pro&cycle=monthly"
                            className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-sm font-bold text-primary-foreground shadow-[var(--shadow-glow-blue)] transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {t('landing.contact.ctaRegister')}
                            <ArrowRight className="h-4 w-4" aria-hidden />
                        </Link>
                    </motion.div>
                </div>
            </section>

            <footer className="border-t border-border py-10">
                <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-6 md:flex-row md:justify-between">
                    <LandingBrandMark />
                    <p className="max-w-sm text-center text-sm text-muted-foreground md:text-left">
                        {t('landing.footer.tagline')}
                        <span className="mt-2 block text-xs text-muted-foreground/80">
                            © {year} EVA. {t('landing.footer.rights')}
                        </span>
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
                        <Link href="/legal" className="transition-colors hover:text-foreground">
                            {t('landing.footer.legal')}
                        </Link>
                        <Link href="/privacidad" className="transition-colors hover:text-foreground">
                            {t('landing.footer.privacy')}
                        </Link>
                    </div>
                </div>
            </footer>
        </>
    )
}
