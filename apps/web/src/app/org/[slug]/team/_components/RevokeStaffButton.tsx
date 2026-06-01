'use client'

import { useState, useTransition } from 'react'
import { Loader2, ShieldOff, X } from 'lucide-react'
import { revokeStaffAction } from '../../_actions/org.actions'

interface Props {
    orgSlug: string
    memberId: string
    memberName: string
    memberRole: string
}

export function RevokeStaffButton({ orgSlug, memberId, memberName, memberRole }: Props) {
    const [open, setOpen] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    function handleRevoke() {
        setError(null)
        startTransition(async () => {
            const res = await revokeStaffAction(orgSlug, memberId)
            if (res?.error) {
                setError(res.error)
            } else {
                setOpen(false)
            }
        })
    }

    return (
        <>
            <button
                onClick={() => { setOpen(true); setError(null) }}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                aria-label={`Revocar acceso a ${memberName}`}
            >
                <ShieldOff className="w-3 h-3" />
                Revocar
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 pl-safe pr-safe"
                    onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
                >
                    <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl pb-safe border border-border bg-background shadow-xl p-5 space-y-4">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <h2 className="font-semibold text-sm">Revocar acceso enterprise</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">{memberName} · {memberRole}</p>
                            </div>
                            <button
                                onClick={() => setOpen(false)}
                                className="text-muted-foreground hover:text-foreground"
                                aria-label="Cerrar"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="rounded-lg bg-zinc-900 border border-zinc-700 p-3 space-y-1.5 text-xs text-zinc-400">
                            <p>✓ Pierde acceso al dashboard enterprise de esta organización</p>
                            <p>✓ Su sesión activa queda invalidada para este workspace</p>
                            <p>✓ Queda registrado en el audit log</p>
                            <p className="text-zinc-500 pt-1">Su cuenta EVA y otros workspaces no se ven afectados.</p>
                        </div>

                        {error && (
                            <p className="text-xs text-red-400 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2">
                                {error}
                            </p>
                        )}

                        <div className="flex gap-2">
                            <button
                                onClick={() => setOpen(false)}
                                disabled={pending}
                                className="flex-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleRevoke}
                                disabled={pending}
                                className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                            >
                                {pending
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : <ShieldOff className="w-3 h-3" />}
                                Revocar acceso
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
