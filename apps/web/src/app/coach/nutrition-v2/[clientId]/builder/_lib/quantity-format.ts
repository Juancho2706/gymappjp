/**
 * Cantidades de un item prescrito: unidad -> afordancia y formato (BD6). PURO, compartido por el
 * creador (`ItemRow`) y la edicion rapida (`EditableItemRow`) para que las dos superficies web
 * cuenten las porciones igual.
 *
 * La regla es de producto, no de estilo: en gramos/mililitros el coach TIPEA (150, 240…) y unos
 * botones ±1 serian ruido; en porciones/unidades el coach CUENTA (media, una, una y media…) y
 * tipear "1.5" es peor que tocar un +. De ahi el hibrido:
 *
 *  - g / ml  -> input libre `inputmode="decimal"`, sin steppers;
 *  - un      -> steppers ±0,5 con el valor en fracciones (½, 1, 1½, 2), minimo media porcion.
 *
 * El minimo es 0,5 y no 0: "cero porciones" no es una cantidad, es quitar el alimento (y eso ya
 * tiene su propia accion con Deshacer). El boton `−` se DESHABILITA visible en el minimo en vez
 * de desaparecer: el limite tiene que ser legible antes de tocarlo.
 */

/** Paso y piso de las cantidades contadas en porciones/unidades. */
export const PORTION_QUANTITY_STEP = 0.5
export const PORTION_QUANTITY_MIN = 0.5
/** Tope defensivo (el contrato valida aparte); evita que un `+` sostenido escale sin fin. */
export const PORTION_QUANTITY_MAX = 99

/**
 * ¿La unidad se CUENTA (porciones/unidades) o se MIDE (g/ml)? Desconocida => se mide, que es el
 * caso por defecto del catalogo (`toBuilderUnit` cae a gramos).
 */
export function isCountedUnit(unit: string | null | undefined): boolean {
  const normalized = String(unit ?? '').trim().toLowerCase()
  return (
    normalized === 'un' ||
    normalized === 'unit' ||
    normalized === 'unidad' ||
    normalized === 'unidades' ||
    normalized === 'porcion' ||
    normalized === 'porción' ||
    normalized === 'porciones'
  )
}

/** Numero desde el texto de cantidad (acepta coma decimal es-CL); null si no parsea. */
export function parseQuantityText(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const trimmed = String(value ?? '').trim().replace(',', '.')
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/** Numero es-CL con coma decimal y sin ceros de relleno ("1.25" -> "1,25"). */
function decimalEsCl(value: number): string {
  return String(Math.round(value * 100) / 100).replace('.', ',')
}

/**
 * Cantidad contada en FRACCIONES legibles: 0,5 -> "½"; 1 -> "1"; 1,5 -> "1½"; 2 -> "2".
 *
 * Solo se usan medios (es el paso del stepper). Un valor que no cae en medios —cantidad
 * heredada de un plan viejo, o tipeada a mano— NO se redondea ni se miente: se muestra como
 * numero es-CL ("1,25"). Texto vacio o ilegible devuelve `fallback` (por defecto '—').
 */
export function formatCountedQuantity(value: string | number | null | undefined, fallback = '—'): string {
  const parsed = parseQuantityText(value)
  if (parsed === null) return fallback
  if (parsed < 0) return decimalEsCl(parsed)
  const isHalfStep = Number.isInteger(parsed * 2)
  if (!isHalfStep) return decimalEsCl(parsed)
  const whole = Math.floor(parsed)
  const hasHalf = parsed - whole === 0.5
  if (!hasHalf) return String(whole)
  return whole === 0 ? '½' : String(whole) + '½'
}

/** Siguiente valor del stepper (±0,5 con snap a medios), acotado a [0,5 … 99]. */
export function stepCountedQuantity(current: string | number | null | undefined, direction: 1 | -1): string {
  const parsed = parseQuantityText(current)
  const base = parsed !== null && parsed > 0 ? parsed : 0
  const next = Math.round((base + direction * PORTION_QUANTITY_STEP) * 2) / 2
  if (next < PORTION_QUANTITY_MIN) return String(PORTION_QUANTITY_MIN)
  return String(Math.min(next, PORTION_QUANTITY_MAX))
}

/**
 * ¿El stepper puede moverse en esa direccion? Es lo que apaga el boton (visible, deshabilitado).
 * Con la cantidad vacia o ilegible SI se puede subir (el `+` la siembra en media porcion).
 */
export function canStepCountedQuantity(current: string | number | null | undefined, direction: 1 | -1): boolean {
  const parsed = parseQuantityText(current)
  if (parsed === null) return direction === 1
  if (direction === -1) return parsed > PORTION_QUANTITY_MIN
  return parsed < PORTION_QUANTITY_MAX
}
