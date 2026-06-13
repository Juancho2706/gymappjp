import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { WorkoutExecutionClient } from './WorkoutExecutionClient'
import { getWorkoutExecutionData } from './_data/workout-execution.queries'
import { getClientBasePath } from '@/lib/client/base-path'

export const metadata: Metadata = { title: 'Rutina | EVA' }

interface Props {
    params: Promise<{ coach_slug: string; planId: string }>
}

export default async function WorkoutExecutionPage({ params }: Props) {
    const { coach_slug, planId } = await params
    const base = await getClientBasePath(coach_slug)
    const data = await getWorkoutExecutionData(planId)
    const { user, plan } = data

    if (!user) redirect(`${base}/login`)
    if (!plan) redirect(`${base}/dashboard`)

    return (
        <WorkoutExecutionClient
            plan={plan}
            program={data.program}
            logs={data.logs}
            previousHistory={data.previousHistory}
            coachSlug={coach_slug}
            exerciseMaxes={data.exerciseMaxes}
            activeWeekVariant={data.activeWeekVariant}
            areas={data.areas}
            cardio={data.cardio}
        />
    )
}
