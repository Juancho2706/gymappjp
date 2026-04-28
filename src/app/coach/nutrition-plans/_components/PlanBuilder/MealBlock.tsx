'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FoodItemRow } from './FoodItemRow'
import type { MealDraft } from './types'

interface Props {
  meal: MealDraft
  onUpdateName: (name: string) => void
  onRemove: () => void
  onOpenFoodSearch: () => void
  onUpdateFoodItem: (idx: number, qty: number, unit: string) => void
  onRemoveFoodItem: (idx: number) => void
}

export function MealBlock({
  meal,
  onUpdateName,
  onRemove,
  onOpenFoodSearch,
  onUpdateFoodItem,
  onRemoveFoodItem,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: meal.id,
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-2xl border border-border bg-card p-4 shadow-sm ${isDragging ? 'z-10 opacity-90 ring-2 ring-[color:var(--theme-primary)]' : ''}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          className="touch-none p-1.5 rounded-lg text-muted-foreground hover:bg-muted"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" />
        </button>
        <Input
          value={meal.name}
          onChange={(e) => onUpdateName(e.target.value)}
          className="font-bold h-10 flex-1"
        />
        <Button type="button" variant="ghost" size="icon" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2 mb-3">
        {meal.foodItems.map((fi, idx) => (
          <FoodItemRow
            key={`${fi.food_id}-${idx}`}
            item={fi}
            onUpdate={(q, u) => onUpdateFoodItem(idx, q, u)}
            onRemove={() => onRemoveFoodItem(idx)}
          />
        ))}
      </div>

      {meal.foodItems.length === 0 && (
        <div className="mb-3 rounded-xl border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-[11px] font-semibold text-orange-700 dark:text-orange-300">
          Comida vacía: agrega al menos 1 alimento para conservar consistencia del plan.
        </div>
      )}

      <Button type="button" variant="outline" className="w-full gap-2 border-dashed" onClick={onOpenFoodSearch}>
        <Plus className="h-4 w-4" />
        Agregar alimento
      </Button>
    </div>
  )
}
