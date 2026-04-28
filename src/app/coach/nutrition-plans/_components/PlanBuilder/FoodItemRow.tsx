'use client'

import { Trash2 } from 'lucide-react'
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

const UNITS_SOLID = ['g', 'un']
const UNITS_LIQUID = ['ml', 'un']

interface Props {
  item: FoodItemDraft
  onUpdate: (qty: number, unit: string) => void
  onRemove: () => void
}

export function FoodItemRow({ item, onUpdate, onRemove }: Props) {
  const units = item.food.is_liquid ? UNITS_LIQUID : UNITS_SOLID
  const defaultUnit = item.food.is_liquid ? 'ml' : 'g'

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 dark:border-border/60 bg-slate-50 dark:bg-muted/20 px-3 py-2">
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
        value={item.quantity}
        onChange={(e) => onUpdate(Number(e.target.value), item.unit ?? defaultUnit)}
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
        <InfoTooltip content="g = gramos (macros proporcionales a 100g del alimento). un = unidades (macros según el tamaño de porción registrado en el alimento)." />
      </div>
      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onRemove}>
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  )
}
