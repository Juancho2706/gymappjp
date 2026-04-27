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
    approved: 'text-[--admin-green] bg-[--admin-green]/10',
    pending: 'text-[--admin-amber] bg-[--admin-amber]/10',
    rejected: 'text-[--admin-red] bg-[--admin-red]/10',
    cancelled: 'text-[--admin-text-3] bg-[--admin-border]',
    authorized: 'text-[--admin-blue] bg-[--admin-blue]/10',
}

function StatusBadge({ status }: { status: string | null }) {
    if (!status) return <span className="text-[--admin-text-3]">—</span>
    const cls = STATUS_COLORS[status] ?? 'text-[--admin-text-2] bg-[--admin-border]'
    return (
        <span className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${cls}`}>
            {status}
        </span>
    )
}

function PayloadDialog({ payload, eventId }: { payload: Record<string, unknown> | null; eventId: string }) {
    const [open, setOpen] = useState(false)
    if (!payload) return <span className="text-[--admin-text-3]">—</span>
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-1 rounded border border-[--admin-border] px-1.5 py-0.5 text-[10px] text-[--admin-text-3] hover:text-[--admin-text-2] hover:border-[--admin-text-3] transition-colors"
            >
                JSON <ChevronDown className="h-2.5 w-2.5" />
            </button>
            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
                    <div className="relative max-h-[70vh] w-full max-w-lg overflow-auto rounded-lg border border-[--admin-border] bg-[--admin-bg-elevated] p-4" onClick={e => e.stopPropagation()}>
                        <div className="mb-2 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-[--admin-text-3]">{eventId}</span>
                            <button onClick={() => setOpen(false)} className="text-xs text-[--admin-text-3] hover:text-[--admin-text-1]">✕</button>
                        </div>
                        <pre className="whitespace-pre-wrap font-mono text-[11px] text-[--admin-text-2]">
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
        <div className="rounded-lg border border-[--admin-border] bg-[--admin-bg-surface] overflow-hidden">
            <div className="border-b border-[--admin-border] px-4 py-3">
                <h3 className="text-xs font-medium uppercase tracking-widest text-[--admin-text-3]">Eventos de suscripción recientes</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                    <thead className="border-b border-[--admin-border]">
                        <tr>
                            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">Timestamp</th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">Coach</th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">Provider</th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">Event ID</th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">Status</th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">Payload</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[--admin-border]">
                        {events.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-xs text-[--admin-text-3]">
                                    Sin eventos de suscripción registrados
                                </td>
                            </tr>
                        )}
                        {events.map(ev => (
                            <tr key={ev.id} className="hover:bg-[--admin-bg-elevated] transition-colors">
                                <td className="px-3 py-2.5">
                                    <span className="font-mono text-[11px] tabular-nums text-[--admin-text-3]">
                                        {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true, locale: es })}
                                    </span>
                                </td>
                                <td className="px-3 py-2.5">
                                    <span className="text-sm text-[--admin-text-1]">{ev.coach_name ?? '—'}</span>
                                </td>
                                <td className="px-3 py-2.5">
                                    <span className="font-mono text-xs text-[--admin-text-2]">{ev.provider ?? '—'}</span>
                                </td>
                                <td className="px-3 py-2.5">
                                    <span className="font-mono text-[10px] text-[--admin-text-3] truncate max-w-[120px] block">
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
