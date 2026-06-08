'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import {
    AlertTriangle,
    CheckCircle2,
    ExternalLink,
    KeyRound,
    Loader2,
    Mail,
    Phone,
    User,
    UserCheck,
    X,
} from 'lucide-react'
import type { ClientDisplayRow } from './ClientsListClient'
import { resetEnterpriseClientPasswordAction } from '../../_actions/org.actions'

interface AuditEvent {
    action: string
    created_at: string | null
    metadata: Record<string, unknown>
}

interface Props {
    orgSlug: string
    client: ClientDisplayRow | null
    onClose: () => void
    coaches: { id: string; name: string }[]
}

function paymentTone(status: string | null) {
    if (status === 'paid') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
    if (status === 'overdue') return 'border-red-400/30 bg-red-400/10 text-red-400'
    if (status === 'pending') return 'border-amber-400/30 bg-amber-400/10 text-amber-300'
    return 'border-zinc-700 text-zinc-400'
}

function paymentLabel(s: string | null) {
    if (s === 'paid') return 'Pagado'
    if (s === 'overdue') return 'Vencido'
    if (s === 'pending') return 'Pendiente'
    if (s === 'scholarship') return 'Becado'
    return 'Sin registro'
}

function formatDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Side panel (desktop) + bottom sheet (mobile) for client detail.
 * Opens when owner taps a client row in /clients.
 * Shows existing ClientDisplayRow data + lazy-fetched audit history.
 */
export function ClientDetailSheet({ orgSlug, client, onClose, coaches }: Props) {
    const [history, setHistory] = useState<AuditEvent[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)
    const [pending, startTransition] = useTransition()
    const [resetResult, setResetResult] = useState<{ tempPassword?: string; error?: string } | null>(null)

    function handleResetPassword() {
        if (!client) return
        setResetResult(null)
        startTransition(async () => {
            const res = await resetEnterpriseClientPasswordAction(orgSlug, client.id)
            setResetResult(res?.error ? { error: res.error } : { tempPassword: res?.tempPassword })
        })
    }

    useEffect(() => {
        if (!client) { setHistory([]); return }
        setLoadingHistory(true)
        setHistory([])
        // Fetch assignment history from audit logs for this client
        fetch(`/api/org/${orgSlug}/client-history?clientId=${client.id}`)
            .then(r => r.ok ? r.json() : { events: [] })
            .then(data => setHistory(data.events ?? []))
            .catch(() => setHistory([]))
            .finally(() => setLoadingHistory(false))
    }, [client?.id, orgSlug])

    if (!client) return null

    const content = (
        <div className="flex h-full flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-5 py-4 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-black ${
                        client.isActive ? 'bg-amber-400/10 text-amber-300' : 'bg-zinc-800 text-zinc-500'
                    }`}>
                        {client.name?.charAt(0).toUpperCase() ?? '?'}
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-base font-black text-zinc-100">{client.name ?? 'Alumno'}</p>
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${
                            client.isActive ? 'text-emerald-400' : 'text-zinc-500'
                        }`}>
                            {client.isActive ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                            {client.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                    </div>
                </div>
                <button onClick={onClose} className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors">
                    <X className="h-5 w-5" />
                </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">

                {/* Contact */}
                <section>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500 mb-2">Contacto</p>
                    <div className="space-y-2">
                        {client.email && (
                            <div className="flex items-center gap-2.5 text-sm text-zinc-300">
                                <Mail className="h-4 w-4 shrink-0 text-zinc-500" />
                                <span className="truncate">{client.email}</span>
                            </div>
                        )}
                        {client.phone && (
                            <div className="flex items-center gap-2.5 text-sm text-zinc-300">
                                <Phone className="h-4 w-4 shrink-0 text-zinc-500" />
                                <span>{client.phone}</span>
                            </div>
                        )}
                        {!client.email && !client.phone && (
                            <p className="text-xs text-zinc-500">Sin datos de contacto</p>
                        )}
                    </div>
                </section>

                {/* Status */}
                <section>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500 mb-2">Estado operacional</p>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                            <p className="text-[10px] text-zinc-500 mb-1">Coach asignado</p>
                            {client.coachName ? (
                                <p className="text-sm font-bold text-zinc-200">{client.coachName}</p>
                            ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400">
                                    <AlertTriangle className="h-3 w-3" />
                                    Sin asignar
                                </span>
                            )}
                        </div>
                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                            <p className="text-[10px] text-zinc-500 mb-1">Pago</p>
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-bold ${paymentTone(client.paymentStatus)}`}>
                                {paymentLabel(client.paymentStatus)}
                            </span>
                        </div>
                        {client.riskCount > 0 && (
                            <div className="col-span-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
                                <p className="text-xs font-semibold text-amber-300">
                                    <AlertTriangle className="inline h-3 w-3 mr-1" />
                                    {client.riskCount} factor{client.riskCount !== 1 ? 'es' : ''} de riesgo activo{client.riskCount !== 1 ? 's' : ''}
                                </p>
                            </div>
                        )}
                    </div>
                </section>

                {/* Quick actions */}
                <section>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500 mb-2">Acciones rápidas</p>
                    <div className="flex flex-wrap gap-2">
                        {client.coachId && (
                            <Link
                                href={`/coach/builder/${client.id}`}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors"
                            >
                                <ExternalLink className="h-3 w-3" />
                                Abrir builder
                            </Link>
                        )}
                        <Link
                            href={`/org/${orgSlug}/clients?q=${encodeURIComponent(client.email ?? client.name ?? '')}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors"
                        >
                            <User className="h-3 w-3" />
                            Filtrar en lista
                        </Link>
                        <Link
                            href={`/org/${orgSlug}/payments`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors"
                        >
                            <UserCheck className="h-3 w-3" />
                            Ver pagos
                        </Link>
                        {/* B-11: reset the alumno's password from the org panel. */}
                        <button
                            onClick={handleResetPassword}
                            disabled={pending}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                        >
                            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                            Reiniciar contraseña
                        </button>
                    </div>
                    {resetResult?.tempPassword && (
                        <div className="mt-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                            Nueva contraseña temporal: <span className="font-mono font-bold">{resetResult.tempPassword}</span>. Se le envió por email; pídele que la cambie al ingresar.
                        </div>
                    )}
                    {resetResult?.error && (
                        <p className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{resetResult.error}</p>
                    )}
                </section>

                {/* Assignment history */}
                <section>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500 mb-2">
                        Historial de asignaciones
                    </p>
                    {loadingHistory ? (
                        <p className="text-xs text-zinc-500">Cargando...</p>
                    ) : history.length === 0 ? (
                        <p className="text-xs text-zinc-500">Sin historial de cambios registrado.</p>
                    ) : (
                        <div className="space-y-2">
                            {history.map((event, i) => (
                                <div key={i} className="flex items-start gap-2.5 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
                                    <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-zinc-600" />
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold text-zinc-300">
                                            {event.action.replace(/[._]/g, ' ')}
                                        </p>
                                        <p className="text-[10px] text-zinc-500 mt-0.5">
                                            {formatDate(event.created_at)}
                                            {event.metadata?.to_coach_id != null && ` → coach ${String(event.metadata.to_coach_id).slice(0, 8)}...`}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    )

    return (
        <>
            {/* Desktop: right side panel */}
            <div className="hidden md:flex fixed inset-y-0 right-0 z-50 w-96 flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl">
                {content}
            </div>
            <div
                className="hidden md:block fixed inset-0 z-40 bg-black/30"
                onClick={onClose}
            />

            {/* Mobile: bottom sheet */}
            <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
                <div className="max-h-[85dvh] flex flex-col rounded-t-2xl border-t border-zinc-800 bg-zinc-950 pb-safe">
                    {content}
                </div>
            </div>
        </>
    )
}
