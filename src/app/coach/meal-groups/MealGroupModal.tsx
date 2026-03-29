'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2, Plus, Search, Scale, Zap, Dumbbell, PieChart, Apple } from 'lucide-react'
import { FoodSearch } from '../foods/FoodSearch'
import { saveMealGroup } from './actions'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

interface Item {
    food_id: string;
    quantity: number;
    food: any;
}

export function MealGroupModal({ isOpen, onClose, onSave, editingGroup, coachId }: any) {
    const [name, setName] = useState(editingGroup?.name || '')
    const [items, setItems] = useState<Item[]>(editingGroup?.items || [])
    const [isSaving, setIsSaving] = useState(false)
    const [showFoodSearch, setShowFoodSearch] = useState(false)

    const totals = items.reduce((acc, item) => {
        const factor = item.quantity / 100
        return {
            calories: acc.calories + (item.food.calories * factor),
            protein: acc.protein + (item.food.protein_g * factor),
            carbs: acc.carbs + (item.food.carbs_g * factor),
            fats: acc.fats + (item.food.fats_g * factor)
        }
    }, { calories: 0, protein: 0, carbs: 0, fats: 0 })

    const handleAddFood = (food: any) => {
        setItems([...items, { food_id: food.id, quantity: 100, food }])
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
            items: items.map(item => ({ food_id: item.food_id, quantity: item.quantity }))
        }

        const result = await saveMealGroup(groupData, coachId)
        if (result.success) {
            // Need to fetch the full saved object to return it back to library
            const supabase = createClient()
            const { data: fullGroup } = await supabase
                .from('saved_meals')
                .select(`
                    *,
                    items:saved_meal_items(
                        id,
                        quantity,
                        food:foods(*)
                    )
                `)
                .eq('id', result.id)
                .single()
            
            onSave(fullGroup)
            toast.success('Grupo guardado correctamente')
        } else {
            toast.error(result.error)
        }
        setIsSaving(false)
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0 border-none sm:rounded-3xl shadow-2xl">
                <DialogHeader className="p-6 pb-0">
                    <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-primary/10">
                            <Apple className="w-5 h-5 text-primary" />
                        </div>
                        {editingGroup ? 'Editar Grupo' : 'Nuevo Grupo de Alimentos'}
                    </DialogTitle>
                </DialogHeader>

                <div className="p-6 space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="name" className="text-sm font-bold text-muted-foreground ml-1">Nombre del Grupo</Label>
                        <Input
                            id="name"
                            placeholder="Ej: Desayuno Proteico 1"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="h-12 rounded-2xl bg-muted/50 border-transparent focus:border-primary/20 focus:bg-background transition-all text-lg font-medium"
                        />
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between ml-1">
                            <Label className="text-sm font-bold text-muted-foreground">Ingredientes</Label>
                            <Button 
                                type="button" 
                                variant="outline" 
                                size="sm" 
                                onClick={() => setShowFoodSearch(true)}
                                className="h-9 rounded-xl border-dashed border-primary/40 text-primary hover:bg-primary/5 font-bold gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                Agregar Alimento
                            </Button>
                        </div>

                        {showFoodSearch && (
                            <div className="bg-muted/30 p-4 rounded-2xl border border-border animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="font-bold text-sm">Buscar Alimento</h4>
                                    <Button variant="ghost" size="sm" onClick={() => setShowFoodSearch(false)} className="h-7 rounded-lg text-xs">Cerrar</Button>
                                </div>
                                <FoodSearch onFoodSelected={handleAddFood} />
                            </div>
                        )}

                        <div className="space-y-3">
                            {items.length === 0 ? (
                                <div className="text-center py-10 bg-muted/30 rounded-2xl border border-dashed border-border/60">
                                    <p className="text-sm text-muted-foreground">No hay ingredientes aún.</p>
                                </div>
                            ) : (
                                items.map((item, index) => (
                                    <div key={index} className="flex items-center gap-3 bg-card border border-border/60 p-3 rounded-2xl group animate-in fade-in slide-in-from-bottom-2 duration-200">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-sm truncate">{item.food.name}</p>
                                            <div className="flex gap-2 text-[10px] text-muted-foreground font-medium uppercase mt-0.5">
                                                <span>{Math.round(item.food.calories * (item.quantity / 100))} kcal</span>
                                                <span>•</span>
                                                <span>P: {Math.round(item.food.protein_g * (item.quantity / 100))}g</span>
                                                <span>•</span>
                                                <span>C: {Math.round(item.food.carbs_g * (item.quantity / 100))}g</span>
                                                <span>•</span>
                                                <span>G: {Math.round(item.food.fats_g * (item.quantity / 100))}g</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="relative w-24">
                                                <Input
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={(e) => handleUpdateQuantity(index, Number(e.target.value))}
                                                    className="h-9 rounded-xl pr-6 text-right font-bold"
                                                />
                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground pointer-events-none">g</span>
                                            </div>
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                onClick={() => handleRemoveItem(index)}
                                                className="h-9 w-9 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="bg-primary/5 rounded-3xl p-6 border border-primary/10">
                        <div className="flex items-center gap-2 mb-4">
                            <PieChart className="w-5 h-5 text-primary" />
                            <h4 className="font-bold text-sm uppercase tracking-wider text-primary/80">Totales del Grupo</h4>
                        </div>
                        <div className="grid grid-cols-4 gap-4">
                            <div className="space-y-1">
                                <div className="flex items-center gap-1 text-orange-600">
                                    <Zap className="w-3 h-3" />
                                    <p className="text-[10px] font-bold uppercase">Calorías</p>
                                </div>
                                <p className="text-xl font-bold">{Math.round(totals.calories)}</p>
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center gap-1 text-blue-600">
                                    <Dumbbell className="w-3 h-3" />
                                    <p className="text-[10px] font-bold uppercase">Proteína</p>
                                </div>
                                <p className="text-xl font-bold">{Math.round(totals.protein)}<span className="text-xs ml-0.5">g</span></p>
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center gap-1 text-emerald-600">
                                    <Scale className="w-3 h-3" />
                                    <p className="text-[10px] font-bold uppercase">Carbs</p>
                                </div>
                                <p className="text-xl font-bold">{Math.round(totals.carbs)}<span className="text-xs ml-0.5">g</span></p>
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center gap-1 text-purple-600">
                                    <PieChart className="w-3 h-3" />
                                    <p className="text-[10px] font-bold uppercase">Grasas</p>
                                </div>
                                <p className="text-xl font-bold">{Math.round(totals.fats)}<span className="text-xs ml-0.5">g</span></p>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter className="p-6 bg-muted/30 border-t border-border sm:rounded-b-3xl">
                    <Button variant="ghost" onClick={onClose} disabled={isSaving} className="rounded-xl font-bold">Cancelar</Button>
                    <Button onClick={handleSave} disabled={isSaving} className="rounded-xl px-8 font-bold bg-primary hover:bg-primary/90 text-primary-foreground min-w-[120px]">
                        {isSaving ? 'Guardando...' : 'Guardar Grupo'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
