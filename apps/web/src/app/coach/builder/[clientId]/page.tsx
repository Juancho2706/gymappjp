import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { WeeklyPlanBuilder } from './WeeklyPlanBuilder'
import { getCoach } from '@/lib/coach/get-coach'
import { getBuilderData } from './_data/builder.queries'
import { getCoachOnboardingEmptyContext } from '../../_data/onboarding-empty.queries'

export const metadata: Metadata = { title: 'Planificador Semanal | EVA' }

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
    const { user, client, exercises, initialProgram, lastEditor, areas, cardio } = await getBuilderData(clientId, programId)
    if (!user) redirect('/login')

    const coach = await getCoach()

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
        />
    )
}
