'use client'

import { useActionState } from 'react'
import { Loader2, UserPlus } from 'lucide-react'
import { useFormStatus } from 'react-dom'
import { inviteCoachAction } from '../../_actions/org.actions'

interface Props {
    orgSlug: string
}

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Vincular
        </button>
    )
}

export function InviteCoachForm({ orgSlug }: Props) {
    const [state, action] = useActionState(
        async (_: unknown, formData: FormData) => inviteCoachAction(orgSlug, formData),
        null
    )

    return (
        <form action={action} className="space-y-3">
            <div className="flex gap-2">
                <input
                    name="email"
                    type="email"
                    required
                    placeholder="coach existente@email.com"
                    className="flex-1 h-9 px-3 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500"
                />
                <select
                    name="role"
                    defaultValue="coach"
                    className="h-9 px-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500"
                >
                    <option value="coach">Coach</option>
                    <option value="org_admin">Admin</option>
                </select>
                <SubmitButton />
            </div>
            {state?.error && (
                <p className="text-xs text-red-400">{state.error}</p>
            )}
            {state?.success && (
                <p className="text-xs text-emerald-500">Coach existente vinculado correctamente</p>
            )}
        </form>
    )
}
