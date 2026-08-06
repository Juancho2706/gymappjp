'use client'

import { useId, useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { NutritionCard } from '@/components/nutrition-v2'
import { FoodPicker } from '@/app/coach/nutrition-v2/_components/food-picker/FoodPicker'
// Import por ruta directa (no via el barrel index.ts): desacopla del orden de edicion de otros
// modulos y respeta el contrato del componente MacroChipRow.
import { MacroChipRow } from '@/components/nutrition-v2/MacroChipRow'
import { slotSubtotal, type BuilderSlot, type BuilderVariant } from '../_lib/draft-builder'
import { genId, mapCatalogItemToFood, type Dispatch, type SlotCopyRequest } from '../_lib/builder-view-model'
import {
  iconButtonClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
} from '../_lib/builder-ui-classes'
import { PortionsSection, type PortionsController } from './PortionsSection'
import { combineSubtotals, portionsKey, slotPortionTotals } from './portions-state'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import { CopySlotMenu } from './CopySlotMenu'
import { ItemRow } from './ItemRow'
import { useIsTemplateMode } from './TemplateModeContext'

export function SlotEditor({
  slot,
  variantKey,
  variants,
  daySlots,
  clientId,
  dispatch,
  errors,
  portions,
  dayRemaining = null,
  onCopySlot,
}: {
  slot: BuilderSlot
  /** Día (variante) al que pertenece la franja: toda mutación viaja scoped a él. */
  variantKey: string
  /** Días del plan: con más de uno aparece el menú "Copiar a otros días". */
  variants: BuilderVariant[]
  /** Franjas del día en pantalla: destinos de "Mover a otra franja" del menú del item (BD7). */
  daySlots: readonly BuilderSlot[]
  clientId: string
  dispatch: Dispatch
  errors: Record<string, string>
  portions: PortionsController
  /** Lo que resta del día contra sus metas; alimenta la barra viva del picker. */
  dayRemaining?: { calories: number; proteinG: number } | null
  onCopySlot: (request: SlotCopyRequest) => void
}) {
  // El picker vive detrás de "Agregar alimento": abierto se queda abierto mientras el coach
  // suma varios ("Listo (n)" lo cierra). Antes el buscador estaba siempre desplegado en cada
  // franja, así que un plan de 5 franjas mostraba 5 buscadores compitiendo por la pantalla.
  const [pickerOpen, setPickerOpen] = useState(false)
  // Colapsar la franja (QA owner 08-05): un plan de 5-6 franjas obliga a scrollear medio metro
  // para llegar a la de abajo. Contraida deja el resumen que el coach necesita para orientarse
  // —nombre, hora y subtotal con los macros completos— y nada mas. Estado LOCAL y por defecto
  // expandida: el creador no recuerda pliegues entre sesiones ni entre dias.
  const [collapsed, setCollapsed] = useState(false)
  const bodyId = useId()
  // Modo plantilla: no hay alumno que autorizar ni historial que sugerir.
  const templateMode = useIsTemplateMode()
  // Fix QA F1-2: el subtotal de franja combina items fijos + derivado de porciones
  // (Σ porciones × ref del grupo, catálogo VIVO del picker). Catálogo sin cargar o
  // franja sin porciones ⇒ solo items, idéntico a antes (sin NaN jamás).
  // Multi-día: la clave de porciones es `variantKey::slotKey` — dos días con una franja
  // homónima ("Almuerzo" clonado) ya no comparten porciones.
  const portionsSlotKey = portionsKey(variantKey, slot.key)
  const itemsSubtotal = slotSubtotal(slot)
  const portionTotals = slotPortionTotals(portions.bySlot, portionsSlotKey, portions.groups)
  const subtotal = combineSubtotals(itemsSubtotal, portionTotals)
  // El menú de copia solo tiene sentido con más de un día en el plan.
  const canCopyToOtherDays = variants.length > 1
  const slotTitle = slot.name.trim() || 'Franja sin nombre'

  return (
    <NutritionCard>
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-controls={bodyId}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expandir ${slotTitle}` : `Contraer ${slotTitle}`}
          onClick={() => setCollapsed((previous) => !previous)}
          className={iconButtonClass + ' inline-flex h-11 w-11 shrink-0 items-center justify-center self-center'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {collapsed ? (
          // Contraida: nombre + hora + el MISMO subtotal (items + porciones) con los cuatro
          // macros, para poder comparar franjas sin expandir ninguna.
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1 self-center">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-strong">
              {slotTitle}
              {slot.startTime ? (
                <span className="ml-2 font-normal tabular-nums text-muted">{slot.startTime}</span>
              ) : null}
            </p>
            <MacroChipRow
              size="sm"
              calories={subtotal.calories}
              proteinG={subtotal.proteinG}
              carbsG={subtotal.carbsG}
              fatsG={subtotal.fatsG}
            />
          </div>
        ) : (
          /* Fix QA F1-2: grid con filas label/control — los dos labels comparten la fila 1
             (bottom-aligned) y los controles la fila 2, así HORA queda alineada con NOMBRE
             aunque el label largo envuelva a dos líneas en 360 px. */
          <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_auto] items-end gap-x-2">
            <label className={labelClass} htmlFor={`slot-name-${slot.key}`}>Nombre de la franja</label>
            <label className={labelClass} htmlFor={`slot-time-${slot.key}`}>Hora</label>
            <span aria-hidden="true" />
            <input
              id={`slot-name-${slot.key}`}
              className={inputClass}
              placeholder="Desayuno, Almuerzo..."
              value={slot.name}
              onChange={(e) => dispatch({ type: 'UPDATE_SLOT', variantKey, slotKey: slot.key, patch: { name: e.target.value } })}
            />
            <input
              id={`slot-time-${slot.key}`}
              className={inputClass + ' w-28'}
              type="time"
              value={slot.startTime}
              onChange={(e) =>
                dispatch({ type: 'UPDATE_SLOT', variantKey, slotKey: slot.key, patch: { startTime: e.target.value } })
              }
            />
            <button
              type="button"
              aria-label={`Quitar franja ${slot.name || 'sin nombre'}`}
              onClick={() => dispatch({ type: 'REMOVE_SLOT', variantKey, slotKey: slot.key })}
              className={iconButtonClass + ' inline-flex h-11 w-11 items-center justify-center self-center'}
            >
              <Trash2 className="h-4 w-4" />
            </button>
            {errors['slot.' + slot.key + '.name'] ? (
              <p className="col-span-full mt-1 text-xs text-rose-600 dark:text-rose-300">{errors['slot.' + slot.key + '.name']}</p>
            ) : null}
          </div>
        )}
      </div>

      {collapsed ? null : (
        <div id={bodyId}>
          <div className="mt-3 space-y-2">
            {slot.items.map((item, itemIndex) => (
              <ItemRow
                key={item.key}
                item={item}
                index={itemIndex}
                variantKey={variantKey}
                slotKey={slot.key}
                daySlots={daySlots}
                clientId={clientId}
                dispatch={dispatch}
                error={{ food: errors['item.' + item.key + '.food'], quantity: errors['item.' + item.key + '.quantity'] }}
              />
            ))}
          </div>

          <div className="mt-3">
            {pickerOpen ? (
              <div className="rounded-control border border-border-subtle bg-surface-sunken p-3">
                <FoodPicker
                  clientId={templateMode ? null : clientId}
                  slotName={slot.name.trim() || null}
                  multiAdd
                  autoFocus
                  allowCustom
                  // El scroll vive DENTRO de la lista (QA CEO 08-04), no en la página.
                  listClassName="max-h-[26rem] md:max-h-[22rem]"
                  summary={{
                    slotLabel: slot.name.trim() || 'Franja',
                    slot: { calories: subtotal.calories, proteinG: subtotal.proteinG },
                    remainingDay: dayRemaining,
                  }}
                  onPick={(item) =>
                    dispatch({
                      type: 'ADD_ITEM',
                      variantKey,
                      slotKey: slot.key,
                      key: genId(),
                      food: mapCatalogItemToFood(item),
                    })
                  }
                  onCreateCustom={(query) => {
                    // Alimento libre con el texto buscado ya escrito: el coach no vuelve a tipearlo.
                    const key = genId()
                    dispatch({ type: 'ADD_ITEM', variantKey, slotKey: slot.key, key, food: null })
                    const name = query.trim()
                    if (name !== '') {
                      dispatch({ type: 'UPDATE_ITEM', variantKey, slotKey: slot.key, itemKey: key, patch: { customName: name } })
                    }
                    setPickerOpen(false)
                  }}
                  onDone={() => setPickerOpen(false)}
                />
              </div>
            ) : null}
            {/* Acciones de la franja. "Copiar a otros días" vive acá —visible, con etiqueta— y no
                escondida tras un ⋯: es la acción que hoy obliga a retipear medio plan (P0-4), y el
                header ya está al límite de ancho en 360 px. Solo aparece en planes multi-día. */}
            <div className={(pickerOpen ? 'mt-2 ' : '') + 'flex flex-wrap items-center gap-2'}>
              {/* Con el picker abierto estas dos CTA viven DENTRO de él ("Alimento libre" y
                  "Crear «…»"), así que no se duplican acá. */}
              {!pickerOpen ? (
                <>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className={secondaryButtonClass + ' border-dashed'}
                  >
                    <Plus className="h-4 w-4" />
                    Agregar alimento
                  </button>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'ADD_ITEM', variantKey, slotKey: slot.key, key: genId(), food: null })}
                    className={secondaryButtonClass}
                  >
                    <Plus className="h-4 w-4" />
                    Alimento libre (con macros)
                  </button>
                </>
              ) : null}
              {canCopyToOtherDays ? (
                <CopySlotMenu slot={slot} variantKey={variantKey} variants={variants} onCopySlot={onCopySlot} />
              ) : null}
            </div>
          </div>

          {/* NUEVO (SPEC UX-a): sección "Porciones a elección", hermana de la lista de
              alimentos, debajo de "+ Alimento". Solo existe en structured/hybrid (SlotEditor
              no se monta en planes flexibles — R1). */}
          <PortionsSection slotKey={portionsSlotKey} slotName={slot.name} controller={portions} />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-sunken px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Subtotal franja</span>
            <MacroChipRow
              size="sm"
              calories={subtotal.calories}
              proteinG={subtotal.proteinG}
              carbsG={subtotal.carbsG}
              fatsG={subtotal.fatsG}
            />
            {portionTotals ? (
              // Redondeo entero + prefijo ~: valor referencial (coherente con el banner
              // de macros referenciales del paso Revisión).
              <p className="w-full text-xs text-muted">
                {PORTIONS_COPY.builder.subtotalPortionsNote(String(Math.round(portionTotals.calories)))}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </NutritionCard>
  )
}
