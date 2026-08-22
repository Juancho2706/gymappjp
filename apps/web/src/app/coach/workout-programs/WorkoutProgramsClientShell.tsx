'use client'

import { WorkoutProgramsClient, type ProgramsFirstRunContext } from './WorkoutProgramsClient'
import type { ProgramListModel } from './libraryStats'
import type { WorkoutArea } from '@/domain/workout/types'

interface Client {
    id: string
    full_name: string
    /** Alumno de ejemplo del onboarding v2: se rotula en el selector, nunca se filtra. */
    is_demo?: boolean | null
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
    /** Persona + demo + plantillas para el vacío template-first de la biblioteca (F3.6). */
    firstRun?: ProgramsFirstRunContext
}

/** Sin gate `mounted`: evita flash vacío y un segundo commit innecesario al entrar a Programas. */
export function WorkoutProgramsClientShell({
    initialPrograms,
    availableClients,
    areas = [],
    firstRun,
}: WorkoutProgramsClientShellProps) {
    return (
        <WorkoutProgramsClient
            initialPrograms={initialPrograms}
            availableClients={availableClients}
            areas={areas}
            firstRun={firstRun}
        />
    )
}
