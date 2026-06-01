'use client'

import { useState, useTransition } from 'react'
import { Loader2, Send, Users, X } from 'lucide-react'
import { assignOrgNutritionPlanTemplateToClientsAction } from '../_actions/nutrition-templates.actions'

interface Props {
    orgSlug: string
    templateId: string
    templateName: string
    assignedClientsCount: number
}

export function AssignOrgNutritionTemplateButton({ orgSlug, templateId, templateName, assignedClientsCount }: Props) {
    const [open, setOpen] = useState(false)
    const [result, setResult] = useState<{ assigned?: number } | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    function handleOpen() { setOpen(true); setError(null); setResult(null) }
    function handleClose() { if (pending) return; setOpen(false); setError(null) }

    function handleAssign() {
        setError(null)
        startTransition(async () => {
            const res = await assignOrgNutritionPlanTemplateToClientsAction(orgSlug, templateId)
            if (res?.error) setError(res.error)
            else setResult({ assigned: res.assigned })
        })
    }

    return (
        <>
            <button
                onClick={handleOpen}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-400/20 transition-colors"
            >
                <Users className="h-3 w-3" />
                Asignar a alumnos
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 pl-safe pr-safe"
                    onClick={e => { if (e.target === e.currentTarget) handleClose() }}
                >
                    <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl pb-safe border border-border bg-zinc-900 shadow-xl p-5 space-y-4">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <h2 className="font-semibold text-sm text-zinc-100">Asignar template nutricional</h2>
                                <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-[240px]">{templateName}</p>
                            </div>
                            <button onClick={handleClose} className="text-zinc-500 hover:text-zinc-300" aria-label="Cerrar">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {!result ? (
                            <>
                                <div className="rounded-lg bg-zinc-800/50 border border-zinc-700 p-3 text-xs text-zinc-400 space-y-1">
                                    <p>✓ Crea planes nutricionales para <strong className="text-zinc-200">{assignedClientsCount} alumnos con coach asignado</strong>.</p>
                                    <p>✓ Desactiva planes activos previos de esos alumnos.</p>
                                    <p>✓ Solo macros — el coach puede agregar comidas desde su panel.</p>
                                    <p className="text-zinc-600">Alumnos sin coach asignado quedan excluidos.</p>
                                </div>

                                {error && (
                                    <p className="text-xs text-red-400 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2">{error}</p>
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
                                        disabled={pending || assignedClientsCount === 0}
                                        className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-400 transition-colors disabled:opacity-50"
                                    >
                                        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                        Asignar
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="space-y-4">
                                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-300">
                                    ✓ Template asignado a <strong>{result.assigned}</strong> alumno{result.assigned !== 1 ? 's' : ''}. Auditado.
                                </div>
                                <button
                                    onClick={handleClose}
                                    className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
                                >
                                    Listo
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}
