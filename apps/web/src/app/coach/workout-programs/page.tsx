import { redirect } from 'next/navigation'
import { WorkoutProgramsClientShell } from './WorkoutProgramsClientShell'
import { getCoach } from '@/lib/coach/get-coach'
import { getWorkoutProgramsWithClients } from './_data/workout-programs.queries'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import {
    getCoachOnboardingEmptyContext,
    templatesForSurface,
} from '../_data/onboarding-empty.queries'

export default async function WorkoutProgramsPage() {
    const coach = await getCoach()
    if (!coach) redirect('/login')

    const workspace = await getPreferredWorkspaceForRender(coach.id)
    const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null
    const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null
    const [{ programs, clients, areas }, onboarding] = await Promise.all([
        getWorkoutProgramsWithClients(coach.id, { orgId, activeTeamId }),
        // Persona + alumno de ejemplo (memoizado por request, ver `_data/onboarding-empty.queries`):
        // alimenta el vacío template-first de la biblioteca y el rótulo del selector de asignación.
        getCoachOnboardingEmptyContext(),
    ])

    return (
        <WorkoutProgramsClientShell
            initialPrograms={programs}
            availableClients={clients}
            areas={areas}
            firstRun={{
                templates: templatesForSurface('training', onboarding.persona),
                demoClientId: onboarding.demoClientId,
                demoName: onboarding.demoName,
                demoLabel: onboarding.demoLabel,
                noun: onboarding.noun,
            }}
        />
    )
}
