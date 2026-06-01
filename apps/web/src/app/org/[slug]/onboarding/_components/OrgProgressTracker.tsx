import Link from 'next/link'
import {
    ArrowRight,
    BarChart3,
    CheckCircle2,
    Circle,
    Megaphone,
    Palette,
    TrendingUp,
    Users,
    UserCheck,
    ClipboardList,
} from 'lucide-react'

interface Milestones {
    hasBrand: boolean
    hasActiveCoach: boolean
    hasAssignedClient: boolean
    hasAnnouncement: boolean
    hasExportedReport: boolean
    hasCheckIns: boolean
    healthScore: number
}

interface Props {
    orgSlug: string
    milestones: Milestones
}

interface MilestoneItem {
    key: keyof Milestones | 'health'
    label: string
    detail: string
    done: boolean
    href: string
    icon: React.ComponentType<{ className?: string }>
    priority: 'high' | 'medium' | 'low'
}

export function OrgProgressTracker({ orgSlug, milestones }: Props) {
    const base = `/org/${orgSlug}`

    const items: MilestoneItem[] = [
        {
            key: 'hasBrand',
            label: 'Configurar marca enterprise',
            detail: 'Logo, color primario y nombre visibles para coaches y alumnos.',
            done: milestones.hasBrand,
            href: `${base}/brand`,
            icon: Palette,
            priority: 'high',
        },
        {
            key: 'hasActiveCoach',
            label: 'Primer coach activo',
            detail: 'Al menos un coach enterprise ha aceptado su invitación.',
            done: milestones.hasActiveCoach,
            href: `${base}/coaches`,
            icon: Users,
            priority: 'high',
        },
        {
            key: 'hasAssignedClient',
            label: 'Primer alumno asignado',
            detail: 'Al menos un alumno tiene coach responsable en la organización.',
            done: milestones.hasAssignedClient,
            href: `${base}/assignments`,
            icon: UserCheck,
            priority: 'high',
        },
        {
            key: 'hasAnnouncement',
            label: 'Primera novedad publicada',
            detail: 'Un mensaje activo alcanza a coaches o alumnos enterprise.',
            done: milestones.hasAnnouncement,
            href: `${base}/announcements`,
            icon: Megaphone,
            priority: 'medium',
        },
        {
            key: 'hasCheckIns',
            label: 'Primeros check-ins recibidos',
            detail: 'Alumnos enviaron check-ins en los últimos 7 días.',
            done: milestones.hasCheckIns,
            href: `${base}/check-ins`,
            icon: ClipboardList,
            priority: 'medium',
        },
        {
            key: 'hasExportedReport',
            label: 'Primer reporte exportado',
            detail: 'CSV o PDF de reporte operacional generado al menos una vez.',
            done: milestones.hasExportedReport,
            href: `${base}/reports`,
            icon: BarChart3,
            priority: 'low',
        },
        {
            key: 'health',
            label: 'Salud operacional ≥ 70',
            detail: `Score actual: ${milestones.healthScore}/100. Meta: ≥ 70 para green tier.`,
            done: milestones.healthScore >= 70,
            href: `${base}`,
            icon: TrendingUp,
            priority: 'low',
        },
    ]

    const doneCount = items.filter(i => i.done).length
    const totalCount = items.length
    const pct = Math.round((doneCount / totalCount) * 100)
    const nextItem = items.find(i => !i.done)

    const tierColor = pct >= 80 ? 'text-emerald-300' : pct >= 50 ? 'text-amber-300' : 'text-red-300'
    const barColor = pct >= 80 ? 'bg-emerald-400' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'

    return (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Time-to-value</p>
                    <div className="mt-1 flex items-baseline gap-3">
                        <p className={`text-4xl font-black ${tierColor}`}>{pct}%</p>
                        <p className="text-sm text-zinc-500">{doneCount}/{totalCount} hitos completados</p>
                    </div>
                </div>
                {nextItem && (
                    <Link
                        href={nextItem.href}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-400/20 transition-colors"
                    >
                        Siguiente: {nextItem.label.slice(0, 28)}{nextItem.label.length > 28 ? '…' : ''}
                        <ArrowRight className="h-3 w-3" />
                    </Link>
                )}
            </div>

            {/* Progress bar */}
            <div className="mt-4 h-2 w-full rounded-full bg-zinc-800">
                <div
                    className={`h-2 rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${pct}%` }}
                />
            </div>

            {/* Milestone list */}
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {items.map(item => {
                    const Icon = item.icon
                    return (
                        <div
                            key={item.key}
                            className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                                item.done
                                    ? 'border-emerald-400/15 bg-emerald-400/5'
                                    : item.priority === 'high'
                                    ? 'border-amber-400/20 bg-amber-400/5'
                                    : 'border-zinc-800 bg-zinc-950/40'
                            }`}
                        >
                            <div className={`mt-0.5 shrink-0 ${item.done ? 'text-emerald-400' : 'text-zinc-500'}`}>
                                {item.done
                                    ? <CheckCircle2 className="h-4 w-4" />
                                    : <Circle className="h-4 w-4" />
                                }
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className={`text-sm font-bold ${item.done ? 'text-zinc-300 line-through decoration-zinc-600' : 'text-zinc-100'}`}>
                                    {item.label}
                                </p>
                                <p className="mt-0.5 text-xs leading-5 text-zinc-500">{item.detail}</p>
                            </div>
                            {!item.done && (
                                <Link
                                    href={item.href}
                                    className="shrink-0 self-center rounded-md p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                                    aria-label={`Ir a ${item.label}`}
                                >
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                            )}
                        </div>
                    )
                })}
            </div>

            {pct === 100 && (
                <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-300 shrink-0" />
                    <div>
                        <p className="text-sm font-black text-emerald-200">¡Organización configurada al 100%!</p>
                        <p className="text-xs text-emerald-300/70">Tu plataforma enterprise está lista para operación completa.</p>
                    </div>
                </div>
            )}
        </section>
    )
}
