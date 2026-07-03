'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SearchX, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DirectoryActionBar } from './DirectoryActionBar'
import { DesktopRosterTable } from './DesktopRosterTable'
import { ClientsDirectoryEmpty } from './ClientsDirectoryEmpty'
import { CoachRosterMasterDetail } from './CoachRosterMasterDetail'
import { DirRowCard } from './DirRowCard'
import { DirTableMobile } from './DirTableMobile'
import { ClientActionsSheet } from './ClientActionsSheet'
import { CreateClientModal } from './CreateClientModal'
import { EditClientDataModal } from './EditClientDataModal'
import type {
    DirectoryRiskFilter,
    DirectorySortKey,
    ProgramDirectoryFilter,
    StatusDirectoryFilter,
} from './directory-types'
import type { DirectoryPulseRow } from '@/services/dashboard.service'
import { defaultSortDir, sortClientsByKey } from './clientsDirectorySort'
import type { CoachPublicIdentifierSource } from '@/lib/coach/public-identifier'

interface ClientsDirectoryClientProps {
    clients: any[]
    coach: CoachPublicIdentifierSource | null
    publicIdentifier: string
    appUrl: string
    riskFilter: DirectoryRiskFilter
    onRiskFilterChange: (f: DirectoryRiskFilter) => void
    pulseByClientId: Record<string, DirectoryPulseRow>
    /** Vista de nivel superior (solo desktop): ficha (master-detail) | tabla (directorio). */
    rosterMode: 'ficha' | 'tabla'
    onRosterModeChange: (m: 'ficha' | 'tabla') => void
    /** Acceso a Herramientas (≥1 módulo del hub activo): gatea el botón del rail Ficha. */
    toolsEnabled?: boolean
}

function matchesRiskFilter(
    client: any,
    pulse: DirectoryPulseRow | undefined,
    filter: DirectoryRiskFilter
): boolean {
    switch (filter) {
        case 'all':
            return true
        case 'urgent':
            return !!pulse && pulse.attentionScore >= 50
        case 'review':
            return !!pulse && pulse.attentionScore >= 25 && pulse.attentionScore < 50
        case 'on_track':
            return !!pulse && pulse.attentionScore < 25
        case 'expired_program':
            return (
                !!pulse &&
                pulse.planDaysRemaining !== null &&
                pulse.planDaysRemaining <= 0
            )
        case 'password_reset':
            return !!client.force_password_change
        case 'nutrition_low':
            return !!pulse && (pulse.attentionFlags ?? []).includes('NUTRICION_RIESGO')
        default:
            return true
    }
}

function matchesStatusFilter(
    client: any,
    filter: StatusDirectoryFilter
): boolean {
    if (filter === 'archived') return client.is_archived === true
    // Default views exclude archived
    if (client.is_archived === true) return false
    if (filter === 'any') return true
    if (filter === 'active') {
        return client.is_active !== false && !client.force_password_change
    }
    if (filter === 'paused') return client.is_active === false
    if (filter === 'pending_sync') return !!client.force_password_change
    return true
}

function matchesProgramFilter(
    client: any,
    pulse: DirectoryPulseRow | undefined,
    filter: ProgramDirectoryFilter
): boolean {
    if (filter === 'any') return true
    const hasProgram = !!client.workout_programs?.some((p: any) => p.is_active)
    if (filter === 'with_program') return hasProgram
    if (filter === 'no_program') return !hasProgram
    if (filter === 'expired') {
        return (
            !!pulse &&
            pulse.planDaysRemaining !== null &&
            pulse.planDaysRemaining <= 0
        )
    }
    return true
}

export function ClientsDirectoryClient({
    clients,
    coach,
    publicIdentifier,
    appUrl,
    riskFilter,
    onRiskFilterChange,
    pulseByClientId,
    rosterMode,
    onRosterModeChange,
    toolsEnabled = false,
}: ClientsDirectoryClientProps) {
    const router = useRouter()
    const [search, setSearch] = useState('')
    const [sortKey, setSortKey] = useState<DirectorySortKey>('attention_score')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() =>
        defaultSortDir('attention_score')
    )
    const [view, setView] = useState<'cards' | 'table'>('cards')
    const [statusFilter, setStatusFilter] = useState<StatusDirectoryFilter>('any')
    const [programFilter, setProgramFilter] = useState<ProgramDirectoryFilter>('any')
    const [visibleCount, setVisibleCount] = useState(48)
    const [editingClient, setEditingClient] = useState<{ id: string; name: string } | null>(null)
    const [actionsClient, setActionsClient] = useState<any | null>(null)
    const [createOpen, setCreateOpen] = useState(false)

    useEffect(() => {
        setVisibleCount(48)
    }, [search, riskFilter, statusFilter, programFilter, sortKey, sortDir, view])

    const handleSortFromBar = (k: DirectorySortKey) => {
        setSortKey(k)
        setSortDir(defaultSortDir(k))
    }

    // Headers de la tabla densa: mismo key = alterna dirección; nuevo key = dir default.
    const handleHeaderSort = (k: DirectorySortKey) => {
        if (sortKey === k) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        } else {
            setSortKey(k)
            setSortDir(defaultSortDir(k))
        }
    }

    const clearFilters = () => {
        setSearch('')
        setStatusFilter('any')
        setProgramFilter('any')
        onRiskFilterChange('all')
    }

    const filteredClients = useMemo(() => {
        return clients.filter((client) => {
            const q = search.toLowerCase()
            const name = (client.full_name ?? '').toLowerCase()
            const mail = (client.email ?? '').toLowerCase()
            const matchesSearch = name.includes(q) || mail.includes(q)
            const pulse = pulseByClientId[client.id]
            return (
                matchesSearch &&
                matchesRiskFilter(client, pulse, riskFilter) &&
                matchesStatusFilter(client, statusFilter) &&
                matchesProgramFilter(client, pulse, programFilter)
            )
        })
    }, [
        clients,
        search,
        riskFilter,
        statusFilter,
        programFilter,
        pulseByClientId,
    ])

    const sortedClients = useMemo(
        () => sortClientsByKey(filteredClients, pulseByClientId, sortKey, sortDir),
        [filteredClients, pulseByClientId, sortKey, sortDir]
    )

    const visibleClients = useMemo(
        () => sortedClients.slice(0, visibleCount),
        [sortedClients, visibleCount]
    )

    const archivedCount = useMemo(
        () => clients.filter((c) => c.is_archived === true).length,
        [clients]
    )

    const nonArchivedCount = clients.length - archivedCount
    if (nonArchivedCount === 0 && archivedCount === 0) {
        return <ClientsDirectoryEmpty />
    }

    const loginUrl = coach && appUrl ? `${appUrl}/c/${publicIdentifier}/login` : ''

    const loadMoreButton =
        sortedClients.length > visibleCount ? (
            <div className="flex justify-center px-4 pb-8 lg:px-0">
                <button
                    type="button"
                    onClick={() =>
                        setVisibleCount((n) => Math.min(n + 48, sortedClients.length))
                    }
                    className="rounded-pill border border-default bg-surface-sunken px-6 py-2 text-sm font-semibold text-strong transition-colors hover:bg-surface-card"
                >
                    Cargar más ({sortedClients.length - visibleCount} restantes)
                </button>
            </div>
        ) : null

    return (
        <div className="min-w-0 max-w-full">
            {/* El toggle Tabla / Ficha vive ahora en el topbar (CoachTopBar), junto a la
                búsqueda global — controlado vía RosterViewContext. El acceso a Herramientas
                (desktop) vive en la cabecera del rail del master-detail (gateado por módulo). */}

            {/* Master-detail (Ficha) — solo desktop + modo ficha */}
            {rosterMode === 'ficha' && (
                <div className="hidden md:block">
                    <CoachRosterMasterDetail
                        clients={clients}
                        pulseByClientId={pulseByClientId}
                        showTools={toolsEnabled}
                    />
                </div>
            )}

            {/* Directorio: DESKTOP (md+) = vista TABLA 1:1 (DesktopRosterTable, autocontenida);
                MÓVIL (<md) = action bar + tarjetas/tabla densa. Oculto en desktop cuando el modo es Ficha. */}
            <div className={cn(rosterMode === 'ficha' && 'md:hidden')}>
            {/* DESKTOP — vista TABLA 1:1 con DesktopRosterTable del diseño */}
            <div className="hidden md:block">
                <DesktopRosterTable
                    clients={clients}
                    pulseByClientId={pulseByClientId}
                    coachSlug={publicIdentifier}
                    appUrl={appUrl}
                />
            </div>

            {/* MÓVIL — action bar + tarjetas / tabla densa */}
            <div className="space-y-4 md:hidden">
            <DirectoryActionBar
                search={search}
                onSearchChange={setSearch}
                sortKey={sortKey}
                onSortChange={handleSortFromBar}
                view={view}
                onViewChange={setView}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                programFilter={programFilter}
                onProgramFilterChange={setProgramFilter}
                riskFilter={riskFilter}
                onRiskFilterChange={onRiskFilterChange}
                archivedCount={archivedCount}
                resultCount={sortedClients.length}
            />

            {sortedClients.length === 0 ?
                <div className="rounded-card border border-dashed border-default bg-surface-sunken px-4 py-9 text-center">
                    <div className="mb-3 inline-flex h-[52px] w-[52px] items-center justify-center rounded-full bg-surface-card text-subtle">
                        <SearchX className="h-6 w-6" />
                    </div>
                    <div className="font-display text-base font-extrabold text-strong">
                        Sin resultados
                    </div>
                    <div className="mt-1 text-[13px] text-muted">
                        Ningún alumno coincide con estos filtros.
                    </div>
                    <button
                        type="button"
                        onClick={clearFilters}
                        className="eva-press mt-3.5 rounded-control bg-[var(--text-strong)] px-[18px] py-[9px] font-ui text-[13px] font-bold text-[var(--surface-card)]"
                    >
                        Limpiar filtros
                    </button>
                </div>
            : view === 'table' ?
                <div className="pb-24">
                    <DirTableMobile
                        clients={visibleClients}
                        pulseByClientId={pulseByClientId}
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onHeaderSort={handleHeaderSort}
                        onOpen={(id) => router.push(`/coach/clients/${id}`)}
                        onActions={setActionsClient}
                    />
                    {loadMoreButton}
                </div>
            :   <div className="space-y-2 px-0 pb-24">
                    {/* row-cards · diseño coach-directory.jsx.
                        pb extra para que la última tarjeta no quede bajo el FAB ni la cápsula. */}
                    {visibleClients.map((client) => (
                        <DirRowCard
                            key={client.id}
                            client={client}
                            pulse={pulseByClientId[client.id]}
                            onActions={() => setActionsClient(client)}
                        />
                    ))}
                    {loadMoreButton}
                </div>
            }

            {/* Nuevo alumno — acción primaria en la zona del pulgar (FAB pill, diseño L391-396) */}
            <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="eva-press fixed right-5 z-40 inline-flex h-[50px] items-center gap-2 rounded-pill bg-[var(--cta-fill)] px-5 font-ui text-[15px] font-bold text-[var(--text-on-sport)] shadow-[var(--shadow-lg)] md:hidden"
                style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)' }}
            >
                <UserPlus className="h-[19px] w-[19px]" />
                Nuevo alumno
            </button>
            <CreateClientModal open={createOpen} onClose={() => setCreateOpen(false)} />
            </div>
            </div>

            {actionsClient && (
                <ClientActionsSheet
                    client={actionsClient}
                    loginUrl={loginUrl}
                    onClose={() => setActionsClient(null)}
                    onEdit={setEditingClient}
                />
            )}

            {editingClient && (
                <EditClientDataModal
                    clientId={editingClient.id}
                    clientName={editingClient.name}
                    open={!!editingClient}
                    onClose={() => setEditingClient(null)}
                />
            )}
        </div>
    )
}
