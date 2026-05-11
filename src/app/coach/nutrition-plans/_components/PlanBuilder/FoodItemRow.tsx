'use client'

import { useState, useEffect } from 'react'
import { ArrowLeftRight, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { FoodItemDraft } from './types'
import {
  calculateFoodItemMacros,
  coerceSwapOptionUnit,
  swapOptionAllowedUnits,
  swapOptionIsLiquid,
} from '@/lib/nutrition-utils'

const UNITS_SOLID = ['g', 'un']
const UNITS_LIQUID = ['ml', 'un']

interface Props {
  item: FoodItemDraft
  onUpdate: (qty: number, unit: string) => void
  onRemove: () => void
  onOpenSwapSearch: () => void
  onRemoveSwapOption: (swapFoodId: string) => void
  onUpdateSwapOption: (swapFoodId: string, quantity: number, unit: 'g' | 'un' | 'ml') => void
}

function SwapQtyInput({
  quantity,
  effectiveUnit,
  foodId,
  onUpdateSwapOption,
}: {
  quantity: number
  effectiveUnit: 'g' | 'un' | 'ml'
  foodId: string
  onUpdateSwapOption: (swapFoodId: string, quantity: number, unit: 'g' | 'un' | 'ml') => void
}) {
  const [qtyStr, setQtyStr] = useState(String(quantity))
  useEffect(() => {
    if (Number(qtyStr) !== quantity) setQtyStr(String(quantity))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantity])
  return (
    <Input
      type="number"
      min={0}
      step="any"
      className="h-8 w-20 bg-white dark:bg-background text-[11px] font-bold"
      value={qtyStr}
      onChange={(e) => {
        setQtyStr(e.target.value)
        const n = parseFloat(e.target.value)
        if (!isNaN(n) && n >= 0) onUpdateSwapOption(foodId, n, effectiveUnit)
      }}
      onBlur={() => {
        const n = parseFloat(qtyStr)
        const safe = isNaN(n) || n < 0 ? 0 : n
        setQtyStr(String(safe))
        onUpdateSwapOption(foodId, safe, effectiveUnit)
      }}
    />
  )
}

export function FoodItemRow({
  item,
  onUpdate,
  onRemove,
  onOpenSwapSearch,
  onRemoveSwapOption,
  onUpdateSwapOption,
}: Props) {
  const units = item.food.is_liquid ? UNITS_LIQUID : UNITS_SOLID
  const defaultUnit = item.food.is_liquid ? 'ml' : 'g'

  // Local string state so user can clear the field before typing a new number
  const [qtyStr, setQtyStr] = useState(String(item.quantity))

  useEffect(() => {
    // Sync from parent only when the numeric value actually differs (avoids loop)
    if (Number(qtyStr) !== item.quantity) {
      setQtyStr(String(item.quantity))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.quantity])

  return (
    <div className="rounded-xl border border-slate-200 dark:border-border/60 bg-slate-50 dark:bg-muted/20 px-3 py-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
      <span className="flex-1 min-w-[120px] text-sm font-semibold text-foreground truncate">
        {item.food.name}
        {item.food.brand && (
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">{item.food.brand}</span>
        )}
      </span>
      <Input
        type="number"
        min={0}
        step="any"
        className="h-9 w-20 font-mono text-sm bg-white dark:bg-background text-slate-900 dark:text-foreground border-slate-300 dark:border-border"
        value={qtyStr}
        onChange={(e) => {
          setQtyStr(e.target.value)
          const n = parseFloat(e.target.value)
          if (!isNaN(n) && n >= 0) onUpdate(n, item.unit ?? defaultUnit)
        }}
        onBlur={() => {
          const n = parseFloat(qtyStr)
          const safe = isNaN(n) || n < 0 ? 0 : n
          setQtyStr(String(safe))
          onUpdate(safe, item.unit ?? defaultUnit)
        }}
      />
      <div className="flex items-center gap-1">
        <Select
          value={item.unit ?? defaultUnit}
          onValueChange={(u) => onUpdate(item.quantity, u == null ? defaultUnit : u)}
        >
          <SelectTrigger className="h-9 w-[80px] bg-white dark:bg-background text-slate-900 dark:text-foreground border-slate-300 dark:border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {units.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <InfoTooltip content="g = gramos (macros proporcionales a 100g). ml = mililitros, mismo cálculo que g (para líquidos y aceites). un = unidades (macros según la porción registrada en el alimento)." />
      </div>
      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onRemove}>
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-[11px] font-bold"
          onClick={onOpenSwapSearch}
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
          Configurar cambios
        </Button>
        <InfoTooltip content="Define aquí las opciones de intercambio para este alimento específico. El alumno podrá elegir entre estas alternativas en su plan." />
      </div>

      {(item.swapOptions?.length ?? 0) > 0 && (
        <div className="space-y-2">
          {item.swapOptions!.map((opt) => {
            const isLiquid = swapOptionIsLiquid(opt.food)
            const allowedUnits = swapOptionAllowedUnits(isLiquid)
            const effectiveUnit = coerceSwapOptionUnit(opt.unit, isLiquid)
            return (
              <div key={opt.food_id} className="rounded-xl border border-sky-500/25 bg-sky-500/10 p-2.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-black text-sky-800 dark:text-sky-200">{opt.food.name}</p>
                    <p className="mt-0.5 text-[10px] font-semibold text-sky-700/80 dark:text-sky-300/80">
                      Porción base: {Math.round(opt.food.serving_size)} {opt.food.serving_unit ?? 'g'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveSwapOption(opt.food_id)}
                    className="rounded p-1 hover:bg-sky-500/20"
                    aria-label={`Quitar alternativa ${opt.food.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>

                <div className="mt-2 flex items-center gap-1.5">
                  <SwapQtyInput
                    quantity={opt.quantity}
                    effectiveUnit={effectiveUnit}
                    foodId={opt.food_id}
                    onUpdateSwapOption={onUpdateSwapOption}
                  />
                  <Select
                    value={effectiveUnit}
                    onValueChange={(u) =>
                      onUpdateSwapOption(opt.food_id, opt.quantity, coerceSwapOptionUnit(u, isLiquid))
                    }
                  >
                    <SelectTrigger className="h-8 w-[68px] bg-white dark:bg-background text-[11px] font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedUnits.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {(() => {
                  const m = calculateFoodItemMacros({
                    quantity: Number(opt.quantity) || 0,
                    unit: effectiveUnit,
                    foods: {
                      name: opt.food.name,
                      calories: opt.food.calories,
                      protein_g: opt.food.protein_g,
                      carbs_g: opt.food.carbs_g,
                      fats_g: opt.food.fats_g,
                      serving_size: opt.food.serving_size,
                      serving_unit: opt.food.serving_unit ?? null,
                    },
                  })
                  return (
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-black">
                      <span className="rounded-md bg-rose-500/15 px-1.5 py-0.5 text-rose-600 dark:text-rose-300">
                        P {Math.round(m.protein)}g
                      </span>
                      <span className="rounded-md bg-blue-500/15 px-1.5 py-0.5 text-blue-600 dark:text-blue-300">
                        C {Math.round(m.carbs)}g
                      </span>
                      <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-amber-600 dark:text-amber-300">
                        G {Math.round(m.fats)}g
                      </span>
                      <span className="rounded-md bg-orange-500/15 px-1.5 py-0.5 text-orange-600 dark:text-orange-300">
                        {Math.round(m.calories)} kcal
                      </span>
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
