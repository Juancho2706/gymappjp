'use client'

import { useState } from 'react'
import { Plus, Search, Trash2, Edit2, LayoutGrid, Scale, Zap, Dumbbell, PieChart } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { MealGroupModal } from './MealGroupModal'
import { deleteMealGroup } from './actions'
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
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="relative w-full sm:max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar grupos..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 h-11 rounded-xl bg-card border-border/60"
                    />
                </div>
                <Button 
                    onClick={() => {
                        setEditingGroup(null)
                        setIsModalOpen(true)
                    }}
                    className="w-full sm:w-auto h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold gap-2 px-6"
                >
                    <Plus className="w-5 h-5" />
                    Nuevo Grupo
                </Button>
            </div>

            {filteredGroups.length === 0 ? (
                <div className="text-center py-20 bg-card border border-dashed border-border rounded-2xl">
                    <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <LayoutGrid className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-bold">No se encontraron grupos</h3>
                    <p className="text-muted-foreground max-w-xs mx-auto mt-1">Crea tu primer grupo de alimentos para usarlo en tus planes.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredGroups.map((group) => {
                        const totals = calculateTotals(group.items || [])
                        return (
                            <Card key={group.id} className="overflow-hidden border-border/60 hover:border-primary/40 transition-all group">
                                <CardContent className="p-0">
                                    <div className="p-5">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="min-w-0">
                                                <h3 className="font-bold text-lg truncate group-hover:text-primary transition-colors">{group.name}</h3>
                                                <p className="text-xs text-muted-foreground">{group.items?.length || 0} ingredientes</p>
                                            </div>
                                            <div className="flex gap-1">
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary"
                                                    onClick={() => {
                                                        setEditingGroup(group)
                                                        setIsModalOpen(true)
                                                    }}
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </Button>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                                                    onClick={() => handleDelete(group.id)}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-4 gap-2">
                                            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-2 text-center">
                                                <p className="text-[10px] font-bold text-orange-600 uppercase">Cal</p>
                                                <p className="text-sm font-bold text-orange-700">{Math.round(totals.calories)}</p>
                                            </div>
                                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-2 text-center">
                                                <p className="text-[10px] font-bold text-blue-600 uppercase">Prot</p>
                                                <p className="text-sm font-bold text-blue-700">{Math.round(totals.protein)}g</p>
                                            </div>
                                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-2 text-center">
                                                <p className="text-[10px] font-bold text-emerald-600 uppercase">Carb</p>
                                                <p className="text-sm font-bold text-emerald-700">{Math.round(totals.carbs)}g</p>
                                            </div>
                                            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-2 text-center">
                                                <p className="text-[10px] font-bold text-purple-600 uppercase">Fat</p>
                                                <p className="text-sm font-bold text-purple-700">{Math.round(totals.fats)}g</p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="px-5 pb-5">
                                        <div className="flex flex-wrap gap-1.5">
                                            {group.items?.slice(0, 3).map((item: any) => (
                                                <span key={item.id} className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground whitespace-nowrap">
                                                    {item.food.name} ({item.quantity}{item.unit || 'g'})
                                                </span>
                                            ))}
                                            {(group.items?.length || 0) > 3 && (
                                                <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                                                    +{group.items.length - 3} más
                                                </span>
                                            )}
                                        </div>
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
