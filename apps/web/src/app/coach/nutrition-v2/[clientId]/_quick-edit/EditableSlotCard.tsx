'use client'

/**
 * Franja editable del modo edicion (§1.2.B.2): nombre y hora inline en el header,
 * "+ Agregar alimento" al pie (bottom sheet con catalogo + alimento libre), eliminar
 * franja via menu "..." con confirm inline + snackbar Deshacer. Subtotal en vivo.
 * Una franja sin items es VALIDA (el RPC exige >= 1 franja, no >= 1 item): se muestra
 * "Franja sin alimentos" en vez de romperse (QA #4).
 */

import { useState } from 'react'
import { MoreVertical, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { NutritionCard } from '@/components/nutrition-v2'
import { MacroChipRow } from '@/components/nutrition-v2/MacroChipRow'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { qeSlotSubtotal, type QeSlot } from './quick-edit-state'
import { useQuickEdit, genQuickEditKey } from './QuickEditProvider'
import { EditableItemRow } from './EditableItemRow'
import { FoodPickerSheet } from './FoodPickerSheet'
import { QE_COPY } from './microcopy'

export function EditableSlotCard({
  variantKey,
  slot,
  index,
}: {
  variantKey: string
  slot: QeSlot
  index: number
}) {
  const { clientId, dispatch, errors, showErrors, isPending } = useQuickEdit()
  const [addOpen, setAddOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const subtotal = qeSlotSubtotal(slot)
  const nameError = showErrors ? errors[`slot.${slot.key}.name`] : undefined

  function handleRemoveSlot() {
    const removed = slot
    setConfirmingDelete(false)
    dispatch({ type: 'REMOVE_SLOT', variantKey, slotKey: slot.key })
    toast(QE_COPY.slotDeletedUndo, {
      duration: 5000,
      action: {
        label: QE_COPY.undo,
        onClick: () => dispatch({ type: 'RESTORE_SLOT', variantKey, index, slot: removed }),
      },
    })
  }

  return (
    <NutritionCard>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor={`qe-slot-name-${slot.key}`}>
            Nombre de la franja
          </label>
          <input
            id={`qe-slot-name-${slot.key}`}
            value={slot.name}
            disabled={isPending}
            placeholder="Desayuno, Almuerzo..."
            onChange={(event) =>
              dispatch({ type: 'UPDATE_SLOT', variantKey, slotKey: slot.key, patch: { name: event.target.value } })
            }
            className={
              'min-h-11 w-full rounded-control border bg-surface-card px-3 font-display text-base font-semibold text-strong outline-none transition-colors placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/25 ' +
              (nameError ? 'border-rose-400 dark:border-rose-700' : 'border-transparent hover:border-border-default')
            }
          />
          {nameError ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{nameError}</p> : null}
        </div>
        <div className="shrink-0">
          <label className="sr-only" htmlFor={`qe-slot-time-${slot.key}`}>
            Hora de la franja
          </label>
          <input
            id={`qe-slot-time-${slot.key}`}
            type="time"
            value={slot.startTime}
            disabled={isPending}
            onChange={(event) =>
              dispatch({ type: 'UPDATE_SLOT', variantKey, slotKey: slot.key, patch: { startTime: event.target.value } })
            }
            className="h-11 w-[6.5rem] rounded-control border border-border-default bg-surface-card px-2 text-sm font-semibold tabular-nums text-strong outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Opciones de la franja ${slot.name || 'sin nombre'}`}
            disabled={isPending}
            className="h-11 w-11 shrink-0 rounded-control border border-border-subtle bg-surface-card p-0 normal-case tracking-normal text-muted hover:bg-surface-sunken hover:text-strong dark:bg-surface-card"
          >
            <MoreVertical aria-hidden="true" className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => setConfirmingDelete(true)}>
              <Trash2 aria-hidden="true" className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              {QE_COPY.removeSlot}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {confirmingDelete ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-control border border-rose-300 bg-rose-50 px-3 py-2 dark:border-rose-800 dark:bg-rose-950/40">
          <p className="text-sm font-semibold text-rose-800 dark:text-rose-300">
            ¿Eliminar la franja {slot.name.trim() || 'sin nombre'}?
          </p>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="inline-flex min-h-9 items-center rounded-control border border-border-default bg-surface-card px-3 text-xs font-semibold text-strong hover:bg-surface-sunken"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleRemoveSlot}
              className="inline-flex min-h-9 items-center rounded-control bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700"
            >
              Eliminar
            </button>
          </span>
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {slot.items.length === 0 ? (
          <p className="rounded-control border border-dashed border-border-subtle bg-surface-sunken px-3 py-3 text-center text-sm text-muted">
            {QE_COPY.emptySlot}
          </p>
        ) : (
          slot.items.map((item, itemIndex) => (
            <EditableItemRow key={item.key} variantKey={variantKey} slotKey={slot.key} item={item} index={itemIndex} />
          ))
        )}
      </div>

      <button
        type="button"
        disabled={isPending}
        onClick={() => setAddOpen(true)}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-border-default bg-surface-card px-4 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="h-4 w-4" />
        {QE_COPY.addFood}
      </button>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-sunken px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Subtotal franja</span>
        <MacroChipRow
          size="sm"
          calories={subtotal.calories}
          proteinG={subtotal.proteinG}
          carbsG={subtotal.carbsG}
          fatsG={subtotal.fatsG}
        />
      </div>

      <FoodPickerSheet
        open={addOpen}
        title={`Agregar a ${slot.name.trim() || 'la franja'}`}
        clientId={clientId}
        allowCustom
        onOpenChange={setAddOpen}
        onPick={(food) => dispatch({ type: 'ADD_CATALOG_ITEM', variantKey, slotKey: slot.key, key: genQuickEditKey(), food })}
        onPickCustom={() => dispatch({ type: 'ADD_CUSTOM_ITEM', variantKey, slotKey: slot.key, key: genQuickEditKey() })}
      />
    </NutritionCard>
  )
}
