import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { WeeklyPlanBuilder } from './WeeklyPlanBuilder'
import { getCoach } from '@/lib/coach/get-coach'
import { getBuilderData } from './_data/builder.queries'

export const metadata: Metadata = { title: 'Planificador Semanal | EVA' }

export default async function BuilderPage(
    props: {
        params: Promise<{ clientId: string }>
        searchParams: Promise<{ planId?: string; programId?: string }>
    }
) {
    const searchParams = await props.searchParams;
    const params = await props.params;
    const { clientId } = params
    const { planId, programId } = searchParams
    void planId
    const { user, client, exercises, initialProgram, lastEditor, areas } = await getBuilderData(clientId, programId)
    if (!user) redirect('/login')

    const coach = await getCoach()

    if (!client) redirect('/coach/clients')

    return (
        <WeeklyPlanBuilder
            client={client}
            exercises={exercises}
            initialProgram={initialProgram}
            coachName={coach?.brand_name ?? coach?.full_name ?? undefined}
            lastEditor={lastEditor}
            areas={areas}
        />
    )
}
