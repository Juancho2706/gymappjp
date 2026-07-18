'use client'

/**
 * Control numerico tap-to-edit + steppers −/+ (44px) del modo edicion. NUNCA slider
 * (benchmark NN/g / MacroFactor): tocar el valor lo convierte en <input inputmode="decimal">
 * con el valor seleccionado; Enter/blur confirma. Los steppers aceleran con el paso dado.
 * Tokens del DS (cero crudos), light/dark, thumb-zone.
 */

import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'

const stepButtonClass =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-border-default bg-surface-card text-strong transition-colors hover:bg-surface-sunken active:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40'

export function StepperField({
  label,
  value,
  suffix,
  invalid = false,
  disabled = false,
  onChange,
  onStep,
  className,
}: {
  /** Etiqueta accesible del campo (ej. "Cantidad de Avena", "Calorias objetivo"). */
  label: string
  value: string
  /** Sufijo visual dentro del valor (unidad: "g", "kcal"...). */
  suffix?: string
  invalid?: boolean
  disabled?: boolean
  onChange: (value: string) => void
  onStep: (direction: 1 | -1) => void
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  return (
    <div className={'flex items-center gap-1.5 ' + (className ?? '')}>
      <button
        type="button"
        aria-label={`Disminuir ${label}`}
        disabled={disabled}
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
          {value.trim() === '' ? '—' : value}
          {suffix ? <span className="ml-1 text-xs font-medium text-muted">{suffix}</span> : null}
        </button>
      )}
      <button
        type="button"
        aria-label={`Aumentar ${label}`}
        disabled={disabled}
        onClick={() => onStep(1)}
        className={stepButtonClass}
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  )
}
