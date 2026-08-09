'use client'

/**
 * Bloque opcional "Equivalencia de porciones" del alta/edición de alimentos del coach
 * (clasificar alimentos propios — specs/nutrition-custom-portions §P-B).
 *
 * Colapsado por defecto: la enorme mayoría de las altas no clasifica nada, y el bloque solo
 * tiene sentido para el coach que trabaja con "porciones a elección". Al expandirlo pide el
 * grupo (system + propios, mismo catálogo que el `PortionsGroupPicker` del builder), los
 * gramos que equivalen a 1 porción y una medida casera opcional.
 *
 * Emite los tres valores por `name` de formulario (`exchange_group_id`,
 * `exchange_portion_grams`, `exchange_portion_label`) para que el `<form action={...}>`
 * los mande sin estado extra. El servidor re-valida el trío junto-o-nada y que el grupo
 * sea VISIBLE para el coach: acá no hay autorización, solo UX.
 */

import { useId, useState } from 'react'
import { ChevronDown, Scale } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'

const COPY = PORTIONS_COPY.foodEquivalence

/** Subconjunto del `ExchangeGroup` que necesita el selector (el resto no se muestra acá). */
export type FoodEquivalenceGroupOption = {
  id: string
  code: string
  name: string
  isSystem: boolean
}

export type FoodEquivalenceValue = {
  groupId: string
  grams: string
  label: string
}

export const EMPTY_FOOD_EQUIVALENCE: FoodEquivalenceValue = { groupId: '', grams: '', label: '' }

const labelClass = 'text-[10px] font-black uppercase tracking-widest text-muted-foreground'

/**
 * Preview de lo que verá el alumno en el sheet de equivalencias. Se muestra solo cuando el
 * par grupo+gramos está completo (con gramos vacíos el texto mentiría).
 */
export function foodEquivalencePreview(
  value: FoodEquivalenceValue,
  groups: FoodEquivalenceGroupOption[]
): string | null {
  const group = groups.find((g) => g.id === value.groupId)
  const grams = Number(value.grams.replace(',', '.'))
  if (!group || !Number.isFinite(grams) || grams <= 0) return null
  const medida = value.label.trim()
  return COPY.preview(group.name, String(grams), medida.length > 0 ? medida : null)
}

export function FoodEquivalenceFields({
  value,
  onChange,
  groups,
  groupsError,
  disabled,
  /** Con `false` el bloque no renderiza inputs con `name` (el form no manda nada). */
  emitFormFields = true,
  /** El alta arranca colapsada (caso mayoritario); el flujo "Clasificar" arranca abierto. */
  defaultExpanded = false,
}: {
  value: FoodEquivalenceValue
  onChange: (next: FoodEquivalenceValue) => void
  groups: FoodEquivalenceGroupOption[]
  groupsError?: string | null
  disabled?: boolean
  emitFormFields?: boolean
  defaultExpanded?: boolean
}) {
  const hasValue = value.groupId !== '' || value.grams !== '' || value.label !== ''
  const [expanded, setExpanded] = useState(defaultExpanded || hasValue)
  const groupFieldId = useId()
  const gramsFieldId = useId()
  const labelFieldId = useId()
  const preview = foodEquivalencePreview(value, groups)

  function collapse() {
    setExpanded(false)
    onChange(EMPTY_FOOD_EQUIVALENCE)
  }

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-3">
      <button
        type="button"
        onClick={() => (expanded ? collapse() : setExpanded(true))}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 text-left min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
      >
        <Scale className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className={labelClass + ' block'}>{COPY.sectionTitle}</span>
          <span className="block text-[11px] text-muted-foreground leading-snug">{COPY.sectionHint}</span>
        </span>
        <ChevronDown
          className={'w-4 h-4 shrink-0 text-muted-foreground transition-transform ' + (expanded ? 'rotate-180' : '')}
          aria-hidden
        />
      </button>

      {expanded ? (
        <div className="space-y-3">
          {groupsError ? (
            <p className="text-[11px] text-[var(--cta-danger)]">{groupsError}</p>
          ) : groups.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">{COPY.groupsEmpty}</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label className={labelClass} htmlFor={groupFieldId}>
                  {COPY.groupLabel}
                </Label>
                <select
                  id={groupFieldId}
                  disabled={disabled}
                  value={value.groupId}
                  onChange={(e) => onChange({ ...value, groupId: e.target.value })}
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <option value="">{COPY.groupPlaceholder}</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.code} · {group.name}
                      {group.isSystem ? '' : ' (tuyo)'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-[1fr_1fr] gap-2">
                <div className="space-y-2">
                  <Label className={labelClass} htmlFor={gramsFieldId}>
                    {COPY.gramsLabel}
                  </Label>
                  <Input
                    id={gramsFieldId}
                    type="number"
                    min={1}
                    step="1"
                    inputMode="numeric"
                    disabled={disabled}
                    placeholder={COPY.gramsPlaceholder}
                    className="h-11 rounded-xl"
                    value={value.grams}
                    onChange={(e) => onChange({ ...value, grams: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass} htmlFor={labelFieldId}>
                    {COPY.labelLabel}
                  </Label>
                  <Input
                    id={labelFieldId}
                    maxLength={40}
                    disabled={disabled}
                    placeholder={COPY.labelPlaceholder}
                    className="h-11 rounded-xl"
                    value={value.label}
                    onChange={(e) => onChange({ ...value, label: e.target.value })}
                  />
                </div>
              </div>

              {preview ? <p className="text-[11px] text-muted-foreground">{preview}</p> : null}

              <button
                type="button"
                onClick={collapse}
                className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground min-h-9"
              >
                {COPY.collapse}
              </button>
            </>
          )}
        </div>
      ) : null}

      {emitFormFields ? (
        <>
          <input type="hidden" name="exchange_group_id" value={expanded ? value.groupId : ''} />
          <input type="hidden" name="exchange_portion_grams" value={expanded ? value.grams : ''} />
          <input type="hidden" name="exchange_portion_label" value={expanded ? value.label : ''} />
        </>
      ) : null}
    </div>
  )
}
