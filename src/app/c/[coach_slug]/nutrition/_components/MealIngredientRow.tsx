'use client'

import { Heart, Flame } from 'lucide-react'
import { calculateFoodItemMacros, type FoodItemForMacros } from '@/lib/nutrition-utils'
import { cn } from '@/lib/utils'

interface Props {
  item: FoodItemForMacros
  isFavorite?: boolean
  onToggleFavorite?: (foodId: string) => void
}

export function MealIngredientRow({ item, isFavorite, onToggleFavorite }: Props) {
  const macros = calculateFoodItemMacros(item)
  const displayQty = `${item.quantity} ${item.unit || (item.quantity < 10 ? 'un' : 'g')}`
  const foodId = item.foods.id

  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-xl bg-muted/30 border border-border/40">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="flex-1 text-sm font-semibold text-foreground/90 truncate">{item.foods.name}</p>
          {foodId && onToggleFavorite && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(foodId) }}
              aria-label={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
              className="shrink-0 p-0.5 rounded-md transition-colors hover:bg-muted"
            >
              <Heart
                className={cn(
                  'w-3.5 h-3.5 transition-colors',
                  isFavorite
                    ? 'fill-rose-400 text-rose-400'
                    : 'text-muted-foreground/40 hover:text-rose-300'
                )}
              />
            </button>
          )}
        </div>
        <div className="flex gap-2 mt-0.5">
          <span className="text-[10px] font-bold text-orange-500">P {Math.round(macros.protein)}g</span>
          <span className="text-[10px] font-bold text-blue-500">C {Math.round(macros.carbs)}g</span>
          <span className="text-[10px] font-bold text-yellow-500">G {Math.round(macros.fats)}g</span>
        </div>
      </div>
      <div className="text-right flex-shrink-0 space-y-0.5">
        <p className="text-xs font-black text-emerald-500">{displayQty}</p>
        <p className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-1 justify-end">
          <Flame className="w-3 h-3 text-orange-400" />
          {Math.round(macros.calories)} kcal
        </p>
      </div>
    </div>
  )
}
