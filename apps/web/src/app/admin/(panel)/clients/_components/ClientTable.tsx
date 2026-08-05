'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { GlassCard } from '@/components/ui/glass-card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, Pencil, Trash2, Plus } from 'lucide-react'
import type { ClientListItem } from '../../dashboard/_data/types'
import { ClientEditSheet } from './ClientEditSheet'
import { ClientCreateSheet } from './ClientCreateSheet'
import { AdminPagination } from '../../_components/AdminPagination'
import { AdminConfirmDialog } from '../../_components/AdminConfirmDialog'

interface Props {
    clients: ClientListItem[]
    total: number
    coaches: { id: string; full_name: string | null; brand_name: string | null; slug: string }[]
}

// Mismo estilo que los selects nativos de CoachFilterBar — un solo lenguaje de filtros en el panel.
const selectClass =
    'rounded border border-subtle bg-surface-sunken px-2 py-1.5 text-xs text-body focus:outline-none focus:border-[var(--sport-500)] transition-colors'

function EstadoBadge({ client }: { client: ClientListItem }) {
    if (client.is_archived) {
        return (
            <Badge variant="outline" className="text-xs bg-[var(--warning-500)]/15 text-[var(--warning-500)] border-[var(--warning-500)]/30">
                Archivado
            </Badge>
        )
    }
    const activo = client.is_active !== false
    return (
        <Badge
            variant="outline"
            className={`text-xs ${activo
                ? 'bg-[var(--success-500)]/15 text-[var(--success-500)] border-[var(--success-500)]/30'
                : 'bg-[var(--danger-500)]/15 text-[var(--danger-500)] border-[var(--danger-500)]/30'}`}
        >
            {activo ? 'Activo' : 'Inactivo'}
        </Badge>
    )
}

function OnboardingBadge({ done }: { done: boolean }) {
    return (
        <Badge
            variant="outline"
            className={`text-xs ${done
                ? 'bg-[var(--sport-500)]/15 text-[var(--sport-500)] border-[var(--sport-500)]/30'
                : 'bg-[var(--warning-500)]/15 text-[var(--warning-500)] border-[var(--warning-500)]/30'}`}
        >
            {done ? 'Completado' : 'Pendiente'}
        </Badge>
    )
}

export function ClientTable({ clients, total, coaches }: Props) {
    const router = useRouter()
    const searchParams = useSearchParams()
    // La busqueda ahora viaja a la URL (?q=) y filtra en el SERVIDOR sobre todo el universo.
    // Antes era un useState local que solo filtraba los 50 de la pagina visible y el param
    // `q` del server era codigo muerto (ROTO-4, F0 08-05).
    const [search, setSearch] = useState(searchParams.get('q') ?? '')
    const coachIdParam = searchParams.get('coachId') ?? 'all'
    const estadoParam = searchParams.get('estado') ?? ''
    const onboardingParam = searchParams.get('onboarding') ?? ''
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [editingClient, setEditingClient] = useState<ClientListItem | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [createOpen, setCreateOpen] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState<ClientListItem | null>(null)

    function handleSearchChange(value: string) {
        setSearch(value)
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            const url = new URL(window.location.href)
            if (value) url.searchParams.set('q', value)
            else url.searchParams.delete('q')
            url.searchParams.delete('page')
            router.replace(url.pathname + url.search)
        }, 300)
    }

    /** Escribe un filtro en la URL: el servidor es quien filtra, no la pagina visible. */
    function pushParam(key: string, value: string) {
        const url = new URL(window.location.href)
        if (value) url.searchParams.set(key, value)
        else url.searchParams.delete(key)
        url.searchParams.delete('page')
        router.push(url.pathname + url.search)
    }

    async function runDelete(client: ClientListItem) {
        setDeletingId(client.id)
        try {
            const res = await fetch(`/admin/clients/delete?clientId=${client.id}`, { method: 'POST' })
            // La ruta responde 200 aunque la action devuelva {error} (route.ts:13), asi que
            // mirar solo res.ok reportaba "eliminado" en borrados que fallaron.
            const body = (await res.json().catch(() => null)) as { error?: string; success?: boolean } | null
            if (!res.ok || body?.error) {
                throw new Error(body?.error ?? 'No se pudo eliminar al alumno')
            }
            toast.success(`Alumno ${client.full_name} eliminado`)
            router.refresh()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo eliminar al alumno')
        } finally {
            setDeletingId(null)
        }
    }

    function handleCoachFilter(coachId: string | null) {
        if (!coachId) return
        pushParam('coachId', coachId === 'all' ? '' : coachId)
    }

    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <Input
                        placeholder="Buscar por nombre o email..."
                        value={search}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        className="pl-9 bg-surface-sunken border-subtle text-strong"
                    />
                </div>
                {/* Controlado por la URL: al llegar con ?coachId= (desde la ficha del coach)
                    el select mostraba "Todos los coaches" aunque la lista viniera filtrada (ROTO-4b). */}
                <Select onValueChange={handleCoachFilter} value={coachIdParam}>
                    <SelectTrigger className="w-[200px] bg-surface-sunken border-subtle text-strong">
                        <SelectValue placeholder="Todos los coaches" />
                    </SelectTrigger>
                    <SelectContent className="bg-surface-sunken border-subtle text-strong max-h-60">
                        <SelectItem value="all">Todos los coaches</SelectItem>
                        {coaches.map(c => (
                            <SelectItem key={c.id} value={c.id}>
                                {c.brand_name || c.full_name || c.id}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Estado / Onboarding: filtran en el SERVIDOR (?estado=, ?onboarding=), no
                    sobre la pagina visible — si no, `total` y la paginacion mentirian. */}
                <select
                    value={estadoParam}
                    onChange={e => pushParam('estado', e.target.value)}
                    className={selectClass}
                    aria-label="Filtrar por estado"
                >
                    <option value="">Todos los estados</option>
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                    <option value="archivado">Archivado</option>
                </select>
                <select
                    value={onboardingParam}
                    onChange={e => pushParam('onboarding', e.target.value)}
                    className={selectClass}
                    aria-label="Filtrar por onboarding"
                >
                    <option value="">Todo el onboarding</option>
                    <option value="completo">Completado</option>
                    <option value="pendiente">Pendiente</option>
                </select>

                <button
                    onClick={() => setCreateOpen(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-subtle bg-surface-sunken px-3 py-2 text-xs text-body hover:border-[var(--sport-500)] hover:text-[var(--sport-500)] transition-colors whitespace-nowrap"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Nuevo Alumno
                </button>
            </div>

            {/* ── Mobile: cards (la tabla de 6 columnas era ilegible bajo md) ── */}
            <div className="space-y-2 md:hidden">
                {clients.map(client => (
                    <div key={client.id} className="rounded-card border border-subtle bg-surface-card p-3">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-strong">{client.full_name}</p>
                                <p className="truncate text-xs text-muted">{client.email}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                <button
                                    onClick={() => setEditingClient(client)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-sunken hover:text-strong"
                                    title="Editar"
                                >
                                    <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={() => setConfirmDelete(client)}
                                    disabled={deletingId === client.id}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-[var(--danger-500)]/15 hover:text-[var(--danger-500)] disabled:opacity-40"
                                    title="Eliminar"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                        <p className="mt-2 text-xs text-muted">
                            Coach:{' '}
                            {client.coach_id ? (
                                <Link
                                    href={`/admin/coaches/${client.coach_id}`}
                                    className="text-[var(--sport-500)] hover:underline"
                                >
                                    {client.coach_name ?? 'Ver ficha'}
                                </Link>
                            ) : '—'}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <EstadoBadge client={client} />
                            <OnboardingBadge done={client.onboarding_completed} />
                            <span className="ml-auto text-[11px] text-muted">
                                {new Date(client.created_at).toLocaleDateString('es-CL')}
                            </span>
                        </div>
                    </div>
                ))}
                {clients.length === 0 && (
                    <div className="rounded-card border border-subtle bg-surface-card px-4 py-8 text-center text-sm text-muted">
                        No se encontraron clientes.
                    </div>
                )}
            </div>

            {/* ── Desktop ── */}
            <GlassCard className="hidden overflow-hidden md:block">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-subtle text-left text-muted">
                                <th className="px-4 py-3 font-medium">Alumno</th>
                                <th className="px-4 py-3 font-medium">Coach</th>
                                <th className="px-4 py-3 font-medium">Estado</th>
                                <th className="px-4 py-3 font-medium">Onboarding</th>
                                <th className="px-4 py-3 font-medium">Registro</th>
                                <th className="px-4 py-3 font-medium text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)]">
                            {clients.map((client) => (
                                <tr key={client.id} className="hover:bg-surface-sunken/40">
                                    <td className="px-4 py-3">
                                        <div>
                                            <p className="font-medium text-strong">{client.full_name}</p>
                                            <p className="text-xs text-muted">{client.email}</p>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-muted">
                                        {client.coach_id ? (
                                            <Link
                                                href={`/admin/coaches/${client.coach_id}`}
                                                className="text-body transition-colors hover:text-[var(--sport-500)] hover:underline"
                                            >
                                                {client.coach_name ?? 'Ver ficha'}
                                            </Link>
                                        ) : '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-wrap gap-1">
                                            <EstadoBadge client={client} />
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <OnboardingBadge done={client.onboarding_completed} />
                                    </td>
                                    <td className="px-4 py-3 text-muted">
                                        {new Date(client.created_at).toLocaleDateString('es-CL')}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                onClick={() => setEditingClient(client)}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-sunken hover:text-strong"
                                                title="Editar"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => setConfirmDelete(client)}
                                                disabled={deletingId === client.id}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-[var(--danger-500)]/15 hover:text-[var(--danger-500)] disabled:opacity-40"
                                                title="Eliminar"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {clients.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-muted">
                        No se encontraron clientes.
                    </div>
                )}
            </GlassCard>

            <AdminPagination total={total} pageSize={50} />

            <AdminConfirmDialog
                open={confirmDelete !== null}
                onOpenChange={o => { if (!o) setConfirmDelete(null) }}
                title="¿Eliminar alumno?"
                description={`Elimina al alumno ${confirmDelete?.full_name ?? ''} y su historial. Irreversible.`}
                blastRadius={confirmDelete
                    ? `Borra rutinas, planes de nutrición y registros de ${confirmDelete.full_name}. No se puede deshacer.`
                    : undefined}
                severity="danger"
                confirmLabel="Eliminar alumno"
                onConfirm={async () => { if (confirmDelete) await runDelete(confirmDelete) }}
            />

            {editingClient && (
                <ClientEditSheet
                    client={editingClient}
                    open={true}
                    onClose={() => setEditingClient(null)}
                />
            )}

            <ClientCreateSheet
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                coaches={coaches}
            />
        </>
    )
}
