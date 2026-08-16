'use client'

/**
 * Paleta lateral del EDITOR UNICO (W3b, solo desktop `lg+`): el picker de alimentos SIEMPRE a
 * la vista, apuntando a una franja elegida del dia activo. En movil no existe — ahi el alta
 * sigue viviendo en el boton "Agregar alimento" de cada franja (sheet), que es el patron
 * thumb-zone correcto.
 *
 * Reusa el `FoodPicker` compartido en modo inline (mismo patron que el panel del wizard:
 * multiAdd + scroll DENTRO de la lista) y la porcion pegajosa via el mismo contexto.
 */

import { useContext, useEffect, useState } from 'react'
import { UtensilsCrossed } from 'lucide-react'
import { FoodPicker } from '@/app/coach/nutrition-v2/_components/food-picker/FoodPicker'
import { mapCatalogItemToFood } from '../builder/_lib/builder-view-model'
import { RememberedQuantitiesContext } from '../builder/_components/RememberedQuantitiesContext'
import { useQuickEdit, genQuickEditKey } from './QuickEditProvider'
import type { QeVariant } from '@eva/nutrition-v2'
import { QE_COPY } from './microcopy'

export function EditorPalette({ variant }: { variant: QeVariant }) {
  const { clientId, dispatch, isPending } = useQuickEdit()
  const rememberedQuantities = useContext(RememberedQuantitiesContext)
  const [slotKey, setSlotKey] = useState<string | null>(variant.slots[0]?.key ?? null)

  // Cambio de dia activo (o la franja elegida dejo de existir) → apuntar a la primera franja.
  useEffect(() => {
    if (!variant.slots.some((slot) => slot.key === slotKey)) {
      setSlotKey(variant.slots[0]?.key ?? null)
    }
  }, [variant, slotKey])

  const targetSlot = variant.slots.find((slot) => slot.key === slotKey) ?? null

  return (
    <aside className="sticky top-20 hidden max-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-card border border-border-subtle bg-surface-card p-4 lg:flex">
      <div className="flex items-center gap-2">
        <UtensilsCrossed aria-hidden="true" className="h-4 w-4 text-muted" />
        <h2 className="font-display text-base font-semibold text-strong">{QE_COPY.paletteTitle}</h2>
      </div>

      {variant.slots.length === 0 ? (
        <p className="mt-3 rounded-control border border-border-subtle bg-surface-sunken px-3 py-2.5 text-sm leading-6 text-body">
          {QE_COPY.paletteNoSlots}
        </p>
      ) : (
        <>
          <label htmlFor="editor-palette-slot" className="mt-3 block text-xs font-semibold text-muted">
            {QE_COPY.paletteSlotLabel}
          </label>
          <select
            id="editor-palette-slot"
            value={slotKey ?? ''}
            disabled={isPending}
            onChange={(event) => setSlotKey(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25"
          >
            {variant.slots.map((slot) => (
              <option key={slot.key} value={slot.key}>
                {(slot.name.trim() || 'Franja sin nombre') + (slot.startTime ? ` · ${slot.startTime}` : '')}
              </option>
            ))}
          </select>

          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
            <FoodPicker
              clientId={clientId}
              slotName={targetSlot?.name.trim() || null}
              multiAdd
              listClassName="max-h-[46vh]"
              onPick={(item) => {
                if (!targetSlot) return
                const food = mapCatalogItemToFood(item)
                dispatch({
                  type: 'ADD_CATALOG_ITEM',
                  variantKey: variant.key,
                  slotKey: targetSlot.key,
                  key: genQuickEditKey(),
                  food,
                  // Porcion pegajosa (T2.6 F4): misma memoria que el alta por franja.
                  prefill: rememberedQuantities[food.id],
                })
              }}
            />
          </div>
        </>
      )}
    </aside>
  )
}
