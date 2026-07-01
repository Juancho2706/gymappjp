import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getToolsHubData } from './_data/tools.queries'
import { ToolsHub } from './_components/ToolsHub'

export const metadata: Metadata = { title: 'Herramientas | EVA' }

/**
 * Hub / launcher de módulos "Herramientas" (kit coach-modules-hub.jsx). Comprar ≠ usar:
 * acá el coach USA lo que compró — el catálogo de COMPRA vive en Settings > Módulos.
 * Estados por tarjeta (Activo / De pago) + picker single de alumno para Composición.
 */
export default async function ToolsHubPage() {
    const data = await getToolsHubData()
    if (data.status === 'unauthenticated') redirect('/login')

    return (
        <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
            <ToolsHub managed={data.managed} modules={data.modules} clients={data.clients} />
        </div>
    )
}
