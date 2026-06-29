'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Lock, Pencil, Plus, Trash2, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildAreaVMs } from '@/app/coach/builder/[clientId]/area-ui'
import type { WorkoutArea } from '@/domain/workout/types'
import { createAreaAction, deleteAreaAction, updateAreaAction } from '../_actions/areas.actions'

export function AreasManager({
    initialAreas,
    canEdit,
    scope,
}: {
    initialAreas: WorkoutArea[]
    canEdit: boolean
    scope: 'team' | 'standalone'
}) {
    const [areas, setAreas] = useState<WorkoutArea[]>(initialAreas)
    const [newName, setNewName] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [editOrder, setEditOrder] = useState('')
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const vms = useMemo(() => buildAreaVMs(areas), [areas])
    const vmById = useMemo(() => new Map(vms.map(v => [v.id, v])), [vms])
    const ordered = useMemo(
        () => [...areas].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
        [areas]
    )

    function handleCreate() {
        const name = newName.trim()
        // Enter en el input no pasa por el disabled del boton: misma guarda aqui
        if (isPending || name.length < 2) return
        startTransition(async () => {
            const res = await createAreaAction({ name })
            if (res.area) {
                setAreas(prev => [...prev, res.area!])
                setNewName('')
                toast.success(`Área "${res.area.name}" creada`)
            } else {
                toast.error(res.error ?? 'No se pudo crear el área')
            }
        })
    }

    function startEdit(area: WorkoutArea) {
        setEditingId(area.id)
        setEditName(area.name)
        setEditOrder(String(area.sort_order))
        setConfirmDeleteId(null)
    }

    function handleUpdate(area: WorkoutArea) {
        if (isPending) return
        const name = editName.trim()
        const sort = Number.parseInt(editOrder, 10)
        const payload: { id: string; name?: string; sort_order?: number } = { id: area.id }
        if (name && name !== area.name) payload.name = name
        if (Number.isFinite(sort) && sort !== area.sort_order) payload.sort_order = sort
        if (payload.name === undefined && payload.sort_order === undefined) {
            setEditingId(null)
            return
        }
        startTransition(async () => {
            const res = await updateAreaAction(payload)
            if (res.area) {
                setAreas(prev => prev.map(a => (a.id === area.id ? res.area! : a)))
                setEditingId(null)
                toast.success('Área actualizada')
            } else {
                toast.error(res.error ?? 'No se pudo actualizar el área')
            }
        })
    }

    function handleDelete(area: WorkoutArea) {
        if (isPending) return
        startTransition(async () => {
            const res = await deleteAreaAction({ id: area.id })
            if (res.success) {
                setAreas(prev => prev.filter(a => a.id !== area.id))
                setConfirmDeleteId(null)
                toast.success(`Área "${area.name}" eliminada. Sus ejercicios vuelven al área Principal.`)
            } else {
                toast.error(res.error ?? 'No se pudo eliminar el área')
            }
        })
    }

    return (
        <div className="space-y-4">
            {!canEdit && (
                <div className="flex items-center gap-2 rounded-card border border-subtle bg-surface-sunken/50 px-4 py-3 text-sm text-muted">
                    <Lock className="h-4 w-4 shrink-0" />
                    {scope === 'team'
                        ? 'Solo el owner o co-gestor del equipo gestiona las áreas del pool. Puedes usarlas en el builder.'
                        : 'No tienes permiso para editar las áreas.'}
                </div>
            )}

            <ul className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-card border border-subtle bg-surface-card">
                {ordered.map(area => {
                    const vm = vmById.get(area.id)
                    const isEditing = editingId === area.id
                    const isConfirming = confirmDeleteId === area.id
                    return (
                        <li key={area.id} className="flex items-center justify-between gap-3 p-4">
                            {isEditing ? (
                                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                    <input
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        maxLength={40}
                                        autoFocus
                                        className="h-10 min-w-0 flex-1 rounded-control border border-default bg-surface-card px-3 text-sm text-strong focus:border-sport-600 focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
                                        aria-label="Nombre del área"
                                    />
                                    <input
                                        value={editOrder}
                                        onChange={e => setEditOrder(e.target.value.replace(/[^0-9]/g, ''))}
                                        inputMode="numeric"
                                        className="h-10 w-20 rounded-control border border-default bg-surface-card px-3 text-center text-sm text-strong focus:border-sport-600 focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
                                        aria-label="Orden del área"
                                        title="Orden (menor = primero en el día)"
                                    />
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => handleUpdate(area)}
                                            disabled={isPending}
                                            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control bg-[var(--sport-100)] text-[var(--sport-600)] transition-colors hover:bg-[var(--sport-200)] md:min-h-[36px] md:min-w-[36px]"
                                            aria-label="Guardar cambios del área"
                                        >
                                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setEditingId(null)}
                                            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-sunken md:min-h-[36px] md:min-w-[36px]"
                                            aria-label="Cancelar edición"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex min-w-0 items-center gap-3">
                                        <span
                                            className={cn(
                                                'shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tight',
                                                vm?.badgeClass ?? 'border-subtle bg-surface-sunken text-muted',
                                            )}
                                        >
                                            {vm?.shortLabel ?? '—'}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold text-strong">{area.name}</p>
                                            <p className="text-xs text-muted">
                                                Orden {area.sort_order}
                                                {area.is_system && ' · Área del sistema (solo lectura)'}
                                            </p>
                                        </div>
                                    </div>
                                    {canEdit && !area.is_system && (
                                        <div className="flex shrink-0 items-center gap-1">
                                            {isConfirming ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(area)}
                                                        disabled={isPending}
                                                        className="flex min-h-[44px] items-center gap-1.5 rounded-control bg-[var(--danger-100)] px-3 text-xs font-bold text-[var(--danger-600)] transition-colors hover:bg-[color-mix(in_oklab,var(--danger-100)_75%,var(--danger-500))] md:min-h-[36px]"
                                                    >
                                                        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                        Confirmar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setConfirmDeleteId(null)}
                                                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-sunken md:min-h-[36px] md:min-w-[36px]"
                                                        aria-label="Cancelar eliminación"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => startEdit(area)}
                                                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-sunken hover:text-strong md:min-h-[36px] md:min-w-[36px]"
                                                        aria-label={`Editar área ${area.name}`}
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setConfirmDeleteId(area.id)}
                                                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control text-muted transition-colors hover:bg-[var(--danger-100)] hover:text-[var(--danger-600)] md:min-h-[36px] md:min-w-[36px]"
                                                        aria-label={`Eliminar área ${area.name}`}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </li>
                    )
                })}
            </ul>

            {canEdit && (
                <div className="flex items-center gap-2">
                    <input
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                        maxLength={40}
                        placeholder='Nueva área (ej: "Core", "HYROX")'
                        className="h-11 min-w-0 flex-1 rounded-control border border-default bg-surface-card px-4 text-sm text-strong placeholder:text-muted focus:border-sport-600 focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
                        aria-label="Nombre de la nueva área"
                    />
                    <button
                        type="button"
                        onClick={handleCreate}
                        disabled={isPending || newName.trim().length < 2}
                        className={cn(
                            'flex min-h-[44px] items-center gap-1.5 rounded-control px-4 text-sm font-bold transition-colors',
                            newName.trim().length >= 2 && !isPending
                                ? 'bg-sport-500 text-[var(--text-on-sport)] shadow-[var(--glow-sport)] hover:bg-[var(--cta-fill)]'
                                : 'cursor-not-allowed bg-surface-sunken text-muted',
                        )}
                    >
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Crear
                    </button>
                </div>
            )}

            <p className="text-xs leading-relaxed text-muted">
                Las áreas ordenan los ejercicios de cada día en el builder (orden menor = primero).
                Al eliminar un área, los ejercicios que la usaban no se pierden: vuelven a verse bajo
                el área Principal.
            </p>
        </div>
    )
}
