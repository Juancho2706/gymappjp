'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, Copy } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { getAdminActionMeta } from '../../_components/admin-action-catalog'
import type { AuditLogRow } from '../_data/auditoria.queries'

const TH = 'px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-muted'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function ActionBadge({ action }: { action: string }) {
    const { label, tone } = getAdminActionMeta(action)
    return (
        <Badge tone={tone} variant="soft" size="sm" title={action}>
            {label}
        </Badge>
    )
}

function CopyUuidButton({ value }: { value: string }) {
    const [copied, setCopied] = useState(false)

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
            toast.success('UUID copiado')
        } catch {
            toast.error('No se pudo copiar el UUID')
        }
    }

    return (
        <button
            type="button"
            onClick={handleCopy}
            aria-label={`Copiar UUID ${value}`}
            title={value}
            className="shrink-0 rounded p-0.5 text-muted transition-colors hover:text-strong focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none"
        >
            {copied ? <Check className="h-3 w-3 text-[var(--success-500)]" /> : <Copy className="h-3 w-3" />}
        </button>
    )
}

function TargetCell({ targetTable, targetId }: { targetTable: string | null; targetId: string | null }) {
    if (!targetId) return <span className="text-muted">—</span>

    const short = targetId.length > 10 ? `${targetId.slice(0, 8)}…` : targetId
    // `coach.announcement_email` escribe target_id = 'bulk': solo enlazamos UUIDs reales para no
    // mandar al CEO a un 404.
    const isCoachLink = targetTable === 'coaches' && UUID_RE.test(targetId)

    return (
        <div className="flex items-center gap-1">
            {isCoachLink ? (
                <Link
                    href={`/admin/coaches/${targetId}`}
                    title={targetId}
                    className="font-mono text-[10px] text-[var(--sport-500)] underline-offset-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none"
                >
                    {short}
                </Link>
            ) : (
                <span className="font-mono text-[10px] text-muted" title={targetId}>
                    {short}
                </span>
            )}
            <CopyUuidButton value={targetId} />
        </div>
    )
}

function PayloadCell({ payload, id }: { payload: Record<string, unknown> | null; id: string }) {
    const [open, setOpen] = useState(false)
    if (!payload || Object.keys(payload).length === 0) return <span className="text-muted">—</span>
    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex items-center gap-1 rounded border border-subtle px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:border-[var(--text-muted)] hover:text-body focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none"
            >
                JSON <ChevronDown className="h-2.5 w-2.5" />
            </button>
            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
                    <div
                        className="relative max-h-[70vh] w-full max-w-lg overflow-auto rounded-card border border-subtle bg-surface-sunken p-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-2 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-muted">{id}</span>
                            <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted hover:text-strong">
                                ✕
                            </button>
                        </div>
                        <pre className="whitespace-pre-wrap font-mono text-[11px] text-body">{JSON.stringify(payload, null, 2)}</pre>
                    </div>
                </div>
            )}
        </>
    )
}

interface Props {
    rows: AuditLogRow[]
}

export function AuditTable({ rows }: Props) {
    return (
        <div className="overflow-hidden rounded-card border border-subtle bg-surface-card">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                    <thead className="border-b border-subtle">
                        <tr>
                            <th className={TH}>Timestamp</th>
                            <th className={TH}>Admin</th>
                            <th className={TH}>Acción</th>
                            <th className={TH}>Tabla</th>
                            <th className={TH}>Target ID</th>
                            <th className={TH}>IP</th>
                            <th className={TH}>Payload</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                        {rows.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-4 py-8 text-center text-xs text-muted">
                                    Sin eventos en el rango seleccionado
                                </td>
                            </tr>
                        )}
                        {rows.map((ev) => (
                            <tr key={ev.id} className="transition-colors hover:bg-surface-sunken">
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
                                    <TargetCell targetTable={ev.target_table} targetId={ev.target_id} />
                                </td>
                                <td className="px-3 py-2.5">
                                    <span className="font-mono text-[10px] text-muted">{ev.ip_address ?? '—'}</span>
                                </td>
                                <td className="px-3 py-2.5">
                                    <PayloadCell payload={ev.payload} id={ev.id} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
