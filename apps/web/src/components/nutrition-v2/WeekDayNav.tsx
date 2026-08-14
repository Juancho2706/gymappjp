'use client'

import { useRef, type KeyboardEvent } from 'react'
import {
  formatNutritionWeekDayAccessibilityLabel,
  type NutritionWeekCell,
} from '@eva/nutrition-v2'
import { cn } from '@/lib/utils'

/**
 * Navegación de la semana Lu-Do de nutrición V2 — 7 chips a todo el ancho.
 *
 * Componente COMPARTIDO por las cuatro superficies web (alumno "Hoy", alumno "Plan", ficha del
 * coach) y gemelo del `WeekDayNav` de RN. Es PRESENTACIONAL PURO: recibe las celdas ya compuestas
 * por `buildNutritionWeek` (`@eva/nutrition-v2`) y avisa qué día se eligió. Quién manda ese día a
 * la URL (`?date=` / `?dow=`), a un estado local o a un fetch lo decide la superficie: acá no se
 * navega, no se pide nada y NUNCA se toca `get_nutrition_today_v2` (es `volatile`, materializa
 * snapshots y revienta con fechas futuras). La semana se pinta de datos ya descargados.
 *
 * Lectura de cada chip (mockups aprobados 2026-07-29):
 *  - inicial del día ("Lu" … "Do", diccionario compartido del paquete),
 *  - número del día del mes en `tabular-nums` (columnas que no bailan al cambiar de semana),
 *  - punto de estado abajo: verde = con registro (mismos tokens del chip "Ya registraste hoy"),
 *    neutro tenue = día pasado sin registro (sin rojo ni culpa), círculo hueco = día futuro.
 *
 * HOY siempre lleva anillo de acento aunque no esté seleccionado (mismo patrón que
 * `DayVariantWeekStrip`), y el día seleccionado se pinta con el acento primario de la marca. Los
 * dos estados son distinguibles a la vez: anillo = "hoy", relleno + borde = "estás mirando este".
 *
 * A11y: grupo con etiqueta + botones con `aria-pressed` (seleccionado), `aria-current="date"`
 * (hoy) y `aria-label` "Lunes 27, con registro" — construido con el helper compartido para no
 * duplicar el diccionario de estados. Teclado: tab + Enter/Espacio (nativo) y flechas ←/→ +
 * Inicio/Fin para mover el foco por la fila. Altura mínima 52 px (sobre el mínimo táctil de 44).
 */
export type WeekDayNavProps = {
  /** Las 7 celdas de `buildNutritionWeek`, en orden Lu → Do. */
  cells: readonly NutritionWeekCell[]
  /** Fecha `YYYY-MM-DD` del día que la superficie está mostrando. */
  selectedIso: string
  /** La superficie decide qué hacer con el día elegido (URL, estado, fetch). */
  onSelect: (isoDate: string) => void
  /** Única densidad por ahora; el union se mantiene para no romper la API al agregar otra. */
  size?: 'md'
  className?: string
  /** Etiqueta del grupo para lectores de pantalla. */
  label?: string
}

const SIZE_STYLES = {
  md: {
    chip: 'min-h-[52px] gap-0.5 px-1 py-1.5',
    weekday: 'text-[10px] leading-none',
    dayNumber: 'text-[15px] leading-none',
  },
} as const

/** Número del día del mes ("2026-07-27" → "27"). Las celdas siempre traen fecha válida. */
function dayOfMonthLabel(isoDate: string): string {
  const day = Number(isoDate.slice(8, 10))
  return Number.isFinite(day) && day > 0 ? String(day) : ''
}

/**
 * ¿El día tiene registro? El pasado ya viene resuelto en `state`; para HOY hay que mirar el
 * consumo, porque su celda es "today" tenga o no ingestas. `consumed = null` es "sin registro"
 * (≠ "registró cero"), así que no se asume nada cuando no hay dato.
 */
function hasLoggedIntake(cell: NutritionWeekCell): boolean {
  if (cell.state === 'future') return false
  if (cell.state === 'past-logged') return true
  if (cell.isLegacy === true) return true
  const consumed = cell.consumed
  if (consumed == null) return false
  return consumed.entryCount > 0 || consumed.calories > 0
}

export function WeekDayNav({
  cells,
  selectedIso,
  onSelect,
  size = 'md',
  className,
  label = 'Días de la semana',
}: WeekDayNavProps) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([])
  const styles = SIZE_STYLES[size]

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

  // Sin semana compuesta no se pinta un calendario inventado (la superficie muestra su vacío).
  if (cells.length === 0) return null

  return (
    <div aria-label={label} className={cn('grid grid-cols-7 gap-1', className)} role="group">
      {cells.map((cell, index) => {
        const isSelected = cell.isoDate === selectedIso
        const isToday = cell.state === 'today'
        // T2.7: el punto se pinta por RANGO de energia (verde adentro, ambar afuera) cuando la
        // celda trae el estado materializado; payloads viejos cacheados caen a la regla anterior.
        const dot = cell.rangeDot ?? (hasLoggedIntake(cell) ? 'logged' : 'none')

        return (
          <button
            aria-current={isToday ? 'date' : undefined}
            aria-label={formatNutritionWeekDayAccessibilityLabel({
              longLabel: `${cell.longLabel} ${dayOfMonthLabel(cell.isoDate)}`.trim(),
              state: cell.state,
            })}
            aria-pressed={isSelected}
            className={cn(
              'flex w-full min-w-0 flex-col items-center justify-center rounded-control border transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              styles.chip,
              isSelected
                ? 'border-primary bg-primary/10 dark:border-primary dark:bg-primary/15'
                : 'border-border-subtle bg-surface-card hover:bg-surface-sunken',
              // Hoy SIEMPRE marcado, esté o no seleccionado (patrón de DayVariantWeekStrip).
              isToday ? 'ring-1 ring-primary/60' : null,
            )}
            key={cell.isoDate}
            onClick={() => onSelect(cell.isoDate)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            ref={(node) => {
              buttonsRef.current[index] = node
            }}
            type="button"
          >
            <span
              className={cn(
                'font-semibold uppercase tracking-[0.06em]',
                styles.weekday,
                isSelected ? 'text-primary' : 'text-subtle',
              )}
            >
              {cell.shortLabel}
            </span>
            <span
              className={cn(
                'font-bold tabular-nums',
                styles.dayNumber,
                isSelected
                  ? 'text-primary'
                  : isToday
                    ? 'text-strong'
                    : cell.state === 'future'
                      ? 'text-muted'
                      : 'text-body',
              )}
            >
              {dayOfMonthLabel(cell.isoDate)}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 h-2 w-2 shrink-0 rounded-full',
                dot === 'in-range' || dot === 'logged'
                  ? 'bg-emerald-500 dark:bg-emerald-400'
                  : dot === 'out-of-range'
                    ? 'bg-amber-500 dark:bg-amber-400'
                    : cell.state === 'future'
                      ? 'border border-border-default'
                      : 'bg-border-default',
              )}
            />
          </button>
        )
      })}
    </div>
  )
}
