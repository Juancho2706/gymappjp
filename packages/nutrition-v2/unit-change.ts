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
 * `porción`, alimento sin `servingSize` positivo, alimento sin medida casera al pedir `casera`
 * (W2), item sin alimento del catalogo y texto que no parsea. El aviso de plausibilidad
 * (./plausibility.ts) cubre lo que quede raro.
 *
 * Modulo PURO: sin React, sin Zod, sin red.
 */

import {
  HOUSEHOLD_UNIT,
  convertQuantityBetweenUnits,
  foodMagnitudeUnit,
  isHouseholdUnit,
  normalizeIntakeUnit,
} from './intake-units'

/**
 * Lo minimo que hace falta del alimento para convertir. Se pide estructural (y no `BuilderFood`)
 * porque los tres llamadores traen tipos distintos: el `QeItem.food` del paquete, el
 * `BuilderFood` del wizard web y su espejo RN (apps/mobile/lib/nutrition-v2-builder.ts:52).
 */
export interface UnitChangeFood {
  /** `serving_size` del catalogo: SIEMPRE en g/ml (el `serving_unit` es solo una etiqueta). */
  servingSize: number | null
  /**
   * Gramos de la medida casera del alimento. Cableado en W2 (SPEC §5.3, hallazgo b8 de la
   * auditoria W2.0): sin el, pasar de `g` a `casera` dejaba «122» escrito y el editor mostraba
   * 122 huevos.
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

  // Codigo comparable de cada lado: `casera` NO es un codigo de intake y se resuelve literal
  // (jamas derivada de la etiqueta casera, R8); el resto pasa por el normalizador canonico.
  const from = isHouseholdUnit(fromUnit) ? HOUSEHOLD_UNIT : normalizeIntakeUnit(fromUnit)
  const to = isHouseholdUnit(toUnit) ? HOUSEHOLD_UNIT : normalizeIntakeUnit(toUnit)
  // Unidad desconocida o sin cambio real: el numero escrito sigue significando lo mismo.
  if (from === null || to === null || from === to) return quantity

  const parsed = Number(quantity.trim())
  if (!Number.isFinite(parsed) || parsed <= 0) return quantity

  const converted = convertQuantityBetweenUnits({
    quantity: parsed,
    from,
    to,
    servingSize: food.servingSize,
    householdGrams: food.householdGrams ?? null,
  })
  // `null` = `porción` de por medio o sin porcion utilizable; `<= 0` = redondeo que borraria el
  // item. En los dos casos se conserva el numero (SPEC §4.1) y avisa la plausibilidad.
  if (converted === null || converted <= 0) return quantity
  return formatQuantityText(converted)
}

/**
 * Forma que toma una fila de los WIZARDS al hidratarse desde algo que ya tiene medida casera
 * congelada: un item prescrito (`household_label`/`household_grams` de la tabla) o un item de
 * plantilla (el par que emite `projectItem`). W2, tren «Cantidades honestas».
 *
 * Existe porque el `BuilderItem` de los wizards, a diferencia del `QeItem` del editor unico, NO
 * tiene par propio: la medida vive en `item.food`. Sin esta pieza pasaban las dos cosas malas:
 *  · rehidratar «122 g» perdia el rotulo y republicar borraba la medida (el agujero de R2);
 *  · un item `casera` cuyo alimento no se resolvio quedaba sin gramaje con que traducir y
 *    reventaba recien en `buildItemInsertRow`.
 *
 * `pair` es lo que hay que INYECTAR en el `BuilderFood` de la fila: el par CONGELADO gana sobre
 * el del catalogo vigente (el plan dice «2 huevos de 61 g» y eso no se mueve porque alguien
 * edite el alimento). `null` = la fila se queda en su magnitud, en gramos honestos.
 */
export function householdRowShape(input: {
  /** Unidad de la fila de origen (`casera` solo puede venir de un borrador). */
  unit: string
  /** Cantidad de origen: CUENTA si `unit` es casera, gramos/ml en cualquier otro caso. */
  quantity: number
  householdGrams: number | null | undefined
  householdLabel: string | null | undefined
  /** `serving_unit` del alimento: la magnitud a la que se baja cuando no hay medida. */
  servingUnit: string | null | undefined
  /** `false` = el alimento no se resolvio; sin el, la fila no puede quedar en `casera`. */
  hasFood: boolean
}): { unit: string; quantity: string; pair: { grams: number; label: string } | null } {
  const magnitude = foodMagnitudeUnit(input.servingUnit)
  const grams = input.householdGrams
  const label = (input.householdLabel ?? '').trim()
  const usable = typeof grams === 'number' && Number.isFinite(grams) && grams > 0 && label.length > 0
  const isHousehold = isHouseholdUnit(input.unit)
  const quantity = Number(input.quantity)
  const safeQuantity = Number.isFinite(quantity) ? quantity : 0

  if (!usable) {
    // Sin par no hay traduccion posible: una fila que llego en `casera` baja a su magnitud con
    // el numero intacto (el aviso de plausibilidad se ocupa de que se vea raro).
    return {
      unit: isHousehold ? magnitude : input.unit,
      quantity: Number.isFinite(quantity) ? String(quantity) : '',
      pair: null,
    }
  }

  const pair = { grams: grams as number, label }
  if (!input.hasFood) {
    // Alimento borrado o fuera de scope: la fila pasa a ser libre y `casera` deja de tener con
    // que resolverse. Se persiste lo unico honesto que queda: los gramos.
    return {
      unit: isHousehold ? magnitude : input.unit,
      quantity: String(isHousehold ? safeQuantity * pair.grams : safeQuantity),
      pair: null,
    }
  }
  if (isHousehold) return { unit: input.unit, quantity: String(safeQuantity), pair }

  // Fila persistida en gramos con la medida congelada: se muestra como la escribio el coach
  // («2 huevos»), redondeando al medio, que es el paso del stepper en casera.
  const count = Math.round((safeQuantity / pair.grams) * 2) / 2
  if (!Number.isFinite(count) || count <= 0) {
    return { unit: input.unit, quantity: String(safeQuantity), pair }
  }
  return { unit: HOUSEHOLD_UNIT, quantity: String(count), pair }
}
