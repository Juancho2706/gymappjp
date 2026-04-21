'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRef, useState, useEffect } from 'react'
import Image from 'next/image'
import { LandingBrandMark } from '@/components/landing/LandingBrandMark'
import { LandingCoachCalloutSections } from '@/components/landing/LandingCoachCalloutSections'
import { LandingContactFooter } from '@/components/landing/LandingContactFooter'
import { LandingDeviceShowcase } from '@/components/landing/LandingDeviceShowcase'
import { LandingExerciseCatalogShowcase } from '@/components/landing/LandingExerciseCatalogShowcase'
import { LandingPricingPreview } from '@/components/landing/LandingPricingPreview'
import { LandingTypewriterHeadline } from '@/components/landing/LandingTypewriterHeadline'
import { LandingUseCases } from '@/components/landing/LandingUseCases'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'
import { useTheme } from 'next-themes'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { motion, useScroll, useTransform, useInView, AnimatePresence } from 'framer-motion'
import { Dumbbell, Sparkles, ArrowRight, Menu, X } from 'lucide-react'
import {
    Sheet,
    SheetContent,
    SheetTrigger,
    SheetTitle
} from "@/components/ui/sheet"
import { MUSCLE_GROUPS } from '@/lib/constants'

const muscleGroupCount = MUSCLE_GROUPS.length

const WebGLShader = dynamic(
    () => import('@/components/ui/web-gl-shader').then((m) => ({ default: m.WebGLShader })),
    { ssr: false, loading: () => null }
)

const fadeUp = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.25, 0.4, 0.25, 1] as const } },
}

function AnimatedCounter({ value, label }: { value: string; label: string }) {
    const ref = useRef<HTMLDivElement>(null)
    const inView = useInView(ref, { once: true, margin: '-50px' })

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-center"
        >
            <div className="text-4xl md:text-5xl font-black tabular-nums text-foreground mb-2">{value}</div>
            <div className="text-xs sm:text-sm text-muted-foreground uppercase tracking-widest font-medium">{label}</div>
        </motion.div>
    )
}

function PillNav() {
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

function StickyBrandingCard() {
    const [coach, setCoach] = useState<{ slug: string; name: string; logo: string | null } | null>(null)
    const [isVisible, setIsVisible] = useState(false)
    const { t } = useTranslation()

    useEffect(() => {
        const slug = localStorage.getItem('last_coach_slug')
        const name = localStorage.getItem('coach_brand_name')
        const logo = localStorage.getItem('coach_logo_url')
        if (slug && name) {
            setCoach({ slug, name, logo })
            const timer = setTimeout(() => setIsVisible(true), 1000)
            return () => clearTimeout(timer)
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
                    className="fixed bottom-6 left-6 right-6 md:left-auto md:right-8 z-[60] md:w-[320px]"
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
                                    <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                                </Link>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

export default function LandingPage() {
    const heroRef = useRef<HTMLDivElement>(null)
    const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
    const { t } = useTranslation()
    const { resolvedTheme } = useTheme()
    /** Until theme hydrates, keep dark hero to avoid a bright flash before .dark is applied. */
    const isDarkHero = resolvedTheme === 'dark' || resolvedTheme === undefined
    const heroShaderVariant = isDarkHero ? 'dark' : 'light'

    const heroScale = useTransform(scrollYProgress, [0, 1], [1, 0.9])
    const heroY = useTransform(scrollYProgress, [0, 1], [0, 100])

    const [exerciseCount, setExerciseCount] = useState(129)

    useEffect(() => {
        let mounted = true
        ;(async () => {
            try {
                const response = await fetch('/api/public/exercises-count')
                const payload = await response.json()
                if (!response.ok || typeof payload.count !== 'number') return
                if (mounted && payload.count > 0) {
                    setExerciseCount(payload.count)
                }
            } catch {
                // Keep fallback count.
            }
        })()
        return () => {
            mounted = false
        }
    }, [])

    const statsWithExercises = [
        { value: String(exerciseCount), label: t('landing.stats.exercises') },
        { value: String(muscleGroupCount), label: t('landing.stats.muscles') },
        { value: '100%', label: t('landing.stats.brand') },
        { value: '24/7', label: t('landing.stats.support') },
    ]

    const exerciseTitle = t('landing.exercises.title').replace('{{count}}', String(exerciseCount))
    const exerciseBullets = [
        t('landing.exercises.bullet1'),
        t('landing.exercises.bullet2'),
        t('landing.exercises.bullet3'),
        t('landing.exercises.bullet4'),
    ]

    const primaryCta =
        'inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-bold px-8 py-4 rounded-full text-base transition-all shadow-[var(--shadow-glow-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
    return (
        <div className="min-h-dvh bg-background text-foreground overflow-x-hidden">
            <PillNav />
            <StickyBrandingCard />

            <main>
                <section
                    ref={heroRef}
                    className="relative min-h-dvh flex flex-col items-center justify-center bg-white pt-[calc(7rem+var(--safe-area-inset-top,0px))] pb-28 landing-noise dark:bg-black"
                >
                    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                        <WebGLShader key={heroShaderVariant} variant={heroShaderVariant} className="opacity-100" />
                        <div className="absolute top-1/4 left-1/4 h-[300px] w-[300px] rounded-full bg-primary/[0.06] blur-[100px] md:h-[600px] md:w-[600px] md:blur-[150px] dark:bg-primary/10" />
                        <div className="absolute right-1/4 bottom-1/4 h-[200px] w-[200px] rounded-full bg-slate-400/[0.08] blur-[80px] md:h-[400px] md:w-[400px] md:blur-[120px] dark:bg-sky-400/10" />
                        <div className="absolute top-1/2 left-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.04] blur-[120px] md:h-[800px] md:w-[800px] md:blur-[200px] dark:bg-primary/5" />
                    </div>

                    <div
                        className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-white/20 via-white/60 to-white dark:from-black/35 dark:via-black/55 dark:to-black"
                        aria-hidden
                    />

                    <div
                        className="pointer-events-none absolute inset-0 z-[1] opacity-[0.03] dark:opacity-[0.05] [background-image:linear-gradient(rgba(0,0,0,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,.08)_1px,transparent_1px)] dark:[background-image:linear-gradient(rgba(128,128,128,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(128,128,128,.12)_1px,transparent_1px)]"
                        style={{ backgroundSize: '40px 40px' }}
                        aria-hidden
                    />

                    <div className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 px-6 pb-8 lg:grid-cols-12 lg:gap-10 lg:pb-12">
                        <motion.div
                            style={{ scale: heroScale, y: heroY }}
                            className="flex flex-col items-center text-center lg:col-span-5 lg:items-start lg:text-left"
                        >
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/90 px-4 py-1.5 shadow-sm backdrop-blur-md dark:border-white/15 dark:bg-white/10"
                            >
                                <Sparkles className="w-3.5 h-3.5 text-primary" aria-hidden />
                                <span className="text-xs font-medium text-foreground">{t('landing.hero.badge')}</span>
                            </motion.div>

                            <motion.h1
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4, duration: 0.8 }}
                                className="max-w-2xl text-balance font-display text-4xl font-black leading-[1.12] tracking-tighter text-foreground sm:text-5xl md:text-6xl lg:text-[3.15rem] xl:text-[3.55rem] dark:text-white"
                            >
                                <span className="block">
                                    {t('landing.typewriter.prefixBefore')}
                                    <span className="bg-gradient-to-r from-sky-800 via-primary to-violet-800 bg-clip-text text-transparent dark:from-sky-300 dark:via-primary dark:to-violet-400">
                                        {t('landing.typewriter.prefixBrand')}
                                    </span>
                                    {t('landing.typewriter.prefixAfter')}
                                </span>
                                <span className="mt-4 block text-foreground sm:mt-5 dark:text-white">
                                    <span className="font-display text-[1.35rem] font-extrabold leading-snug tracking-tight sm:text-2xl md:text-[1.75rem] lg:text-[1.85rem]">
                                        <LandingTypewriterHeadline />
                                    </span>
                                </span>
                            </motion.h1>

                            <motion.p
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.6 }}
                                className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg dark:text-white/70"
                            >
                                {t('landing.hero.subtitle')}
                            </motion.p>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.7 }}
                                className="mt-8 flex w-full flex-col items-stretch sm:flex-row sm:justify-center lg:justify-start"
                            >
                                <Link
                                    href="/register?tier=pro&cycle=monthly"
                                    className={`group/btn w-full sm:w-auto ${primaryCta} no-underline`}
                                >
                                    {t('landing.hero.cta')}
                                    <ArrowRight className="h-5 w-5 transition-transform group-hover/btn:translate-x-1" aria-hidden />
                                </Link>
                            </motion.div>
                        </motion.div>

                        <div className="relative lg:col-span-7">
                            <LandingDeviceShowcase />
                        </div>
                    </div>
                </section>

                <section className="landing-stats-strip relative border-y border-border/60 py-14 backdrop-blur-sm">
                    <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-10">
                        {statsWithExercises.map((stat, i) => (
                            <AnimatedCounter key={i} value={stat.value} label={stat.label} />
                        ))}
                    </div>
                </section>

                <LandingCoachCalloutSections />

                <LandingExerciseCatalogShowcase exerciseTitle={exerciseTitle} exerciseBullets={exerciseBullets} />

                <LandingPricingPreview />

                <LandingUseCases />

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

                <LandingContactFooter />
            </main>
        </div>
    )
}
