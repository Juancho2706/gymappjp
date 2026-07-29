'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Archive, Trash2 } from 'lucide-react'
import { archiveClientsForFreeAction, deleteClientsForFreeAction } from '../_actions/reactivate.actions'

export interface ReactivateArchiveClient {
    id: string
    full_name: string
}

interface Props {
    clients: ReactivateArchiveClient[]
    activeClientCount: number
    freeLimit: number
}

/**
 * Panel inline de archivado en `/coach/reactivate` — salida del deadlock de cupo. Deja al coach
 * bloqueado bajar a ≤ `freeLimit` alumnos sin pagar; al recargar, la tarjeta "Continuar con plan
 * gratuito" (que re-valida el cupo server-side) queda disponible.
 *
 * Dos salidas sobre la MISMA selección: archivar (reversible, default) o eliminar definitivamente
 * (borra cuenta + datos, sin vuelta atrás → confirmación explícita antes de disparar).
 */
export function ReactivateArchivePanel({ clients, activeClientCount, freeLimit }: Props) {
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [isArchiving, setIsArchiving] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [confirmingDelete, setConfirmingDelete] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const toArchive = Math.max(0, activeClientCount - freeLimit)
    const remainingAfter = activeClientCount - selected.size
    const missing = Math.max(0, remainingAfter - freeLimit)

    const sorted = useMemo(
        () => [...clients].sort((a, b) => a.full_name.localeCompare(b.full_name, 'es')),
        [clients]
    )

    const toggle = (id: string) => {
        // Cambiar la selección invalida la confirmación: nunca borrar sobre un conteo que el coach
        // no llegó a leer.
        setConfirmingDelete(false)
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const handleArchive = async () => {
        if (selected.size === 0) return
        setIsArchiving(true)
        setError(null)
        try {
            const result = await archiveClientsForFreeAction(Array.from(selected))
            if (result.error) {
                setError(result.error)
                setIsArchiving(false)
                return
            }
            // Recarga: el server recomputa activeClientCount y habilita "Continuar gratis".
            window.location.reload()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudieron archivar los alumnos.')
            setIsArchiving(false)
        }
    }

    const handleDelete = async () => {
        if (selected.size === 0) return
        setIsDeleting(true)
        setError(null)
        try {
            const result = await deleteClientsForFreeAction(Array.from(selected))
            if (result.error) {
                setError(result.error)
                setConfirmingDelete(false)
                setIsDeleting(false)
                return
            }
            // Misma recarga que archivar: el server recomputa activeClientCount.
            window.location.reload()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudieron eliminar los alumnos.')
            setConfirmingDelete(false)
            setIsDeleting(false)
        }
    }

    return (
        <section id="reactivate-archive" className="mb-4 rounded-card border border-subtle bg-surface-card p-4">
            <div className="flex items-start gap-2.5">
                <Archive className="mt-0.5 h-4 w-4 shrink-0 text-sport-600" />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-strong">Volver al plan gratuito sin pagar</p>
                    <p className="mt-0.5 text-xs text-muted">
                        El plan gratuito cubre hasta {freeLimit} alumnos. Archiva{' '}
                        {toArchive > 0 ? `${toArchive} alumno${toArchive !== 1 ? 's' : ''}` : 'alumnos'} para bajar a{' '}
                        {freeLimit} y seguir gratis. Archivar no borra nada: puedes desarchivarlos cuando quieras. Si
                        ya no vas a entrenarlos, también puedes eliminarlos definitivamente.
                    </p>
                </div>
            </div>

            <ul className="mt-3 flex flex-col gap-1.5">
                {sorted.map((c) => {
                    const checked = selected.has(c.id)
                    return (
                        <li key={c.id}>
                            <label
                                className={`flex cursor-pointer items-center gap-3 rounded-control border p-3 transition-colors ${
                                    checked ? 'border-sport-500 bg-sport-100/40' : 'border-subtle hover:bg-surface-sunken'
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggle(c.id)}
                                    className="h-4 w-4 shrink-0 accent-[var(--sport-500)]"
                                />
                                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-strong">
                                    {c.full_name}
                                </span>
                            </label>
                        </li>
                    )
                })}
            </ul>

            <p className="mt-3 text-xs text-muted">
                Seleccionados: <span className="font-semibold text-strong">{selected.size}</span> · Quedarán{' '}
                <span className={`font-semibold ${missing === 0 ? 'text-[var(--success-600)]' : 'text-strong'}`}>
                    {remainingAfter}
                </span>{' '}
                activos
                {missing > 0 && (
                    <>
                        {' '}
                        — te falta{missing !== 1 ? 'n' : ''} {missing} para llegar a {freeLimit}
                    </>
                )}
            </p>

            {error && (
                <div className="mt-3 flex items-center gap-2.5 rounded-control bg-[var(--danger-100)] px-3.5 py-2.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--danger-600)]" />
                    <p className="text-[13px] font-semibold text-strong">{error}</p>
                </div>
            )}

            {confirmingDelete ? (
                <div className="mt-3 rounded-control border border-[var(--cta-danger)] bg-[var(--danger-100)] p-3.5">
                    <div className="flex items-start gap-2.5">
                        <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger-600)]" />
                        <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-bold text-strong">
                                ¿Eliminar {selected.size} alumno{selected.size !== 1 ? 's' : ''} definitivamente?
                            </p>
                            <p className="mt-1 text-xs text-muted">
                                Se eliminarán sus cuentas y todos sus datos: rutinas, check-ins, fotos y progreso. A
                                diferencia de archivar,{' '}
                                <strong className="font-semibold text-strong">esto no se puede deshacer</strong> y no
                                podrás recuperarlos.
                            </p>
                        </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                        <button
                            type="button"
                            onClick={() => setConfirmingDelete(false)}
                            disabled={isDeleting}
                            className="inline-flex h-10 shrink-0 items-center justify-center rounded-control px-4 text-[13px] font-bold text-muted transition-colors hover:bg-surface-sunken disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-control bg-[var(--cta-danger)] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[color-mix(in_oklab,var(--cta-danger)_90%,#000)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        >
                            <Trash2 className="h-4 w-4" />
                            {isDeleting ? 'Eliminando...' : 'Sí, eliminar definitivamente'}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={handleArchive}
                        disabled={isArchiving || isDeleting || selected.size === 0}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-control bg-sport-500 px-4 text-[13px] font-bold text-white transition-colors hover:bg-sport-600 disabled:opacity-60 disabled:hover:bg-sport-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                        <Archive className="h-4 w-4" />
                        {isArchiving
                            ? 'Archivando...'
                            : `Archivar ${selected.size > 0 ? `${selected.size} ` : ''}alumno${selected.size !== 1 ? 's' : ''}`}
                    </button>
                    <button
                        type="button"
                        onClick={() => setConfirmingDelete(true)}
                        disabled={isArchiving || isDeleting || selected.size === 0}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-control bg-[color-mix(in_oklab,var(--cta-danger)_12%,transparent)] px-4 text-[13px] font-bold text-[var(--cta-danger)] transition-colors hover:bg-[color-mix(in_oklab,var(--cta-danger)_20%,transparent)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                        <Trash2 className="h-4 w-4" />
                        Eliminar seleccionados
                    </button>
                </div>
            )}
        </section>
    )
}
