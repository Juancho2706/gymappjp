'use client'

import { useState, useMemo, useActionState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, Apple, Info, Plus, Loader2, Save, X, Star } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { saveCustomFood } from './actions'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useFormStatus } from 'react-dom'

interface Food {
    id: string;
    name: string;
    serving_size: number;
    serving_unit: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
    coach_id: string | null;
}

interface Props {
    foods: Food[]
    coachId: string
}

export function NutritionFoodCatalog({ foods, coachId }: Props) {
    const [search, setSearch] = useState('')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [state, formAction] = useActionState(saveCustomFood.bind(null, coachId), { error: undefined, success: false })

    const filteredFoods = useMemo(() => {
        return foods.filter(food => 
            food.name.toLowerCase().includes(search.toLowerCase())
        ).sort((a, b) => (b.coach_id ? 1 : 0) - (a.coach_id ? 1 : 0)) // Custom foods first
    }, [foods, search])

    // Effect to handle success and close modal
    useEffect(() => {
        if (state.success) {
            setIsModalOpen(false)
            toast.success('Alimento guardado con éxito')
        }
    }, [state.success])

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div className="relative max-w-md w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                        placeholder="Buscar alimento por nombre..." 
                        className="pl-12 h-12 rounded-2xl bg-muted/30 border-border/50 focus:ring-primary/20 transition-all"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                    <DialogTrigger className="h-12 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-widest text-[10px] gap-2 px-6 shadow-lg shadow-primary/20 flex items-center justify-center">
                        <Plus className="w-4 h-4" />
                        Nuevo Alimento
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-950 border-border/50">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-black uppercase tracking-tighter">Crear Alimento Custom</DialogTitle>
                        </DialogHeader>
                        <form action={formAction} className="space-y-6 pt-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nombre del Alimento</Label>
                                <Input name="name" placeholder="Ej: Whey Protein ISO" required className="h-11 rounded-xl" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Calorías (100g)</Label>
                                    <Input name="calories" type="number" step="0.1" required placeholder="0" className="h-11 rounded-xl" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Proteína (g)</Label>
                                    <Input name="protein" type="number" step="0.1" required placeholder="0" className="h-11 rounded-xl" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Carbos (g)</Label>
                                    <Input name="carbs" type="number" step="0.1" required placeholder="0" className="h-11 rounded-xl" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Grasas (g)</Label>
                                    <Input name="fats" type="number" step="0.1" required placeholder="0" className="h-11 rounded-xl" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Categoría</Label>
                                    <Input name="category" placeholder="Ej: Suplementos" className="h-11 rounded-xl" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Unidad</Label>
                                    <Input name="unit" defaultValue="g" className="h-11 rounded-xl" />
                                </div>
                            </div>

                            <div className="pt-2">
                                <SubmitButton />
                            </div>
                            
                            {state.error && (
                                <p className="text-xs text-rose-500 font-bold text-center mt-2">{state.error}</p>
                            )}
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {filteredFoods.map((food) => (
                    <Card key={food.id} className={cn(
                        "p-4 border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/30 transition-all group relative overflow-hidden",
                        food.coach_id && "border-primary/20 bg-primary/5"
                    )}>
                        {food.coach_id && (
                            <div className="absolute top-0 right-0 p-1 bg-primary text-white text-[8px] font-black uppercase tracking-tighter px-2 rounded-bl-lg shadow-lg">
                                Custom
                            </div>
                        )}
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <h3 className="font-bold text-sm line-clamp-1 flex items-center gap-2">
                                    {food.name}
                                    {food.coach_id && <Star className="w-3 h-3 text-primary fill-primary" />}
                                </h3>
                                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mt-1">
                                    {food.serving_size || 100} {food.serving_unit || 'g'}
                                </p>
                            </div>
                            <Apple className="w-4 h-4 text-primary opacity-30 group-hover:opacity-100 transition-opacity" />
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-4">
                            <div className="p-2 rounded-lg bg-orange-500/5 border border-orange-500/10">
                                <p className="text-[8px] font-black uppercase text-orange-500/60 leading-none">Kcal</p>
                                <p className="text-sm font-bold tabular-nums">{food.calories}</p>
                            </div>
                            <div className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                                <p className="text-[8px] font-black uppercase text-blue-500/60 leading-none">Prot</p>
                                <p className="text-sm font-bold tabular-nums">{food.protein_g}g</p>
                            </div>
                            <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                                <p className="text-[8px] font-black uppercase text-emerald-500/60 leading-none">Carbs</p>
                                <p className="text-sm font-bold tabular-nums">{food.carbs_g}g</p>
                            </div>
                            <div className="p-2 rounded-lg bg-purple-500/5 border border-purple-500/10">
                                <p className="text-[8px] font-black uppercase text-purple-500/60 leading-none">Fat</p>
                                <p className="text-sm font-bold tabular-nums">{food.fats_g}g</p>
                            </div>
                        </div>
                    </Card>
                ))}

                {filteredFoods.length === 0 && (
                    <div className="col-span-full py-12 text-center text-muted-foreground italic border-2 border-dashed border-border/50 rounded-3xl">
                        {`No se encontraron alimentos con "${search}"`}
                    </div>
                )}
            </div>
        </div>
    )
}

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <Button 
            type="submit"
            disabled={pending} 
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-black uppercase tracking-widest text-[11px] shadow-lg shadow-primary/20"
        >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {pending ? 'Guardando...' : 'Desplegar Alimento'}
        </Button>
    )
}
