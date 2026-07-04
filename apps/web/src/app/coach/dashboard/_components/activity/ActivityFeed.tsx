'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Activity, UserPlus, Dumbbell, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ListRow } from '@/components/ui/list-row'
import type { ActivityItemClient } from '../../_data/types'

const TYPE_ICON = {
    'nuevo alumno': UserPlus,
    'check-in': CheckCircle,
    workout: Dumbbell,
} as const

type CheckinFilter = 'todos' | 'pendientes' | 'revisados'

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'ahora'
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h`
    const days = Math.floor(hrs / 24)
    return `${days}d`
}

/**
 * Feed de actividad con cola de check-ins (specs/checkins-revisado): badge "por revisar",
 * senal por item (revisado / pendiente) y filtro segmentado client-side que SOLO acota los
 * items `check-in`. `pendingCheckins` es opcional; si no se pasa se deriva de `items`.
 */
export function ActivityFeed({
    items,
    pendingCheckins,
}: {
    items: ActivityItemClient[]
    pendingCheckins?: number
}) {
    const [filter, setFilter] = useState<CheckinFilter>('todos')

    const hasCheckins = useMemo(() => items.some((it) => it.type === 'check-in'), [items])
    const pendingCount =
        pendingCheckins ??
        items.filter((it) => it.type === 'check-in' && !it.reviewed).length

    const visible = useMemo(() => {
        if (filter === 'pendientes' || filter === 'revisados') {
            const wantReviewed = filter === 'revisados'
            return items.filter(
                (it) => it.type === 'check-in' && Boolean(it.reviewed) === wantReviewed
            )
        }
        return items
    }, [filter, items])

    const emptyCopy =
        filter === 'pendientes'
            ? 'Todo al día. Sin check-ins por revisar.'
            : filter === 'revisados'
            ? 'Aún no marcas check-ins como revisados.'
            : 'Sin actividad reciente.'

    return (
        <Card padding="none">
            <header className="flex items-center gap-2 px-4 pb-1 pt-4">
                <Activity className="size-4 text-sport-500" />
                <h2 className="font-display text-lg font-black tracking-[-0.02em] text-[var(--text-strong)]">
                    Actividad reciente
                </h2>
                {pendingCount > 0 && (
                    <Badge
                        tone="ember"
                        variant="soft"
                        size="sm"
                        className="ml-auto"
                        aria-label={`${pendingCount} check-ins por revisar`}
                    >
                        {pendingCount > 9 ? '9+' : pendingCount} por revisar
                    </Badge>
                )}
            </header>

            {hasCheckins && (
                <div
                    role="tablist"
                    aria-label="Filtrar check-ins"
                    className="mx-4 mb-1 mt-2 inline-flex w-fit items-center gap-1 rounded-pill bg-[var(--surface-sunken)] p-1"
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
                                    'rounded-pill px-3 py-1.5 font-ui text-[12px] font-bold leading-none tracking-[-0.01em] transition-colors',
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

            {visible.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">{emptyCopy}</p>
            ) : (
                <div className="flex flex-col px-2 pb-2">
                    {visible.map((it, i) => {
                        const Icon = TYPE_ICON[it.type] ?? Activity
                        const isCheckin = it.type === 'check-in'
                        return (
                            <Link
                                key={it.id}
                                href={it.href}
                                className={cn(
                                    'block rounded-control outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]',
                                    i > 0 && 'border-t border-border-subtle'
                                )}
                            >
                                <ListRow
                                    className="cursor-pointer rounded-none hover:bg-surface-sunken"
                                    leading={
                                        it.photoUrl ? (
                                            <Image
                                                src={it.photoUrl}
                                                alt=""
                                                width={32}
                                                height={32}
                                                className="size-8 rounded-full object-cover"
                                            />
                                        ) : (
                                            <span className="flex size-8 items-center justify-center rounded-full bg-[var(--sport-100)]">
                                                <Icon className="size-4 text-sport-500" />
                                            </span>
                                        )
                                    }
                                    title={it.title}
                                    subtitle={it.subtitle}
                                    trailing={
                                        <span className="flex items-center gap-2">
                                            {isCheckin &&
                                                (it.reviewed ? (
                                                    <CheckCircle
                                                        className="size-4 text-[var(--success-600)]"
                                                        aria-label="Revisado"
                                                    />
                                                ) : (
                                                    <span
                                                        className="size-2 rounded-full bg-[var(--ember-500)]"
                                                        role="img"
                                                        aria-label="Por revisar"
                                                    />
                                                ))}
                                            <span className="text-xs text-[var(--text-muted)]">
                                                {timeAgo(it.date)}
                                            </span>
                                        </span>
                                    }
                                />
                            </Link>
                        )
                    })}
                </div>
            )}
        </Card>
    )
}
