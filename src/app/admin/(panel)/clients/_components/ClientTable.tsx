'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { GlassCard } from '@/components/ui/glass-card'
import { Search, Pencil, Trash2 } from 'lucide-react'
import type { ClientListItem } from '../../dashboard/_data/types'
import { ClientEditSheet } from './ClientEditSheet'

interface Props {
    clients: ClientListItem[]
}

export function ClientTable({ clients }: Props) {
    const [search, setSearch] = useState('')
    const [editingClient, setEditingClient] = useState<ClientListItem | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const router = useRouter()

    const filtered = clients.filter((c) => {
        const q = search.toLowerCase()
        return (
            c.full_name.toLowerCase().includes(q) ||
            c.email.toLowerCase().includes(q) ||
            (c.coach_name?.toLowerCase().includes(q) ?? false)
        )
    })

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

    return (
        <>
            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                    <Input
                        placeholder="Buscar por nombre, email o coach..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 bg-neutral-900 border-neutral-800 text-white"
                    />
                </div>
            </div>

            <GlassCard className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-neutral-800 text-left text-neutral-400">
                                <th className="px-4 py-3 font-medium">Alumno</th>
                                <th className="px-4 py-3 font-medium">Coach</th>
                                <th className="px-4 py-3 font-medium">Estado</th>
                                <th className="px-4 py-3 font-medium">Onboarding</th>
                                <th className="px-4 py-3 font-medium">Registro</th>
                                <th className="px-4 py-3 font-medium text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800">
                            {filtered.map((client) => (
                                <tr key={client.id} className="hover:bg-neutral-900/40">
                                    <td className="px-4 py-3">
                                        <div>
                                            <p className="font-medium text-white">{client.full_name}</p>
                                            <p className="text-xs text-neutral-500">{client.email}</p>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-neutral-400">{client.coach_name ?? '—'}</td>
                                    <td className="px-4 py-3">
                                        <Badge
                                            variant="outline"
                                            className={`text-xs ${client.is_active !== false ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}
                                        >
                                            {client.is_active !== false ? 'Activo' : 'Inactivo'}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3">
                                        <Badge
                                            variant="outline"
                                            className={`text-xs ${client.onboarding_completed ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'}`}
                                        >
                                            {client.onboarding_completed ? 'Completado' : 'Pendiente'}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3 text-neutral-500">
                                        {new Date(client.created_at).toLocaleDateString('es-CL')}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                onClick={() => setEditingClient(client)}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-white"
                                                title="Editar"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(client.id)}
                                                disabled={deletingId === client.id}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-red-950 hover:text-red-400"
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
                {filtered.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-neutral-500">
                        No se encontraron clientes.
                    </div>
                )}
            </GlassCard>

            {editingClient && (
                <ClientEditSheet
                    client={editingClient}
                    open={true}
                    onClose={() => setEditingClient(null)}
                />
            )}
        </>
    )
}
