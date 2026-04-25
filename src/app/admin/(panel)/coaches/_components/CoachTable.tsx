'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { GlassCard } from '@/components/ui/glass-card'
import { Search, Pencil, Trash2, ExternalLink } from 'lucide-react'
import type { CoachListItem } from '../../dashboard/_data/types'
import { CoachEditSheet } from './CoachEditSheet'

interface Props {
    coaches: CoachListItem[]
}

const statusColors: Record<string, string> = {
    active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    trialing: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    canceled: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    pending_payment: 'bg-red-500/20 text-red-400 border-red-500/30',
    expired: 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30',
    past_due: 'bg-red-500/20 text-red-400 border-red-500/30',
    paused: 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30',
}

export function CoachTable({ coaches }: Props) {
    const [search, setSearch] = useState('')
    const [editingCoach, setEditingCoach] = useState<CoachListItem | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const router = useRouter()

    const filtered = coaches.filter((c) => {
        const q = search.toLowerCase()
        return (
            (c.full_name?.toLowerCase().includes(q) ?? false) ||
            (c.brand_name?.toLowerCase().includes(q) ?? false) ||
            c.slug.toLowerCase().includes(q)
        )
    })

    async function handleDelete(coachId: string) {
        if (!confirm('¿Estás seguro de eliminar este coach? Esta acción no se puede deshacer.')) return
        setDeletingId(coachId)
        try {
            const res = await fetch(`/admin/coaches/delete?coachId=${coachId}`, { method: 'POST' })
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
                        placeholder="Buscar por nombre, marca, email o slug..."
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
                                <th className="px-4 py-3 font-medium">Coach</th>
                                <th className="px-4 py-3 font-medium">Slug</th>
                                <th className="px-4 py-3 font-medium">Tier</th>
                                <th className="px-4 py-3 font-medium">Estado</th>
                                <th className="px-4 py-3 font-medium">Alumnos</th>
                                <th className="px-4 py-3 font-medium">Registro</th>
                                <th className="px-4 py-3 font-medium text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800">
                            {filtered.map((coach) => (
                                <tr key={coach.id} className="hover:bg-neutral-900/40">
                                    <td className="px-4 py-3">
                                        <div>
                                            <p className="font-medium text-white">{coach.brand_name || coach.full_name || '—'}</p>
                                            <p className="text-xs text-neutral-500">/{coach.slug}</p>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-neutral-400">{coach.slug}</td>
                                    <td className="px-4 py-3">
                                        <span className="text-xs font-medium uppercase text-neutral-300">
                                            {coach.subscription_tier ?? '—'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <Badge
                                            variant="outline"
                                            className={`text-xs capitalize ${statusColors[coach.subscription_status ?? ''] ?? 'bg-neutral-500/20 text-neutral-400'}`}
                                        >
                                            {coach.subscription_status}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3 text-neutral-300">{coach.client_count}</td>
                                    <td className="px-4 py-3 text-neutral-500">
                                        {new Date(coach.created_at).toLocaleDateString('es-CL')}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-1">
                                            <Link
                                                href={`/c/${coach.slug}/login`}
                                                target="_blank"
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-white"
                                                title="Ver app del coach"
                                            >
                                                <ExternalLink className="h-4 w-4" />
                                            </Link>
                                            <button
                                                onClick={() => setEditingCoach(coach)}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-white"
                                                title="Editar"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(coach.id)}
                                                disabled={deletingId === coach.id}
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
                        No se encontraron coaches.
                    </div>
                )}
            </GlassCard>

            {editingCoach && (
                <CoachEditSheet
                    coach={editingCoach}
                    open={true}
                    onClose={() => setEditingCoach(null)}
                />
            )}
        </>
    )
}
