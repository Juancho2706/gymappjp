'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { AdminConfirmDialog } from '../../_components/AdminConfirmDialog'
import { deactivateCodeAction } from '../_actions/codigos.actions'

/** Desactiva un código (reversal SERNAC-safe: cero canjes nuevos; vigentes honran su término). */
export function DeactivateButton({ codeId }: { codeId: string }) {
    const [open, setOpen] = useState(false)
    const [pending, setPending] = useState(false)

    // El {ok, message} de la accion se descartaba: un fallo de RLS/DB se veia igual que un exito.
    async function handleConfirm() {
        setPending(true)
        try {
            const res = await deactivateCodeAction(codeId)
            if (res.ok) toast.success(res.message)
            else toast.error(res.message)
        } catch {
            toast.error('No se pudo desactivar el codigo.')
        } finally {
            setPending(false)
        }
    }

    return (
        <>
            <button
                type="button"
                disabled={pending}
                onClick={() => setOpen(true)}
                className="rounded border border-subtle px-2 py-1 text-xs text-body hover:text-[var(--danger-500)] disabled:opacity-50"
            >
                {pending ? '…' : 'Desactivar'}
            </button>

            <AdminConfirmDialog
                open={open}
                onOpenChange={setOpen}
                title="Desactivar codigo"
                description="Los canjes vivos siguen; nadie mas puede canjearlo. No se puede reactivar desde la UI."
                severity="danger"
                confirmLabel="Desactivar"
                onConfirm={handleConfirm}
            />
        </>
    )
}
