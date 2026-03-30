'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import { Plus, Trash2, CalendarHeart, Search, LayoutGrid, Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogTrigger 
} from '@/components/ui/dialog'
import { 
    Command, 
    CommandEmpty, 
    CommandGroup, 
    CommandInput, 
    CommandItem,
    CommandList
} from '@/components/ui/command'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { saveNutritionTemplate } from './actions'
import { toast } from 'sonner'

interface MealGroup {
    id: string
    name: string
    items?: any[]
}

interface TemplateMealInput {
    id: number
    name: string
    groups: MealGroup[]
}

interface Client {
    id: string
    full_name: string
}

interface Props {
    coachId: string
    availableGroups: MealGroup[]
    availableClients: Client[]
}

export function NutritionPlanBuilder({ coachId, availableGroups, availableClients }: Props) {
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState('')

    // Plan Details
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [targetCalories, setTargetCalories] = useState('')
    const [targetProtein, setTargetProtein] = useState('')
    const [targetCarbs, setTargetCarbs] = useState('')
    const [targetFats, setTargetFats] = useState('')
    const [instructions, setInstructions] = useState('')

    // Meals & Groups
    const [meals, setMeals] = useState<TemplateMealInput[]>([
        { id: Date.now(), name: 'Desayuno', groups: [] }
    ])

    // Client Selection
    const [selectedClients, setSelectedClients] = useState<string[]>([])
    const [openPopover, setOpenPopover] = useState(false)

    const calculatedTotals = useMemo(() => {
        let calories = 0
        let protein = 0
        let carbs = 0
        let fats = 0

        meals.forEach(meal => {
            meal.groups.forEach(group => {
                group.items?.forEach(item => {
                    const quantity = item.quantity || 0
                    const factor = item.unit === 'g' || item.unit === 'ml' ? quantity / 100 : quantity
                    
                    calories += (item.calories || 0) * factor
                    protein += (item.protein_g || 0) * factor
                    carbs += (item.carbs_g || 0) * factor
                    fats += (item.fats_g || 0) * factor
                })
            })
        })

        return {
            calories: Math.round(calories),
            protein: Math.round(protein),
            carbs: Math.round(carbs),
            fats: Math.round(fats)
        }
    }, [meals])

    useEffect(() => {
        setTargetCalories(calculatedTotals.calories.toString())
        setTargetProtein(calculatedTotals.protein.toString())
        setTargetCarbs(calculatedTotals.carbs.toString())
        setTargetFats(calculatedTotals.fats.toString())
    }, [calculatedTotals])

    const handleAddMeal = () => {
        setMeals([...meals, { id: Date.now(), name: '', groups: [] }])
    }

    const handleRemoveMeal = (id: number) => {
        setMeals(meals.filter(m => m.id !== id))
    }

    const handleMealChange = (id: number, field: keyof TemplateMealInput, value: any) => {
        setMeals(meals.map(m => m.id === id ? { ...m, [field]: value } : m))
    }

    const handleAddGroupToMeal = (mealId: number, group: MealGroup) => {
        setMeals(meals.map(m => {
            if (m.id === mealId) {
                return { ...m, groups: [...m.groups, group] }
            }
            return m
        }))
    }

    const handleRemoveGroupFromMeal = (mealId: number, groupIndex: number) => {
        setMeals(meals.map(m => {
            if (m.id === mealId) {
                const newGroups = [...m.groups]
                newGroups.splice(groupIndex, 1)
                return { ...m, groups: newGroups }
            }
            return m
        }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        if (meals.length === 0) {
            setError('Agrega al menos una comida al plan.')
            return
        }

        startTransition(async () => {
            const formData = new FormData()
            formData.append('name', name)
            formData.append('description', description)
            formData.append('daily_calories', targetCalories)
            formData.append('protein_g', targetProtein)
            formData.append('carbs_g', targetCarbs)
            formData.append('fats_g', targetFats)
            formData.append('instructions', instructions)
            formData.append('selected_clients', JSON.stringify(selectedClients))

            meals.forEach((meal, i) => {
                formData.append(`meal_name_${i}`, meal.name)
                meal.groups.forEach((group, j) => {
                    formData.append(`meal_${i}_group_id_${j}`, group.id)
                })
            })

            const result = await saveNutritionTemplate(coachId, {}, formData)
            if (result?.error) {
                setError(result.error)
                toast.error(result.error)
            } else {
                toast.success('Plan global creado y asignado exitosamente.')
            }
        })
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-10">
            {error && (
                <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Basic Info & Assignment */}
                <div className="lg:col-span-1 space-y-6">
                    <Card>
                        <CardContent className="pt-6 space-y-4">
                            <h3 className="font-bold text-lg border-b pb-2">Información General</h3>
                            <div className="space-y-2">
                                <Label htmlFor="name">Nombre del Plan Template</Label>
                                <Input 
                                    id="name" 
                                    value={name} 
                                    onChange={e => setName(e.target.value)} 
                                    required 
                                    placeholder="Ej. Plan Definición Estándar"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Descripción Corta</Label>
                                <Input 
                                    id="description" 
                                    value={description} 
                                    onChange={e => setDescription(e.target.value)} 
                                    placeholder="Ej. Ideal para alumnos intermedios"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="calories">Kcal Diarias</Label>
                                    <Input id="calories" type="number" value={targetCalories} readOnly className="bg-muted cursor-not-allowed" placeholder="0" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="protein">Prot (g)</Label>
                                    <Input id="protein" type="number" value={targetProtein} readOnly className="bg-muted cursor-not-allowed" placeholder="0" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="carbs">Carbs (g)</Label>
                                    <Input id="carbs" type="number" value={targetCarbs} readOnly className="bg-muted cursor-not-allowed" placeholder="0" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="fats">Grasas (g)</Label>
                                    <Input id="fats" type="number" value={targetFats} readOnly className="bg-muted cursor-not-allowed" placeholder="0" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-6 space-y-4">
                            <h3 className="font-bold text-lg border-b pb-2">Asignación Masiva</h3>
                            <div className="space-y-2">
                                <Label>Seleccionar Alumnos ({selectedClients.length})</Label>
                                <Popover open={openPopover} onOpenChange={setOpenPopover}>
                                    <PopoverTrigger render={
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={openPopover}
                                            className="w-full justify-between h-auto py-2 min-h-[44px]"
                                        />
                                    }>
                                        <span className="truncate">
                                            {selectedClients.length > 0 
                                                ? `${selectedClients.length} seleccionados`
                                                : "Seleccionar alumnos..."}
                                        </span>
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </PopoverTrigger>
                                    <PopoverContent className="w-full p-0" align="start">
                                        <Command>
                                            <CommandInput placeholder="Buscar alumno..." />
                                            <CommandList>
                                                <CommandEmpty>No se encontraron alumnos.</CommandEmpty>
                                                <CommandGroup>
                                                    {availableClients.map((client) => (
                                                        <CommandItem
                                                            key={client.id}
                                                            onSelect={() => {
                                                                setSelectedClients(prev => 
                                                                    prev.includes(client.id)
                                                                        ? prev.filter(id => id !== client.id)
                                                                        : [...prev, client.id]
                                                                )
                                                            }}
                                                        >
                                                            <div className={cn(
                                                                "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                                                selectedClients.includes(client.id)
                                                                    ? "bg-primary text-primary-foreground"
                                                                    : "opacity-50"
                                                            )}>
                                                                {selectedClients.includes(client.id) && (
                                                                    <Check className="h-3 w-3" />
                                                                )}
                                                            </div>
                                                            {client.full_name}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                                <p className="text-[10px] text-muted-foreground mt-1">
                                    El plan se creará y se activará automáticamente para todos los alumnos seleccionados.
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Button 
                        type="submit" 
                        className="w-full font-bold h-12 shadow-lg" 
                        disabled={isPending}
                    >
                        {isPending ? 'Creando y Asignando...' : 'Crear y Asignar Plan'}
                    </Button>
                </div>

                {/* Right Column: Meals Builder */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold flex items-center gap-2">
                            <CalendarHeart className="w-5 h-5 text-primary" />
                            Estructura de Comidas
                        </h3>
                        <Button type="button" variant="outline" size="sm" onClick={handleAddMeal} className="gap-1">
                            <Plus className="w-4 h-4" /> Agregar Comida
                        </Button>
                    </div>

                    <div className="space-y-6">
                        {meals.map((meal, index) => (
                            <Card key={meal.id} className="relative overflow-visible">
                                <button 
                                    type="button" 
                                    onClick={() => handleRemoveMeal(meal.id)}
                                    className="absolute -top-2 -right-2 w-8 h-8 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-md z-10 hover:bg-destructive/90 transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>

                                <CardContent className="p-6 space-y-4">
                                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                                        <div className="flex-1 space-y-1.5 w-full">
                                            <Label className="text-xs text-muted-foreground font-bold uppercase">Comida {index + 1}</Label>
                                            <Input 
                                                value={meal.name} 
                                                onChange={e => handleMealChange(meal.id, 'name', e.target.value)} 
                                                className="font-bold text-lg" 
                                                placeholder="Nombre de la comida (ej. Almuerzo)"
                                                required
                                            />
                                        </div>
                                        
                                        <Dialog>
                                            <DialogTrigger render={
                                                <Button type="button" variant="secondary" className="gap-2 shrink-0" />
                                            }>
                                                <LayoutGrid className="w-4 h-4" />
                                                Añadir Grupo
                                            </DialogTrigger>
                                            <DialogContent className="max-w-lg">
                                                <DialogHeader>
                                                    <DialogTitle>Tus Grupos de Alimentos</DialogTitle>
                                                </DialogHeader>
                                                <div className="max-h-[400px] overflow-y-auto space-y-2 p-1">
                                                    {availableGroups.length === 0 ? (
                                                        <div className="text-center py-8">
                                                            <p className="text-muted-foreground">No tienes grupos creados.</p>
                                                            <Button 
                                                                variant="link" 
                                                                onClick={() => window.open('/coach/meal-groups', '_blank')}
                                                            >
                                                                Ir a Grupos de Alimentos
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        availableGroups.map(group => (
                                                            <div 
                                                                key={group.id} 
                                                                className="flex items-center justify-between p-3 border rounded-xl hover:bg-muted cursor-pointer transition-colors"
                                                                onClick={() => handleAddGroupToMeal(meal.id, group)}
                                                            >
                                                                <div>
                                                                    <p className="font-bold">{group.name}</p>
                                                                    <p className="text-xs text-muted-foreground">{group.items?.length || 0} ingredientes</p>
                                                                </div>
                                                                <Button size="sm" variant="ghost">Seleccionar</Button>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    </div>

                                    <div className="space-y-3">
                                        <Label className="text-xs text-muted-foreground font-bold">Grupos en esta comida:</Label>
                                        {meal.groups.length === 0 ? (
                                            <div className="text-center py-6 bg-muted/30 rounded-xl border border-dashed">
                                                <p className="text-sm text-muted-foreground">Usa el botón para añadir grupos de alimentos.</p>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {meal.groups.map((group, groupIndex) => (
                                                    <div key={groupIndex} className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-xl">
                                                        <div className="min-w-0">
                                                            <p className="font-bold text-sm truncate">{group.name}</p>
                                                            <p className="text-[10px] text-muted-foreground uppercase">Grupo Guardado</p>
                                                        </div>
                                                        <Button 
                                                            type="button" 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                                            onClick={() => handleRemoveGroupFromMeal(meal.id, groupIndex)}
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="instructions">Notas o Indicaciones Globales</Label>
                        <textarea 
                            id="instructions"
                            rows={4}
                            value={instructions}
                            onChange={e => setInstructions(e.target.value)}
                            className="flex w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            placeholder="Ej. Instrucciones generales que verán todos los alumnos asignados..."
                        />
                    </div>
                </div>
            </div>
        </form>
    )
}
