'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Activity, UserPlus, Dumbbell, CheckCircle } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
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
        <GlassCard className="h-full">
            <div className="flex flex-col gap-4 p-5">
                <header className="flex items-center gap-2">
                    <Activity className="h-4 w-4" style={{ color: 'var(--theme-primary, #007AFF)' }} />
                    <h2 className="font-display text-lg font-bold tracking-tight">Actividad reciente</h2>
                </header>

                {items.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">Sin actividad reciente.</p>
                ) : (
                    <ul className="flex flex-col divide-y divide-border/50">
                        {items.map((it) => {
                            const Icon = TYPE_ICON[it.type] ?? Activity
                            return (
                                <li key={it.id}>
                                    <Link
                                        href={it.href}
                                        className="flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-lg transition-colors hover:bg-primary/5"
                                    >
                                        {it.photoUrl ? (
                                            <Image
                                                src={it.photoUrl}
                                                alt=""
                                                width={32}
                                                height={32}
                                                className="h-8 w-8 rounded-full object-cover"
                                            />
                                        ) : (
                                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                                                <Icon className="h-4 w-4" style={{ color: 'var(--theme-primary, #007AFF)' }} />
                                            </span>
                                        )}
                                        <div className="flex min-w-0 flex-1 flex-col">
                                            <span className="truncate text-sm font-medium">{it.title}</span>
                                            <span className="truncate text-xs text-muted-foreground">{it.subtitle}</span>
                                        </div>
                                        <span className="text-xs text-muted-foreground">{timeAgo(it.date)}</span>
                                    </Link>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>
        </GlassCard>
    )
}
