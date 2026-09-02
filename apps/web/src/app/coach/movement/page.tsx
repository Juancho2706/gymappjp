import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getMovementHub } from './_data/movement.queries'
import { MovementHubList } from './_components/MovementHubList'
import { MovementFirstRunEmpty } from './_components/MovementFirstRunEmpty'
import { ModuleOffNotice } from '@/components/coach/ModuleOffNotice'
import { DomainOffNotice } from '@/components/coach/DomainOffNotice'
import { getCoachOnboardingEmptyContext } from '../_data/onboarding-empty.queries'

export const metadata: Metadata = { title: 'Screening de Movimiento' }

/**
 * Hub del modulo movement_assessment (entrada NAV_MODULES). Gating server-side en el
 * service (kill-switch + scope 3-vias + assertModule por workspace activo). Si el modulo
 * esta OFF => aviso amable hacia el catalogo (plan 05 F5.7); sin sesion => /login.
 */
export default async function MovementHubPage() {
    const result = await getMovementHub()
    if (result.status === 'unauthenticated') redirect('/login')
    if (result.status === 'module_off') return <ModuleOffNotice moduleKey="movement_assessment" />
    // Dominio apagado por el propio coach (W1.4b): aviso IN-PAGE con el CTA a Mi panel. Este hub
    // no tiene encabezado propio, asi que el aviso ocupa la pantalla (mockup 3A).
    if (result.status === 'domain_off') return <DomainOffNotice domain="movement" />

    // Primer uso = todavia no existe NINGUN screening (ni borrador). Con el alumno de ejemplo
    // sembrado la lista no esta vacia, asi que el vacio real es «sin evaluar», no «sin alumnos»
    // (SPEC coach-onboarding-v2 §7).
    const onboarding = await getCoachOnboardingEmptyContext()
    const clients = result.data.clients
    const firstRun = clients.every((c) => c.latest_final == null && c.draft_id == null)

    return (
        <div className="min-h-dvh">
            {firstRun && (
                <div className="mx-auto w-full max-w-3xl px-4 pt-6">
                    <MovementFirstRunEmpty
                        demoClientId={onboarding.demoClientId}
                        demoName={onboarding.demoName}
                        demoLabel={onboarding.demoLabel}
                        noun={onboarding.noun}
                        firstClientId={clients[0]?.client_id ?? null}
                    />
                </div>
            )}
            <MovementHubList
                data={result.data}
                demoClientId={onboarding.demoClientId}
                demoLabel={onboarding.demoLabel}
                suppressEmptyCard={firstRun}
            />
        </div>
    )
}
