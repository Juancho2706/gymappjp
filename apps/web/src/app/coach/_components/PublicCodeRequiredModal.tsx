'use client'

import { useTransition } from 'react'
import { Check, Copy, Loader2, LockKeyhole } from 'lucide-react'
import { confirmCoachPublicCodeAction } from '../_actions/public-code.actions'

interface Props {
    inviteCode: string
}

export function PublicCodeRequiredModal({ inviteCode }: Props) {
    const [pending, startTransition] = useTransition()
    const studentPath = `/c/${inviteCode}/login`

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-2xl">
                <div className="mb-4 flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <LockKeyhole className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold">Tu link de alumnos cambió a código corto</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Este cambio mejora el acceso móvil y evita errores al compartir links. Tu slug anterior seguirá funcionando como respaldo.
                        </p>
                    </div>
                </div>

                <div className="rounded-xl border border-border bg-muted/50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nuevo acceso alumnos</p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                        <code className="rounded-md bg-background px-2 py-1 font-mono text-sm">{studentPath}</code>
                        <button
                            type="button"
                            onClick={() => navigator.clipboard?.writeText(studentPath)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                        >
                            <Copy className="h-3.5 w-3.5" />
                            Copiar
                        </button>
                    </div>
                </div>

                <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                        startTransition(async () => {
                            const res = await confirmCoachPublicCodeAction()
                            if (!res.ok) {
                                alert(res.error)
                                return
                            }
                            window.location.reload()
                        })
                    }}
                    className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                >
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Entendido, usar mi código
                </button>
            </div>
        </div>
    )
}
