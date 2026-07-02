'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    UserPlus,
    Copy,
    Check,
    AlertTriangle,
    AlertOctagon,
    RefreshCw,
    ChevronDown,
    ChevronRight,
    ArrowRight,
    FileUp,
    KeyRound,
    Apple,
    LayoutGrid,
    Link as LinkIcon,
} from 'lucide-react'
import { motion, useMotionValue, useSpring, useMotionValueEvent } from 'framer-motion'
import { CreateClientModal } from './CreateClientModal'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
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

// ===== DirBanner · señal accionable (transcripción del DirBanner del diseño coach-directory.jsx) =====
// border 1px tono-500 · fondo tono-100 · icono tono-700 · "Ver →" 12/800.
const BANNER_TONE = {
    danger: { bd: 'var(--danger-500)', bg: 'var(--danger-100)', fg: 'var(--danger-700)' },
    warning: { bd: 'var(--warning-500)', bg: 'var(--warning-100)', fg: 'var(--warning-700)' },
    info: { bd: 'var(--info-400, #60A5FA)', bg: 'var(--info-100, #E6F0FB)', fg: 'var(--info-700, #1D4ED8)' },
    ember: { bd: 'var(--ember-500)', bg: 'var(--ember-100)', fg: 'var(--ember-700)' },
} as const

function DirBanner({
    tone,
    icon,
    children,
    onView,
}: {
    tone: keyof typeof BANNER_TONE
    icon: React.ReactNode
    children: React.ReactNode
    onView: () => void
}) {
    const t = BANNER_TONE[tone]
    return (
        <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={onView}
            className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] border px-[13px] py-2.5 text-left"
            style={{ borderColor: t.bd, background: t.bg }}
        >
            <span className="inline-flex shrink-0" style={{ color: t.fg }}>
                {icon}
            </span>
            <span
                className="min-w-0 flex-1 text-[12.5px] font-semibold leading-[1.3]"
                style={{ color: t.fg }}
            >
                {children}
            </span>
            <span
                className="inline-flex shrink-0 items-center gap-[3px] text-[12px] font-extrabold"
                style={{ color: t.fg }}
            >
                Ver <ArrowRight className="h-[13px] w-[13px]" />
            </span>
        </motion.button>
    )
}

// ===== DirPulseCard · prioridad jerárquica (Riesgo / Atención) — botón-filtro =====
const PULSE_TONE = {
    danger: {
        fg: 'text-[var(--danger-600)]',
        bg: 'bg-[var(--danger-100)]',
        solid: 'bg-[var(--danger-500)]',
        border: 'border-[var(--danger-500)]',
    },
    warning: {
        fg: 'text-[var(--warning-700)]',
        bg: 'bg-[var(--warning-100)]',
        solid: 'bg-[var(--warning-500)]',
        border: 'border-[var(--warning-500)]',
    },
} as const

function DirPulseCard({
    tone,
    label,
    value,
    hint,
    selected,
    onClick,
}: {
    tone: keyof typeof PULSE_TONE
    label: string
    value: number
    hint: string
    selected: boolean
    onClick: () => void
}) {
    const t = PULSE_TONE[tone]
    const Icon = tone === 'danger' ? AlertOctagon : AlertTriangle
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            className={cn(
                'eva-press flex min-w-0 flex-1 cursor-pointer flex-col gap-[5px] rounded-card border-[1.5px] px-3.5 py-[13px] text-left transition-colors',
                selected ? cn(t.solid, t.border) : cn(t.bg, 'border-subtle')
            )}
        >
            <div className="flex items-center justify-between">
                <span
                    className={cn(
                        'inline-flex items-center gap-1.5 text-[11.5px] font-black tracking-[0.02em]',
                        selected ? 'text-white/95' : t.fg
                    )}
                >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                </span>
                {value > 0 && (
                    <ArrowRight className={cn('h-[15px] w-[15px]', selected ? 'text-white' : t.fg)} />
                )}
            </div>
            <div
                className={cn(
                    'font-display text-[30px] font-black leading-none',
                    selected ? 'text-white' : value > 0 ? t.fg : 'text-subtle'
                )}
            >
                <AnimatedNumber value={value} />
            </div>
            <div className={cn('text-[11px] font-semibold', selected ? 'text-white/80' : 'text-muted')}>
                {hint}
            </div>
        </button>
    )
}

// ===== DirMetricChip · métrica secundaria =====
function DirMetricChip({
    label,
    value,
    suffix,
    fg,
    selected,
    onClick,
}: {
    label: string
    value: number
    suffix?: string
    fg?: string
    selected?: boolean
    onClick?: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            className={cn(
                'flex min-w-0 flex-col gap-px rounded-[var(--radius-md)] border-[1.5px] px-[7px] py-2 text-left',
                onClick ? 'eva-press cursor-pointer' : 'cursor-default',
                selected ? 'border-strong bg-[var(--text-strong)]' : 'border-subtle bg-surface-card'
            )}
        >
            <div
                className={cn('font-display text-[15.5px] font-black leading-none', selected && 'text-white')}
                style={!selected && fg ? { color: fg } : undefined}
            >
                <AnimatedNumber value={value} />
                {suffix || ''}
            </div>
            <div
                className={cn(
                    'truncate text-[9.5px] font-semibold',
                    selected ? 'text-white/70' : 'text-muted'
                )}
            >
                {label}
            </div>
        </button>
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
    const [resumenOpen, setResumenOpen] = useState(true)

    // Persisted collapse state for the mobile "Resumen · hoy" pulse.
    useEffect(() => {
        try {
            setResumenOpen(localStorage.getItem('eva.dir.resumenOpen') !== '0')
        } catch {
            /* ignore */
        }
    }, [])
    const toggleResumen = () => {
        setResumenOpen((o) => {
            const v = !o
            try {
                localStorage.setItem('eva.dir.resumenOpen', v ? '1' : '0')
            } catch {
                /* ignore */
            }
            return v
        })
    }

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

    const allClear = activeFilter === 'all'

    const showCheckinBanner = noCheckin1m > 0 && urgentCount === 0
    const hasBanners =
        urgentCount > 0 ||
        expiredProgramsCount > 0 ||
        pendingPassword > 0 ||
        nutritionLowCount > 0 ||
        showCheckinBanner

    return (
        <>
            {/* ===================== MÓVIL (md:hidden) ===================== */}
            {/* Header limpio estilo TopBar del diseño: subtítulo "seguimiento de hoy" + título
                "Alumnos", sin el h1 ruidoso ni la línea de "actualizado · sync". Acciones a la
                derecha (copiar portal + nuevo alumno) como en la barra de acción del diseño. */}
            <div className="space-y-4 md:hidden">
                <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted">
                            Tu seguimiento de hoy
                        </div>
                        <h1 className="font-display text-[26px] font-black leading-[1.1] tracking-[-0.03em] text-strong">
                            Alumnos
                        </h1>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        {loginUrl && (
                            <IconButton
                                size="sm"
                                variant="soft"
                                aria-label="Copiar portal de alumnos"
                                icon={copied ? <Check /> : <LinkIcon />}
                                onClick={handleCopy}
                            />
                        )}
                        <IconButton
                            size="sm"
                            variant="soft"
                            aria-label="Importar alumnos"
                            icon={<FileUp />}
                            onClick={() => router.push('/coach/clients/import')}
                        />
                    </div>
                </div>

                {/* ===== Herramientas / Módulos (entrada tool-first, arriba del directorio) ===== */}
                <Link
                    href="/coach/tools"
                    className="eva-press flex w-full items-center gap-3 rounded-card border border-subtle bg-surface-card px-[13px] py-[11px] text-left shadow-[var(--shadow-xs)]"
                >
                    <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-sport-100 text-sport-600">
                        <LayoutGrid className="h-[19px] w-[19px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-strong">Herramientas</span>
                        <span className="block truncate text-[11.5px] text-muted">
                            Cardio · Movimiento · Composición
                        </span>
                    </span>
                    <ChevronRight className="h-[18px] w-[18px] shrink-0 text-[var(--ink-300)]" />
                </Link>

                {/* ===== Resumen · hoy — pulso colapsable ===== */}
                <div className="relative z-10">
                    <button
                        type="button"
                        onClick={toggleResumen}
                        className="flex w-full items-center gap-2.5 px-0.5 pb-2 pt-0.5 text-left"
                    >
                        <span className="shrink-0 text-[11px] font-black uppercase tracking-[0.08em] text-subtle">
                            Resumen · hoy
                        </span>
                        {!resumenOpen && (
                            <span className="min-w-0 flex-1 truncate text-xs text-muted">
                                {active} activos
                                {urgentCount > 0 && (
                                    <span className="font-bold text-[var(--danger-600)]"> · {urgentCount} en riesgo</span>
                                )}{' '}
                                · {avgAdherence}% adher.
                            </span>
                        )}
                        <ChevronDown
                            className={cn(
                                'h-[18px] w-[18px] shrink-0 text-subtle transition-transform',
                                resumenOpen ? 'ml-auto rotate-180' : 'ml-0'
                            )}
                        />
                    </button>

                    {resumenOpen && (
                        <div className="animate-fade-in space-y-2">
                            {/* Pulso de prioridad — 2 números jerárquicos */}
                            <div className="flex gap-2">
                                <DirPulseCard
                                    tone="danger"
                                    label="Riesgo"
                                    value={urgentCount}
                                    hint={
                                        urgentCount
                                            ? urgentCount === 1
                                                ? 'Necesita atención hoy'
                                                : 'Necesitan atención hoy'
                                            : 'Todo en orden'
                                    }
                                    selected={activeFilter === 'urgent'}
                                    onClick={() => onFilterChange(activeFilter === 'urgent' ? 'all' : 'urgent')}
                                />
                                <DirPulseCard
                                    tone="warning"
                                    label="Atención"
                                    value={reviewCount}
                                    hint={reviewCount ? 'Para revisar pronto' : 'Sin pendientes'}
                                    selected={activeFilter === 'review'}
                                    onClick={() => onFilterChange(activeFilter === 'review' ? 'all' : 'review')}
                                />
                            </div>
                            {/* Métricas secundarias — grilla de 4 (sin scroll) */}
                            <div className="grid grid-cols-4 gap-1.5">
                                <DirMetricChip
                                    label="Total"
                                    value={total}
                                    fg="var(--text-strong)"
                                    selected={allClear}
                                    onClick={() => onFilterChange('all')}
                                />
                                <DirMetricChip
                                    label="Activos"
                                    value={active}
                                    fg="var(--sport-600)"
                                />
                                <DirMetricChip label="Adher." value={avgAdherence} suffix="%" fg="var(--text-strong)" />
                                <DirMetricChip
                                    label="Nutri."
                                    value={nutritionLowCount}
                                    fg="var(--ember-700)"
                                    selected={activeFilter === 'nutrition_low'}
                                    onClick={() =>
                                        onFilterChange(activeFilter === 'nutrition_low' ? 'all' : 'nutrition_low')
                                    }
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* ===== Señales accionables (banners) ===== */}
                {hasBanners && (
                    <div className="relative z-10 space-y-2.5">
                        {urgentCount > 0 && (
                            <DirBanner
                                tone="danger"
                                icon={<AlertOctagon className="h-[17px] w-[17px]" />}
                                onView={() => onFilterChange('urgent')}
                            >
                                {urgentCount} cliente{urgentCount !== 1 ? 's' : ''} con atención urgente
                                (score ≥ 50)
                            </DirBanner>
                        )}

                        {expiredProgramsCount > 0 && (
                            <DirBanner
                                tone="warning"
                                icon={<AlertTriangle className="h-[17px] w-[17px]" />}
                                onView={() => onFilterChange('expired_program')}
                            >
                                {expiredProgramsCount} programa
                                {expiredProgramsCount !== 1 ? 's' : ''} vencido
                                {expiredProgramsCount !== 1 ? 's' : ''}
                            </DirBanner>
                        )}

                        {pendingPassword > 0 && (
                            <DirBanner
                                tone="info"
                                icon={<KeyRound className="h-[17px] w-[17px]" />}
                                onView={() => onFilterChange('password_reset')}
                            >
                                {pendingPassword} alumno{pendingPassword !== 1 ? 's' : ''} con cambio de
                                contraseña pendiente
                            </DirBanner>
                        )}

                        {nutritionLowCount > 0 && (
                            <DirBanner
                                tone="ember"
                                icon={<Apple className="h-[17px] w-[17px]" />}
                                onView={() => onFilterChange('nutrition_low')}
                            >
                                {nutritionLowCount} alumno{nutritionLowCount !== 1 ? 's' : ''} con
                                cumplimiento nutricional bajo ({'<'}60%)
                            </DirBanner>
                        )}

                        {showCheckinBanner && (
                            <DirBanner
                                tone="warning"
                                icon={<AlertTriangle className="h-[17px] w-[17px]" />}
                                onView={() => onFilterChange('urgent')}
                            >
                                ALERTA: {noCheckin1m} cliente{noCheckin1m !== 1 ? 's' : ''} llevan mas de 1
                                mes sin check-in (desde el ultimo registrado)
                            </DirBanner>
                        )}
                    </div>
                )}
            </div>

            {/* ===================== DESKTOP (md+) ===================== */}
            {/* Header rico — solo aparece en el modo Tabla de escritorio (en Ficha el shell oculta
                todo el war-room). Se conserva intacto para no regresar la vista desktop. */}
            <div className="relative hidden flex-col gap-6 md:flex md:flex-row md:items-end md:justify-between">
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
                        Tu seguimiento de hoy · gestión centralizada de la cartera
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

            <CreateClientModal open={open} onClose={() => setOpen(false)} />
        </>
    )
}
