'use client'

import { useEffect, useState } from 'react'
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

export function WorkoutProgramsClientShell({ initialPrograms, availableClients }: WorkoutProgramsClientShellProps) {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return <div className="min-h-[30vh]" />
    }

    return (
        <WorkoutProgramsClient
            initialPrograms={initialPrograms}
            availableClients={availableClients}
        />
    )
}
