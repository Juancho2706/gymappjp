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
                className="relative scroll-mt-28 border-t border-border/50 bg-muted/15 py-12 sm:py-16"
            >
                <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 sm:px-6 md:flex-row md:items-center md:justify-between md:gap-10">
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="min-w-0 max-w-xl md:text-left"
                    >
                        <h2 className="font-display text-2xl font-black tracking-tight text-foreground sm:text-3xl md:text-4xl">
                            {t('landing.contact.title')}
                        </h2>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">{t('landing.contact.subtitle')}</p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="flex w-full shrink-0 flex-col gap-4 rounded-2xl border border-border/80 bg-card/70 p-5 shadow-sm backdrop-blur-sm dark:bg-card/80 sm:flex-row sm:items-center sm:justify-end sm:gap-6 sm:p-5 md:w-auto md:min-w-[min(100%,420px)] lg:min-w-[480px]"
                    >
                        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                                <Mail className="h-5 w-5" aria-hidden />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                                    {t('landing.contact.emailLabel')}
                                </p>
                                <a
                                    href="mailto:contacto@eva-app.cl"
                                    className="mt-0.5 block truncate text-base font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline sm:text-lg"
                                >
                                    contacto@eva-app.cl
                                </a>
                            </div>
                        </div>
                        <Link
                            href="/register?tier=pro&cycle=monthly"
                            className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-[var(--shadow-glow-blue)] transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
                        >
                            {t('landing.contact.ctaRegister')}
                            <ArrowRight className="h-4 w-4" aria-hidden />
                        </Link>
                    </motion.div>
                </div>
            </section>

            <footer className="border-t border-border py-8 sm:py-10">
                <div className="mx-auto flex w-full max-w-[1600px] flex-col items-center gap-6 px-4 sm:px-6 md:flex-row md:justify-between">
                    <LandingBrandMark />
                    <p className="max-w-md text-center text-sm text-muted-foreground md:text-left">
                        {t('landing.footer.tagline')}
                        <span className="mt-1.5 block text-xs text-muted-foreground/80">
                            © {year} EVA. {t('landing.footer.rights')}
                        </span>
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-5 text-sm text-muted-foreground md:justify-end">
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
