'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { type LucideIcon, CalendarClock, UserPlus, CheckCircle, Dumbbell, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ExpiringProgramItem, ActivityItemClient } from '../_data/types'

const ACT_ICON: Record<ActivityItemClient['type'], LucideIcon> = {
    'nuevo alumno': UserPlus,
    'check-in': CheckCircle,
    workout: Dumbbell,
}
// [bg, fg] tones — matches the design actTone (sport / success / ember).
const ACT_TONE: Record<ActivityItemClient['type'], [string, string]> = {
    'nuevo alumno': ['var(--sport-100)', 'var(--sport-600)'],
    'check-in': ['var(--success-100)', 'var(--success-600)'],
    workout: ['var(--ember-100)', 'var(--ember-700)'],
}

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'ahora'
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h`
    return `${Math.floor(hrs / 24)}d`
}

type CheckinFilter = 'todos' | 'pendientes' | 'revisados'

type FeedItem =
    | { type: 'program'; data: ExpiringProgramItem }
    | { type: 'activity'; data: ActivityItemClient }

/**
 * "Novedades" — programs about to expire + recent client activity, combined into a
 * single card. Sobre esta lista vive la COLA DE CHECK-INS del coach (specs/checkins-revisado):
 * un badge de "por revisar", una senal por fila (revisado / pendiente) y un filtro
 * segmentado que acota el feed a los check-ins de un estado. El filtro es client-side y
 * SOLO opera sobre items `check-in` (concepto distinto de la adherencia "alumno sin check-in >30d").
 */
export function NewsFeed({
    expiring,
    activities,
    pendingCheckins = 0,
}: {
    expiring: ExpiringProgramItem[]
    activities: ActivityItemClient[]
    /** Check-ins recientes sin revisar (ventana del feed) — para el badge "por revisar". */
    pendingCheckins?: number
}) {
    const [filter, setFilter] = useState<CheckinFilter>('todos')

    const hasCheckins = useMemo(
        () => activities.some((a) => a.type === 'check-in'),
        [activities]
    )

    const feed: FeedItem[] = useMemo(() => {
        // Estados de cola: solo los check-ins del estado elegido (queue enfocada).
        if (filter === 'pendientes' || filter === 'revisados') {
            const wantReviewed = filter === 'revisados'
            return activities
                .filter((a) => a.type === 'check-in' && Boolean(a.reviewed) === wantReviewed)
                .map((a) => ({ type: 'activity' as const, data: a }))
        }
        // "Todos": novedades completas (programas + toda la actividad).
        return [
            ...expiring.map((p) => ({ type: 'program' as const, data: p })),
            ...activities.map((a) => ({ type: 'activity' as const, data: a })),
        ]
    }, [filter, expiring, activities])

    const emptyCopy =
        filter === 'pendientes'
            ? 'Todo al día. Sin check-ins por revisar.'
            : filter === 'revisados'
            ? 'Aún no marcas check-ins como revisados.'
            : 'Sin novedades por ahora.'

    return (
        <div>
            <div className="mx-0 mb-2.5 mt-1 flex items-baseline justify-between gap-3">
                <div className="flex items-center gap-2">
                    <h2 className="font-display text-[17px] font-extrabold tracking-[-0.02em] text-[var(--text-strong)]">
                        Novedades
                    </h2>
                    {pendingCheckins > 0 && (
                        <Badge
                            tone="ember"
                            variant="soft"
                            size="sm"
                            aria-label={`${pendingCheckins} check-ins por revisar`}
                        >
                            {pendingCheckins > 9 ? '9+' : pendingCheckins} por revisar
                        </Badge>
                    )}
                </div>
            </div>

            {hasCheckins && (
                <div
                    role="tablist"
                    aria-label="Filtrar check-ins"
                    className="mb-2.5 inline-flex items-center gap-1 rounded-pill bg-[var(--surface-sunken)] p-1"
                >
                    {(
                        [
                            { key: 'todos', label: 'Todos' },
                            { key: 'pendientes', label: 'Por revisar' },
                            { key: 'revisados', label: 'Revisados' },
                        ] as { key: CheckinFilter; label: string }[]
                    ).map((opt) => {
                        const active = filter === opt.key
                        return (
                            <button
                                key={opt.key}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                onClick={() => setFilter(opt.key)}
                                className={cn(
                                    'eva-press rounded-pill px-3 py-1.5 font-ui text-[12px] font-bold leading-none tracking-[-0.01em] transition-colors',
                                    active
                                        ? 'bg-surface-card text-[var(--text-strong)] shadow-[var(--shadow-sm)]'
                                        : 'text-[var(--text-muted)] hover:text-[var(--text-body)]'
                                )}
                            >
                                {opt.label}
                            </button>
                        )
                    })}
                </div>
            )}

            <Card padding="none" className="gap-0 overflow-hidden">
                {feed.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                        {emptyCopy}
                    </p>
                ) : (
                    feed.map((it, i) => (
                        <div key={it.type === 'program' ? `p-${it.data.id}` : `a-${it.data.id}`}>
                            {i > 0 && <div className="mx-3.5 h-px bg-[var(--border-subtle)]" />}
                            {it.type === 'program' ? (
                                <ProgramRow item={it.data} />
                            ) : (
                                <ActivityRow item={it.data} />
                            )}
                        </div>
                    ))
                )}
            </Card>
        </div>
    )
}

function ProgramRow({ item }: { item: ExpiringProgramItem }) {
    const expired = item.daysLeft <= 0
    const urgent = expired || item.daysLeft <= 2
    return (
        <Link
            href={item.clientId ? `/coach/clients/${item.clientId}` : '/coach/workout-programs'}
            className="flex cursor-pointer items-center gap-3 px-3.5 py-[11px] transition-colors hover:bg-surface-sunken"
        >
            <span
                className="flex size-[34px] shrink-0 items-center justify-center rounded-full"
                style={{
                    background: urgent ? 'var(--danger-100)' : 'var(--warning-100)',
                    color: urgent ? 'var(--danger-600)' : 'var(--warning-600)',
                }}
            >
                <CalendarClock className="size-4" />
            </span>
            <div className="min-w-0 flex-1 text-[13.5px] text-[var(--text-body)]">
                Plan de <b className="text-[var(--text-strong)]">{item.clientName ?? 'alumno'}</b>{' '}
                {expired ? 'venció' : 'vence pronto'}
                <div className="truncate text-xs text-[var(--text-muted)]">{item.name}</div>
            </div>
            <Badge tone={urgent ? 'danger' : 'warning'} variant="soft" size="sm">
                {expired ? 'Vencido' : `${item.daysLeft} días`}
            </Badge>
        </Link>
    )
}

function ActivityRow({ item }: { item: ActivityItemClient }) {
    const Icon = ACT_ICON[item.type] ?? Activity
    const [bg, fg] = ACT_TONE[item.type] ?? ['var(--sport-100)', 'var(--sport-600)']
    const isCheckin = item.type === 'check-in'
    return (
        <Link
            href={item.href}
            className="flex cursor-pointer items-center gap-3 px-3.5 py-[11px] transition-colors hover:bg-surface-sunken"
        >
            {item.photoUrl ? (
                <Image
                    src={item.photoUrl}
                    alt=""
                    width={34}
                    height={34}
                    className="size-[34px] shrink-0 rounded-full object-cover"
                />
            ) : (
                <span
                    className="flex size-[34px] shrink-0 items-center justify-center rounded-full"
                    style={{ background: bg, color: fg }}
                >
                    <Icon className="size-4" />
                </span>
            )}
            <div className="min-w-0 flex-1 truncate text-[13.5px] text-[var(--text-body)]">
                {item.clientName && item.title.startsWith(item.clientName) ? (
                    <>
                        <b className="text-[var(--text-strong)]">{item.clientName}</b>
                        {item.title.slice(item.clientName.length)}
                    </>
                ) : (
                    <b className="text-[var(--text-strong)]">{item.title}</b>
                )}
            </div>
            {isCheckin &&
                (item.reviewed ? (
                    <CheckCircle
                        className="size-4 shrink-0 text-[var(--success-600)]"
                        aria-label="Revisado"
                    />
                ) : (
                    <span
                        className="size-2 shrink-0 rounded-full bg-[var(--ember-500)]"
                        role="img"
                        aria-label="Por revisar"
                    />
                ))}
            <span className="shrink-0 whitespace-nowrap text-[11.5px] text-[var(--text-subtle)]">
                {timeAgo(item.date)}
            </span>
        </Link>
    )
}
