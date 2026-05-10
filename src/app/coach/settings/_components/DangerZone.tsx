'use client'

import { useState, useTransition } from 'react'
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react'
import { deleteCoachAccountAction } from '../actions'

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
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 space-y-4">
            <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/15">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                </div>
                <div>
                    <h3 className="font-semibold text-foreground">Zona de peligro</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Acciones irreversibles. Leé con atención antes de continuar.
                    </p>
                </div>
            </div>

            <div className="rounded-xl border border-destructive/20 bg-card p-4 space-y-2">
                <p className="text-sm font-semibold text-foreground">Eliminar mi cuenta</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                    Se eliminarán tus datos de acceso, los datos personales de tus alumnos serán anonimizados,
                    y los registros de entrenamiento y nutrición serán borrados. Tu suscripción activa
                    será cancelada. Esta acción <strong className="text-foreground">no se puede deshacer</strong>.
                </p>
                <button
                    type="button"
                    onClick={() => { setOpen(true); setConfirmText(''); setError(null) }}
                    className="mt-2 flex items-center gap-2 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar mi cuenta
                </button>
            </div>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
                    <div className="w-full max-w-md rounded-2xl border border-destructive/30 bg-card p-6 shadow-2xl space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/15">
                                <Trash2 className="h-5 w-5 text-destructive" />
                            </div>
                            <div>
                                <h2 className="font-bold text-foreground">Eliminar cuenta</h2>
                                <p className="text-xs text-muted-foreground">Esta acción es permanente e irreversible.</p>
                            </div>
                        </div>

                        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-muted-foreground space-y-1.5">
                            <p>Al confirmar:</p>
                            <ul className="list-disc list-inside space-y-1 ml-1">
                                <li>Datos personales de tus alumnos serán anonimizados</li>
                                <li>Registros de entrenamiento y nutrición serán eliminados</li>
                                <li>Suscripción activa será cancelada en MercadoPago</li>
                                <li>Serás desuscripto de todos los emails de EVA</li>
                            </ul>
                            <p className="text-[11px] text-muted-foreground/70 pt-1">
                                Los registros contables se conservan 6 años por obligación legal (Ley SII).
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-foreground">
                                Escribí <span className="font-mono text-destructive">ELIMINAR</span> para confirmar
                            </label>
                            <input
                                type="text"
                                value={confirmText}
                                onChange={(e) => setConfirmText(e.target.value)}
                                placeholder="ELIMINAR"
                                className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-destructive"
                            />
                        </div>

                        {error && (
                            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                {error}
                            </p>
                        )}

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                disabled={isPending}
                                className="flex-1 h-10 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={isPending || confirmText !== 'ELIMINAR'}
                                className="flex-1 h-10 rounded-xl bg-destructive text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
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
