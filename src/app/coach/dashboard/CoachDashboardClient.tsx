'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
    Users,
    Activity,
    ArrowRight,
    TriangleAlert,
    CalendarClock,
    CheckCircle,
    Utensils,
    Dumbbell,
    Info
} from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { GlassCard } from '@/components/ui/glass-card'
import { GlassButton } from '@/components/ui/glass-button'
import { DashboardCharts } from '@/components/coach/dashboard/DashboardCharts'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Apple, CalendarHeart } from 'lucide-react'

const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
        opacity: 1,
        transition: { 
            staggerChildren: 0.1 
        }
    }
}

const itemVariants: any = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
        opacity: 1, 
        y: 0,
        transition: {
            duration: 0.5,
            ease: [0.25, 0.4, 0.25, 1]
        }
    }
}

interface CoachDashboardClientProps {
    totalClients: number
    activePlans: number
    avgAdherence: number
    avgNutrition: number
    adherenceStats: any[]
    nutritionStats: any[]
    recentActivities: any[]
    expiringPrograms: any[]
    areaData: any[]
    barData: any[]
}

export default function CoachDashboardClient({
    totalClients,
    activePlans,
    avgAdherence,
    avgNutrition,
    adherenceStats,
    nutritionStats,
    recentActivities,
    expiringPrograms,
    areaData,
    barData
}: CoachDashboardClientProps) {
    const [modalType, setModalType] = useState<'adherence' | 'nutrition' | null>(null)

    const stats = [
        {
            label: 'Alumnos Activos',
            value: totalClients,
            icon: Users,
            color: 'text-primary',
            href: '/coach/clients',
            trend: 'Base de datos',
            hasInfo: false
        },
        {
            label: 'Rutinas Asignadas',
            value: activePlans,
            icon: Activity,
            color: 'text-primary',
            href: '/coach/workout-programs',
            trend: 'Base de datos',
            hasInfo: false
        },
        {
            id: 'adherence',
            label: 'Adherencia Promedio',
            value: `${avgAdherence}%`,
            icon: Dumbbell,
            color: 'text-primary',
            href: '#',
            trend: 'Tiempo Real',
            hasInfo: true
        },
        {
            id: 'nutrition',
            label: 'Cumplimiento Macros',
            value: `${avgNutrition}%`,
            icon: Utensils,
            color: 'text-primary',
            href: '#',
            trend: 'Tiempo Real',
            hasInfo: true
        },
    ]

    return (
        <motion.div 
            className="space-y-8"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            {/* Header */}
            <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative">
                <div className="absolute -top-10 -left-10 w-64 h-64 bg-primary/10 dark:bg-primary/10 blur-[100px] pointer-events-none z-0" />
                
                <div className="relative z-10">
                    <h1 className="text-4xl md:text-5xl font-black text-foreground uppercase tracking-tighter font-display">
                        Centro de Control
                    </h1>
                    <p className="text-muted-foreground text-sm font-medium mt-2 max-w-md leading-relaxed">
                        Análisis de rendimiento, gestión de alumnos y métricas de retención en tiempo real.
                    </p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-4 relative z-10">
                    <GlassButton asChild className="w-full sm:w-auto">
                        <Link href="/coach/clients">
                            <Users className="w-4 h-4 mr-2" />
                            Alumnos
                        </Link>
                    </GlassButton>
                </div>
            </motion.div>

            {/* Stats Grid */}
            <motion.div variants={containerVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 relative z-10">
                {stats.map((stat, i) => {
                    const Icon = stat.icon
                    const CardContent = (
                        <GlassCard hoverEffect className="relative h-full flex flex-col justify-between overflow-hidden border-blue-500/10 dark:border-white/5 bg-white/80 dark:bg-zinc-950 transition-all duration-500 shadow-xl dark:shadow-[0_0_20px_-5px_rgba(0,122,255,0.3)]">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(0,122,255,0.05),transparent_70%)] dark:bg-[radial-gradient(circle_at_0%_0%,rgba(0,122,255,0.25),transparent_75%)] pointer-events-none z-0" />
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-[radial-gradient(circle_at_0%_0%,rgba(0,122,255,0.1),transparent_75%)] dark:bg-[radial-gradient(circle_at_0%_0%,rgba(0,122,255,0.35),transparent_80%)] transition-opacity duration-500 pointer-events-none z-0" />
                            
                            <div className="relative z-10 p-4 md:p-6 h-full flex flex-col justify-between">
                                <div className="flex items-start justify-between mb-4 md:mb-8">
                                    <div className="w-8 h-8 md:w-12 md:h-12 rounded-lg md:rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 bg-primary/5 dark:bg-white/5 border border-primary/10 dark:border-white/10 group-hover:border-primary/30 group-hover:bg-primary/5">
                                        <Icon className="w-4 h-4 md:w-6 md:h-6 text-primary dark:text-zinc-400 group-hover:text-primary transition-colors" />
                                    </div>
                                    <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-primary/5 dark:bg-white/5 flex items-center justify-center text-primary/40 dark:text-zinc-500 group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                                        <ArrowRight className="w-3 h-3 md:w-4 md:h-4 -rotate-45" />
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xl md:text-4xl font-black text-foreground tracking-tighter font-display mb-0.5 md:mb-1">
                                            {stat.value}
                                        </h3>
                                        {stat.hasInfo && (
                                            <button 
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setModalType(stat.id as any);
                                                }}
                                                className="p-1.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary transition-colors md:hidden"
                                            >
                                                <Info className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-[8px] md:text-[11px] uppercase tracking-[0.1em] md:tracking-[0.2em] font-bold text-muted-foreground mb-2 md:mb-3 leading-tight group-hover:text-foreground/80 transition-colors">
                                        {stat.label}
                                    </p>
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="hidden md:inline-flex items-center text-[10px] font-bold text-primary/60 dark:text-foreground/30 group-hover:text-primary/80 dark:group-hover:text-foreground/50 bg-primary/5 dark:bg-white/5 px-2 py-1 rounded-md transition-colors border border-primary/10 dark:border-transparent">
                                            {stat.trend}
                                        </div>
                                        {stat.hasInfo && (
                                            <button 
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setModalType(stat.id as any);
                                                }}
                                                className="hidden md:flex items-center gap-1.5 text-[10px] font-bold text-primary hover:text-primary/80 transition-colors"
                                            >
                                                <span>MAS INFO</span>
                                                <Info className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </GlassCard>
                    )

                    return (
                        <motion.div key={i} variants={itemVariants}>
                            {stat.href !== '#' ? (
                                <Link href={stat.href} className="block group h-full">
                                    {CardContent}
                                </Link>
                            ) : (
                                <div className="block group h-full cursor-pointer" onClick={() => stat.hasInfo && setModalType(stat.id as any)}>
                                    {CardContent}
                                </div>
                            )}
                        </motion.div>
                    )
                })}
            </motion.div>

            <div className="relative z-10">
                <DashboardCharts areaData={areaData} barData={barData} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 relative z-10">
                <motion.div variants={itemVariants} className="lg:col-span-2">
                    <GlassCard className="h-full flex flex-col bg-white/80 dark:bg-zinc-950">
                        <div className="px-6 py-5 border-b border-border dark:border-white/10 flex items-center justify-between bg-muted/30 dark:bg-white/[0.02]">
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-md bg-primary/10">
                                    <Activity className="w-4 h-4 text-primary" />
                                </div>
                                <h2 className="text-xs font-bold text-foreground uppercase tracking-[0.2em] font-display">
                                    Terminal de Actividad
                                </h2>
                            </div>
                            <div className="flex gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-destructive/50" />
                                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
                            </div>
                        </div>

                        <div className="flex-1 p-0 overflow-hidden font-mono text-sm bg-zinc-50/50 dark:bg-transparent">
                            {!recentActivities || recentActivities.length === 0 ? (
                                <div className="px-8 py-20 text-center flex flex-col items-center justify-center h-full">
                                    <Activity className="w-12 h-12 text-muted-foreground mb-4 opacity-20" />
                                    <p className="text-muted-foreground text-sm">Esperando señales...</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-border/50 dark:divide-white/5 p-4 space-y-1">
                                    {recentActivities.map((activity) => (
                                        <Link key={activity.id} href={activity.href} className="flex items-start gap-4 p-3 hover:bg-primary/5 dark:hover:bg-white/5 transition-colors rounded-lg group">
                                            <div className="text-emerald-500 mt-0.5 opacity-70 group-hover:opacity-100">
                                                <ArrowRight className="w-4 h-4" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-primary font-bold">[{activity.type.toUpperCase()}]</span>
                                                    <span className="text-zinc-700 dark:text-zinc-300 truncate">{activity.title}</span>
                                                </div>
                                                <div className="text-zinc-500 text-xs">
                                                    {activity.subtitle}
                                                </div>
                                            </div>
                                            <div className="text-zinc-400 dark:text-zinc-600 text-xs shrink-0 pt-1">
                                                {new Date(activity.date).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    </GlassCard>
                </motion.div>

                <motion.div variants={itemVariants} className="space-y-6 md:space-y-8">
                    <GlassCard className={`h-full bg-white/80 dark:bg-zinc-950 ${expiringPrograms.length > 0 ? "border-rose-500/20 shadow-rose-500/5" : ""}`}>
                        <div className="px-6 py-5 border-b border-border dark:border-white/10 flex items-center justify-between bg-muted/30 dark:bg-white/[0.02]">
                            <div className="flex items-center gap-3">
                                <TriangleAlert className={`w-4 h-4 ${expiringPrograms.length > 0 ? 'text-rose-500' : 'text-muted-foreground'}`} />
                                <h2 className="text-xs font-bold text-foreground uppercase tracking-widest font-display">
                                    Alertas
                                </h2>
                            </div>
                            {expiringPrograms.length > 0 && (
                                <Badge variant="destructive" className="bg-rose-500/20 text-rose-500 border-rose-500/30 font-bold">
                                    {expiringPrograms.length}
                                </Badge>
                            )}
                        </div>
                        <div className="p-2">
                            {expiringPrograms.length === 0 ? (
                                <div className="p-6 text-center">
                                    <CheckCircle className="w-8 h-8 text-emerald-500/50 mx-auto mb-2" />
                                    <p className="text-xs text-muted-foreground">Todo en orden.</p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {expiringPrograms.map((program) => (
                                        <div key={program.id} className="p-4 rounded-xl hover:bg-secondary/50 dark:hover:bg-white/[0.02] transition-colors border border-transparent hover:border-border dark:hover:border-white/5">
                                            <div className="flex items-start gap-4">
                                                <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0 border border-rose-500/20">
                                                    <CalendarClock className="w-5 h-5 text-rose-500" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-bold text-foreground truncate">
                                                        {program.clientName}
                                                    </p>
                                                    <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mt-1">
                                                        {program.daysLeft === 0 ? 'Expira Hoy' : `En ${program.daysLeft} Días`}
                                                    </p>
                                                </div>
                                            </div>
                                            <Link 
                                                href={`/coach/builder/${program.clientId}`}
                                                className="mt-4 flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-background border border-border dark:border-white/10 text-xs font-bold hover:bg-muted dark:hover:bg-white/5 transition-colors"
                                            >
                                                Actualizar Plan
                                            </Link>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </GlassCard>
                </motion.div>
            </div>

            <AdherenceModal 
                isOpen={modalType === 'adherence'} 
                onClose={() => setModalType(null)} 
                data={adherenceStats} 
            />
            <NutritionModal 
                isOpen={modalType === 'nutrition'} 
                onClose={() => setModalType(null)} 
                data={nutritionStats} 
            />
        </motion.div>
    )
}

function AdherenceModal({ isOpen, onClose, data }: { isOpen: boolean, onClose: () => void, data: any[] }) {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-black tracking-tighter uppercase font-display">Estadísticas de Adherencia</DialogTitle>
                    <DialogDescription>Rendimiento de alumnos en sus rutinas de la última semana.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                    {data.map((stat) => (
                        <div key={stat.clientId} className="p-4 rounded-xl bg-zinc-50 dark:bg-white/[0.02] border border-zinc-100 dark:border-white/5 space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="font-bold text-foreground">{stat.clientName}</h4>
                                    <p className="text-[10px] uppercase text-primary font-bold tracking-wider">{stat.lastPlan}</p>
                                </div>
                                <div className="text-right">
                                    <span className="text-lg font-black text-primary">{stat.percentage}%</span>
                                    <p className="text-[10px] text-muted-foreground uppercase font-bold">{stat.completedSets}/{stat.totalSets} Series</p>
                                </div>
                            </div>
                            <Progress value={stat.percentage} className="h-1.5 bg-zinc-200 dark:bg-zinc-800" />
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    )
}

function NutritionModal({ isOpen, onClose, data }: { isOpen: boolean, onClose: () => void, data: any[] }) {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-black tracking-tighter uppercase font-display flex items-center gap-3">
                        <Apple className="w-6 h-6 text-emerald-500" />
                        Monitoreo de Nutrición Real-Time
                    </DialogTitle>
                    <DialogDescription>Comparativa entre el plan asignado y el consumo reportado hoy.</DialogDescription>
                </DialogHeader>
                <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
                    {data.length === 0 ? (
                        <div className="py-10 text-center text-muted-foreground uppercase font-black text-xs tracking-widest">
                            No hay reportes de nutrición para hoy
                        </div>
                    ) : data.map((stat) => (
                        <div key={stat.clientId} className="p-6 rounded-2xl bg-zinc-50 dark:bg-white/[0.02] border border-zinc-100 dark:border-white/5 space-y-5">
                            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/10 pb-4">
                                <div className="space-y-1">
                                    <h4 className="font-black text-xl text-foreground uppercase tracking-tight">{stat.clientName}</h4>
                                    <div className="flex items-center gap-3">
                                        <Badge variant="outline" className="text-[10px] uppercase font-black py-0 border-primary/20 bg-primary/5 text-primary">
                                            {stat.lastPlan}
                                        </Badge>
                                        <div className="flex items-center gap-1.5 text-emerald-500 font-black text-[10px] uppercase tracking-widest">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            {stat.percentage}% Adherencia Hoy
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-black text-foreground tabular-nums">{Math.round(stat.consumed.cal)}</div>
                                    <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Kcal Consumidas</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <MacroItem label="Calorías" consumed={stat.consumed.cal} target={stat.target.cal} unit="kcal" color="text-primary" />
                                <MacroItem label="Proteína" consumed={stat.consumed.prot} target={stat.target.prot} unit="g" color="text-rose-500" />
                                <MacroItem label="Carbs" consumed={stat.consumed.carb} target={stat.target.carb} unit="g" color="text-amber-500" />
                                <MacroItem label="Grasas" consumed={stat.consumed.fat} target={stat.target.fat} unit="g" color="text-emerald-500" />
                            </div>

                            <div className="pt-2 flex justify-end">
                                <Link href={`/coach/clients/${stat.clientId}`} className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-1 hover:gap-2 transition-all">
                                    Ver Historial Completo <ArrowRight className="w-3 h-3" />
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    )
}

function MacroItem({ label, consumed, target, unit, color }: { label: string, consumed: number, target: number, unit: string, color: string }) {
    const percentage = target > 0 ? Math.min(Math.round((consumed / target) * 100), 100) : 0
    return (
        <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{label}</span>
                <span className={`text-[11px] font-black ${color} tabular-nums`}>{Math.round(consumed)} {unit}</span>
            </div>
            <div className="h-2 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div 
                    className={`h-full transition-all duration-700 ease-out ${color.replace('text-', 'bg-')}`} 
                    style={{ width: `${percentage}%` }}
                />
            </div>
            <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter opacity-70">
                Objetivo: {Math.round(target)}{unit}
            </div>
        </div>
    )
}
