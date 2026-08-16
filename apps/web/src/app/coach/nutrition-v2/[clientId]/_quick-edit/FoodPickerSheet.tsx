'use client'

/**
 * Superficie del picker de alimentos en el modo edicion: bottom sheet en movil, dialogo
 * centrado en desktop (`QeBottomSheet`).
 *
 * Desde 2026-08-05 el CUERPO es el picker unificado (`_components/food-picker/FoodPicker`),
 * el mismo que usa el wizard: sugerencias pre-busqueda, busqueda automatica con debounce,
 * resultados agrupados por origen, macros completas por fila y restricciones del alumno. Este
 * archivo queda como el ADAPTADOR de la edicion rapida: conserva su firma publica (open,
 * title, clientId, allowCustom, onPick, onPickCustom, onOpenChange) y traduce el item del
 * catalogo al `BuilderFood` que espera el reducer.
 *
 * `multiAdd` (agregar a una franja) suma la barra viva con el subtotal de la franja y lo que
 * resta del dia; el modo reemplazar (swap de un item) sigue siendo un-tap-y-cierra.
 */

import type { FoodCatalogItem } from '@eva/nutrition-v2'
import {
  FoodPicker,
  type FoodPickerSummary,
} from '@/app/coach/nutrition-v2/_components/food-picker/FoodPicker'
import { mapCatalogItemToFood } from '../../_lib/food-catalog-mapping'
import type { BuilderFood } from '@eva/nutrition-v2'
import { QeBottomSheet } from './QeBottomSheet'

export function FoodPickerSheet({
  open,
  title,
  clientId,
  allowCustom = false,
  slotName = null,
  multiAdd = false,
  summary = null,
  onPick,
  onPickCustom,
  onOpenChange,
}: {
  open: boolean
  title: string
  clientId: string
  /** Muestra el fallback "Alimento libre" (solo al AGREGAR, no al swapear). */
  allowCustom?: boolean
  /** Nombre de la franja: filtra "lo que sueles usar" y titula esa seccion. */
  slotName?: string | null
  /** Agregar varios sin cerrar (barra viva + "Listo (n)"). Ausente = un-tap-y-cierra. */
  multiAdd?: boolean
  /** Totales vivos de la franja y restante del dia (los recalcula el padre en cada alta). */
  summary?: FoodPickerSummary | null
  onPick: (food: BuilderFood) => void
  /** Alta de alimento libre; recibe el texto buscado para precargar el nombre. */
  onPickCustom?: (query: string) => void
  onOpenChange: (open: boolean) => void
}) {
  function handlePick(item: FoodCatalogItem) {
    onPick(mapCatalogItemToFood(item))
  }

  return (
    <QeBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="lg"
      bodyClassName="space-y-0 pt-3"
    >
      <FoodPicker
        clientId={clientId}
        slotName={slotName}
        multiAdd={multiAdd}
        summary={summary}
        allowCustom={allowCustom && onPickCustom != null}
        autoFocus
        onPick={handlePick}
        onCreateCustom={
          onPickCustom
            ? (query) => {
                onPickCustom(query)
                onOpenChange(false)
              }
            : undefined
        }
        onDone={() => onOpenChange(false)}
      />
    </QeBottomSheet>
  )
}
