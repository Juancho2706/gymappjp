'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AdminStatusBadge } from '../../_components/AdminStatusBadge'
import { formatDistanceToNow, format, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { AlertTriangle } from 'lucide-react'

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

interface ExpiringSoon {
    id: string
    full_name: string | null
    brand_name: string | null
    current_period_end: string | null
    subscription_status: string | null
}

interface Props {
    signups: Signup[]
    auditEvents: AuditEvent[]
    expiringSoon: ExpiringSoon[]
}

const ACTION_LABELS: Record<string, string> = {
    'coach.create':         'Creó coach',
    'coach.update':         'Editó coach',
    'coach.suspend':        'Suspendió coach',
    'coach.force_expire':   'Expiró trial',
    'coach.reactivate':     'Reactivó coach',
    'coach.period_extend':  'Extendió período',
    'coach.period_end_update': 'Cambió vencimiento',
    'coach.tier_change':    'Cambió tier',
    'coach.delete':         'Eliminó coach',
    'client.create':        'Creó alumno',
    'client.update':        'Editó alumno',
    'client.delete':        'Eliminó alumno',
}

const TABS = ['signups', 'expiring', 'audit'] as const
type Tab = typeof TABS[number]

const TAB_LABELS: Record<Tab, string> = {
    signups: 'Signups',
    expiring: 'Vencimientos',
    audit: 'Auditoría',
}

const TAB_LINKS: Record<Tab, string> = {
    signups: '/admin/coaches',
    expiring: '/admin/coaches?sort=expiry&dir=asc',
    audit: '/admin/auditoria',
}

export function RecentActivity({ signups, auditEvents, expiringSoon }: Props) {
    const [tab, setTab] = useState<Tab>('signups')

    return (
        <div className="rounded-lg border border-[--admin-border] bg-[--admin-bg-surface]">
            {/* Tabs header */}
            <div className="flex items-center justify-between border-b border-[--admin-border] px-4 py-3">
                <div className="flex gap-1">
                    {TABS.map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`relative rounded px-3 py-1 text-xs font-medium transition-colors ${
                                tab === t
                                    ? 'bg-[--admin-accent]/15 text-[--admin-accent]'
                                    : 'text-[--admin-text-3] hover:text-[--admin-text-2]'
                            }`}
                        >
                            {TAB_LABELS[t]}
                            {t === 'expiring' && expiringSoon.length > 0 && (
                                <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[--admin-amber] px-1 text-[9px] font-bold text-black">
                                    {expiringSoon.length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
                <Link
                    href={TAB_LINKS[tab]}
                    className="text-[11px] text-[--admin-accent] hover:underline"
                >
                    Ver todos →
                </Link>
            </div>

            {/* Content */}
            <div className="divide-y divide-[--admin-border]">
                {tab === 'signups' && signups.map(coach => (
                    <Link
                        key={coach.id}
                        href={`/admin/coaches?q=${encodeURIComponent(coach.brand_name || coach.full_name || '')}`}
                        className="flex items-center justify-between px-4 py-2.5 hover:bg-[--admin-bg-elevated] transition-colors"
                    >
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
                    </Link>
                ))}

                {tab === 'expiring' && expiringSoon.map(coach => {
                    const daysLeft = coach.current_period_end
                        ? differenceInDays(new Date(coach.current_period_end), new Date())
                        : null
                    const color = daysLeft !== null && daysLeft <= 2
                        ? 'text-[--admin-red]'
                        : 'text-[--admin-amber]'

                    return (
                        <Link
                            key={coach.id}
                            href={`/admin/coaches?q=${encodeURIComponent(coach.brand_name || coach.full_name || '')}`}
                            className="flex items-center justify-between px-4 py-2.5 hover:bg-[--admin-bg-elevated] transition-colors"
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${color}`} />
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-[--admin-text-1]">
                                        {coach.brand_name || coach.full_name || 'Sin nombre'}
                                    </p>
                                    <p className="text-[11px] text-[--admin-text-3]">
                                        {coach.current_period_end
                                            ? format(new Date(coach.current_period_end), "d MMM yyyy", { locale: es })
                                            : '—'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className={`font-mono text-xs font-medium ${color}`}>
                                    {daysLeft !== null ? `${daysLeft}d` : '—'}
                                </span>
                                {coach.subscription_status && (
                                    <AdminStatusBadge value={coach.subscription_status} />
                                )}
                            </div>
                        </Link>
                    )
                })}

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
                {tab === 'expiring' && expiringSoon.length === 0 && (
                    <p className="px-4 py-6 text-center text-xs text-[--admin-text-3]">
                        Ningún coach vence en los próximos 7 días ✓
                    </p>
                )}
                {tab === 'audit' && auditEvents.length === 0 && (
                    <p className="px-4 py-6 text-center text-xs text-[--admin-text-3]">Sin actividad reciente</p>
                )}
            </div>
        </div>
    )
}
