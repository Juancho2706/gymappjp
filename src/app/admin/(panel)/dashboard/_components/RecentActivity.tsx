'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AdminStatusBadge } from '../../_components/AdminStatusBadge'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

interface Signup {
    id: string
    full_name: string | null
    brand_name: string | null
    created_at: string
    subscription_status: string | null
    subscription_tier: string | null
}

interface AuditEvent {
    id: string
    admin_email: string
    action: string
    target_table: string | null
    target_id: string | null
    created_at: string
}

interface Props {
    signups: Signup[]
    auditEvents: AuditEvent[]
}

const ACTION_LABELS: Record<string, string> = {
    'coach.update':         'Editó coach',
    'coach.suspend':        'Suspendió coach',
    'coach.force_expire':   'Expiró trial',
    'coach.reactivate':     'Reactivó coach',
    'coach.period_extend':  'Extendió período',
    'coach.period_end_update': 'Cambió vencimiento',
    'coach.tier_change':    'Cambió tier',
    'coach.delete':         'Eliminó coach',
    'client.update':        'Editó alumno',
    'client.delete':        'Eliminó alumno',
}

export function RecentActivity({ signups, auditEvents }: Props) {
    const [tab, setTab] = useState<'signups' | 'audit'>('signups')

    return (
        <div className="rounded-lg border border-[--admin-border] bg-[--admin-bg-surface]">
            {/* Tabs header */}
            <div className="flex items-center justify-between border-b border-[--admin-border] px-4 py-3">
                <div className="flex gap-1">
                    {(['signups', 'audit'] as const).map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                                tab === t
                                    ? 'bg-[--admin-accent]/15 text-[--admin-accent]'
                                    : 'text-[--admin-text-3] hover:text-[--admin-text-2]'
                            }`}
                        >
                            {t === 'signups' ? 'Signups recientes' : 'Auditoría reciente'}
                        </button>
                    ))}
                </div>
                <Link
                    href={tab === 'signups' ? '/admin/coaches' : '/admin/auditoria'}
                    className="text-[11px] text-[--admin-accent] hover:underline"
                >
                    Ver todos →
                </Link>
            </div>

            {/* Content */}
            <div className="divide-y divide-[--admin-border]">
                {tab === 'signups' && signups.map(coach => (
                    <div key={coach.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-[--admin-bg-elevated] transition-colors">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[--admin-text-1]">
                                {coach.brand_name || coach.full_name || 'Sin nombre'}
                            </p>
                            <p className="text-[11px] text-[--admin-text-3]">
                                {formatDistanceToNow(new Date(coach.created_at), { addSuffix: true, locale: es })}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {coach.subscription_tier && (
                                <AdminStatusBadge value={coach.subscription_tier} type="tier" />
                            )}
                            {coach.subscription_status && (
                                <AdminStatusBadge value={coach.subscription_status} />
                            )}
                        </div>
                    </div>
                ))}

                {tab === 'audit' && auditEvents.map(ev => (
                    <div key={ev.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-[--admin-bg-elevated] transition-colors">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-[--admin-text-1]">
                                {ACTION_LABELS[ev.action] ?? ev.action}
                            </p>
                            <p className="truncate font-mono text-[11px] text-[--admin-text-3]">
                                {ev.admin_email}
                            </p>
                        </div>
                        <p className="shrink-0 text-[11px] text-[--admin-text-3]">
                            {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true, locale: es })}
                        </p>
                    </div>
                ))}

                {tab === 'signups' && signups.length === 0 && (
                    <p className="px-4 py-6 text-center text-xs text-[--admin-text-3]">Sin signups recientes</p>
                )}
                {tab === 'audit' && auditEvents.length === 0 && (
                    <p className="px-4 py-6 text-center text-xs text-[--admin-text-3]">Sin actividad reciente</p>
                )}
            </div>
        </div>
    )
}
