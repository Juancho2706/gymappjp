import { redirect } from 'next/navigation'
import { WorkoutProgramsClientShell } from './WorkoutProgramsClientShell'
import { getCoach } from '@/lib/coach/get-coach'
import { getWorkoutProgramsWithClients } from './_data/workout-programs.queries'
import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'

export default async function WorkoutProgramsPage() {
    const coach = await getCoach()
    if (!coach) redirect('/login')

    const supabase = await createClient()
    const workspace = await resolvePreferredWorkspace(supabase, coach.id)
    const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null
    const { programs, clients } = await getWorkoutProgramsWithClients(coach.id, orgId)

    return (
        <WorkoutProgramsClientShell
            initialPrograms={programs}
            availableClients={clients}
        />
    )
}
