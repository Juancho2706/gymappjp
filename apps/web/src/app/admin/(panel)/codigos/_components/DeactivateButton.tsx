'use client'

import { useTransition } from 'react'
import { deactivateCodeAction } from '../_actions/codigos.actions'

/** Desactiva un código (reversal SERNAC-safe: cero canjes nuevos; vigentes honran su término). */
export function DeactivateButton({ codeId }: { codeId: string }) {
    const [pending, start] = useTransition()
    return (
        <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => { await deactivateCodeAction(codeId) })}
            className="rounded border border-[--admin-border] px-2 py-1 text-xs text-[--admin-text-2] hover:text-red-500 disabled:opacity-50"
        >
            {pending ? '…' : 'Desactivar'}
        </button>
    )
}
