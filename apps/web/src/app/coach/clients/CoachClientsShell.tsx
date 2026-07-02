'use client'

import { useEffect, useMemo, useState } from 'react'
import { CoachWarRoom, type DirectoryRiskFilter } from './CoachWarRoom'
import { ClientsDirectoryClient } from './ClientsDirectoryClient'
import type { DirectoryPulseRow } from '@/services/dashboard.service'
import { getCoachPublicIdentifier, type CoachPublicIdentifierSource } from '@/lib/coach/public-identifier'
import { useRosterView } from '@/components/coach/RosterViewContext'

interface CoachClientsShellProps {
    clients: any[]
    coach: CoachPublicIdentifierSource | null
    appUrl: string
    pulse: DirectoryPulseRow[]
    /** ≥1 módulo del hub activo (cardio/movimiento/composición) → habilita el acceso a Herramientas. */
    toolsEnabled: boolean
}

export function CoachClientsShell({ clients, coach, appUrl, pulse, toolsEnabled }: CoachClientsShellProps) {
    const [riskFilter, setRiskFilter] = useState<DirectoryRiskFilter>('all')
    // Vista de nivel superior (solo desktop): ficha (master-detail) | tabla. El estado vive en
    // el RosterViewProvider del layout para que el toggle del topbar lo controle. Encendemos
    // `active` mientras esta pantalla está montada (apagado al desmontar) → el toggle solo
    // aparece en el topbar dentro de /coach/clients.
    const { mode: rosterMode, setMode: setRosterMode, setActive } = useRosterView()
    useEffect(() => {
        setActive(true)
        return () => setActive(false)
    }, [setActive])
    const publicIdentifier = getCoachPublicIdentifier(coach)

    const pulseByClientId = useMemo(() => {
        const o: Record<string, DirectoryPulseRow> = {}
        for (const p of pulse) o[p.clientId] = p
        return o
    }, [pulse])

    return (
        <div>
            {/* War room (pulso de riesgo): SOLO móvil. En desktop el diseño no muestra war
                room sobre el directorio — Ficha prioriza riesgo en el rail del master-detail
                y Tabla (DesktopRosterTable) ordena por estado por defecto (w3-table.png). */}
            <div className="mb-8 md:hidden">
                <CoachWarRoom
                    coachSlug={publicIdentifier}
                    appUrl={appUrl}
                    clients={clients}
                    pulse={pulse}
                    activeFilter={riskFilter}
                    onFilterChange={setRiskFilter}
                    toolsEnabled={toolsEnabled}
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
                toolsEnabled={toolsEnabled}
            />
        </div>
    )
}
