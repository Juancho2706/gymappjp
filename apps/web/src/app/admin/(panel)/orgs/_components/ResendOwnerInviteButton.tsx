'use client'

import { useActionState, useState } from 'react'
import { resendOwnerInviteAction } from '../_actions/orgs.actions'
import { Send, CheckCircle2 } from 'lucide-react'

interface Props {
    orgId: string
    ownerEmail?: string
}

const initial: { error?: string; success?: boolean } = {}

export function ResendOwnerInviteButton({ orgId, ownerEmail }: Props) {
    const [open, setOpen] = useState(false)
    const [state, action, pending] = useActionState(resendOwnerInviteAction, initial)

    if (state.success) {
        return (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" /> Enviado
            </span>
        )
    }

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 whitespace-nowrap"
            >
                Reenviar invitación
            </button>
        )
    }

    return (
        <form action={action} className="flex flex-col gap-1.5 min-w-[180px]">
            <input type="hidden" name="orgId" value={orgId} />
            <input
                name="email"
                type="email"
                required
                defaultValue={ownerEmail ?? ''}
                placeholder="email@org.com"
                className="h-7 px-2 text-[11px] rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 w-full"
            />
            {state.error && (
                <p className="text-[10px] text-red-500">{state.error}</p>
            )}
            <div className="flex gap-1">
                <button
                    type="submit"
                    disabled={pending}
                    className="flex items-center gap-1 h-6 px-2 text-[11px] bg-violet-600 text-white rounded hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                    <Send className="w-2.5 h-2.5" />
                    {pending ? '...' : 'Enviar'}
                </button>
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="h-6 px-2 text-[11px] border border-border rounded hover:bg-muted transition-colors"
                >
                    Cancelar
                </button>
            </div>
        </form>
    )
}
