import { notFound } from 'next/navigation'
import { getClientBodyComposition } from './_data/body-composition.queries'
import { BodyCompositionTabB6b } from './_components/BodyCompositionTabB6b'

interface Props {
    params: Promise<{ clientId: string }>
}

/**
 * Superficie del modulo `body_composition` dentro de la ficha del alumno (RUTA NUEVA propia,
 * sin tocar la pestana de progreso existente). El gating server-side (kill-switch + module +
 * write-access) vive en `getClientBodyComposition`: si devuelve null -> notFound (no se expone UI
 * ni datos cuando el modulo esta apagado para el tenant o el coach no tiene acceso).
 */
export default async function BodyCompositionPage({ params }: Props) {
    const { clientId } = await params
    const data = await getClientBodyComposition(clientId)
    if (!data) notFound()

    return (
        <div className="min-h-dvh bg-background px-4 pb-24 pt-4 md:px-6 md:pb-10">
            <BodyCompositionTabB6b
                clientId={data.clientId}
                bia={data.bia}
                isak={data.isak}
            />
        </div>
    )
}
