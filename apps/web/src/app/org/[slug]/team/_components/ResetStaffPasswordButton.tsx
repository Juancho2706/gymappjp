'use client'

import { useState, useTransition } from 'react'
import { Copy, Check, KeyRound, Loader2, X, TriangleAlert } from 'lucide-react'
import { resetStaffPasswordAction } from '../../_actions/org.actions'

interface Props {
    orgSlug: string
    memberId: string
    memberName: string
}

export function ResetStaffPasswordButton({ orgSlug, memberId, memberName }: Props) {
    const [open, setOpen] = useState(false)
    const [tempPassword, setTempPassword] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    function handleOpen() { setOpen(true); setTempPassword(null); setError(null); setCopied(false) }
    function handleClose() { if (pending) return; setOpen(false); setTempPassword(null); setError(null) }

    function handleReset() {
        setError(null)
        startTransition(async () => {
            const res = await resetStaffPasswordAction(orgSlug, memberId)
            if (res?.error) {
                setError(res.error)
            } else if (res?.tempPassword) {
                setTempPassword(res.tempPassword)
            }
        })
    }

    function copyPassword() {
        if (!tempPassword) return
        navigator.clipboard.writeText(tempPassword).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }

    return (
        <>
            <button
                onClick={handleOpen}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
                aria-label={`Resetear contraseña de ${memberName}`}
            >
                <KeyRound className="w-3 h-3" />
                Reset pwd
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 pl-safe pr-safe"
                    onClick={e => { if (e.target === e.currentTarget) handleClose() }}
                >
                    <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl pb-safe border border-border bg-zinc-900 shadow-xl p-5 space-y-4">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <h2 className="font-semibold text-sm text-zinc-100">Resetear contraseña</h2>
                                <p className="text-xs text-zinc-500 mt-0.5">{memberName}</p>
                            </div>
                            <button onClick={handleClose} className="text-zinc-500 hover:text-zinc-300" aria-label="Cerrar">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {!tempPassword ? (
                            <>
                                <div className="flex items-start gap-2 rounded-lg bg-amber-400/5 border border-amber-400/20 p-3">
                                    <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400/80" />
                                    <p className="text-[11px] leading-4 text-amber-300/80">
                                        Se genera una nueva contraseña temporal. La anterior queda inválida inmediatamente. Comparte la nueva por canal seguro externo a EVA.
                                    </p>
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
                                        onClick={handleReset}
                                        disabled={pending}
                                        className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-zinc-700 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-600 transition-colors disabled:opacity-50"
                                    >
                                        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                                        Generar nueva contraseña
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="text-xs font-medium text-zinc-400">Contraseña temporal generada</p>
                                <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">
                                    <code className="flex-1 text-sm font-mono text-amber-300 select-all">{tempPassword}</code>
                                    <button
                                        onClick={copyPassword}
                                        className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors"
                                        aria-label="Copiar contraseña"
                                    >
                                        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                </div>

                                <p className="text-[11px] leading-4 text-zinc-500">
                                    Comparte esta contraseña por Slack, WhatsApp o email seguro. Quedó registrado en el audit log.
                                </p>

                                <button
                                    onClick={handleClose}
                                    className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
                                >
                                    Listo
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}
