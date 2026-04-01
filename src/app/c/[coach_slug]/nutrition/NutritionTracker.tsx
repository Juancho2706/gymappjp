'use client'

import { useTransition, useMemo, useOptimistic } from 'react'
import { CheckCircle2, Circle, ChevronDown, ChevronUp, Activity, Flame, Beef, Wheat, Droplets } from 'lucide-react'
import { useState } from 'react'
import { Progress } from "@/components/ui/progress"
import { toggleMealCompletion } from './actions'
import { cn } from '@/lib/utils'

interface Food {
    name: string;
    serving_size_g: number;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
}

interface FoodItem {
    quantity: number;
    unit: string;
    foods: Food;
}

interface NutritionMeal {
    id: string;
    name: string;
    food_items: FoodItem[];
}

interface Props {
    meals: NutritionMeal[]
    log: any
    planId: string
    clientId: string
    coachSlug: string
    goalMacros: {
        calories: number;
        protein: number;
        carbs: number;
        fats: number;
    }
}

export function NutritionTracker({ meals, log, planId, clientId, coachSlug, goalMacros }: Props) {
    const [isPending, startTransition] = useTransition()
    const [expandedMeals, setExpandedMeals] = useState<Record<string, boolean>>({})

    const mealLogs = log?.nutrition_meal_logs || []
    const initialCompletedIds = mealLogs.filter((ml: any) => ml.is_completed).map((ml: any) => ml.meal_id)

    const [optimisticCompletedIds, addOptimisticMeal] = useOptimistic(
        initialCompletedIds,
        (state: string[], { mealId, isCompleted }: { mealId: string, isCompleted: boolean }) => {
            if (isCompleted) {
                return [...state, mealId]
            } else {
                return state.filter(id => id !== mealId)
            }
        }
    )

    const handleToggleMeal = (mealId: string, currentCompleted: boolean) => {
        const nextCompleted = !currentCompleted
        
        startTransition(async () => {
            addOptimisticMeal({ mealId, isCompleted: nextCompleted })
            try {
                await toggleMealCompletion(clientId, planId, mealId, nextCompleted, log?.id, coachSlug)
            } catch (error) {
                console.error("Error toggling meal:", error)
            }
        })
    }

    const toggleExpand = (mealId: string) => {
        setExpandedMeals(prev => ({ ...prev, [mealId]: !prev[mealId] }))
    }

    const calculateItemMacros = (item: FoodItem) => {
        const quantity = Number(item.quantity) || 0
        const unit = item.unit?.toLowerCase() || 'g'
        const factor = (unit === 'g' || unit === 'ml') ? quantity / 100 : quantity
        
        return {
            calories: (item.foods?.calories || 0) * factor,
            protein: (item.foods?.protein_g || 0) * factor,
            carbs: (item.foods?.carbs_g || 0) * factor,
            fats: (item.foods?.fats_g || 0) * factor
        }
    }

    const dailyTotals = useMemo(() => {
        const completedMealIdsSet = new Set(optimisticCompletedIds)
        
        return meals.reduce((acc, meal) => {
            if (completedMealIdsSet.has(meal.id)) {
                meal.food_items.forEach(item => {
                    const macros = calculateItemMacros(item)
                    acc.calories += macros.calories
                    acc.protein += macros.protein
                    acc.carbs += macros.carbs
                    acc.fats += macros.fats
                })
            }
            return acc
        }, { calories: 0, protein: 0, carbs: 0, fats: 0 })
    }, [meals, optimisticCompletedIds])

    return (
        <div className="space-y-6 pb-20">
            {/* Daily Summary */}
            <div className="bg-card border border-border rounded-3xl p-6 space-y-6 shadow-sm overflow-hidden relative">
                <div className="flex justify-between items-start relative z-10">
                    <div className="space-y-1">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Energía Diaria</p>
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-4xl font-black tabular-nums tracking-tight italic">
                                {Math.round(dailyTotals.calories)}
                            </span>
                            <span className="text-sm font-bold text-muted-foreground/60 italic">
                                / {goalMacros.calories} kcal
                            </span>
                        </div>
                    </div>
                    <div className="text-right space-y-1">
                        <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.2em]">Estado</p>
                        <div className="flex flex-col items-end">
                            <span className="text-2xl font-black text-emerald-500 tabular-nums leading-none">
                                {Math.round((dailyTotals.calories / (goalMacros.calories || 1)) * 100)}%
                            </span>
                        </div>
                    </div>
                </div>
                
                <div className="space-y-2">
                    <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-emerald-500 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                            style={{ width: `${Math.min((dailyTotals.calories / (goalMacros.calories || 1)) * 100, 100)}%` }}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                    {/* Protein */}
                    <div className="bg-orange-500/5 dark:bg-orange-500/10 rounded-2xl p-3 border border-orange-500/10 space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black uppercase text-orange-600 dark:text-orange-400">P</span>
                            <span className="text-xs font-black italic">{Math.round(dailyTotals.protein)}g</span>
                        </div>
                        <div className="h-1.5 w-full bg-orange-500/10 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-orange-500 transition-all duration-500"
                                style={{ width: `${Math.min((dailyTotals.protein / (goalMacros.protein || 1)) * 100, 100)}%` }}
                            />
                        </div>
                        <p className="text-[9px] text-center text-muted-foreground font-bold uppercase tracking-tighter">Meta: {goalMacros.protein}g</p>
                    </div>

                    {/* Carbs */}
                    <div className="bg-blue-500/5 dark:bg-blue-500/10 rounded-2xl p-3 border border-blue-500/10 space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-400">C</span>
                            <span className="text-xs font-black italic">{Math.round(dailyTotals.carbs)}g</span>
                        </div>
                        <div className="h-1.5 w-full bg-blue-500/10 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-blue-500 transition-all duration-500"
                                style={{ width: `${Math.min((dailyTotals.carbs / (goalMacros.carbs || 1)) * 100, 100)}%` }}
                            />
                        </div>
                        <p className="text-[9px] text-center text-muted-foreground font-bold uppercase tracking-tighter">Meta: {goalMacros.carbs}g</p>
                    </div>

                    {/* Fats */}
                    <div className="bg-yellow-500/5 dark:bg-yellow-500/10 rounded-2xl p-3 border border-yellow-500/10 space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black uppercase text-yellow-600 dark:text-yellow-500">G</span>
                            <span className="text-xs font-black italic">{Math.round(dailyTotals.fats)}g</span>
                        </div>
                        <div className="h-1.5 w-full bg-yellow-500/10 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-yellow-500 transition-all duration-500"
                                style={{ width: `${Math.min((dailyTotals.fats / (goalMacros.fats || 1)) * 100, 100)}%` }}
                            />
                        </div>
                        <p className="text-[9px] text-center text-muted-foreground font-bold uppercase tracking-tighter">Meta: {goalMacros.fats}g</p>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                {meals.map((meal) => {
                    const isCompleted = optimisticCompletedIds.includes(meal.id)
                    const isExpanded = expandedMeals[meal.id] ?? true

                    const mealMacros = meal.food_items.reduce((acc, item) => {
                        const macros = calculateItemMacros(item)
                        acc.calories += macros.calories
                        acc.protein += macros.protein
                        acc.carbs += macros.carbs
                        acc.fats += macros.fats
                        return acc
                    }, { calories: 0, protein: 0, carbs: 0, fats: 0 })

                    return (
                        <div key={meal.id} className={cn(
                            "w-full rounded-3xl border transition-all duration-300 overflow-hidden",
                            isCompleted
                                ? 'bg-emerald-500/[0.03] border-emerald-500/30 shadow-[inset_0_0_20px_rgba(16,185,129,0.02)]'
                                : 'bg-card border-border shadow-sm'
                        )}>
                            {/* Meal Header */}
                            <div className="p-4 flex items-center gap-4">
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleToggleMeal(meal.id, isCompleted)
                                    }}
                                    className="flex-shrink-0 focus:outline-none relative group"
                                >
                                    <div className={cn(
                                        "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-200",
                                        isCompleted 
                                            ? "bg-emerald-500 border-emerald-500 shadow-lg shadow-emerald-500/20" 
                                            : "border-muted-foreground/20 group-hover:border-muted-foreground/40"
                                    )}>
                                        {isCompleted && <CheckCircle2 className="w-5 h-5 text-white" />}
                                    </div>
                                </button>
                                
                                <div className="flex-1 min-w-0" onClick={() => toggleExpand(meal.id)}>
                                    <div className="flex items-center justify-between">
                                        <h4 className={cn(
                                            "font-black text-lg italic tracking-tight transition-colors",
                                            isCompleted ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
                                        )}>
                                            {meal.name}
                                        </h4>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-black bg-muted px-2.5 py-1 rounded-full text-muted-foreground">
                                                {Math.round(mealMacros.calories)} kcal
                                            </span>
                                            {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground/50" /> : <ChevronDown className="w-5 h-5 text-muted-foreground/50" />}
                                        </div>
                                    </div>
                                    <div className="flex gap-3 mt-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-500" /> P: {Math.round(mealMacros.protein)}g</span>
                                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> C: {Math.round(mealMacros.carbs)}g</span>
                                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500" /> G: {Math.round(mealMacros.fats)}g</span>
                                    </div>
                                </div>
                            </div>

                            {/* Ingredients List */}
                            {isExpanded && (
                                <div className="px-4 pb-5 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent mb-4" />
                                    {meal.food_items.map((item, index) => {
                                        const macros = calculateItemMacros(item)
                                        return (
                                            <div key={index} className="flex flex-col gap-2 p-3 rounded-2xl bg-muted/30 border border-border/50">
                                                <div className="flex justify-between items-start">
                                                    <span className="text-sm font-bold text-foreground/90 leading-tight">
                                                        {item.foods.name}
                                                    </span>
                                                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg whitespace-nowrap ml-2">
                                                        {item.quantity} {item.unit || (item.quantity < 10 ? 'un' : 'g')}
                                                    </span>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    <span className="flex items-center gap-1.5 bg-background/50 border border-border/50 px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter">
                                                        <Flame className="w-3 h-3 text-orange-500" /> {Math.round(macros.calories)}
                                                    </span>
                                                    <span className="flex items-center gap-1.5 bg-background/50 border border-border/50 px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter">
                                                        <Beef className="w-3 h-3 text-orange-500" /> P: {Math.round(macros.protein * 10) / 10}g
                                                    </span>
                                                    <span className="flex items-center gap-1.5 bg-background/50 border border-border/50 px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter">
                                                        <Wheat className="w-3 h-3 text-blue-500" /> C: {Math.round(macros.carbs * 10) / 10}g
                                                    </span>
                                                    <span className="flex items-center gap-1.5 bg-background/50 border border-border/50 px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter">
                                                        <Droplets className="w-3 h-3 text-yellow-500" /> G: {Math.round(macros.fats * 10) / 10}g
                                                    </span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
