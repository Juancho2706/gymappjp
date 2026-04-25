'use client'

import Link from 'next/link'
import { GlassCard } from '@/components/ui/glass-card'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'

interface Props {
    signups: {
        id: string
        full_name: string | null
        brand_name: string | null
        created_at: string
        subscription_status: string | null
        subscription_tier: string | null
    }[]
}

const statusColors: Record<string, string> = {
    active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    trialing: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    canceled: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    pending_payment: 'bg-red-500/20 text-red-400 border-red-500/30',
    expired: 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30',
    past_due: 'bg-red-500/20 text-red-400 border-red-500/30',
    paused: 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30',
}

export function RecentActivity({ signups }: Props) {
    return (
        <GlassCard className="p-4">
            <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-medium text-neutral-300">Coaches Recientes</h3>
                <Link href="/admin/coaches" className="text-xs text-blue-400 hover:text-blue-300">
                    Ver todos →
                </Link>
            </div>
            <div className="space-y-2">
                {signups.map((coach) => (
                    <div
                        key={coach.id}
                        className="flex items-center justify-between rounded-lg bg-neutral-900/40 px-3 py-2.5"
                    >
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-white">
                                {coach.brand_name || coach.full_name || 'Sin nombre'}
                            </p>
                            <p className="truncate text-xs text-neutral-500">{new Date(coach.created_at).toLocaleDateString('es-CL')}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {coach.subscription_tier && (
                                <span className="text-xs text-neutral-400 uppercase">
                                    {coach.subscription_tier}
                                </span>
                            )}
                            <Badge
                                variant="outline"
                                className={`text-xs capitalize ${statusColors[coach.subscription_status ?? ''] ?? 'bg-neutral-500/20 text-neutral-400'}`}
                            >
                                {coach.subscription_status}
                            </Badge>
                            <span className="text-xs text-neutral-600">
                                {formatDistanceToNow(new Date(coach.created_at), { addSuffix: true })}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </GlassCard>
    )
}
