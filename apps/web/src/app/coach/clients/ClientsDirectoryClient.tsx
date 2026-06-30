'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Users, Table2, PanelLeft } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ClientCardV2 } from '@/components/coach/ClientCardV2'
import { DirectoryActionBar } from './DirectoryActionBar'
import { DesktopRosterTable } from './DesktopRosterTable'
import { ClientsDirectoryEmpty } from './ClientsDirectoryEmpty'
import { CoachRosterMasterDetail } from './CoachRosterMasterDetail'
import { DirRowCard } from './DirRowCard'
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
}

/** Toggle segmentado Tabla / Ficha — transcripción del `.dt-viewtoggle` del diseño. */
function RosterViewToggle({
    value,
    onChange,
}: {
    value: 'ficha' | 'tabla'
    onChange: (m: 'ficha' | 'tabla') => void
}) {
    return (
        <div className="flex gap-0.5 rounded-control bg-surface-sunken p-[3px]">
            <button
                type="button"
                onClick={() => onChange('tabla')}
                className={cn(
                    'inline-flex h-[30px] items-center gap-1.5 rounded-[calc(var(--radius-control)-3px)] px-3 text-[13px] font-bold transition-colors',
                    value === 'tabla'
                        ? 'bg-surface-card text-sport-600 shadow-[var(--shadow-xs)]'
                        : 'text-muted hover:text-strong'
                )}
            >
                <Table2 className="h-[15px] w-[15px]" />
                Tabla
            </button>
            <button
                type="button"
                onClick={() => onChange('ficha')}
                className={cn(
                    'inline-flex h-[30px] items-center gap-1.5 rounded-[calc(var(--radius-control)-3px)] px-3 text-[13px] font-bold transition-colors',
                    value === 'ficha'
                        ? 'bg-surface-card text-sport-600 shadow-[var(--shadow-xs)]'
                        : 'text-muted hover:text-strong'
                )}
            >
                <PanelLeft className="h-[15px] w-[15px]" />
                Ficha
            </button>
        </div>
    )
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

function useGridVariants(reduceMotion: boolean | null) {
    if (reduceMotion) {
        return {
            hidden: { opacity: 1 },
            show: { opacity: 1 },
        }
    }
    return {
        hidden: {},
        show: { transition: { staggerChildren: 0.06 } },
    }
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
}: ClientsDirectoryClientProps) {
    const reduceMotion = useReducedMotion()
    const gridContainer = useGridVariants(reduceMotion)

    const [search, setSearch] = useState('')
    const [sortKey, setSortKey] = useState<DirectorySortKey>('attention_score')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() =>
        defaultSortDir('attention_score')
    )
    const [view, setView] = useState<'grid' | 'table'>('table')
    const [statusFilter, setStatusFilter] = useState<StatusDirectoryFilter>('any')
    const [programFilter, setProgramFilter] = useState<ProgramDirectoryFilter>('any')
    const [gridVisibleCount, setGridVisibleCount] = useState(48)
    const [editingClient, setEditingClient] = useState<{ id: string; name: string } | null>(null)

    useEffect(() => {
        setGridVisibleCount(48)
    }, [search, riskFilter, statusFilter, programFilter, sortKey, sortDir, view])

    const handleSortFromBar = (k: DirectorySortKey) => {
        setSortKey(k)
        setSortDir(defaultSortDir(k))
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

    const gridClients = useMemo(
        () => sortedClients.slice(0, gridVisibleCount),
        [sortedClients, gridVisibleCount]
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
        sortedClients.length > gridVisibleCount ? (
            <div className="flex justify-center px-4 pb-8 lg:px-0">
                <button
                    type="button"
                    onClick={() =>
                        setGridVisibleCount((n) => Math.min(n + 48, sortedClients.length))
                    }
                    className="rounded-pill border border-default bg-surface-sunken px-6 py-2 text-sm font-semibold text-strong transition-colors hover:bg-surface-card"
                >
                    Cargar más ({sortedClients.length - gridVisibleCount} restantes)
                </button>
            </div>
        ) : null

    return (
        <div className="min-w-0 max-w-full">
            {/* Toggle Tabla / Ficha — solo desktop (md+), arriba a la derecha */}
            <div className="mb-4 hidden md:flex md:justify-end">
                <RosterViewToggle value={rosterMode} onChange={onRosterModeChange} />
            </div>

            {/* Master-detail (Ficha) — solo desktop + modo ficha */}
            {rosterMode === 'ficha' && (
                <div className="hidden md:block">
                    <CoachRosterMasterDetail
                        clients={clients}
                        pulseByClientId={pulseByClientId}
                        onShowTable={() => onRosterModeChange('tabla')}
                    />
                </div>
            )}

            {/* Directorio: DESKTOP (md+) = vista TABLA 1:1 (DesktopRosterTable, autocontenida);
                MÓVIL (<md) = action bar + tarjetas. Oculto en desktop cuando el modo es Ficha. */}
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

            {/* MÓVIL — action bar + tarjetas */}
            <div className="space-y-6 md:hidden">
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
            />

            {sortedClients.length === 0 ?
                <Card className="mx-4 flex flex-col items-center justify-center py-20 text-center md:mx-0 md:py-28">
                    <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-card border border-subtle bg-surface-sunken shadow-[var(--shadow-sm)]">
                        <Users className="h-10 w-10 text-muted opacity-40" />
                    </div>
                    <h3 className="font-display text-lg font-black uppercase tracking-tighter text-strong md:text-xl">
                        Sin resultados
                    </h3>
                    <p className="mt-3 max-w-md px-4 text-xs font-medium leading-relaxed text-muted md:text-sm">
                        {search ?
                            <>
                                Prueba buscando por email o nombre completo. Término:{' '}
                                <span className="font-bold text-strong">&quot;{search}&quot;</span>
                            </>
                        :   'Ningún alumno coincide con los filtros activos.'}
                    </p>
                </Card>
            : view === 'table' ?
                <div className="space-y-2 px-0 pb-6">
                    {/* row-cards · diseño coach-directory.jsx.
                        pb extra para que la última tarjeta no quede bajo la cápsula flotante. */}
                    {gridClients.map((client) => (
                        <DirRowCard
                            key={client.id}
                            client={client}
                            pulse={pulseByClientId[client.id]}
                            loginUrl={loginUrl}
                            onEdit={() =>
                                setEditingClient({ id: client.id, name: client.full_name })
                            }
                        />
                    ))}
                    {loadMoreButton}
                </div>
            :   <div className="space-y-4">
                    <motion.div
                    className="grid grid-cols-1 gap-4 px-4 sm:grid-cols-2 lg:grid-cols-2 lg:px-0 xl:grid-cols-3 xl:gap-8"
                    variants={gridContainer}
                    initial="hidden"
                    animate="show"
                >
                    {gridClients.map((client) => {
                        const pulse = pulseByClientId[client.id]
                        let subscriptionDaysRemaining = null
                        if (client.subscription_start_date) {
                            const start = new Date(client.subscription_start_date)
                            const end = new Date(start)
                            end.setMonth(end.getMonth() + 1)
                            const diff = Math.ceil(
                                (end.getTime() - new Date().getTime()) / (1000 * 3600 * 24)
                            )
                            subscriptionDaysRemaining = diff
                        }

                        const whatsappLink =
                            client.phone ?
                                `https://wa.me/${client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${client.full_name}, aquí tienes tu link de acceso a la app: ${loginUrl}`)}`
                            :   '#'

                        const activeProgram = client.workout_programs?.find(
                            (p: any) => p.is_active
                        )
                        const programDaysRemaining = pulse?.planDaysRemaining ?? null

                        return (
                            <ClientCardV2
                                key={client.id}
                                client={client}
                                loginUrl={loginUrl}
                                whatsappLink={whatsappLink}
                                subscriptionDaysRemaining={subscriptionDaysRemaining}
                                remainingDays={programDaysRemaining}
                                activeProgramName={activeProgram?.name || null}
                                pulse={pulse}
                            />
                        )
                    })}
                </motion.div>
                {loadMoreButton}
                </div>
            }
            </div>
            </div>

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
