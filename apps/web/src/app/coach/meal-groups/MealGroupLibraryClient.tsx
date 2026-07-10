'use client'

import { useState } from 'react'
import { Plus, Search, Trash2, PencilLine, Layers, X } from 'lucide-react'
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { MealGroupModal } from './MealGroupModal'
import { deleteMealGroup } from './_actions/meal-groups.actions'
import { toast } from 'sonner'

export function MealGroupLibraryClient({ initialGroups, coachId }: { initialGroups: any[], coachId: string }) {
    const [groups, setGroups] = useState(initialGroups)
    const [searchTerm, setSearchTerm] = useState('')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingGroup, setEditingGroup] = useState<any>(null)

    const filteredGroups = groups.filter(group =>
        group.name.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const handleDelete = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar este grupo de alimentos?')) return

        const result = await deleteMealGroup(id, coachId)
        if (result.success) {
            setGroups(groups.filter(g => g.id !== id))
            toast.success('Grupo eliminado correctamente')
        } else {
            toast.error(result.error)
        }
    }

    const handleSave = (savedGroup: any) => {
        if (editingGroup) {
            setGroups(groups.map(g => g.id === savedGroup.id ? savedGroup : g))
        } else {
            setGroups([...groups, savedGroup])
        }
        setIsModalOpen(false)
        setEditingGroup(null)
    }

    const calculateTotals = (items: any[]) => {
        return items.reduce((acc, item) => {
            const quantity = Number(item.quantity) || 0
            const unit = item.unit?.toLowerCase() || 'g'
            const factor = unit === 'g' || unit === 'ml' ? quantity / 100 : quantity

            return {
                calories: acc.calories + ((Number(item.food?.calories) || 0) * factor),
                protein: acc.protein + ((Number(item.food?.protein_g) || 0) * factor),
                carbs: acc.carbs + ((Number(item.food?.carbs_g) || 0) * factor),
                fats: acc.fats + ((Number(item.food?.fats_g) || 0) * factor)
            }
        }, { calories: 0, protein: 0, carbs: 0, fats: 0 })
    }

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]" />
                    <Input
                        placeholder="Buscar grupo…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-11 rounded-control border-default bg-surface-card pl-10 pr-10 text-base shadow-sm placeholder:text-muted md:text-sm"
                        aria-label="Buscar grupo"
                    />
                    {searchTerm && (
                        <button
                            type="button"
                            onClick={() => setSearchTerm('')}
                            aria-label="Limpiar búsqueda"
                            className="eva-press absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-surface-sunken text-[var(--text-muted)]"
                        >
                            <X className="size-3" />
                        </button>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setEditingGroup(null)
                        setIsModalOpen(true)
                    }}
                    className="eva-press inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-control px-3.5 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: 'var(--theme-primary)' }}
                >
                    <Plus className="size-4" />
                    Grupo
                </button>
            </div>

            {filteredGroups.length === 0 ? (
                <div className="flex flex-col items-center rounded-card border border-dashed border-[var(--border-default)] bg-surface-card px-6 py-16 text-center">
                    <div className="mb-3.5 flex h-[58px] w-[58px] items-center justify-center rounded-lg bg-[var(--sport-100)] text-[var(--sport-600)]">
                        <Layers className="h-7 w-7" />
                    </div>
                    <h3 className="font-display text-[16.5px] font-extrabold text-[var(--text-strong)]">
                        {searchTerm ? 'Sin resultados' : 'Sin grupos todavía'}
                    </h3>
                    <p className="mx-auto mt-1.5 max-w-[252px] text-[13px] leading-snug text-[var(--text-muted)]">
                        {searchTerm
                            ? `Ningún grupo coincide con «${searchTerm.trim()}».`
                            : 'Crea tu primer grupo de alimentos para usarlo en tus planes.'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3">
                    {filteredGroups.map((group) => {
                        const totals = calculateTotals(group.items || [])
                        return (
                            <Card key={group.id} className="rounded-card border-[var(--border-subtle)] bg-surface-card">
                                <CardContent className="space-y-2.5 p-4">
                                    <div className="flex items-start justify-between gap-2.5">
                                        <div className="min-w-0">
                                            <h3 className="truncate text-[15.5px] font-bold text-strong">{group.name}</h3>
                                            <p className="eva-mono mt-0.5 text-[11.5px] text-muted tabular-nums">
                                                {group.items?.length || 0} ingredientes · ~{Math.round(totals.calories)} kcal · {Math.round(totals.protein)}g P
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 gap-1.5">
                                            <button
                                                type="button"
                                                aria-label="Editar"
                                                className="eva-press flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border-[1.5px] border-default bg-surface-card text-muted transition-colors hover:text-strong"
                                                onClick={() => {
                                                    setEditingGroup(group)
                                                    setIsModalOpen(true)
                                                }}
                                            >
                                                <PencilLine className="h-[15px] w-[15px]" />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="Eliminar"
                                                className="eva-press flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border-[1.5px] border-default bg-surface-card text-muted transition-colors hover:text-[var(--danger-600)]"
                                                onClick={() => handleDelete(group.id)}
                                            >
                                                <Trash2 className="h-[15px] w-[15px]" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-1.5">
                                        {group.items?.slice(0, 3).map((item: any) => (
                                            <span key={item.id} className="whitespace-nowrap rounded-[var(--radius-xs)] bg-surface-sunken px-2 py-0.5 text-[11px] font-semibold text-body">
                                                {item.food.name}
                                            </span>
                                        ))}
                                        {(group.items?.length || 0) > 3 && (
                                            <span className="px-1 py-0.5 text-[11px] font-bold text-subtle">
                                                +{group.items.length - 3}
                                            </span>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}

            {isModalOpen && (
                <MealGroupModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSave={handleSave}
                    editingGroup={editingGroup}
                    coachId={coachId}
                />
            )}
        </div>
    )
}
