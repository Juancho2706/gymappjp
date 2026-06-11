import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getMovementClientReport } from '../_data/movement.queries'
import { ClientMovementReport } from '../_components/ClientMovementReport'

export const metadata: Metadata = { title: 'Screening de Movimiento | EVA' }

interface Props {
    params: Promise<{ clientId: string }>
}

/**
 * Reporte del alumno: ultimo final + historial + evolucion. El service ya valido
 * scope 3-vias + assertModule (contexto del ALUMNO) y registro `view` en bitacora team.
 */
export default async function MovementClientPage({ params }: Props) {
    const { clientId } = await params
    const detail = await getMovementClientReport(clientId)
    if (!detail) notFound()

    return (
        <div className="min-h-dvh bg-background">
            <ClientMovementReport clientId={clientId} detail={detail} />
        </div>
    )
}
