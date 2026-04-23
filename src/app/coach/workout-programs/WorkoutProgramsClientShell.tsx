'use client'

import { WorkoutProgramsClient } from './WorkoutProgramsClient'
import type { ProgramListModel } from './libraryStats'

interface Client {
    id: string
    full_name: string
    workout_programs?: {
        id: string
        name: string
        is_active?: boolean
    }[] | null
}

interface WorkoutProgramsClientShellProps {
    initialPrograms: ProgramListModel[]
    availableClients: Client[]
}

/** Sin gate `mounted`: evita flash vacío y un segundo commit innecesario al entrar a Programas. */
export function WorkoutProgramsClientShell({ initialPrograms, availableClients }: WorkoutProgramsClientShellProps) {
    return (
        <WorkoutProgramsClient initialPrograms={initialPrograms} availableClients={availableClients} />
    )
}
