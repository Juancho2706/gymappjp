'use client'

import { useState, useTransition } from 'react'
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react'
import { deleteCoachAccountAction } from '../_actions/settings.actions'

export function DangerZone() {
    const [open, setOpen] = useState(false)
    const [confirmText, setConfirmText] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    function handleDelete() {
        setError(null)
        startTransition(async () => {
            const result = await deleteCoachAccountAction(confirmText)
            if ('error' in result) setError(result.error)
            // On success: server redirects to /login?deleted=true
        })
    }

    return (
        <div className="space-y-3">
            <p className="px-1 text-[11px] font-extrabold uppercase tracking-[0.07em]" style={{ color: 'var(--danger-600)' }}>
                Zona de peligro
            </p>
            <div className="rounded-card border bg-surface-card p-4" style={{ borderColor: 'var(--danger-100)', borderWidth: '1.5px' }}>
                <div className="flex items-center gap-3.5">
                    <span
                        className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-control"
                        style={{ background: 'var(--danger-100)', color: 'var(--danger-600)' }}
                    >
                        <Trash2 className="h-[22px] w-[22px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-bold text-strong">Eliminar mi cuenta</p>
                        <p className="mt-0.5 text-[12.5px] text-muted">Acción irreversible — cancela tu plan activo.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => { setOpen(true); setConfirmText(''); setError(null) }}
                        className="shrink-0 rounded-control border px-3 py-2 text-sm font-bold transition-colors hover:bg-[var(--danger-100)]"
                        style={{ color: 'var(--danger-600)', borderColor: 'var(--danger-100)' }}
                    >
                        Eliminar…
                    </button>
                </div>
            </div>

            {open && (
                <div
                    className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4"
                    style={{ background: 'var(--surface-overlay)' }}
                    onClick={() => !isPending && setOpen(false)}
                >
                    <div
                        className="w-full max-w-md space-y-4 rounded-t-[var(--radius-sheet)] bg-surface-card p-6 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] shadow-[var(--shadow-xl)] sm:rounded-card sm:pb-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mx-auto h-1 w-10 rounded-pill bg-[var(--border-default)] sm:hidden" />
                        <div className="flex flex-col items-center text-center">
                            <span
                                className="mb-3 flex items-center justify-center rounded-full"
                                style={{ background: 'var(--danger-100)', color: 'var(--danger-600)', width: '52px', height: '52px' }}
                            >
                                <AlertTriangle className="h-6 w-6" />
                            </span>
                            <h2 className="font-display text-xl font-black text-strong">Eliminar cuenta</h2>
                            <p className="mt-1 text-xs text-muted">Esta acción es permanente e irreversible.</p>
                        </div>

                        <div className="rounded-control border p-3 text-xs text-body" style={{ borderColor: 'var(--danger-100)', background: 'color-mix(in oklab, var(--danger-100) 35%, transparent)' }}>
                            <p className="font-semibold text-strong">Al confirmar:</p>
                            <ul className="mt-2 list-disc space-y-1 pl-4 text-muted">
                                <li>Datos personales de tus alumnos serán anonimizados</li>
                                <li>Registros de entrenamiento y nutrición serán eliminados</li>
                                <li>Suscripción activa será cancelada en MercadoPago</li>
                                <li>Serás desuscripto de todos los emails de EVA</li>
                            </ul>
                            <p className="pt-2 text-[11px] text-subtle">
                                Los registros contables se conservan 6 años por obligación legal (Ley SII).
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-strong">
                                Escribí <span className="font-mono" style={{ color: 'var(--danger-600)' }}>ELIMINAR</span> para confirmar
                            </label>
                            <input
                                type="text"
                                value={confirmText}
                                onChange={(e) => setConfirmText(e.target.value)}
                                placeholder="ELIMINAR"
                                className="w-full rounded-control bg-surface-card px-3 py-2.5 text-sm font-mono font-bold tracking-[0.06em] text-strong outline-none transition-colors"
                                style={{ border: `1.5px solid ${confirmText === 'ELIMINAR' ? 'var(--danger-500)' : 'var(--border-default)'}` }}
                            />
                        </div>

                        {error && (
                            <p className="rounded-control border px-3 py-2 text-xs" style={{ borderColor: 'var(--danger-100)', background: 'color-mix(in oklab, var(--danger-100) 45%, transparent)', color: 'var(--danger-600)' }}>
                                {error}
                            </p>
                        )}

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                disabled={isPending}
                                className="h-12 flex-1 rounded-control border border-default text-sm font-bold text-muted transition-colors hover:text-strong disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={isPending || confirmText !== 'ELIMINAR'}
                                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-control text-sm font-bold transition-colors disabled:opacity-50 bg-[var(--cta-danger)] text-white hover:opacity-90"
                            >
                                {isPending ? (
                                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Eliminando...</>
                                ) : (
                                    <><Trash2 className="h-3.5 w-3.5" /> Eliminar cuenta</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
