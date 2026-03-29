'use client'

import { useTransition, useMemo } from 'react'
import { CheckCircle2, Circle, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { Progress } from "@/components/ui/progress"

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

    const handleToggleMeal = (mealId: string, currentCompleted: boolean) => {
        startTransition(async () => {
            const { toggleMealCompletion } = await import('./actions')
            await toggleMealCompletion(clientId, planId, mealId, !currentCompleted, log?.id, coachSlug)
        })
    }

    const toggleExpand = (mealId: string) => {
        setExpandedMeals(prev => ({ ...prev, [mealId]: !prev[mealId] }))
    }

    const mealLogs = log?.nutrition_meal_logs || []

    const dailyTotals = useMemo(() => {
        const completedMealIds = new Set(mealLogs.filter((ml: any) => ml.is_completed).map((ml: any) => ml.meal_id))
        
        return meals.reduce((acc, meal) => {
            if (completedMealIds.has(meal.id)) {
                meal.food_items.forEach(item => {
                    const ratio = item.quantity / (item.foods?.serving_size_g || 100)
                    acc.calories += (item.foods?.calories || 0) * ratio
                    acc.protein += (item.foods?.protein_g || 0) * ratio
                    acc.carbs += (item.foods?.carbs_g || 0) * ratio
                    acc.fats += (item.foods?.fats_g || 0) * ratio
                })
            }
            return acc
        }, { calories: 0, protein: 0, carbs: 0, fats: 0 })
    }, [meals, mealLogs])

    return (
        <div className="space-y-6">
            {/* Daily Summary */}
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-sm">
                <div className="flex justify-between items-end">
                    <div>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Resumen Diario</p>
                        <h4 className="text-2xl font-black">{Math.round(dailyTotals.calories)} <span className="text-sm font-medium text-muted-foreground">/ {goalMacros.calories} kcal</span></h4>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-1">Completado</p>
                        <p className="text-xl font-black">{Math.round((dailyTotals.calories / (goalMacros.calories || 1)) * 100)}%</p>
                    </div>
                </div>
                
                <Progress value={(dailyTotals.calories / (goalMacros.calories || 1)) * 100} className="h-2" />

                <div className="grid grid-cols-3 gap-4 pt-2">
                    <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-bold uppercase text-muted-foreground">
                            <span>Prot</span>
                            <span>{Math.round(dailyTotals.protein)}g / {goalMacros.protein}g</span>
                        </div>
                        <Progress value={(dailyTotals.protein / (goalMacros.protein || 1)) * 100} className="h-1" />
                    </div>
                    <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-bold uppercase text-muted-foreground">
                            <span>Carbs</span>
                            <span>{Math.round(dailyTotals.carbs)}g / {goalMacros.carbs}g</span>
                        </div>
                        <Progress value={(dailyTotals.carbs / (goalMacros.carbs || 1)) * 100} className="h-1" />
                    </div>
                    <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-bold uppercase text-muted-foreground">
                            <span>Grasas</span>
                            <span>{Math.round(dailyTotals.fats)}g / {goalMacros.fats}g</span>
                        </div>
                        <Progress value={(dailyTotals.fats / (goalMacros.fats || 1)) * 100} className="h-1" />
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                {meals.map((meal) => {
                    const isCompleted = mealLogs.some((ml: any) => ml.meal_id === meal.id && ml.is_completed)
                    const isExpanded = expandedMeals[meal.id] ?? true

                    const mealMacros = meal.food_items.reduce((acc, item) => {
                        const ratio = item.quantity / (item.foods?.serving_size_g || 100)
                        acc.calories += (item.foods?.calories || 0) * ratio
                        acc.protein += (item.foods?.protein_g || 0) * ratio
                        acc.carbs += (item.foods?.carbs_g || 0) * ratio
                        acc.fats += (item.foods?.fats_g || 0) * ratio
                        return acc
                    }, { calories: 0, protein: 0, carbs: 0, fats: 0 })

                    return (
                        <div key={meal.id} className={`w-full rounded-2xl border transition-all overflow-hidden ${
                            isCompleted
                                ? 'bg-emerald-500/5 border-emerald-500/20 shadow-inner'
                                : 'bg-card border-border shadow-sm'
                        }`}>
                            {/* Meal Header */}
                            <div className="p-4 flex items-center gap-3">
                                <button 
                                    onClick={() => handleToggleMeal(meal.id, isCompleted)}
                                    disabled={isPending}
                                    className="flex-shrink-0 focus:outline-none"
                                >
                                    {isCompleted ? (
                                        <CheckCircle2 className="w-7 h-7 text-emerald-500 animate-in zoom-in duration-200" />
                                    ) : (
                                        <Circle className="w-7 h-7 text-muted-foreground/30 hover:text-muted-foreground transition-colors" />
                                    )}
                                </button>
                                
                                <div className="flex-1 min-w-0" onClick={() => toggleExpand(meal.id)}>
                                    <div className="flex items-center gap-2">
                                        <h4 className={`font-bold text-base truncate ${isCompleted ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>
                                            {meal.name}
                                        </h4>
                                        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                                    </div>
                                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-tight">
                                        {Math.round(mealMacros.calories)} kcal • P: {Math.round(mealMacros.protein)}g • C: {Math.round(mealMacros.carbs)}g • G: {Math.round(mealMacros.fats)}g
                                    </p>
                                </div>
                            </div>

                            {/* Ingredients List */}
                            {isExpanded && (
                                <div className="px-4 pb-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="h-px bg-border/50 mb-3" />
                                    {meal.food_items.map((item, index) => {
                                        const ratio = item.quantity / (item.foods?.serving_size_g || 100)
                                        return (
                                            <div key={index} className="flex flex-col gap-1.5 p-2 rounded-lg bg-muted/20 border border-border/5">
                                                <div className="flex justify-between items-start">
                                                    <span className="text-sm font-bold text-foreground/90 leading-tight">
                                                        {item.foods.name}
                                                    </span>
                                                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 ml-2 whitespace-nowrap">
                                                        {item.quantity}{item.quantity < 10 ? ' un' : 'g'}
                                                    </span>
                                                </div>
                                                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                                                    <span className="flex items-center gap-1">
                                                        <span className="w-1 h-1 rounded-full bg-orange-400" />
                                                        {Math.round((item.foods?.calories || 0) * ratio)} kcal
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <span className="w-1 h-1 rounded-full bg-blue-400" />
                                                        P: {Math.round(((item.foods?.protein_g || 0) * ratio) * 10) / 10}g
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <span className="w-1 h-1 rounded-full bg-emerald-400" />
                                                        C: {Math.round(((item.foods?.carbs_g || 0) * ratio) * 10) / 10}g
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <span className="w-1 h-1 rounded-full bg-yellow-400" />
                                                        G: {Math.round(((item.foods?.fats_g || 0) * ratio) * 10) / 10}g
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
