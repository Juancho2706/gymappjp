'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Activity, UserPlus, Dumbbell, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { ListRow } from '@/components/ui/list-row'
import type { ActivityItemClient } from '../../_data/types'

const TYPE_ICON = {
    'nuevo alumno': UserPlus,
    'check-in': CheckCircle,
    workout: Dumbbell,
} as const

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

export function ActivityFeed({ items }: { items: ActivityItemClient[] }) {
    return (
        <Card padding="none">
            <header className="flex items-center gap-2 px-4 pb-1 pt-4">
                <Activity className="size-4 text-sport-500" />
                <h2 className="font-display text-lg font-black tracking-[-0.02em] text-[var(--text-strong)]">
                    Actividad reciente
                </h2>
            </header>

            {items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">Sin actividad reciente.</p>
            ) : (
                <div className="flex flex-col px-2 pb-2">
                    {items.map((it, i) => {
                        const Icon = TYPE_ICON[it.type] ?? Activity
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
                                        <span className="text-xs text-[var(--text-muted)]">{timeAgo(it.date)}</span>
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
