'use client'

import { useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { reassignClientAction } from '../../_actions/org.actions'

interface Coach {
    id: string
    name: string
}

interface Props {
    orgSlug: string
    clientId: string
    currentCoachId: string
    coaches: Coach[]
}

export function ReassignClientSelect({ orgSlug, clientId, currentCoachId, coaches }: Props) {
    const [pending, startTransition] = useTransition()

    function handleChange(newCoachId: string) {
        if (!newCoachId || newCoachId === currentCoachId) return
        startTransition(async () => {
            const res = await reassignClientAction(orgSlug, clientId, newCoachId)
            if (res?.error) alert(res.error)
        })
    }

    return (
        <div className="relative flex items-center">
            {pending && (
                <Loader2 className="absolute right-6 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-amber-300 pointer-events-none" />
            )}
            <select
                defaultValue={currentCoachId}
                onChange={e => handleChange(e.target.value)}
                disabled={pending}
                className="h-7 pl-1.5 pr-6 text-[11px] rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-amber-400/60 disabled:opacity-50 appearance-none"
                aria-label="Reasignar coach"
            >
                {coaches.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
        </div>
    )
}
