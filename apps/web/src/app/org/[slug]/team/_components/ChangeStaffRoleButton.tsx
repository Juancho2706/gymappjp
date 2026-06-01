'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, Loader2, X } from 'lucide-react'
import { updateStaffRoleAction } from '../../_actions/org.actions'

const ROLE_OPTIONS = [
    { value: 'org_admin', label: 'Admin', description: 'Operación completa, equipo' },
    { value: 'ops', label: 'Operaciones', description: 'Coaches, alumnos, asignaciones' },
    { value: 'analyst', label: 'Analista', description: 'Solo lectura' },
    { value: 'brand_manager', label: 'Marca', description: 'Brand Studio únicamente' },
] as const

type ChangeableRole = 'org_admin' | 'ops' | 'analyst' | 'brand_manager'

interface Props {
    orgSlug: string
    memberId: string
    memberName: string
    currentRole: string
}

export function ChangeStaffRoleButton({ orgSlug, memberId, memberName, currentRole }: Props) {
    const [open, setOpen] = useState(false)
    const [selected, setSelected] = useState<ChangeableRole | ''>(
        ROLE_OPTIONS.find(r => r.value === currentRole)?.value ?? ''
    )
    const [error, setError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    function handleOpen() { setOpen(true); setError(null); setSelected(ROLE_OPTIONS.find(r => r.value === currentRole)?.value ?? '') }
    function handleClose() { if (pending) return; setOpen(false); setError(null) }

    function handleConfirm() {
        if (!selected || selected === currentRole) { handleClose(); return }
        setError(null)
        startTransition(async () => {
            const res = await updateStaffRoleAction(orgSlug, memberId, selected)
            if (res?.error) {
                setError(res.error)
            } else {
                setOpen(false)
            }
        })
    }

    const currentLabel = ROLE_OPTIONS.find(r => r.value === currentRole)?.label ?? currentRole

    return (
        <>
            <button
                onClick={handleOpen}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                aria-label={`Cambiar rol de ${memberName}`}
            >
                {currentLabel}
                <ChevronDown className="w-3 h-3" />
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 pl-safe pr-safe"
                    onClick={e => { if (e.target === e.currentTarget) handleClose() }}
                >
                    <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl pb-safe border border-border bg-zinc-900 shadow-xl p-5 space-y-4">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <h2 className="font-semibold text-sm text-zinc-100">Cambiar rol</h2>
                                <p className="text-xs text-zinc-500 mt-0.5">{memberName}</p>
                            </div>
                            <button onClick={handleClose} className="text-zinc-500 hover:text-zinc-300" aria-label="Cerrar">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-2">
                            {ROLE_OPTIONS.map(role => (
                                <label
                                    key={role.value}
                                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                                        selected === role.value
                                            ? 'border-amber-400/40 bg-amber-400/5'
                                            : 'border-zinc-700 bg-zinc-950/60 hover:border-zinc-600'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="role"
                                        value={role.value}
                                        checked={selected === role.value}
                                        onChange={() => setSelected(role.value)}
                                        className="accent-amber-400"
                                    />
                                    <div>
                                        <p className={`text-sm font-medium ${selected === role.value ? 'text-amber-300' : 'text-zinc-200'}`}>{role.label}</p>
                                        <p className="text-xs text-zinc-500">{role.description}</p>
                                    </div>
                                </label>
                            ))}
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
                                onClick={handleConfirm}
                                disabled={pending || !selected || selected === currentRole}
                                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-black hover:bg-amber-300 transition-colors disabled:opacity-50"
                            >
                                {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                Cambiar rol
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
