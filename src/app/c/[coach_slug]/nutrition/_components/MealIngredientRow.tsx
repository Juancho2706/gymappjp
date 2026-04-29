'use client'

import { useState } from 'react'
import { Heart, Flame, ArrowLeftRight } from 'lucide-react'
import { calculateFoodItemMacros, type FoodItemForMacros } from '@/lib/nutrition-utils'
import { cn } from '@/lib/utils'

interface SwapFood {
  id: string
  name: string
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
}

interface Props {
  item: FoodItemForMacros
  isFavorite?: boolean
  onToggleFavorite?: (foodId: string) => void
  swapOptions?: SwapFood[]
}

export function MealIngredientRow({ item, isFavorite, onToggleFavorite, swapOptions }: Props) {
  const macros = calculateFoodItemMacros(item)
  const displayQty = `${item.quantity} ${item.unit || (item.quantity < 10 ? 'un' : 'g')}`
  const foodId = item.foods.id
  const [showSwaps, setShowSwaps] = useState(false)

  return (
    <div className="rounded-xl bg-muted/30 border border-border/40 overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="flex-1 text-sm font-semibold text-foreground/90 truncate">{item.foods.name}</p>
            {swapOptions && swapOptions.length > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowSwaps((v) => !v) }}
                aria-label="Ver alternativas"
                className={cn(
                  'shrink-0 p-0.5 rounded-md transition-colors hover:bg-muted',
                  showSwaps && 'bg-muted'
                )}
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-sky-500" />
              </button>
            )}
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

      {showSwaps && swapOptions && swapOptions.length > 0 && (
        <div className="px-3 pb-3 pt-0 space-y-1.5 border-t border-border/30">
          <p className="text-[9px] font-bold uppercase tracking-widest text-sky-500 mt-2">Alternativas equivalentes</p>
          {swapOptions.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 rounded-lg bg-background/60 border border-border/30 px-2.5 py-1.5">
              <p className="text-xs font-semibold text-foreground/80 truncate">{f.name}</p>
              <div className="flex gap-1.5 shrink-0 text-[10px] font-bold">
                <span className="text-orange-500">P{Math.round(f.protein_g * (Number(item.quantity) / 100))}g</span>
                <span className="text-blue-500">C{Math.round(f.carbs_g * (Number(item.quantity) / 100))}g</span>
                <span className="text-muted-foreground">{Math.round(f.calories * (Number(item.quantity) / 100))}kcal</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
