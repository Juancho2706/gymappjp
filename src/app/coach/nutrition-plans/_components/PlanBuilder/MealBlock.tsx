'use client'

import { useMemo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FoodItemRow } from './FoodItemRow'
import type { MealDraft } from './types'

const DOW_ALL = '__all__' as const

const DOW_OPTIONS: { value: string; label: string }[] = [
  { value: DOW_ALL, label: 'Todos los días' },
  { value: '1', label: 'Lunes' },
  { value: '2', label: 'Martes' },
  { value: '3', label: 'Miércoles' },
  { value: '4', label: 'Jueves' },
  { value: '5', label: 'Viernes' },
  { value: '6', label: 'Sábado' },
  { value: '7', label: 'Domingo' },
]

interface Props {
  meal: MealDraft
  onUpdateName: (name: string) => void
  onUpdateDayOfWeek: (day: number | null) => void
  onUpdateNotes: (notes: string) => void
  onRemove: () => void
  onOpenFoodSearch: () => void
  onUpdateFoodItem: (idx: number, qty: number, unit: string) => void
  onRemoveFoodItem: (idx: number) => void
  onOpenSwapSearch: (idx: number) => void
  onRemoveSwapOption: (idx: number, swapFoodId: string) => void
  onUpdateSwapOption: (
    idx: number,
    swapFoodId: string,
    quantity: number,
    unit: 'g' | 'un' | 'ml'
  ) => void
}

export function MealBlock({
  meal,
  onUpdateName,
  onUpdateDayOfWeek,
  onUpdateNotes,
  onRemove,
  onOpenFoodSearch,
  onUpdateFoodItem,
  onRemoveFoodItem,
  onOpenSwapSearch,
  onRemoveSwapOption,
  onUpdateSwapOption,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: meal.id,
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  }

  const dowSelectValue = meal.day_of_week == null ? DOW_ALL : String(meal.day_of_week)
  const dowLabelMap = useMemo(() => Object.fromEntries(DOW_OPTIONS.map((o) => [o.value, o.label])), [])

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`w-full min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm ${isDragging ? 'z-10 opacity-90 ring-2 ring-[color:var(--theme-primary)]' : ''}`}
    >
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            className="touch-none shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" />
          </button>
          <Input
            value={meal.name}
            onChange={(e) => onUpdateName(e.target.value)}
            className="h-10 min-w-0 flex-1 font-bold"
          />
          <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:min-w-[11rem] sm:max-w-[14rem] sm:shrink-0">
          <div className="flex items-center gap-1">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Día del plan
            </Label>
            <InfoTooltip content="Todos los días: la comida aparece siempre en el plan del alumno. Día fijo: solo se muestra ese día de la semana (zona horaria Santiago). Útil para variar la alimentación según el tipo de entrenamiento." />
          </div>
          <Select
            value={dowSelectValue}
            onValueChange={(v) => {
              if (v == null || v === DOW_ALL) onUpdateDayOfWeek(null)
              else onUpdateDayOfWeek(Number.parseInt(v, 10))
            }}
          >
            <SelectTrigger className="h-10 w-full rounded-xl bg-background border-input" size="sm">
              <SelectValue>{dowLabelMap[dowSelectValue] ?? 'Todos los días'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {DOW_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] leading-snug text-muted-foreground">
            Todos los días: la comida se muestra siempre. Día fijo: solo ese día (1=lun … 7=dom, zona Santiago).
          </p>
        </div>
      </div>

      <div className="space-y-2 mb-3">
        {meal.foodItems.map((fi, idx) => (
          <FoodItemRow
            key={`${fi.food_id}-${idx}`}
            item={fi}
            onUpdate={(q, u) => onUpdateFoodItem(idx, q, u)}
            onRemove={() => onRemoveFoodItem(idx)}
            onOpenSwapSearch={() => onOpenSwapSearch(idx)}
            onRemoveSwapOption={(swapFoodId) => onRemoveSwapOption(idx, swapFoodId)}
            onUpdateSwapOption={(swapFoodId, quantity, unit) =>
              onUpdateSwapOption(idx, swapFoodId, quantity, unit)
            }
          />
        ))}
      </div>

      {meal.foodItems.length === 0 && (
        <div className="mb-3 w-full min-w-0 rounded-xl border border-orange-500/40 bg-orange-500/10 px-3 py-2.5 text-left text-[11px] font-semibold leading-snug text-orange-700 dark:text-orange-300 sm:text-xs">
          Comida vacía: agrega al menos 1 alimento para conservar consistencia del plan.
        </div>
      )}

      <div className="mb-3 space-y-1">
        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          Nota para el alumno
          <span className="ml-1 font-normal normal-case tracking-normal text-muted-foreground/60">(opcional)</span>
        </Label>
        <textarea
          value={meal.notes ?? ''}
          onChange={(e) => onUpdateNotes(e.target.value)}
          placeholder="Ej: Puedes reemplazar el arroz por papa. Comer 30 min antes del entrenamiento."
          maxLength={500}
          rows={2}
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
      </div>

      <Button type="button" variant="outline" className="w-full gap-2 border-dashed" onClick={onOpenFoodSearch}>
        <Plus className="h-4 w-4" />
        Agregar alimento
      </Button>
    </div>
  )
}
