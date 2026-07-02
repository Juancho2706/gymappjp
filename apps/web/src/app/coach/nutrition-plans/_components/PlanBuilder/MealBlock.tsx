'use client'

import { useMemo } from 'react'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, Trash2, Utensils, MoreVertical, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
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
  /** Modo intercambios (módulo nutrition_exchanges): oculta la UI de alimentos por gramos. */
  exchangeMode?: boolean
  /** Contenido extra renderizado dentro del bloque (editor de porciones). */
  extraContent?: React.ReactNode
  onUpdateName: (name: string) => void
  onUpdateDayOfWeek: (day: number | null) => void
  onUpdateNotes: (notes: string) => void
  onRemove: () => void
  /** Guarda los alimentos actuales de la comida como un grupo reutilizable. */
  onSaveAsGroup?: () => void
  onOpenFoodSearch: () => void
  onUpdateFoodItem: (idx: number, qty: number, unit: string) => void
  onRemoveFoodItem: (idx: number) => void
  onReorderFoodItems: (fromIndex: number, toIndex: number) => void
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
  exchangeMode = false,
  extraContent,
  onUpdateName,
  onUpdateDayOfWeek,
  onUpdateNotes,
  onRemove,
  onSaveAsGroup,
  onOpenFoodSearch,
  onUpdateFoodItem,
  onRemoveFoodItem,
  onReorderFoodItems,
  onOpenSwapSearch,
  onRemoveSwapOption,
  onUpdateSwapOption,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: meal.id,
  })

  const foodItemSortableIds = useMemo(() => meal.foodItems.map((_, i) => `food-item-${i}`), [meal.foodItems])

  function handleFoodDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = foodItemSortableIds.indexOf(active.id as string)
    const newIdx = foodItemSortableIds.indexOf(over.id as string)
    if (oldIdx !== -1 && newIdx !== -1) onReorderFoodItems(oldIdx, newIdx)
  }

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  }

  const dowSelectValue = meal.day_of_week == null ? DOW_ALL : String(meal.day_of_week)
  const dowLabelMap = useMemo(() => Object.fromEntries(DOW_OPTIONS.map((o) => [o.value, o.label])), [])

  // Guardar como grupo: solo por gramos (no en porciones) y con al menos 1 alimento.
  const canSaveAsGroup = !exchangeMode && meal.foodItems.length > 0

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`w-full min-w-0 rounded-2xl border border-subtle bg-surface-card p-4 shadow-sm ${isDragging ? 'z-10 opacity-90 ring-2 ring-[color:var(--theme-primary)]' : ''}`}
    >
      <div className="mb-3 space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="touch-none shrink-0 rounded-lg p-1.5 text-muted hover:bg-surface-sunken"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" />
          </button>
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-[var(--ember-100)] text-[var(--ember-700)]"
          >
            <Utensils className="h-[18px] w-[18px]" />
          </span>
          <Input
            value={meal.name}
            onChange={(e) => onUpdateName(e.target.value)}
            placeholder="Nombre de la comida"
            className="h-10 flex-1 font-bold"
          />
          <div className="flex shrink-0 items-center gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger
                className="h-12 w-12 min-w-0 rounded-full border-0 bg-transparent p-0 text-muted normal-case tracking-normal hover:bg-surface-sunken hover:text-strong dark:bg-transparent"
                aria-label="Más opciones de la comida"
                title="Más opciones de la comida"
              >
                <MoreVertical className="h-[18px] w-[18px]" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[13rem]">
                <DropdownMenuItem
                  disabled={!canSaveAsGroup}
                  onClick={() => {
                    if (canSaveAsGroup) onSaveAsGroup?.()
                  }}
                >
                  <Layers className="h-4 w-4" />
                  Guardar como grupo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button type="button" variant="ghost" size="icon" onClick={onRemove}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex w-full flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted">
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
            <SelectTrigger className="h-10 w-full rounded-xl bg-surface-app border-default" size="sm">
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
          <p className="text-[10px] leading-snug text-muted">
            Todos los días: la comida se muestra siempre. Día fijo: solo ese día (1=lun … 7=dom, zona Santiago).
          </p>
        </div>
      </div>

      {extraContent && <div className="mb-3">{extraContent}</div>}

      {!exchangeMode && (
      <>
      <div className="space-y-2 mb-3">
        <DndContext collisionDetection={closestCenter} onDragEnd={handleFoodDragEnd}>
          <SortableContext items={foodItemSortableIds} strategy={verticalListSortingStrategy}>
            {meal.foodItems.map((fi, idx) => (
              <FoodItemRow
                key={`${fi.food_id}-${idx}`}
                sortableId={foodItemSortableIds[idx]}
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
          </SortableContext>
        </DndContext>
      </div>

      {meal.foodItems.length === 0 && (
        <div className="mb-3 w-full min-w-0 rounded-xl border border-[color:var(--ember-300)] bg-[var(--ember-100)] px-3 py-2.5 text-left text-[11px] font-semibold leading-snug text-[var(--ember-700)] sm:text-xs">
          Comida vacía: agrega al menos 1 alimento para conservar consistencia del plan.
        </div>
      )}
      </>
      )}

      <div className="mb-3 space-y-1">
        <Label className="text-[10px] font-black uppercase tracking-widest text-muted">
          Nota para el alumno
          <span className="ml-1 font-normal normal-case tracking-normal text-[var(--text-muted)]/60">(opcional)</span>
        </Label>
        <textarea
          value={meal.notes ?? ''}
          onChange={(e) => onUpdateNotes(e.target.value)}
          placeholder="Ej: Puedes reemplazar el arroz por papa. Comer 30 min antes del entrenamiento."
          maxLength={500}
          rows={2}
          className="w-full rounded-xl border border-default bg-surface-app px-3 py-2 text-sm text-strong placeholder:text-[var(--text-muted)]/50 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
      </div>

      {!exchangeMode && (
        <Button type="button" variant="outline" className="w-full gap-2 border-dashed" onClick={onOpenFoodSearch}>
          <Plus className="h-4 w-4" />
          Agregar alimento
        </Button>
      )}
    </div>
  )
}
