'use client'

import { WorkoutProgramsClient } from './WorkoutProgramsClient'
import type { ProgramListModel } from './libraryStats'
import type { WorkoutArea } from '@/domain/workout/types'

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
    areas?: WorkoutArea[]
}

/** Sin gate `mounted`: evita flash vacío y un segundo commit innecesario al entrar a Programas. */
export function WorkoutProgramsClientShell({ initialPrograms, availableClients, areas = [] }: WorkoutProgramsClientShellProps) {
    return (
        <WorkoutProgramsClient initialPrograms={initialPrograms} availableClients={availableClients} areas={areas} />
    )
}
