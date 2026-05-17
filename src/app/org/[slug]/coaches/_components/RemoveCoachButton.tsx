'use client'

import { useTransition } from 'react'
import { Loader2, X } from 'lucide-react'
import { removeCoachAction } from '../../_actions/org.actions'

interface Props {
    orgSlug: string
    memberId: string
    label?: string
}

export function RemoveCoachButton({ orgSlug, memberId, label = 'Remover' }: Props) {
    const [pending, startTransition] = useTransition()

    const handleClick = () => {
        if (!confirm(`¿${label} este coach de la organización?`)) return
        startTransition(async () => {
            const res = await removeCoachAction(orgSlug, memberId)
            if (res?.error) alert(res.error)
        })
    }

    return (
        <button
            onClick={handleClick}
            disabled={pending}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
        >
            {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
            {label}
        </button>
    )
}
