'use client'

import { useTransition } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'

interface Food {
    name: string;
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
}

export function NutritionTracker({ meals, log, planId, clientId, coachSlug }: Props) {
    const [isPending, startTransition] = useTransition()

    const handleToggleMeal = (mealId: string, currentCompleted: boolean) => {
        startTransition(async () => {
            const { toggleMealCompletion } = await import('./actions')
            await toggleMealCompletion(clientId, planId, mealId, !currentCompleted, log?.id, coachSlug)
        })
    }

    const mealLogs = log?.nutrition_meal_logs || []

    return (
        <div className="space-y-3">
            {meals.map((meal) => {
                const isCompleted = mealLogs.some((ml: any) => ml.meal_id === meal.id && ml.is_completed)

                const totalCalories = meal.food_items.reduce((acc, item) => acc + (item.foods?.calories || 0) * item.quantity / 100, 0)
                const totalProteins = meal.food_items.reduce((acc, item) => acc + (item.foods?.protein_g || 0) * item.quantity / 100, 0)
                const totalCarbs = meal.food_items.reduce((acc, item) => acc + (item.foods?.carbs_g || 0) * item.quantity / 100, 0)
                const totalFats = meal.food_items.reduce((acc, item) => acc + (item.foods?.fats_g || 0) * item.quantity / 100, 0)

                return (
                    <div key={meal.id} className={`w-full text-left p-4 rounded-2xl border transition-all ${
                        isCompleted
                            ? 'bg-emerald-500/10 border-emerald-500/30 ring-1 ring-emerald-500/20'
                            : 'bg-card border-border'
                    }`}>
                        <div onClick={() => handleToggleMeal(meal.id, isCompleted)} className="flex items-center gap-4 cursor-pointer">
                            <div className="flex-shrink-0">
                                {isCompleted ? (
                                    <CheckCircle2 className="w-6 h-6 text-emerald-500 animate-in zoom-in duration-200" />
                                ) : (
                                    <Circle className="w-6 h-6 text-muted-foreground" />
                                )}
                            </div>
                            <div className="flex-1">
                                <h4 className={`font-bold text-sm ${isCompleted ? 'text-emerald-500 text-opacity-90' : 'text-foreground'}`}>
                                    {meal.name}
                                </h4>
                            </div>
                            <div className="grid grid-cols-4 gap-2 text-xs w-1/2">
                                <div>
                                    <p className="font-bold">Calorías</p>
                                    <p>{totalCalories.toFixed(0)}</p>
                                </div>
                                <div>
                                    <p className="font-bold">Proteínas</p>
                                    <p>{totalProteins.toFixed(0)}g</p>
                                </div>
                                <div>
                                    <p className="font-bold">Carbs</p>
                                    <p>{totalCarbs.toFixed(0)}g</p>
                                </div>
                                <div>
                                    <p className="font-bold">Grasas</p>
                                    <p>{totalFats.toFixed(0)}g</p>
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 space-y-2">
                            {meal.food_items.map((item, index) => (
                                <div key={index} className="flex justify-between text-xs">
                                    <p>{item.foods.name}</p>
                                    <p>{item.quantity}g</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
