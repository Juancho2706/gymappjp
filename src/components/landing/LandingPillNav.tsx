'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { LandingBrandMark } from '@/components/landing/LandingBrandMark'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { motion } from 'framer-motion'
import { Menu } from 'lucide-react'
import {
    Sheet,
    SheetContent,
    SheetTrigger,
    SheetTitle
} from "@/components/ui/sheet"

export function LandingPillNav() {
    const [scrolled, setScrolled] = useState(false)
    const { t } = useTranslation()

    useEffect(() => {
        const handler = () => setScrolled(window.scrollY > 40)
        window.addEventListener('scroll', handler)
        return () => window.removeEventListener('scroll', handler)
    }, [])

    const ctaClass =
        'bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold px-5 py-2.5 rounded-full transition-all shadow-[var(--shadow-glow-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

    return (
        <motion.nav
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className={`fixed top-[calc(1rem+var(--safe-area-inset-top,0px))] left-1/2 -translate-x-1/2 z-50 transition-all duration-500 bg-background/70 dark:bg-background/50 backdrop-blur-2xl border ${scrolled
                ? 'border-border shadow-lg shadow-black/5'
                : 'border-border/60'
                } rounded-full px-3 sm:px-6 py-2.5 sm:py-3 flex items-center w-[95%] max-w-5xl justify-between gap-2`}
        >
            <LandingBrandMark className="min-w-0" iconClassName="h-8 w-8 sm:h-9 sm:w-9" />

            <div className="hidden md:flex items-center gap-6 absolute left-1/2 -translate-x-1/2">
                {[
                    { key: 'landing.nav.panelCoach', id: 'panel-coach' },
                    { key: 'landing.nav.pricing', id: 'precios' },
                    { key: 'landing.nav.contact', id: 'contacto' }
                ].map(item => (
                    <a
                        key={item.id}
                        href={`#${item.id}`}
                        className="text-muted-foreground hover:text-foreground text-xs font-medium transition-colors whitespace-nowrap"
                    >
                        {t(item.key)}
                    </a>
                ))}
            </div>

            <div className="hidden md:flex items-center gap-3 shrink-0">
                <ThemeToggle />
                <Link
                    href="/login"
                    className="text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
                >
                    {t('landing.nav.login')}
                </Link>
                <Link href="/register?tier=pro&cycle=monthly" className={ctaClass}>
                    {t('landing.nav.register')}
                </Link>
            </div>

            <div className="md:hidden flex items-center gap-1 shrink-0">
                <Link
                    href="/login"
                    className="text-muted-foreground hover:text-foreground text-xs font-semibold px-2 py-1.5 transition-colors"
                >
                    {t('landing.nav.login')}
                </Link>
                <Sheet>
                    <SheetTrigger className="p-2 text-foreground/70 hover:text-foreground transition-colors rounded-full hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex items-center justify-center">
                        <Menu className="w-5 h-5" />
                    </SheetTrigger>
                    <SheetContent side="right" className="w-[300px] sm:w-[400px] border-l-border bg-background pt-14 flex flex-col gap-6">
                        <SheetTitle className="sr-only">Menú</SheetTitle>

                        <div className="flex flex-col gap-1 px-2">
                            {[
                                { key: 'landing.nav.panelCoach', id: 'panel-coach' },
                                { key: 'landing.nav.pricing', id: 'precios' },
                                { key: 'landing.nav.contact', id: 'contacto' },
                            ].map(item => (
                                <a
                                    key={item.id}
                                    href={`#${item.id}`}
                                    className="text-base font-semibold text-foreground/90 hover:text-primary transition-colors py-3 border-b border-border/40"
                                >
                                    {t(item.key)}
                                </a>
                            ))}
                        </div>

                        <div className="mt-auto flex flex-col gap-4 px-2 pb-8">
                            <div className="flex items-center justify-between py-3 border-t border-border/50">
                                <span className="text-sm font-medium text-muted-foreground">{t('landing.nav.sheet.settings')}</span>
                                <div className="flex gap-3 shrink-0">
                                    <LanguageToggle />
                                    <ThemeToggle />
                                </div>
                            </div>
                            <Link href="/register?tier=pro&cycle=monthly" className={`text-center w-full py-3 rounded-xl ${ctaClass}`}>
                                {t('landing.nav.register')}
                            </Link>
                        </div>
                    </SheetContent>
                </Sheet>
            </div>
        </motion.nav>
    )
}
