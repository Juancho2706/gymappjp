import { notFound } from 'next/navigation'
import { getClientBodyComposition } from './_data/body-composition.queries'
import { BodyCompositionTabB6b } from './_components/BodyCompositionTabB6b'
import { ModuleOffNotice } from '@/components/coach/ModuleOffNotice'
import { DomainOffNotice } from '@/components/coach/DomainOffNotice'

interface Props {
    params: Promise<{ clientId: string }>
}

/**
 * Superficie del modulo `body_composition` dentro de la ficha del alumno (RUTA NUEVA propia,
 * sin tocar la pestana de progreso existente). El gating server-side (kill-switch + module +
 * write-access) vive en `getClientBodyComposition`: modulo apagado -> aviso amable hacia el
 * catalogo (plan 05 F5.7); alumno inexistente / sin acceso -> notFound seco (no se expone UI).
 */
export default async function BodyCompositionPage({ params }: Props) {
    const { clientId } = await params
    const result = await getClientBodyComposition(clientId)
    if (result.status === 'module_off') return <ModuleOffNotice moduleKey="body_composition" />
    // Dominio apagado por el propio coach (W1.4b): aviso IN-PAGE con el CTA a Mi panel, ANTES del
    // notFound — apagar una función del panel no convierte al alumno en inexistente.
    if (result.status === 'domain_off') return <DomainOffNotice domain="bodycomp" />
    if (result.status === 'not_found') notFound()

    return (
        <div className="min-h-dvh px-4 pb-24 pt-4 md:px-6 md:pb-10">
            <BodyCompositionTabB6b
                clientId={result.data.clientId}
                bia={result.data.bia}
                isak={result.data.isak}
            />
        </div>
    )
}
