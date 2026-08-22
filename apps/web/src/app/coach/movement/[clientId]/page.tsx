import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getMovementClientReport } from '../_data/movement.queries'
import { ClientMovementReport } from '../_components/ClientMovementReport'
import { PautaDomiciliariaCta } from '../_components/PautaDomiciliariaCta'
import { resolvePrimerScreeningEntry } from '../_lib/primer-screening'
import {
    getCoachOnboardingEmptyContext,
    templatesForSurface,
} from '../../_data/onboarding-empty.queries'

export const metadata: Metadata = { title: 'Screening de Movimiento | EVA' }

interface Props {
    params: Promise<{ clientId: string }>
    searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Reporte del alumno: ultimo final + historial + evolucion. El service ya valido
 * scope 3-vias + assertModule (contexto del ALUMNO) y registro `view` en bitacora team.
 *
 * `?primera=1` = se entro por la guia de inicio (paso 3 de la rama `rehab`, W4 F4.3). La decision
 * de que ve el coach es SERVER-SIDE (`resolvePrimerScreeningEntry`): sin screening todavia se va
 * derecho al wizard; con screening final ya hecho —el caso del alumno de ejemplo— se queda aca,
 * mira el semaforo y salta a la pauta domiciliaria.
 */
export default async function MovementClientPage({ params, searchParams }: Props) {
    const { clientId } = await params
    const query = await searchParams
    const detail = await getMovementClientReport(clientId)
    if (!detail) notFound()

    const entry = resolvePrimerScreeningEntry({
        primera: query.primera === '1',
        hasFinal: detail.finals.length > 0,
        hasDraft: detail.assessments.some((assessment) => assessment.status === 'draft'),
    })
    if (entry?.goesToWizard) redirect(`/coach/movement/${clientId}/new?primera=1`)

    const onboarding = entry ? await getCoachOnboardingEmptyContext() : null
    const rehabTemplate = templatesForSurface('movement', onboarding?.persona ?? null)[0] ?? null

    return (
        <div className="min-h-dvh bg-background">
            {entry && onboarding?.coachId && rehabTemplate ? (
                <div className="mx-auto w-full max-w-3xl px-4 pt-6">
                    <PautaDomiciliariaCta
                        coachId={onboarding.coachId}
                        clientId={clientId}
                        clientName={detail.clientName?.trim().split(/\s+/)[0] ?? null}
                        templateId={rehabTemplate.id}
                        templateLabel={rehabTemplate.label}
                    />
                </div>
            ) : null}
            <ClientMovementReport clientId={clientId} detail={detail} />
        </div>
    )
}
