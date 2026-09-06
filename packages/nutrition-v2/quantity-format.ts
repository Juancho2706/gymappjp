/**
 * quantity-format — rótulo honesto de «cantidad + unidad» de un ítem (prescrito o registrado)
 * en TODAS las superficies (tren «Cantidades honestas», W2.3, SPEC §5.5).
 *
 * Por qué existe: hasta ahora cada superficie concatenaba `${quantity} ${unit}` a mano
 * («30 un» sin decir que son 3 kg de huevo, el caso real del 06-09). Con la medida casera
 * congelada en el ítem (`householdLabel`/`householdGrams`, SPEC §5.3) el rótulo puede decir
 * «2 huevos (122 g)» en vez de «122 g» a secas — y esta es la ÚNICA casa de esa decisión: el
 * resto de las superficies solo llaman a `formatItemQuantity`, nunca vuelven a concatenar.
 *
 * Módulo PURO: sin React, sin Next.js, sin RN, sin red.
 */

import { formatHouseholdCount } from '@eva/nutrition-engine'
import { formatNutritionAmount } from './design'

/**
 * Lo mínimo para rotular un ítem: su cantidad/unidad y, si el catálogo la trae, la medida
 * casera CONGELADA en el ítem al publicar (SPEC §5.3) — no la del catálogo en vivo, que puede
 * driftar. `null`/`undefined` en `householdLabel`/`householdGrams` = ítem sin medida casera
 * (planes anteriores a W2, o alimento sin household).
 */
export interface QuantityLabelInput {
  quantity: number
  unit: string | null | undefined
  householdLabel?: string | null
  householdGrams?: number | null
}

/** Unidades de MASA: la cantidad es directamente gramos/mililitros (mismo criterio que `macros.ts`). */
const MASS_UNITS = new Set(['g', 'ml'])

/**
 * Número de la cantidad en es-CL, un decimal cuando hace falta y sin ceros de más
 * ("3" y no "3,0"; "1,5" cuando corresponde). Reusa `formatNutritionAmount` (./design.ts, el
 * formateador es-CL de referencia del paquete) con unidad vacía para poder anteponer el
 * rótulo casero antes de la unidad real.
 */
function formatQuantityNumber(value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  return formatNutritionAmount(safe, '', 1).trim()
}

/**
 * Rótulo de la unidad SOLA (sin la cantidad pegada): `un` queda `un` (código corto, no
 * "unidad" — esa conversión es de `intakeUnitLabel` en `./intake-units`, para otra
 * superficie), `porción` pluraliza según `quantity`, g/ml quedan tal cual, y una unidad
 * ausente/vacía (ítem legado) es cadena vacía.
 */
export function formatUnitLabel(unit: string | null | undefined, quantity = 1): string {
  const trimmed = typeof unit === 'string' ? unit.trim() : ''
  if (!trimmed) return ''
  if (trimmed === 'porción' || trimmed === 'porcion') {
    return quantity === 1 ? 'porción' : 'porciones'
  }
  return trimmed
}

/** ¿El ítem trae un par casero congelado utilizable (rango del CHECK, SPEC §5.4)? */
function hasHouseholdPair(
  input: QuantityLabelInput,
): input is QuantityLabelInput & { householdLabel: string; householdGrams: number } {
  const label = typeof input.householdLabel === 'string' ? input.householdLabel.trim() : ''
  const grams = input.householdGrams
  return label.length > 0 && typeof grams === 'number' && Number.isFinite(grams) && grams >= 1 && grams <= 1000
}

/**
 * Rótulo honesto de un ítem, prescrito o registrado (SPEC §5.5):
 *
 *  - Unidad de masa (g/ml) con par casero congelado ⇒ cuenta casera + gramos reales entre
 *    paréntesis: «2 huevos (122 g)», «½ taza (60 g)». Si la cuenta es rara (`formatHouseholdCount`
 *    vacío, p. ej. cantidad 0) cae a «{quantity} {unit}» plano.
 *  - `unit === 'casera'` (solo puede venir del BORRADOR del coach; un ítem publicado nunca la
 *    tiene, CHECK `unit <> 'casera'`, SPEC §5.4) con par ⇒ solo la cuenta casera, sin paréntesis
 *    («2 huevos»); sin par (medida aún no resuelta) ⇒ «{quantity} un».
 *  - Cualquier otro caso (sin par casero) ⇒ «{quantity} {formatUnitLabel(unit, quantity)}»
 *    («3 un», «200 g», «1 porción», «2 porciones»).
 */
export function formatItemQuantity(input: QuantityLabelInput): string {
  const unit = typeof input.unit === 'string' ? input.unit.trim() : ''
  const safeQuantity = Number.isFinite(input.quantity) ? input.quantity : 0
  const quantityText = formatQuantityNumber(safeQuantity)

  if (unit === 'casera') {
    if (hasHouseholdPair(input)) {
      const rotulo = formatHouseholdCount(safeQuantity, input.householdLabel.trim())
      if (rotulo) return rotulo
    }
    // Borrador sin medida casera resuelta todavia (alimento recien elegido, catalogo sin
    // household): no hay nada honesto que mostrar como cuenta, cae al codigo canonico.
    return `${quantityText} un`
  }

  if (MASS_UNITS.has(unit) && hasHouseholdPair(input)) {
    const count = safeQuantity / input.householdGrams
    const rotulo = formatHouseholdCount(count, input.householdLabel.trim())
    const base = `${quantityText} ${unit}`
    return rotulo ? `${rotulo} (${base})` : base
  }

  const label = formatUnitLabel(unit, safeQuantity)
  return label ? `${quantityText} ${label}` : quantityText
}
