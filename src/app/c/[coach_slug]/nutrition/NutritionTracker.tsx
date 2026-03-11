'use client'

import { useTransition } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'

interface Props {
    meals: any[]
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

                return (
                    <button
                        key={meal.id}
                        onClick={() => handleToggleMeal(meal.id, isCompleted)}
                        disabled={isPending}
                        className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-4 ${
                            isCompleted 
                                ? 'bg-emerald-500/10 border-emerald-500/30 ring-1 ring-emerald-500/20' 
                                : 'bg-card border-border hover:border-border hover:border-accent'
                        }`}
                    >
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
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                {meal.description}
                            </p>
                        </div>
                    </button>
                )
            })}
        </div>
    )
}
