import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getMovementWizard } from '../../_data/movement.queries'
import { MovementWizard } from '../../_components/MovementWizard'

export const metadata: Metadata = { title: 'Evaluar movimiento' }

interface Props {
    params: Promise<{ clientId: string }>
    searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Wizard de captura (7 patrones + revision). Retoma el borrador unico del alumno si
 * existe (cross-device, AC3). Gating server-side en el service => notFound() si OFF.
 *
 * `?primera=1` = se entro por la guia de inicio (paso 3 de la rama `rehab`, W4 F4.3): el wizard
 * suma las tarjetas embebidas y, al cerrar el screening, vuelve al reporte en modo guiado para
 * ofrecer la pauta domiciliaria.
 */
export default async function MovementWizardPage({ params, searchParams }: Props) {
    const { clientId } = await params
    const query = await searchParams
    const result = await getMovementWizard(clientId)
    // Dominio apagado por el coach (W1.4b / OB9): al hub con el aviso, nunca un 404 seco.
    if (result.status === 'domain_off') redirect('/coach/movement')
    if (result.status === 'not_found') notFound()
    const data = result.data

    const editedByOther =
        data.draft?.last_edited_by != null && data.draft.last_edited_by !== data.currentUserId

    return (
        <MovementWizard
            clientId={clientId}
            clientName={data.clientName}
            viaTeam={data.ctx.viaTeam}
            hasActiveConsent={data.hasActiveConsent}
            initialAssessmentId={data.draft?.id ?? null}
            initialItems={data.draft?.items ?? []}
            editedByOther={editedByOther}
            primera={query.primera === '1' ? { coachId: data.currentUserId } : null}
        />
    )
}
