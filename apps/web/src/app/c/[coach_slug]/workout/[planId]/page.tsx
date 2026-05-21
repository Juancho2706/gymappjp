import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { WorkoutExecutionClient } from './WorkoutExecutionClient'
import { getWorkoutExecutionData } from './_data/workout-execution.queries'

export const metadata: Metadata = { title: 'Rutina | EVA' }

interface Props {
    params: Promise<{ coach_slug: string; planId: string }>
}

export default async function WorkoutExecutionPage({ params }: Props) {
    const { coach_slug, planId } = await params
    const data = await getWorkoutExecutionData(planId)
    const { user, plan } = data

    if (!user) redirect(`/c/${coach_slug}/login`)
    if (!plan) redirect(`/c/${coach_slug}/dashboard`)

    return (
        <WorkoutExecutionClient
            plan={plan}
            program={data.program}
            logs={data.logs}
            previousHistory={data.previousHistory}
            coachSlug={coach_slug}
            exerciseMaxes={data.exerciseMaxes}
            activeWeekVariant={data.activeWeekVariant}
        />
    )
}
