'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, Loader2, Send, X } from 'lucide-react'
import { assignOrgWorkoutTemplateToCoachAction } from '../../_actions/org.actions'

interface Coach {
    id: string
    name: string
}

interface Props {
    orgSlug: string
    templateId: string
    templateName: string
    coaches: Coach[]
}

export function AssignTemplateToCoachButton({ orgSlug, templateId, templateName, coaches }: Props) {
    const [open, setOpen] = useState(false)
    const [coachId, setCoachId] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [pending, startTransition] = useTransition()

    function handleOpen() { setOpen(true); setError(null); setSuccess(false); setCoachId('') }
    function handleClose() { if (pending) return; setOpen(false); setError(null); setSuccess(false) }

    function handleAssign() {
        if (!coachId) return
        setError(null)
        startTransition(async () => {
            const res = await assignOrgWorkoutTemplateToCoachAction(orgSlug, templateId, coachId)
            if (res?.error) setError(res.error)
            else { setSuccess(true); setTimeout(handleClose, 1200) }
        })
    }

    if (coaches.length === 0) return null

    return (
        <>
            <button
                onClick={handleOpen}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            >
                <Send className="h-3 w-3" />
                Asignar a coach
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 pl-safe pr-safe"
                    onClick={e => { if (e.target === e.currentTarget) handleClose() }}
                >
                    <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl pb-safe border border-border bg-zinc-900 shadow-xl p-5 space-y-4">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <h2 className="font-semibold text-sm text-zinc-100">Asignar template a coach</h2>
                                <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-[240px]">{templateName}</p>
                            </div>
                            <button onClick={handleClose} className="text-zinc-500 hover:text-zinc-300" aria-label="Cerrar">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Coach destino</label>
                            <div className="relative">
                                <select
                                    value={coachId}
                                    onChange={e => setCoachId(e.target.value)}
                                    className="w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 pr-8 text-sm text-zinc-100 focus:border-violet-400/50 focus:outline-none"
                                >
                                    <option value="">Seleccionar coach...</option>
                                    {coaches.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                            </div>
                            <p className="mt-1.5 text-[11px] text-zinc-600 leading-4">
                                Se crea una copia en la biblioteca del coach. Puede editarla en su builder antes de asignarla a alumnos.
                            </p>
                        </div>

                        {error && (
                            <p className="text-xs text-red-400 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2">{error}</p>
                        )}
                        {success && (
                            <p className="text-xs text-emerald-400 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                                Template copiado al builder del coach ✓
                            </p>
                        )}

                        <div className="flex gap-2">
                            <button
                                onClick={handleClose}
                                disabled={pending}
                                className="flex-1 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleAssign}
                                disabled={pending || !coachId}
                                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-violet-500 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-400 transition-colors disabled:opacity-50"
                            >
                                {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                Asignar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
