'use client'

import { useState, useTransition } from 'react'
import { Loader2, X, AlertTriangle, ArrowRight } from 'lucide-react'
import { removeCoachAction, bulkReassignClientsAction, unassignAllOrgClientsFromCoachAction } from '../../_actions/org.actions'

interface Coach {
    id: string
    name: string
}

interface Props {
    orgSlug: string
    memberId: string
    coachId: string
    coachName: string
    clientCount: number
    otherCoaches: Coach[]
}

export function RemoveCoachDialog({
    orgSlug,
    memberId,
    coachId,
    coachName,
    clientCount,
    otherCoaches,
}: Props) {
    const [open, setOpen] = useState(false)
    const [targetCoachId, setTargetCoachId] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    const hasClients = clientCount > 0
    const canReassign = otherCoaches.length > 0

    function handleOpen() { setOpen(true); setError(null); setTargetCoachId('') }
    function handleClose() { if (pending) return; setOpen(false); setError(null) }

    function handleRemoveOnly() {
        setError(null)
        startTransition(async () => {
            const res = await removeCoachAction(orgSlug, memberId)
            if (res?.error) setError(res.error)
            else setOpen(false)
        })
    }

    function handleReassignAndRemove() {
        if (!targetCoachId) return
        setError(null)
        startTransition(async () => {
            const res = await bulkReassignClientsAction(orgSlug, coachId, targetCoachId, memberId)
            if (res?.error) setError(res.error)
            else setOpen(false)
        })
    }

    // F6: send the coach's org clients to the unassigned pool (org_id intact, coach cleared),
    // then remove the coach. Standalone clients are never touched.
    function handleUnassignAndRemove() {
        setError(null)
        startTransition(async () => {
            const unassign = await unassignAllOrgClientsFromCoachAction(orgSlug, coachId)
            if (unassign?.error) { setError(unassign.error); return }
            const res = await removeCoachAction(orgSlug, memberId)
            if (res?.error) setError(res.error)
            else setOpen(false)
        })
    }

    return (
        <>
            <button
                onClick={handleOpen}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-red-400 hover:bg-red-500/10 transition-colors"
            >
                <X className="w-3 h-3" />
                Remover
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 pl-safe pr-safe"
                    onClick={e => { if (e.target === e.currentTarget) handleClose() }}
                >
                    <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-xl pb-safe border border-border bg-background shadow-xl p-5 space-y-4">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <h2 className="font-semibold text-sm">Remover coach enterprise</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">{coachName}</p>
                            </div>
                            <button onClick={handleClose} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {hasClients && (
                            <div className="flex gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-700 dark:text-amber-400">
                                    Este coach tiene <strong>{clientCount}</strong> {clientCount === 1 ? 'alumno asignado' : 'alumnos asignados'}.
                                    {canReassign
                                        ? ' Reasígnalos antes de remover o quedarán en cola sin coach.'
                                        : ' No hay otros coaches activos. Quedarán sin coach asignado.'}
                                </p>
                            </div>
                        )}

                        {hasClients && canReassign && (
                            <div className="space-y-2">
                                <label className="text-xs font-medium">Reasignar alumnos a</label>
                                <select
                                    value={targetCoachId}
                                    onChange={e => setTargetCoachId(e.target.value)}
                                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                >
                                    <option value="">Seleccionar coach...</option>
                                    {otherCoaches.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Standalone preservation note */}
                        <div className="rounded-md bg-zinc-900/60 border border-zinc-800 px-3 py-2 text-xs text-zinc-500 space-y-0.5">
                            <p>✓ Su cuenta EVA y alumnos standalone no se ven afectados.</p>
                            <p>✓ Solo pierde acceso enterprise a esta organización.</p>
                            <p>✓ Queda registrado en el audit log.</p>
                        </div>

                        {error && (
                            <p className="text-xs text-red-400 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2">{error}</p>
                        )}

                        <div className="flex flex-wrap gap-2 pt-1">
                            <button
                                onClick={handleClose}
                                disabled={pending}
                                className="flex-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>

                            {!hasClients ? (
                                <button
                                    onClick={handleRemoveOnly}
                                    disabled={pending}
                                    className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                                >
                                    {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                                    Remover
                                </button>
                            ) : (
                                <>
                                    {canReassign && (
                                        <button
                                            onClick={handleReassignAndRemove}
                                            disabled={pending || !targetCoachId}
                                            className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                                        >
                                            {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                                            Reasignar y remover
                                        </button>
                                    )}
                                    <button
                                        onClick={handleUnassignAndRemove}
                                        disabled={pending}
                                        className="flex-1 flex items-center justify-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                                    >
                                        {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                                        Quitar alumnos (pool) y remover
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
