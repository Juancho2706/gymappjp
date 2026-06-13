import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getMovementHub } from './_data/movement.queries'
import { MovementHubList } from './_components/MovementHubList'
import { ModuleOffNotice } from '@/components/coach/ModuleOffNotice'

export const metadata: Metadata = { title: 'Screening de Movimiento | EVA' }

/**
 * Hub del modulo movement_assessment (entrada NAV_MODULES). Gating server-side en el
 * service (kill-switch + scope 3-vias + assertModule por workspace activo). Si el modulo
 * esta OFF => aviso amable hacia el catalogo (plan 05 F5.7); sin sesion => /login.
 */
export default async function MovementHubPage() {
    const result = await getMovementHub()
    if (result.status === 'unauthenticated') redirect('/login')
    if (result.status === 'module_off') return <ModuleOffNotice moduleKey="movement_assessment" />

    return (
        <div className="min-h-dvh bg-background">
            <MovementHubList data={result.data} />
        </div>
    )
}
