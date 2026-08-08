'use client'

import { useState } from 'react'
import { MoreVertical, MoveRight, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
// Import por ruta directa (no via el barrel index.ts): desacopla del orden de edicion de otros
// modulos y respeta el contrato del componente MacroChipRow.
import { MacroChipRow } from '@/components/nutrition-v2/MacroChipRow'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { FoodCatalogItem } from '@eva/nutrition-v2'
import { BUILDER_UNITS, itemMacros, type BuilderItem, type BuilderSlot } from '../_lib/draft-builder'
import { stepCountedQuantity } from '../_lib/quantity-format'
import type { Dispatch } from '../_lib/builder-view-model'
import { inputClass } from '../_lib/builder-ui-classes'
import { foodCategoryIconUrlFromName, resolveFoodImageUrl } from './food-card-presentation'
import { foodCategoryIconUrl } from '@/lib/food-image'
import { FoodThumb } from './FoodImage'
import { FoodMacrosOverrideDialog } from './FoodMacrosOverrideDialog'
import { FreeFoodFields } from './FreeFoodFields'
import { ItemQuantityField } from './ItemQuantityField'
import { SubstitutionsField } from './SubstitutionsField'

const SUPABASE_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null

/** Ventana del Deshacer de las bajas de item (BD4). Más larga que la de días/franjas a propósito:
 *  quitar un alimento es el gesto que más se hace de corrido y el que menos se mira. */
const UNDO_TOAST_MS = 8000

const menuTriggerClass =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border-0 bg-transparent p-0 normal-case tracking-normal text-muted transition-colors hover:bg-surface-sunken hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-transparent'

function PortionMacros({ item }: { item: BuilderItem }) {
  const m = itemMacros(item)
  // Apilado debajo del nombre (dentro del contenedor flex-1), en su propia fila:
  // las macros ocupan el ancho completo y no compiten horizontalmente con el nombre.
  return (
    <div className="mt-1">
      <MacroChipRow
        size="sm"
        calories={m.calories}
        proteinG={m.proteinG}
        carbsG={m.carbsG}
        fatsG={m.fatsG}
      />
    </div>
  )
}

/** "Almuerzo · 13:30" / "Franja sin nombre" — cómo se lee una franja destino en el menú "Mover a…". */
function slotOptionLabel(slot: BuilderSlot): string {
  const name = slot.name.trim() || 'Franja sin nombre'
  return slot.startTime ? name + ' · ' + slot.startTime : name
}

export function ItemRow({
  item,
  index,
  variantKey,
  slotKey,
  daySlots,
  clientId,
  dispatch,
  error,
}: {
  item: BuilderItem
  /** Posición dentro de la franja: la necesita el Deshacer para reinsertarlo donde estaba. */
  index: number
  variantKey: string
  slotKey: string
  /** Franjas del día en pantalla: alimentan "Mover a otra franja" (BD7). */
  daySlots: readonly BuilderSlot[]
  clientId: string
  dispatch: Dispatch
  error?: { food?: string; quantity?: string }
}) {
  const unitOptions = item.food ? BUILDER_UNITS : (['g', 'ml'] as const)
  const displayName = item.food ? item.food.name : item.customName
  const imageUrl = item.food ? resolveFoodImageUrl(item.food.media as FoodCatalogItem['media'], SUPABASE_BASE) : null
  // Sin `category` (alimento custom del coach, snapshot viejo) se deriva del NOMBRE antes de
  // caer al icono generico de cubiertos: "Pechuga de pollo" merece el icono de proteina igual.
  const iconUrl = item.food
    ? item.food.category
      ? foodCategoryIconUrl(item.food.category)
      : foodCategoryIconUrlFromName(item.food.name)
    : foodCategoryIconUrlFromName(item.customName)
  const itemLabel = displayName || 'alimento'
  const moveTargets = daySlots.filter((slot) => slot.key !== slotKey)
  const [macrosOpen, setMacrosOpen] = useState(false)

  /**
   * Quitar = optimista + Deshacer (BD4). Cero confirms: preguntar por cada alimento en una
   * pantalla donde se quitan cinco seguidos es peor que poder deshacer el único que sobró.
   * El item y su índice se capturan ANTES del dispatch y viajan cerrados en el callback, así que
   * el Deshacer reinserta exactamente donde estaba aunque se toque segundos después.
   */
  function handleRemove() {
    const removed = item
    const removedIndex = index
    dispatch({ type: 'REMOVE_ITEM', variantKey, slotKey, itemKey: item.key })
    toast('Alimento quitado', {
      duration: UNDO_TOAST_MS,
      action: {
        label: 'Deshacer',
        onClick: () =>
          dispatch({ type: 'RESTORE_ITEM', variantKey, slotKey, index: removedIndex, item: removed }),
      },
    })
  }

  /** Mover a otra franja del MISMO día, con Deshacer que lo devuelve a su posición exacta. */
  function handleMove(target: BuilderSlot) {
    const fromIndex = index
    dispatch({ type: 'MOVE_ITEM', variantKey, fromSlotKey: slotKey, toSlotKey: target.key, itemKey: item.key })
    toast(`${displayName || 'Alimento'} se movió a ${target.name.trim() || 'la otra franja'}`, {
      duration: UNDO_TOAST_MS,
      action: {
        label: 'Deshacer',
        onClick: () =>
          dispatch({
            type: 'MOVE_ITEM',
            variantKey,
            fromSlotKey: target.key,
            toSlotKey: slotKey,
            itemKey: item.key,
            toIndex: fromIndex,
          }),
      },
    })
  }

  return (
    <div className="rounded-control border border-border-subtle bg-surface-card p-2.5">
      <div className="flex items-start gap-2.5">
        <FoodThumb imageUrl={imageUrl} iconUrl={iconUrl} alt={displayName || 'Alimento'} />
        <div className="min-w-0 flex-1">
          {item.food ? (
            <>
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-strong">
                {item.food.name}
                {/* Badge ✎: este alimento lleva TUS macros, no los del catálogo. Va pegado al
                    nombre porque es una propiedad del alimento, no de esta fila del plan. */}
                {item.food.hasOverride ? (
                  <span
                    className="ml-1.5 inline-flex items-center align-middle text-primary"
                    title="Corregiste los macros de este alimento"
                  >
                    <Pencil aria-hidden="true" className="h-3 w-3" />
                    <span className="sr-only">Macros corregidos por ti</span>
                  </span>
                ) : null}
              </p>
              {item.food.brand ? <p className="mt-0.5 truncate text-xs text-muted">{item.food.brand}</p> : null}
            </>
          ) : (
            <input
              className={inputClass}
              aria-label="Nombre del alimento libre"
              placeholder="Nombre del alimento libre"
              value={item.customName ?? ''}
              onChange={(e) =>
                dispatch({ type: 'UPDATE_ITEM', variantKey, slotKey, itemKey: item.key, patch: { customName: e.target.value } })
              }
            />
          )}
          <PortionMacros item={item} />
        </div>
        {/* Menú ⋮ (BD7): agrupa lo que antes era un botón suelto de basurero y suma "Mover a…".
            Con una sola franja en el día la opción vive igual, deshabilitada: la capacidad se
            descubre antes de necesitarla. */}
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={`Opciones de ${itemLabel}`} className={menuTriggerClass}>
            <MoreVertical aria-hidden="true" className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {/* Solo para alimentos del catálogo: un alimento libre ya tiene sus macros
                editables en la propia fila, no hay nada que corregir "del catálogo". */}
            {item.food ? (
              <>
                <DropdownMenuItem onClick={() => setMacrosOpen(true)}>
                  <Pencil aria-hidden="true" className="h-4 w-4" />
                  Corregir macros…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={moveTargets.length === 0}>Mover a…</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                {moveTargets.map((target) => (
                  <DropdownMenuItem key={target.key} onClick={() => handleMove(target)}>
                    <MoveRight aria-hidden="true" className="h-4 w-4" />
                    {slotOptionLabel(target)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={handleRemove}>
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              Quitar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          {/* Híbrido por unidad (BD6): input libre en g/ml, steppers ±0,5 en porciones. */}
          <ItemQuantityField
            label={`Cantidad de ${itemLabel}`}
            value={item.quantity}
            unit={item.unit}
            invalid={Boolean(error?.quantity)}
            onChange={(value) =>
              dispatch({ type: 'UPDATE_ITEM', variantKey, slotKey, itemKey: item.key, patch: { quantity: value } })
            }
            onStep={(direction) =>
              dispatch({
                type: 'UPDATE_ITEM',
                variantKey,
                slotKey,
                itemKey: item.key,
                patch: { quantity: stepCountedQuantity(item.quantity, direction) },
              })
            }
          />
        </div>
        {/* Clases propias (no `inputClass`): ese preset trae `w-full` y pelearia con el ancho
            fijo de la unidad dentro de la fila flex. */}
        <select
          className="h-11 w-20 shrink-0 rounded-control border border-border-default bg-surface-card px-2 text-sm font-semibold text-strong outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25"
          aria-label="Unidad"
          value={item.unit}
          onChange={(e) =>
            dispatch({
              type: 'UPDATE_ITEM',
              variantKey,
              slotKey,
              itemKey: item.key,
              patch: { unit: e.target.value as BuilderItem['unit'] },
            })
          }
        >
          {unitOptions.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>

      {!item.food ? (
        <FreeFoodFields item={item} variantKey={variantKey} slotKey={slotKey} clientId={clientId} dispatch={dispatch} />
      ) : null}

      <SubstitutionsField item={item} variantKey={variantKey} slotKey={slotKey} clientId={clientId} dispatch={dispatch} />

      {item.food && macrosOpen ? (
        <FoodMacrosOverrideDialog
          food={item.food}
          // El builder de PLANTILLAS trabaja sin alumno: ahí no hay ficha que revalidar y el
          // contrato de la action pide uuid o null, nunca una cadena vacía.
          clientId={clientId || null}
          open={macrosOpen}
          onOpenChange={setMacrosOpen}
          onApplied={(macros) =>
            // La corrección es del ALIMENTO: se aplica a todas sus apariciones del borrador,
            // no solo a esta fila. Ver `APPLY_FOOD_OVERRIDE` en el reducer.
            dispatch({ type: 'APPLY_FOOD_OVERRIDE', foodId: item.food!.id, macros })
          }
        />
      ) : null}

      {error?.food ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{error.food}</p> : null}
      {error?.quantity ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{error.quantity}</p> : null}
    </div>
  )
}
