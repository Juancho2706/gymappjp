import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { WeeklyPlanBuilder } from './WeeklyPlanBuilder'
import { getCoach } from '@/lib/coach/get-coach'
import { getBuilderData } from './_data/builder.queries'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import { assertDomainEnabled } from '@/services/feature-prefs.service'
import { getCoachOnboardingEmptyContext } from '../../_data/onboarding-empty.queries'

export const metadata: Metadata = { title: 'Planificador Semanal' }

export default async function BuilderPage(
    props: {
        params: Promise<{ clientId: string }>
        /** `primera=1`: el coach llega desde la tarea guiada «Primera rutina» (W4 F4.2). */
        searchParams: Promise<{ planId?: string; programId?: string; primera?: string }>
    }
) {
    const searchParams = await props.searchParams;
    const params = await props.params;
    const { clientId } = params
    const { planId, programId, primera } = searchParams
    void planId
    // Gate de dominio (Ola de orden W1.4a / OB9) ANTES de cualquier fetch del builder: apagar
    // «Entreno» en Funciones esconde la biblioteca de programas, pero el planificador seguía
    // abriéndose por link directo, refresh o historial — la puerta que faltaba cerrar. Mismo
    // mecanismo que `/coach/workout-programs`: redirect liso al panel con `?notice=domain_off`.
    // Es VISIBILIDAD, nunca autorización: RLS y los entitlements del builder quedan intactos.
    // `getCoach` está memoizado por request (React.cache), así que subirlo acá no cuesta una query
    // extra; el gate corre antes de `getBuilderData` para no pagar sus lecturas al pedo.
    const coach = await getCoach()
    if (!coach) redirect('/login')

    const workspace = await getPreferredWorkspaceForRender(coach.id)
    await assertDomainEnabled('training', {
        coachId: coach.id,
        clientTeamId: workspace?.type === 'coach_team' ? workspace.teamId : null,
        clientOrgId: workspace?.type === 'enterprise_coach' ? workspace.orgId : null,
    })

    const { user, client, exercises, initialProgram, lastEditor, areas, cardio, orgId, teamId } = await getBuilderData(clientId, programId)
    if (!user) redirect('/login')

    if (!client) redirect('/coach/clients')

    // Persona + alumno de ejemplo (`React.cache` por request): decide si el CTA de arriba es
    // «Asignar y ver como …». `is_demo` no viaja en el read model del builder.
    const onboarding = await getCoachOnboardingEmptyContext()

    return (
        <WeeklyPlanBuilder
            client={client}
            exercises={exercises}
            initialProgram={initialProgram}
            coachName={coach?.brand_name ?? coach?.full_name ?? undefined}
            lastEditor={lastEditor}
            areas={areas}
            cardio={cardio}
            firstRoutine={{
                coachId: user.id,
                isDemoClient: onboarding.demoClientId != null && onboarding.demoClientId === client.id,
                primera: primera === '1',
            }}
            /* Decide qué ejercicio del catálogo es propio ⇒ editable desde el preview del builder. */
            ownerScope={{ coachId: user.id, teamId, orgId }}
        />
    )
}
