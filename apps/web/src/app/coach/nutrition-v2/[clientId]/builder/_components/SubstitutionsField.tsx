'use client'

import { useState } from 'react'
import { Plus, Repeat, X } from 'lucide-react'
import { FoodPicker } from '@/app/coach/nutrition-v2/_components/food-picker/FoodPicker'
import { MAX_ITEM_SUBSTITUTIONS, type BuilderItem } from '../_lib/draft-builder'
import { genId, mapCatalogItemToFood, type Dispatch } from '../_lib/builder-view-model'
import { secondaryButtonClass } from '@/app/coach/nutrition-v2/_lib/builder-ui-classes'
import { useIsTemplateMode } from './TemplateModeContext'

// Reemplazos autorizados por el coach (F-02): afordancia compacta bajo cada item prescrito.
// "+ Reemplazo" abre el MISMO picker de alimentos unificado del coach (FoodPicker) y agrega el
// alimento elegido como chip removible (tope MAX_ITEM_SUBSTITUTIONS). Solo se monta dentro
// de ItemRow, que a su vez solo existe en structured/hybrid (SlotEditor). El alumno vera
// estas opciones; el server congela el snapshot de cada reemplazo al publicar.
export function SubstitutionsField({
  item,
  variantKey,
  slotKey,
  clientId,
  dispatch,
}: {
  item: BuilderItem
  variantKey: string
  slotKey: string
  clientId: string
  dispatch: Dispatch
}) {
  const [open, setOpen] = useState(false)
  const templateMode = useIsTemplateMode()
  const subs = item.substitutions ?? []
  const atCap = subs.length >= MAX_ITEM_SUBSTITUTIONS
  const prescribedName = item.food ? item.food.name : (item.customName?.trim() || 'este alimento')

  return (
    <div className="mt-2 border-t border-border-subtle pt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <Repeat aria-hidden="true" className="h-3.5 w-3.5" />
          Reemplazos autorizados
        </span>
        {subs.length > 0 ? (
          <span className="font-mono text-[11px] tabular-nums text-subtle">
            {subs.length}/{MAX_ITEM_SUBSTITUTIONS}
          </span>
        ) : null}
      </div>

      {subs.length > 0 ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {subs.map((sub) => (
            <li
              key={sub.key}
              className="inline-flex max-w-full items-center gap-1 rounded-pill border border-border-subtle bg-surface-sunken py-0.5 pl-2.5 pr-1 text-xs text-body"
            >
              <span className="min-w-0 truncate">{sub.food.name}</span>
              <button
                type="button"
                aria-label={`Quitar reemplazo ${sub.food.name}`}
                onClick={() => dispatch({ type: 'REMOVE_ITEM_SUBSTITUTION', variantKey, slotKey, itemKey: item.key, subKey: sub.key })}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-card hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[11px] leading-snug text-subtle">
          Alimentos que el alumno puede usar en lugar de {prescribedName}.
        </p>
      )}

      {atCap ? (
        <p className="mt-1.5 text-[11px] text-subtle">Alcanzaste el maximo de {MAX_ITEM_SUBSTITUTIONS} reemplazos.</p>
      ) : open ? (
        <div className="mt-2 space-y-2 rounded-control border border-border-subtle bg-surface-sunken p-3">
          {/* Un reemplazo por vez: elegir CIERRA el buscador (mismo gesto que el swap del
              modo edición). El multi-add es para llenar una franja, no para esta capa. */}
          <FoodPicker
            clientId={templateMode ? null : clientId}
            autoFocus
            listClassName="max-h-[22rem]"
            onPick={(catalogItem) =>
              dispatch({
                type: 'ADD_ITEM_SUBSTITUTION',
                variantKey,
                slotKey,
                itemKey: item.key,
                key: genId(),
                food: mapCatalogItemToFood(catalogItem),
              })
            }
            onDone={() => setOpen(false)}
          />
          <button type="button" onClick={() => setOpen(false)} className={secondaryButtonClass + ' min-h-9 px-3 text-xs'}>
            Cerrar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={secondaryButtonClass + ' mt-1.5 min-h-9 px-3 text-xs'}
        >
          <Plus className="h-3.5 w-3.5" />
          Reemplazo
        </button>
      )}
    </div>
  )
}
