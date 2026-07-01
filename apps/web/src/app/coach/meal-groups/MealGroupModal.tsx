'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2, Plus } from 'lucide-react'
import { FoodSearch } from '../foods/FoodSearch'
import { saveMealGroup } from './_actions/meal-groups.actions'
import { toast } from 'sonner'

interface Item {
    food_id: string;
    quantity: number;
    unit: 'g' | 'u';
    food: any;
}

export function MealGroupModal({ isOpen, onClose, onSave, editingGroup, coachId }: any) {
    const [name, setName] = useState(editingGroup?.name || '')
    const [items, setItems] = useState<Item[]>(editingGroup?.items?.map((item: any) => ({
        ...item,
        food_id: item.food_id || item.food?.id,
        unit: item.unit || 'g'
    })) || [])
    const [isSaving, setIsSaving] = useState(false)
    const [showFoodSearch, setShowFoodSearch] = useState(false)

    const totals = items.reduce((acc, item) => {
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

    const handleAddFood = (food: any) => {
        setItems([...items, { food_id: food.id, quantity: 100, unit: 'g', food }])
        setShowFoodSearch(false)
    }

    const handleRemoveItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index))
    }

    const handleUpdateQuantity = (index: number, quantity: number) => {
        const newItems = [...items]
        newItems[index].quantity = quantity
        setItems(newItems)
    }

    const handleUpdateUnit = (index: number, unit: 'g' | 'u') => {
        const newItems = [...items]
        newItems[index].unit = unit
        // If switching to units, default to 1, if switching to grams, default to 100
        if (unit === 'u' && newItems[index].quantity === 100) {
            newItems[index].quantity = 1
        } else if (unit === 'g' && newItems[index].quantity === 1) {
            newItems[index].quantity = 100
        }
        setItems(newItems)
    }

    const handleSave = async () => {
        if (!name.trim()) {
            toast.error('Por favor, ingresa un nombre para el grupo')
            return
        }
        if (items.length === 0) {
            toast.error('Agrega al menos un ingrediente')
            return
        }

        setIsSaving(true)
        const groupData = {
            id: editingGroup?.id,
            name,
            items: items.map(item => ({
                food_id: item.food_id || item.food?.id,
                quantity: item.quantity,
                unit: item.unit
            }))
        }

        const result = await saveMealGroup(groupData, coachId)
        if (result.success && result.group) {
            onSave(result.group)
            toast.success('Grupo guardado correctamente')
        } else {
            toast.error(result.error || 'Error al guardar')
        }
        setIsSaving(false)
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden border-subtle bg-surface-card p-0 sm:max-w-2xl">
                <DialogHeader className="shrink-0 p-6 pb-0">
                    <DialogTitle className="font-display text-[19px] font-extrabold normal-case tracking-[-0.01em] text-strong">
                        {editingGroup ? 'Editar grupo' : 'Nuevo grupo'}
                    </DialogTitle>
                </DialogHeader>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
                    <div className="space-y-2">
                        <Label htmlFor="name" className="text-xs font-bold text-muted">Nombre del grupo</Label>
                        <Input
                            id="name"
                            placeholder="Ej: Desayuno proteico"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="h-11 rounded-control border-default bg-surface-card text-[15px] font-semibold text-strong placeholder:text-muted"
                        />
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-muted">Ingredientes</Label>
                            <button
                                type="button"
                                onClick={() => setShowFoodSearch(true)}
                                className="eva-press inline-flex h-9 items-center gap-1.5 rounded-control border-[1.5px] border-dashed border-[color:var(--sport-300)] bg-surface-card px-3 text-[13px] font-bold text-[var(--sport-600)] transition-colors hover:bg-[var(--sport-100)]"
                            >
                                <Plus className="size-4" />
                                Agregar alimento
                            </button>
                        </div>

                        {showFoodSearch && (
                            <div className="animate-in fade-in slide-in-from-top-2 rounded-card border border-subtle bg-surface-sunken p-4 duration-300">
                                <div className="mb-4 flex items-center justify-between">
                                    <h4 className="text-sm font-bold text-strong">Buscar alimento</h4>
                                    <button
                                        type="button"
                                        onClick={() => setShowFoodSearch(false)}
                                        className="eva-press rounded-[10px] px-2 py-1 text-xs font-bold text-muted hover:text-strong"
                                    >
                                        Cerrar
                                    </button>
                                </div>
                                <FoodSearch onFoodSelected={handleAddFood} />
                            </div>
                        )}

                        <div className="space-y-2.5">
                            {items.length === 0 ? (
                                <div className="rounded-card border border-dashed border-default bg-surface-sunken py-8 text-center">
                                    <p className="text-[12.5px] text-subtle">Agregá ingredientes arriba.</p>
                                </div>
                            ) : (
                                items.map((item, index) => (
                                    <div key={index} className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-3 rounded-control border border-subtle bg-surface-card p-3.5 duration-200 sm:flex-row sm:items-center">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-bold text-strong">{item.food.name}</p>
                                            {(() => {
                                                const factor = item.unit === 'g' ? item.quantity / 100 : item.quantity
                                                return (
                                                    <p className="eva-mono mt-1 text-[11.5px] text-muted tabular-nums">
                                                        {Math.round(item.food.calories * factor)} kcal · P {Math.round(item.food.protein_g * factor)}g · C {Math.round(item.food.carbs_g * factor)}g · G {Math.round(item.food.fats_g * factor)}g
                                                    </p>
                                                )
                                            })()}
                                        </div>
                                        <div className="flex items-center gap-2 border-t border-subtle pt-2 sm:border-t-0 sm:pt-0">
                                            <div className="flex items-center overflow-hidden rounded-[10px] border-[1.5px] border-default">
                                                <button
                                                    onClick={() => handleUpdateUnit(index, 'g')}
                                                    className={`px-2.5 py-1.5 text-[11.5px] font-bold transition-colors ${item.unit === 'g' ? 'bg-surface-sunken text-strong' : 'bg-surface-card text-muted hover:text-strong'}`}
                                                >
                                                    G
                                                </button>
                                                <button
                                                    onClick={() => handleUpdateUnit(index, 'u')}
                                                    className={`border-l-[1.5px] border-default px-2.5 py-1.5 text-[11.5px] font-bold transition-colors ${item.unit === 'u' ? 'bg-surface-sunken text-strong' : 'bg-surface-card text-muted hover:text-strong'}`}
                                                >
                                                    U
                                                </button>
                                            </div>
                                            <Input
                                                type="number"
                                                value={item.quantity || ''}
                                                onChange={(e) => handleUpdateQuantity(index, Number(e.target.value))}
                                                className="eva-mono h-10 w-24 rounded-control border-default bg-surface-card px-2 text-center text-sm font-bold text-strong sm:h-9 sm:w-20"
                                            />
                                            <button
                                                type="button"
                                                aria-label="Quitar"
                                                onClick={() => handleRemoveItem(index)}
                                                className="eva-press ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-subtle transition-colors hover:bg-[var(--danger-100)] hover:text-[var(--danger-600)] sm:ml-0 sm:h-9 sm:w-9"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {items.length > 0 && (
                        <div className="eva-mono flex items-center justify-between border-t border-subtle pt-3 text-[12.5px] text-muted tabular-nums">
                            <span>Total estimado</span>
                            <span className="font-bold text-strong">
                                ~{Math.round(totals.calories)} kcal · P {Math.round(totals.protein)}g · C {Math.round(totals.carbs)}g · G {Math.round(totals.fats)}g
                            </span>
                        </div>
                    )}
                </div>

                <DialogFooter className="shrink-0 border-t border-subtle bg-surface-sunken/50 p-4 px-6">
                    <Button variant="ghost" onClick={onClose} disabled={isSaving}>Cancelar</Button>
                    <Button variant="sport" onClick={handleSave} disabled={isSaving} className="min-w-[140px]">
                        {isSaving ? 'Guardando…' : 'Guardar grupo'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
