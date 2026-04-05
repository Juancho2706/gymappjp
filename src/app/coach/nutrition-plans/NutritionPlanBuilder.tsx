'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, CalendarHeart, Search, Bookmark, Target, Flame, Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FoodSearchModal } from '../nutrition-builder/[clientId]/FoodSearchModal'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { triggerSuccessAnimation } from '@/components/SuccessAnimationProvider'
import { saveNutritionTemplate } from './actions'

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
    id: number | string
    name: string
    food_items: FoodItemInput[]
}

interface Client {
    id: string
    full_name: string
    active_plan?: any
}

interface Props {
    coachId: string
    availableClients: Client[]
    initialData?: any
    onCancel?: () => void
}

export function NutritionPlanBuilder({ coachId, availableClients, initialData, onCancel }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState('')

    const [name, setName] = useState(initialData?.name || '')
    const [targetCalories, setTargetCalories] = useState(initialData?.daily_calories?.toString() || '')
    const [targetProtein, setTargetProtein] = useState(initialData?.protein_g?.toString() || '')
    const [targetCarbs, setTargetCarbs] = useState(initialData?.carbs_g?.toString() || '')
    const [targetFats, setTargetFats] = useState(initialData?.fats_g?.toString() || '')
    const [instructions, setInstructions] = useState(initialData?.instructions || '')

    const [selectedClients, setSelectedClients] = useState<string[]>(
        initialData?.assigned_clients?.map((c: any) => c.id) || []
    )
    const [searchTerm, setSearchTerm] = useState('')
    const [openPopover, setOpenPopover] = useState(false)

    const [meals, setMeals] = useState<MealInput[]>(
        initialData?.template_meals?.map((m: any) => ({
            id: m.id,
            name: m.name,
            food_items: m.template_meal_groups?.flatMap((tg: any) => {
                const group = Array.isArray(tg.saved_meals) ? tg.saved_meals[0] : tg.saved_meals;
                return group?.saved_meal_items?.map((fi: any) => ({
                    food_id: fi.food_id,
                    name: fi.food?.name,
                    quantity: fi.quantity,
                    unit: fi.unit,
                    serving_size: fi.food?.serving_size,
                    serving_unit: fi.food?.serving_unit,
                    calories: fi.food?.calories,
                    protein_g: fi.food?.protein_g,
                    carbs_g: fi.food?.carbs_g,
                    fats_g: fi.food?.fats_g,
                })) || []
            }) || []
        })) || [
            { id: Date.now(), name: 'Desayuno', food_items: [] }
        ]
    )

    const calculateItemMacros = (item: FoodItemInput) => {
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

    const totalMacros = useMemo(() => {
        return meals.reduce((acc, meal) => {
            const macros = calculateMealMacros(meal);
            return {
                calories: acc.calories + macros.calories,
                protein: acc.protein + macros.protein,
                carbs: acc.carbs + macros.carbs,
                fats: acc.fats + macros.fats,
            };
        }, { calories: 0, protein: 0, carbs: 0, fats: 0 });
    }, [meals]);

    useEffect(() => {
        if (totalMacros.calories > 0) {
            setTargetCalories(Math.round(totalMacros.calories).toString())
            setTargetProtein(Math.round(totalMacros.protein).toString())
            setTargetCarbs(Math.round(totalMacros.carbs).toString())
            setTargetFats(Math.round(totalMacros.fats).toString())
        }
    }, [totalMacros]);

    const handleAddMeal = () => {
        setMeals([...meals, { id: Date.now(), name: '', food_items: [] }])
    }

    const handleRemoveMeal = (id: number | string) => {
        setMeals(meals.filter(m => m.id !== id))
    }

    const handleMealChange = (id: number | string, field: keyof MealInput, value: any) => {
        setMeals(meals.map(m => m.id === id ? { ...m, [field]: value } : m))
    }

    const filteredClients = useMemo(() => {
        return availableClients.filter(client => 
            client.full_name.toLowerCase().includes(searchTerm.toLowerCase())
        )
    }, [availableClients, searchTerm])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        startTransition(async () => {
            try {
                const formData = new FormData()
                if (initialData?.id) {
                    formData.append('template_id', initialData.id)
                }
                formData.append('name', name)
                formData.append('daily_calories', targetCalories)
                formData.append('protein_g', targetProtein)
                formData.append('carbs_g', targetCarbs)
                formData.append('fats_g', targetFats)
                formData.append('instructions', instructions)
                formData.append('selected_clients', JSON.stringify(selectedClients))

                meals.forEach((meal, i) => {
                    formData.append(`meal_name_${i}`, meal.name)
                    meal.food_items.forEach((item, j) => {
                        formData.append(`meal_${i}_food_${j}`, JSON.stringify({
                            food_id: item.food_id,
                            quantity: item.quantity,
                            unit: item.unit
                        }))
                    })
                })

                const result = await saveNutritionTemplate(coachId, {}, formData)

                if (result?.error) {
                    setError(result.error)
                } else {
                    triggerSuccessAnimation(() => {
                        if (onCancel) onCancel()
                        else router.push('/coach/nutrition-plans')
                    })
                }
            } catch (err: any) {
                setError(err.message || 'Error al guardar')
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-1 space-y-8">
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-muted-foreground px-1">Designación de Plantilla</Label>
                            <Input 
                                value={name} 
                                onChange={e => setName(e.target.value)} 
                                required 
                                placeholder="EJ. PROTOCOLO HIPERTROFIA"
                                className="h-12 bg-white dark:bg-secondary/30 border-slate-200 dark:border-white/10 font-bold uppercase tracking-widest text-slate-900 dark:text-foreground shadow-sm"
                            />
                        </div>

                        <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-muted-foreground px-1">Asignar a Alumnos</Label>
                            <Popover open={openPopover} onOpenChange={setOpenPopover}>
                                <PopoverTrigger>
                                    <Button type="button" variant="outline" className="w-full h-12 justify-between bg-white dark:bg-secondary/30 border-slate-200 dark:border-white/10 font-bold text-slate-900 dark:text-foreground shadow-sm">
                                        <span className="truncate">
                                            {selectedClients.length > 0 ? `${selectedClients.length} Alumnos` : "Seleccionar..."}
                                        </span>
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[300px] p-0" align="start">
                                    <div className="p-2 border-b border-slate-100 dark:border-white/10">
                                        <div className="flex items-center gap-2 px-2 bg-slate-50 dark:bg-secondary/50 rounded-lg">
                                            <Search className="w-4 h-4 text-slate-400 dark:text-muted-foreground" />
                                            <input 
                                                className="w-full h-9 bg-transparent text-sm outline-none text-slate-900 dark:text-foreground"
                                                placeholder="Buscar..."
                                                value={searchTerm}
                                                onChange={e => setSearchTerm(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className="max-h-[300px] overflow-y-auto p-1">
                                        {filteredClients.map(client => (
                                            <div 
                                                key={client.id}
                                                onClick={() => {
                                                    setSelectedClients(prev => 
                                                        prev.includes(client.id) ? prev.filter(id => id !== client.id) : [...prev, client.id]
                                                    )
                                                }}
                                                className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-secondary cursor-pointer"
                                            >
                                                <div className={cn(
                                                    "w-4 h-4 rounded border border-primary flex items-center justify-center",
                                                    selectedClients.includes(client.id) ? "bg-primary text-primary-foreground" : "border-slate-300 dark:border-white/20 opacity-50"
                                                )}>
                                                    {selectedClients.includes(client.id) && <Check className="w-3 h-3" />}
                                                </div>
                                                <span className="text-sm font-bold text-slate-700 dark:text-foreground">{client.full_name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { id: 'targetCalories', label: 'Kcal', val: targetCalories, set: setTargetCalories, primary: true },
                                { id: 'targetProtein', label: 'Prot', val: targetProtein, set: setTargetProtein },
                                { id: 'targetCarbs', label: 'Carbs', val: targetCarbs, set: setTargetCarbs },
                                { id: 'targetFats', label: 'Fats', val: targetFats, set: setTargetFats },
                            ].map(item => (
                                <div key={item.id} className="space-y-2">
                                    <Label className={cn("text-[9px] font-black uppercase tracking-widest px-1", item.primary ? "text-primary" : "text-slate-400 dark:text-muted-foreground")}>
                                        {item.label}
                                    </Label>
                                    <Input 
                                        type="number" 
                                        value={item.val} 
                                        onChange={e => item.set(e.target.value)} 
                                        className={cn(
                                            "h-10 text-center font-black shadow-sm",
                                            item.primary ? "bg-blue-50/50 dark:bg-primary/10 border-blue-200/50 dark:border-primary/20 text-primary" : "bg-white dark:bg-secondary/30 border-slate-200 dark:border-white/10 text-slate-900 dark:text-foreground"
                                        )} 
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="p-6 rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-black/40 shadow-sm dark:shadow-2xl grid grid-cols-2 gap-6 justify-items-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-slate-50/50 dark:hidden pointer-events-none" />
                        <MacroRing value={totalMacros.calories} target={Number(targetCalories) || 0} label="Kcal" color="#007AFF" unit="" />
                        <MacroRing value={totalMacros.protein} target={Number(targetProtein) || 0} label="Prot" color="#32ADE6" />
                        <MacroRing value={totalMacros.carbs} target={Number(targetCarbs) || 0} label="Carbs" color="#5856D6" />
                        <MacroRing value={totalMacros.fats} target={Number(targetFats) || 0} label="Fats" color="#00C7BE" />
                    </div>
                </div>

                <div className="lg:col-span-2 space-y-8">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-border pb-4">
                        <h3 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2 text-slate-900 dark:text-foreground">
                            <CalendarHeart className="w-5 h-5 text-emerald-500" />
                            Estructura Diaria
                        </h3>
                        <Button type="button" variant="outline" size="sm" onClick={handleAddMeal} className="h-9 gap-2 font-black uppercase text-[10px] tracking-widest rounded-xl border-slate-200 dark:border-border text-slate-600 dark:text-foreground hover:bg-slate-50 dark:hover:bg-secondary">
                            <Plus className="w-4 h-4" /> Agregar Comida
                        </Button>
                    </div>

                    <div className="space-y-6">
                        {meals.map((meal, index) => {
                            const mealMacros = calculateMealMacros(meal);
                            return (
                                <div key={meal.id} className="relative p-4 md:p-6 rounded-2xl border border-slate-100 dark:border-border bg-slate-50/50 dark:bg-secondary/10 group animate-in slide-in-from-bottom-2">
                                    <button 
                                        type="button" 
                                        onClick={() => handleRemoveMeal(meal.id)}
                                        className="absolute -top-3 -right-3 w-8 h-8 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg md:opacity-0 md:group-hover:opacity-100 transition-all z-10"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>

                                    <div className="space-y-6">
                                        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                                            <div className="flex-1 space-y-2">
                                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-muted-foreground">Comida {index + 1}</Label>
                                                <Input 
                                                    value={meal.name} 
                                                    onChange={e => handleMealChange(meal.id, 'name', e.target.value)} 
                                                    className="h-12 bg-white dark:bg-background border-slate-200 dark:border-border/50 font-black text-lg text-slate-900 dark:text-foreground shadow-sm" 
                                                    placeholder="Ej. Comida Post-Entreno"
                                                    required
                                                />
                                            </div>
                                            <div className="flex items-center gap-4 bg-white dark:bg-background/50 p-3 rounded-xl border border-slate-100 dark:border-border/50 shrink-0 shadow-sm">
                                                {[
                                                    { label: 'Kcal', val: Math.round(mealMacros.calories), unit: '' },
                                                    { label: 'P', val: Math.round(mealMacros.protein), unit: 'g' },
                                                    { label: 'C', val: Math.round(mealMacros.carbs), unit: 'g' },
                                                    { label: 'G', val: Math.round(mealMacros.fats), unit: 'g' },
                                                ].map((m, idx) => (
                                                    <div key={idx} className={cn("text-center px-2", idx > 0 && "border-l border-slate-100 dark:border-border/30")}>
                                                        <div className="text-[9px] text-slate-400 dark:text-muted-foreground uppercase font-black">{m.label}</div>
                                                        <div className="text-sm font-black text-slate-900 dark:text-foreground">{m.val}{m.unit}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="space-y-3">
                                                {meal.food_items.map((foodItem, foodIndex) => {
                                                    const itemMacros = calculateItemMacros(foodItem);
                                                    return (
                                                        <div key={foodIndex} className="flex flex-col gap-3 p-4 rounded-xl bg-white dark:bg-background border border-slate-100 dark:border-border/50 group/item relative shadow-sm">
                                                            <div className="flex items-center gap-4">
                                                                <span className="flex-1 text-sm font-black uppercase tracking-tight truncate text-slate-700 dark:text-foreground">{foodItem.name}</span>
                                                                <div className="relative w-24 shrink-0">
                                                                    <Input type="number" step="any" value={foodItem.quantity} onChange={(e) => {
                                                                        const newFoodItems = [...meal.food_items]
                                                                        newFoodItems[foodIndex].quantity = Number(e.target.value)
                                                                        handleMealChange(meal.id, 'food_items', newFoodItems)
                                                                    }} className="h-9 text-xs font-black text-center pr-8 bg-slate-50 dark:bg-background border-slate-100 dark:border-border text-slate-900 dark:text-foreground" />
                                                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 dark:text-muted-foreground uppercase">{foodItem.unit}</span>
                                                                </div>
                                                                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-rose-400 hover:text-rose-500 hover:bg-rose-500/10 shrink-0 rounded-lg" onClick={() => {
                                                                    const newFoodItems = meal.food_items.filter((_, i) => i !== foodIndex)
                                                                    handleMealChange(meal.id, 'food_items', newFoodItems)
                                                                }}>
                                                                    <Trash2 className="w-4 h-4" />
                                                                </Button>
                                                            </div>
                                                            <div className="flex flex-wrap items-center gap-4 px-1 border-t border-slate-50 dark:border-border/30 pt-2">
                                                                {[
                                                                    { val: Math.round(itemMacros.calories), label: 'Kcal' },
                                                                    { val: itemMacros.protein, label: 'P', unit: 'g' },
                                                                    { val: itemMacros.carbs, label: 'C', unit: 'g' },
                                                                    { val: itemMacros.fats, label: 'G', unit: 'g' },
                                                                ].map((mac, idx) => (
                                                                    <span key={idx} className="text-[10px] font-bold text-slate-400 dark:text-muted-foreground uppercase tracking-widest">
                                                                        {mac.label}: <span className="text-slate-700 dark:text-foreground">{mac.val}{mac.unit}</span>
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

                    <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-muted-foreground px-1">Instrucciones Especiales</Label>
                        <textarea 
                            rows={4}
                            value={instructions}
                            onChange={e => setInstructions(e.target.value)}
                            className="w-full p-6 rounded-2xl bg-white dark:bg-secondary/30 border border-slate-200 dark:border-white/10 text-sm font-bold text-slate-900 dark:text-foreground focus:border-primary transition-all resize-none placeholder:text-slate-300 dark:placeholder:text-muted-foreground/50 shadow-sm"
                            placeholder="Ej. Tomar 5g de Creatina después de la comida 3..."
                        />
                    </div>
                </div>
            </div>

            <div className="flex justify-center pt-10 pb-20">
                <Button 
                    type="submit" 
                    className="w-full md:w-auto md:min-w-[400px] h-14 md:h-16 text-xs md:text-sm font-black uppercase tracking-[0.2em] md:tracking-[0.3em] shadow-2xl rounded-xl md:rounded-2xl border-t border-white/10" 
                    disabled={isPending}
                >
                    {isPending ? 'Procesando Protocolo...' : (initialData?.id ? 'Actualizar Plantilla Maestra' : 'Guardar y Desplegar Plantilla')}
                </Button>
            </div>
        </form>
    )
}
