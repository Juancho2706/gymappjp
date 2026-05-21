import { redirect } from 'next/navigation'
import { WorkoutProgramsClientShell } from './WorkoutProgramsClientShell'
import { getCoach } from '@/lib/coach/get-coach'
import { getWorkoutProgramsWithClients } from './_data/workout-programs.queries'

export default async function WorkoutProgramsPage() {
    const coach = await getCoach()
    if (!coach) redirect('/login')

    const { programs, clients } = await getWorkoutProgramsWithClients(coach.id)

    return (
        <WorkoutProgramsClientShell
            initialPrograms={programs}
            availableClients={clients}
        />
    )
}
