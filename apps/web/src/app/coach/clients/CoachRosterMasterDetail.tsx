'use client'

import { useEffect, useMemo, useState } from 'react'
import { differenceInDays } from 'date-fns'
import { Search, LayoutGrid, Plus, Users, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { DirectoryPulseRow } from '@/services/dashboard.service'
import { CreateClientModal } from './CreateClientModal'
import { CoachFichaPanel } from './CoachFichaPanel'
import { getClientFichaPanel } from './[clientId]/_actions/client-detail.actions'
import type { ClientFichaPanelBundle } from './[clientId]/_data/ficha-panel.data'

type RosterStatus = 'aldia' | 'enriesgo' | 'atrasada'

const STATUS_META: Record<RosterStatus, { label: string; dot: string; pill: string }> = {
    aldia: {
        label: 'Al día',
        dot: 'bg-[var(--success-500)]',
        pill: 'bg-[var(--success-100)] text-[var(--success-700)]',
    },
    enriesgo: {
        label: 'En riesgo',
        dot: 'bg-[var(--warning-500)]',
        pill: 'bg-[var(--warning-100)] text-[var(--warning-700)]',
    },
    atrasada: {
        label: 'Atrasada',
        dot: 'bg-[var(--danger-500)]',
        pill: 'bg-[var(--danger-100)] text-[var(--danger-700)]',
    },
}

const STATUS_RING: Record<RosterStatus, string> = {
    aldia: 'var(--success-500)',
    enriesgo: 'var(--warning-500)',
    atrasada: 'var(--danger-500)',
}

// Espejo de DirRowCard/diseño: el estado del rail sale de señales REALES (última sesión
// + attentionScore). atrasada = sin actividad ≥7d · enriesgo = score de atención ≥25 ·
// al día = en verde.
function rosterStatus(pulse: DirectoryPulseRow | undefined): RosterStatus {
    const last = pulse?.lastWorkoutDate
    const daysSince = last ? differenceInDays(new Date(), new Date(last)) : null
    const score = pulse?.attentionScore ?? 0
    if (daysSince == null || daysSince >= 7) return 'atrasada'
    if (score >= 25) return 'enriesgo'
    return 'aldia'
}

const STATUS_ORDER: Record<RosterStatus, number> = { enriesgo: 0, atrasada: 1, aldia: 2 }

interface CoachRosterMasterDetailProps {
    clients: any[]
    pulseByClientId: Record<string, DirectoryPulseRow>
    /** Cambia la vista de nivel superior a "Tabla" (acción del botón cuadrícula del rail). */
    onShowTable: () => void
}

export function CoachRosterMasterDetail({
    clients,
    pulseByClientId,
    onShowTable,
}: CoachRosterMasterDetailProps) {
    const [search, setSearch] = useState('')
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [createOpen, setCreateOpen] = useState(false)
    const [cache, setCache] = useState<Record<string, ClientFichaPanelBundle>>({})
    const [errorId, setErrorId] = useState<string | null>(null)
    const [loadingId, setLoadingId] = useState<string | null>(null)

    // Excluir archivados del rail (espejo de la vista por defecto del directorio).
    const activeClients = useMemo(
        () => clients.filter((c) => c.is_archived !== true),
        [clients]
    )

    const list = useMemo(() => {
        const q = search.trim().toLowerCase()
        return activeClients
            .filter((c) => {
                if (!q) return true
                const name = (c.full_name ?? '').toLowerCase()
                const mail = (c.email ?? '').toLowerCase()
                return name.includes(q) || mail.includes(q)
            })
            .map((c) => ({ client: c, status: rosterStatus(pulseByClientId[c.id]) }))
            .sort((a, b) => {
                const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
                if (so !== 0) return so
                const adhA = pulseByClientId[a.client.id]?.percentage ?? 0
                const adhB = pulseByClientId[b.client.id]?.percentage ?? 0
                if (adhA !== adhB) return adhA - adhB
                return (a.client.full_name ?? '').localeCompare(b.client.full_name ?? '')
            })
    }, [activeClients, search, pulseByClientId])

    const loadFicha = (id: string) => {
        setSelectedId(id)
        if (cache[id]) {
            setErrorId(null)
            return
        }
        setErrorId(null)
        setLoadingId(id)
        void (async () => {
            try {
                const bundle = await getClientFichaPanel(id)
                setCache((prev) => ({ ...prev, [id]: bundle }))
            } catch {
                setErrorId(id)
            } finally {
                setLoadingId((cur) => (cur === id ? null : cur))
            }
        })()
    }

    // Auto-seleccionar el primero (mayor prioridad) para que el detalle nunca quede vacío.
    // Solo en desktop real: este componente monta oculto en móvil (hidden md:block), así que
    // evitamos disparar la server action de la ficha cuando no es visible.
    useEffect(() => {
        if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 768px)').matches) {
            return
        }
        if (!selectedId && list.length > 0) {
            loadFicha(list[0].client.id)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [list.length])

    const selectedBundle = selectedId ? cache[selectedId] : undefined
    const isLoadingSelected = !!selectedId && loadingId === selectedId && !selectedBundle
    const isErrorSelected = !!selectedId && errorId === selectedId

    return (
        <div className="flex h-[calc(100dvh-8rem)] min-h-[600px] overflow-hidden rounded-card border border-subtle bg-surface-card">
            {/* ── Rail izquierdo (dt-md-list) ─────────────────────────────── */}
            <aside className="flex w-[300px] shrink-0 flex-col border-r border-subtle bg-surface-card xl:w-[340px]">
                <div className="shrink-0 border-b border-subtle px-4 pb-3 pt-4">
                    <div className="mb-3 flex items-center gap-2">
                        <span className="font-display text-[18px] font-extrabold tracking-[-0.02em] text-strong">
                            Alumnos
                        </span>
                        <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[12px] font-bold text-subtle">
                            {activeClients.length}
                        </span>
                        <div className="ml-auto flex gap-1.5">
                            <button
                                type="button"
                                onClick={onShowTable}
                                title="Vista tabla"
                                aria-label="Vista tabla"
                                className="flex h-[30px] w-[30px] items-center justify-center rounded-control border border-subtle bg-surface-card text-muted transition-colors hover:bg-surface-sunken hover:text-strong"
                            >
                                <LayoutGrid className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setCreateOpen(true)}
                                title="Nuevo alumno"
                                aria-label="Nuevo alumno"
                                className="flex h-[30px] w-[30px] items-center justify-center rounded-control border border-transparent bg-[var(--cta-fill)] text-[var(--text-on-sport)] transition-[filter] hover:brightness-105"
                            >
                                <Plus className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                    <div className="relative flex items-center">
                        <Search className="pointer-events-none absolute left-2.5 h-[15px] w-[15px] text-subtle" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar alumno…"
                            className="h-9 w-full rounded-control border border-subtle bg-surface-sunken pl-8 pr-2.5 text-[13.5px] text-strong outline-none focus:border-sport-500 focus:bg-surface-card"
                        />
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                    {list.length === 0 ? (
                        <div className="px-5 py-5 text-center text-[13px] text-muted">
                            Sin resultados
                        </div>
                    ) : (
                        list.map(({ client, status }) => {
                            const pulse = pulseByClientId[client.id]
                            const meta = STATUS_META[status]
                            const adherence = pulse?.percentage ?? 0
                            const week = pulse?.planCurrentWeek ?? null
                            const programName =
                                client.workout_programs?.find((p: any) => p.is_active)?.name ?? null
                            const sub = programName
                                ? `${programName}${week != null ? ` · Sem ${week}` : ''}`
                                : week != null
                                  ? `Sem ${week}`
                                  : 'Sin programa'
                            const active = client.id === selectedId
                            return (
                                <button
                                    key={client.id}
                                    type="button"
                                    onClick={() => loadFicha(client.id)}
                                    className={cn(
                                        'relative mb-0.5 flex w-full items-center gap-2.5 rounded-control p-2.5 text-left transition-colors',
                                        active
                                            ? "bg-sport-100 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-[3px] before:bg-sport-500 before:content-['']"
                                            : 'hover:bg-surface-sunken'
                                    )}
                                >
                                    <span
                                        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken font-display text-sm font-black uppercase text-strong"
                                        style={{ boxShadow: `0 0 0 2px ${STATUS_RING[status]}` }}
                                    >
                                        {client.full_name?.[0] ?? '?'}
                                    </span>
                                    <span className="flex min-w-0 flex-1 flex-col gap-px">
                                        <span className="truncate text-[14px] font-bold text-strong">
                                            {client.full_name}
                                        </span>
                                        <span className="truncate text-[11.5px] text-subtle">
                                            {sub}
                                        </span>
                                    </span>
                                    <span className="flex shrink-0 flex-col items-end gap-1">
                                        <span
                                            className={cn(
                                                'inline-flex items-center gap-1 rounded-pill px-1.5 py-0.5 text-[10px] font-bold',
                                                meta.pill
                                            )}
                                        >
                                            <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
                                            {meta.label}
                                        </span>
                                        <span
                                            className={cn(
                                                'text-[12px] font-bold tabular-nums',
                                                adherence < 60
                                                    ? 'text-[var(--danger-600)]'
                                                    : 'text-muted'
                                            )}
                                        >
                                            {adherence}%
                                        </span>
                                    </span>
                                </button>
                            )
                        })
                    )}
                </div>
            </aside>

            {/* ── Panel derecho (dt-md-detail): ficha REAL del seleccionado ── */}
            <section
                key={selectedId || 'empty'}
                className="relative min-w-0 flex-1 overflow-y-auto"
            >
                <div className="p-5 lg:p-6">
                    {!selectedId ? (
                        <DetailEmpty />
                    ) : isErrorSelected ? (
                        <DetailError clientId={selectedId} onRetry={() => loadFicha(selectedId)} />
                    ) : selectedBundle ? (
                        <CoachFichaPanel bundle={selectedBundle} />
                    ) : isLoadingSelected ? (
                        <DetailSkeleton />
                    ) : (
                        <DetailSkeleton />
                    )}
                </div>
            </section>

            <CreateClientModal open={createOpen} onClose={() => setCreateOpen(false)} />
        </div>
    )
}

function DetailEmpty() {
    return (
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-card border border-subtle bg-surface-sunken">
                <Users className="h-7 w-7 text-muted opacity-50" />
            </div>
            <div className="font-display text-lg font-black tracking-tight text-strong">
                Selecciona un alumno
            </div>
            <p className="max-w-sm text-sm text-muted">
                Elegí un alumno de la lista para ver su ficha, progreso, entreno y nutrición.
            </p>
        </div>
    )
}

function DetailError({ clientId, onRetry }: { clientId: string; onRetry: () => void }) {
    return (
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-card border border-subtle bg-surface-sunken">
                <AlertCircle className="h-7 w-7 text-[var(--danger-500)]" />
            </div>
            <div className="font-display text-lg font-black tracking-tight text-strong">
                No se pudo cargar la ficha
            </div>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={onRetry}
                    className="rounded-pill border border-default bg-surface-sunken px-4 py-2 text-sm font-semibold text-strong transition-colors hover:bg-surface-card"
                >
                    Reintentar
                </button>
                <Link
                    href={`/coach/clients/${clientId}`}
                    className="rounded-pill bg-[var(--cta-fill)] px-4 py-2 text-sm font-semibold text-[var(--text-on-sport)] transition-[filter] hover:brightness-105"
                >
                    Abrir ficha completa
                </Link>
            </div>
        </div>
    )
}

function DetailSkeleton() {
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Skeleton className="h-20 w-20 rounded-2xl" />
                <div className="space-y-3">
                    <Skeleton className="h-8 w-56" />
                    <Skeleton className="h-4 w-40" />
                </div>
            </div>
            <Skeleton className="h-24 w-full rounded-card" />
            <Skeleton className="h-9 w-full max-w-md rounded-pill" />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
                <Skeleton className="h-64 rounded-card md:col-span-8" />
                <Skeleton className="h-64 rounded-card md:col-span-4" />
            </div>
        </div>
    )
}
