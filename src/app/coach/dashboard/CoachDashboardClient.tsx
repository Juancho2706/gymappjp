'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { motion } from 'framer-motion'
import {
    Activity,
    ArrowRight,
    TriangleAlert,
    CalendarClock,
    CheckCircle,
    Utensils,
    Dumbbell,
    Info,
    UserPlus,
    TrendingUp,
    Users,
    Layers,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { GlassCard } from '@/components/ui/glass-card'
import { GlassButton } from '@/components/ui/glass-button'
const DashboardCharts = dynamic(
    () =>
        import('@/components/coach/dashboard/DashboardCharts').then((m) => ({
            default: m.DashboardCharts,
        })),
    {
        ssr: false,
        loading: () => <div className="h-64 w-full animate-pulse rounded-xl bg-muted/40" aria-hidden />,
    }
)
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Apple } from 'lucide-react'
import { CreateClientModal } from '../clients/CreateClientModal'
import { CoachOnboardingChecklist } from './CoachOnboardingChecklist'
import type { RiskAlertItem } from './_data/dashboard.queries'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useTranslation } from '@/lib/i18n/LanguageContext'

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
    topRiskClients: RiskAlertItem[]
    areaData: any[]
    barData: any[]
    mrrCurrentMonth: number
    mrrPreviousMonth: number
    subscriptionStatus?: string | null
    currentPeriodEnd?: string | null
    trialEndsAt?: string | null
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
    topRiskClients,
    areaData,
    barData,
    mrrCurrentMonth,
    mrrPreviousMonth,
    subscriptionStatus,
    currentPeriodEnd,
    trialEndsAt,
}: CoachDashboardClientProps) {
    const { t } = useTranslation()
    const [modalType, setModalType] = useState<'adherence' | 'nutrition' | null>(null)
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const hasRecentCheckin = recentActivities.some((activity) => activity.type === 'check-in')

    // Grace period: canceled but still has access
    const isCanceledWithAccess =
        subscriptionStatus === 'canceled' &&
        currentPeriodEnd != null &&
        new Date(currentPeriodEnd).getTime() > Date.now()

    // Trial countdown
    const isTrialing =
        subscriptionStatus === 'trialing' &&
        trialEndsAt != null &&
        new Date(trialEndsAt).getTime() > Date.now()

    const trialDaysLeft = isTrialing
        ? Math.max(0, Math.ceil((new Date(trialEndsAt!).getTime() - Date.now()) / 86400000))
        : 0

    const canceledUntilLabel = isCanceledWithAccess
        ? new Date(currentPeriodEnd!).toLocaleDateString('es-CL', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
          })
        : ''

    const mrrDelta = mrrPreviousMonth > 0
        ? Math.round(((mrrCurrentMonth - mrrPreviousMonth) / mrrPreviousMonth) * 100)
        : null
    const mrrLabel = mrrCurrentMonth > 0
        ? `$${mrrCurrentMonth.toLocaleString('es-CL')} CLP`
        : '—'

    const topStats = [
        {
            label: 'MRR Estimado',
            value: mrrLabel,
            icon: TrendingUp,
            trend: mrrDelta !== null ? `${mrrDelta >= 0 ? '+' : ''}${mrrDelta}% vs mes anterior` : 'Mes actual',
            trendColor: mrrDelta !== null && mrrDelta >= 0 ? 'text-emerald-500' : 'text-rose-500',
        },
        {
            label: 'Total Alumnos',
            value: String(totalClients),
            icon: Users,
            trend: 'Activos',
            trendColor: 'text-primary',
        },
        {
            label: 'Planes Activos',
            value: String(activePlans),
            icon: Layers,
            trend: 'Programas vigentes',
            trendColor: 'text-primary',
        },
    ]

    const stats = [
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
            {/* Canceled-with-access banner */}
            {isCanceledWithAccess && (
                <motion.div variants={itemVariants}>
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-300">
                        <div className="flex items-center gap-2">
                            <TriangleAlert className="h-4 w-4 shrink-0" />
                            <span>
                                Tu suscripción fue cancelada. Tienes acceso hasta el{' '}
                                <strong>{canceledUntilLabel}</strong>. Después de esa fecha tu cuenta quedará suspendida.
                            </span>
                        </div>
                        <Link
                            href="/coach/subscription"
                            className="shrink-0 font-semibold underline underline-offset-2 hover:opacity-80"
                        >
                            Reactivar
                        </Link>
                    </div>
                </motion.div>
            )}

            {/* Trial countdown banner */}
            {isTrialing && (
                <motion.div variants={itemVariants}>
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
                        <div className="flex items-center gap-2">
                            <Info className="h-4 w-4 shrink-0" />
                            <span>
                                Estás en período de prueba.{' '}
                                {trialDaysLeft === 0
                                    ? 'Tu prueba termina hoy.'
                                    : `Te quedan ${trialDaysLeft} día${trialDaysLeft !== 1 ? 's' : ''} de prueba.`}
                            </span>
                        </div>
                        <Link
                            href="/coach/subscription"
                            className="shrink-0 font-semibold underline underline-offset-2 hover:opacity-80"
                        >
                            Ver planes
                        </Link>
                    </div>
                </motion.div>
            )}

            {/* Header */}
            <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative">
                <div className="absolute -top-10 -left-10 w-64 h-64 bg-primary/10 dark:bg-primary/10 blur-[100px] pointer-events-none z-0" />
                
                <div className="relative z-10">
                    <div className="flex items-center gap-2">
                        <h1 className="text-4xl md:text-5xl font-black text-foreground uppercase tracking-tighter font-display">
                            Centro de Control
                        </h1>
                        <InfoTooltip content={t('section.coachDashboard')} />
                    </div>
                    <p className="text-muted-foreground text-sm font-medium mt-2 max-w-md leading-relaxed">
                        Análisis de rendimiento, gestión de alumnos y métricas de retención en tiempo real.
                    </p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-4 relative z-10">
                    <GlassButton 
                        onClick={() => setIsCreateModalOpen(true)}
                        variant="brand" 
                        className="w-full sm:w-auto"
                    >
                        <UserPlus className="w-4 h-4 mr-2" />
                        REGISTRAR ALUMNO
                    </GlassButton>
                    <GlassButton asChild variant="ghost" className="w-full sm:w-auto">
                        <Link href="/coach/workout-programs">
                            <Dumbbell className="w-4 h-4 mr-2" />
                            PROGRAMAS
                        </Link>
                    </GlassButton>
                    <GlassButton asChild variant="ghost" className="w-full sm:w-auto">
                        <Link href="/coach/nutrition-plans">
                            <Utensils className="w-4 h-4 mr-2" />
                            NUTRICION
                        </Link>
                    </GlassButton>
                </div>
            </motion.div>

            <motion.div variants={itemVariants}>
                <CoachOnboardingChecklist
                    totalClients={totalClients}
                    activePlans={activePlans}
                    hasRecentCheckin={hasRecentCheckin}
                />
            </motion.div>

            {/* Top KPI Row: MRR, Alumnos, Planes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 relative z-10">
                {topStats.map((stat, i) => {
                    const Icon = stat.icon
                    return (
                        <motion.div key={i} variants={itemVariants}>
                            <GlassCard className="relative overflow-hidden bg-white/90 dark:bg-zinc-950 border-border dark:border-white/5">
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,color-mix(in_srgb,var(--theme-primary),transparent_96%),transparent_70%)] pointer-events-none" />
                                <div className="relative p-4 md:p-5 flex items-center gap-4">
                                    <div
                                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                                        style={{
                                            backgroundColor: 'color-mix(in srgb, var(--theme-primary) 12%, transparent)',
                                            borderColor: 'color-mix(in srgb, var(--theme-primary) 25%, transparent)',
                                            color: 'var(--theme-primary)',
                                        }}
                                    >
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-0.5">
                                            {stat.label}
                                        </p>
                                        <p className="text-2xl font-black tracking-tighter font-display" style={{ color: 'var(--theme-primary)' }}>
                                            {stat.value}
                                        </p>
                                        <p className={`text-[10px] font-bold mt-0.5 ${stat.trendColor}`}>
                                            {stat.trend}
                                        </p>
                                    </div>
                                </div>
                            </GlassCard>
                        </motion.div>
                    )
                })}
            </div>

            {/* Stats & Alerts Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 relative z-10">
                {/* Alerts Section (Takes space of 2 cards) */}
                <motion.div variants={itemVariants} className="col-span-2">
                    <GlassCard className={`h-full bg-white/80 dark:bg-zinc-950 ${topRiskClients.length > 0 || expiringPrograms.length > 0 ? "border-rose-500/20 shadow-rose-500/5" : ""}`}>
                        <div className="px-6 py-5 border-b border-border dark:border-white/10 flex items-center justify-between bg-muted/30 dark:bg-white/[0.02]">
                            <div className="flex items-center gap-3">
                                <TriangleAlert className={`w-4 h-4 ${topRiskClients.length > 0 || expiringPrograms.length > 0 ? 'text-rose-500' : 'text-muted-foreground'}`} />
                                <h2 className="text-xs font-bold text-foreground uppercase tracking-widest font-display">
                                    Alertas Críticas
                                </h2>
                            </div>
                            {topRiskClients.length > 0 || expiringPrograms.length > 0 ? (
                                <Badge variant="destructive" className="bg-rose-500/20 text-rose-500 border-rose-500/30 font-bold">
                                    {topRiskClients.length + expiringPrograms.length}
                                </Badge>
                            ) : null}
                        </div>
                        <div className="p-2">
                            {topRiskClients.length === 0 && expiringPrograms.length === 0 ? (
                                <div className="p-8 text-center flex flex-col items-center justify-center">
                                    <CheckCircle className="w-10 h-10 text-emerald-500/50 mb-3" />
                                    <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Todo bajo control</p>
                                    <p className="text-[10px] text-muted-foreground/60 mt-1">No hay alumnos en riesgo ni planes por vencer</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {topRiskClients.map((alert) => (
                                        <div key={`risk-${alert.clientId}`} className="p-3 rounded-xl hover:bg-secondary/50 dark:hover:bg-white/[0.02] transition-colors border border-transparent hover:border-border dark:hover:border-white/5">
                                            <div className="flex items-start gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20">
                                                    <TriangleAlert className="w-4 h-4 text-amber-500" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-bold text-foreground truncate">{alert.clientName}</p>
                                                    <p className="text-[9px] font-bold text-amber-500 uppercase tracking-widest mt-0.5">
                                                        Riesgo {alert.attentionScore} - {alert.label}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 mt-3">
                                                <Link
                                                    href={`/coach/clients/${alert.clientId}`}
                                                    className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg bg-secondary border border-border text-[9px] font-bold hover:opacity-90 transition-all"
                                                >
                                                    Revisar alumno
                                                </Link>
                                                <Link
                                                    href={`/coach/builder/${alert.clientId}`}
                                                    className="flex items-center justify-center w-8 h-7 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-colors"
                                                    style={{ backgroundColor: 'var(--theme-primary)' }}
                                                >
                                                    <ArrowRight className="w-3 h-3" />
                                                </Link>
                                            </div>
                                        </div>
                                    ))}
                                    {expiringPrograms.map((program) => (
                                        <div key={program.id} className="p-3 rounded-xl hover:bg-secondary/50 dark:hover:bg-white/[0.02] transition-colors border border-transparent hover:border-border dark:hover:border-white/5">
                                            <div className="flex items-start gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0 border border-rose-500/20">
                                                    <CalendarClock className="w-4 h-4 text-rose-500" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-bold text-foreground truncate">
                                                        {program.clientName}
                                                    </p>
                                                    <p className="text-[9px] font-bold text-rose-500 uppercase tracking-widest mt-0.5">
                                                        {program.daysLeft === 0 ? 'Expira Hoy' : `En ${program.daysLeft} Días`}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 mt-3">
                                                <Link 
                                                    href={`/coach/builder/${program.clientId}`}
                                                    className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg bg-primary text-primary-foreground text-[9px] font-bold hover:opacity-90 transition-all shadow-md"
                                                    style={{ backgroundColor: 'var(--theme-primary)' }}
                                                >
                                                    Actualizar
                                                </Link>
                                                <Link
                                                    href={`/c/${program.clientSlug}/dashboard`}
                                                    target="_blank"
                                                    className="flex items-center justify-center w-8 h-7 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                    <ArrowRight className="w-3 h-3" />
                                                </Link>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </GlassCard>
                </motion.div>

                {/* Remaining Stats Cards */}
                {stats.map((stat, i) => {
                    const Icon = stat.icon
                    const CardContent = (
                        <GlassCard hoverEffect className="relative h-full flex flex-col justify-between overflow-hidden border-border dark:border-white/5 bg-white/90 dark:bg-zinc-950 transition-all duration-500 shadow-md dark:shadow-[0_0_20px_-5px_var(--theme-primary,rgba(0,122,255,0.3))]">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,color-mix(in srgb,var(--theme-primary),transparent_98%),transparent_70%)] dark:bg-[radial-gradient(circle_at_0%_0%,color-mix(in srgb,var(--theme-primary),transparent_75%),transparent_75%)] pointer-events-none z-0" />
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-[radial-gradient(circle_at_0%_0%,color-mix(in srgb,var(--theme-primary),transparent_95%),transparent_75%)] dark:bg-[radial-gradient(circle_at_0%_0%,color-mix(in srgb,var(--theme-primary),transparent_65%),transparent_80%)] transition-opacity duration-500 pointer-events-none z-0" />
                            
                            <div className="relative z-10 p-4 md:p-6 h-full flex flex-col justify-between">
                                <div className="flex items-start justify-between mb-4 md:mb-8">
                                    <div 
                                        className="w-8 h-8 md:w-12 md:h-12 rounded-lg md:rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 bg-white/50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 group-hover:bg-primary/5"
                                        style={{ 
                                            color: 'var(--theme-primary)', 
                                            borderColor: 'color-mix(in srgb, var(--theme-primary) 30%, transparent)' 
                                        } as any}
                                    >
                                        <Icon 
                                            className="w-4 h-4 md:w-6 md:h-6 transition-colors" 
                                            style={{ color: 'var(--theme-primary)' }}
                                        />
                                    </div>
                                    <div 
                                        className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-zinc-100 dark:bg-white/5 flex items-center justify-center text-muted-foreground group-hover:bg-primary/10 transition-colors"
                                        style={{ '--hover-color': 'var(--theme-primary)' } as any}
                                    >
                                        <ArrowRight className="w-3 h-3 md:w-4 md:h-4 -rotate-45 group-hover:text-[var(--hover-color)]" />
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center justify-between">
                                        <h3 
                                            className="text-xl md:text-4xl font-black tracking-tighter font-display mb-0.5 md:mb-1"
                                            style={{ color: 'var(--theme-primary)' }}
                                        >
                                            {stat.value}
                                        </h3>
                                        {stat.hasInfo && (
                                            <button 
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setModalType(stat.id as any);
                                                }}
                                                className="p-1.5 rounded-full bg-zinc-100 dark:bg-white/5 hover:bg-primary/20 transition-colors md:hidden"
                                                style={{ color: 'var(--theme-primary)' }}
                                            >
                                                <Info className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-[8px] md:text-[11px] uppercase tracking-[0.1em] md:tracking-[0.2em] font-bold text-muted-foreground mb-2 md:mb-3 leading-tight group-hover:text-foreground transition-colors">
                                        {stat.label}
                                    </p>
                                    <div className="flex items-center justify-between gap-2">
                                        <div 
                                            className="hidden md:inline-flex items-center text-[10px] font-bold px-2 py-1 rounded-md transition-colors border border-zinc-200 dark:border-white/5"
                                            style={{ 
                                                color: 'var(--theme-primary)', 
                                                backgroundColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)',
                                                borderColor: 'color-mix(in srgb, var(--theme-primary) 20%, transparent)'
                                            }}
                                        >
                                            {stat.trend}
                                        </div>
                                        {stat.hasInfo && (
                                            <button 
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setModalType(stat.id as any);
                                                }}
                                                className="hidden md:flex items-center gap-1.5 text-[10px] font-bold hover:opacity-80 transition-colors"
                                                style={{ color: 'var(--theme-primary)' }}
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
                            <div className="block group h-full cursor-pointer" onClick={() => stat.hasInfo && setModalType(stat.id as any)}>
                                {CardContent}
                            </div>
                        </motion.div>
                    )
                })}
            </div>

            <div className="relative z-10">
                <DashboardCharts areaData={areaData} barData={barData} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 relative z-10">
                <motion.div variants={itemVariants} className="lg:col-span-3">
                    <GlassCard className="h-full flex flex-col bg-white/80 dark:bg-zinc-950">
                        <div className="px-6 py-5 border-b border-border dark:border-white/10 flex items-center justify-between bg-muted/30 dark:bg-white/[0.02]">
                            <div className="flex items-center gap-3">
                                <div 
                                    className="p-1.5 rounded-md"
                                    style={{ backgroundColor: 'color-mix(in srgb, var(--theme-primary) 15%, transparent)' }}
                                >
                                    <Activity className="w-4 h-4" style={{ color: 'var(--theme-primary)' }} />
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
                                <div className="divide-y divide-border/50 dark:divide-white/5 p-2 md:p-4 space-y-1">
                                    {recentActivities.map((activity) => {
                                        const typeColor =
                                            activity.type === 'check-in' ? 'text-emerald-500' :
                                            activity.type === 'workout' ? 'text-blue-400' :
                                            'text-amber-400'
                                        return (
                                            <Link key={activity.id} href={activity.href} className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4 p-3 hover:bg-primary/5 dark:hover:bg-white/5 transition-colors rounded-lg group">
                                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                                    <div className={`mt-0.5 opacity-70 group-hover:opacity-100 shrink-0 ${typeColor}`}>
                                                        <ArrowRight className="w-4 h-4" />
                                                    </div>
                                                    <div className="flex flex-col gap-0.5 min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className={`font-bold whitespace-nowrap ${typeColor}`}>[{activity.type.toUpperCase()}]</span>
                                                            <span className="text-zinc-700 dark:text-zinc-300 font-medium truncate">{activity.title}</span>
                                                        </div>
                                                        <div className="text-zinc-500 text-xs truncate">
                                                            {activity.subtitle}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pl-7 sm:pl-0">
                                                    {activity.photoUrl && (
                                                        <div className="w-8 h-8 rounded-md overflow-hidden border border-border shrink-0">
                                                            <Image
                                                                src={activity.photoUrl}
                                                                alt="Check-in"
                                                                width={32}
                                                                height={32}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        </div>
                                                    )}
                                                    <div className="text-zinc-400 dark:text-zinc-600 text-[10px] md:text-xs">
                                                        {new Date(activity.date).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}
                                                    </div>
                                                    <div
                                                        className="text-[9px] font-bold uppercase tracking-tight px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity border"
                                                        style={{ color: 'var(--theme-primary)', borderColor: 'color-mix(in srgb, var(--theme-primary) 20%, transparent)', backgroundColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)' }}
                                                    >
                                                        Gestionar
                                                    </div>
                                                </div>
                                            </Link>
                                        )
                                    })}
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
            <CreateClientModal
                open={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
            />
        </motion.div>
    )
}

function AdherenceModal({ isOpen, onClose, data }: { isOpen: boolean, onClose: () => void, data: any[] }) {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-black tracking-tighter uppercase font-display text-foreground">Estadísticas de Adherencia</DialogTitle>
                    <DialogDescription className="text-muted-foreground">Rendimiento de alumnos en sus rutinas de la última semana.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                    {data.map((stat) => (
                        <div key={stat.clientId} className="p-4 rounded-xl bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/5 space-y-3 shadow-sm dark:shadow-none">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="font-bold text-foreground">{stat.clientName}</h4>
                                    <p className="text-[10px] uppercase text-primary font-bold tracking-wider" style={{ color: 'var(--theme-primary)' }}>{stat.lastPlan}</p>
                                </div>
                                <div className="text-right">
                                    <span className="text-lg font-black text-primary" style={{ color: 'var(--theme-primary)' }}>{stat.percentage}%</span>
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
            <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-2xl md:max-w-4xl bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 p-4 sm:p-6">
                <DialogHeader>
                    <DialogTitle className="text-lg sm:text-2xl font-black tracking-tighter uppercase font-display flex items-center gap-2 text-foreground">
                        <Apple className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500 shrink-0" />
                        Monitoreo de Nutrición Real-Time
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground text-xs sm:text-sm">Comparativa entre el plan asignado y el consumo reportado hoy.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
                    {data.length === 0 ? (
                        <div className="py-10 text-center text-muted-foreground uppercase font-black text-xs tracking-widest">
                            No hay reportes de nutrición para hoy
                        </div>
                    ) : data.map((stat) => (
                        <div key={stat.clientId} className="p-4 sm:p-5 rounded-2xl bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/5 space-y-4 shadow-sm dark:shadow-none">
                            {/* Client header */}
                            <div className="flex flex-wrap items-start justify-between gap-y-2 gap-x-3 border-b border-zinc-200 dark:border-white/10 pb-3">
                                <div className="min-w-0 flex-1 space-y-1.5">
                                    <h4 className="font-black text-base sm:text-lg text-foreground uppercase tracking-tight truncate">{stat.clientName}</h4>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="outline" className="text-[10px] uppercase font-black py-0 max-w-[140px] truncate" style={{ color: 'var(--theme-primary)', borderColor: 'color-mix(in srgb, var(--theme-primary) 20%, transparent)', backgroundColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)' }}>
                                            {stat.lastPlan}
                                        </Badge>
                                        <div className="flex items-center gap-1 text-emerald-500 font-black text-[10px] uppercase tracking-wider whitespace-nowrap">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                                            {stat.percentage}% Adherencia
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="text-xl sm:text-2xl font-black text-foreground tabular-nums">{Math.round(stat.consumed.cal)}</div>
                                    <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Kcal Consumidas</div>
                                </div>
                            </div>

                            {/* Macros grid — 2 cols on mobile, 4 on md+ */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
                                <MacroItem label="Calorías" consumed={stat.consumed.cal} target={stat.target.cal} unit="kcal" color="text-primary" />
                                <MacroItem label="Proteína" consumed={stat.consumed.prot} target={stat.target.prot} unit="g" color="text-rose-500" />
                                <MacroItem label="Carbs" consumed={stat.consumed.carb} target={stat.target.carb} unit="g" color="text-amber-500" />
                                <MacroItem label="Grasas" consumed={stat.consumed.fat} target={stat.target.fat} unit="g" color="text-emerald-500" />
                            </div>

                            <div className="pt-1 flex justify-end">
                                <Link href={`/coach/clients/${stat.clientId}`} className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:gap-2 transition-all" style={{ color: 'var(--theme-primary)' }}>
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
        <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">{label}</span>
            <span className={`text-sm font-black ${color} tabular-nums block`}>{Math.round(consumed)} {unit}</span>
            <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                    className={`h-full transition-all duration-700 ease-out ${color.replace('text-', 'bg-')}`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
            <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter opacity-70">
                Obj: {Math.round(target)}{unit}
            </div>
        </div>
    )
}
