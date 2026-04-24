'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Dumbbell, X } from 'lucide-react'

export function LandingStickyBrandingCard() {
    const [coach, setCoach] = useState<{ slug: string; name: string; logo: string | null } | null>(null)
    const [isVisible, setIsVisible] = useState(false)
    const { t } = useTranslation()

    useEffect(() => {
        try {
            const slug = localStorage.getItem('last_coach_slug')
            const name = localStorage.getItem('coach_brand_name')
            const logo = localStorage.getItem('coach_logo_url')
            if (slug && name) {
                setCoach({ slug, name, logo })
                const timer = setTimeout(() => setIsVisible(true), 1000)
                return () => clearTimeout(timer)
            }
        } catch {
            // localStorage unavailable (Safari strict private mode)
        }
    }, [])

    if (!coach) return null

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, y: 50, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                    className="fixed bottom-6 right-6 z-[60] w-[min(320px,calc(100vw-3rem))]"
                >
                    <div className="bg-card/90 backdrop-blur-xl border border-border shadow-2xl rounded-2xl p-5 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 blur-2xl rounded-full -mr-12 -mt-12 group-hover:bg-primary/15 transition-colors" />

                        <button
                            type="button"
                            onClick={() => setIsVisible(false)}
                            className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label="Cerrar"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="flex items-start gap-4">
                            <div className="shrink-0">
                                {coach.logo ? (
                                    <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-border bg-background">
                                        <Image
                                            src={coach.logo}
                                            alt={coach.name}
                                            fill
                                            className="object-contain p-1"
                                        />
                                    </div>
                                ) : (
                                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                                        <Dumbbell className="w-6 h-6 text-primary" />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0 pr-4">
                                <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">
                                    {t('landing.sticky.welcome')}
                                </p>
                                <h4 className="text-sm font-bold text-foreground truncate mb-3">
                                    {coach.name}
                                </h4>
                                <Link
                                    href={`/c/${coach.slug}/login`}
                                    className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold px-4 py-2 rounded-full transition-all group/btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    {t('landing.sticky.cta')}
                                    <ArrowRight className="w-3 h-3 group-hover/btn:translate-x-0.5 transition-transform" />
                                </Link>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
