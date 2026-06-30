'use client'

import { useRef, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Apple, ArrowUpDown, Eye, Pencil } from 'lucide-react'
import type { DirectoryPulseRow } from '@/services/dashboard.service'
import type { DirectorySortKey } from './directory-types'
import { defaultSortDir, sortClientsByKey } from './clientsDirectorySort'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { differenceInDays } from 'date-fns'
import { EditClientDataModal } from './EditClientDataModal'
import { DeleteClientButton } from './DeleteClientButton'
import { ArchiveClientButton } from './ArchiveClientButton'

type ColId =
    | 'name'
    | 'status'
    | 'score'
    | 'adherence'
    | 'weight'
    | 'last'
    | 'program'
    | 'days'

const COL_TO_SORT: Partial<Record<ColId, DirectorySortKey>> = {
    name: 'name_asc',
    score: 'attention_score',
    adherence: 'adherence_desc',
    weight: 'weight_delta',
    last: 'last_activity',
    days: 'plan_days',
}

interface ClientsDirectoryTableProps {
    clients: any[]
    pulseByClientId: Record<string, DirectoryPulseRow>
    sortKey: DirectorySortKey
    sortDir: 'asc' | 'desc'
    onSortChange: (key: DirectorySortKey, dir: 'asc' | 'desc') => void
    coachSlug?: string
    appUrl: string
}

function StatusCell({ client }: { client: any }) {
    if (client.is_archived === true) {
        return (
            <Badge tone="neutral" variant="soft" size="sm" className="uppercase tracking-wide">
                Archivado
            </Badge>
        )
    }
    if (client.is_active === false) {
        return (
            <Badge tone="danger" variant="soft" size="sm" className="uppercase tracking-wide">
                Pausado
            </Badge>
        )
    }
    if (client.force_password_change) {
        return (
            <Badge tone="info" variant="soft" size="sm" className="uppercase tracking-wide">
                Pend. sync
            </Badge>
        )
    }
    return (
        <Badge tone="success" variant="soft" size="sm" className="uppercase tracking-wide">
            Activo
        </Badge>
    )
}

function ScoreBadge({ score }: { score: number }) {
    const tone =
        score >= 50
            ? 'bg-[var(--danger-100)] text-[var(--danger-700)]'
            : score >= 25
              ? 'bg-[var(--warning-100)] text-[var(--warning-700)]'
              : 'bg-[var(--success-100)] text-[var(--success-700)]'
    return (
        <span
            className={cn(
                'rounded-[var(--radius-control)] px-2 py-0.5 font-mono text-xs font-black tabular-nums',
                tone
            )}
        >
            {score}
        </span>
    )
}

function HeaderBtn({
    label,
    col,
    sortKey,
    sortDir,
    onSort,
}: {
    label: string
    col: ColId
    sortKey: DirectorySortKey
    sortDir: 'asc' | 'desc'
    onSort: (key: DirectorySortKey, dir: 'asc' | 'desc') => void
}) {
    const sk = COL_TO_SORT[col]
    if (!sk) {
        return (
            <span className="text-[10px] font-black uppercase tracking-widest text-subtle">
                {label}
            </span>
        )
    }
    const active = sortKey === sk
    return (
        <button
            type="button"
            onClick={() => {
                if (sortKey === sk) {
                    onSort(sk, sortDir === 'asc' ? 'desc' : 'asc')
                } else {
                    onSort(sk, defaultSortDir(sk))
                }
            }}
            className={cn(
                'inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest transition-colors hover:text-strong',
                active ? 'text-strong' : 'text-subtle'
            )}
        >
            {label}
            <ArrowUpDown
                className={cn('h-3 w-3', active ? 'text-sport-600 opacity-100' : 'opacity-40')}
            />
            {active ?
                <span className="text-[9px] font-bold text-sport-600">{sortDir === 'asc' ? '↑' : '↓'}</span>
            : null}
        </button>
    )
}

export function ClientsDirectoryTable({
    clients,
    pulseByClientId,
    sortKey,
    sortDir,
    onSortChange,
    coachSlug,
    appUrl,
}: ClientsDirectoryTableProps) {
    const router = useRouter()
    const parentRef = useRef<HTMLDivElement>(null)
    const [editingClient, setEditingClient] = useState<{ id: string; name: string } | null>(null)

    const sorted = useMemo(
        () => sortClientsByKey(clients, pulseByClientId, sortKey, sortDir),
        [clients, pulseByClientId, sortKey, sortDir]
    )

    const useVirtual = sorted.length > 20
    const rowVirtualizer = useVirtualizer({
        count: sorted.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 56,
        overscan: 8,
        enabled: useVirtual,
    })

    const virtualItems = useVirtual ? rowVirtualizer.getVirtualItems() : null

    const loginUrl = coachSlug && appUrl ? `${appUrl}/c/${coachSlug}/login` : ''

    const renderRow = (client: any, style?: React.CSSProperties) => {
        const pulse = pulseByClientId[client.id]
        const p = pulse
        const last = p?.lastWorkoutDate
        const daysSince = last ? differenceInDays(new Date(), new Date(last)) : 999
        const dot =
            daysSince < 3 ? 'bg-[var(--success-500)]'
            : daysSince < 7 ? 'bg-[var(--warning-500)]'
            : 'bg-[var(--danger-500)]'
        const waMessage = `Hola ${client.full_name}! 👋 Soy tu coach. Aquí está tu link para acceder a tu plan: ${loginUrl}`
        const whatsappLink =
            client.phone && loginUrl ?
                `https://wa.me/${client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(waMessage)}`
            :   null

        return (
            <div
                key={client.id}
                style={style}
                role="row"
                onClick={() => router.push(`/coach/clients/${client.id}`)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') router.push(`/coach/clients/${client.id}`)
                }}
                tabIndex={0}
                className="grid cursor-pointer grid-cols-[minmax(180px,1.2fr)_88px_72px_100px_100px_minmax(90px,0.8fr)_minmax(120px,1fr)_72px_100px] gap-2 border-b border-subtle px-3 py-2 text-sm transition-colors hover:bg-surface-sunken"
            >
                <div className="flex min-w-0 items-center gap-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-[var(--surface-inverse)] font-display text-sm font-black uppercase text-sport-400">
                        {client.full_name?.[0]}
                    </div>
                    <div className="min-w-0">
                        <p className="truncate font-bold text-strong">{client.full_name}</p>
                        <p className="truncate text-[10px] text-subtle">{client.email}</p>
                    </div>
                </div>
                <div className="flex items-center">
                    <StatusCell client={client} />
                </div>
                <div className="flex items-center">
                    <ScoreBadge score={p?.attentionScore ?? 0} />
                </div>
                <div className="flex items-center gap-2">
                    {p?.attentionFlags?.includes('NUTRICION_RIESGO') ?
                        <span
                            className="shrink-0 rounded-full border border-[color:var(--ember-500)]/40 bg-[var(--ember-100)] p-1"
                            title="Adherencia nutricional baja (menos del 60%)"
                        >
                            <Apple className="h-3.5 w-3.5 text-[var(--ember-600)]" aria-hidden />
                            <span className="sr-only">Nutrición baja</span>
                        </span>
                    : null}
                    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--track)]">
                        <div
                            className="h-full rounded-full bg-sport-500"
                            style={{ width: `${p?.percentage ?? 0}%` }}
                        />
                    </div>
                    <span className="w-8 shrink-0 text-right text-xs font-bold tabular-nums text-strong">
                        {p?.percentage ?? 0}%
                    </span>
                </div>
                <div className="flex flex-col justify-center text-xs font-bold tabular-nums text-strong">
                    <span>{p?.currentWeight != null ? `${p.currentWeight} kg` : '—'}</span>
                    {p?.weightDelta7d != null ?
                        <span className="text-[10px] font-medium text-muted">
                            {p.weightDelta7d > 0 ? '+' : ''}
                            {p.weightDelta7d} (7d)
                        </span>
                    : null}
                </div>
                <div className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
                    <span className="text-xs font-medium text-body">
                        {last ?
                            daysSince === 0 ? 'Hoy'
                            : daysSince === 1 ? 'Ayer'
                            : `Hace ${daysSince}d`
                        :   '—'}
                    </span>
                </div>
                <div className="hidden min-w-0 items-center lg:flex">
                    <span className="truncate text-xs font-medium text-muted">
                        {client.workout_programs?.find((x: any) => x.is_active)?.name ?? '—'}
                    </span>
                </div>
                <div className="flex items-center text-xs font-black tabular-nums text-strong">
                    {p?.planDaysRemaining != null ? p.planDaysRemaining : '—'}
                </div>
                <div
                    className="flex items-center justify-end gap-1"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                >
                    <Link
                        href={`/coach/clients/${client.id}`}
                        className="rounded-control p-2 text-muted transition-colors hover:bg-surface-sunken hover:text-sport-600"
                        aria-label="Ver perfil"
                    >
                        <Eye className="h-4 w-4" />
                    </Link>
                    {whatsappLink ?
                        <a
                            href={whatsappLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-control bg-[#25D366] px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-white transition-colors hover:bg-[#1ebe5d]"
                            aria-label="Enviar WhatsApp"
                        >
                            WA
                        </a>
                    : null}
                    <button
                        type="button"
                        onClick={() => setEditingClient({ id: client.id, name: client.full_name })}
                        className="rounded-control p-2 text-muted transition-colors hover:bg-surface-sunken hover:text-sport-600"
                        aria-label="Editar datos"
                    >
                        <Pencil className="h-4 w-4" />
                    </button>
                    <ArchiveClientButton
                        clientId={client.id}
                        clientName={client.full_name}
                        isArchived={client.is_archived === true}
                    />
                    <DeleteClientButton
                        clientId={client.id}
                        clientName={client.full_name}
                    />
                </div>
            </div>
        )
    }

    return (
        <>
        <div className="overflow-hidden rounded-card border border-subtle bg-surface-card">
            {/* Una sola zona de scroll horizontal: encabezado y filas comparten el mismo ancho mínimo */}
            <div className="touch-auto overscroll-x-contain overflow-x-auto">
                <div className="min-w-[920px]">
                    <div
                        role="row"
                        className="sticky top-0 z-[1] grid grid-cols-[minmax(180px,1.2fr)_88px_72px_100px_100px_minmax(90px,0.8fr)_minmax(120px,1fr)_72px_100px] gap-2 border-b border-default bg-surface-sunken px-3 py-3 text-left"
                    >
                        <HeaderBtn
                            label="Alumno"
                            col="name"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={onSortChange}
                        />
                        <HeaderBtn
                            label="Estado"
                            col="status"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={onSortChange}
                        />
                        <HeaderBtn
                            label="Score"
                            col="score"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={onSortChange}
                        />
                        <HeaderBtn
                            label="Adh."
                            col="adherence"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={onSortChange}
                        />
                        <HeaderBtn
                            label="Peso"
                            col="weight"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={onSortChange}
                        />
                        <HeaderBtn
                            label="Último"
                            col="last"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={onSortChange}
                        />
                        <span className="hidden text-[10px] font-black uppercase tracking-widest text-subtle lg:inline">
                            Programa
                        </span>
                        <HeaderBtn
                            label="Días"
                            col="days"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={onSortChange}
                        />
                        <span className="text-[10px] font-black uppercase tracking-widest text-subtle">
                            Acc.
                        </span>
                    </div>

                    <div
                        ref={parentRef}
                        className={cn(useVirtual && 'max-h-[70vh] overflow-y-auto')}
                    >
                        <div
                            style={
                                useVirtual ?
                                    {
                                        height: `${rowVirtualizer.getTotalSize()}px`,
                                        position: 'relative',
                                    }
                                : undefined
                            }
                        >
                            {useVirtual && virtualItems ?
                                virtualItems.map((vi) => {
                                    const client = sorted[vi.index]
                                    return renderRow(client, {
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: `${vi.size}px`,
                                        transform: `translateY(${vi.start}px)`,
                                    })
                                })
                            :   sorted.map((c) => renderRow(c))}
                        </div>
                    </div>
                </div>
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
        </>
    )
}
