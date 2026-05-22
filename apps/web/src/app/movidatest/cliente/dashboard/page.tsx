'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ChevronRight, Dumbbell, Scale, TrendingDown, CheckCircle2, Calendar, Flame } from 'lucide-react'
import { mariaClient, mariaActivePlan, mariaWorkoutHistory, mariaCheckIns, mariaNutritionTotals, MOVIDA_BRAND, mariaPRs } from '../../_mock'
import { useDemoState } from '../../_providers/DemoStateProvider'

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export default function ClienteDashboardPage() {
    const { checkIns } = useDemoState()
    const today = new Date()
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - today.getDay())

    const weekDays = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart)
        d.setDate(weekStart.getDate() + i)
        const hasSession = mariaWorkoutHistory.some(log => {
            const logDate = new Date(log.completed_at)
            return logDate.getDate() === d.getDate() && logDate.getMonth() === d.getMonth()
        })
        return { day: DAYS[d.getDay()], date: d.getDate(), isToday: d.getDate() === today.getDate(), hasSession }
    })

    const latestCheckIn = checkIns[0]
    const previousWeight = checkIns[1]?.weight_kg ?? latestCheckIn.weight_kg
    const weightDelta = latestCheckIn.weight_kg - previousWeight

    return (
        <div className="pb-4 space-y-0">
            {/* Header with Movida branding */}
            <div className="px-4 pt-4 pb-3 border-b border-border bg-card">
                <div className="flex items-center justify-between">
                    <div>
                        <Image src="/logomovida.png" alt="Movida" width={80} height={28} className="h-7 w-auto object-contain lg:hidden" />
                        <p className="text-sm text-muted-foreground mt-1 lg:mt-0">
                            Bienvenida, <strong className="text-foreground">{mariaClient.full_name.split(' ')[0]}</strong> 👋
                        </p>
                    </div>
                    <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
                        style={{ backgroundColor: MOVIDA_BRAND.primaryColor }}
                    >
                        MG
                    </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{MOVIDA_BRAND.tagline}</p>
            </div>

            {/* Week calendar */}
            <div className="px-4 py-3 border-b border-border">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-muted-foreground">Esta semana</span>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Flame className="w-3 h-3 text-orange-500" />
                        <span>3 sesiones</span>
                    </div>
                </div>
                <div className="grid grid-cols-7 gap-1">
                    {weekDays.map(d => (
                        <div
                            key={d.date}
                            className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-center ${
                                d.isToday ? 'ring-1 ring-inset' : ''
                            }`}
                            style={d.isToday ? { '--tw-ring-color': MOVIDA_BRAND.primaryColor } as React.CSSProperties : undefined}
                        >
                            <span className="text-[9px] text-muted-foreground">{d.day}</span>
                            <span className={`text-xs font-semibold ${d.isToday ? 'font-bold' : ''}`}
                                style={d.isToday ? { color: MOVIDA_BRAND.primaryColor } : undefined}
                            >
                                {d.date}
                            </span>
                            {d.hasSession && (
                                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: MOVIDA_BRAND.primaryColor }} />
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Check-in banner */}
            <div className="mx-4 mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-center justify-between">
                <div>
                    <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Check-in pendiente</p>
                    <p className="text-[11px] text-muted-foreground">Registra tu peso y cómo te sentís hoy</p>
                </div>
                <Link
                    href="/movidatest/cliente/check-in"
                    className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
                    style={{ backgroundColor: MOVIDA_BRAND.primaryColor }}
                >
                    Registrar
                </Link>
            </div>

            {/* Active program */}
            <div className="mx-4 mt-3 rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 pt-3 pb-2">
                    <div>
                        <p className="text-xs text-muted-foreground">Programa activo</p>
                        <p className="text-sm font-semibold">{mariaActivePlan.program_name}</p>
                        <p className="text-[11px] text-muted-foreground">Semana {mariaActivePlan.week}/12 · Hoy: {mariaActivePlan.name}</p>
                    </div>
                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${MOVIDA_BRAND.primaryColor}20` }}
                    >
                        <Dumbbell className="w-5 h-5" style={{ color: MOVIDA_BRAND.primaryColor }} />
                    </div>
                </div>
                {/* Progress bar */}
                <div className="px-4 pb-3">
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1">
                        <div className="h-full rounded-full" style={{ width: `${(mariaActivePlan.week / 12) * 100}%`, backgroundColor: MOVIDA_BRAND.primaryColor }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{Math.round((mariaActivePlan.week / 12) * 100)}% completado</p>
                </div>
                <Link
                    href="/movidatest/cliente/workout"
                    className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30 hover:bg-muted transition-colors"
                >
                    <span className="text-sm font-semibold" style={{ color: MOVIDA_BRAND.primaryColor }}>Iniciar sesión de hoy</span>
                    <ChevronRight className="w-4 h-4" style={{ color: MOVIDA_BRAND.primaryColor }} />
                </Link>
            </div>

            {/* Weight progress */}
            <div className="mx-4 mt-3 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Scale className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-semibold">Progreso de peso</span>
                    </div>
                    {weightDelta !== 0 && (
                        <div className={`flex items-center gap-0.5 text-xs font-semibold ${weightDelta < 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                            <TrendingDown className="w-3 h-3" />
                            {Math.abs(weightDelta).toFixed(1)} kg
                        </div>
                    )}
                </div>
                <div className="flex items-end gap-3 justify-between">
                    <div className="text-center">
                        <p className="text-xl font-bold">{latestCheckIn.weight_kg} kg</p>
                        <p className="text-[10px] text-muted-foreground">Hoy</p>
                    </div>
                    <div className="flex-1 flex items-end gap-0.5 h-10">
                        {mariaCheckIns.slice().reverse().map((ci, i) => (
                            <div
                                key={ci.id}
                                className="flex-1 rounded-t"
                                style={{
                                    height: `${((ci.weight_kg - 65) / 5) * 100}%`,
                                    backgroundColor: i === mariaCheckIns.length - 1
                                        ? MOVIDA_BRAND.primaryColor
                                        : `${MOVIDA_BRAND.primaryColor}50`
                                }}
                            />
                        ))}
                    </div>
                    <div className="text-center">
                        <p className="text-xl font-bold text-teal-500">{mariaClient.goal_weight_kg} kg</p>
                        <p className="text-[10px] text-muted-foreground">Meta</p>
                    </div>
                </div>
            </div>

            {/* Nutrition summary */}
            <div className="mx-4 mt-3 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold">Nutrición hoy</span>
                    <Link href="/movidatest/cliente/nutrition" className="text-xs" style={{ color: MOVIDA_BRAND.primaryColor }}>Ver →</Link>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-center">
                        <p className="text-lg font-bold">{mariaNutritionTotals.calories}</p>
                        <p className="text-[10px] text-muted-foreground">kcal</p>
                    </div>
                    <div className="flex-1 flex flex-col gap-1.5">
                        {[
                            { label: 'Proteína', value: mariaNutritionTotals.protein_g, target: mariaNutritionTotals.target_protein_g, color: '#3B82F6' },
                            { label: 'Carbs', value: mariaNutritionTotals.carbs_g, target: mariaNutritionTotals.target_carbs_g, color: '#F59E0B' },
                            { label: 'Grasas', value: mariaNutritionTotals.fat_g, target: mariaNutritionTotals.target_fat_g, color: '#10B981' },
                        ].map(m => (
                            <div key={m.label} className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground w-12">{m.label}</span>
                                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full"
                                        style={{ width: `${Math.min(100, (m.value / m.target) * 100)}%`, backgroundColor: m.color }}
                                    />
                                </div>
                                <span className="text-[10px] text-muted-foreground w-10 text-right">{m.value}g</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* PRs */}
            <div className="mx-4 mt-3 mb-4 rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-semibold mb-2">Records personales</p>
                <div className="grid grid-cols-2 gap-2">
                    {mariaPRs.slice(0, 4).map(pr => (
                        <div key={pr.exercise_name} className="rounded-lg bg-muted p-2">
                            <p className="text-[10px] text-muted-foreground">{pr.exercise_name}</p>
                            <p className="text-xs font-bold">{pr.value}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
