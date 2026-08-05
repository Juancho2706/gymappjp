'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Send } from 'lucide-react'
import { resendOwnerInviteAction } from '../_actions/orgs.actions'

interface Props {
    orgId: string
    ownerEmail?: string
}

export function ResendOwnerInviteButton({ orgId, ownerEmail }: Props) {
    const [open, setOpen] = useState(false)
    const [email, setEmail] = useState(ownerEmail ?? '')
    const [error, setError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    function submit(e: React.FormEvent<HTMLFormElement>) {
        // Se llama la server action a mano (firma intacta: prevState + FormData) para poder
        // reaccionar al resultado; con useActionState el `success` quedaba pegado para siempre
        // y la fila no se podia reenviar nunca mas.
        e.preventDefault()
        const target = email.trim()
        const fd = new FormData()
        fd.set('orgId', orgId)
        fd.set('email', target)

        startTransition(async () => {
            const res = await resendOwnerInviteAction({}, fd)
            if (res.error) {
                setError(res.error)
                toast.error(res.error)
                return
            }
            setError(null)
            toast.success(`Invitación enviada a ${target}`)
            setOpen(false)
        })
    }

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
            >
                Reenviar invitación
            </button>
        )
    }

    return (
        <form onSubmit={submit} className="flex flex-col gap-1.5 min-w-[180px]">
            <input
                name="email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="email@org.com"
                className="h-7 px-2 text-[11px] rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)] w-full"
            />
            {error && (
                <p className="text-[10px] text-[var(--danger-500)]">{error}</p>
            )}
            <div className="flex gap-1">
                <button
                    type="submit"
                    disabled={pending}
                    className="flex items-center gap-1 h-6 px-2 text-[11px] bg-[var(--cta-fill)] text-white rounded hover:bg-[var(--sport-600)] disabled:opacity-50 transition-colors"
                >
                    <Send className="w-2.5 h-2.5" />
                    {pending ? '...' : 'Enviar'}
                </button>
                <button
                    type="button"
                    onClick={() => { setError(null); setOpen(false) }}
                    className="h-6 px-2 text-[11px] border border-border rounded hover:bg-muted transition-colors"
                >
                    Cancelar
                </button>
            </div>
        </form>
    )
}
