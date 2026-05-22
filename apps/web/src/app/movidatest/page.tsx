import Link from 'next/link'
import Image from 'next/image'
import { Building2, UserCircle, Smartphone, ArrowRight, Dumbbell, Apple, HeartPulse, BarChart3, Users, Shield, ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Movida × EVA — Demo',
}

const PERSONAS = [
    {
        href: '/movidatest/admin',
        icon: Building2,
        color: 'bg-violet-500/10 text-violet-400',
        border: 'border-violet-500/20 hover:border-violet-500/50',
        badge: 'Admin',
        badgeColor: 'bg-violet-500/10 text-violet-400',
        title: 'Vista Administrador',
        name: 'Patricio Sánchez',
        role: 'Dueño · Movida HQ',
        description: 'Panel de control total: coaches, clientes, métricas de salud del negocio, branding y facturación.',
        highlights: ['10 coaches en plataforma', '120 clientes activos', 'Health score 87/100'],
    },
    {
        href: '/movidatest/coach/dashboard',
        icon: UserCircle,
        color: 'bg-teal-500/10 text-teal-400',
        border: 'border-teal-500/20 hover:border-teal-500/50',
        badge: 'Coach',
        badgeColor: 'bg-teal-500/10 text-teal-400',
        title: 'Vista Entrenador',
        name: 'Felipe Martínez',
        role: 'Kinesiólogo · 28 alumnos',
        description: 'Dashboard propio, builder de rutinas drag & drop, planes nutricionales, seguimiento individual por alumno.',
        highlights: ['28 clientes a cargo', 'Programa Hipertrofia 12 sem', 'Nutrición + rutinas integradas'],
    },
    {
        href: '/movidatest/cliente/dashboard',
        icon: Smartphone,
        color: 'bg-blue-500/10 text-blue-400',
        border: 'border-blue-500/20 hover:border-blue-500/50',
        badge: 'Alumno',
        badgeColor: 'bg-blue-500/10 text-blue-400',
        title: 'Vista Alumna',
        name: 'María González',
        role: 'Semana 6 de 12 · Hipertrofia',
        description: 'App con la marca Movida: rutinas del día, registro de series, log de comidas, check-ins y progreso.',
        highlights: ['Marca 100% Movida', 'Workout logging en vivo', 'Nutrición + check-in'],
    },
]

const FEATURES = [
    { icon: Dumbbell, label: 'Builder drag & drop', desc: 'Rutinas visuales por bloques' },
    { icon: Apple, label: 'Planes nutricionales', desc: 'Macros y log de comidas' },
    { icon: HeartPulse, label: 'Check-ins y progreso', desc: 'Peso, fotos, notas' },
    { icon: BarChart3, label: 'Métricas del gym', desc: 'Health score y KPIs' },
    { icon: Users, label: 'Multi-coach', desc: 'Un seat por entrenador' },
    { icon: Shield, label: 'Marca 100% Movida', desc: 'White-label total' },
]

export default function MovidaHubPage() {
    return (
        <div className="min-h-dvh bg-background text-foreground">
            {/* Hero */}
            <div className="border-b border-border bg-card">
                <div className="max-w-4xl mx-auto px-4 py-10 md:py-16 text-center">
                    <div className="flex items-center justify-center gap-4 mb-6">
                        <Image src="/logomovida.png" alt="Movida" width={140} height={48} className="h-12 w-auto object-contain" />
                        <span className="text-2xl text-muted-foreground">×</span>
                        <div className="font-bold text-2xl tracking-tight">EVA</div>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
                        Tu gym, <span style={{ color: '#0D9488' }}>digitalizado</span>
                    </h1>
                    <p className="text-muted-foreground max-w-xl mx-auto text-sm md:text-base leading-relaxed">
                        Esta demo muestra cómo se vería Movida en EVA: tu marca, tus coaches y tus alumnos — todo funcionando desde el primer día.
                    </p>
                    <p className="text-[11px] text-muted-foreground/60 mt-3 flex items-center justify-center gap-1.5">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
                        Datos ficticios — no representan personas reales
                    </p>
                </div>
            </div>

            {/* Persona cards */}
            <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Elige una perspectiva</h2>
                <div className="grid md:grid-cols-3 gap-4">
                    {PERSONAS.map(p => (
                        <Link
                            key={p.href}
                            href={p.href}
                            className={`group flex flex-col rounded-2xl border bg-card p-5 transition-all duration-200 ${p.border}`}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${p.color}`}>
                                    <p.icon className="w-5 h-5" />
                                </div>
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${p.badgeColor}`}>
                                    {p.badge}
                                </span>
                            </div>
                            <h3 className="font-semibold text-sm">{p.title}</h3>
                            <p className="text-base font-bold mt-0.5">{p.name}</p>
                            <p className="text-xs text-muted-foreground">{p.role}</p>
                            <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{p.description}</p>
                            <ul className="mt-3 space-y-1">
                                {p.highlights.map(h => (
                                    <li key={h} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                        <ChevronRight className="w-3 h-3 shrink-0 text-teal-500" />
                                        {h}
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                                <span className="text-xs font-semibold" style={{ color: '#0D9488' }}>Ver demo</span>
                                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" style={{ color: '#0D9488' }} />
                            </div>
                        </Link>
                    ))}
                </div>
            </div>

            {/* Feature grid */}
            <div className="max-w-4xl mx-auto px-4 pb-8">
                <div className="rounded-2xl border border-border bg-card p-6">
                    <h2 className="text-sm font-semibold mb-4">¿Qué incluye EVA para Movida?</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {FEATURES.map(f => (
                            <div key={f.label} className="flex items-start gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-teal-500/10 flex items-center justify-center shrink-0 mt-0.5">
                                    <f.icon className="w-3.5 h-3.5 text-teal-500" />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold">{f.label}</p>
                                    <p className="text-[11px] text-muted-foreground">{f.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="border-t border-border py-6 text-center">
                <p className="text-[11px] text-muted-foreground">
                    Demo no contractual. Pantallas representativas y pueden variar en producción. · EVA © 2026
                </p>
            </div>
        </div>
    )
}
