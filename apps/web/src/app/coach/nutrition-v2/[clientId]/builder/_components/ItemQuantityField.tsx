'use client'

/**
 * Cantidad de un item prescrito — control HÍBRIDO por unidad (BD6). Presentacional puro: no
 * conoce reducers, así que lo montan igual el creador (`ItemRow`) y la edición rápida
 * (`EditableItemRow`), cada uno con su despacho.
 *
 *  - g / ml  -> input libre `inputmode="decimal"`. Steppers de ±1 g serían inútiles (nadie ajusta
 *              arroz de gramo en gramo) y de ±5 mienten sobre la precisión que el coach quiere.
 *  - un      -> steppers ±0,5 con el valor en fracciones (½, 1, 1½, 2) y tap-to-edit para saltar
 *              a un valor cualquiera. El `−` se DESHABILITA visible en media porción: el piso
 *              tiene que leerse antes de tocarlo (bajar de ahí es quitar el alimento, que tiene
 *              su propia acción con Deshacer).
 *
 * Todos los objetivos táctiles son de 44px (h-11). La regla de unidad y el formato de fracciones
 * viven en `_lib/quantity-format` (puro y testeado); acá solo hay UI.
 */

import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import {
  canStepCountedQuantity,
  formatCountedQuantity,
  isCountedUnit,
} from '../_lib/quantity-format'

const stepButtonClass =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-border-default bg-surface-card text-strong transition-colors hover:bg-surface-sunken active:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40'

export function ItemQuantityField({
  label,
  value,
  unit,
  invalid = false,
  disabled = false,
  onChange,
  onStep,
  className,
}: {
  /** Etiqueta accesible ("Cantidad de Avena"): el control no siempre tiene label visible. */
  label: string
  value: string
  /** Unidad vigente del item: decide la afordancia (`isCountedUnit`). */
  unit: string
  invalid?: boolean
  disabled?: boolean
  onChange: (value: string) => void
  /** Solo se invoca en unidades contadas (porción/unidad). */
  onStep: (direction: 1 | -1) => void
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const counted = isCountedUnit(unit)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  // Cambiar de unidad con el tap-to-edit abierto dejaría un input flotando sobre una fila que ya
  // no tiene steppers: se cierra solo.
  useEffect(() => {
    if (!counted) setEditing(false)
  }, [counted])

  const fieldClass =
    'h-11 w-full min-w-0 rounded-control border bg-surface-card px-3 text-base tabular-nums text-strong outline-none transition-colors focus:ring-2 focus:ring-primary/25 md:text-sm ' +
    (invalid ? 'border-rose-400 dark:border-rose-700' : 'border-border-default')

  if (!counted) {
    return (
      <input
        aria-label={label}
        inputMode="decimal"
        placeholder="Cantidad"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass + ' ' + (className ?? '')}
      />
    )
  }

  return (
    <div className={'flex items-center gap-1.5 ' + (className ?? '')}>
      <button
        type="button"
        aria-label={`Disminuir ${label}`}
        disabled={disabled || !canStepCountedQuantity(value, -1)}
        onClick={() => onStep(-1)}
        className={stepButtonClass}
      >
        <Minus aria-hidden="true" className="h-4 w-4" />
      </button>
      {editing ? (
        <input
          ref={inputRef}
          aria-label={label}
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Escape') {
              event.preventDefault()
              setEditing(false)
            }
          }}
          className={
            'h-11 w-full min-w-0 flex-1 rounded-control border bg-surface-card px-2 text-center text-base font-semibold tabular-nums text-strong outline-none transition-colors focus:ring-2 focus:ring-primary/25 ' +
            (invalid ? 'border-rose-400 dark:border-rose-700' : 'border-primary')
          }
        />
      ) : (
        <button
          type="button"
          aria-label={`Editar ${label}`}
          disabled={disabled}
          onClick={() => setEditing(true)}
          className={
            'h-11 w-full min-w-0 flex-1 rounded-control border bg-surface-card px-2 text-center text-base font-semibold tabular-nums text-strong transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
            (invalid ? 'border-rose-400 dark:border-rose-700' : 'border-border-default')
          }
        >
          {formatCountedQuantity(value)}
        </button>
      )}
      <button
        type="button"
        aria-label={`Aumentar ${label}`}
        disabled={disabled || !canStepCountedQuantity(value, 1)}
        onClick={() => onStep(1)}
        className={stepButtonClass}
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  )
}
