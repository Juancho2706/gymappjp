import { calculateFoodItemMacros, type FoodItemForMacros } from '@/lib/nutrition-utils'
import { Flame } from 'lucide-react'

export function MealIngredientRow({ item }: { item: FoodItemForMacros }) {
  const macros = calculateFoodItemMacros(item)
  const displayQty = `${item.quantity} ${item.unit || (item.quantity < 10 ? 'un' : 'g')}`

  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-xl bg-muted/30 border border-border/40">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground/90 truncate">{item.foods.name}</p>
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
