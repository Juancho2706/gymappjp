'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import { Plus, Trash2, CalendarHeart, Search, Bookmark, Target, Flame, Check, ChevronsUpDown, AlertTriangle, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FoodSearchModal } from '../nutrition-builder/[clientId]/FoodSearchModal'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

// --- Helper Components ---

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
    const isUnder = target > 0 && value < (target * 0.95);
    
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
                        stroke={isOver ? '#EF4444' : (isUnder ? '#F59E0B' : color)}
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
                    <span className={cn(
                        "text-lg font-black tracking-tighter", 
                        isOver ? "text-red-500" : (isUnder ? "text-amber-500" : "text-slate-900 dark:text-foreground")
                    )}>
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

// --- Interfaces ---

export interface FoodItemInput {
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

export interface MealInput {
    id: number | string;
    name: string;
    food_items: FoodItemInput[];
}

interface Client {
    id: string;
    full_name: string;
}

interface Props {
    mode: 'template' | 'individual';
    coachId: string;
    clientId?: string;
    availableClients?: Client[];
    initialData?: any;
    onSave: (formData: FormData) => Promise<{ error?: string, success?: boolean }>;
    onCancel?: () => void;
}

export function NutritionMasterEditor({ 
    mode, 
    coachId, 
    clientId, 
    availableClients = [], 
    initialData, 
    onSave,
    onCancel 
}: Props) {
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

    // Meals initialization with flattened food items
    const [meals, setMeals] = useState<MealInput[]>(() => {
        if (initialData?.template_meals) {
            return initialData.template_meals.map((m: any) => ({
                id: m.id,
                name: m.name,
                food_items: m.template_meal_groups?.flatMap((tg: any) => {
                    const group = Array.isArray(tg.saved_meals) ? tg.saved_meals[0] : tg.saved_meals;
                    return group?.saved_meal_items?.map((fi: any) => ({
                        food_id: fi.food_id,
                        name: fi.food?.name || fi.foods?.name,
                        quantity: fi.quantity,
                        unit: fi.unit,
                        serving_size: fi.food?.serving_size || fi.foods?.serving_size,
                        serving_unit: fi.food?.serving_unit || fi.foods?.serving_unit,
                        calories: fi.food?.calories || fi.foods?.calories,
                        protein_g: fi.food?.protein_g || fi.foods?.protein_g,
                        carbs_g: fi.food?.carbs_g || fi.foods?.carbs_g,
                        fats_g: fi.food?.fats_g || fi.foods?.fats_g,
                    })) || []
                }) || []
            }))
        } else if (initialData?.nutrition_meals) {
            return initialData.nutrition_meals.map((m: any) => ({
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
            }))
        }
        return [{ id: Date.now(), name: 'Desayuno', food_items: [] }]
    })

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

    // UI Alerters
    const mismatches = useMemo(() => {
        const check = (current: number, targetStr: string) => {
            const target = Number(targetStr) || 0;
            if (target <= 0) return false;
            return Math.abs(current - target) > (target * 0.05);
        };

        return {
            calories: check(totalMacros.calories, targetCalories),
            protein: check(totalMacros.protein, targetProtein),
            carbs: check(totalMacros.carbs, targetCarbs),
            fats: check(totalMacros.fats, targetFats)
        };
    }, [totalMacros, targetCalories, targetProtein, targetCarbs, targetFats]);

    const hasAnyMismatch = Object.values(mismatches).some(v => v);

    const handleAddMeal = () => {
        setMeals([...meals, { id: Date.now(), name: '', food_items: [] }])
    }

    const handleRemoveMeal = (id: number | string) => {
        setMeals(meals.filter(m => m.id !== id))
    }

    const handleMealChange = (id: number | string, field: keyof MealInput, value: any) => {
        setMeals(meals.map(m => m.id === id ? { ...m, [field]: value } : m))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        startTransition(async () => {
            try {
                const formData = new FormData()
                if (initialData?.id) formData.append('id', initialData.id)
                formData.append('name', name)
                formData.append('daily_calories', targetCalories)
                formData.append('protein_g', targetProtein)
                formData.append('carbs_g', targetCarbs)
                formData.append('fats_g', targetFats)
                formData.append('instructions', instructions)
                
                if (mode === 'template') {
                    formData.append('selected_clients', JSON.stringify(selectedClients))
                }

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

                const result = await onSave(formData)
                if (result?.error) setError(result.error)
            } catch (err: any) {
                setError(err.message || 'Error al guardar')
            }
        })
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-10 pb-24">
            {error && (
                <div className="p-4 text-sm font-bold text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                    <Flame className="w-5 h-5" />
                    {error}
                </div>
            )}

            {hasAnyMismatch && (
                <div className="p-4 text-xs font-bold text-amber-600 dark:text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-xl flex flex-col sm:flex-row sm:items-center gap-3 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span className="uppercase tracking-tight">
                            Atención: Desfase detectado en {Object.entries(mismatches).filter(([_,v]) => v).map(([k]) => k === 'calories' ? 'Kcal' : k).join(', ')}.
                        </span>
                    </div>
                    <div className="flex-1 text-[10px] opacity-80 font-bold uppercase tracking-widest sm:text-center">
                        Sumatoria alimentos: {Math.round(totalMacros.calories)}K | {Math.round(totalMacros.protein)}P | {Math.round(totalMacros.carbs)}C | {Math.round(totalMacros.fats)}G
                    </div>
                    <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => {
                            setTargetCalories(Math.round(totalMacros.calories).toString())
                            setTargetProtein(Math.round(totalMacros.protein).toString())
                            setTargetCarbs(Math.round(totalMacros.carbs).toString())
                            setTargetFats(Math.round(totalMacros.fats).toString())
                        }}
                        className="h-7 text-[10px] uppercase font-black hover:bg-amber-500/20 border border-amber-500/30 text-amber-700 dark:text-amber-500"
                    >
                        Sincronizar Plan
                    </Button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Panel: Configuration */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-blue-100 dark:border-white/5 shadow-sm space-y-6">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Nombre del Protocolo</Label>
                            <Input 
                                value={name} 
                                onChange={e => setName(e.target.value)} 
                                required 
                                className="h-11 bg-blue-50/30 dark:bg-black/20 border-blue-100 dark:border-white/10 font-bold uppercase tracking-widest text-slate-900 dark:text-foreground"
                            />
                        </div>

                        {/* Asignación eliminada de la creación/edición, ahora se hace desde la lista de plantillas */}

                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-blue-50 dark:border-white/5">
                            {[
                                { id: 'targetCalories', label: 'Kcal Plan', val: targetCalories, set: setTargetCalories, color: 'text-primary' },
                                { id: 'targetProtein', label: 'Proteína (g)', val: targetProtein, set: setTargetProtein, color: 'text-rose-500' },
                                { id: 'targetCarbs', label: 'Carbos (g)', val: targetCarbs, set: setTargetCarbs, color: 'text-amber-500' },
                                { id: 'targetFats', label: 'Grasas (g)', val: targetFats, set: setTargetFats, color: 'text-emerald-500' },
                            ].map(item => (
                                <div key={item.id} className="space-y-1.5">
                                    <Label className={cn("text-[9px] font-black uppercase tracking-tighter", item.color)}>{item.label}</Label>
                                    <Input 
                                        type="number" 
                                        min="0"
                                        value={item.val} 
                                        onChange={e => {
                                            const val = Math.max(0, parseInt(e.target.value) || 0);
                                            item.set(val.toString());
                                        }} 
                                        className="h-10 text-center font-black bg-blue-50/30 dark:bg-black/20 border-blue-100 dark:border-white/10 text-slate-900 dark:text-foreground"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="p-8 rounded-2xl bg-white dark:bg-zinc-900 border border-blue-100 dark:border-white/5 shadow-sm flex flex-wrap justify-center gap-6">
                        <MacroRing value={totalMacros.calories} target={Number(targetCalories) || 0} label="Kcal" color="#007AFF" unit="" />
                        <MacroRing value={totalMacros.protein} target={Number(targetProtein) || 0} label="Prot" color="#F43F5E" />
                        <MacroRing value={totalMacros.carbs} target={Number(targetCarbs) || 0} label="Carbs" color="#F59E0B" />
                        <MacroRing value={totalMacros.fats} target={Number(targetFats) || 0} label="Grasas" color="#10B981" />
                    </div>
                </div>

                {/* Right Panel: Meals & Items */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2 text-slate-900 dark:text-foreground">
                            <CalendarHeart className="w-5 h-5 text-primary" />
                            Distribución de Comidas
                        </h3>
                        <Button type="button" variant="outline" size="sm" onClick={handleAddMeal} className="h-9 gap-2 font-black uppercase text-[10px] tracking-widest border-primary/30 text-primary hover:bg-primary/10">
                            <Plus className="w-4 h-4" /> Nueva Comida
                        </Button>
                    </div>

                    <div className="space-y-6">
                        {meals.map((meal, index) => {
                            const mealMacros = calculateMealMacros(meal);
                            return (
                                <div key={meal.id} className="relative p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-blue-50 dark:border-white/5 shadow-sm group animate-in fade-in zoom-in-95 duration-300">
                                    <button 
                                        type="button" 
                                        onClick={() => handleRemoveMeal(meal.id)}
                                        className="absolute -top-3 -right-3 w-8 h-8 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all z-10"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>

                                    <div className="space-y-6">
                                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                                            <div className="flex-1 space-y-2">
                                                <Label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Comida {index + 1}</Label>
                                                <Input 
                                                    value={meal.name} 
                                                    onChange={e => handleMealChange(meal.id, 'name', e.target.value)} 
                                                    className="h-12 bg-blue-50/30 dark:bg-black/20 border-blue-100 dark:border-white/10 font-black text-lg text-slate-900 dark:text-foreground" 
                                                    placeholder="Ej. Desayuno Post-Ayuno"
                                                />
                                            </div>
                                            <div className="flex items-center gap-4 bg-blue-50/50 dark:bg-black/20 p-3 rounded-xl border border-blue-100 dark:border-white/5 shrink-0">
                                                {[
                                                    { label: 'Kcal', val: Math.round(mealMacros.calories) },
                                                    { label: 'P', val: Math.round(mealMacros.protein), unit: 'g' },
                                                    { label: 'C', val: Math.round(mealMacros.carbs), unit: 'g' },
                                                    { label: 'G', val: Math.round(mealMacros.fats), unit: 'g' },
                                                ].map((m, idx) => (
                                                    <div key={idx} className={cn("text-center px-2", idx > 0 && "border-l border-blue-100 dark:border-white/10")}>
                                                        <div className="text-[9px] text-slate-400 dark:text-slate-500 uppercase font-black">{m.label}</div>
                                                        <div className="text-sm font-black text-slate-900 dark:text-foreground">{m.val}{m.unit}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            {meal.food_items.map((foodItem, foodIndex) => {
                                                const itemMacros = calculateItemMacros(foodItem);
                                                return (
                                                    <div key={foodIndex} className="p-4 rounded-xl bg-blue-50/20 dark:bg-black/10 border border-blue-50 dark:border-white/5 group/item relative">
                                                        <div className="flex items-center gap-4">
                                                            <span className="flex-1 text-sm font-black uppercase tracking-tight truncate text-slate-700 dark:text-foreground">{foodItem.name}</span>
                                                            <div className="relative w-24">
                                                                <Input type="number" step="any" min="0" value={foodItem.quantity} onChange={(e) => {
                                                                    const newFoodItems = [...meal.food_items]
                                                                    newFoodItems[foodIndex].quantity = Math.max(0, Number(e.target.value))
                                                                    handleMealChange(meal.id, 'food_items', newFoodItems)
                                                                }} className="h-9 text-xs font-black text-center pr-8 bg-white dark:bg-zinc-800 text-slate-900 dark:text-foreground border-blue-100 dark:border-white/10" />
                                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">{foodItem.unit}</span>
                                                            </div>
                                                            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-rose-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg" onClick={() => {
                                                                const newFoodItems = meal.food_items.filter((_, i) => i !== foodIndex)
                                                                handleMealChange(meal.id, 'food_items', newFoodItems)
                                                            }}>
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-4 mt-2 pt-2 border-t border-blue-50 dark:border-white/5">
                                                            {[
                                                                { val: Math.round(itemMacros.calories), label: 'Kcal' },
                                                                { val: itemMacros.protein, label: 'P', unit: 'g' },
                                                                { val: itemMacros.carbs, label: 'C', unit: 'g' },
                                                                { val: itemMacros.fats, label: 'G', unit: 'g' },
                                                            ].map((mac, idx) => (
                                                                <span key={idx} className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                                                    {mac.label}: <span className="text-slate-900 dark:text-foreground font-black">{mac.val}{mac.unit}</span>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            <FoodSearchModal onFoodSelected={(food, quantity, unit) => {
                                                const newFoodItems = [...meal.food_items, {
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
                                                }];
                                                handleMealChange(meal.id, 'food_items', newFoodItems);
                                            }} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Notas e Instrucciones del Protocolo</Label>
                        <textarea 
                            rows={4}
                            value={instructions}
                            onChange={e => setInstructions(e.target.value)}
                            className="w-full p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-blue-100 dark:border-white/5 text-sm font-bold shadow-sm focus:ring-1 focus:ring-primary outline-none transition-all resize-none text-slate-900 dark:text-foreground placeholder:text-slate-300 dark:placeholder:text-white/10"
                            placeholder="Ej. Consumir 500ml de agua con sal marina en ayunas..."
                        />
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-center gap-6 pt-10 border-t dark:border-white/10">
                <Button 
                    type="submit" 
                    disabled={isPending}
                    className="w-full md:w-[450px] h-16 text-sm font-black uppercase tracking-[0.3em] shadow-2xl rounded-2xl gap-3"
                >
                    {isPending ? (
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Procesando Protocolo...
                        </div>
                    ) : (
                        <>
                            <Save className="w-5 h-5" />
                            {initialData?.id ? 'Actualizar Cambios' : 'Guardar y Desplegar'}
                        </>
                    )}
                </Button>
                {onCancel && (
                    <Button type="button" variant="ghost" onClick={onCancel} className="font-bold text-slate-400 hover:text-foreground">
                        Cancelar Operación
                    </Button>
                )}
            </div>
        </form>
    )
}
