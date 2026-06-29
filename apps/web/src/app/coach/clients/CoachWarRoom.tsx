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
import { StatCard } from '@/components/ui/stat-card'
import { Button } from '@/components/ui/button'
import type { DirectoryPulseRow } from '@/services/dashboard.service'
import type { DirectoryRiskFilter } from './directory-types'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { cn } from '@/lib/utils'

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

// DS tones for the conditional alert banners.
const BANNER_TONE = {
    danger: 'border-[color:var(--danger-500)]/40 bg-[var(--danger-100)] text-[var(--danger-700)]',
    warning: 'border-[color:var(--warning-500)]/40 bg-[var(--warning-100)] text-[var(--warning-700)]',
    info: 'border-[color:var(--info-500)]/40 bg-[var(--info-100)] text-[var(--info-600)]',
    ember: 'border-[color:var(--ember-500)]/40 bg-[var(--ember-100)] text-[var(--ember-700)]',
} as const

function AlertBanner({
    tone,
    children,
    onView,
}: {
    tone: keyof typeof BANNER_TONE
    children: React.ReactNode
    onView: () => void
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                'flex min-w-0 max-w-full flex-wrap items-center justify-between gap-3 rounded-card border px-4 py-3',
                BANNER_TONE[tone]
            )}
        >
            <p className="min-w-0 flex-1 break-words text-sm font-bold">{children}</p>
            <button
                type="button"
                onClick={onView}
                className="flex shrink-0 items-center gap-1 text-[10px] font-black uppercase tracking-widest transition-all hover:gap-2"
            >
                Ver <ChevronRight className="h-4 w-4" />
            </button>
        </motion.div>
    )
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
            iconColor: 'text-[var(--text-subtle)]',
            filter: 'all' as DirectoryRiskFilter,
        },
        {
            key: 'active' as const,
            label: 'Activos',
            value: active,
            icon: ShieldCheck,
            iconColor: 'text-sport-500',
            filter: 'all' as DirectoryRiskFilter,
        },
        {
            key: 'review' as const,
            label: 'Atención',
            value: reviewCount,
            icon: AlertTriangle,
            iconColor: 'text-[var(--warning-500)]',
            filter: 'review' as DirectoryRiskFilter,
        },
        {
            key: 'urgent' as const,
            label: 'Riesgo',
            value: urgentCount,
            icon: Flame,
            iconColor: 'text-[var(--danger-500)]',
            filter: 'urgent' as DirectoryRiskFilter,
        },
        {
            key: 'avg' as const,
            label: 'Adher. prom.',
            value: avgAdherence,
            icon: Star,
            iconColor: 'text-[var(--success-500)]',
            filter: 'all' as DirectoryRiskFilter,
            isPercent: true,
        },
        {
            key: 'nutrition_low' as const,
            label: 'Nutri. baja',
            value: nutritionLowCount,
            icon: Salad,
            iconColor: 'text-[var(--ember-500)]',
            filter: 'nutrition_low' as DirectoryRiskFilter,
        },
    ]

    return (
        <>
            <div className="mb-8 min-w-0 max-w-full space-y-6 md:mb-10 md:space-y-8">
                <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                    {/* Glow sutil con la rampa sport (white-label) — sin offsets negativos */}
                    <div
                        className="pointer-events-none absolute left-1/2 top-0 z-0 h-48 w-[min(90vw,22rem)] -translate-x-1/2 bg-sport-500/10 blur-[56px] md:h-64 md:w-[min(90vw,36rem)] md:blur-[80px]"
                        aria-hidden
                    />

                    <div className="relative z-10 min-w-0 max-w-full space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="font-display max-w-full text-2xl font-black uppercase tracking-tighter text-strong break-words text-balance sm:text-3xl md:text-4xl">
                                Directorio de Alumnos
                            </h1>
                            <InfoTooltip content={t('section.coachClients')} />
                        </div>
                        <p className="max-w-lg text-sm font-medium leading-relaxed text-muted">
                            Gestión centralizada · panel operativo tipo War Room
                        </p>
                        <p className="text-[10px] font-bold text-subtle uppercase tracking-widest">
                            Actualizado al cargar la página
                            <button
                                type="button"
                                onClick={handleSync}
                                disabled={syncing}
                                className="ml-3 inline-flex items-center gap-1.5 text-sport-600 hover:opacity-80 disabled:opacity-50"
                            >
                                <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
                                sync
                            </button>
                        </p>

                        {loginUrl && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="group mt-2 w-full max-w-full min-w-0 cursor-pointer rounded-card border border-subtle bg-surface-card px-3 py-3 transition-all hover:bg-surface-sunken sm:rounded-pill sm:px-4 sm:py-2"
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
                                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-subtle">
                                        Portal alumnos:
                                    </span>
                                    <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center">
                                        <span className="break-all text-xs font-bold text-sport-600 [overflow-wrap:anywhere]">
                                            {loginUrl}
                                        </span>
                                        <div className="mt-0.5 shrink-0 rounded-full bg-sport-500/10 p-1 text-sport-600 transition-transform group-hover:scale-110 sm:mt-0">
                                            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </div>

                    <div className="relative z-10 min-w-0 w-full md:w-auto">
                        <Button
                            variant="sport"
                            size="lg"
                            onClick={() => setOpen(true)}
                            className="w-full uppercase tracking-widest md:w-auto"
                        >
                            <UserPlus className="h-5 w-5" />
                            Nuevo Alumno
                        </Button>
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
                        const Icon = stat.icon
                        return (
                            <motion.button
                                key={stat.key}
                                type="button"
                                variants={cardItem}
                                onClick={() => onFilterChange(stat.filter)}
                                aria-pressed={selected}
                                className="min-w-0 cursor-pointer rounded-card text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--focus-ring)]"
                            >
                                <StatCard
                                    label={stat.label}
                                    value={<AnimatedNumber value={stat.value} />}
                                    unit={stat.isPercent ? '%' : undefined}
                                    icon={<Icon className={stat.iconColor} />}
                                    accent="neutral"
                                    className={cn(
                                        'h-full transition-[box-shadow,transform,border-color] duration-[140ms] hover:-translate-y-px hover:shadow-md',
                                        selected &&
                                            'border-sport-500 ring-2 ring-[color:var(--sport-500)]/40'
                                    )}
                                />
                            </motion.button>
                        )
                    })}
                </motion.div>

                {urgentCount > 0 && (
                    <AlertBanner tone="danger" onView={() => onFilterChange('urgent')}>
                        {urgentCount} cliente{urgentCount !== 1 ? 's' : ''} con atención urgente
                        (score ≥ 50)
                    </AlertBanner>
                )}

                {expiredProgramsCount > 0 && (
                    <AlertBanner tone="warning" onView={() => onFilterChange('expired_program')}>
                        {expiredProgramsCount} programa
                        {expiredProgramsCount !== 1 ? 's' : ''} vencido
                        {expiredProgramsCount !== 1 ? 's' : ''}
                    </AlertBanner>
                )}

                {pendingPassword > 0 && (
                    <AlertBanner tone="info" onView={() => onFilterChange('password_reset')}>
                        {pendingPassword} alumno{pendingPassword !== 1 ? 's' : ''} con cambio de
                        contraseña pendiente
                    </AlertBanner>
                )}

                {nutritionLowCount > 0 && (
                    <AlertBanner tone="ember" onView={() => onFilterChange('nutrition_low')}>
                        🥗 {nutritionLowCount} alumno{nutritionLowCount !== 1 ? 's' : ''} con
                        cumplimiento nutricional bajo ({'<'}60%)
                    </AlertBanner>
                )}

                {noCheckin1m > 0 && urgentCount === 0 && (
                    <AlertBanner tone="warning" onView={() => onFilterChange('urgent')}>
                        ALERTA: {noCheckin1m} cliente{noCheckin1m !== 1 ? 's' : ''} llevan mas de 1
                        mes sin check-in (desde el ultimo registrado)
                    </AlertBanner>
                )}
            </div>
            <CreateClientModal open={open} onClose={() => setOpen(false)} />
        </>
    )
}
