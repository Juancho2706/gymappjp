'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, CalendarHeart, Search, Bookmark, Target, Flame } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FoodSearchModal } from './FoodSearchModal'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// Ring Chart Helper
function MacroRing({ 
    value, 
    target, 
    label, 
    color, 
    unit = 'g' 
}: { 
    value: number, 
    target: number, 
    label: string, 
    color: string,
    unit?: string 
}) {
    const percentage = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
    const isOver = value > target && target > 0;
    
    // SVG values
    const size = 100;
    const strokeWidth = 6;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    return (
        <div className="flex flex-col items-center justify-center relative group">
            <div className="relative" style={{ width: size, height: size }}>
                {/* Background Ring */}
                <svg className="absolute top-0 left-0 w-full h-full -rotate-90">
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        stroke="currentColor"
                        strokeWidth={strokeWidth}
                        fill="none"
                        className="text-slate-100 dark:text-white/5"
                    />
                    {/* Progress Ring */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        stroke={isOver ? '#EF4444' : color}
                        strokeWidth={strokeWidth}
                        strokeDasharray={circumference}
                        strokeDashoffset={mounted ? strokeDashoffset : circumference}
                        strokeLinecap="round"
                        fill="none"
                        className="transition-all duration-1000 ease-out"
                    />
                </svg>
                {/* Center Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-muted-foreground mb-0.5">{label}</span>
                    <span className={cn("text-lg font-black tracking-tighter", isOver ? "text-red-500" : "text-slate-900 dark:text-foreground")}>
                        {Math.round(value)}
                    </span>
                    <span className="text-[8px] font-bold text-slate-400 dark:text-muted-foreground uppercase tracking-widest">
                        / {target || 0}{unit}
                    </span>
                </div>
            </div>
        </div>
    )
}

interface FoodItemInput {
    food_id: string;
    name: string;
    quantity: number;
    unit: string;
    serving_size: number;
    serving_unit: string;
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
                serving_size: fi.foods?.serving_size,
                serving_unit: fi.foods?.serving_unit,
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
        // Si el alimento está medido en unidades o gramos
        // El unit de la BD es el que manda, pero la cantidad ingresada puede ser cualquier número (ej. 0.5 unidades)
        // Calculamos el factor: si el alimento en DB es 'u', y se sirve 1u con X calorias. Si pido 2, el factor es 2 / 1 = 2
        const factor = item.quantity / (item.serving_size || 100);
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
        <form onSubmit={handleSubmit} className="space-y-12 pb-24">
            {error && (
                <div className="p-4 text-sm font-bold text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
                    <Flame className="w-5 h-5" />
                    {error}
                </div>
            )}

            {/* Basic Info */}
            <div className="space-y-6">
                <div className="space-y-3">
                    <Label htmlFor="name" className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-muted-foreground px-1">Designación del Plan</Label>
                    <Input 
                        id="name" 
                        value={name} 
                        onChange={e => setName(e.target.value)} 
                        required 
                        placeholder="EJ. PROTOCOLO 1"
                        className="h-12 bg-white dark:bg-black/50 border-slate-200 dark:border-white/10 text-slate-900 dark:text-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all font-bold text-sm uppercase tracking-widest placeholder:text-slate-300 dark:placeholder:text-muted-foreground shadow-sm"
                    />
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                    {[
                        { id: 'calories', label: 'Target Kcal', val: targetCalories, set: setTargetCalories, primary: true },
                        { id: 'protein', label: 'Prot (g)', val: targetProtein, set: setTargetProtein },
                        { id: 'carbs', label: 'Carbs (g)', val: targetCarbs, set: setTargetCarbs },
                        { id: 'fats', label: 'Grasas (g)', val: targetFats, set: setTargetFats },
                    ].map(item => (
                        <div key={item.id} className="space-y-3">
                            <Label htmlFor={item.id} className={cn("text-[10px] font-black uppercase tracking-[0.2em] px-1", item.primary ? "text-primary" : "text-slate-400 dark:text-muted-foreground")}>
                                {item.label}
                            </Label>
                            <Input 
                                id={item.id} 
                                type="number" 
                                value={item.val} 
                                onChange={e => item.set(e.target.value)} 
                                placeholder="0" 
                                className={cn(
                                    "h-12 font-black text-center text-lg focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all shadow-sm",
                                    item.primary ? "bg-blue-50/50 dark:bg-primary/5 border-blue-200/50 dark:border-primary/20 text-primary" : "bg-white dark:bg-black/50 border-slate-200 dark:border-white/10 text-slate-900 dark:text-foreground"
                                )} 
                            />
                        </div>
                    ))}
                </div>

                {/* Real-time Daily Totals vs Targets using Ring Charts */}
                <div className="p-4 md:p-8 rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-black/40 backdrop-blur-xl shadow-sm dark:shadow-2xl grid grid-cols-2 sm:flex sm:flex-wrap justify-items-center sm:justify-around items-center gap-6 md:gap-8 relative overflow-hidden">
                    <div className="absolute inset-0 bg-slate-50/50 dark:hidden pointer-events-none" />
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,122,255,0.05)_0%,rgba(0,0,0,0)_70%)] pointer-events-none" />
                    
                    <MacroRing value={totalMacros.calories} target={Number(targetCalories) || 0} label="Kcal" color="#007AFF" unit="" />
                    <MacroRing value={totalMacros.protein} target={Number(targetProtein) || 0} label="Prot" color="#32ADE6" />
                    <MacroRing value={totalMacros.carbs} target={Number(targetCarbs) || 0} label="Carbs" color="#5856D6" />
                    <MacroRing value={totalMacros.fats} target={Number(targetFats) || 0} label="Fats" color="#00C7BE" />
                </div>

                <div className="space-y-3">
                    <Label htmlFor="instructions" className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-muted-foreground px-1">Notas del Protocolo</Label>
                    <textarea 
                        id="instructions"
                        rows={3}
                        value={instructions}
                        onChange={e => setInstructions(e.target.value)}
                        className="w-full p-4 rounded-xl bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-foreground text-sm font-medium focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all shadow-sm resize-none placeholder:text-slate-300 dark:placeholder:text-muted-foreground"
                        placeholder="Instrucciones biométricas o directrices..."
                    />
                </div>
            </div>

            {/* Meals */}
            <div>
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-border">
                    <h3 className="text-base font-black uppercase tracking-tighter flex items-center gap-2 text-slate-900 dark:text-foreground">
                        <CalendarHeart className="w-4 h-4 text-emerald-500" />
                        Comidas del Día (Opcional)
                    </h3>
                    <Button type="button" variant="outline" size="sm" onClick={handleAddMeal} className="h-8 gap-1 rounded-lg border-slate-200 dark:border-border text-slate-600 dark:text-foreground hover:bg-slate-50 dark:hover:bg-secondary">
                        <Plus className="w-3.5 h-3.5" /> Agregar
                    </Button>
                </div>

                {meals.length === 0 ? (
                    <p className="text-sm text-slate-400 dark:text-muted-foreground">No has añadido comidas específicas. Solo macros.</p>
                ) : (
                    <div className="space-y-4">
                                {meals.map((meal, index) => {
                                    const mealMacros = calculateMealMacros(meal);
                                    return (
                                        <div key={meal.id} className="relative p-3 md:p-4 rounded-xl border border-slate-100 dark:border-border bg-slate-50/50 dark:bg-muted/30 group">
                                            <button 
                                                type="button" 
                                                onClick={() => handleRemoveMeal(meal.id)}
                                                className="absolute -top-3 -right-3 w-7 h-7 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-md md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>

                                            <div className="space-y-4">
                                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                                    <div className="flex-1 space-y-1.5">
                                                        <Label className="text-[10px] text-slate-400 dark:text-muted-foreground uppercase tracking-tight font-black">Comida {index + 1}</Label>
                                                        <Input 
                                                            value={meal.name} 
                                                            onChange={e => handleMealChange(meal.id, 'name', e.target.value)} 
                                                            className="h-10 bg-white dark:bg-background border-slate-200 dark:border-border/50 font-bold text-sm text-slate-900 dark:text-foreground shadow-sm" 
                                                            placeholder="Ej. Desayuno, Pre-entreno..."
                                                            required
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between sm:justify-start gap-2 md:gap-4 bg-white dark:bg-background/50 p-2 rounded-lg border border-slate-100 dark:border-border/50 shadow-sm">
                                                        {[
                                                            { label: 'Kcal', val: mealMacros.calories, unit: '' },
                                                            { label: 'P', val: mealMacros.protein, unit: 'g' },
                                                            { label: 'C', val: mealMacros.carbs, unit: 'g' },
                                                            { label: 'G', val: mealMacros.fats, unit: 'g' },
                                                        ].map((m, idx) => (
                                                            <div key={idx} className={cn("text-center px-1 md:px-2 min-w-[40px] md:min-w-[50px]", idx > 0 && "border-l border-slate-50 dark:border-border/30")}>
                                                                <div className="text-[9px] text-slate-400 dark:text-muted-foreground uppercase font-black">{m.label}</div>
                                                                <div className="text-xs md:text-sm font-black text-slate-900 dark:text-foreground">{m.val}{m.unit}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <Label className="text-[10px] text-slate-400 dark:text-muted-foreground font-black uppercase tracking-widest">Alimentos e Ingredientes</Label>
                                                        <Button type="button" variant="ghost" size="sm" onClick={() => handleSaveMeal(meal)} className="h-7 text-[9px] uppercase tracking-wide gap-1 rounded-lg hover:bg-emerald-500/10 hover:text-emerald-600 text-slate-500 dark:text-muted-foreground">
                                                            <Bookmark className="w-3 h-3" />
                                                            <span className="hidden sm:inline">Guardar como Plantilla</span>
                                                            <span className="sm:hidden">Guardar</span>
                                                        </Button>
                                                    </div>
                                                    <div className="space-y-2">
                                                        {meal.food_items.map((foodItem, foodIndex) => {
                                                            const itemMacros = calculateItemMacros(foodItem);
                                                            return (
                                                                <div key={foodIndex} className="flex flex-col gap-2 p-3 rounded-lg bg-white dark:bg-background/40 border border-slate-100 dark:border-border/40 shadow-sm relative group/item">
                                                                    <div className="flex items-center gap-3">
                                                                        <span className="flex-1 text-xs md:text-sm font-bold line-clamp-1 text-slate-700 dark:text-foreground uppercase">{foodItem.name}</span>
                                                                        <div className="relative w-20 md:w-24 shrink-0">
                                                                            <Input type="number" step="any" value={foodItem.quantity} onChange={(e) => {
                                                                                const newFoodItems = [...meal.food_items]
                                                                                newFoodItems[foodIndex].quantity = Number(e.target.value)
                                                                                handleMealChange(meal.id, 'food_items', newFoodItems)
                                                                            }} className="h-8 text-xs font-black text-center pr-7 bg-slate-50 dark:bg-background border-slate-100 dark:border-border text-slate-900 dark:text-foreground shadow-none" title="Cantidad/Porción" />
                                                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 dark:text-muted-foreground font-black uppercase">{foodItem.unit}</span>
                                                                        </div>
                                                                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-rose-400 hover:text-rose-500 hover:bg-rose-500/10 shrink-0 rounded-lg" onClick={() => {
                                                                            const newFoodItems = meal.food_items.filter((_, i) => i !== foodIndex)
                                                                            handleMealChange(meal.id, 'food_items', newFoodItems)
                                                                        }}>
                                                                            <Trash2 className="w-3.5 h-3.5" />
                                                                        </Button>
                                                                    </div>
                                                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 border-t border-slate-50 dark:border-border/30 pt-2">
                                                                        {[
                                                                            { val: Math.round(itemMacros.calories), label: 'Kcal' },
                                                                            { val: itemMacros.protein, label: 'P', unit: 'g' },
                                                                            { val: itemMacros.carbs, label: 'C', unit: 'g' },
                                                                            { val: itemMacros.fats, label: 'G', unit: 'g' },
                                                                        ].map((mac, idx) => (
                                                                            <span key={idx} className="text-[10px] font-bold text-slate-400 dark:text-muted-foreground uppercase tracking-widest">
                                                                                {mac.label}: <span className="text-slate-700 dark:text-foreground font-black">{mac.val}{mac.unit}</span>
                                                                            </span>
                                                                        ))}
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
                                                            unit: unit || food.serving_unit || 'g',
                                                            serving_size: food.serving_size,
                                                            serving_unit: food.serving_unit,
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

            <div className="flex justify-center pt-10 pb-20">
                <Button type="submit" className="w-full md:w-auto md:min-w-[400px] h-14 md:h-16 text-xs md:text-sm font-black uppercase tracking-[0.2em] md:tracking-[0.3em] shadow-2xl rounded-xl md:rounded-2xl border-t border-white/10" disabled={isPending}>
                    {isPending 
                        ? (initialData?.id ? 'Guardando Cambios...' : 'Guardando Plan...') 
                        : (initialData?.id ? 'Guardar Cambios en el Plan' : 'Asignar Plan Nutricional al Alumno')}
                </Button>
            </div>
        </form>
    )
}
