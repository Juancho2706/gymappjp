'use client'

import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { FoodItemDraft } from './types'

const UNITS = ['g', 'ml', 'un', 'cda', 'cdta', 'taza', 'porción']

interface Props {
  item: FoodItemDraft
  onUpdate: (qty: number, unit: string) => void
  onRemove: () => void
}

export function FoodItemRow({ item, onUpdate, onRemove }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
      <span className="flex-1 min-w-[120px] text-sm font-semibold text-foreground truncate">
        {item.food.name}
      </span>
      <Input
        type="number"
        min={0}
        step="any"
        className="h-9 w-20 font-mono text-sm"
        value={item.quantity}
        onChange={(e) => onUpdate(Number(e.target.value), item.unit ?? 'g')}
      />
      <Select
        value={item.unit ?? 'g'}
        onValueChange={(u) => onUpdate(item.quantity, u == null ? 'g' : u)}
      >
        <SelectTrigger className="h-9 w-[100px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {UNITS.map((u) => (
            <SelectItem key={u} value={u}>
              {u}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onRemove}>
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  )
}
