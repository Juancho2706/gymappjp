'use client'

import Link from 'next/link'
import Image from 'next/image'
import { type LucideIcon, CalendarClock, UserPlus, CheckCircle, Dumbbell, Activity } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SectionTitle } from './SectionTitle'
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

type FeedItem =
    | { type: 'program'; data: ExpiringProgramItem }
    | { type: 'activity'; data: ActivityItemClient }

/**
 * "Novedades" — programs about to expire + recent client activity, combined into a
 * single card. Verbatim structure from coach-dashboard.jsx feed (expiringPrograms
 * mapped to program rows + coachActivity mapped to activity rows).
 */
export function NewsFeed({
    expiring,
    activities,
}: {
    expiring: ExpiringProgramItem[]
    activities: ActivityItemClient[]
}) {
    const feed: FeedItem[] = [
        ...expiring.map((p) => ({ type: 'program' as const, data: p })),
        ...activities.map((a) => ({ type: 'activity' as const, data: a })),
    ]

    return (
        <div>
            <SectionTitle>Novedades</SectionTitle>
            <Card padding="none" className="gap-0 overflow-hidden">
                {feed.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                        Sin novedades por ahora.
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
            className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-surface-sunken"
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
    return (
        <Link
            href={item.href}
            className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-surface-sunken"
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
                <b className="text-[var(--text-strong)]">{item.title}</b>
            </div>
            <span className="shrink-0 whitespace-nowrap text-[11.5px] text-[var(--text-subtle)]">
                {timeAgo(item.date)}
            </span>
        </Link>
    )
}
