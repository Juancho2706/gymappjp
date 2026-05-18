'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRef } from 'react'
import { LandingDeviceShowcase } from '@/components/landing/LandingDeviceShowcase'
import { LandingTypewriterHeadline } from '@/components/landing/LandingTypewriterHeadline'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { useTheme } from 'next-themes'
import { motion, useScroll, useTransform, useInView, useReducedMotion } from 'framer-motion'
import { Sparkles, ArrowRight } from 'lucide-react'
import { MUSCLE_GROUPS } from '@/lib/constants'
import { cn } from '@/lib/utils'

const WebGLShader = dynamic(
    () => import('@/components/ui/web-gl-shader').then((m) => ({ default: m.WebGLShader })),
    { ssr: false, loading: () => null }
)

const muscleGroupCount = MUSCLE_GROUPS.length

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

const primaryCta =
    'inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-bold px-8 py-4 rounded-full text-base transition-all shadow-[var(--shadow-glow-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function LandingHeroSection({ exerciseCount }: { exerciseCount: number }) {
    const heroRef = useRef<HTMLDivElement>(null)
    const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
    const { t } = useTranslation()
    const { resolvedTheme } = useTheme()
    const prefersReducedMotion = useReducedMotion()

    const isDarkHero = resolvedTheme === 'dark' || resolvedTheme === undefined
    const heroShaderVariant = isDarkHero ? 'dark' : 'light'

    const heroScale = useTransform(scrollYProgress, [0, 1], prefersReducedMotion ? [1, 1] : [1, 0.9])
    const heroY = useTransform(scrollYProgress, [0, 1], prefersReducedMotion ? [0, 0] : [0, 100])

    const statsWithExercises = [
        { value: String(exerciseCount), label: t('landing.stats.exercises') },
        { value: String(muscleGroupCount), label: t('landing.stats.muscles') },
        { value: '100%', label: t('landing.stats.brand') },
        { value: '24/7', label: t('landing.stats.support') },
    ]

    return (
        <>
            <section
                ref={heroRef}
                className="relative min-h-dvh flex flex-col items-center justify-center bg-white pt-[calc(7rem+var(--safe-area-inset-top,0px))] pb-28 landing-noise dark:bg-black"
            >
                <div
                    className={cn(
                        'pointer-events-none absolute z-0 overflow-hidden',
                        'md:inset-0',
                        'max-md:left-0 max-md:right-0 max-md:top-0',
                        'max-md:h-[min(76vh,640px)]'
                    )}
                >
                    <WebGLShader key={heroShaderVariant} variant={heroShaderVariant} className="opacity-100" />
                    <div className="absolute top-[16%] left-[6%] h-[200px] w-[200px] rounded-full bg-primary/[0.06] blur-[80px] dark:bg-primary/10 md:top-1/4 md:left-1/4 md:h-[300px] md:w-[300px] md:blur-[100px] lg:h-[600px] lg:w-[600px] lg:blur-[150px]" />
                    <div className="absolute bottom-[10%] right-[6%] h-[160px] w-[160px] rounded-full bg-slate-400/[0.08] blur-[60px] dark:bg-sky-400/10 md:bottom-1/4 md:right-1/4 md:h-[200px] md:w-[200px] md:blur-[80px] lg:h-[400px] lg:w-[400px] lg:blur-[120px]" />
                    <div className="absolute left-1/2 top-[40%] h-[min(280px,75vw)] w-[min(280px,75vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.04] blur-[100px] dark:bg-primary/5 md:top-1/2 md:h-[400px] md:w-[400px] md:blur-[120px] lg:h-[800px] lg:w-[800px] lg:blur-[200px]" />
                    <div
                        className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-white dark:from-transparent dark:to-black md:hidden"
                        aria-hidden
                    />
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
        </>
    )
}
