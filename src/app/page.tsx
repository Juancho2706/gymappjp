'use client'

import Link from 'next/link'
import { useState } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import {
  Dumbbell,
  Users,
  BarChart3,
  Camera,
  Sparkles,
  ArrowRight,
  Check,
  Zap,
  Shield,
  Smartphone,
  ChevronDown,
} from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'

/* ─── pricing tiers (Hevy-like: same features, price by client count) ─── */
const clientTiers = [
  { label: '1–10 alumnos', price: 14990 },
  { label: '11–25 alumnos', price: 24990 },
  { label: '26–50 alumnos', price: 39990 },
  { label: '51–100 alumnos', price: 59990 },
  { label: '101–200 alumnos', price: 89990 },
]

const premiumFeatures = [
  'Rutinas ilimitadas con GIFs 3D',
  'Catálogo de 1,300+ ejercicios',
  'Ejercicios personalizados ilimitados',
  'Check-ins de progreso con fotos',
  'App White-Label con tu marca',
  'Analítica avanzada por alumno',
  'Soporte prioritario',
]

const features = [
  {
    icon: Dumbbell,
    title: 'Constructor de Rutinas',
    desc: 'Drag & Drop intuitivo con catálogo de 1,300+ ejercicios con GIFs 3D animados.',
    gradient: 'from-emerald-500 to-teal-500',
  },
  {
    icon: Camera,
    title: 'Check-ins con Fotos',
    desc: 'Tus alumnos envían su peso, energía y fotos de progreso desde su móvil.',
    gradient: 'from-blue-500 to-cyan-500',
  },
  {
    icon: Smartphone,
    title: 'App White-Label',
    desc: 'Tu propia app con logo, colores y URL personalizada. Instalable como PWA.',
    gradient: 'from-violet-500 to-purple-500',
  },
  {
    icon: BarChart3,
    title: 'Analítica en Tiempo Real',
    desc: 'Gráficos de evolución, PRs y volumen de entrenamiento por alumno.',
    gradient: 'from-amber-500 to-orange-500',
  },
]

function formatCLP(amount: number) {
  return `$${amount.toLocaleString('es-CL')}`
}

/* ─── page ─── */
export default function LandingPage() {
  const [selectedTier, setSelectedTier] = useState(0)
  const [tierOpen, setTierOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors overflow-x-hidden" style={{ fontFamily: 'var(--font-inter)' }}>
      {/* ─── NAVBAR ─── */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Dumbbell className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-extrabold text-foreground" style={{ fontFamily: 'var(--font-outfit)' }}>
              OmniCoach
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" style={{ fontFamily: 'var(--font-outfit)' }}>
              Funciones
            </a>
            <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" style={{ fontFamily: 'var(--font-outfit)' }}>
              Precios
            </a>
            <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" style={{ fontFamily: 'var(--font-outfit)' }}>
              Iniciar Sesión
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/register"
              className="hidden sm:inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-bold rounded-xl hover:shadow-lg hover:shadow-emerald-500/25 transition-all duration-300 hover:-translate-y-0.5"
              style={{ fontFamily: 'var(--font-outfit)' }}
            >
              Empezar Gratis
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="relative pt-20 pb-32 px-6 overflow-hidden">
        {/* Animated orbs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <motion.div
            animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute top-20 left-[10%] w-[400px] h-[400px] bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-[100px]"
          />
          <motion.div
            animate={{ x: [0, -20, 0], y: [0, 30, 0] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute top-40 right-[5%] w-[300px] h-[300px] bg-blue-500/8 dark:bg-blue-500/5 rounded-full blur-[80px]"
          />
          <motion.div
            animate={{ x: [0, 15, 0], y: [0, 15, 0] }}
            transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute bottom-20 left-[40%] w-[350px] h-[350px] bg-violet-500/6 dark:bg-violet-500/3 rounded-full blur-[90px]"
          />
        </div>

        <div className="max-w-5xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm font-semibold mb-8"
            style={{ fontFamily: 'var(--font-outfit)' }}
          >
            <Sparkles className="w-4 h-4" />
            La plataforma #1 para coaches fitness
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[0.95]"
            style={{ fontFamily: 'var(--font-outfit)' }}
          >
            <span className="text-foreground">Escala tu</span>
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500">
              negocio fitness
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-8 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed"
            style={{ fontFamily: 'var(--font-outfit)', fontWeight: 400 }}
          >
            Rutinas con GIFs 3D, check-ins, white-label y analítica. Todo lo que necesitas para gestionar tus alumnos.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href="/register"
              className="group inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-2xl text-lg hover:shadow-2xl hover:shadow-emerald-500/30 transition-all duration-300 hover:-translate-y-1"
              style={{ fontFamily: 'var(--font-outfit)' }}
            >
              Prueba 30 Días Gratis
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 px-8 py-4 bg-card text-foreground font-semibold rounded-2xl text-lg border border-border hover:border-primary/30 hover:shadow-lg transition-all duration-300"
              style={{ fontFamily: 'var(--font-outfit)' }}
            >
              Ver funciones
            </a>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-20 flex items-center justify-center gap-12 md:gap-20"
          >
            {[
              { value: '1,300+', label: 'Ejercicios 3D' },
              { value: '100%', label: 'Tu Marca' },
              { value: 'PWA', label: 'Instalable' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-3xl md:text-4xl font-black text-foreground" style={{ fontFamily: 'var(--font-outfit)' }}>
                  {s.value}
                </p>
                <p className="text-sm text-muted-foreground mt-1" style={{ fontFamily: 'var(--font-outfit)' }}>{s.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section id="features" className="py-28 px-6 relative">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.03),transparent_70%)]" />

        <div className="max-w-6xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-20"
          >
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.2em] mb-4" style={{ fontFamily: 'var(--font-outfit)' }}>
              Funciones
            </p>
            <h2 className="text-4xl md:text-6xl font-black text-foreground" style={{ fontFamily: 'var(--font-outfit)' }}>
              Todo en un{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-500">
                solo lugar
              </span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="group relative bg-card border border-border rounded-3xl p-8 hover:shadow-2xl hover:shadow-primary/5 hover:border-primary/20 transition-all duration-500 hover:-translate-y-1 overflow-hidden"
              >
                {/* Gradient accent line */}
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${f.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${f.gradient} flex items-center justify-center mb-6 shadow-lg`}>
                  <f.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-extrabold text-foreground mb-3" style={{ fontFamily: 'var(--font-outfit)' }}>
                  {f.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed" style={{ fontFamily: 'var(--font-outfit)' }}>{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PRICING (Hevy-like: single tier, price by # of clients) ─── */}
      <section id="pricing" className="py-28 px-6 bg-muted/30">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.2em] mb-4" style={{ fontFamily: 'var(--font-outfit)' }}>
              Precios
            </p>
            <h2 className="text-4xl md:text-6xl font-black text-foreground" style={{ fontFamily: 'var(--font-outfit)' }}>
              Un plan,{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-500">
                todo incluido
              </span>
            </h2>
            <p className="mt-4 text-muted-foreground text-lg max-w-xl mx-auto" style={{ fontFamily: 'var(--font-outfit)' }}>
              Empieza gratis. Sin tarjeta. Solo paga cuando estés listo.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="bg-card border border-border rounded-3xl overflow-hidden shadow-2xl shadow-primary/5"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
              {/* Left: features */}
              <div className="p-8 lg:p-10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                    <Dumbbell className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-xl font-extrabold text-foreground" style={{ fontFamily: 'var(--font-outfit)' }}>
                    OmniCoach Premium
                  </h3>
                </div>
                <p className="text-muted-foreground text-sm mb-6" style={{ fontFamily: 'var(--font-outfit)' }}>
                  Todo lo incluido en tu plataforma de coaching:
                </p>
                <ul className="space-y-3.5">
                  {premiumFeatures.map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm text-foreground" style={{ fontFamily: 'var(--font-outfit)' }}>
                      <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Right: pricing selector */}
              <div className="p-8 lg:p-10 flex flex-col">
                <p className="text-emerald-600 dark:text-emerald-400 text-sm font-bold mb-2" style={{ fontFamily: 'var(--font-outfit)' }}>
                  30 días de prueba gratis
                </p>

                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-5xl font-black text-foreground" style={{ fontFamily: 'var(--font-outfit)' }}>
                    {formatCLP(clientTiers[selectedTier].price)}
                  </span>
                  <span className="text-muted-foreground text-sm" style={{ fontFamily: 'var(--font-outfit)' }}>/CLP mes</span>
                </div>

                {/* Client count selector */}
                <label className="text-sm font-semibold text-foreground mb-2 block" style={{ fontFamily: 'var(--font-outfit)' }}>
                  Número de alumnos
                </label>
                <div className="relative mb-6">
                  <button
                    onClick={() => setTierOpen(!tierOpen)}
                    className="w-full flex items-center justify-between px-4 py-3.5 bg-secondary border border-border rounded-xl text-foreground text-sm font-medium hover:border-primary/30 transition-colors"
                    style={{ fontFamily: 'var(--font-outfit)' }}
                  >
                    {clientTiers[selectedTier].label}
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${tierOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {tierOpen && (
                    <div className="absolute top-full mt-1 left-0 right-0 bg-card border border-border rounded-xl shadow-xl z-20 overflow-hidden">
                      {clientTiers.map((tier, i) => (
                        <button
                          key={tier.label}
                          onClick={() => { setSelectedTier(i); setTierOpen(false); }}
                          className={`w-full px-4 py-3 text-left text-sm hover:bg-muted transition-colors flex items-center justify-between ${i === selectedTier ? 'bg-primary/5 text-primary font-semibold' : 'text-foreground'
                            }`}
                          style={{ fontFamily: 'var(--font-outfit)' }}
                        >
                          <span>{tier.label}</span>
                          <span className="text-muted-foreground">{formatCLP(tier.price)}/mes</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <Link
                  href="/register"
                  className="w-full py-4 rounded-xl font-bold text-center bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:shadow-lg hover:shadow-emerald-500/25 transition-all duration-300 text-lg hover:-translate-y-0.5"
                  style={{ fontFamily: 'var(--font-outfit)' }}
                >
                  Empieza 30 Días Gratis
                </Link>
                <p className="text-center text-xs text-muted-foreground mt-3" style={{ fontFamily: 'var(--font-outfit)' }}>
                  Sin tarjeta de crédito requerida
                </p>

                <div className="mt-auto pt-6 flex items-center justify-center gap-4 opacity-50">
                  <span className="text-xs text-muted-foreground font-medium px-3 py-1.5 border border-border rounded-lg" style={{ fontFamily: 'var(--font-outfit)' }}>Visa</span>
                  <span className="text-xs text-muted-foreground font-medium px-3 py-1.5 border border-border rounded-lg" style={{ fontFamily: 'var(--font-outfit)' }}>Mastercard</span>
                  <span className="text-xs text-muted-foreground font-medium px-3 py-1.5 border border-border rounded-lg" style={{ fontFamily: 'var(--font-outfit)' }}>PayPal</span>
                  <span className="text-xs text-muted-foreground font-medium px-3 py-1.5 border border-border rounded-lg" style={{ fontFamily: 'var(--font-outfit)' }}>MercadoPago</span>
                </div>
              </div>
            </div>

            {/* Bottom notice */}
            <div className="border-t border-border px-8 py-4 text-center">
              <p className="text-xs text-muted-foreground" style={{ fontFamily: 'var(--font-outfit)' }}>
                Puedes cancelar en cualquier momento. Tu suscripción se renueva automáticamente cada mes.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── TRUST ─── */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            {[
              { icon: Zap, title: 'Ultra rápido', desc: 'Optimizado para que tus alumnos entrenen sin esperas', gradient: 'from-amber-500 to-orange-500' },
              { icon: Shield, title: '100% Seguro', desc: 'Datos encriptados y respaldados en la nube', gradient: 'from-blue-500 to-cyan-500' },
              { icon: Users, title: 'Escalable', desc: 'Desde 1 alumno hasta gimnasios completos', gradient: 'from-violet-500 to-purple-500' },
            ].map((item) => (
              <div key={item.title} className="text-center group">
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center mb-5 mx-auto shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all duration-300`}>
                  <item.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="font-extrabold text-foreground text-lg" style={{ fontFamily: 'var(--font-outfit)' }}>
                  {item.title}
                </h3>
                <p className="text-muted-foreground text-sm mt-2 max-w-[260px] mx-auto" style={{ fontFamily: 'var(--font-outfit)' }}>{item.desc}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-28 px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-4xl mx-auto text-center relative"
        >
          {/* Background glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-teal-500/5 to-cyan-500/5 rounded-[2rem] blur-xl" />

          <div className="relative bg-card border border-border rounded-[2rem] p-12 md:p-20">
            <h2 className="text-3xl md:text-5xl font-black text-foreground" style={{ fontFamily: 'var(--font-outfit)' }}>
              ¿Listo para{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-500">
                transformar
              </span>
              {' '}tu negocio?
            </h2>
            <p className="mt-4 text-muted-foreground text-lg" style={{ fontFamily: 'var(--font-outfit)' }}>
              Únete a los entrenadores que ya gestionan todo desde un solo lugar.
            </p>
            <Link
              href="/register"
              className="group inline-flex items-center gap-2 mt-8 px-10 py-5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-2xl text-lg hover:shadow-2xl hover:shadow-emerald-500/30 transition-all duration-300 hover:-translate-y-1"
              style={{ fontFamily: 'var(--font-outfit)' }}
            >
              Crear mi Cuenta Gratis
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-border py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Dumbbell className="w-4 h-4 text-white" />
            </div>
            <span className="font-extrabold text-foreground" style={{ fontFamily: 'var(--font-outfit)' }}>
              OmniCoach OS
            </span>
          </div>

          <div className="flex items-center gap-6 text-sm text-muted-foreground" style={{ fontFamily: 'var(--font-outfit)' }}>
            <a href="#features" className="hover:text-foreground transition-colors">Funciones</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Precios</a>
            <Link href="/login" className="hover:text-foreground transition-colors">Login</Link>
          </div>

          <p className="text-xs text-muted-foreground" style={{ fontFamily: 'var(--font-outfit)' }}>
            &copy; {new Date().getFullYear()} OmniCoach OS — Animaciones 3D: ExerciseDB
          </p>
        </div>
      </footer>
    </div>
  )
}
