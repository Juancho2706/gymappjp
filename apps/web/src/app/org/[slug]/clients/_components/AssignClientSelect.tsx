'use client'

import { useTransition } from 'react'
import { assignClientToCoach } from '../../_actions/clients.actions'

interface Coach {
    id: string
    full_name: string | null
    slug: string | null
}

interface Props {
    orgSlug: string
    clientId: string
    currentCoachId?: string
    coaches: Coach[]
}

export function AssignClientSelect({ orgSlug, clientId, currentCoachId, coaches }: Props) {
    const [pending, startTransition] = useTransition()

    const handleChange = (coachId: string) => {
        if (!coachId) return
        startTransition(async () => {
            const res = await assignClientToCoach(orgSlug, clientId, coachId)
            if (res?.error) { alert(res.error); return }
            // Pool client's first assignment generated credentials — show for manual delivery (no email sent).
            if (res?.credentials) {
                const { email, tempPassword, loginUrl } = res.credentials
                alert(`Accesos del alumno (compártelos manualmente, no se envía email):\n\nEmail: ${email}\nContraseña temporal: ${tempPassword}${loginUrl ? `\nLink: ${loginUrl}` : ''}`)
            }
        })
    }

    return (
        <select
            defaultValue={currentCoachId ?? ''}
            onChange={e => handleChange(e.target.value)}
            disabled={pending}
            className="h-7 px-1.5 text-[11px] rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
        >
            <option value="">Sin asignar</option>
            {coaches.map(c => (
                <option key={c.id} value={c.id}>{c.full_name ?? c.slug}</option>
            ))}
        </select>
    )
}
