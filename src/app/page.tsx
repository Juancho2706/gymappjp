'use client'

import Link from 'next/link'
import { useRef, useState, useEffect } from 'react'
import Image from 'next/image'
import { GymAppLogo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'
import dynamic from 'next/dynamic'
import { DemoVideoSection } from '@/components/landing/DemoVideoSection'

const DashboardMockup = dynamic(
    () => import('@/components/landing/DashboardMockup').then((m) => ({ default: m.DashboardMockup })),
    {
        ssr: false,
        loading: () => (
            <div
                className="w-full max-w-5xl mx-auto mt-12 rounded-2xl bg-muted/25 border border-border/30 min-h-[280px] animate-pulse"
                aria-hidden
            />
        ),
    }
)
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { motion, useScroll, useTransform, useInView, useMotionValue, useSpring, AnimatePresence } from 'framer-motion'
import {
    Dumbbell, Users, BarChart3, Camera, Sparkles, ArrowRight, Check,
    Zap, Shield, Smartphone, ChevronDown, Star, Play, Palette,
    ClipboardList, Apple, Utensils, Menu, X
} from 'lucide-react'
import {
    Sheet,
    SheetContent,
    SheetTrigger,
    SheetTitle
} from "@/components/ui/sheet"
import {
    BILLING_CYCLE_CONFIG,
    getDefaultBillingCycleForTier,
    getTierAllowedBillingCycles,
    getTierBillingCycleSummary,
    getTierNutritionSummary,
    getTierPriceClp,
    TIER_CONFIG,
    TIER_STUDENT_RANGE_LABEL,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'

/* ─── Constants ─── */
const tierOrder: SubscriptionTier[] = ['starter_lite', 'starter', 'pro', 'elite', 'scale']
const clientTiers: Array<{ id: SubscriptionTier; label: string; price: number }> = tierOrder.map(
    (id) => ({
        id,
        label: TIER_STUDENT_RANGE_LABEL[id],
        price: TIER_CONFIG[id].monthlyPriceClp,
    })
)

const features = [
    {
        icon: Dumbbell,
        title: 'Constructor de rutinas',
        desc: 'Crea rutinas profesionales con un catálogo de ejercicios, cada uno con GIF de demostración e instrucciones.',
        color: '#00e5ff',
    },
    {
        icon: Utensils,
        title: 'Planes de nutrición',
        desc: 'Asigna planes alimenticios a cada alumno. Ellos anotan lo que comen día a día.',
        color: '#007AFF',
    },
    {
        icon: Camera,
        title: 'Check-ins con fotos',
        desc: 'Tus alumnos envían peso, energía y fotos de progreso directo desde su celular.',
        color: '#3B82F6',
    },
    {
        icon: Smartphone,
        title: 'App White-Label',
        desc: 'Tu propia app con tu logo, colores y URL. Instálala como PWA en cualquier celular.',
        color: '#00BFFF',
    },
    {
        icon: ClipboardList,
        title: 'Ficha del alumno',
        desc: 'Recoge datos clave: peso, altura, objetivos, lesiones, nivel. Todo en un solo lugar.',
        color: '#2563EB',
    },
    {
        icon: BarChart3,
        title: 'Analítica en vivo',
        desc: 'Dashboard con métricas de cada alumno: avance de peso, volumen, adherencia.',
        color: '#06B6D4',
    },
]

const stats = [
    { value: '10', label: 'Grupos musculares' },
    { value: '100%', label: 'Tu marca' },
    { value: '24/7', label: 'Soporte' },
]

/* ─── Animations ─── */
 
const fadeUp: any = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.25, 0.4, 0.25, 1] } },
}

const fadeIn: any = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.8 } },
}

const staggerContainer: any = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.12 } },
}

const scaleIn: any = {
    hidden: { opacity: 0, scale: 0.85 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.7, ease: [0.25, 0.4, 0.25, 1] } },
}

/* ─── Component: Animated Counter ─── */
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
            <div className="text-4xl md:text-5xl font-black text-foreground mb-2">{value}</div>
            <div className="text-sm text-foreground/50 uppercase tracking-widest font-medium">{label}</div>
        </motion.div>
    )
}

/* ─── Component: Feature Card ─── */
function FeatureCard({ feature, index }: { feature: typeof features[0]; index: number }) {
    const ref = useRef<HTMLDivElement>(null)
    const inView = useInView(ref, { once: true, margin: '-80px' })

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: index * 0.08 }}
            className="group relative rounded-3xl border border-border bg-card p-7 hover:bg-white/[0.04] transition-all duration-500"
        >
            {/* Glow on hover */}
            <div
                className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl"
                style={{ background: `radial-gradient(circle at 50% 50%, ${feature.color}15, transparent 70%)` }}
            />

            <div className="relative z-10">
                <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
                    style={{ backgroundColor: `${feature.color}15` }}
                >
                    <feature.icon className="w-6 h-6" style={{ color: feature.color }} />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-foreground/50 leading-relaxed">{feature.desc}</p>
            </div>
        </motion.div>
    )
}

/* ─── Component: Pill Nav ─── */
function PillNav() {
    const [scrolled, setScrolled] = useState(false)
    const { t } = useTranslation();

    useEffect(() => {
        const handler = () => setScrolled(window.scrollY > 40)
        window.addEventListener('scroll', handler)
        return () => window.removeEventListener('scroll', handler)
    }, [])

    return (
        <motion.nav
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className={`fixed top-[calc(1rem+var(--safe-area-inset-top,0px))] left-1/2 -translate-x-1/2 z-50 transition-all duration-500 bg-background/60 dark:bg-black/10 backdrop-blur-2xl border ${scrolled
                ? 'border-border shadow-2xl shadow-black/5'
                : 'border-border/50'
                } rounded-full px-4 sm:px-6 py-3 flex items-center w-[95%] max-w-5xl justify-between`}
        >
            <Link href="/" className="flex items-center" aria-label="EVA — inicio">
                <GymAppLogo className="h-10 w-[7.5rem] sm:h-11 sm:w-[8.5rem]" />
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-6 absolute left-1/2 -translate-x-1/2">
                {[
                    { key: 'landing.nav.features', id: 'funciones' },
                    { key: 'landing.nav.pricing', id: 'precios' },
                    { key: 'landing.nav.contact', id: 'contacto' }
                ].map(item => (
                    <a
                        key={item.id}
                        href={`#${item.id}`}
                        className="text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
                    >
                        {t(item.key)}
                    </a>
                ))}
            </div>

            {/* Desktop Actions */}
            <div className="hidden md:flex items-center gap-4">
                <ThemeToggle />
                <Link
                    href="/login"
                    className="text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
                >
                    {t('landing.nav.login')}
                </Link>
                <Link
                    href="/register?tier=pro&cycle=monthly"
                    className="bg-[#007AFF] text-white hover:bg-[#007AFF]/90 text-xs font-bold px-5 py-2.5 rounded-full transition-all glow-primary shadow-[0_0_20px_-5px_rgba(0,122,255,0.5)]"
                >
                    {t('landing.nav.register')}
                </Link>
            </div>

            {/* Mobile Navigation */}
            <div className="md:hidden flex items-center gap-2">
                <Link
                    href="/login"
                    className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 text-sm font-bold px-2 py-1.5 transition-colors"
                >
                    {t('landing.nav.login')}
                </Link>
                <Sheet>
                    <SheetTrigger className="p-2 text-foreground/70 hover:text-foreground transition-colors rounded-full hover:bg-accent focus:outline-none flex items-center justify-center">
                        <Menu className="w-5 h-5" />
                    </SheetTrigger>
                    <SheetContent side="right" className="w-[300px] sm:w-[400px] border-l-border bg-background pt-16 flex flex-col gap-8">
                        <SheetTitle className="sr-only">Menú de Navegación</SheetTitle>
                        
                        <div className="flex flex-col gap-4 px-2">
                            {[
                                { key: 'landing.nav.features', id: 'funciones' },
                                { key: 'landing.nav.pricing', id: 'precios' }
                            ].map(item => (
                                <a
                                    key={item.id}
                                    href={`#${item.id}`}
                                    className="text-xl font-bold text-foreground/90 hover:text-cyan-500 transition-colors py-3 border-b border-border/40"
                                >
                                    {t(item.key)}
                                </a>
                            ))}
                        </div>

                        <div className="mt-auto flex flex-col gap-6 px-2 pb-8">
                            <div className="flex items-center justify-between py-4 border-t border-border/50">
                                <span className="text-sm font-medium text-foreground/70 text-left w-full">Configuración</span>
                                <div className="flex gap-4 shrink-0 justify-end">
                                    <LanguageToggle />
                                    <ThemeToggle />
                                </div>
                            </div>
                            
                            <div className="flex flex-col gap-3">
                                <Link
                                    href="/register?tier=pro&cycle=monthly"
                                    className="text-center w-full py-3 rounded-xl bg-cyan-500 text-background font-bold hover:bg-cyan-400 hover:shadow-lg hover:shadow-cyan-500/25 transition-all"
                                >
                                    {t('landing.nav.register')}
                                </Link>
                            </div>
                        </div>
                    </SheetContent>
                </Sheet>
            </div>
        </motion.nav>
    )
}

/* ─── Component: Sticky Branding Card (Intelligent Redirect) ─── */
function StickyBrandingCard() {
    const [coach, setCoach] = useState<{ slug: string; name: string; logo: string | null } | null>(null)
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        const slug = localStorage.getItem('last_coach_slug')
        const name = localStorage.getItem('coach_brand_name')
        const logo = localStorage.getItem('coach_logo_url')
        if (slug && name) {
            setCoach({ slug, name, logo })
            // Show with a slight delay for effect
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
                    <div className="bg-card/80 backdrop-blur-xl border border-white/10 shadow-2xl rounded-3xl p-5 relative overflow-hidden group">
                        {/* Background Decoration */}
                        <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 blur-2xl rounded-full -mr-12 -mt-12 group-hover:bg-cyan-500/20 transition-colors" />
                        
                        <button 
                            onClick={() => setIsVisible(false)}
                            className="absolute top-3 right-3 p-1 rounded-full hover:bg-white/5 text-foreground/30 hover:text-foreground transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="flex items-start gap-4">
                            <div className="shrink-0">
                                {coach.logo ? (
                                    <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-white/5 bg-background">
                                        <Image 
                                            src={coach.logo} 
                                            alt={coach.name} 
                                            fill 
                                            className="object-contain p-1"
                                        />
                                    </div>
                                ) : (
                                    <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
                                        <Dumbbell className="w-6 h-6 text-cyan-400" />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0 pr-4">
                                <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1">
                                    Bienvenido de nuevo
                                </p>
                                <h4 className="text-sm font-bold text-foreground truncate mb-3">
                                    {coach.name}
                                </h4>
                                <Link
                                    href={`/c/${coach.slug}/login`}
                                    className="inline-flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-background text-xs font-bold px-4 py-2 rounded-full transition-all group/btn"
                                >
                                    Ir a mi entrenamiento
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

/* ═══════════════════════════════════════════════════════════════
   Main Landing Page
   ═══════════════════════════════════════════════════════════════ */
export default function LandingPage() {
    const heroRef = useRef<HTMLDivElement>(null)
    const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
    const { t } = useTranslation()

    const heroScale = useTransform(scrollYProgress, [0, 1], [1, 0.9])
    const heroY = useTransform(scrollYProgress, [0, 1], [0, 100])

    const [selectedTier, setSelectedTier] = useState(0)
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
        { value: String(exerciseCount), label: 'Ejercicios en GIF' },
        ...stats,
    ]
    const selectedTierId = clientTiers[selectedTier].id
    const selectedTierConfig = TIER_CONFIG[selectedTierId]
    const allowedCyclesForCard = getTierAllowedBillingCycles(selectedTierId)
    const isMonthlyOnlyCard =
        allowedCyclesForCard.length === 1 && allowedCyclesForCard[0] === 'monthly'

    return (
        <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
            <PillNav />
            <StickyBrandingCard />

            {/* ── HERO ── */}
            <section ref={heroRef} className="relative min-h-screen flex flex-col items-center justify-center pt-[calc(7rem+var(--safe-area-inset-top,0px))] pb-32 bg-background">
                {/* Background glow orbs */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                    <div className="absolute top-1/4 left-1/4 w-[300px] md:w-[600px] h-[300px] md:h-[600px] rounded-full bg-[#007AFF]/10 blur-[100px] md:blur-[150px]" />
                    <div className="absolute bottom-1/4 right-1/4 w-[200px] md:w-[400px] h-[200px] md:h-[400px] rounded-full bg-[#00E5FF]/5 blur-[80px] md:blur-[120px]" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] md:w-[800px] h-[400px] md:h-[800px] rounded-full bg-[#007AFF]/5 blur-[120px] md:blur-[200px]" />
                </div>

                {/* Subtle grid pattern */}
                <div
                    className="absolute inset-0 opacity-[0.02]"
                    style={{
                        backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
                        backgroundSize: '40px 40px',
                    }}
                />

                <motion.div
                    style={{ scale: heroScale, y: heroY }}
                    className="relative z-10 w-full max-w-[1200px] mx-auto px-6 text-center flex flex-col items-center"
                >
                    {/* Badge */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="inline-flex items-center gap-2 bg-zinc-900/40 dark:bg-black/40 backdrop-blur-md border border-white/10 rounded-full px-4 py-1.5 mb-8 shadow-xl"
                    >
                        <Sparkles className="w-3.5 h-3.5 text-[#00E5FF]" />
                        <span className="text-xs text-zinc-100 dark:text-zinc-300 font-medium">{t('landing.hero.badge')}</span>
                    </motion.div>

                    {/* Main headline */}
                    <motion.h1
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4, duration: 0.8 }}
                        className="text-4xl sm:text-5xl md:text-6xl lg:text-[5rem] font-black tracking-tighter leading-[1.1] mb-6 font-display text-foreground max-w-5xl mx-auto"
                    >
                        <span className="text-foreground block">{t('landing.hero.title1')}</span>
                        <span className="bg-gradient-to-r from-foreground via-zinc-400 to-zinc-500 bg-clip-text text-transparent block mt-2">
                            {t('landing.hero.title2')}
                        </span>
                    </motion.h1>

                    {/* Subheadline */}
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                        className="text-base md:text-xl text-muted-foreground max-w-3xl mx-auto mb-10 leading-relaxed font-sans"
                    >
                        {t('landing.hero.subtitle')}
                    </motion.p>

                    {/* CTA buttons */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.7 }}
                        className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto"
                    >
                        <Link
                            href="/register?tier=pro&cycle=monthly"
                            className="w-full sm:w-auto bg-[#007AFF] text-white hover:bg-[#007AFF]/90 font-bold px-8 py-4 rounded-full text-base transition-all duration-300 flex items-center justify-center gap-2 glow-primary shadow-[0_0_20px_-5px_rgba(0,122,255,0.5)] group/btn"
                        >
                            {t('landing.hero.cta')}
                            <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-1 transition-transform" />
                        </Link>
                        <a
                            href="#funciones"
                            className="w-full sm:w-auto text-zinc-400 hover:text-white text-sm font-medium px-8 py-4 rounded-full border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 backdrop-blur-md transition-all flex items-center justify-center gap-2"
                        >
                            <Play className="w-4 h-4" />
                            Ver funciones
                        </a>
                    </motion.div>

                    {/* Dashboard Mockup */}
                    <DashboardMockup />

                </motion.div>
            </section>

            <DemoVideoSection />

            {/* ── STATS BAR ── */}
            <section className="relative py-16 border-y border-white/[0.04]">
                <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
                    {statsWithExercises.map((stat, i) => (
                        <AnimatedCounter key={i} value={stat.value} label={stat.label} />
                    ))}
                </div>
            </section>

            {/* ── CORE FEATURES (NEW) ── */}
            <section className="relative py-28 z-10">
                <div className="max-w-[1200px] mx-auto px-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        
                        {/* 1. Creador de Rutinas Drag & Drop */}
                        <motion.div
                            variants={scaleIn}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: '-50px' }}
                            className="bg-card dark:bg-white/[0.05] backdrop-blur-2xl border border-border dark:border-white/10 rounded-xl p-8 hover:bg-accent/50 dark:hover:bg-white/[0.08] transition-all duration-300 group shadow-lg shadow-black/5 dark:shadow-black/20"
                        >
                            <div className="w-12 h-12 rounded-xl bg-[#007AFF]/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <Menu className="w-6 h-6 text-[#007AFF]" />
                            </div>
                            <h3 className="text-xl font-bold text-foreground mb-6">Creador de Rutinas Drag & Drop</h3>
                            <div className="bg-secondary dark:bg-black/20 backdrop-blur-xl rounded-lg p-4 border border-border dark:border-white/5 space-y-3">
                                {[
                                    { name: 'Sentadilla Libre', reps: '4 x 10' },
                                    { name: 'Press de Banca', reps: '4 x 8' },
                                    { name: 'Peso Muerto', reps: '3 x 12' }
                                ].map((ex, i) => (
                                    <div key={i} className="flex items-center gap-3 bg-background dark:bg-white/10 backdrop-blur-md p-3 rounded-md cursor-grab active:cursor-grabbing border border-border dark:border-white/5 hover:border-muted-foreground/20 dark:hover:border-white/10 transition-colors">
                                        <Menu className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-xs font-semibold text-foreground/90">{ex.name}</span>
                                        <span className="text-[10px] text-muted-foreground ml-auto bg-muted dark:bg-white/5 px-2 py-1 rounded-md">{ex.reps}</span>
                                    </div>
                                ))}
                            </div>
                        </motion.div>

                        {/* 2. Calculadora de Macros Visual */}
                        <motion.div
                            variants={scaleIn}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: '-50px' }}
                            transition={{ delay: 0.1 }}
                            className="bg-card dark:bg-white/[0.05] backdrop-blur-2xl border border-border dark:border-white/10 rounded-xl p-8 hover:bg-accent/50 dark:hover:bg-white/[0.08] transition-all duration-300 group shadow-lg shadow-black/5 dark:shadow-black/20"
                        >
                            <div className="w-12 h-12 rounded-xl bg-[#00E5FF]/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <BarChart3 className="w-6 h-6 text-[#00E5FF]" />
                            </div>
                            <h3 className="text-xl font-bold text-foreground mb-6">Calculadora de Macros Visual</h3>
                            <div className="bg-secondary dark:bg-black/20 backdrop-blur-xl rounded-lg p-6 border border-border dark:border-white/5 flex items-center justify-center gap-6">
                                {/* Simulated Donut Charts */}
                                {[
                                    { label: 'Prot', val: '36g', color: '#007AFF' },
                                    { label: 'Carb', val: '20g', color: '#00E5FF' },
                                    { label: 'Grasa', val: '15g', color: '#3B82F6' },
                                ].map((macro, i) => (
                                    <div key={i} className="flex flex-col items-center gap-2">
                                        <div className="w-14 h-14 rounded-full border-4 flex items-center justify-center" style={{ borderColor: `${macro.color}40`, borderTopColor: macro.color }}>
                                            <span className="text-xs font-bold text-foreground">{macro.val}</span>
                                        </div>
                                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{macro.label}</span>
                                    </div>
                                ))}
                            </div>
                        </motion.div>

                        {/* 3. Sistema de Plantillas Inteligentes */}
                        <motion.div
                            variants={scaleIn}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: '-50px' }}
                            transition={{ delay: 0.2 }}
                            className="bg-card dark:bg-white/[0.05] backdrop-blur-2xl border border-border dark:border-white/10 rounded-xl p-8 hover:bg-accent/50 dark:hover:bg-white/[0.08] transition-all duration-300 group flex flex-col shadow-lg shadow-black/5 dark:shadow-black/20"
                        >
                            <div className="w-12 h-12 rounded-xl bg-[#00BFFF]/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <Zap className="w-6 h-6 text-[#00BFFF]" />
                            </div>
                            <h3 className="text-xl font-bold text-foreground mb-6">Sistema de Plantillas Inteligentes</h3>
                            <div className="bg-secondary dark:bg-black/20 backdrop-blur-xl rounded-lg p-4 border border-border dark:border-white/5 flex-1 flex flex-col gap-3">
                                <div className="flex items-center justify-between bg-background dark:bg-white/10 backdrop-blur-md p-3 rounded-md border border-border dark:border-white/5">
                                    <span className="text-sm text-foreground/90 font-medium">Volumen Nivel Intermedio</span>
                                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                </div>
                                <div className="flex items-center justify-between bg-muted dark:bg-white/5 backdrop-blur-md p-3 rounded-md border border-border dark:border-white/5 opacity-70">
                                    <span className="text-sm text-muted-foreground font-medium">Definición Principiante</span>
                                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                </div>
                                <div className="mt-auto pt-4">
                                    <button className="w-full bg-[#007AFF] hover:bg-[#007AFF]/90 text-white text-sm font-bold py-2.5 rounded-md transition-colors shadow-lg shadow-[#007AFF]/20">
                                        Aplicar a Cliente
                                    </button>
                                </div>
                            </div>
                        </motion.div>

                    </div>
                </div>
            </section>

            {/* ── FEATURES GRID ── */}
            <section id="funciones" className="relative py-28">
                {/* Background glow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-cyan-500/[0.03] blur-[200px] pointer-events-none" />

                <div className="max-w-6xl mx-auto px-6">
                    <motion.div
                        variants={fadeUp}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: '-80px' }}
                        className="text-center mb-16"
                    >
                        <span className="text-cyan-400 text-xs font-bold uppercase tracking-[0.2em] mb-4 block">
                            Funciones
                        </span>
                        <h2 className="text-3xl md:text-5xl font-black text-foreground mb-4">
                            Todo lo que necesitas
                        </h2>
                        <p className="text-foreground/40 text-base md:text-lg max-w-xl mx-auto">
                            Herramientas diseñadas para coaches que quieren escalar.
                        </p>
                    </motion.div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {features.map((feature, i) => (
                            <FeatureCard key={i} feature={feature} index={i} />
                        ))}
                    </div>
                </div>
            </section>

            {/* ── EXERCISE SHOWCASE ── */}
            <section className="relative py-28 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/[0.02] to-transparent pointer-events-none" />

                <div className="max-w-6xl mx-auto px-6">
                    <div className="grid lg:grid-cols-2 gap-16 items-center">
                        {/* Left: text */}
                        <motion.div
                            variants={fadeUp}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: '-80px' }}
                        >
                            <span className="text-cyan-400 text-xs font-bold uppercase tracking-[0.2em] mb-4 block">
                                Ejercicios
                            </span>
                            <h2 className="text-3xl md:text-5xl font-black text-foreground mb-6 leading-tight">
                                {exerciseCount} ejercicios
                                <br />
                                <span className="text-foreground/30">con GIF de demostración</span>
                            </h2>
                            <p className="text-foreground/40 text-base leading-relaxed mb-8 max-w-md">
                                Cada ejercicio incluye demostración visual, instrucciones paso a paso,
                                equipo necesario y músculos trabajados. En español.
                            </p>

                            <div className="space-y-3">
                                {['GIF de demostración', 'Instrucciones en español', '10 grupos musculares', 'Agrega ejercicios propios'].map(item => (
                                    <div key={item} className="flex items-center gap-3">
                                        <div className="w-5 h-5 rounded-full bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                                            <Check className="w-3 h-3 text-cyan-400" />
                                        </div>
                                        <span className="text-sm text-foreground/60">{item}</span>
                                    </div>
                                ))}
                            </div>
                        </motion.div>

                        {/* Right: exercise cards mockup */}
                        <motion.div
                            variants={scaleIn}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: '-80px' }}
                            className="relative"
                        >
                            <div className="absolute inset-0 bg-cyan-500/5 blur-[100px] rounded-full" />
                            <div className="relative bg-white/[0.05] backdrop-blur-2xl border border-white/10 rounded-3xl p-6 space-y-3 shadow-2xl shadow-black/40">
                                {/* Mock exercise cards - Fitonist style */}
                                {[
                                    { name: 'Squat Jumps', muscle: 'Piernas', reps: '10 reps', color: '#007AFF' },
                                    { name: 'Pull Ups', muscle: 'Espalda', reps: '12 reps', color: '#3B82F6' },
                                    { name: 'Bench Press', muscle: 'Pecho', reps: '8 reps', color: '#00e5ff' },
                                    { name: 'Plank', muscle: 'Core', reps: '60 seg', color: '#00BFFF' },
                                ].map((ex, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, x: 20 }}
                                        whileInView={{ opacity: 1, x: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: 0.2 + i * 0.1 }}
                                        className="flex items-center gap-4 bg-white/[0.05] backdrop-blur-xl border border-white/10 rounded-2xl p-4 hover:bg-white/[0.08] transition-colors"
                                    >
                                        <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                                            <Dumbbell className="w-6 h-6 text-foreground/30" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-foreground truncate">{ex.name}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span
                                                    className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md"
                                                    style={{ backgroundColor: `${ex.color}20`, color: ex.color }}
                                                >
                                                    {ex.muscle}
                                                </span>
                                                <span className="text-xs text-foreground/30">{ex.reps}</span>
                                            </div>
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-foreground/20 flex-shrink-0" />
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* ── WHITE-LABEL SHOWCASE ── */}
            <section className="relative py-28">
                <div className="max-w-6xl mx-auto px-6 text-center">
                    <motion.div
                        variants={fadeUp}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: '-80px' }}
                    >
                        <span className="text-cyan-400 text-xs font-bold uppercase tracking-[0.2em] mb-4 block">
                            White-Label
                        </span>
                        <h2 className="text-3xl md:text-5xl font-black text-foreground mb-4">
                            Tu marca. Tu app.
                        </h2>
                        <p className="text-foreground/40 text-base md:text-lg max-w-xl mx-auto mb-16">
                            Cada coach obtiene su propia URL, logo y colores. Tus alumnos solo ven tu marca.
                        </p>
                    </motion.div>

                    {/* Bento grid showcasing white-label features */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <motion.div
                            variants={scaleIn}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true }}
                            className="md:col-span-2 bg-card border border-border rounded-3xl p-8 text-left"
                        >
                            <Palette className="w-8 h-8 text-cyan-400 mb-4" />
                            <h3 className="text-xl font-bold text-foreground mb-2">Personalización total</h3>
                            <p className="text-foreground/40 text-sm leading-relaxed">
                                Elige tu color de marca, sube tu logo y configura tu URL personalizada.
                                Tu alumno accede a <code className="text-cyan-400/70 font-mono text-xs">omnicoach.app/c/tu-marca</code> y ve TU identidad.
                            </p>
                            <div className="mt-6 flex gap-3">
                                {['#00e5ff', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6'].map(color => (
                                    <div
                                        key={color}
                                        className="w-8 h-8 rounded-full border-2 border-border"
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
                            transition={{ delay: 0.1 }}
                            className="bg-card border border-border rounded-3xl p-8 text-left"
                        >
                            <Smartphone className="w-8 h-8 text-cyan-400 mb-4" />
                            <h3 className="text-xl font-bold text-foreground mb-2">Instalable</h3>
                            <p className="text-foreground/40 text-sm leading-relaxed">
                                PWA que se instala como app nativa en cualquier celular. Sin App Store.
                            </p>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* ── PRICING ── */}
            <section id="precios" className="relative py-28">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/[0.02] to-transparent pointer-events-none" />

                <div className="max-w-4xl mx-auto px-6">
                    <motion.div
                        variants={fadeUp}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: '-80px' }}
                        className="text-center mb-16"
                    >
                        <span className="text-cyan-400 text-xs font-bold uppercase tracking-[0.2em] mb-4 block">
                            Precios
                        </span>
                        <h2 className="text-3xl md:text-5xl font-black text-foreground mb-4">
                            Precios por cupo de alumnos
                        </h2>
                        <p className="text-foreground/40 text-base md:text-lg max-w-xl mx-auto">
                            Los planes 1–5, 6–10 y 11–30 se cobran solo en mensualidad. Los planes 31–60 y 61–100,
                            solo en trimestral o anual. Starter Lite y Starter no incluyen módulo de nutrición.
                        </p>
                    </motion.div>

                    <motion.div
                        variants={scaleIn}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        className="relative bg-card border border-border rounded-3xl overflow-hidden"
                    >
                        {/* Glow */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-cyan-500/10 blur-[120px] pointer-events-none" />

                        <div className="relative p-8 md:p-12">
                            {/* Tier selector */}
                            <div className="flex flex-wrap justify-center gap-2 mb-10">
                                {clientTiers.map((tier, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setSelectedTier(i)}
                                        className={`px-4 py-2 rounded-full text-xs font-bold transition-all duration-300 ${selectedTier === i
                                            ? 'bg-cyan-500 text-background shadow-lg shadow-cyan-500/25'
                                            : 'bg-secondary text-foreground/50 hover:bg-white/[0.08] hover:text-foreground/70'
                                            }`}
                                    >
                                        {tier.label}
                                    </button>
                                ))}
                            </div>

                            <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
                                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                                    {getTierBillingCycleSummary(selectedTierId)}
                                </span>
                                <span
                                    className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                                        getTierNutritionSummary(selectedTierId).startsWith('Sin')
                                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                                            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                    }`}
                                >
                                    {getTierNutritionSummary(selectedTierId)}
                                </span>
                            </div>

                            {/* Price display */}
                            <div className="text-center mb-10">
                                <motion.div
                                    key={selectedTier}
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="space-y-4"
                                >
                                    {isMonthlyOnlyCard ? (
                                        <>
                                            <div className="flex items-end justify-center gap-1">
                                                <span className="text-5xl md:text-7xl font-black text-foreground">
                                                    ${clientTiers[selectedTier].price.toLocaleString('es-CL')}
                                                </span>
                                                <span className="text-foreground/30 text-lg mb-2">/mes CLP</span>
                                            </div>
                                            <p className="text-foreground/30 text-sm">
                                                Cancela cuando quieras
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-xs font-bold uppercase tracking-widest text-foreground/40">
                                                Montos por periodo (prepago)
                                            </p>
                                            <div className="mx-auto max-w-md space-y-2 text-left">
                                                {allowedCyclesForCard.map((cycle: BillingCycle) => {
                                                    const info = BILLING_CYCLE_CONFIG[cycle]
                                                    const amount = getTierPriceClp(selectedTierId, cycle)
                                                    return (
                                                        <div
                                                            key={cycle}
                                                            className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/30 px-4 py-3"
                                                        >
                                                            <span className="text-sm font-semibold text-foreground">
                                                                {info.label}
                                                                {info.discountPercent > 0 ? (
                                                                    <span className="ml-2 text-xs font-normal text-emerald-500">
                                                                        −{info.discountPercent}%
                                                                    </span>
                                                                ) : null}
                                                            </span>
                                                            <span className="text-sm font-black text-foreground tabular-nums">
                                                                ${amount.toLocaleString('es-CL')} CLP
                                                            </span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                            <p className="text-foreground/30 text-xs px-2">
                                                Referencia mensual del plan: $
                                                {TIER_CONFIG[selectedTierId].monthlyPriceClp.toLocaleString('es-CL')}{' '}
                                                CLP/mes (el cobro es trimestral o anual según elijas).
                                            </p>
                                        </>
                                    )}
                                </motion.div>
                            </div>

                            {/* Features */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto mb-10">
                                {selectedTierConfig.features.map((feat, i) => (
                                    <div key={i} className="flex items-center gap-2.5">
                                        <div className="w-5 h-5 rounded-full bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                                            <Check className="w-3 h-3 text-cyan-400" />
                                        </div>
                                        <span className="text-sm text-foreground/60">{feat}</span>
                                    </div>
                                ))}
                            </div>

                            {/* CTA */}
                            <div className="text-center">
                                <Link
                                    href={`/register?tier=${clientTiers[selectedTier].id}&cycle=${getDefaultBillingCycleForTier(clientTiers[selectedTier].id)}`}
                                    className="inline-flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-background font-bold px-8 py-4 rounded-full text-base transition-all duration-300 hover:shadow-xl hover:shadow-cyan-500/25"
                                >
                                    Empieza ahora
                                    <ArrowRight className="w-4 h-4" />
                                </Link>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* ── TRUST / TESTIMONIALS ── */}
            <section className="relative py-28">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* Testimonial 1 */}
                        <motion.div
                            variants={fadeUp}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: '-80px' }}
                            className="relative bg-card dark:bg-white/[0.02] border border-border dark:border-white/10 backdrop-blur-xl rounded-[2rem] p-8 overflow-hidden shadow-xl shadow-black/5 dark:shadow-none h-full flex flex-col justify-between"
                        >
                            <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/20 blur-[60px] rounded-full pointer-events-none" />
                            <div className="relative z-10">
                                <div className="flex justify-start gap-1 mb-6">
                                    {[...Array(5)].map((_, j) => (
                                        <Star key={j} className="w-5 h-5 fill-cyan-400 text-cyan-400" />
                                    ))}
                                </div>
                                <p className="text-lg md:text-xl font-medium text-foreground leading-relaxed italic mb-8">
                                    {`"EVA revolucionó mi negocio. Pasé de Excels caóticos a gestionar 50 clientes sin esfuerzo."`}
                                </p>
                            </div>
                            <div className="relative z-10 border-t border-border pt-6 mt-auto">
                                <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider">— Coach Alex Ramírez.</p>
                            </div>
                        </motion.div>

                        {/* Testimonial 2 */}
                        <motion.div
                            variants={fadeUp}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: '-80px' }}
                            className="relative bg-card dark:bg-white/[0.02] border border-border dark:border-white/10 backdrop-blur-xl rounded-[2rem] p-8 overflow-hidden shadow-xl shadow-black/5 dark:shadow-none h-full flex flex-col justify-between"
                            transition={{ delay: 0.1 }}
                        >
                            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-teal-500/20 blur-[60px] rounded-full pointer-events-none" />
                            <div className="relative z-10">
                                <div className="flex justify-start gap-1 mb-6">
                                    {[...Array(5)].map((_, j) => (
                                        <Star key={j} className="w-5 h-5 fill-cyan-400 text-cyan-400" />
                                    ))}
                                </div>
                                <p className="text-lg md:text-xl font-medium text-foreground leading-relaxed italic mb-8">
                                    {`"La mejor inversión para mi servicio de asesorías. Mis clientes aman la app y yo ahorro horas de trabajo."`}
                                </p>
                            </div>
                            <div className="relative z-10 border-t border-border pt-6 mt-auto">
                                <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider">— Coach Laura Mendoza.</p>
                            </div>
                        </motion.div>

                        {/* Testimonial 3 */}
                        <motion.div
                            variants={fadeUp}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: '-80px' }}
                            className="relative bg-card dark:bg-white/[0.02] border border-border dark:border-white/10 backdrop-blur-xl rounded-[2rem] p-8 overflow-hidden shadow-xl shadow-black/5 dark:shadow-none h-full flex flex-col justify-between"
                            transition={{ delay: 0.2 }}
                        >
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-emerald-500/20 blur-[60px] rounded-full pointer-events-none" />
                            <div className="relative z-10">
                                <div className="flex justify-start gap-1 mb-6">
                                    {[...Array(5)].map((_, j) => (
                                        <Star key={j} className="w-5 h-5 fill-cyan-400 text-cyan-400" />
                                    ))}
                                </div>
                                <p className="text-lg md:text-xl font-medium text-foreground leading-relaxed italic mb-8">
                                    {`"Increíblemente fácil de usar. El constructor de rutinas y dietas es exactamente lo que necesitaba."`}
                                </p>
                            </div>
                            <div className="relative z-10 border-t border-border pt-6 mt-auto">
                                <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider">— Coach Diego Silva.</p>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* ── FINAL CTA ── */}
            <section className="relative py-28">
                <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/[0.04] to-transparent pointer-events-none" />

                <motion.div
                    variants={fadeUp}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="max-w-3xl mx-auto px-6 text-center"
                >
                    <h2 className="text-4xl md:text-6xl font-black text-foreground mb-6 leading-tight">
                        Empieza hoy.
                        <br />
                        <span className="bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">
                            Únete ahora.
                        </span>
                    </h2>
                    <p className="text-foreground/40 text-base md:text-lg mb-10 max-w-lg mx-auto">
                        Configura tu plataforma en minutos y empieza a escalar tu negocio.
                    </p>
                    <Link
                        href="/register?tier=pro&cycle=monthly"
                        className="inline-flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-background font-bold px-10 py-5 rounded-full text-lg transition-all duration-300 hover:shadow-2xl hover:shadow-cyan-500/30"
                    >
                        Crear cuenta
                        <ArrowRight className="w-5 h-5" />
                    </Link>
                </motion.div>
            </section>

            {/* ── FOOTER ── */}
            <footer className="border-t border-border bg-transparent py-12">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <Link href="/" className="flex items-center" aria-label="EVA — inicio">
                            <GymAppLogo className="h-9 w-[6.75rem] sm:h-10 sm:w-[7.5rem]" />
                        </Link>

                        <div className="flex flex-wrap justify-center items-center gap-6 text-sm text-muted-foreground">
                            <Link href="/legal" className="hover:text-foreground transition-colors">Aviso Legal</Link>
                            <Link href="/privacidad" className="hover:text-foreground transition-colors">Privacidad</Link>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    )
}
