/**
 * intake-normalize — normalizacion COMPARTIDA (web + RN) del snapshot de macros que viaja en un
 * registro de consumo "Lo comí" de un item PRESCRITO.
 *
 * Por que existe: los macros del item prescrito que devuelve el read-model son TOTALES de la
 * cantidad prescrita (el builder los congela con `calculateFoodItemMacros(quantity, unit, food)`),
 * mientras que el RPC `record_nutrition_intake_v2` SIEMPRE reescala el snapshot por su factor
 * (`private.nutrition_v2_entry_factor`: `quantity / servingSize` para g/ml — 100 por defecto — y
 * `quantity` para unidades contables). Mandar los totales tal cual hace que el servidor los vuelva a
 * escalar: 200 g / 330 kcal se persisten como 660 kcal (y 50 g se subregistran a la mitad).
 *
 * La normalizacion cierra el circulo: macros POR UNIDAD prescrita + `servingSize = 1`. Con
 * `servingSize = 1` el factor del RPC vale `quantity` en AMBAS ramas, de modo que
 * `(macros / quantity) x quantity === macros`, cualquiera sea la unidad.
 *
 * Modulo puro: sin React, sin red, sin Zod. Lo consumen `nutrition-today.logic.ts` (web) y
 * `apps/mobile/lib/nutrition-v2-intake.ts` (RN) para que ambos payloads sean identicos.
 */

/**
 * Base declarada del snapshot normalizado. El snapshot describe UNA unidad prescrita.
 *
 * Nota de coordinacion con la base declarada de macros (`snapshot_macros_basis`, NUT-001): el
 * contrato Zod NO lleva ese campo todavia y el RPC lo recibe como parametro propio con default
 * NULL. Con basis NULL rige la formula historica y esta normalizacion es exacta; con basis
 * 'per_serving' el factor de g/ml es `quantity / coalesce(servingSize, 1)`, que con `servingSize = 1`
 * da el mismo resultado. Es decir, el snapshot per-unidad es correcto en AMBOS regimenes y no hay
 * que tocar el contrato para cerrar NUT-002.
 */
export const PRESCRIBED_SNAPSHOT_SERVING_SIZE = 1

/**
 * Divide preservando null (macros por unidad prescrita). Un valor no finito o una cantidad no
 * positiva se devuelven intactos: nunca se inventa un numero ni se propaga un NaN.
 */
export function perUnitMacro(value: number | null | undefined, quantity: number): number | null {
  if (value === null || value === undefined) return null
  if (!Number.isFinite(value) || !(quantity > 0)) return value
  return value / quantity
}

/** Macros tal como los expone el read-model de un item prescrito (TOTALES de la cantidad). */
export interface PrescribedMacrosLike {
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatsG: number | null
  fiberG: number | null
}

/** Macros POR UNIDAD + la base explicita que el RPC debe usar para reconstruir el total. */
export interface PrescribedSnapshotMacros extends PrescribedMacrosLike {
  servingSize: number
}

/**
 * Snapshot de macros normalizado de un item prescrito: por-unidad y con `servingSize = 1`.
 * Es la UNICA forma correcta de mandar un "Lo comí" prescrito al RPC.
 */
export function prescribedSnapshotMacros(
  macros: PrescribedMacrosLike,
  quantity: number,
): PrescribedSnapshotMacros {
  return {
    calories: perUnitMacro(macros.calories, quantity),
    proteinG: perUnitMacro(macros.proteinG, quantity),
    carbsG: perUnitMacro(macros.carbsG, quantity),
    fatsG: perUnitMacro(macros.fatsG, quantity),
    fiberG: perUnitMacro(macros.fiberG, quantity),
    servingSize: PRESCRIBED_SNAPSHOT_SERVING_SIZE,
  }
}

/**
 * Base declarada de los macros congelados en el registro (NUT-001). El catalogo tiene DOS
 * convenciones vivas: el importado es per-100 g/ml y el seed de intercambios guarda kcal POR
 * PORCION, asi que ninguna formula unica es correcta para todo — hay que declarar la base.
 */
export type NutritionMacrosBasis = 'per_100' | 'per_serving'

/**
 * Base de los macros que devuelve el catalogo (`search_food_catalog_v2` / `lookup_food_by_gtin_v2`
 * son passthrough de `public.foods`). Todo payload NUEVO de buscador o scanner la declara para
 * que el servidor escale con la formula correcta en vez de la legada.
 */
export const CATALOG_MACROS_BASIS: NutritionMacrosBasis = 'per_100'

function clampNonNegative(value: number | null | undefined): number {
  const n = value ?? 0
  return Number.isFinite(n) && n > 0 ? n : 0
}

function positiveOr(value: number | null | undefined, fallback: number): number {
  const n = value ?? fallback
  return Math.max(Number.isFinite(n) ? n : fallback, 0.0001)
}

/**
 * Factor de escala de macros de un registro — espejo BYTE A BYTE de
 * `private.nutrition_v2_entry_factor` (migracion 20260728120000, que agrego `p_basis`).
 *
 *   basis 'per_100'    : g|ml ⇒ qty/100 · porción ⇒ qty · contable ⇒ qty*servingSize/100
 *   basis 'per_serving': g|ml ⇒ qty/coalesce(servingSize,1) · resto ⇒ qty
 *   basis null (LEGADO): g|ml ⇒ qty/coalesce(servingSize,100) · resto ⇒ qty
 *
 * La rama LEGADA es la formula historica intacta: las entries ya persistidas NO llevan basis y
 * su matematica no puede cambiar (reescribiria el historial del alumno). Los payloads NUEVOS de
 * catalogo/scanner declaran `per_100` (los macros del catalogo son por 100 g/ml, contrato de
 * `docs/operations/FOOD_CATALOG_CL_IMPORT.md:89`) y el camino prescrito normalizado manda
 * `servingSize = 1`, que da el mismo resultado en cualquiera de los tres regimenes.
 */
export function intakeEntryFactor(input: {
  quantity: number
  unit: string | null | undefined
  servingSize: number | null | undefined
  basis?: NutritionMacrosBasis | null
}): number {
  const quantity = clampNonNegative(input.quantity)
  const unit = (input.unit ?? '').toLowerCase()
  const isMass = unit === 'g' || unit === 'ml'
  const isPortion = unit === 'porción' || unit === 'porcion'

  if (input.basis === 'per_100') {
    if (isMass) return quantity / 100
    if (isPortion) return quantity
    return (quantity * positiveOr(input.servingSize, 100)) / 100
  }
  if (input.basis === 'per_serving') {
    if (isMass) return quantity / positiveOr(input.servingSize, 1)
    return quantity
  }
  // LEGADO (sin basis declarada): cuerpo verbatim de 20260714210000:69-76.
  if (isMass) return quantity / positiveOr(input.servingSize, 100)
  return quantity
}

/**
 * Factor de escala IDENTICO al servidor, firma historica (sin basis ⇒ formula legada). Se
 * conserva por compatibilidad de importaciones; el camino nuevo usa `intakeEntryFactor`.
 */
export function nutritionEntryFactor(
  quantity: number,
  unit: string | null | undefined,
  servingSize: number | null | undefined,
): number {
  return intakeEntryFactor({ quantity, unit, servingSize, basis: null })
}

/** Macros de un snapshot (por-base) y de un total reconstruido: misma forma. */
export interface NutritionMacroTotalsLike {
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
  fiberG: number
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Total de UN registro = macros del snapshot x factor, redondeado a 1 decimal COMO EL SERVIDOR
 * (`round(..., 1)` en `nutrition_v2_intake_item_json`). Es la funcion que deben usar tanto el
 * "total estimado" del formulario como el historial optimista: si la UI y el servidor no
 * comparten la formula, el alumno ve un numero y persiste otro.
 */
export function scaleSnapshotMacros(
  snapshot: {
    calories?: number | null
    proteinG?: number | null
    carbsG?: number | null
    fatsG?: number | null
    fiberG?: number | null
    servingSize?: number | null
  },
  input: {
    quantity: number
    unit: string | null | undefined
    servingSize?: number | null
    basis?: NutritionMacrosBasis | null
  },
): NutritionMacroTotalsLike {
  const factor = intakeEntryFactor({
    quantity: input.quantity,
    unit: input.unit,
    servingSize: input.servingSize ?? snapshot.servingSize ?? null,
    basis: input.basis ?? null,
  })
  return {
    calories: round1((snapshot.calories ?? 0) * factor),
    proteinG: round1((snapshot.proteinG ?? 0) * factor),
    carbsG: round1((snapshot.carbsG ?? 0) * factor),
    fatsG: round1((snapshot.fatsG ?? 0) * factor),
    fiberG: round1((snapshot.fiberG ?? 0) * factor),
  }
}
