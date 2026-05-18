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
    Salad,
} from 'lucide-react'
import { motion, useMotionValue, useSpring, useMotionValueEvent } from 'framer-motion'
import { CreateClientModal } from './CreateClientModal'
import { GlassCard } from '@/components/ui/glass-card'
import { GlassButton } from '@/components/ui/glass-button'
import type { DirectoryPulseRow } from '@/services/dashboard.service'
import type { DirectoryRiskFilter } from './directory-types'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useTranslation } from '@/lib/i18n/LanguageContext'

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
    const { t } = useTranslation()
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
    const noCheckin1m = pulse.filter((p) =>
        (p.attentionFlags ?? []).includes('SIN_CHECKIN_1M')
    ).length
    const pendingPassword = clients.filter((c) => c.force_password_change).length
    const nutritionLowCount = pulse.filter((p) =>
        (p.attentionFlags ?? []).includes('NUTRICION_RIESGO')
    ).length

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
        {
            key: 'nutrition_low' as const,
            label: 'Nutri. baja',
            sub: '🥗',
            value: nutritionLowCount,
            icon: Salad,
            color: 'text-red-500',
            gradient: 'from-red-500/10 to-transparent',
            filter: 'nutrition_low' as DirectoryRiskFilter,
        },
    ]

    return (
        <>
            <div className="mb-8 min-w-0 max-w-full space-y-8 md:mb-12">
                <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                    {/* Sin offsets negativos: evitan recorte con overflow-x del layout coach */}
                    <div
                        className="pointer-events-none absolute left-1/2 top-0 z-0 h-48 w-[min(90vw,22rem)] -translate-x-1/2 bg-primary/10 blur-[56px] md:h-64 md:w-[min(90vw,36rem)] md:blur-[80px]"
                        aria-hidden
                    />

                    <div className="relative z-10 min-w-0 max-w-full space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="font-display max-w-full text-2xl font-black uppercase tracking-tighter text-foreground break-words text-balance sm:text-3xl md:text-5xl">
                                Directorio de Alumnos
                            </h1>
                            <InfoTooltip content={t('section.coachClients')} />
                        </div>
                        <p className="max-w-lg text-sm font-medium leading-relaxed text-muted-foreground">
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
                                className="group mt-2 w-full max-w-full min-w-0 cursor-pointer rounded-2xl border border-border bg-white/50 px-3 py-3 backdrop-blur-md transition-all hover:bg-white/80 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06] sm:rounded-full sm:px-4 sm:py-2"
                                onClick={handleCopy}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        handleCopy()
                                    }
                                }}
                            >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                        Portal alumnos:
                                    </span>
                                    <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center">
                                        <span className="break-all text-xs font-bold text-primary [overflow-wrap:anywhere]">
                                            {loginUrl}
                                        </span>
                                        <div className="mt-0.5 shrink-0 rounded-full bg-primary/10 p-1 text-primary transition-transform group-hover:scale-110 sm:mt-0">
                                            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </div>

                    <div className="relative z-10 min-w-0 w-full md:w-auto">
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
                    className="relative z-10 grid w-full min-w-0 max-w-full grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:gap-4 lg:grid-cols-6"
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
                            <motion.div key={stat.key} variants={cardItem} className="min-w-0">
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
                                    className={`group relative cursor-pointer overflow-hidden bg-white/80 transition-all dark:bg-zinc-950/50 ${
                                        selected
                                            ? 'ring-2 ring-primary/40 ring-offset-0 ring-offset-background sm:ring-offset-2'
                                            : ''
                                    }`}
                                >
                                    <motion.div
                                        whileHover={{ y: -2 }}
                                        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                                        className="h-full"
                                    >
                                        <div
                                            className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-50`}
                                        />
                                        <div className="relative z-10 flex min-w-0 items-center gap-2 p-3 sm:gap-3 sm:p-4 md:gap-4 md:p-5">
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-white/50 transition-transform group-hover:scale-105 dark:border-white/10 dark:bg-white/5 sm:h-10 sm:w-10 md:h-12 md:w-12 md:group-hover:scale-110">
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
                        className="flex min-w-0 max-w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3"
                    >
                        <p className="min-w-0 flex-1 text-sm font-bold break-words text-rose-600 dark:text-rose-400">
                            {urgentCount} cliente{urgentCount !== 1 ? 's' : ''} con atención urgente
                            (score ≥ 50)
                        </p>
                        <button
                            type="button"
                            onClick={() => onFilterChange('urgent')}
                            className="flex shrink-0 items-center gap-1 text-[10px] font-black uppercase tracking-widest text-rose-600 transition-all hover:gap-2 dark:text-rose-400"
                        >
                            Ver <ChevronRight className="w-4 h-4" />
                        </button>
                    </motion.div>
                )}

                {expiredProgramsCount > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex min-w-0 max-w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-500/30 bg-orange-500/10 px-4 py-3"
                    >
                        <p className="min-w-0 flex-1 break-words text-sm font-bold text-orange-700 dark:text-orange-400">
                            {expiredProgramsCount} programa
                            {expiredProgramsCount !== 1 ? 's' : ''} vencido
                            {expiredProgramsCount !== 1 ? 's' : ''}
                        </p>
                        <button
                            type="button"
                            onClick={() => onFilterChange('expired_program')}
                            className="flex shrink-0 items-center gap-1 text-[10px] font-black uppercase tracking-widest text-orange-700 transition-all hover:gap-2 dark:text-orange-400"
                        >
                            Ver <ChevronRight className="w-4 h-4" />
                        </button>
                    </motion.div>
                )}

                {pendingPassword > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex min-w-0 max-w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3"
                    >
                        <p className="min-w-0 flex-1 break-words text-sm font-bold text-amber-800 dark:text-amber-400">
                            {pendingPassword} alumno{pendingPassword !== 1 ? 's' : ''} con cambio de
                            contraseña pendiente
                        </p>
                        <button
                            type="button"
                            onClick={() => onFilterChange('password_reset')}
                            className="flex shrink-0 items-center gap-1 text-[10px] font-black uppercase tracking-widest text-amber-800 transition-all hover:gap-2 dark:text-amber-400"
                        >
                            Ver <ChevronRight className="w-4 h-4" />
                        </button>
                    </motion.div>
                )}

                {nutritionLowCount > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex min-w-0 max-w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3"
                    >
                        <p className="min-w-0 flex-1 break-words text-sm font-bold text-red-700 dark:text-red-400">
                            🥗 {nutritionLowCount} alumno{nutritionLowCount !== 1 ? 's' : ''} con cumplimiento nutricional bajo ({'<'}60%)
                        </p>
                        <button
                            type="button"
                            onClick={() => onFilterChange('nutrition_low')}
                            className="flex shrink-0 items-center gap-1 text-[10px] font-black uppercase tracking-widest text-red-700 transition-all hover:gap-2 dark:text-red-400"
                        >
                            Ver <ChevronRight className="w-4 h-4" />
                        </button>
                    </motion.div>
                )}

                {noCheckin1m > 0 && urgentCount === 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex min-w-0 max-w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3"
                    >
                        <p className="min-w-0 flex-1 break-words text-sm font-bold text-foreground">
                            ALERTA: {noCheckin1m} cliente{noCheckin1m !== 1 ? 's' : ''} llevan mas de 1
                            mes sin check-in (desde el ultimo registrado)
                        </p>
                        <button
                            type="button"
                            onClick={() => onFilterChange('urgent')}
                            className="flex shrink-0 items-center gap-1 text-[10px] font-black uppercase tracking-widest text-primary transition-all hover:gap-2"
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
