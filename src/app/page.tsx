'use client'

import Link from 'next/link'
import { useRef, useState, useEffect } from 'react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { motion, useScroll, useTransform, useInView, useMotionValue, useSpring } from 'framer-motion'
import {
    Dumbbell, Users, BarChart3, Camera, Sparkles, ArrowRight, Check,
    Zap, Shield, Smartphone, ChevronDown, Star, Play, Palette,
    ClipboardList, Apple, Utensils, Menu
} from 'lucide-react'
import {
    Sheet,
    SheetContent,
    SheetTrigger,
    SheetTitle
} from "@/components/ui/sheet"

/* ─── Constants ─── */
const clientTiers = [
    { label: '1–10 alumnos', price: 14990 },
    { label: '11–25 alumnos', price: 24990 },
    { label: '26–50 alumnos', price: 39990 },
    { label: '51–100 alumnos', price: 59990 },
    { label: '101–200 alumnos', price: 89990 },
]

const premiumFeatures = [
    'Rutinas ilimitadas con GIFs animados',
    'Catálogo de 230+ ejercicios',
    'Planes de nutrición',
    'Check-ins de progreso con fotos',
    'App White-Label con tu marca',
    'Soporte prioritario',
]

const features = [
    {
        icon: Dumbbell,
        title: 'Constructor de rutinas',
        desc: 'Crea rutinas profesionales con 230+ ejercicios, cada uno con GIF animado e instrucciones.',
        color: '#10B981',
    },
    {
        icon: Utensils,
        title: 'Planes de nutrición',
        desc: 'Asigna planes alimenticios a cada alumno. Ellos anotan lo que comen día a día.',
        color: '#F59E0B',
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
        color: '#8B5CF6',
    },
    {
        icon: ClipboardList,
        title: 'Ficha del alumno',
        desc: 'Recoge datos clave: peso, altura, objetivos, lesiones, nivel. Todo en un solo lugar.',
        color: '#EC4899',
    },
    {
        icon: BarChart3,
        title: 'Analítica en vivo',
        desc: 'Dashboard con métricas de cada alumno: avance de peso, volumen, adherencia.',
        color: '#06B6D4',
    },
]

const stats = [
    { value: '230+', label: 'Ejercicios con GIF' },
    { value: '10', label: 'Grupos musculares' },
    { value: '30', label: 'Días gratis' },
    { value: '100%', label: 'Tu marca' },
]

/* ─── Animations ─── */
/* eslint-disable @typescript-eslint/no-explicit-any */
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
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 ${scrolled
                ? 'bg-background/80 backdrop-blur-xl border border-border shadow-2xl shadow-foreground/5'
                : 'bg-transparent'
                } rounded-full px-4 sm:px-6 py-3 flex items-center gap-4 sm:gap-6 w-[95%] sm:w-auto justify-between sm:justify-center`}
        >
            <Link href="/" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <Dumbbell className="w-4 h-4 text-emerald-400" />
                </div>
                <span className="text-foreground font-bold text-sm tracking-tight hidden sm:inline">OmniCoach</span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
                {[
                    { key: 'landing.nav.features', id: 'funciones' },
                    { key: 'landing.nav.pricing', id: 'precios' },
                    { key: 'landing.nav.contact', id: 'contacto' }
                ].map(item => (
                    <a
                        key={item.id}
                        href={`#${item.id}`}
                        className="text-foreground/60 hover:text-foreground text-xs font-medium px-3 py-1.5 rounded-full hover:bg-accent transition-all"
                    >
                        {t(item.key)}
                    </a>
                ))}
            </div>

            {/* Desktop Actions */}
            <div className="hidden md:flex items-center gap-2 ml-2">
                <LanguageToggle />
                <ThemeToggle />
                <Link
                    href="/login"
                    className="text-foreground/70 hover:text-foreground text-xs font-medium px-3 py-1.5 transition-colors"
                >
                    {t('landing.nav.login')}
                </Link>
                <Link
                    href="/register"
                    className="bg-emerald-500 hover:bg-emerald-400 text-background text-xs font-bold px-4 py-2 rounded-full transition-all hover:shadow-lg hover:shadow-emerald-500/25"
                >
                    {t('landing.nav.register')}
                </Link>
            </div>

            {/* Mobile Navigation */}
            <div className="md:hidden">
                <Sheet>
                    <SheetTrigger className="p-2 text-foreground/70 hover:text-foreground transition-colors rounded-full hover:bg-accent focus:outline-none flex items-center justify-center">
                        <Menu className="w-5 h-5" />
                    </SheetTrigger>
                    <SheetContent side="right" className="w-[300px] sm:w-[400px] border-l-border bg-background pt-16 flex flex-col gap-8">
                        <SheetTitle className="sr-only">Menú de Navegación</SheetTitle>
                        
                        <div className="flex flex-col gap-4 px-2">
                            {[
                                { key: 'landing.nav.features', id: 'funciones' },
                                { key: 'landing.nav.pricing', id: 'precios' },
                                { key: 'landing.nav.contact', id: 'contacto' }
                            ].map(item => (
                                <a
                                    key={item.id}
                                    href={`#${item.id}`}
                                    className="text-xl font-medium text-foreground/80 hover:text-emerald-500 transition-colors py-2 border-b border-border/50"
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
                                    href="/login"
                                    className="text-center w-full py-3 rounded-xl border border-border text-foreground font-medium hover:bg-accent transition-colors"
                                >
                                    {t('landing.nav.login')}
                                </Link>
                                <Link
                                    href="/register"
                                    className="text-center w-full py-3 rounded-xl bg-emerald-500 text-background font-bold hover:bg-emerald-400 hover:shadow-lg hover:shadow-emerald-500/25 transition-all"
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

/* ═══════════════════════════════════════════════════════════════
   Main Landing Page
   ═══════════════════════════════════════════════════════════════ */
export default function LandingPage() {
    const heroRef = useRef<HTMLDivElement>(null)
    const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
    const { t } = useTranslation()

    const heroScale = useTransform(scrollYProgress, [0, 1], [1, 0.9])
    const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
    const heroY = useTransform(scrollYProgress, [0, 1], [0, 100])

    const [selectedTier, setSelectedTier] = useState(0)

    return (
        <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
            <PillNav />

            {/* ── HERO ── */}
            <section ref={heroRef} className="relative min-h-screen flex items-center justify-center pt-20 pb-32">
                {/* Background glow orbs */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-emerald-500/8 blur-[150px]" />
                    <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-emerald-600/5 blur-[120px]" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-emerald-500/3 blur-[200px]" />
                </div>

                {/* Subtle grid pattern */}
                <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
                        backgroundSize: '60px 60px',
                    }}
                />

                <motion.div
                    style={{ scale: heroScale, opacity: heroOpacity, y: heroY }}
                    className="relative z-10 max-w-5xl mx-auto px-6 text-center"
                >
                    {/* Badge */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="inline-flex items-center gap-2 bg-secondary border border-border rounded-full px-4 py-1.5 mb-8"
                    >
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-xs text-foreground/70 font-medium">{t('landing.hero.badge')}</span>
                    </motion.div>

                    {/* Main headline */}
                    <motion.h1
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4, duration: 0.8 }}
                        className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[0.9] mb-6"
                    >
                        <span className="text-foreground">{t('landing.hero.title1')}</span>
                        <br />
                        <span className="bg-gradient-to-r from-emerald-400 via-emerald-300 to-teal-400 bg-clip-text text-transparent">
                            {t('landing.hero.title2')}
                        </span>
                        <br />
                        <span className="text-foreground/40">{t('landing.hero.title3')}</span>
                    </motion.h1>

                    {/* Subheadline */}
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                        className="text-lg md:text-xl text-foreground/40 max-w-2xl mx-auto mb-10 leading-relaxed"
                    >
                        {t('landing.hero.subtitle')}
                    </motion.p>

                    {/* CTA buttons */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.7 }}
                        className="flex flex-col sm:flex-row items-center justify-center gap-4"
                    >
                        <Link
                            href="/register"
                            className="group relative bg-emerald-500 hover:bg-emerald-400 text-background font-bold px-8 py-4 rounded-full text-base transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/25 flex items-center gap-2"
                        >
                            {t('landing.hero.cta')}
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </Link>
                        <a
                            href="#funciones"
                            className="text-foreground/50 hover:text-foreground text-sm font-medium px-6 py-4 rounded-full border border-border hover:border-border transition-all flex items-center gap-2"
                        >
                            <Play className="w-3.5 h-3.5" />
                            Ver funciones
                        </a>
                    </motion.div>

                    {/* Scroll indicator */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1.2 }}
                        className="mt-20"
                    >
                        <motion.div
                            animate={{ y: [0, 8, 0] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                        >
                            <ChevronDown className="w-5 h-5 text-foreground/20 mx-auto" />
                        </motion.div>
                    </motion.div>
                </motion.div>
            </section>

            {/* ── STATS BAR ── */}
            <section className="relative py-16 border-y border-white/[0.04]">
                <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
                    {stats.map((stat, i) => (
                        <AnimatedCounter key={i} value={stat.value} label={stat.label} />
                    ))}
                </div>
            </section>

            {/* ── FEATURES GRID ── */}
            <section id="funciones" className="relative py-28">
                {/* Background glow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-emerald-500/[0.03] blur-[200px] pointer-events-none" />

                <div className="max-w-6xl mx-auto px-6">
                    <motion.div
                        variants={fadeUp}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: '-80px' }}
                        className="text-center mb-16"
                    >
                        <span className="text-emerald-400 text-xs font-bold uppercase tracking-[0.2em] mb-4 block">
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
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/[0.02] to-transparent pointer-events-none" />

                <div className="max-w-6xl mx-auto px-6">
                    <div className="grid lg:grid-cols-2 gap-16 items-center">
                        {/* Left: text */}
                        <motion.div
                            variants={fadeUp}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: '-80px' }}
                        >
                            <span className="text-emerald-400 text-xs font-bold uppercase tracking-[0.2em] mb-4 block">
                                Ejercicios
                            </span>
                            <h2 className="text-3xl md:text-5xl font-black text-foreground mb-6 leading-tight">
                                230+ ejercicios
                                <br />
                                <span className="text-foreground/30">con GIF animado</span>
                            </h2>
                            <p className="text-foreground/40 text-base leading-relaxed mb-8 max-w-md">
                                Cada ejercicio incluye demostración visual, instrucciones paso a paso,
                                equipo necesario y músculos trabajados. En español.
                            </p>

                            <div className="space-y-3">
                                {['GIF animado de demostración', 'Instrucciones en español', '10 grupos musculares', 'Agrega ejercicios propios'].map(item => (
                                    <div key={item} className="flex items-center gap-3">
                                        <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                                            <Check className="w-3 h-3 text-emerald-400" />
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
                            <div className="absolute inset-0 bg-emerald-500/5 blur-[100px] rounded-full" />
                            <div className="relative bg-white/[0.03] border border-border rounded-3xl p-6 space-y-3">
                                {/* Mock exercise cards - Fitonist style */}
                                {[
                                    { name: 'Squat Jumps', muscle: 'Piernas', reps: '10 reps', color: '#F59E0B' },
                                    { name: 'Pull Ups', muscle: 'Espalda', reps: '12 reps', color: '#3B82F6' },
                                    { name: 'Bench Press', muscle: 'Pecho', reps: '8 reps', color: '#10B981' },
                                    { name: 'Plank', muscle: 'Core', reps: '60 seg', color: '#8B5CF6' },
                                ].map((ex, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, x: 20 }}
                                        whileInView={{ opacity: 1, x: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: 0.2 + i * 0.1 }}
                                        className="flex items-center gap-4 bg-white/[0.03] border border-border rounded-2xl p-4 hover:bg-white/[0.06] transition-colors"
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
                        <span className="text-emerald-400 text-xs font-bold uppercase tracking-[0.2em] mb-4 block">
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
                            <Palette className="w-8 h-8 text-emerald-400 mb-4" />
                            <h3 className="text-xl font-bold text-foreground mb-2">Personalización total</h3>
                            <p className="text-foreground/40 text-sm leading-relaxed">
                                Elige tu color de marca, sube tu logo y configura tu URL personalizada.
                                Tu alumno accede a <code className="text-emerald-400/70 font-mono text-xs">omnicoach.app/c/tu-marca</code> y ve TU identidad.
                            </p>
                            <div className="mt-6 flex gap-3">
                                {['#10B981', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6'].map(color => (
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
                            <Smartphone className="w-8 h-8 text-emerald-400 mb-4" />
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
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/[0.02] to-transparent pointer-events-none" />

                <div className="max-w-4xl mx-auto px-6">
                    <motion.div
                        variants={fadeUp}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: '-80px' }}
                        className="text-center mb-16"
                    >
                        <span className="text-emerald-400 text-xs font-bold uppercase tracking-[0.2em] mb-4 block">
                            Precios
                        </span>
                        <h2 className="text-3xl md:text-5xl font-black text-foreground mb-4">
                            Un solo plan. Todo incluido.
                        </h2>
                        <p className="text-foreground/40 text-base md:text-lg max-w-xl mx-auto">
                            Solo pagas por la cantidad de alumnos. Todas las funciones siempre incluidas.
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
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-emerald-500/10 blur-[120px] pointer-events-none" />

                        <div className="relative p-8 md:p-12">
                            {/* Tier selector */}
                            <div className="flex flex-wrap justify-center gap-2 mb-10">
                                {clientTiers.map((tier, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setSelectedTier(i)}
                                        className={`px-4 py-2 rounded-full text-xs font-bold transition-all duration-300 ${selectedTier === i
                                            ? 'bg-emerald-500 text-background shadow-lg shadow-emerald-500/25'
                                            : 'bg-secondary text-foreground/50 hover:bg-white/[0.08] hover:text-foreground/70'
                                            }`}
                                    >
                                        {tier.label}
                                    </button>
                                ))}
                            </div>

                            {/* Price display */}
                            <div className="text-center mb-10">
                                <motion.div
                                    key={selectedTier}
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="flex items-end justify-center gap-1"
                                >
                                    <span className="text-5xl md:text-7xl font-black text-foreground">
                                        ${clientTiers[selectedTier].price.toLocaleString('es-CL')}
                                    </span>
                                    <span className="text-foreground/30 text-lg mb-2">/mes CLP</span>
                                </motion.div>
                                <p className="text-foreground/30 text-sm mt-3">
                                    30 días gratis · Cancela cuando quieras
                                </p>
                            </div>

                            {/* Features */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto mb-10">
                                {premiumFeatures.map((feat, i) => (
                                    <div key={i} className="flex items-center gap-2.5">
                                        <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                                            <Check className="w-3 h-3 text-emerald-400" />
                                        </div>
                                        <span className="text-sm text-foreground/60">{feat}</span>
                                    </div>
                                ))}
                            </div>

                            {/* CTA */}
                            <div className="text-center">
                                <Link
                                    href="/register"
                                    className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-background font-bold px-8 py-4 rounded-full text-base transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/25"
                                >
                                    Empieza 30 días gratis
                                    <ArrowRight className="w-4 h-4" />
                                </Link>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* ── TRUST / TESTIMONIALS ── */}
            <section className="relative py-28">
                <div className="max-w-5xl mx-auto px-6 text-center">
                    <motion.div
                        variants={fadeUp}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: '-80px' }}
                    >
                        <h2 className="text-3xl md:text-5xl font-black text-foreground mb-16">
                            Diseñado para coaches
                            <br />
                            <span className="text-foreground/30">que quieren crecer</span>
                        </h2>
                    </motion.div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                            {
                                quote: 'Por fin una plataforma que entiende lo que necesito como coach. La app white-label es un game changer.',
                                name: 'Carlos M.',
                                role: 'Coach Personal',
                            },
                            {
                                quote: 'Mis alumnos aman los GIFs de los ejercicios. Ya no tengo que mandar videos por WhatsApp.',
                                name: 'Andrea L.',
                                role: 'Entrenadora Fitness',
                            },
                            {
                                quote: 'Pasé de una hoja de Excel a una plataforma profesional en 5 minutos. Increíble.',
                                name: 'Diego R.',
                                role: 'Preparador Físico',
                            },
                        ].map((t, i) => (
                            <motion.div
                                key={i}
                                variants={fadeUp}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="bg-card border border-border rounded-3xl p-7 text-left"
                            >
                                <div className="flex gap-1 mb-4">
                                    {[...Array(5)].map((_, j) => (
                                        <Star key={j} className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" />
                                    ))}
                                </div>
                                <p className="text-sm text-foreground/50 leading-relaxed mb-6">&ldquo;{t.quote}&rdquo;</p>
                                <div>
                                    <p className="text-sm font-bold text-foreground">{t.name}</p>
                                    <p className="text-xs text-foreground/30">{t.role}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── FINAL CTA ── */}
            <section className="relative py-28">
                <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/[0.04] to-transparent pointer-events-none" />

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
                        <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                            30 días gratis.
                        </span>
                    </h2>
                    <p className="text-foreground/40 text-base md:text-lg mb-10 max-w-lg mx-auto">
                        Sin tarjeta de crédito. Sin compromisos. Configura tu plataforma en minutos.
                    </p>
                    <Link
                        href="/register"
                        className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-background font-bold px-10 py-5 rounded-full text-lg transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-500/30"
                    >
                        Crear cuenta gratis
                        <ArrowRight className="w-5 h-5" />
                    </Link>
                </motion.div>
            </section>

            {/* ── FOOTER ── */}
            <footer className="border-t border-white/[0.04] py-12">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                                <Dumbbell className="w-4 h-4 text-emerald-400" />
                            </div>
                            <span className="text-foreground font-bold text-sm">OmniCoach OS</span>
                        </div>

                        <div className="flex items-center gap-6 text-xs text-foreground/30">
                            <Link href="/pricing" className="hover:text-foreground/60 transition-colors">Precios</Link>
                            <Link href="/login" className="hover:text-foreground/60 transition-colors">Iniciar sesión</Link>
                            <Link href="/register" className="hover:text-foreground/60 transition-colors">Registrarse</Link>
                        </div>

                        <p className="text-xs text-foreground/20">
                            Ejercicios: <a href="https://exercisedb-api.vercel.app" target="_blank" rel="noopener noreferrer" className="hover:text-foreground/40 underline">ExerciseDB API</a>
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    )
}
