import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getMovementHub } from './_data/movement.queries'
import { MovementHubList } from './_components/MovementHubList'

export const metadata: Metadata = { title: 'Screening de Movimiento | EVA' }

/**
 * Hub del modulo movement_assessment (entrada NAV_MODULES). Gating server-side en el
 * service (kill-switch + scope 3-vias + assertModule por workspace activo): si el
 * modulo esta OFF, no hay sesion o el contexto es enterprise => notFound() (AC6).
 */
export default async function MovementHubPage() {
    const data = await getMovementHub()
    if (!data) notFound()

    return (
        <div className="min-h-dvh bg-background">
            <MovementHubList data={data} />
        </div>
    )
}
