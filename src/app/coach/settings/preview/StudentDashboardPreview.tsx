'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
    Smartphone, Monitor, ArrowLeft,
    Home, Apple, Dumbbell, CheckCircle, Settings,
    ChevronRight, Flame, Calendar, TrendingUp, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
    brandName: string
    primaryColor: string
    logoUrl: string | null
}

const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const TODAY_IDX = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1
const WORKOUT_DAYS = [0, 2, 4] // Mon, Wed, Fri

export function StudentDashboardPreview({ brandName, primaryColor, logoUrl }: Props) {
    const [view, setView] = useState<'mobile' | 'desktop'>('mobile')

    return (
        <div className="min-h-screen bg-muted/30 dark:bg-black/20 flex flex-col">
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-3 md:py-6 md:px-8 max-w-6xl mx-auto w-full flex-shrink-0">
                <Link
                    href="/coach/settings"
                    className="group inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground hover:text-primary transition-all"
                >
                    <div className="p-1.5 rounded-full bg-secondary dark:bg-white/5 group-hover:bg-primary/10 transition-colors">
                        <ArrowLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
                    </div>
                    <span className="hidden sm:inline">Mi Marca</span>
                </Link>

                <div className="flex flex-col items-center gap-0.5">
                    <h1 className="text-sm font-black uppercase tracking-widest text-foreground">Vista Previa</h1>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest hidden sm:block">así ve tu alumno la app</p>
                </div>

                {/* Device Toggle — only shown on md+ since mobile always shows direct view */}
                <div className="hidden md:flex items-center gap-1 p-1 bg-card border border-border rounded-xl shadow-sm">
                    <button
                        onClick={() => setView('mobile')}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                            view === 'mobile'
                                ? 'text-white shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                        style={view === 'mobile' ? { backgroundColor: primaryColor } : {}}
                    >
                        <Smartphone className="w-3.5 h-3.5" />
                        Móvil
                    </button>
                    <button
                        onClick={() => setView('desktop')}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                            view === 'desktop'
                                ? 'text-white shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                        style={view === 'desktop' ? { backgroundColor: primaryColor } : {}}
                    >
                        <Monitor className="w-3.5 h-3.5" />
                        Escritorio
                    </button>
                </div>

                {/* Spacer to keep title centered on mobile */}
                <div className="md:hidden w-10" />
            </div>

            {/* ── MOBILE VIEWPORT: render dashboard directly (phone IS the frame) ── */}
            <div className="md:hidden flex-1 flex flex-col bg-[#F5F5F5] dark:bg-[#121212]">
                <p className="text-center text-[9px] font-bold uppercase tracking-widest text-muted-foreground py-1.5 flex-shrink-0 border-b border-border/30">
                    Vista móvil del alumno
                </p>
                <div className="flex-1 overflow-hidden">
                    <DashboardScreen brandName={brandName} primaryColor={primaryColor} isMobile />
                </div>
            </div>

            {/* ── DESKTOP VIEWPORT: render with device frames ── */}
            <div className="hidden md:flex flex-1 items-start justify-center px-4 pb-8">
                {view === 'mobile' ? (
                    <MobileFrame brandName={brandName} primaryColor={primaryColor} logoUrl={logoUrl} />
                ) : (
                    <DesktopFrame brandName={brandName} primaryColor={primaryColor} logoUrl={logoUrl} />
                )}
            </div>
        </div>
    )
}

/* ─── MOBILE FRAME (desktop viewport only) ─────────────────── */
function MobileFrame({ brandName, primaryColor, logoUrl }: Props) {
    return (
        <div className="relative w-[375px] flex-shrink-0">
            {/* Phone shell */}
            <div className="relative bg-zinc-900 dark:bg-zinc-800 rounded-[44px] p-3 shadow-2xl ring-1 ring-white/10">
                {/* Dynamic Island */}
                <div className="absolute top-[18px] left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-full z-10" />

                {/* Screen */}
                <div className="bg-[#F5F5F5] dark:bg-[#121212] rounded-[36px] overflow-hidden" style={{ height: 760 }}>
                    <DashboardScreen brandName={brandName} primaryColor={primaryColor} isMobile />
                </div>

                {/* Home indicator */}
                <div className="flex justify-center mt-2.5">
                    <div className="w-32 h-1 bg-white/30 rounded-full" />
                </div>
            </div>

            {/* Side buttons */}
            <div className="absolute left-[-4px] top-24 w-1 h-8 bg-zinc-700 rounded-l-full" />
            <div className="absolute left-[-4px] top-36 w-1 h-12 bg-zinc-700 rounded-l-full" />
            <div className="absolute left-[-4px] top-52 w-1 h-12 bg-zinc-700 rounded-l-full" />
            <div className="absolute right-[-4px] top-36 w-1 h-16 bg-zinc-700 rounded-r-full" />
        </div>
    )
}

/* ─── DESKTOP FRAME ─────────────────────────────────────────── */
function DesktopFrame({ brandName, primaryColor, logoUrl }: Props) {
    return (
        <div className="w-full max-w-5xl flex-shrink-0">
            {/* Monitor shell */}
            <div className="bg-zinc-900 dark:bg-zinc-800 rounded-2xl p-2.5 shadow-2xl ring-1 ring-white/10">
                {/* Browser chrome */}
                <div className="bg-zinc-800 dark:bg-zinc-700 rounded-t-xl px-4 py-2 flex items-center gap-3">
                    <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500" />
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                    </div>
                    <div className="flex-1 bg-zinc-700 dark:bg-zinc-600 rounded-md px-3 py-1 text-[11px] text-zinc-400 font-mono truncate">
                        app.tucoach.com/c/{brandName.toLowerCase().replace(/\s+/g, '-')}/dashboard
                    </div>
                </div>

                {/* App screen */}
                <div className="bg-[#F5F5F5] dark:bg-[#121212] rounded-b-xl overflow-hidden" style={{ height: 620 }}>
                    <DashboardScreen brandName={brandName} primaryColor={primaryColor} isMobile={false} />
                </div>
            </div>

            {/* Stand */}
            <div className="flex justify-center mt-2">
                <div className="w-24 h-4 bg-zinc-800 dark:bg-zinc-700 rounded-b-xl" />
            </div>
            <div className="flex justify-center">
                <div className="w-48 h-2 bg-zinc-700 dark:bg-zinc-600 rounded-full" />
            </div>
        </div>
    )
}

/* ─── DASHBOARD SCREEN (shared between mobile & desktop) ────── */
function DashboardScreen({ brandName, primaryColor, isMobile }: { brandName: string; primaryColor: string; isMobile: boolean }) {
    const px = (val: string) => `color-mix(in srgb, ${primaryColor} ${val}, transparent)`

    return (
        <div className="h-full flex flex-col md:flex-row text-[#121212] dark:text-[#F8F9FA] overflow-hidden" style={{ fontSize: isMobile ? 14 : 13 }}>

            {/* ── Sidebar (desktop only) ── */}
            {!isMobile && (
                <aside className="w-56 h-full bg-white dark:bg-[#121212] border-r border-black/10 dark:border-white/10 flex flex-col flex-shrink-0">
                    <div className="px-5 py-5 border-b border-black/10 dark:border-white/10">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Mi Coach</p>
                        <p className="text-sm font-extrabold truncate" style={{ color: primaryColor }}>{brandName}</p>
                    </div>
                    <nav className="flex-1 p-3 space-y-1">
                        {[
                            { icon: Home, label: 'Inicio', active: true },
                            { icon: Apple, label: 'Nutrición', active: false },
                            { icon: Dumbbell, label: 'Ejercicios', active: false },
                            { icon: CheckCircle, label: 'Check-in', active: false },
                        ].map(({ icon: Icon, label, active }) => (
                            <div
                                key={label}
                                className={cn(
                                    'flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-default transition-colors',
                                    active ? 'text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'
                                )}
                                style={active ? { backgroundColor: primaryColor } : {}}
                            >
                                <Icon className="w-4 h-4 flex-shrink-0" />
                                {label}
                            </div>
                        ))}
                    </nav>
                    <div className="p-3 border-t border-black/10 dark:border-white/10">
                        <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-gray-400 cursor-default">
                            <Settings className="w-4 h-4" />
                            Configuración
                        </div>
                    </div>
                </aside>
            )}

            {/* ── Main content ── */}
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
                {/* Header */}
                <header className="bg-white dark:bg-[#1E1E1E] border-b border-black/10 dark:border-white/10 px-4 py-3 flex-shrink-0">
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 truncate">{brandName}</p>
                            <p className="font-extrabold truncate" style={{ fontSize: isMobile ? 16 : 14 }}>Hola, Alumno 👋</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-full bg-orange-100 text-orange-600 border border-orange-200 whitespace-nowrap">
                                <Flame className="w-3 h-3" /> 12
                            </span>
                            <div
                                className="text-[9px] font-bold px-2.5 py-1 rounded-lg border whitespace-nowrap"
                                style={{ borderColor: primaryColor, color: primaryColor, backgroundColor: px('8%') }}
                            >
                                Check-in
                            </div>
                        </div>
                    </div>
                </header>

                {/* Scroll area */}
                <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                    {/* Weekly Calendar */}
                    <div className="bg-white dark:bg-[#1E1E1E] border border-black/10 dark:border-white/10 rounded-2xl p-3 shadow-sm">
                        <div className="flex justify-between items-center max-w-xs mx-auto">
                            {DAYS.map((day, i) => {
                                const isToday = i === TODAY_IDX
                                const hasWorkout = WORKOUT_DAYS.includes(i)
                                return (
                                    <div key={i} className="flex flex-col items-center gap-1">
                                        <span className="text-[9px] font-bold" style={{ color: isToday ? '#121212' : '#9CA3AF' }}>{day}</span>
                                        <div
                                            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
                                            style={
                                                isToday
                                                    ? { backgroundColor: primaryColor, color: '#fff' }
                                                    : hasWorkout
                                                        ? { color: primaryColor, border: `1px solid ${px('30%')}`, backgroundColor: px('10%') }
                                                        : { color: '#9CA3AF' }
                                            }
                                        >
                                            {new Date(new Date().setDate(new Date().getDate() - TODAY_IDX + i)).getDate()}
                                        </div>
                                        <div className="w-1 h-1 rounded-full" style={{ backgroundColor: hasWorkout && !isToday ? primaryColor : 'transparent' }} />
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Cards grid */}
                    <div className={cn('grid gap-3', isMobile ? 'grid-cols-1' : 'grid-cols-2')}>
                        {/* Today's workout */}
                        <div className="bg-white dark:bg-[#1E1E1E] border border-black/10 dark:border-white/10 rounded-2xl p-4 shadow-sm">
                            <div className="flex items-start justify-between mb-3">
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center border"
                                    style={{ backgroundColor: px('15%'), borderColor: px('30%') }}>
                                    <Dumbbell className="w-4 h-4" style={{ color: primaryColor }} />
                                </div>
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                            </div>
                            <p className="text-[10px] text-gray-400 font-medium mb-0.5">Entrenamiento de hoy</p>
                            <p className="font-bold text-[13px]">Tren Superior A</p>
                            <div className="mt-2.5 inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg"
                                style={{ backgroundColor: px('15%'), color: primaryColor }}>
                                Empezar ahora →
                            </div>
                        </div>

                        {/* Nutrition */}
                        <div className="bg-white dark:bg-[#1E1E1E] border border-black/10 dark:border-white/10 rounded-2xl p-4 shadow-sm">
                            <div className="flex items-start justify-between mb-3">
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center border border-emerald-500/30 bg-emerald-500/10">
                                    <Apple className="w-4 h-4 text-emerald-500" />
                                </div>
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                            </div>
                            <p className="text-[10px] text-gray-400 font-medium mb-0.5">Plan Nutricional</p>
                            <p className="font-bold text-[13px]">Plan de Volumen</p>
                            <div className="mt-2.5 inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-500">
                                Ver comidas →
                            </div>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-3">
                        {[
                            { icon: Calendar, label: 'Este mes', value: '12', sub: 'entrenamientos' },
                            { icon: Flame, label: 'Racha', value: '5', sub: 'días seguidos' },
                            { icon: TrendingUp, label: 'Progreso', value: '82%', sub: 'cumplimiento' },
                        ].map(({ icon: Icon, label, value, sub }) => (
                            <div key={label} className="bg-white dark:bg-[#1E1E1E] border border-black/10 dark:border-white/10 rounded-2xl p-3 shadow-sm text-center">
                                <Icon className="w-4 h-4 mx-auto mb-1.5" style={{ color: primaryColor }} />
                                <p className="text-[9px] text-gray-400 font-medium">{label}</p>
                                <p className="font-extrabold text-sm">{value}</p>
                                <p className="text-[9px] text-gray-400">{sub}</p>
                            </div>
                        ))}
                    </div>

                    {/* Program card */}
                    <div className="bg-white dark:bg-[#1E1E1E] border border-black/10 dark:border-white/10 rounded-2xl p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                            <Zap className="w-4 h-4" style={{ color: primaryColor }} />
                            <p className="text-[11px] font-bold uppercase tracking-widest">Programa Activo</p>
                        </div>
                        <p className="font-bold text-[13px] mb-1">Hipertrofia Full Body 8 Semanas</p>
                        <div className="w-full bg-gray-100 dark:bg-white/5 rounded-full h-1.5 mt-2">
                            <div className="h-1.5 rounded-full" style={{ width: '62%', backgroundColor: primaryColor }} />
                        </div>
                        <p className="text-[9px] text-gray-400 mt-1">Semana 5 de 8 · 22 días restantes</p>
                    </div>
                </main>

                {/* ── Bottom nav (mobile only) ── */}
                {isMobile && (
                    <nav className="flex-shrink-0 bg-white dark:bg-[#1E1E1E] border-t border-black/10 dark:border-white/10 flex justify-around py-2 px-4">
                        {[
                            { icon: Home, label: 'Inicio', active: true },
                            { icon: Apple, label: 'Nutrición', active: false },
                            { icon: Dumbbell, label: 'Ejercicios', active: false },
                            { icon: CheckCircle, label: 'Check-in', active: false },
                        ].map(({ icon: Icon, label, active }) => (
                            <div key={label} className="flex flex-col items-center gap-0.5 flex-1">
                                {active && <div className="w-6 h-0.5 rounded-full -mt-2 mb-1" style={{ backgroundColor: primaryColor }} />}
                                <Icon className="w-5 h-5" style={{ color: active ? primaryColor : '#9CA3AF' }} />
                                <span className="text-[8px] font-semibold" style={{ color: active ? primaryColor : '#9CA3AF' }}>{label}</span>
                            </div>
                        ))}
                    </nav>
                )}
            </div>
        </div>
    )
}
