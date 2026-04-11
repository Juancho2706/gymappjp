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
        <section className="relative py-20 md:py-28 border-y border-white/[0.06] bg-muted/10">
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
                    className="rounded-2xl overflow-hidden border border-border bg-card shadow-xl shadow-black/10"
                >
                    <div className="aspect-video w-full bg-black/80 relative">
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
                </motion.div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
                    <Link
                        href="/register?tier=pro&cycle=monthly"
                        className="w-full sm:w-auto bg-[#007AFF] text-white hover:bg-[#007AFF]/90 font-bold px-8 py-3.5 rounded-full text-sm transition-all duration-300 flex items-center justify-center gap-2 shadow-[0_0_20px_-5px_rgba(0,122,255,0.5)]"
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
