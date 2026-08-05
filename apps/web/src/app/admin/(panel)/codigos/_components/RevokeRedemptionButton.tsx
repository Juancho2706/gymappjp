'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { AdminConfirmDialog } from '../../_components/AdminConfirmDialog'
import { revokeRedemptionAction } from '../_actions/codigos.actions'

type Props = {
    redemptionId: string
    /** Nombre para el blast radius (marca > nombre > slug). */
    coachName: string | null
    /** Precio de lista del plan del coach; el proximo cobro vuelve a este monto. */
    listPriceClp: number | null
    /** Neto que paga HOY con el cupon vivo (solo para mostrar el delta). */
    netPriceClp: number | null
}

const clp = (n: number) => `$${n.toLocaleString('es-CL')}`

/**
 * Revoca el canje vivo de un coach. TOCA DINERO: el proximo cobro vuelve a precio de lista, por eso
 * el dialogo muestra el monto exacto (blast radius) en vez de un "estas seguro" generico. Solo se
 * renderiza para canjes vigentes.
 */
export function RevokeRedemptionButton({ redemptionId, coachName, listPriceClp, netPriceClp }: Props) {
    const [open, setOpen] = useState(false)
    const [pending, setPending] = useState(false)

    const quien = coachName ?? 'este coach'
    const blastRadius =
        listPriceClp != null
            ? `El proximo cobro de ${quien} vuelve a precio de lista (${clp(listPriceClp)})${
                  netPriceClp != null && netPriceClp !== listPriceClp ? ` — hoy paga ${clp(netPriceClp)}` : ''
              }.`
            : `El proximo cobro de ${quien} vuelve a precio de lista.`

    async function handleConfirm() {
        setPending(true)
        try {
            const res = await revokeRedemptionAction(redemptionId)
            if (res.ok) toast.success(res.message)
            else toast.error(res.message)
        } catch {
            toast.error('No se pudo revocar el canje.')
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
                className="rounded border border-subtle px-2 py-1 text-xs text-body transition-colors hover:text-[var(--danger-500)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
            >
                {pending ? '…' : 'Revocar'}
            </button>

            <AdminConfirmDialog
                open={open}
                onOpenChange={setOpen}
                title="Revocar canje"
                description="Corta el descuento vivo de este coach. El ledger conserva la evidencia del canje (no se borra) y el codigo sigue disponible para otros."
                blastRadius={blastRadius}
                severity="danger"
                confirmLabel="Revocar"
                onConfirm={handleConfirm}
            />
        </>
    )
}
