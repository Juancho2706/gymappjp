'use client'

import { useState, useTransition } from 'react'
import { CheckSquare2, Square, Users, Archive, X, Loader2, ChevronDown } from 'lucide-react'
import { bulkAssignSelectedClientsAction, bulkArchiveClientsAction } from '../../_actions/org.actions'

interface Coach {
    id: string
    name: string
}

interface Client {
    id: string
    name: string
}

interface Props {
    orgSlug: string
    clients: Client[]
    coaches: Coach[]
    isAdmin: boolean
}

export function BulkClientActions({ orgSlug, clients, coaches, isAdmin }: Props) {
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [showCoachPicker, setShowCoachPicker] = useState(false)
    const [confirmArchive, setConfirmArchive] = useState(false)
    const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
    const [pending, startTransition] = useTransition()

    const allSelected = selected.size === clients.length && clients.length > 0
    const someSelected = selected.size > 0

    function toggleAll() {
        setSelected(allSelected ? new Set() : new Set(clients.map(c => c.id)))
    }

    function toggleOne(id: string) {
        setSelected(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    function clearSelection() {
        setSelected(new Set())
        setShowCoachPicker(false)
        setConfirmArchive(false)
        setResult(null)
    }

    function handleAssign(coachId: string) {
        setShowCoachPicker(false)
        startTransition(async () => {
            const res = await bulkAssignSelectedClientsAction(orgSlug, [...selected], coachId)
            if (res.error) {
                setResult({ ok: false, msg: res.error })
            } else {
                setResult({ ok: true, msg: `${res.count} alumno${res.count === 1 ? '' : 's'} asignado${res.count === 1 ? '' : 's'}.` })
                setSelected(new Set())
            }
        })
    }

    function handleArchive() {
        setConfirmArchive(false)
        startTransition(async () => {
            const res = await bulkArchiveClientsAction(orgSlug, [...selected])
            if (res.error) {
                setResult({ ok: false, msg: res.error })
            } else {
                setResult({ ok: true, msg: `${res.count} alumno${res.count === 1 ? '' : 's'} archivado${res.count === 1 ? '' : 's'}.` })
                setSelected(new Set())
            }
        })
    }

    return (
        <div className="relative">
            {/* Select-all header */}
            {isAdmin && clients.length > 0 && (
                <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
                    <button
                        onClick={toggleAll}
                        className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors"
                        aria-label={allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
                    >
                        {allSelected
                            ? <CheckSquare2 className="h-4 w-4 text-amber-300" />
                            : <Square className="h-4 w-4" />}
                        {allSelected ? 'Deseleccionar todos' : `Seleccionar todos (${clients.length})`}
                    </button>
                    {someSelected && (
                        <span className="ml-auto text-xs font-bold text-amber-300">
                            {selected.size} seleccionado{selected.size === 1 ? '' : 's'}
                        </span>
                    )}
                </div>
            )}

            {/* Client rows with checkboxes */}
            {clients.map(client => (
                <div
                    key={client.id}
                    className={`group relative border-b border-zinc-800 last:border-b-0 transition-colors ${
                        selected.has(client.id) ? 'bg-amber-400/5' : ''
                    }`}
                >
                    {isAdmin && (
                        <button
                            onClick={() => toggleOne(client.id)}
                            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-1.5 touch-target"
                            aria-label={selected.has(client.id) ? `Deseleccionar ${client.name}` : `Seleccionar ${client.name}`}
                            style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            {selected.has(client.id)
                                ? <CheckSquare2 className="h-4 w-4 text-amber-300" />
                                : <Square className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />}
                        </button>
                    )}
                    <div className={isAdmin ? 'pl-10' : ''}>
                        {/* Slot for actual row content — rendered by parent via render prop / children */}
                        <div data-client-id={client.id} />
                    </div>
                </div>
            ))}

            {/* Result toast */}
            {result && (
                <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold shadow-xl ${
                    result.ok
                        ? 'bg-emerald-500 text-white'
                        : 'bg-red-500 text-white'
                }`}>
                    {result.msg}
                    <button onClick={() => setResult(null)} className="ml-1 opacity-70 hover:opacity-100">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}

            {/* Floating bulk action bar */}
            {someSelected && isAdmin && (
                <div className="fixed bottom-0 inset-x-0 z-40 border-t border-zinc-700 bg-zinc-900/95 backdrop-blur-md px-4 py-3 md:left-72 safe-bottom">
                    <div className="mx-auto flex max-w-4xl items-center gap-3">
                        <span className="text-sm font-bold text-amber-300 shrink-0">
                            {selected.size} seleccionado{selected.size === 1 ? '' : 's'}
                        </span>

                        <div className="flex flex-1 items-center justify-end gap-2">
                            {/* Assign coach */}
                            <div className="relative">
                                <button
                                    onClick={() => { setShowCoachPicker(v => !v); setConfirmArchive(false) }}
                                    disabled={pending}
                                    className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-300 transition-colors disabled:opacity-50"
                                >
                                    <Users className="h-3.5 w-3.5" />
                                    Asignar coach
                                    <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                                {showCoachPicker && (
                                    <div className="absolute bottom-full mb-2 right-0 w-52 rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl py-1 z-50">
                                        {coaches.length === 0 ? (
                                            <p className="px-3 py-2 text-xs text-zinc-500">No hay coaches activos</p>
                                        ) : coaches.map(c => (
                                            <button
                                                key={c.id}
                                                onClick={() => handleAssign(c.id)}
                                                className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors"
                                            >
                                                {c.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Archive */}
                            <button
                                onClick={() => { setConfirmArchive(true); setShowCoachPicker(false) }}
                                disabled={pending}
                                className="flex items-center gap-1.5 rounded-xl border border-zinc-600 px-3 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                            >
                                <Archive className="h-3.5 w-3.5" />
                                Archivar
                            </button>

                            {/* Cancel */}
                            <button
                                onClick={clearSelection}
                                disabled={pending}
                                className="flex items-center gap-1 rounded-xl px-2 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                                aria-label="Cancelar selección"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {/* Loading overlay */}
                    {pending && (
                        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 rounded-none">
                            <Loader2 className="h-5 w-5 animate-spin text-amber-300" />
                            <span className="ml-2 text-sm text-amber-300">Procesando...</span>
                        </div>
                    )}
                </div>
            )}

            {/* Archive confirm modal */}
            {confirmArchive && (
                <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
                    onClick={e => { if (e.target === e.currentTarget) setConfirmArchive(false) }}
                >
                    <div className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-5 space-y-4">
                        <h2 className="font-bold text-white">Archivar {selected.size} alumno{selected.size === 1 ? '' : 's'}</h2>
                        <p className="text-sm text-zinc-400">
                            Se marcarán como inactivos. No se eliminan datos. Podés reactivarlos manualmente.
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setConfirmArchive(false)}
                                className="flex-1 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleArchive}
                                className="flex-1 rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-600 transition-colors"
                            >
                                Archivar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
