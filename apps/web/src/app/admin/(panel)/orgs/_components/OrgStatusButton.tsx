'use client'

import { useState, useTransition } from 'react'
import { setOrgStatusAction } from '../_actions/orgs.actions'

interface Props {
    orgId: string
    currentStatus: string
}

export function OrgStatusButton({ orgId, currentStatus }: Props) {
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const isSuspended = currentStatus === 'suspended'

    return (
        <span className="inline-flex items-center gap-2">
            <button
                type="button"
                disabled={isPending}
                onClick={() => {
                    startTransition(async () => {
                        setError(null)
                        const next = isSuspended ? 'active' : 'suspended'
                        const result = await setOrgStatusAction(orgId, next)
                        if ('error' in result) setError(result.error)
                    })
                }}
                className={`text-[11px] whitespace-nowrap transition-colors disabled:opacity-50 underline underline-offset-2 ${
                    isSuspended
                        ? 'text-emerald-600 hover:text-emerald-500'
                        : 'text-red-500 hover:text-red-400'
                }`}
            >
                {isPending ? '...' : isSuspended ? 'Activar' : 'Suspender'}
            </button>
            {error && <span className="text-[11px] text-red-500">{error}</span>}
        </span>
    )
}
