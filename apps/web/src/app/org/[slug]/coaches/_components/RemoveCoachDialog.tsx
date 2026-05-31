'use client'

import { useState, useTransition } from 'react'
import { Loader2, X, AlertTriangle, ArrowRight } from 'lucide-react'
import { removeCoachAction, bulkReassignClientsAction } from '../../_actions/org.actions'

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
    const [pending, startTransition] = useTransition()

    const hasClients = clientCount > 0
    const canReassign = otherCoaches.length > 0

    function handleRemoveOnly() {
        startTransition(async () => {
            const res = await removeCoachAction(orgSlug, memberId)
            if (res?.error) alert(res.error)
            else setOpen(false)
        })
    }

    function handleReassignAndRemove() {
        if (!targetCoachId) return
        startTransition(async () => {
            const res = await bulkReassignClientsAction(orgSlug, coachId, targetCoachId, memberId)
            if (res?.error) alert(res.error)
            else setOpen(false)
        })
    }

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-red-400 hover:bg-red-500/10 transition-colors"
            >
                <X className="w-3 h-3" />
                Remover
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 pl-safe pr-safe"
                    onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
                >
                    <div className="w-full max-w-md rounded-xl border border-border bg-background shadow-xl p-5 space-y-4">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <h2 className="font-semibold text-sm">Remover coach</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">{coachName}</p>
                            </div>
                            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {hasClients && (
                            <div className="flex gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-700 dark:text-amber-400">
                                    Este coach tiene <strong>{clientCount}</strong> {clientCount === 1 ? 'alumno asignado' : 'alumnos asignados'}.
                                    {canReassign
                                        ? ' Reasígnalos antes de remover o quedarán sin coach.'
                                        : ' No hay otros coaches activos para reasignar. Quedarán sin coach.'}
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

                        <div className="flex gap-2 pt-1">
                            <button
                                onClick={() => setOpen(false)}
                                disabled={pending}
                                className="flex-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>

                            {hasClients && canReassign ? (
                                <button
                                    onClick={handleReassignAndRemove}
                                    disabled={pending || !targetCoachId}
                                    className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                                >
                                    {pending
                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                        : <ArrowRight className="w-3 h-3" />}
                                    Reasignar y remover
                                </button>
                            ) : (
                                <button
                                    onClick={handleRemoveOnly}
                                    disabled={pending}
                                    className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                                >
                                    {pending
                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                        : <X className="w-3 h-3" />}
                                    Remover igual
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
