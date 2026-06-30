'use client'

import { useMemo, useState } from 'react'
import { CoachWarRoom, type DirectoryRiskFilter } from './CoachWarRoom'
import { ClientsDirectoryClient } from './ClientsDirectoryClient'
import type { DirectoryPulseRow } from '@/services/dashboard.service'
import { cn } from '@/lib/utils'
import { getCoachPublicIdentifier, type CoachPublicIdentifierSource } from '@/lib/coach/public-identifier'

interface CoachClientsShellProps {
    clients: any[]
    coach: CoachPublicIdentifierSource | null
    appUrl: string
    pulse: DirectoryPulseRow[]
}

export function CoachClientsShell({ clients, coach, appUrl, pulse }: CoachClientsShellProps) {
    const [riskFilter, setRiskFilter] = useState<DirectoryRiskFilter>('all')
    // Vista de nivel superior (solo desktop). Default = ficha (master-detail), como el diseño.
    const [rosterMode, setRosterMode] = useState<'ficha' | 'tabla'>('ficha')
    const publicIdentifier = getCoachPublicIdentifier(coach)

    const pulseByClientId = useMemo(() => {
        const o: Record<string, DirectoryPulseRow> = {}
        for (const p of pulse) o[p.clientId] = p
        return o
    }, [pulse])

    return (
        <div>
            {/* War room (pulso de riesgo): móvil siempre · desktop solo en modo tabla.
                En desktop-ficha el rail del master-detail ya prioriza el riesgo (oculto sin
                dejar hueco superior). */}
            <div
                className={cn(
                    'mb-8 md:mb-12',
                    rosterMode === 'ficha' && 'md:mb-0 md:hidden'
                )}
            >
                <CoachWarRoom
                    coachSlug={publicIdentifier}
                    appUrl={appUrl}
                    clients={clients}
                    pulse={pulse}
                    activeFilter={riskFilter}
                    onFilterChange={setRiskFilter}
                />
            </div>
            <ClientsDirectoryClient
                clients={clients}
                coach={coach}
                publicIdentifier={publicIdentifier}
                appUrl={appUrl}
                riskFilter={riskFilter}
                onRiskFilterChange={setRiskFilter}
                pulseByClientId={pulseByClientId}
                rosterMode={rosterMode}
                onRosterModeChange={setRosterMode}
            />
        </div>
    )
}
