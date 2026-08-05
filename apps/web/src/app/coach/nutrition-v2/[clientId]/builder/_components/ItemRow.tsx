'use client'

import { Trash2 } from 'lucide-react'
// Import por ruta directa (no via el barrel index.ts): desacopla del orden de edicion de otros
// modulos y respeta el contrato del componente MacroChipRow.
import { MacroChipRow } from '@/components/nutrition-v2/MacroChipRow'
import type { FoodCatalogItem } from '@eva/nutrition-v2'
import { BUILDER_UNITS, itemMacros, type BuilderItem } from '../_lib/draft-builder'
import type { Dispatch } from '../_lib/builder-view-model'
import { iconButtonClass, inputClass } from '../_lib/builder-ui-classes'
import { foodCategoryIconUrlFromName, resolveFoodImageUrl } from './food-card-presentation'
import { foodCategoryIconUrl } from '@/lib/food-image'
import { FoodThumb } from './FoodImage'
import { FreeFoodFields } from './FreeFoodFields'
import { SubstitutionsField } from './SubstitutionsField'

const SUPABASE_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null

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

export function ItemRow({
  item,
  variantKey,
  slotKey,
  clientId,
  dispatch,
  error,
}: {
  item: BuilderItem
  variantKey: string
  slotKey: string
  clientId: string
  dispatch: Dispatch
  error?: { food?: string; quantity?: string }
}) {
  const unitOptions = item.food ? BUILDER_UNITS : (['g', 'ml'] as const)
  const displayName = item.food ? item.food.name : item.customName
  const imageUrl = item.food ? resolveFoodImageUrl(item.food.media as FoodCatalogItem['media'], SUPABASE_BASE) : null
  const iconUrl = item.food ? foodCategoryIconUrl(item.food.category) : foodCategoryIconUrlFromName(item.customName)
  return (
    <div className="rounded-control border border-border-subtle bg-surface-card p-2.5">
      <div className="flex items-start gap-2.5">
        <FoodThumb imageUrl={imageUrl} iconUrl={iconUrl} alt={displayName || 'Alimento'} />
        <div className="min-w-0 flex-1">
          {item.food ? (
            <>
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-strong">{item.food.name}</p>
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
        <button
          type="button"
          aria-label={`Quitar ${displayName || 'alimento'}`}
          onClick={() => dispatch({ type: 'REMOVE_ITEM', variantKey, slotKey, itemKey: item.key })}
          className={iconButtonClass + ' shrink-0'}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          className={inputClass + ' max-w-32'}
          inputMode="decimal"
          aria-label="Cantidad"
          placeholder="Cantidad"
          value={item.quantity}
          onChange={(e) =>
            dispatch({ type: 'UPDATE_ITEM', variantKey, slotKey, itemKey: item.key, patch: { quantity: e.target.value } })
          }
        />
        <select
          className={inputClass + ' max-w-24'}
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

      {error?.food ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{error.food}</p> : null}
      {error?.quantity ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{error.quantity}</p> : null}
    </div>
  )
}
