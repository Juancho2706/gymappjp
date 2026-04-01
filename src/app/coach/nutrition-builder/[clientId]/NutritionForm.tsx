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
    unit: string;
    serving_size_g: number;
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
    initialData?: any
}

export function NutritionForm({ clientId, coachId, initialData }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState('')

    // Macros & Config
    const [name, setName] = useState(initialData?.name || 'Plan Nutricional')
    const [targetCalories, setTargetCalories] = useState(initialData?.daily_calories?.toString() || '')
    const [targetProtein, setTargetProtein] = useState(initialData?.protein_g?.toString() || '')
    const [targetCarbs, setTargetCarbs] = useState(initialData?.carbs_g?.toString() || '')
    const [targetFats, setTargetFats] = useState(initialData?.fats_g?.toString() || '')
    const [instructions, setInstructions] = useState(initialData?.instructions || '')

    const [meals, setMeals] = useState<MealInput[]>(
        initialData?.nutrition_meals?.map((m: any) => ({
            id: m.id,
            name: m.name,
            food_items: m.food_items?.map((fi: any) => ({
                food_id: fi.food_id,
                name: fi.foods?.name,
                quantity: fi.quantity,
                unit: fi.unit,
                serving_size_g: fi.foods?.serving_size_g,
                calories: fi.foods?.calories,
                protein_g: fi.foods?.protein_g,
                carbs_g: fi.foods?.carbs_g,
                fats_g: fi.foods?.fats_g,
            })) || []
        })) || [
            { id: Date.now(), name: 'Desayuno', food_items: [] }
        ]
    )

    const calculateItemMacros = (item: FoodItemInput) => {
        const factor = item.unit === 'u' ? item.quantity : item.quantity / (item.serving_size_g || 100);
        return {
            calories: Math.round(item.calories * factor),
            protein: Math.round(item.protein_g * factor * 10) / 10,
            carbs: Math.round(item.carbs_g * factor * 10) / 10,
            fats: Math.round(item.fats_g * factor * 10) / 10,
        };
    };

    const calculateMealMacros = (meal: MealInput) => {
        return meal.food_items.reduce((acc, item) => {
            const macros = calculateItemMacros(item);
            return {
                calories: acc.calories + macros.calories,
                protein: acc.protein + macros.protein,
                carbs: acc.carbs + macros.carbs,
                fats: acc.fats + macros.fats,
            };
        }, { calories: 0, protein: 0, carbs: 0, fats: 0 });
    };

    const totalMacros = meals.reduce((acc, meal) => {
        const macros = calculateMealMacros(meal);
        return {
            calories: acc.calories + macros.calories,
            protein: acc.protein + macros.protein,
            carbs: acc.carbs + macros.carbs,
            fats: acc.fats + macros.fats,
        };
    }, { calories: 0, protein: 0, carbs: 0, fats: 0 });

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
                quantity: item.quantity,
                unit: item.unit
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
            if (initialData?.id) {
                formData.append('plan_id', initialData.id)
            }
            formData.append('name', name)
            formData.append('daily_calories', targetCalories)
            formData.append('protein_g', targetProtein)
            formData.append('carbs_g', targetCarbs)
            formData.append('fats_g', targetFats)
            formData.append('instructions', instructions)

            meals.forEach((meal, i) => {
                formData.append(`meal_name_${i}`, meal.name)
                meal.food_items.forEach((foodItem, j) => {
                    formData.append(`meal_${i}_food_id_${j}`, foodItem.food_id)
                    formData.append(`meal_${i}_quantity_${j}`, foodItem.quantity.toString())
                    formData.append(`meal_${i}_unit_${j}`, foodItem.unit)
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
                        <Input id="calories" type="number" value={targetCalories} onChange={e => setTargetCalories(e.target.value)} placeholder="0" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="protein">Prot (g)</Label>
                        <Input id="protein" type="number" value={targetProtein} onChange={e => setTargetProtein(e.target.value)} placeholder="0" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="carbs">Carbs (g)</Label>
                        <Input id="carbs" type="number" value={targetCarbs} onChange={e => setTargetCarbs(e.target.value)} placeholder="0" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="fats">Grasas (g)</Label>
                        <Input id="fats" type="number" value={targetFats} onChange={e => setTargetFats(e.target.value)} placeholder="0" />
                    </div>
                </div>

                {/* Real-time Daily Totals vs Targets */}
                <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 grid grid-cols-4 gap-4">
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Total Kcal</span>
                        <span className={`text-lg font-black ${totalMacros.calories > Number(targetCalories) && targetCalories ? 'text-red-500' : 'text-emerald-600'}`}>
                            {totalMacros.calories} <span className="text-xs font-normal text-muted-foreground">/ {targetCalories || 0}</span>
                        </span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Proteína</span>
                        <span className="text-lg font-black text-emerald-600">
                            {totalMacros.protein}g <span className="text-xs font-normal text-muted-foreground">/ {targetProtein || 0}g</span>
                        </span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Carbs</span>
                        <span className="text-lg font-black text-emerald-600">
                            {totalMacros.carbs}g <span className="text-xs font-normal text-muted-foreground">/ {targetCarbs || 0}g</span>
                        </span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Grasas</span>
                        <span className="text-lg font-black text-emerald-600">
                            {totalMacros.fats}g <span className="text-xs font-normal text-muted-foreground">/ {targetFats || 0}g</span>
                        </span>
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
                                {meals.map((meal, index) => {
                                    const mealMacros = calculateMealMacros(meal);
                                    return (
                                        <div key={meal.id} className="relative p-4 rounded-xl border border-border bg-muted/30 group">
                                            <button 
                                                type="button" 
                                                onClick={() => handleRemoveMeal(meal.id)}
                                                className="absolute -top-3 -right-3 w-7 h-7 bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border border-red-200 dark:border-red-500/20"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>

                                            <div className="space-y-3">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                    <div className="flex-1 space-y-1.5">
                                                        <Label className="text-xs text-muted-foreground uppercase tracking-tight font-semibold">Comida {index + 1}</Label>
                                                        <Input 
                                                            value={meal.name} 
                                                            onChange={e => handleMealChange(meal.id, 'name', e.target.value)} 
                                                            className="h-9 bg-background border-border/50 font-bold" 
                                                            placeholder="Ej. Desayuno, Pre-entreno..."
                                                            required
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-4 bg-background/50 p-2 rounded-lg border border-border/50">
                                                        <div className="text-center px-2">
                                                            <div className="text-[10px] text-muted-foreground uppercase font-bold">Kcal</div>
                                                            <div className="text-sm font-black">{mealMacros.calories}</div>
                                                        </div>
                                                        <div className="text-center px-2 border-l border-border/30">
                                                            <div className="text-[10px] text-muted-foreground uppercase font-bold">P</div>
                                                            <div className="text-sm font-black">{mealMacros.protein}g</div>
                                                        </div>
                                                        <div className="text-center px-2 border-l border-border/30">
                                                            <div className="text-[10px] text-muted-foreground uppercase font-bold">C</div>
                                                            <div className="text-sm font-black">{mealMacros.carbs}g</div>
                                                        </div>
                                                        <div className="text-center px-2 border-l border-border/30">
                                                            <div className="text-[10px] text-muted-foreground uppercase font-bold">G</div>
                                                            <div className="text-sm font-black">{mealMacros.fats}g</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <Label className="text-xs text-muted-foreground font-semibold">Alimentos e Ingredientes</Label>
                                                        <Button type="button" variant="ghost" size="sm" onClick={() => handleSaveMeal(meal)} className="h-7 text-[10px] uppercase tracking-wide gap-1 rounded-lg hover:bg-emerald-500/10 hover:text-emerald-600">
                                                            <Bookmark className="w-3 h-3" />
                                                            Guardar como Plantilla
                                                        </Button>
                                                    </div>
                                                    <div className="space-y-2">
                                                        {meal.food_items.map((foodItem, foodIndex) => {
                                                            const itemMacros = calculateItemMacros(foodItem);
                                                            return (
                                                                <div key={foodIndex} className="flex flex-col gap-2 p-2 rounded-lg bg-background/40 border border-border/40">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="flex-1 text-sm font-medium line-clamp-1">{foodItem.name}</span>
                                                                        <div className="relative w-24">
                                                                            <Input type="number" value={foodItem.quantity} onChange={(e) => {
                                                                                const newFoodItems = [...meal.food_items]
                                                                                newFoodItems[foodIndex].quantity = Number(e.target.value)
                                                                                handleMealChange(meal.id, 'food_items', newFoodItems)
                                                                            }} className="h-7 text-xs shadow-none pr-8 font-bold" title="Cantidad/Porción" />
                                                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-bold">{foodItem.unit || 'g/u'}</span>
                                                                        </div>
                                                                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-500 hover:bg-red-500/10" onClick={() => {
                                                                            const newFoodItems = meal.food_items.filter((_, i) => i !== foodIndex)
                                                                            handleMealChange(meal.id, 'food_items', newFoodItems)
                                                                        }}>
                                                                            <Trash2 className="w-3.5 h-3.5" />
                                                                        </Button>
                                                                    </div>
                                                                    <div className="flex items-center gap-4 px-1">
                                                                        <span className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground/70">{itemMacros.calories}</span> kcal</span>
                                                                        <span className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground/70">{itemMacros.protein}g</span> prot</span>
                                                                        <span className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground/70">{itemMacros.carbs}g</span> carbs</span>
                                                                        <span className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground/70">{itemMacros.fats}g</span> grasas</span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    <FoodSearchModal onFoodSelected={(food, quantity, unit) => {
                                                        const newFoodItem: FoodItemInput = {
                                                            food_id: food.id,
                                                            name: food.name,
                                                            quantity: quantity,
                                                            unit: unit || 'g',
                                                            serving_size_g: food.serving_size_g,
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
                                    );
                                })}
                    </div>
                )}
            </div>

            <Button type="submit" className="w-full text-sm sm:text-base font-bold shadow-xl h-auto py-3 whitespace-normal" disabled={isPending}>
                {isPending 
                    ? (initialData?.id ? 'Guardando Cambios...' : 'Guardando Plan...') 
                    : (initialData?.id ? 'Guardar Cambios en el Plan' : 'Asignar Plan Nutricional al Alumno')}
            </Button>
        </form>
    )
}
