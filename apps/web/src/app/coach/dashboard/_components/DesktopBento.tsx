'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { type LucideIcon, Users, TriangleAlert, Activity, Flame, Upload, Plus } from 'lucide-react'
import { CreateClientModal } from '../../clients/CreateClientModal'
import { PriorityCard } from './PriorityCard'
import { AgendaCard } from './AgendaCard'
import { NewsFeed } from './NewsFeed'
import { EvaCountUp } from './EvaCountUp'
import { todayLabel } from '../_lib/dashboard-design'
import type { DashboardV2Data } from '../_data/types'

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

/**
 * Desktop coach dashboard — bento layout from desktop-coach.jsx (.dt-* of
 * index.html): date+greeting header with Importar/Nuevo alumno, a 4-KPI row, then
 * a 1.5fr/1fr grid with the dark Prioridad de hoy on the left and Agenda + Novedades
 * stacked on the right. Rendered at md+; the mobile stack handles narrow widths.
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
            delta: 'activos',
            onClick: () => router.push('/coach/clients'),
        },
        {
            key: 'riesgo',
            label: 'En riesgo',
            value: data.kpi.riskCount,
            icon: TriangleAlert,
            tone: 'danger',
            delta: data.kpi.riskCount > 0 ? 'requieren revisión' : 'todo al día',
            onClick: () => router.push('/coach/clients?filter=risk'),
        },
        {
            key: 'adherencia',
            label: 'Adherencia',
            value: data.kpi.avgAdherence,
            suffix: '%',
            icon: Activity,
            tone: 'success',
            delta: `Nutrición ${data.kpi.avgNutrition}%`,
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

    return (
        <div>
            {/* Header */}
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <div className="text-xs font-bold capitalize tracking-[0.03em] text-[var(--text-muted)]">
                        {todayLabel()}
                    </div>
                    <h1 className="mt-0.5 font-display text-[30px] font-black tracking-[-0.03em] text-[var(--text-strong)]">
                        Hola, {firstName}
                    </h1>
                </div>
                <div className="flex gap-2.5">
                    <button
                        type="button"
                        onClick={() => router.push('/coach/clients')}
                        className="inline-flex items-center gap-2 rounded-control border border-border-subtle bg-surface-card px-4 py-2.5 text-sm font-bold text-[var(--text-body)] shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--border-default)]"
                    >
                        <Upload className="size-[17px]" /> Importar
                    </button>
                    <button
                        type="button"
                        onClick={() => setCreateOpen(true)}
                        className="inline-flex items-center gap-2 rounded-control bg-sport-500 px-4 py-2.5 text-sm font-bold text-[var(--text-on-sport)] shadow-[var(--glow-sport)] transition-transform hover:-translate-y-0.5"
                    >
                        <Plus className="size-[17px]" /> Nuevo alumno
                    </button>
                </div>
            </div>

            {/* KPIs */}
            <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
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
                                    className={`flex size-[30px] shrink-0 items-center justify-center rounded-control ${TONE_ICON[k.tone]}`}
                                >
                                    <Icon className="size-[17px]" />
                                </span>
                                <span className="whitespace-nowrap text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--text-subtle)]">
                                    {k.label}
                                </span>
                            </div>
                            <div className="font-display text-[34px] font-black leading-none tabular-nums text-[var(--text-strong)]">
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
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.5fr_1fr]">
                <PriorityCard items={data.topRiskClients} />
                <div className="flex min-w-0 flex-col gap-5">
                    <AgendaCard items={data.agenda} />
                    <NewsFeed expiring={data.expiringPrograms} activities={data.recentActivities} />
                </div>
            </div>

            <CreateClientModal open={createOpen} onClose={() => setCreateOpen(false)} />
        </div>
    )
}
