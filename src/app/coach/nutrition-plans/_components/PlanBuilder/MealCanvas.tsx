'use client'

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MealBlock } from './MealBlock'
import type { MealDraft } from './types'

interface Props {
  meals: MealDraft[]
  onAddMeal: () => void
  onUpdateMealName: (mealId: string, name: string) => void
  onUpdateMealDayOfWeek: (mealId: string, day: number | null) => void
  onRemoveMeal: (mealId: string) => void
  onOpenFoodSearch: (mealId: string) => void
  onUpdateFoodItem: (mealId: string, idx: number, qty: number, unit: string) => void
  onRemoveFoodItem: (mealId: string, idx: number) => void
}

export function MealCanvas({
  meals,
  onAddMeal,
  onUpdateMealName,
  onUpdateMealDayOfWeek,
  onRemoveMeal,
  onOpenFoodSearch,
  onUpdateFoodItem,
  onRemoveFoodItem,
}: Props) {
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-black tracking-tight">Comidas del plan</h2>
        <Button type="button" onClick={onAddMeal} size="sm" className="gap-1">
          <Plus className="h-4 w-4" />
          Comida
        </Button>
      </div>

      {meals.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-2xl">
          Añade comidas y arrastra para ordenar.
        </p>
      ) : (
        <div className="space-y-4">
          {meals.map((meal) => (
            <MealBlock
              key={meal.id}
              meal={meal}
              onUpdateName={(name) => onUpdateMealName(meal.id, name)}
              onUpdateDayOfWeek={(day) => onUpdateMealDayOfWeek(meal.id, day)}
              onRemove={() => onRemoveMeal(meal.id)}
              onOpenFoodSearch={() => onOpenFoodSearch(meal.id)}
              onUpdateFoodItem={(idx, q, u) => onUpdateFoodItem(meal.id, idx, q, u)}
              onRemoveFoodItem={(idx) => onRemoveFoodItem(meal.id, idx)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
