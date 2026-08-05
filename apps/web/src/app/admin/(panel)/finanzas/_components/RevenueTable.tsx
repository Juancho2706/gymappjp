'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

interface Event {
    id: string
    coach_id: string | null
    coach_name: string | null
    provider: string | null
    provider_event_id: string | null
    provider_status: string | null
    payload: Record<string, unknown> | null
    created_at: string
}

const STATUS_COLORS: Record<string, string> = {
    approved: 'text-[var(--success-500)] bg-[var(--success-500)]/10',
    pending: 'text-[var(--warning-500)] bg-[var(--warning-500)]/10',
    rejected: 'text-[var(--danger-500)] bg-[var(--danger-500)]/10',
    cancelled: 'text-muted bg-[var(--border-subtle)]',
    authorized: 'text-[var(--sport-300)] bg-[var(--sport-300)]/10',
}

function StatusBadge({ status }: { status: string | null }) {
    if (!status) return <span className="text-muted">—</span>
    const cls = STATUS_COLORS[status] ?? 'text-body bg-[var(--border-subtle)]'
    return (
        <span className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${cls}`}>
            {status}
        </span>
    )
}

function PayloadDialog({ payload, eventId }: { payload: Record<string, unknown> | null; eventId: string }) {
    const [open, setOpen] = useState(false)
    if (!payload) return <span className="text-muted">—</span>
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-1 rounded border border-subtle px-1.5 py-0.5 text-[10px] text-muted hover:text-body hover:border-[var(--text-muted)] transition-colors"
            >
                JSON <ChevronDown className="h-2.5 w-2.5" />
            </button>
            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
                    <div className="relative max-h-[70vh] w-full max-w-lg overflow-auto rounded-lg border border-subtle bg-surface-sunken p-4" onClick={e => e.stopPropagation()}>
                        <div className="mb-2 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-muted">{eventId}</span>
                            <button onClick={() => setOpen(false)} className="text-xs text-muted hover:text-strong">✕</button>
                        </div>
                        <pre className="whitespace-pre-wrap font-mono text-[11px] text-body">
                            {JSON.stringify(payload, null, 2)}
                        </pre>
                    </div>
                </div>
            )}
        </>
    )
}

export function RevenueTable({ events }: { events: Event[] }) {
    return (
        <div className="rounded-xl border border-subtle bg-surface-card overflow-hidden">
            <div className="border-b border-subtle px-4 py-3">
                <h3 className="text-xs font-medium uppercase tracking-widest text-muted">Eventos de suscripción recientes</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                    <thead className="border-b border-subtle">
                        <tr>
                            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-muted">Timestamp</th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-muted">Coach</th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-muted">Provider</th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-muted">Event ID</th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-muted">Status</th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-muted">Payload</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                        {events.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted">
                                    Sin eventos de suscripción registrados
                                </td>
                            </tr>
                        )}
                        {events.map(ev => (
                            <tr key={ev.id} className="hover:bg-surface-sunken transition-colors">
                                <td className="px-3 py-2.5">
                                    <span className="font-mono text-[11px] tabular-nums text-muted">
                                        {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true, locale: es })}
                                    </span>
                                </td>
                                <td className="px-3 py-2.5">
                                    <span className="text-sm text-strong">{ev.coach_name ?? '—'}</span>
                                </td>
                                <td className="px-3 py-2.5">
                                    <span className="font-mono text-xs text-body">{ev.provider ?? '—'}</span>
                                </td>
                                <td className="px-3 py-2.5">
                                    <span className="font-mono text-[10px] text-muted truncate max-w-[120px] block">
                                        {ev.provider_event_id ?? '—'}
                                    </span>
                                </td>
                                <td className="px-3 py-2.5">
                                    <StatusBadge status={ev.provider_status} />
                                </td>
                                <td className="px-3 py-2.5">
                                    <PayloadDialog payload={ev.payload} eventId={ev.id} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
