import { redirect } from 'next/navigation'
import { WorkoutProgramsClientShell } from './WorkoutProgramsClientShell'
import { getCoach } from '@/lib/coach/get-coach'
import { getWorkoutProgramsWithClients } from './_data/workout-programs.queries'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'

export default async function WorkoutProgramsPage() {
    const coach = await getCoach()
    if (!coach) redirect('/login')

    const workspace = await getPreferredWorkspaceForRender(coach.id)
    const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null
    const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null
    const { programs, clients, areas } = await getWorkoutProgramsWithClients(coach.id, { orgId, activeTeamId })

    return (
        <WorkoutProgramsClientShell
            initialPrograms={programs}
            availableClients={clients}
            areas={areas}
        />
    )
}
