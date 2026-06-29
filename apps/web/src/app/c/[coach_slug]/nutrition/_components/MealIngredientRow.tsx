'use client'

import { useState } from 'react'
import { ArrowLeftRight, Heart, Flame } from 'lucide-react'
import {
  calculateFoodItemMacros,
  coerceSwapOptionUnit,
  gramsToHousehold,
  swapOptionIsLiquid,
  type FoodItemForMacros,
} from '@/lib/nutrition-utils'
import { cn } from '@/lib/utils'
import { InfoTooltip } from '@/components/ui/info-tooltip'

interface Props {
  item: FoodItemForMacros
  isFavorite?: boolean
  onToggleFavorite?: (foodId: string) => void
  mealId?: string
  activeSwapFoodId?: string
  /** Cantidad y unidad las define el coach en la opción de cambio; el alumno solo elige y aplica. */
  onApplySwap?: (mealId: string, originalFoodId: string, swappedFoodId: string) => void
}

export function MealIngredientRow({
  item,
  isFavorite,
  onToggleFavorite,
  mealId,
  activeSwapFoodId,
  onApplySwap,
}: Props) {
  const macros = calculateFoodItemMacros(item)
  const resolvedUnit = item.unit || (item.quantity < 10 ? 'un' : 'g')
  // Medidas caseras (C): en gramos, rotula "120 g (1 taza)" si el alimento tiene household_*;
  // si no, gramsToHousehold degrada a solo la masa. Para 'un'/'ml' deja la cantidad cruda.
  const displayQty =
    resolvedUnit === 'g'
      ? gramsToHousehold(item.foods, item.quantity)
      : `${item.quantity} ${resolvedUnit}`
  const foodId = item.foods.id
  const [showSwaps, setShowSwaps] = useState(false)
  const swapOptions = item.swap_options ?? []

  return (
    <div className="rounded-xl bg-muted/30 border border-border/40 overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="flex-1 text-sm font-semibold text-foreground/90 truncate">{item.foods.name}</p>
            {swapOptions.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowSwaps((v) => !v)
                  }}
                  aria-label="Ver alternativas"
                  className={cn(
                    'shrink-0 inline-flex min-w-6 min-h-6 p-2 items-center justify-center rounded-md transition-colors hover:bg-muted touch-manipulation',
                    showSwaps && 'bg-muted'
                  )}
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-sport-500" />
                </button>
                <InfoTooltip
                  content="Tu coach dejó opciones de cambio para este alimento. Elige una y pulsa Aplicar."
                  iconClassName="w-3.5 h-3.5"
                  className="shrink-0 min-w-6 min-h-6 p-2"
                />
              </>
            )}
            {foodId && onToggleFavorite && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleFavorite(foodId)
                }}
                aria-label={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                className="shrink-0 inline-flex min-w-6 min-h-6 p-2 items-center justify-center rounded-md transition-colors hover:bg-muted touch-manipulation"
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
            <span className="text-[10px] font-bold text-[color:var(--color-macro-protein)]">P {Math.round(macros.protein)}g</span>
            <span className="text-[10px] font-bold text-[color:var(--color-macro-carbs)]">C {Math.round(macros.carbs)}g</span>
            <span className="text-[10px] font-bold text-[color:var(--color-macro-fats)]">G {Math.round(macros.fats)}g</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0 space-y-0.5">
          <p className="text-xs font-black text-ember-700">{displayQty}</p>
          <p className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-1 justify-end">
            <Flame className="w-3 h-3 text-ember-500" />
            {Math.round(macros.calories)} kcal
          </p>
        </div>
      </div>

      {showSwaps && swapOptions.length > 0 && (
        <div className="px-3 pb-3 pt-0 space-y-2 border-t border-border/30">
          <p className="text-[9px] font-bold uppercase tracking-widest text-sport-600 mt-2">Opciones de cambio</p>
          {swapOptions.map((f) => {
            const isLiquid = swapOptionIsLiquid(f)
            const coachQty =
              f.quantity != null && Number.isFinite(Number(f.quantity)) && Number(f.quantity) > 0
                ? Number(f.quantity)
                : Number(item.quantity) || 0
            const coachUnit = coerceSwapOptionUnit(f.unit ?? item.unit ?? undefined, isLiquid)
            const previewMacros = calculateFoodItemMacros({
              quantity: coachQty,
              unit: coachUnit,
              foods: {
                id: f.food_id,
                name: f.name,
                calories: f.calories,
                protein_g: f.protein_g,
                carbs_g: f.carbs_g,
                fats_g: f.fats_g,
                serving_size: f.serving_size,
                serving_unit: f.serving_unit ?? null,
              },
            })
            return (
              <div
                key={f.food_id}
                className="flex flex-col gap-2 rounded-lg bg-background/60 border border-border/30 px-2.5 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground/80 min-w-0 flex-1 truncate">{f.name}</p>
                  <div className="flex flex-wrap items-center gap-2 shrink-0 text-[10px] font-bold">
                    <span className="text-[color:var(--color-macro-protein)]">P{Math.round(previewMacros.protein)}g</span>
                    <span className="text-[color:var(--color-macro-carbs)]">C{Math.round(previewMacros.carbs)}g</span>
                    <span className="text-[color:var(--color-macro-fats)]">G{Math.round(previewMacros.fats)}g</span>
                    <span className="text-muted-foreground">{Math.round(previewMacros.calories)}kcal</span>
                    {activeSwapFoodId === f.food_id && (
                      <span className="rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-wide border bg-sport-100 text-sport-600 border-sport-500/40">
                        Activo
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] text-muted-foreground">
                    Porción del coach:{' '}
                    <span className="font-semibold text-foreground">
                      {coachQty} {coachUnit}
                    </span>
                  </p>
                  {mealId && foodId && onApplySwap && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onApplySwap(mealId, foodId, f.food_id)
                      }}
                      className="shrink-0 rounded-md bg-[var(--cta-fill)] px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-[var(--text-on-sport)] hover:opacity-90"
                    >
                      Aplicar
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
