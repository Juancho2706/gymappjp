'use client'

import { useRef, type KeyboardEvent } from 'react'
import {
  NUTRITION_PLAN_DOW_LEGEND,
  formatNutritionPlanDowCalories,
  formatNutritionPlanDowCellAccessibilityLabel,
  type NutritionPlanDowCell,
  type NutritionPlanDowVariantLike,
} from '@eva/nutrition-v2'
import { cn } from '@/lib/utils'

/**
 * Selector de DÍA del plan — strip Lu-Do de 7 celdas, sin fechas (mockup aprobado 2026-07-29).
 *
 * "El coach toca días, no variantes": cada celda es un día de la semana con las kcal que ese día
 * recibe y un punto que dice si tiene estructura propia (lleno) o hereda el día base (hueco).
 * Reemplaza la pila de cards por día de "Estructura prescrita" y la tira `DayVariantWeekStrip` que
 * cada card repetía siete veces con la misma información.
 *
 * NO es la tira de seguimiento. `WeekDayNav` (arriba, "Semana del alumno") lleva FECHAS, consumo y
 * adherencia; esta lleva día de semana puro y estructura del plan. Semánticas distintas, dos
 * componentes distintos a propósito — se parecen porque el owner quiso el mismo lenguaje visual.
 *
 * Presentacional puro: recibe las celdas de `buildNutritionPlanDowStrip` y avisa qué día se tocó.
 * Gemelo de `apps/mobile/components/nutrition-v2/PlanDowSelector.tsx`.
 *
 * A11y: grupo etiquetado + `aria-pressed` en el día elegido, `aria-label` compartido con RN
 * ("Sábado, día propio, 420 kcal prescritas, hoy") y flechas ←/→ + Inicio/Fin para mover el foco.
 * Altura mínima 52 px (sobre el mínimo táctil de 44).
 */
export function PlanDowSelector({
  cells,
  selectedDow,
  onSelect,
  className,
  label = 'Días del plan',
  showLegend = true,
}: {
  cells: readonly NutritionPlanDowCell<NutritionPlanDowVariantLike>[]
  /** `dayOfWeek` (0=domingo … 6=sábado) del día que la superficie está mostrando. */
  selectedDow: number
  onSelect: (dayOfWeek: number) => void
  className?: string
  label?: string
  showLegend?: boolean
}) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([])

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | null = null
    if (event.key === 'ArrowRight') next = index + 1
    else if (event.key === 'ArrowLeft') next = index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = cells.length - 1
    if (next == null) return
    event.preventDefault()
    const total = cells.length
    buttonsRef.current[((next % total) + total) % total]?.focus()
  }

  if (cells.length === 0) return null

  return (
    <div className={cn('space-y-1.5', className)}>
      <div aria-label={label} className="grid grid-cols-7 gap-1" role="group">
        {cells.map((cell, index) => {
          const isSelected = cell.dayOfWeek === selectedDow
          return (
            <button
              aria-label={formatNutritionPlanDowCellAccessibilityLabel(cell)}
              aria-pressed={isSelected}
              className={cn(
                'flex min-h-[52px] w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-control border px-1 py-1.5 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isSelected
                  ? 'border-primary bg-primary/10 dark:border-primary dark:bg-primary/15'
                  : 'border-border-subtle bg-surface-card hover:bg-surface-sunken',
                // Hoy marcado sutil, esté o no elegido (mismo patrón que la tira de seguimiento).
                cell.isToday && !isSelected ? 'ring-1 ring-primary/40' : null,
              )}
              key={cell.dayOfWeek}
              onClick={() => onSelect(cell.dayOfWeek)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              ref={(node) => {
                buttonsRef.current[index] = node
              }}
              type="button"
            >
              <span
                className={cn(
                  'text-[10px] font-bold uppercase leading-none tracking-[0.06em]',
                  isSelected ? 'text-primary' : cell.isToday ? 'text-strong' : 'text-subtle',
                )}
              >
                {cell.shortLabel}
              </span>
              <span
                className={cn(
                  'text-[11px] font-semibold leading-none tabular-nums',
                  isSelected ? 'text-primary' : cell.variant == null ? 'text-subtle' : 'text-muted',
                )}
              >
                {formatNutritionPlanDowCalories(cell.displayCalories)}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 shrink-0 rounded-full',
                  cell.isOwnDay
                    ? 'h-[6px] w-[6px] bg-primary'
                    : cell.variant == null
                      ? 'h-[5px] w-[5px] border border-dashed border-border-default'
                      : 'h-[5px] w-[5px] border border-border-default',
                )}
              />
            </button>
          )
        })}
      </div>
      {showLegend ? (
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-subtle">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-[6px] w-[6px] rounded-full bg-primary" />
            {NUTRITION_PLAN_DOW_LEGEND.own}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-[5px] w-[5px] rounded-full border border-border-default"
            />
            {NUTRITION_PLAN_DOW_LEGEND.inherited}
          </span>
        </div>
      ) : null}
    </div>
  )
}
