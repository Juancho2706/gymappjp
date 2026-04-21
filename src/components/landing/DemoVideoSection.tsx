'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { ArrowRight, Play } from 'lucide-react'

function embedUrlFromDemoEnv(raw: string | undefined): string | null {
    if (!raw?.trim()) return null
    const s = raw.trim()
    if (/^[a-zA-Z0-9_-]{11}$/.test(s)) {
        return `https://www.youtube-nocookie.com/embed/${s}`
    }
    try {
        const u = new URL(s.startsWith('http') ? s : `https://${s}`)
        if (u.hostname === 'youtu.be') {
            const id = u.pathname.replace(/^\//, '').slice(0, 11)
            return id.length === 11 ? `https://www.youtube-nocookie.com/embed/${id}` : null
        }
        if (u.hostname.includes('youtube.com')) {
            const v = u.searchParams.get('v')
            if (v && v.length === 11) return `https://www.youtube-nocookie.com/embed/${v}`
            const m = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/)
            if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`
        }
    } catch {
        return null
    }
    return null
}

export function DemoVideoSection() {
    const { t } = useTranslation()
    const src = embedUrlFromDemoEnv(process.env.NEXT_PUBLIC_DEMO_VIDEO_URL)

    return (
        <section className="relative py-20 md:py-28 border-y border-border/60 bg-muted/15">
            <div className="max-w-5xl mx-auto px-6">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.45 }}
                    className="text-center mb-10"
                >
                    <h2 className="text-2xl md:text-3xl font-black tracking-tight text-foreground mb-3">
                        {t('landing.demo.title')}
                    </h2>
                    <p className="text-sm md:text-base text-muted-foreground max-w-xl mx-auto">
                        {t('landing.demo.subtitle')}
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.5, delay: 0.05 }}
                    className="rounded-2xl border border-border bg-card p-1 shadow-xl shadow-black/10 ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
                >
                    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/60 bg-muted/30 rounded-t-[0.85rem]">
                        <span className="h-2 w-2 rounded-full bg-red-400/80" aria-hidden />
                        <span className="h-2 w-2 rounded-full bg-amber-400/80" aria-hidden />
                        <span className="h-2 w-2 rounded-full bg-emerald-400/80" aria-hidden />
                        <span className="ml-2 h-2 flex-1 max-w-[8rem] rounded-full bg-muted-foreground/15" aria-hidden />
                    </div>
                    <div className="overflow-hidden rounded-b-xl">
                    <div className="aspect-video w-full bg-black/85 relative">
                        {src ? (
                            <iframe
                                title={t('landing.demo.iframeTitle')}
                                src={`${src}?rel=0&modestbranding=1`}
                                className="absolute inset-0 w-full h-full"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                                loading="lazy"
                            />
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
                                <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center text-primary">
                                    <Play className="w-8 h-8" />
                                </div>
                                <p className="text-sm text-muted-foreground max-w-md">{t('landing.demo.placeholder')}</p>
                            </div>
                        )}
                    </div>
                    </div>
                </motion.div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
                    <Link
                        href="/register?tier=pro&cycle=monthly"
                        className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90 font-bold px-8 py-3.5 rounded-full text-sm transition-all duration-300 flex items-center justify-center gap-2 shadow-[var(--shadow-glow-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {t('landing.demo.ctaTrial')}
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link
                        href="/pricing"
                        className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {t('landing.demo.ctaPricing')}
                    </Link>
                </div>
            </div>
        </section>
    )
}
