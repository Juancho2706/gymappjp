'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    type LucideIcon,
    Users,
    TriangleAlert,
    Activity,
    Flame,
    Upload,
    Plus,
    ArrowRight,
    ChevronRight,
    Dumbbell,
} from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { CreateClientModal } from '../../clients/CreateClientModal'
import { EvaCountUp } from './EvaCountUp'
import { todayLabel, flagLabel } from '../_lib/dashboard-design'
import type { DashboardV2Data, ExpiringProgramItem, ActivityItemClient } from '../_data/types'

interface Props {
    data: DashboardV2Data
    coachName: string
    onAdherence: () => void
}

type KpiTone = 'sport' | 'danger' | 'success' | 'ember'

const TONE_ICON: Record<KpiTone, string> = {
    sport: 'bg-[var(--sport-100)] text-[var(--sport-600)]',
    danger: 'bg-[var(--danger-100)] text-[var(--danger-600)]',
    success: 'bg-[var(--success-100)] text-[var(--success-700)]',
    ember: 'bg-[var(--ember-100)] text-[var(--ember-600)]',
}

/** Saludo según la hora (verbatim de desktop-coach.jsx greeting). */
function greeting(): string {
    const h = new Date().getHours()
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

/** Etiqueta de día relativa (Hoy / Ayer / "5 jun") para la actividad reciente. */
function dayLabel(iso: string): string {
    const startOf = (d: Date) =>
        new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const diff = Math.round((startOf(new Date()) - startOf(new Date(iso))) / 86400000)
    if (diff <= 0) return 'Hoy'
    if (diff === 1) return 'Ayer'
    return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

/**
 * Desktop coach dashboard — bento layout de desktop-coach.jsx (.dt-* de index.html):
 * header con fecha + saludo time-aware e Importar/Nuevo alumno, fila de 4 KPIs, y una
 * grilla 1.5fr/1fr con la card oscura "Prioridad de hoy" (warroom) a la izquierda y
 * "Programas activos" + "Actividad reciente" apiladas a la derecha. md+; el stack
 * móvil maneja anchos angostos.
 */
export function DesktopBento({ data, coachName, onAdherence }: Props) {
    const router = useRouter()
    const [createOpen, setCreateOpen] = useState(false)
    const firstName = coachName?.split(' ')[0] || 'Coach'

    const todayKey = (() => {
        const d = new Date()
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
    })()
    const sessionsToday = data.areaData.find((p) => p.name === todayKey)?.sesiones ?? 0

    const kpis: {
        key: string
        label: string
        value: number
        suffix?: string
        icon: LucideIcon
        tone: KpiTone
        delta: string
        onClick: () => void
    }[] = [
        {
            key: 'alumnos',
            label: 'Alumnos',
            value: data.kpi.totalClients,
            icon: Users,
            tone: 'sport',
            delta: '+1 esta semana',
            onClick: () => router.push('/coach/clients'),
        },
        {
            key: 'riesgo',
            label: 'En riesgo',
            value: data.kpi.riskCount,
            icon: TriangleAlert,
            tone: 'danger',
            delta: 'requieren revisión',
            onClick: () => router.push('/coach/clients?filter=risk'),
        },
        {
            key: 'adherencia',
            label: 'Adherencia',
            value: data.kpi.avgAdherence,
            suffix: '%',
            icon: Activity,
            tone: 'success',
            delta: '+3 vs. semana previa',
            onClick: onAdherence,
        },
        {
            key: 'sesiones',
            label: 'Sesiones hoy',
            value: sessionsToday,
            icon: Flame,
            tone: 'ember',
            delta: 'registradas',
            onClick: () => router.push('/coach/clients'),
        },
    ]

    const risk = data.topRiskClients
    const workoutActs = data.recentActivities.filter((a) => a.type === 'workout').slice(0, 5)

    return (
        <div>
            {/* Header */}
            <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
                <div>
                    <div className="text-xs font-bold capitalize tracking-[0.03em] text-[var(--text-muted)]">
                        {todayLabel()}
                    </div>
                    <h1 className="mt-[3px] font-display text-[30px] font-black tracking-[-0.03em] text-[var(--text-strong)]">
                        {greeting()}, {firstName}
                    </h1>
                </div>
                <div className="flex gap-2.5">
                    <button
                        type="button"
                        onClick={() => router.push('/coach/clients')}
                        className="eva-press inline-flex h-12 items-center justify-center gap-2 rounded-control border-[1.5px] border-[var(--border-default)] bg-surface-card px-[18px] font-ui text-[15px] font-bold leading-none tracking-[-0.01em] text-[var(--text-strong)]"
                    >
                        <Upload className="size-[17px]" /> Importar
                    </button>
                    <button
                        type="button"
                        onClick={() => setCreateOpen(true)}
                        className="eva-press inline-flex h-12 items-center justify-center gap-2 rounded-control border-[1.5px] border-transparent bg-[var(--cta-fill)] px-[18px] font-ui text-[15px] font-bold leading-none tracking-[-0.01em] text-[var(--text-on-sport)] shadow-[var(--glow-sport)]"
                    >
                        <Plus className="size-[17px]" /> Nuevo alumno
                    </button>
                </div>
            </div>

            {/* KPIs */}
            <div className="mb-5 grid grid-cols-2 gap-4 min-[1000px]:grid-cols-4">
                {kpis.map((k) => {
                    const Icon = k.icon
                    return (
                        <button
                            key={k.key}
                            type="button"
                            onClick={k.onClick}
                            className="rounded-card border border-border-subtle bg-surface-card px-[18px] py-4 text-left shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]"
                        >
                            <div className="mb-2.5 flex items-center gap-2">
                                <span
                                    className={`flex size-[30px] shrink-0 items-center justify-center rounded-[10px] ${TONE_ICON[k.tone]}`}
                                >
                                    <Icon className="size-[17px]" />
                                </span>
                                <span className="whitespace-nowrap text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--text-subtle)]">
                                    {k.label}
                                </span>
                            </div>
                            <div className="font-display text-[34px] font-extrabold leading-none tabular-nums tracking-[-0.01em] text-[var(--text-strong)]">
                                <EvaCountUp value={k.value} suffix={k.suffix} />
                            </div>
                            <div className="mt-[7px] text-xs font-semibold text-[var(--text-muted)]">
                                {k.delta}
                            </div>
                        </button>
                    )
                })}
            </div>

            {/* Bento grid */}
            <div className="grid grid-cols-1 items-start gap-5 min-[1000px]:grid-cols-[1.5fr_1fr]">
                {/* Card oscura — Prioridad de hoy (warroom) */}
                <div className="overflow-hidden rounded-card bg-[var(--ink-950)] shadow-[var(--shadow-sm)]">
                    <div className="flex items-center justify-between gap-3 px-[18px] py-4">
                        <div>
                            <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-sport-400">
                                Prioridad de hoy
                            </div>
                            <div className="mt-0.5 font-display text-[19px] font-extrabold tracking-[-0.02em] text-white">
                                {risk.length}{' '}
                                {risk.length === 1 ? 'alumno necesita' : 'alumnos necesitan'} tu
                                atención
                            </div>
                        </div>
                        <Link
                            href="/coach/clients?filter=risk"
                            className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-white/10 px-3 py-[7px] font-ui text-[12.5px] font-bold text-white transition-colors hover:bg-white/[0.18]"
                        >
                            Ver todos <ArrowRight className="size-3.5" />
                        </Link>
                    </div>
                    <div className="flex flex-col pb-1.5">
                        {risk.length === 0 ? (
                            <div className="px-[18px] pb-4 text-[13px] text-white/60">
                                Ningún alumno en riesgo. Todo al día.
                            </div>
                        ) : (
                            risk.slice(0, 5).map((s) => {
                                const high = s.attentionScore >= 80
                                return (
                                    <Link
                                        key={s.clientId}
                                        href={`/coach/clients/${s.clientId}`}
                                        className="flex w-full items-center gap-3 border-t border-white/[0.07] px-[18px] py-3 text-left transition-colors hover:bg-white/5"
                                    >
                                        <Avatar name={s.clientName} size="sm" />
                                        <span className="flex min-w-0 flex-1 flex-col gap-px">
                                            <span className="truncate text-sm font-bold text-white">
                                                {s.clientName}
                                            </span>
                                            <span className="truncate text-xs text-white/60">
                                                {flagLabel(s.flags[0])}
                                            </span>
                                        </span>
                                        <Badge
                                            tone={high ? 'danger' : 'warning'}
                                            variant="soft"
                                            size="sm"
                                        >
                                            {high ? 'En riesgo' : 'Atrasada'}
                                        </Badge>
                                        <ChevronRight className="size-4 shrink-0 text-white/40" />
                                    </Link>
                                )
                            })
                        )}
                    </div>
                </div>

                {/* Columna derecha — Programas activos + Actividad reciente */}
                <div className="flex min-w-0 flex-col gap-5">
                    <ActiveProgramsCard items={data.expiringPrograms} />
                    <RecentActivityCard items={workoutActs} />
                </div>
            </div>

            <CreateClientModal open={createOpen} onClose={() => setCreateOpen(false)} />
        </div>
    )
}

/**
 * "Programas activos · Ver todos" — lista de programas. La pipeline real no expone
 * focus/días/semanas/conteo de un programa, así que el subtítulo se deriva del
 * vencimiento (placeholder) para igualar el diseño dt-progrow.
 */
function ActiveProgramsCard({ items }: { items: ExpiringProgramItem[] }) {
    const rows = items.slice(0, 4)
    return (
        <div className="overflow-hidden rounded-card border border-border-subtle bg-surface-card shadow-[var(--shadow-sm)]">
            <div className="flex items-center justify-between gap-3 px-[18px] py-4">
                <span className="font-display text-base font-extrabold tracking-[-0.01em] text-[var(--text-strong)]">
                    Programas activos
                </span>
                <Link
                    href="/coach/workout-programs"
                    className="text-[13px] font-bold text-[var(--sport-600)]"
                >
                    Ver todos
                </Link>
            </div>
            <div className="px-3 pb-3 pt-1.5">
                {rows.length === 0 ? (
                    <p className="px-1.5 py-4 text-[13px] text-[var(--text-muted)]">
                        Sin programas por vencer.
                    </p>
                ) : (
                    rows.map((p) => {
                        const expired = p.daysLeft <= 0
                        return (
                            <Link
                                key={p.id}
                                href={p.clientId ? `/coach/clients/${p.clientId}` : '/coach/workout-programs'}
                                className="flex w-full items-center gap-[11px] rounded-control px-1.5 py-[9px] text-left transition-colors hover:bg-surface-sunken"
                            >
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--sport-100)] text-[var(--sport-600)]">
                                    <Dumbbell className="size-4" />
                                </span>
                                <span className="flex min-w-0 flex-1 flex-col gap-px">
                                    <span className="truncate text-[13.5px] font-bold text-[var(--text-strong)]">
                                        {p.name}
                                    </span>
                                    <span className="truncate text-[11.5px] text-[var(--text-subtle)]">
                                        {p.clientName ?? 'Sin asignar'} ·{' '}
                                        {expired
                                            ? 'Vencido'
                                            : `Vence en ${p.daysLeft} ${p.daysLeft === 1 ? 'día' : 'días'}`}
                                    </span>
                                </span>
                                <span className="shrink-0 rounded-pill bg-surface-sunken px-[9px] py-[3px] text-xs font-bold text-[var(--text-muted)]">
                                    1
                                </span>
                            </Link>
                        )
                    })
                )}
            </div>
        </div>
    )
}

/**
 * "Actividad reciente" — filas de quién completó su sesión + día relativo (Hoy/Ayer).
 * Estructura dt-actrow de desktop-coach.jsx, alimentada con los workouts recientes.
 */
function RecentActivityCard({ items }: { items: ActivityItemClient[] }) {
    return (
        <div className="overflow-hidden rounded-card border border-border-subtle bg-surface-card shadow-[var(--shadow-sm)]">
            <div className="flex items-center justify-between gap-3 px-[18px] py-4">
                <span className="font-display text-base font-extrabold tracking-[-0.01em] text-[var(--text-strong)]">
                    Actividad reciente
                </span>
            </div>
            <div className="px-3 pb-3 pt-1.5">
                {items.length === 0 ? (
                    <p className="px-1.5 py-4 text-[13px] text-[var(--text-muted)]">
                        Sin sesiones recientes.
                    </p>
                ) : (
                    items.map((a) => {
                        const name = a.title.replace(/\s*completó una sesión$/i, '')
                        return (
                            <Link
                                key={a.id}
                                href={a.href}
                                className="flex items-center gap-2.5 rounded-control px-1.5 py-2 transition-colors hover:bg-surface-sunken"
                            >
                                <Avatar name={name} size="xs" />
                                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-muted)]">
                                    <span className="font-bold text-[var(--text-strong)]">{name}</span>{' '}
                                    completó su sesión
                                </span>
                                <span className="shrink-0 text-[11.5px] text-[var(--text-subtle)]">
                                    {dayLabel(a.date)}
                                </span>
                            </Link>
                        )
                    })
                )}
            </div>
        </div>
    )
}
