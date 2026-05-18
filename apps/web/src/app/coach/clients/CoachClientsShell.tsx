'use client'

import { useMemo, useState } from 'react'
import { CoachWarRoom, type DirectoryRiskFilter } from './CoachWarRoom'
import { ClientsDirectoryClient } from './ClientsDirectoryClient'
import type { DirectoryPulseRow } from '@/services/dashboard.service'

interface CoachClientsShellProps {
    clients: any[]
    coach: { slug: string } | null
    appUrl: string
    pulse: DirectoryPulseRow[]
}

export function CoachClientsShell({ clients, coach, appUrl, pulse }: CoachClientsShellProps) {
    const [riskFilter, setRiskFilter] = useState<DirectoryRiskFilter>('all')

    const pulseByClientId = useMemo(() => {
        const o: Record<string, DirectoryPulseRow> = {}
        for (const p of pulse) o[p.clientId] = p
        return o
    }, [pulse])

    return (
        <>
            <CoachWarRoom
                coachSlug={coach?.slug}
                appUrl={appUrl}
                clients={clients}
                pulse={pulse}
                activeFilter={riskFilter}
                onFilterChange={setRiskFilter}
            />
            <ClientsDirectoryClient
                clients={clients}
                coach={coach}
                appUrl={appUrl}
                riskFilter={riskFilter}
                onRiskFilterChange={setRiskFilter}
                pulseByClientId={pulseByClientId}
            />
        </>
    )
}
