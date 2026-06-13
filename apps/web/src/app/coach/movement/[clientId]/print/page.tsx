import { notFound } from 'next/navigation'
import { getMovementPrint } from '../../_data/movement.queries'
import { MovementPrintReport } from '../../_components/MovementPrintReport'

interface Props {
    params: Promise<{ clientId: string }>
    searchParams: Promise<{ assessment?: string }>
}

/**
 * Export/print del reporte (patron progress-print). El service valida acceso +
 * modulo y registra `pdf_generate` en la bitacora del team (AC9). Marca del
 * CONTEXTO: team => marca del team; standalone => marca del coach.
 */
export default async function MovementPrintPage({ params, searchParams }: Props) {
    const [{ clientId }, { assessment: assessmentId }] = await Promise.all([params, searchParams])
    if (!assessmentId) notFound()

    const data = await getMovementPrint(clientId, assessmentId)
    if (!data) notFound()

    return (
        <div className="min-h-dvh bg-white">
            <style>{`
                @media print {
                    @page { margin: 14mm; }
                    body { background: #fff; }
                }
            `}</style>
            <MovementPrintReport data={data} />
        </div>
    )
}
