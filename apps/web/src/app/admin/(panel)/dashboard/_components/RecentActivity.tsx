'use client'

import { useRef, useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { AdminStatusBadge } from '../../_components/AdminStatusBadge'
import { AdminEmptyState } from '../../_components/AdminEmptyState'
import { AdminRelativeTime } from '../../_components/AdminRelativeTime'
import { differenceInDays } from 'date-fns'
import { AlertTriangle, Clock, UserPlus, TrendingDown, ScrollText, type LucideIcon } from 'lucide-react'

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

interface PendingPayment {
    id: string
    full_name: string | null
    brand_name: string | null
    created_at: string
    subscription_tier: string | null
}

interface ChurnRecent {
    coach_id: string
    coach_name: string | null
    tier: string | null
    churned_at: string
}

interface Props {
    signups: Signup[]
    auditEvents: AuditEvent[]
    expiringSoon: ExpiringSoon[]
    pendingPayment: PendingPayment[]
    churnRecent: ChurnRecent[]
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

const TABS = ['signups', 'churn', 'audit'] as const
type Tab = typeof TABS[number]

const TAB_LABELS: Record<Tab, string> = {
    signups: 'Registros',
    churn: 'Churn 30d',
    audit: 'Auditoría',
}

const TAB_LINKS: Record<Tab, string> = {
    signups: '/admin/coaches',
    churn: '/admin/coaches?status=expired',
    audit: '/admin/auditoria',
}

const ROW = 'flex items-center justify-between gap-2 px-4 py-2.5 transition-colors hover:bg-surface-sunken'

function coachLink(name: string): string {
    return `/admin/coaches?q=${encodeURIComponent(name)}`
}

interface AttentionItem {
    key: string
    name: string
    label: string
    /** Dias que ordenan la urgencia: menos dias primero. */
    days: number
    tone: 'danger' | 'warning'
    icon: LucideIcon
}

/**
 * War room del dashboard CEO: lo urgente arriba y siempre visible; el historial
 * (registros / churn / auditoría) queda debajo en tabs con patrón ARIA completo.
 */
export function RecentActivity({ signups, auditEvents, expiringSoon, pendingPayment, churnRecent }: Props) {
    const [tab, setTab] = useState<Tab>('signups')
    const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({})

    const now = new Date()

    // Urgencia por grupo (las dos metricas tienen semantica OPUESTA y no se mezclan):
    // vencimientos primero, ordenados por MENOS dias restantes; despues pagos pendientes,
    // ordenados por MAS dias esperando. Un sort plano por `days` ponia a un pendiente de hoy
    // (0d) encima de un coach que vence mañana.
    const attention: AttentionItem[] = [
        ...expiringSoon.map<AttentionItem>(coach => {
            const name = coach.brand_name || coach.full_name || 'Sin nombre'
            const days = coach.current_period_end
                ? differenceInDays(new Date(coach.current_period_end), now)
                : 0
            return {
                key: `exp-${coach.id}`,
                name,
                label: days <= 0 ? 'vence hoy' : `vence en ${days}d`,
                days,
                tone: days <= 2 ? 'danger' : 'warning',
                icon: AlertTriangle,
            }
        }).sort((a, b) => a.days - b.days),
        ...pendingPayment.map<AttentionItem>(coach => {
            const name = coach.brand_name || coach.full_name || 'Sin nombre'
            const days = Math.max(0, differenceInDays(now, new Date(coach.created_at)))
            return {
                key: `pend-${coach.id}`,
                name,
                label: `pago pendiente hace ${days}d`,
                days,
                tone: 'danger',
                icon: Clock,
            }
        }).sort((a, b) => b.days - a.days),
    ]

    function onTabKeyDown(e: KeyboardEvent<HTMLDivElement>) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return
        e.preventDefault()
        const i = TABS.indexOf(tab)
        const next: Tab =
            e.key === 'Home' ? TABS[0]
            : e.key === 'End' ? TABS[TABS.length - 1]
            : e.key === 'ArrowRight' ? TABS[(i + 1) % TABS.length]
            : TABS[(i - 1 + TABS.length) % TABS.length]
        setTab(next)
        tabRefs.current[next]?.focus()
    }

    return (
        <div className="space-y-4">
            {/* ─────────── 1. Requieren atención (siempre visible) ─────────── */}
            <section className="rounded-card border border-[var(--warning-500)]/30 bg-surface-card shadow-[var(--shadow-sm)]">
                <div className="flex items-center justify-between gap-2 border-b border-subtle px-4 py-3">
                    <h2 className="flex items-center gap-2 text-sm font-bold text-strong">
                        <AlertTriangle className="size-4 shrink-0 text-[var(--warning-500)]" />
                        Requieren atención
                        {attention.length > 0 && (
                            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-[var(--warning-500)] px-1 text-[10px] font-bold text-[var(--ink-950)]">
                                {attention.length}
                            </span>
                        )}
                    </h2>
                    <Link
                        href="/admin/coaches?sort=expiry&dir=asc"
                        className="shrink-0 text-[11px] font-bold text-sport-500 hover:underline"
                    >
                        Ver todos →
                    </Link>
                </div>

                {attention.length === 0 ? (
                    <p className="px-4 py-3 text-xs font-medium text-[var(--success-500)]">
                        <span aria-hidden>✓ </span>Nada urgente
                    </p>
                ) : (
                    <div className="divide-y divide-[var(--border-subtle)]">
                        {attention.map(item => {
                            const Icon = item.icon
                            const color = item.tone === 'danger'
                                ? 'text-[var(--danger-500)]'
                                : 'text-[var(--warning-500)]'
                            return (
                                <Link key={item.key} href={coachLink(item.name)} className={ROW}>
                                    <span className="flex min-w-0 items-center gap-2">
                                        <Icon className={`size-3.5 shrink-0 ${color}`} />
                                        <span className="truncate text-sm font-medium text-strong">{item.name}</span>
                                    </span>
                                    <span className={`shrink-0 text-[11px] font-bold ${color}`}>
                                        {item.label}
                                    </span>
                                </Link>
                            )
                        })}
                    </div>
                )}
            </section>

            {/* ─────────── 2. Historial en tabs ─────────── */}
            <section className="rounded-card border border-subtle bg-surface-card shadow-[var(--shadow-sm)]">
                <div className="flex items-center justify-between gap-2 border-b border-subtle px-4 py-3">
                    <div
                        role="tablist"
                        aria-label="Actividad reciente"
                        onKeyDown={onTabKeyDown}
                        className="flex gap-1"
                    >
                        {TABS.map(t => (
                            <button
                                key={t}
                                ref={el => { tabRefs.current[t] = el }}
                                type="button"
                                role="tab"
                                id={`activity-tab-${t}`}
                                aria-selected={tab === t}
                                aria-controls={`activity-panel-${t}`}
                                tabIndex={tab === t ? 0 : -1}
                                onClick={() => setTab(t)}
                                className={`rounded-pill px-3 py-1 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                                    tab === t
                                        ? 'bg-sport-500/15 text-[var(--sport-500)]'
                                        : 'text-muted hover:text-body'
                                }`}
                            >
                                {TAB_LABELS[t]}
                            </button>
                        ))}
                    </div>
                    <Link
                        href={TAB_LINKS[tab]}
                        className="shrink-0 text-[11px] font-bold text-sport-500 hover:underline"
                    >
                        Ver todos →
                    </Link>
                </div>

                {/* Registros */}
                <div
                    role="tabpanel"
                    id="activity-panel-signups"
                    aria-labelledby="activity-tab-signups"
                    hidden={tab !== 'signups'}
                    tabIndex={0}
                    className="divide-y divide-[var(--border-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                    {signups.length === 0 ? (
                        <AdminEmptyState
                            icon={UserPlus}
                            title="Sin registros recientes"
                            description="Los coaches nuevos aparecerán acá apenas se registren."
                        />
                    ) : signups.map(coach => (
                        <Link
                            key={coach.id}
                            href={coachLink(coach.brand_name || coach.full_name || '')}
                            className={ROW}
                        >
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-strong">
                                    {coach.brand_name || coach.full_name || 'Sin nombre'}
                                </span>
                                <AdminRelativeTime
                                    iso={coach.created_at}
                                    className="block text-[11px] text-muted"
                                />
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                                {coach.subscription_tier && (
                                    <AdminStatusBadge value={coach.subscription_tier} type="tier" />
                                )}
                                {coach.subscription_status && (
                                    <AdminStatusBadge value={coach.subscription_status} />
                                )}
                            </span>
                        </Link>
                    ))}
                </div>

                {/* Churn 30d */}
                <div
                    role="tabpanel"
                    id="activity-panel-churn"
                    aria-labelledby="activity-tab-churn"
                    hidden={tab !== 'churn'}
                    tabIndex={0}
                    className="divide-y divide-[var(--border-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                    {churnRecent.length === 0 ? (
                        <AdminEmptyState
                            icon={TrendingDown}
                            title="Sin churn en 30 días"
                            description="Ningún coach canceló ni expiró en el último mes."
                        />
                    ) : churnRecent.map(coach => (
                        <Link
                            key={coach.coach_id}
                            href={coachLink(coach.coach_name || '')}
                            className={ROW}
                        >
                            <span className="flex min-w-0 items-center gap-2">
                                <TrendingDown className="size-3.5 shrink-0 text-[var(--danger-500)]" />
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium text-strong">
                                        {coach.coach_name || 'Sin nombre'}
                                    </span>
                                    <AdminRelativeTime
                                        iso={coach.churned_at}
                                        className="block text-[11px] text-muted"
                                    />
                                </span>
                            </span>
                            {coach.tier && <AdminStatusBadge value={coach.tier} type="tier" />}
                        </Link>
                    ))}
                </div>

                {/* Auditoría */}
                <div
                    role="tabpanel"
                    id="activity-panel-audit"
                    aria-labelledby="activity-tab-audit"
                    hidden={tab !== 'audit'}
                    tabIndex={0}
                    className="divide-y divide-[var(--border-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                    {auditEvents.length === 0 ? (
                        <AdminEmptyState
                            icon={ScrollText}
                            title="Sin actividad administrativa"
                            description="Las acciones del panel CEO quedan registradas acá."
                        />
                    ) : auditEvents.map(ev => (
                        <div key={ev.id} className={ROW}>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-strong">
                                    {ACTION_LABELS[ev.action] ?? ev.action}
                                </p>
                                <p className="truncate font-mono text-[11px] text-muted">
                                    {ev.admin_email}
                                </p>
                            </div>
                            <AdminRelativeTime
                                iso={ev.created_at}
                                className="shrink-0 text-[11px] text-muted"
                            />
                        </div>
                    ))}
                </div>
            </section>
        </div>
    )
}
