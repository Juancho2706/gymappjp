/**
 * unit-change — que pasa con la CANTIDAD escrita cuando el coach cambia la unidad de un item
 * del plan (W1.1 del tren «Cantidades honestas»).
 *
 * Por que existe: el ALUMNO ya convertia al cambiar de unidad desde NUT-017
 * (`convertIntakeQuantity`, ./intake-units.ts:146, cableado en TodayExperience.tsx:1902), pero
 * el COACH no. `SET_ITEM_UNIT` (./editor-state.ts, `quickEditReducer`) y los dos wizards
 * (apps/web/.../builder/_lib/draft-builder.ts `UPDATE_ITEM`, apps/mobile/app/coach/
 * nutrition-v2/builder/[clientId].tsx `UnitToggle`) solo pisaban `unit`. Con "30" escrito y un
 * salto de `g` a `un`, el plan se publicaba con 30 PORCIONES: el caso real del 06-09 («Huevo
 * revuelto 30 un» = 4.470 kcal en un solo item).
 *
 * Regla de la conversion (SPEC §4.1): cuando NO es representable se CONSERVA el numero tal
 * cual — nunca se inventa una cifra ni se vacia el campo. Los casos son unidad heredada
 * `porción`, alimento sin `servingSize` positivo, item sin alimento del catalogo y texto que no
 * parsea. El aviso de plausibilidad (./plausibility.ts) cubre lo que quede raro.
 *
 * Modulo PURO: sin React, sin Zod, sin red.
 */

import { convertIntakeQuantity, normalizeIntakeUnit } from './intake-units'

/**
 * Lo minimo que hace falta del alimento para convertir. Se pide estructural (y no `BuilderFood`)
 * porque los tres llamadores traen tipos distintos: el `QeItem.food` del paquete, el
 * `BuilderFood` del wizard web y su espejo RN (apps/mobile/lib/nutrition-v2-builder.ts:52).
 */
export interface UnitChangeFood {
  /** `serving_size` del catalogo: SIEMPRE en g/ml (el `serving_unit` es solo una etiqueta). */
  servingSize: number | null
  /**
   * Gramos de la medida casera del alimento. Declarado desde ya para que la firma no cambie
   * cuando W2 encienda la unidad `casera` (SPEC §5.3); en W1 no se lee.
   */
  householdGrams?: number | null
}

export interface UnitChangeInput {
  /** Cantidad tal como esta escrita en el editor (texto editable, decimal con punto). */
  quantity: string
  fromUnit: string
  toUnit: string
  food: UnitChangeFood | null
}

/**
 * Convencion de texto de las cantidades del editor: un decimal, punto como separador. Es la
 * misma que produce `stepQuantityText` (./editor-state.ts) — vive aca, y no alla, para que
 * `editor-state` pueda importar la conversion sin ciclo de modulos. Que sea punto y no coma no
 * es cosmetico: `qeItemMacros` lee la cantidad con `Number(...)`, que no entiende "1,7".
 */
export function formatQuantityText(value: number): string {
  return String(Math.round(value * 10) / 10)
}

/**
 * Cantidad que debe quedar escrita tras cambiar la unidad de `fromUnit` a `toUnit`.
 * Devuelve el texto ORIGINAL, sin tocar, siempre que la conversion no sea representable.
 */
export function convertQuantityTextOnUnitChange(input: UnitChangeInput): string {
  const { quantity, fromUnit, toUnit, food } = input
  if (!food) return quantity

  const from = normalizeIntakeUnit(fromUnit)
  const to = normalizeIntakeUnit(toUnit)
  // Unidad desconocida (p. ej. la `casera` de W2, que no es un codigo de intake) o sin cambio
  // real: el numero escrito sigue significando lo mismo.
  if (from === null || to === null || from === to) return quantity

  const parsed = Number(quantity.trim())
  if (!Number.isFinite(parsed) || parsed <= 0) return quantity

  const converted = convertIntakeQuantity({
    quantity: parsed,
    from,
    to,
    servingSize: food.servingSize,
  })
  // `null` = `porción` de por medio o sin porcion utilizable; `<= 0` = redondeo que borraria el
  // item. En los dos casos se conserva el numero (SPEC §4.1) y avisa la plausibilidad.
  if (converted === null || converted <= 0) return quantity
  return formatQuantityText(converted)
}
