'use client'

import Link from 'next/link'
import { useRef, useState, useEffect } from 'react'
import Image from 'next/image'
import { LandingBrandMark } from '@/components/landing/LandingBrandMark'
import { LandingCoachCalloutSections } from '@/components/landing/LandingCoachCalloutSections'
import { LandingContactFooter } from '@/components/landing/LandingContactFooter'
import { LandingDeviceShowcase } from '@/components/landing/LandingDeviceShowcase'
import { LandingPricingPreview } from '@/components/landing/LandingPricingPreview'
import { LandingTypewriterHeadline } from '@/components/landing/LandingTypewriterHeadline'
import { LandingUseCases } from '@/components/landing/LandingUseCases'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'
import { DemoVideoSection } from '@/components/landing/DemoVideoSection'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { motion, useScroll, useTransform, useInView, AnimatePresence } from 'framer-motion'
import {
    Dumbbell, Users, BarChart3, Camera, Sparkles, ArrowRight, Check,
    Zap, Smartphone, ChevronDown, Play, Palette,
    ClipboardList, Utensils, Menu, X
} from 'lucide-react'
import {
    Sheet,
    SheetContent,
    SheetTrigger,
    SheetTitle
} from "@/components/ui/sheet"
import { MUSCLE_GROUPS } from '@/lib/constants'

const muscleGroupCount = MUSCLE_GROUPS.length

const features = [
    {
        icon: Dumbbell,
        titleKey: 'landing.feature.routines.title',
        descKey: 'landing.feature.routines.desc',
        iconBg: 'bg-primary/15',
        iconClass: 'text-primary',
    },
    {
        icon: Utensils,
        titleKey: 'landing.feature.nutrition.title',
        descKey: 'landing.feature.nutrition.desc',
        iconBg: 'bg-sky-500/15',
        iconClass: 'text-sky-600 dark:text-sky-400',
    },
    {
        icon: Camera,
        titleKey: 'landing.feature.checkins.title',
        descKey: 'landing.feature.checkins.desc',
        iconBg: 'bg-violet-500/15',
        iconClass: 'text-violet-600 dark:text-violet-400',
    },
    {
        icon: Smartphone,
        titleKey: 'landing.feature.whitelabel.title',
        descKey: 'landing.feature.whitelabel.desc',
        iconBg: 'bg-emerald-500/15',
        iconClass: 'text-emerald-600 dark:text-emerald-400',
    },
    {
        icon: ClipboardList,
        titleKey: 'landing.feature.profile.title',
        descKey: 'landing.feature.profile.desc',
        iconBg: 'bg-amber-500/15',
        iconClass: 'text-amber-600 dark:text-amber-400',
    },
    {
        icon: BarChart3,
        titleKey: 'landing.feature.analytics.title',
        descKey: 'landing.feature.analytics.desc',
        iconBg: 'bg-rose-500/15',
        iconClass: 'text-rose-600 dark:text-rose-400',
    },
] as const

const fadeUp = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.25, 0.4, 0.25, 1] as const } },
}

const scaleIn = {
    hidden: { opacity: 0, scale: 0.85 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.7, ease: [0.25, 0.4, 0.25, 1] as const } },
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

function FeatureCard({ feature, index }: { feature: (typeof features)[number]; index: number }) {
    const ref = useRef<HTMLDivElement>(null)
    const inView = useInView(ref, { once: true, margin: '-80px' })
    const { t } = useTranslation()

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: index * 0.08 }}
            className="group relative rounded-2xl border border-border bg-card p-7 shadow-sm transition-shadow hover:shadow-md dark:bg-card/80"
        >
            <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100 bg-gradient-to-br from-primary/[0.06] to-transparent" />

            <div className="relative z-10">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-5 ${feature.iconBg}`}>
                    <feature.icon className={`w-6 h-6 ${feature.iconClass}`} />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">{t(feature.titleKey)}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{t(feature.descKey)}</p>
            </div>
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
                    { key: 'landing.nav.features', id: 'funciones' },
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
                                { key: 'landing.nav.features', id: 'funciones' },
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
    const secondaryCta =
        'inline-flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground text-sm font-medium px-8 py-4 rounded-full border border-border bg-card/60 hover:bg-card backdrop-blur-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

    return (
        <div className="min-h-dvh bg-background text-foreground overflow-x-hidden">
            <PillNav />
            <StickyBrandingCard />

            <main>
                <section ref={heroRef} className="relative min-h-dvh flex flex-col items-center justify-center pt-[calc(7rem+var(--safe-area-inset-top,0px))] pb-28 bg-background landing-noise">
                    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                        <div className="absolute top-1/4 left-1/4 w-[300px] md:w-[600px] h-[300px] md:h-[600px] rounded-full bg-primary/10 blur-[100px] md:blur-[150px]" />
                        <div className="absolute bottom-1/4 right-1/4 w-[200px] md:w-[400px] h-[200px] md:h-[400px] rounded-full bg-sky-400/10 blur-[80px] md:blur-[120px]" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] md:w-[800px] h-[400px] md:h-[800px] rounded-full bg-primary/5 blur-[120px] md:blur-[200px]" />
                    </div>

                    <div
                        className="absolute inset-0 opacity-[0.035] dark:opacity-[0.06]"
                        style={{
                            backgroundImage: 'linear-gradient(rgba(128,128,128,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(128,128,128,.12) 1px, transparent 1px)',
                            backgroundSize: '40px 40px',
                        }}
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
                                className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-4 py-1.5 shadow-sm backdrop-blur-md"
                            >
                                <Sparkles className="w-3.5 h-3.5 text-primary" aria-hidden />
                                <span className="text-xs font-medium text-foreground">{t('landing.hero.badge')}</span>
                            </motion.div>

                            <motion.h1
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4, duration: 0.8 }}
                                className="font-display text-4xl font-black leading-[1.08] tracking-tighter text-foreground sm:text-5xl md:text-6xl lg:text-[3.25rem] xl:text-[3.75rem]"
                            >
                                <span className="block text-foreground">{t('landing.hero.title1')}</span>
                                <span className="mt-2 block bg-gradient-to-r from-primary via-foreground to-muted-foreground bg-clip-text text-transparent">
                                    {t('landing.hero.title2')}
                                </span>
                            </motion.h1>

                            <motion.div
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5, duration: 0.6 }}
                                className="mt-6 max-w-xl text-balance"
                            >
                                <p className="text-sm font-semibold text-muted-foreground sm:text-base">
                                    {t('landing.typewriter.prefix')}
                                </p>
                                <p className="mt-1 font-display text-xl font-extrabold leading-snug tracking-tight text-foreground sm:text-2xl md:text-[1.65rem]">
                                    <LandingTypewriterHeadline />
                                </p>
                            </motion.div>

                            <motion.p
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.6 }}
                                className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg"
                            >
                                {t('landing.hero.subtitle')}
                            </motion.p>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.7 }}
                                className="mt-8 flex w-full flex-col items-stretch gap-4 sm:flex-row sm:justify-center lg:justify-start"
                            >
                                <Link href="/register?tier=pro&cycle=monthly" className={`w-full sm:w-auto ${primaryCta} group/btn`}>
                                    {t('landing.hero.cta')}
                                    <ArrowRight className="w-5 h-5 transition-transform group-hover/btn:translate-x-1" aria-hidden />
                                </Link>
                                <a href="#funciones" className={`w-full sm:w-auto ${secondaryCta}`}>
                                    <Play className="h-4 w-4" aria-hidden />
                                    {t('landing.hero.secondaryCta')}
                                </a>
                            </motion.div>
                        </motion.div>

                        <div className="relative lg:col-span-7">
                            <LandingDeviceShowcase />
                        </div>
                    </div>
                </section>

                <DemoVideoSection />

                <section className="relative py-14 border-y border-border/60 bg-card/30 backdrop-blur-sm">
                    <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-10">
                        {statsWithExercises.map((stat, i) => (
                            <AnimatedCounter key={i} value={stat.value} label={stat.label} />
                        ))}
                    </div>
                </section>

                <LandingCoachCalloutSections />

                <section className="relative py-24 sm:py-28 z-10">
                    <div className="max-w-6xl mx-auto px-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            <motion.div
                                variants={scaleIn}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true, margin: '-50px' }}
                                className="rounded-2xl border border-border bg-card p-8 shadow-sm transition-shadow hover:shadow-md dark:bg-card/80"
                            >
                                <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center mb-6">
                                    <Menu className="w-6 h-6 text-primary" />
                                </div>
                                <h3 className="text-xl font-bold text-foreground mb-6">{t('landing.core.routines.title')}</h3>
                                <div className="bg-muted/50 rounded-xl p-4 border border-border space-y-3">
                                    {[
                                        { name: 'Sentadilla', reps: '4 × 10' },
                                        { name: 'Press banca', reps: '4 × 8' },
                                        { name: 'Peso muerto', reps: '3 × 12' }
                                    ].map((ex, i) => (
                                        <div key={i} className="flex items-center gap-3 bg-background/80 p-3 rounded-lg border border-border">
                                            <Menu className="w-4 h-4 text-muted-foreground" aria-hidden />
                                            <span className="text-xs font-semibold text-foreground">{ex.name}</span>
                                            <span className="text-[10px] text-muted-foreground ml-auto bg-muted px-2 py-1 rounded-md tabular-nums">{ex.reps}</span>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>

                            <motion.div
                                variants={scaleIn}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true, margin: '-50px' }}
                                transition={{ delay: 0.08 }}
                                className="rounded-2xl border border-border bg-card p-8 shadow-sm transition-shadow hover:shadow-md dark:bg-card/80"
                            >
                                <div className="w-12 h-12 rounded-xl bg-sky-500/15 flex items-center justify-center mb-6">
                                    <BarChart3 className="w-6 h-6 text-sky-600 dark:text-sky-400" />
                                </div>
                                <h3 className="text-xl font-bold text-foreground mb-6">{t('landing.core.macros.title')}</h3>
                                <div className="bg-muted/50 rounded-xl p-6 border border-border flex items-center justify-center gap-6">
                                    {[
                                        { label: 'P', val: '36g', color: '#007AFF' },
                                        { label: 'C', val: '20g', color: '#00E5FF' },
                                        { label: 'G', val: '15g', color: '#00C7BE' },
                                    ].map((macro, i) => (
                                        <div key={i} className="flex flex-col items-center gap-2">
                                            <div
                                                className="w-14 h-14 rounded-full border-4 flex items-center justify-center"
                                                style={{ borderColor: `${macro.color}44`, borderTopColor: macro.color }}
                                            >
                                                <span className="text-xs font-bold text-foreground tabular-nums">{macro.val}</span>
                                            </div>
                                            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{macro.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>

                            <motion.div
                                variants={scaleIn}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true, margin: '-50px' }}
                                transition={{ delay: 0.16 }}
                                className="rounded-2xl border border-border bg-card p-8 shadow-sm transition-shadow hover:shadow-md dark:bg-card/80 flex flex-col"
                            >
                                <div className="w-12 h-12 rounded-xl bg-violet-500/15 flex items-center justify-center mb-6">
                                    <Zap className="w-6 h-6 text-violet-600 dark:text-violet-400" />
                                </div>
                                <h3 className="text-xl font-bold text-foreground mb-6">{t('landing.core.templates.title')}</h3>
                                <div className="bg-muted/50 rounded-xl p-4 border border-border flex-1 flex flex-col gap-3">
                                    <div className="flex items-center justify-between bg-background/80 p-3 rounded-lg border border-border">
                                        <span className="text-sm font-medium text-foreground">Fuerza 4 días</span>
                                        <ChevronDown className="w-4 h-4 text-muted-foreground" aria-hidden />
                                    </div>
                                    <div className="flex items-center justify-between bg-muted/40 p-3 rounded-lg border border-border opacity-80">
                                        <span className="text-sm text-muted-foreground font-medium">Hipertrofia 3 días</span>
                                        <ChevronDown className="w-4 h-4 text-muted-foreground" aria-hidden />
                                    </div>
                                    <div className="mt-auto pt-4">
                                        <span className="block w-full text-center bg-primary text-primary-foreground text-sm font-bold py-2.5 rounded-lg shadow-sm">
                                            {t('landing.core.apply')}
                                        </span>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </section>

                <section id="funciones" className="relative py-24 sm:py-28 scroll-mt-28 border-t border-border/40 landing-section-alt">
                    <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(90vw,600px)] h-[600px] rounded-full bg-primary/[0.04] blur-[120px]" />

                    <div className="relative max-w-6xl mx-auto px-6">
                        <motion.div
                            variants={fadeUp}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: '-80px' }}
                            className="text-center mb-14"
                        >
                            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3 block">
                                {t('landing.functions.eyebrow')}
                            </span>
                            <h2 className="font-display text-3xl md:text-5xl font-black text-foreground mb-4 tracking-tight">
                                {t('landing.functions.title')}
                            </h2>
                            <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
                                {t('landing.functions.subtitle')}
                            </p>
                        </motion.div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {features.map((feature, i) => (
                                <FeatureCard key={feature.titleKey} feature={feature} index={i} />
                            ))}
                        </div>
                    </div>
                </section>

                <section className="relative py-24 sm:py-28 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.03] to-transparent pointer-events-none" />

                    <div className="max-w-6xl mx-auto px-6">
                        <div className="grid lg:grid-cols-2 gap-14 items-center">
                            <motion.div
                                variants={fadeUp}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true, margin: '-80px' }}
                            >
                                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3 block">
                                    {t('landing.exercises.eyebrow')}
                                </span>
                                <h2 className="text-3xl md:text-5xl font-black text-foreground mb-6 leading-tight font-display tracking-tight">
                                    {exerciseTitle}
                                    <br />
                                    <span className="text-muted-foreground">{t('landing.exercises.titleLead')}</span>
                                </h2>
                                <p className="text-muted-foreground text-base leading-relaxed mb-8 max-w-md">
                                    {t('landing.exercises.intro')}
                                </p>

                                <ul className="space-y-3">
                                    {exerciseBullets.map(item => (
                                        <li key={item} className="flex items-center gap-3">
                                            <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                                                <Check className="w-3 h-3 text-primary" aria-hidden />
                                            </div>
                                            <span className="text-sm text-muted-foreground">{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            </motion.div>

                            <motion.div
                                variants={scaleIn}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true, margin: '-80px' }}
                                className="relative"
                            >
                                <div className="absolute inset-0 bg-primary/5 blur-[100px] rounded-full" />
                                <div className="relative bg-card/90 backdrop-blur-xl border border-border rounded-2xl p-6 space-y-3 shadow-xl">
                                    {[
                                        { name: 'Squat jumps', muscle: 'Piernas', reps: '10', color: '#007AFF' },
                                        { name: 'Dominadas', muscle: 'Espalda', reps: '12', color: '#00E5FF' },
                                        { name: 'Press banca', muscle: 'Pecho', reps: '8', color: '#00C7BE' },
                                        { name: 'Plancha', muscle: 'Core', reps: '60s', color: '#5856D6' },
                                    ].map((ex, i) => (
                                        <motion.div
                                            key={ex.name}
                                            initial={{ opacity: 0, x: 20 }}
                                            whileInView={{ opacity: 1, x: 0 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: 0.15 + i * 0.08 }}
                                            className="flex items-center gap-4 bg-muted/40 border border-border rounded-xl p-4 hover:bg-muted/60 transition-colors"
                                        >
                                            <div className="w-14 h-14 rounded-xl bg-background flex items-center justify-center flex-shrink-0 border border-border">
                                                <Dumbbell className="w-6 h-6 text-muted-foreground" aria-hidden />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-foreground truncate">{ex.name}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span
                                                        className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md"
                                                        style={{ backgroundColor: `${ex.color}22`, color: ex.color }}
                                                    >
                                                        {ex.muscle}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground tabular-nums">{ex.reps}</span>
                                                </div>
                                            </div>
                                            <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden />
                                        </motion.div>
                                    ))}
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </section>

                <section className="relative py-24 sm:py-28 border-t border-border/40">
                    <div className="max-w-6xl mx-auto px-6 text-center">
                        <motion.div
                            variants={fadeUp}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: '-80px' }}
                        >
                            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3 block">
                                {t('landing.whitelabel.eyebrow')}
                            </span>
                            <h2 className="font-display text-3xl md:text-5xl font-black text-foreground mb-4 tracking-tight">
                                {t('landing.whitelabel.title')}
                            </h2>
                            <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto mb-14 leading-relaxed">
                                {t('landing.whitelabel.subtitle')}
                            </p>
                        </motion.div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
                            <motion.div
                                variants={scaleIn}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true }}
                                className="md:col-span-2 rounded-2xl border border-border bg-card p-8 shadow-sm dark:bg-card/80"
                            >
                                <Palette className="w-8 h-8 text-primary mb-4" aria-hidden />
                                <h3 className="text-xl font-bold text-foreground mb-2">{t('landing.whitelabel.customize.title')}</h3>
                                <p className="text-muted-foreground text-sm leading-relaxed max-w-xl">
                                    {t('landing.whitelabel.customize.body')}
                                </p>
                                <code className="mt-4 inline-block rounded-lg border border-border bg-muted/50 px-3 py-1.5 font-mono text-xs text-foreground">
                                    {t('landing.whitelabel.urlExample')}
                                </code>
                                <div className="mt-6 flex flex-wrap gap-3">
                                    {['#007AFF', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6'].map(color => (
                                        <div
                                            key={color}
                                            className="w-9 h-9 rounded-full border-2 border-border shadow-sm"
                                            style={{ backgroundColor: color }}
                                        />
                                    ))}
                                </div>
                            </motion.div>

                            <motion.div
                                variants={scaleIn}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true }}
                                transition={{ delay: 0.08 }}
                                className="rounded-2xl border border-border bg-card p-8 shadow-sm dark:bg-card/80"
                            >
                                <Smartphone className="w-8 h-8 text-primary mb-4" aria-hidden />
                                <h3 className="text-xl font-bold text-foreground mb-2">{t('landing.whitelabel.pwa.title')}</h3>
                                <p className="text-muted-foreground text-sm leading-relaxed">
                                    {t('landing.whitelabel.pwa.body')}
                                </p>
                            </motion.div>
                        </div>
                    </div>
                </section>

                <LandingPricingPreview />

                <LandingUseCases />

                <section className="relative py-24 sm:py-28 border-t border-border/40 landing-section-alt">
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
