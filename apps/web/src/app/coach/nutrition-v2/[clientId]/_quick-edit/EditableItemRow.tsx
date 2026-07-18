'use client'

/**
 * Fila editable de un alimento prescrito — nucleo del quick-edit (§1.2.B.1):
 * cantidad tap-to-edit + steppers 44px, swap por boton explicito (bottom sheet con el
 * catalogo, conserva cantidad/unidad), eliminar con snackbar "Deshacer" (undo local del
 * draft), macros recomputadas en vivo. La unidad solo es editable cuando el item tiene
 * macros por 100 en mano (item.food, tras un swap/alta); para items hidratados queda
 * bloqueada para no inventar conversiones — el swap la desbloquea.
 */

import { useState } from 'react'
import { ArrowLeftRight, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { MacroChipRow } from '@/components/nutrition-v2/MacroChipRow'
import { BUILDER_UNITS } from '../builder/_lib/draft-builder'
import { qeItemMacros, type QeItem } from './quick-edit-state'
import { useQuickEdit } from './QuickEditProvider'
import { FoodPickerSheet } from './FoodPickerSheet'
import { StepperField } from './StepperField'
import { QE_COPY } from './microcopy'

const iconButtonClass =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-border-subtle bg-surface-card text-muted transition-colors hover:bg-surface-sunken hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function EditableItemRow({
  variantKey,
  slotKey,
  item,
  index,
}: {
  variantKey: string
  slotKey: string
  item: QeItem
  index: number
}) {
  const { clientId, dispatch, errors, showErrors, isPending } = useQuickEdit()
  const [swapOpen, setSwapOpen] = useState(false)
  const macros = qeItemMacros(item)
  const quantityError = showErrors ? errors[`item.${item.key}.quantity`] : undefined
  const nameError = showErrors ? errors[`item.${item.key}.name`] : undefined

  function handleRemove() {
    const removed = item
    dispatch({ type: 'REMOVE_ITEM', variantKey, slotKey, itemKey: item.key })
    toast(QE_COPY.deletedUndo, {
      duration: 5000,
      action: {
        label: QE_COPY.undo,
        onClick: () => dispatch({ type: 'RESTORE_ITEM', variantKey, slotKey, index, item: removed }),
      },
    })
  }

  return (
    <div className="rounded-control border border-border-subtle bg-surface-card p-2.5">
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          {item.isCustom ? (
            <>
              <input
                aria-label="Nombre del alimento libre"
                placeholder="Nombre del alimento libre"
                value={item.displayName}
                disabled={isPending}
                onChange={(event) =>
                  dispatch({ type: 'SET_ITEM_NAME', variantKey, slotKey, itemKey: item.key, value: event.target.value })
                }
                className={
                  'min-h-11 w-full rounded-control border bg-surface-card px-3 text-base text-strong outline-none transition-colors placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/25 md:text-sm ' +
                  (nameError ? 'border-rose-400 dark:border-rose-700' : 'border-border-default')
                }
              />
              {nameError ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{nameError}</p> : null}
            </>
          ) : (
            <>
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-strong">{item.displayName}</p>
              {item.brand ? <p className="mt-0.5 truncate text-xs text-muted">{item.brand}</p> : null}
            </>
          )}
          <div className="mt-1">
            <MacroChipRow
              size="sm"
              calories={macros.calories}
              proteinG={macros.proteinG}
              carbsG={macros.carbsG}
              fatsG={macros.fatsG}
            />
          </div>
        </div>
        <button
          type="button"
          aria-label={`Reemplazar ${item.displayName || 'alimento'}`}
          title="Reemplazar alimento"
          disabled={isPending}
          onClick={() => setSwapOpen(true)}
          className={iconButtonClass}
        >
          <ArrowLeftRight aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={`Eliminar ${item.displayName || 'alimento'}`}
          title="Eliminar alimento"
          disabled={isPending}
          onClick={handleRemove}
          className={iconButtonClass + ' hover:text-rose-600 dark:hover:text-rose-400'}
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <QuantityControl variantKey={variantKey} slotKey={slotKey} item={item} invalid={Boolean(quantityError)} />
        </div>
        {item.food ? (
          <select
            aria-label="Unidad"
            value={item.unit}
            disabled={isPending}
            onChange={(event) =>
              dispatch({ type: 'SET_ITEM_UNIT', variantKey, slotKey, itemKey: item.key, unit: event.target.value })
            }
            className="h-11 w-20 shrink-0 rounded-control border border-border-default bg-surface-card px-2 text-sm font-semibold text-strong outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25"
          >
            {BUILDER_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        ) : (
          <span
            title="Reemplaza el alimento desde el catalogo para cambiar la unidad"
            className="inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-control border border-border-subtle bg-surface-sunken text-sm font-semibold text-muted"
          >
            {item.unit}
          </span>
        )}
      </div>
      {quantityError ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{quantityError}</p> : null}

      <FoodPickerSheet
        open={swapOpen}
        title={`Reemplazar ${item.displayName || 'alimento'}`}
        clientId={clientId}
        onOpenChange={setSwapOpen}
        onPick={(food) => dispatch({ type: 'SWAP_ITEM_FOOD', variantKey, slotKey, itemKey: item.key, food })}
      />
    </div>
  )
}

function QuantityControl({
  variantKey,
  slotKey,
  item,
  invalid,
}: {
  variantKey: string
  slotKey: string
  item: QeItem
  invalid: boolean
}) {
  const { dispatch, isPending } = useQuickEdit()
  return (
    <StepperField
      label={`Cantidad de ${item.displayName || 'alimento'}`}
      value={item.quantity}
      suffix={item.unit}
      invalid={invalid}
      disabled={isPending}
      onChange={(value) => dispatch({ type: 'SET_ITEM_QUANTITY', variantKey, slotKey, itemKey: item.key, value })}
      onStep={(direction) => dispatch({ type: 'STEP_ITEM_QUANTITY', variantKey, slotKey, itemKey: item.key, direction })}
    />
  )
}
