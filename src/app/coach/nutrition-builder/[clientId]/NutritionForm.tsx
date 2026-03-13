'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, CalendarHeart, Search, Bookmark } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FoodSearchModal } from './FoodSearchModal'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface FoodItemInput {
    food_id: string;
    name: string;
    quantity: number;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
}

interface MealInput {
    id: number
    name: string
    food_items: FoodItemInput[]
}

interface Props {
    clientId: string
    coachId: string
}

export function NutritionForm({ clientId, coachId }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState('')

    // Macros & Config
    const [name, setName] = useState('Plan de Volumen Diario')
    const [calories, setCalories] = useState('')
    const [protein, setProtein] = useState('')
    const [carbs, setCarbs] = useState('')
    const [fats, setFats] = useState('')
    const [instructions, setInstructions] = useState('')

    const [meals, setMeals] = useState<MealInput[]>([
        { id: Date.now(), name: 'Desayuno', food_items: [] }
    ])

    const handleAddMeal = () => {
        setMeals([...meals, { id: Date.now(), name: '', food_items: [] }])
    }

    const handleRemoveMeal = (id: number) => {
        setMeals(meals.filter(m => m.id !== id))
    }

    const handleMealChange = (id: number, field: keyof MealInput, value: any) => {
        setMeals(meals.map(m => m.id === id ? { ...m, [field]: value } : m))
    }

    const handleSaveMeal = async (meal: MealInput) => {
        const supabase = createClient()
        const { data, error } = await supabase.from('saved_meals').insert([{ name: meal.name, coach_id: coachId }]).select()

        if (error || !data || data.length === 0) {
            toast.error("Error guardando la comida: " + (error?.message || "No data returned"))
            return
        }

        const savedMealId = data[0].id

        if (meal.food_items.length > 0) {
            const mealItems = meal.food_items.map(item => ({
                saved_meal_id: savedMealId,
                food_id: item.food_id,
                quantity: item.quantity
            }))

            const { error: itemsError } = await supabase.from('saved_meal_items').insert(mealItems)

            if (itemsError) {
                toast.error("Error guardando los alimentos de la comida: " + itemsError.message)
            } else {
                toast.success("Comida guardada exitosamente!")
            }
        } else {
            toast.success("Comida guardada exitosamente (sin alimentos)!")
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        startTransition(async () => {
            const formData = new FormData()
            formData.append('name', name)
            formData.append('daily_calories', calories)
            formData.append('protein_g', protein)
            formData.append('carbs_g', carbs)
            formData.append('fats_g', fats)
            formData.append('instructions', instructions)

            meals.forEach((meal, i) => {
                formData.append(`meal_name_${i}`, meal.name)
                meal.food_items.forEach((foodItem, j) => {
                    formData.append(`meal_${i}_food_id_${j}`, foodItem.food_id)
                    formData.append(`meal_${i}_quantity_${j}`, foodItem.quantity.toString())
                })
            })

            const { saveNutritionPlan } = await import('./actions')
            const result = await saveNutritionPlan(clientId, coachId, {}, formData)

            if (result.error) {
                setError(result.error)
            }
        })
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-10">
            {error && (
                <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-md">
                    {error}
                </div>
            )}

            {/* Basic Info */}
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="name">Nombre del Plan</Label>
                    <Input 
                        id="name" 
                        value={name} 
                        onChange={e => setName(e.target.value)} 
                        required 
                        placeholder="Ej. Definición Extrema Verano"
                    />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="calories">Kcal Diarias</Label>
                        <Input id="calories" type="number" value={calories} onChange={e => setCalories(e.target.value)} placeholder="0" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="protein">Prot (g)</Label>
                        <Input id="protein" type="number" value={protein} onChange={e => setProtein(e.target.value)} placeholder="0" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="carbs">Carbs (g)</Label>
                        <Input id="carbs" type="number" value={carbs} onChange={e => setCarbs(e.target.value)} placeholder="0" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="fats">Grasas (g)</Label>
                        <Input id="fats" type="number" value={fats} onChange={e => setFats(e.target.value)} placeholder="0" />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="instructions">Notas o Indicaciones Generales</Label>
                    <textarea 
                        id="instructions"
                        rows={2}
                        value={instructions}
                        onChange={e => setInstructions(e.target.value)}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder="Ej. Tomar 3 litros de agua diarios, no omitir el post-entreno."
                    />
                </div>
            </div>

            {/* Meals */}
            <div>
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
                    <h3 className="text-base font-bold flex items-center gap-2">
                        <CalendarHeart className="w-4 h-4 text-emerald-500" />
                        Comidas del Día (Opcional)
                    </h3>
                    <Button type="button" variant="outline" size="sm" onClick={handleAddMeal} className="h-8 gap-1 rounded-lg">
                        <Plus className="w-3.5 h-3.5" /> Agregar
                    </Button>
                </div>

                {meals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No has añadido comidas específicas. Solo macros.</p>
                ) : (
                    <div className="space-y-4">
                        {meals.map((meal, index) => (
                            <div key={meal.id} className="relative p-4 rounded-xl border border-border bg-muted/30 group">
                                <button 
                                    type="button" 
                                    onClick={() => handleRemoveMeal(meal.id)}
                                    className="absolute -top-3 -right-3 w-7 h-7 bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border border-red-200 dark:border-red-500/20"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>

                                <div className="space-y-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-muted-foreground">Comida {index + 1}</Label>
                                        <Input 
                                            value={meal.name} 
                                            onChange={e => handleMealChange(meal.id, 'name', e.target.value)} 
                                            className="h-8 shadow-none" 
                                            placeholder="Ej. Desayuno, Pre-entreno..."
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs text-muted-foreground">Alimentos</Label>
                                            <Button type="button" variant="ghost" size="sm" onClick={() => handleSaveMeal(meal)} className="h-8 gap-1 rounded-lg">
                                                <Bookmark className="w-3.5 h-3.5" />
                                                Guardar Comida
                                            </Button>
                                        </div>
                                        <div className="space-y-2">
                                            {meal.food_items.map((foodItem, foodIndex) => (
                                                <div key={foodIndex} className="flex items-center gap-2">
                                                    <Input value={foodItem.name} disabled className="h-8 shadow-none" />
                                                    <Input type="number" value={foodItem.quantity} onChange={(e) => {
                                                        const newFoodItems = [...meal.food_items]
                                                        newFoodItems[foodIndex].quantity = Number(e.target.value)
                                                        handleMealChange(meal.id, 'food_items', newFoodItems)
                                                    }} className="h-8 shadow-none w-24" />
                                                    <Button type="button" variant="ghost" size="icon" onClick={() => {
                                                        const newFoodItems = meal.food_items.filter((_, i) => i !== foodIndex)
                                                        handleMealChange(meal.id, 'food_items', newFoodItems)
                                                    }}>
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                        <FoodSearchModal onFoodSelected={(food, quantity) => {
                                            const newFoodItem: FoodItemInput = {
                                                food_id: food.id,
                                                name: food.name,
                                                quantity: quantity,
                                                calories: food.calories,
                                                protein_g: food.protein_g,
                                                carbs_g: food.carbs_g,
                                                fats_g: food.fats_g,
                                            };
                                            const newFoodItems = [...meal.food_items, newFoodItem];
                                            handleMealChange(meal.id, 'food_items', newFoodItems);
                                        }} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <Button type="submit" className="w-full text-sm sm:text-base font-bold shadow-xl h-auto py-3 whitespace-normal" disabled={isPending}>
                {isPending ? 'Guardando Plan...' : 'Asignar Plan Nutricional al Alumno'}
            </Button>
        </form>
    )
}
