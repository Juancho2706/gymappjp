'use client'

import { useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { GlassCard } from '@/components/ui/glass-card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, Pencil, Trash2, Plus } from 'lucide-react'
import type { ClientListItem } from '../../dashboard/_data/types'
import { ClientEditSheet } from './ClientEditSheet'
import { ClientCreateSheet } from './ClientCreateSheet'
import { AdminPagination } from '../../_components/AdminPagination'

interface Props {
    clients: ClientListItem[]
    total: number
    coaches: { id: string; full_name: string | null; brand_name: string | null; slug: string }[]
}

export function ClientTable({ clients, total, coaches }: Props) {
    const router = useRouter()
    const searchParams = useSearchParams()
    // La busqueda ahora viaja a la URL (?q=) y filtra en el SERVIDOR sobre todo el universo.
    // Antes era un useState local que solo filtraba los 50 de la pagina visible y el param
    // `q` del server era codigo muerto (ROTO-4, F0 08-05).
    const [search, setSearch] = useState(searchParams.get('q') ?? '')
    const coachIdParam = searchParams.get('coachId') ?? 'all'
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [editingClient, setEditingClient] = useState<ClientListItem | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [createOpen, setCreateOpen] = useState(false)

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

    async function handleDelete(clientId: string) {
        if (!confirm('¿Estás seguro de eliminar este cliente?')) return
        setDeletingId(clientId)
        try {
            const res = await fetch(`/admin/clients/delete?clientId=${clientId}`, { method: 'POST' })
            if (!res.ok) throw new Error('Error al eliminar')
            router.refresh()
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Error')
        } finally {
            setDeletingId(null)
        }
    }

    function handleCoachFilter(coachId: string | null) {
        if (!coachId) return
        const url = new URL(window.location.href)
        if (coachId === 'all') {
            url.searchParams.delete('coachId')
        } else {
            url.searchParams.set('coachId', coachId)
        }
        url.searchParams.delete('page')
        router.push(url.pathname + url.search)
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
                <button
                    onClick={() => setCreateOpen(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-subtle bg-surface-sunken px-3 py-2 text-xs text-body hover:border-[var(--sport-500)] hover:text-[var(--sport-500)] transition-colors whitespace-nowrap"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Nuevo Alumno
                </button>
            </div>

            <GlassCard className="overflow-hidden">
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
                                    <td className="px-4 py-3 text-muted">{client.coach_name ?? '—'}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-wrap gap-1">
                                            {client.is_archived ? (
                                                <Badge variant="outline" className="text-xs bg-[var(--warning-500)]/15 text-[var(--warning-500)] border-[var(--warning-500)]/30">
                                                    Archivado
                                                </Badge>
                                            ) : (
                                                <Badge
                                                    variant="outline"
                                                    className={`text-xs ${client.is_active !== false ? 'bg-[var(--success-500)]/15 text-[var(--success-500)] border-[var(--success-500)]/30' : 'bg-[var(--danger-500)]/15 text-[var(--danger-500)] border-[var(--danger-500)]/30'}`}
                                                >
                                                    {client.is_active !== false ? 'Activo' : 'Inactivo'}
                                                </Badge>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <Badge
                                            variant="outline"
                                            className={`text-xs ${client.onboarding_completed ? 'bg-[var(--sport-500)]/15 text-[var(--sport-500)] border-[var(--sport-500)]/30' : 'bg-[var(--warning-500)]/15 text-[var(--warning-500)] border-[var(--warning-500)]/30'}`}
                                        >
                                            {client.onboarding_completed ? 'Completado' : 'Pendiente'}
                                        </Badge>
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
                                                onClick={() => handleDelete(client.id)}
                                                disabled={deletingId === client.id}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-[var(--danger-500)]/15 hover:text-[var(--danger-500)]"
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
