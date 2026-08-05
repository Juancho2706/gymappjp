'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { AuditLogRow } from '../_data/auditoria.queries'

const ACTION_LABELS: Record<string, string> = {
    'coach.update':            'Editó coach',
    'coach.suspend':           'Suspendió coach',
    'coach.force_expire':      'Expiró trial',
    'coach.reactivate':        'Reactivó coach',
    'coach.period_extend':     'Extendió período',
    'coach.period_end_update': 'Cambió vencimiento',
    'coach.bulk_status':       'Cambio masivo status',
    'coach.bulk_tier':         'Cambio masivo tier',
    'coach.delete':            'Eliminó coach',
    'client.update':           'Editó alumno',
    'client.delete':           'Eliminó alumno',
}

const ACTION_COLORS: Record<string, string> = {
    'coach.delete':       'text-[var(--danger-500)] bg-[var(--danger-500)]/10',
    'coach.force_expire': 'text-[var(--warning-500)] bg-[var(--warning-500)]/10',
    'coach.suspend':      'text-[var(--warning-500)] bg-[var(--warning-500)]/10',
    'coach.reactivate':   'text-[var(--success-500)] bg-[var(--success-500)]/10',
    'client.delete':      'text-[var(--danger-500)] bg-[var(--danger-500)]/10',
}

function ActionBadge({ action }: { action: string }) {
    const label = ACTION_LABELS[action] ?? action
    const cls = ACTION_COLORS[action] ?? 'text-body bg-[var(--border-subtle)]'
    return (
        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
            {label}
        </span>
    )
}

function PayloadCell({ payload, id }: { payload: Record<string, unknown> | null; id: string }) {
    const [open, setOpen] = useState(false)
    if (!payload || Object.keys(payload).length === 0) return <span className="text-muted">—</span>
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
                            <span className="font-mono text-[10px] text-muted">{id}</span>
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

interface Props {
    rows: AuditLogRow[]
    totalCount: number
    page: number
    limit: number
}

export function AuditTable({ rows, totalCount, page, limit }: Props) {
    return (
        <div className="rounded-lg border border-subtle bg-surface-card overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                    <thead className="border-b border-subtle">
                        <tr>
                            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-muted">Timestamp</th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-muted">Admin</th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-muted">Acción</th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-muted">Tabla</th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-muted">Target ID</th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-muted">Payload</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                        {rows.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted">
                                    Sin eventos en el rango seleccionado
                                </td>
                            </tr>
                        )}
                        {rows.map(ev => (
                            <tr key={ev.id} className="hover:bg-surface-sunken transition-colors">
                                <td className="px-3 py-2.5">
                                    <div>
                                        <span className="font-mono text-xs tabular-nums text-body">
                                            {format(new Date(ev.created_at), 'dd/MM HH:mm')}
                                        </span>
                                        <p className="font-mono text-[10px] text-muted">
                                            {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true, locale: es })}
                                        </p>
                                    </div>
                                </td>
                                <td className="px-3 py-2.5">
                                    <span className="font-mono text-xs text-body">{ev.admin_email}</span>
                                </td>
                                <td className="px-3 py-2.5">
                                    <ActionBadge action={ev.action} />
                                </td>
                                <td className="px-3 py-2.5">
                                    <span className="font-mono text-xs text-muted">{ev.target_table ?? '—'}</span>
                                </td>
                                <td className="px-3 py-2.5">
                                    <span className="font-mono text-[10px] text-muted truncate block max-w-[120px]" title={ev.target_id ?? ''}>
                                        {ev.target_id ? ev.target_id.slice(0, 8) + '…' : '—'}
                                    </span>
                                </td>
                                <td className="px-3 py-2.5">
                                    <PayloadCell payload={ev.payload} id={ev.id} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination footer */}
            {totalCount > 0 && (
                <div className="flex items-center justify-between border-t border-subtle px-4 py-2.5">
                    <span className="text-xs text-muted">
                        {((page - 1) * limit) + 1}–{Math.min(page * limit, totalCount)} de {totalCount}
                    </span>
                </div>
            )}
        </div>
    )
}
