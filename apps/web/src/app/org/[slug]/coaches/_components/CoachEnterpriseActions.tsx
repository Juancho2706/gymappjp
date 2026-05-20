'use client'

import { useTransition } from 'react'
import { KeyRound, Loader2, Shield, UserRound } from 'lucide-react'
import { resetEnterpriseCoachPasswordAction, updateEnterpriseCoachRoleAction } from '../../_actions/org.actions'

interface Props {
    orgSlug: string
    memberId: string
    coachId: string
    role: string
    canManageRole: boolean
}

export function CoachEnterpriseActions({ orgSlug, memberId, coachId, role, canManageRole }: Props) {
    const [pending, startTransition] = useTransition()
    const nextRole = role === 'org_admin' ? 'coach' : 'org_admin'

    const resetPassword = () => {
        startTransition(async () => {
            const res = await resetEnterpriseCoachPasswordAction(orgSlug, coachId)
            if (res?.error) {
                alert(res.error)
                return
            }
            if (res?.tempPassword) {
                alert(`Password temporal:\n${res.tempPassword}`)
            }
        })
    }

    const changeRole = () => {
        const label = nextRole === 'org_admin' ? 'admin' : 'coach'
        if (!confirm(`Cambiar rol a ${label}?`)) return
        startTransition(async () => {
            const res = await updateEnterpriseCoachRoleAction(orgSlug, memberId, nextRole)
            if (res?.error) alert(res.error)
        })
    }

    return (
        <div className="flex items-center gap-1">
            <button
                type="button"
                disabled={pending}
                onClick={resetPassword}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
                {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                Reset
            </button>
            {canManageRole && (
                <button
                    type="button"
                    disabled={pending}
                    onClick={changeRole}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                    {nextRole === 'org_admin' ? <Shield className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
                    {nextRole === 'org_admin' ? 'Admin' : 'Coach'}
                </button>
            )}
        </div>
    )
}
