'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    UserPlus,
    Copy,
    Check,
    Users,
    ShieldCheck,
    AlertTriangle,
    Flame,
    Star,
    RefreshCw,
    ChevronRight,
} from 'lucide-react'
import { motion, useMotionValue, useSpring, useMotionValueEvent } from 'framer-motion'
import { CreateClientModal } from './CreateClientModal'
import { GlassCard } from '@/components/ui/glass-card'
import { GlassButton } from '@/components/ui/glass-button'
import type { DirectoryPulseRow } from '@/services/dashboard.service'
import type { DirectoryRiskFilter } from './directory-types'

export type { DirectoryRiskFilter } from './directory-types'

interface CoachWarRoomProps {
    coachSlug?: string
    appUrl?: string
    clients: Array<{
        id: string
        force_password_change?: boolean | null
        is_active?: boolean | null
    }>
    pulse: DirectoryPulseRow[]
    activeFilter: DirectoryRiskFilter
    onFilterChange: (f: DirectoryRiskFilter) => void
}

function AnimatedNumber({ value }: { value: number }) {
    const mv = useMotionValue(0)
    const spring = useSpring(mv, { stiffness: 120, damping: 22, mass: 0.4 })
    const [text, setText] = useState('0')

    useEffect(() => {
        mv.set(value)
    }, [value, mv])

    useMotionValueEvent(spring, 'change', (v) => {
        setText(String(Math.round(v)))
    })

    return <span className="tabular-nums">{text}</span>
}

const cardContainer = {
    hidden: {},
    show: {
        transition: { staggerChildren: 0.08 },
    },
}

const cardItem = {
    hidden: { opacity: 0, y: 16, scale: 0.96 },
    show: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { type: 'spring' as const, stiffness: 300, damping: 24 },
    },
}

export function CoachWarRoom({
    coachSlug,
    appUrl,
    clients,
    pulse,
    activeFilter,
    onFilterChange,
}: CoachWarRoomProps) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [copied, setCopied] = useState(false)
    const [syncing, setSyncing] = useState(false)

    const loginUrl = coachSlug && appUrl ? `${appUrl}/c/${coachSlug}/login` : ''

    const total = clients.length
    const active = clients.filter((c) => !c.force_password_change && c.is_active !== false).length
    const urgentCount = pulse.filter((p) => p.attentionScore >= 50).length
    const reviewCount = pulse.filter((p) => p.attentionScore >= 25 && p.attentionScore < 50).length
    const avgAdherence =
        pulse.length > 0
            ? Math.round(pulse.reduce((a, p) => a + p.percentage, 0) / pulse.length)
            : 0

    const expiredProgramsCount = pulse.filter(
        (p) => p.planDaysRemaining !== null && p.planDaysRemaining <= 0
    ).length
    const noCheckin7d = pulse.filter((p) =>
        (p.attentionFlags ?? []).includes('SIN_CHECKIN_7D')
    ).length
    const pendingPassword = clients.filter((c) => c.force_password_change).length

    const handleCopy = () => {
        if (loginUrl) {
            navigator.clipboard.writeText(loginUrl)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    const handleSync = () => {
        setSyncing(true)
        router.refresh()
        setTimeout(() => setSyncing(false), 800)
    }

    const statCards = [
        {
            key: 'total' as const,
            label: 'Total',
            value: total,
            icon: Users,
            color: 'text-zinc-400',
            gradient: 'from-zinc-500/10 to-transparent',
            filter: 'all' as DirectoryRiskFilter,
        },
        {
            key: 'active' as const,
            label: 'Activos',
            value: active,
            icon: ShieldCheck,
            color: 'text-primary',
            gradient: 'from-primary/10 to-transparent',
            filter: 'all' as DirectoryRiskFilter,
        },
        {
            key: 'review' as const,
            label: 'Atención',
            sub: '⚠️',
            value: reviewCount,
            icon: AlertTriangle,
            color: 'text-amber-500',
            gradient: 'from-amber-500/10 to-transparent',
            filter: 'review' as DirectoryRiskFilter,
        },
        {
            key: 'urgent' as const,
            label: 'Riesgo',
            sub: '🔴',
            value: urgentCount,
            icon: Flame,
            color: 'text-rose-500',
            gradient: 'from-rose-500/10 to-transparent',
            filter: 'urgent' as DirectoryRiskFilter,
        },
        {
            key: 'avg' as const,
            label: 'Avg Adher.',
            value: avgAdherence,
            suffix: '%',
            icon: Star,
            color: 'text-emerald-500',
            gradient: 'from-emerald-500/10 to-transparent',
            filter: 'all' as DirectoryRiskFilter,
            isPercent: true,
        },
    ]

    return (
        <>
            <div className="space-y-8 mb-8 md:mb-12">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative">
                    <div className="absolute -top-10 -left-10 w-64 h-64 bg-primary/10 blur-[100px] pointer-events-none z-0" />

                    <div className="relative z-10 space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="text-3xl md:text-5xl font-black text-foreground uppercase tracking-tighter font-display">
                                Directorio de Alumnos
                            </h1>
                        </div>
                        <p className="text-muted-foreground text-sm font-medium max-w-lg leading-relaxed">
                            Gestión centralizada · panel operativo tipo War Room
                        </p>
                        <p className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest">
                            Actualizado al cargar la página
                            <button
                                type="button"
                                onClick={handleSync}
                                disabled={syncing}
                                className="ml-3 inline-flex items-center gap-1.5 text-primary hover:opacity-80 disabled:opacity-50"
                                style={{ color: 'var(--theme-primary)' }}
                            >
                                <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
                                sync
                            </button>
                        </p>

                        {loginUrl && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-2 inline-flex items-center gap-3 bg-white/50 dark:bg-white/[0.03] backdrop-blur-md border border-border dark:border-white/10 rounded-full px-4 py-2 cursor-pointer hover:bg-white/80 dark:hover:bg-white/[0.06] transition-all group"
                                onClick={handleCopy}
                            >
                                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                                    Portal alumnos:
                                </span>
                                <span className="text-xs text-primary font-bold truncate max-w-[200px]">
                                    {loginUrl}
                                </span>
                                <div className="p-1 rounded-full bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                </div>
                            </motion.div>
                        )}
                    </div>

                    <div className="relative z-10 w-full md:w-auto">
                        <GlassButton
                            onClick={() => setOpen(true)}
                            className="w-full md:w-auto px-8 h-14 text-white hover:opacity-90 transition-all border-none"
                            style={{
                                backgroundColor: 'var(--theme-primary)',
                                boxShadow: '0 0 20px -5px var(--theme-primary)',
                            }}
                        >
                            <UserPlus className="w-5 h-5 mr-2" />
                            <span className="font-bold uppercase tracking-widest text-xs">Nuevo Alumno</span>
                        </GlassButton>
                    </div>
                </div>

                <motion.div
                    className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 relative z-10"
                    variants={cardContainer}
                    initial="hidden"
                    animate="show"
                >
                    {statCards.map((stat) => {
                        const selected =
                            activeFilter === 'all'
                                ? stat.key === 'total'
                                : stat.filter !== 'all' && stat.filter === activeFilter
                        return (
                            <motion.div key={stat.key} variants={cardItem}>
                                <GlassCard
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => onFilterChange(stat.filter)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault()
                                            onFilterChange(stat.filter)
                                        }
                                    }}
                                    className={`group relative overflow-hidden bg-white/80 dark:bg-zinc-950/50 cursor-pointer transition-all ${
                                        selected
                                            ? 'ring-2 ring-primary/40 ring-offset-2 ring-offset-background'
                                            : ''
                                    }`}
                                >
                                    <motion.div
                                        whileHover={{ scale: 1.03, y: -3 }}
                                        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                                        className="h-full"
                                    >
                                        <div
                                            className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-50`}
                                        />
                                        <div className="relative z-10 p-4 md:p-5 flex items-center gap-4">
                                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-white/50 dark:bg-white/5 border border-border dark:border-white/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                                                <stat.icon className={`w-5 h-5 md:w-6 h-6 ${stat.color}`} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-2xl md:text-3xl font-black text-foreground tracking-tighter font-display leading-none flex items-baseline gap-0.5">
                                                    {stat.isPercent ? (
                                                        <>
                                                            <AnimatedNumber value={stat.value} />
                                                            {stat.suffix}
                                                        </>
                                                    ) : (
                                                        <>
                                                            {stat.sub && (
                                                                <span className="text-lg mr-0.5">
                                                                    {stat.sub}
                                                                </span>
                                                            )}
                                                            <AnimatedNumber value={stat.value} />
                                                        </>
                                                    )}
                                                </p>
                                                <p className="text-[9px] md:text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] mt-2 truncate">
                                                    {stat.label}
                                                </p>
                                            </div>
                                        </div>
                                    </motion.div>
                                </GlassCard>
                            </motion.div>
                        )
                    })}
                </motion.div>

                {urgentCount > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                    >
                        <p className="text-sm font-bold text-rose-600 dark:text-rose-400">
                            {urgentCount} cliente{urgentCount !== 1 ? 's' : ''} con atención urgente
                            (score ≥ 50)
                        </p>
                        <button
                            type="button"
                            onClick={() => onFilterChange('urgent')}
                            className="text-[10px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400 flex items-center gap-1 hover:gap-2 transition-all"
                        >
                            Ver <ChevronRight className="w-4 h-4" />
                        </button>
                    </motion.div>
                )}

                {expiredProgramsCount > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-2xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                    >
                        <p className="text-sm font-bold text-orange-700 dark:text-orange-400">
                            {expiredProgramsCount} programa
                            {expiredProgramsCount !== 1 ? 's' : ''} vencido
                            {expiredProgramsCount !== 1 ? 's' : ''}
                        </p>
                        <button
                            type="button"
                            onClick={() => onFilterChange('expired_program')}
                            className="text-[10px] font-black uppercase tracking-widest text-orange-700 dark:text-orange-400 flex items-center gap-1 hover:gap-2 transition-all"
                        >
                            Ver <ChevronRight className="w-4 h-4" />
                        </button>
                    </motion.div>
                )}

                {pendingPassword > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                    >
                        <p className="text-sm font-bold text-amber-800 dark:text-amber-400">
                            {pendingPassword} alumno{pendingPassword !== 1 ? 's' : ''} con cambio de
                            contraseña pendiente
                        </p>
                        <button
                            type="button"
                            onClick={() => onFilterChange('password_reset')}
                            className="text-[10px] font-black uppercase tracking-widest text-amber-800 dark:text-amber-400 flex items-center gap-1 hover:gap-2 transition-all"
                        >
                            Ver <ChevronRight className="w-4 h-4" />
                        </button>
                    </motion.div>
                )}

                {noCheckin7d > 0 && urgentCount === 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                    >
                        <p className="text-sm font-bold text-foreground">
                            ALERTA: {noCheckin7d} cliente{noCheckin7d !== 1 ? 's' : ''} llevan más de 7
                            días sin check-in
                        </p>
                        <button
                            type="button"
                            onClick={() => onFilterChange('urgent')}
                            className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1 hover:gap-2 transition-all"
                            style={{ color: 'var(--theme-primary)' }}
                        >
                            Ver <ChevronRight className="w-4 h-4" />
                        </button>
                    </motion.div>
                )}
            </div>
            <CreateClientModal open={open} onClose={() => setOpen(false)} />
        </>
    )
}
