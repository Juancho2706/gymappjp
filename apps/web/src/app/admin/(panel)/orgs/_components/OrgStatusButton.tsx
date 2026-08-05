'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AdminConfirmDialog } from '../../_components/AdminConfirmDialog'
import { setOrgStatusAction } from '../_actions/orgs.actions'

interface Props {
    orgId: string
    orgName: string
    currentStatus: string
    /** Conteos reales de la fila (orgs.queries) — alimentan el blast radius del dialogo. */
    memberCount: number
    clientCount: number
}

export function OrgStatusButton({ orgId, orgName, currentStatus, memberCount, clientCount }: Props) {
    const router = useRouter()
    const [confirmOpen, setConfirmOpen] = useState(false)
    const isSuspended = currentStatus === 'suspended'

    async function apply() {
        const result = await setOrgStatusAction(orgId, isSuspended ? 'active' : 'suspended')
        if ('error' in result) {
            toast.error(result.error)
            return
        }
        toast.success(isSuspended ? `${orgName} reactivada` : `${orgName} suspendida`)
        router.refresh()
    }

    return (
        <>
            <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className={`text-[11px] whitespace-nowrap underline underline-offset-2 transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] ${
                    isSuspended
                        ? 'text-[var(--success-500)] hover:text-[var(--success-600)]'
                        : 'text-[var(--danger-500)] hover:text-[var(--danger-600)]'
                }`}
            >
                {isSuspended ? 'Activar' : 'Suspender'}
            </button>

            <AdminConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title={isSuspended ? `Activar ${orgName}` : `Suspender ${orgName}`}
                description={isSuspended
                    ? 'La organización vuelve a estado activo: coaches y alumnos recuperan el acceso.'
                    : 'Corta el acceso de toda la organización enterprise. Es reversible: activar la restaura tal cual.'}
                blastRadius={isSuspended
                    ? undefined
                    : `Deja sin acceso a ${memberCount} coaches y ${clientCount} alumnos de la organización`}
                severity={isSuspended ? 'warning' : 'danger'}
                confirmLabel={isSuspended ? 'Activar organización' : 'Suspender organización'}
                onConfirm={apply}
            />
        </>
    )
}
