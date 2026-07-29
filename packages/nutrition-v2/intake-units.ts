/**
 * intake-units — vocabulario CANONICO de unidades de un registro de consumo V2, compartido por
 * web y RN (y espejado por el factor SQL `private.nutrition_v2_entry_factor`).
 *
 * Por que existe (NUT-017): las 4 superficies de registro ofrecian
 * `[servingUnit, 'g', 'ml', 'porción', 'unidad']` y el `<select>`/chip de unidad solo llamaba
 * `setUnit(...)`, sin tocar la cantidad. Con un alimento de 155 kcal/100 g y porcion 60 g, dejar
 * "100" en el campo y cambiar la unidad a `unidad` persistia `100 x macros` — 15.500 kcal en un
 * solo registro, sin preview ni tope server-side. Ademas el vocabulario driftaba: la UI mandaba
 * `'unidad'` y el motor canonico entiende `'un'` (packages/nutrition-engine/macros.ts:111,124),
 * asi que la MISMA fila se leia con una formula en V2 y con otra en las superficies V1.
 *
 * Reglas del modulo:
 *  - `un` es el codigo canonico de la unidad contable; "unidad" es SOLO una etiqueta de UI.
 *  - `porción` pertenece al sintetico de porciones/intercambios (p_unit = 'porción' con
 *    servingSize null a proposito, ver intake.actions.ts:495-560). NO se ofrece al registrar un
 *    alimento del catalogo: ahi duplicaria a `un` y no tiene semantica propia.
 *  - `serving_size` de `public.foods` SIEMPRE esta en g/ml (el `serving_unit` es una etiqueta),
 *    por eso la conversion contable es `qty / servingSize` y su inversa.
 *
 * Modulo PURO: sin React, sin Zod, sin red. Evita `String.prototype.normalize` a proposito
 * (soporte debil en Hermes, misma razon por la que `./conversion` no entra al barrel).
 */

/** Unidades aceptadas en una escritura de intake V2 (codigos canonicos, 1:1 con el factor SQL). */
export const NUTRITION_INTAKE_UNITS = ['g', 'ml', 'un', 'porción'] as const
export type NutritionIntakeUnit = (typeof NUTRITION_INTAKE_UNITS)[number]

/**
 * Unidades ofrecibles al registrar un alimento del CATALOGO (buscador y scanner, web y RN).
 * `porción` queda fuera: es la unidad del intake sintetico de intercambios, no una eleccion
 * del alumno sobre un alimento del catalogo.
 */
export const NUTRITION_CATALOG_UNITS = ['g', 'ml', 'un'] as const
export type NutritionCatalogUnit = (typeof NUTRITION_CATALOG_UNITS)[number]

/**
 * Sinonimos aceptados en la entrada (UI historica, planes convertidos de V1, unidades tipeadas
 * por el coach). Todo lo que no este aqui NO es una unidad valida para una escritura nueva.
 */
const UNIT_SYNONYMS: Readonly<Record<string, NutritionIntakeUnit>> = {
  g: 'g',
  gr: 'g',
  grs: 'g',
  grm: 'g',
  gramo: 'g',
  gramos: 'g',
  ml: 'ml',
  mls: 'ml',
  cc: 'ml',
  mililitro: 'ml',
  mililitros: 'ml',
  un: 'un',
  u: 'un',
  ud: 'un',
  uds: 'un',
  und: 'un',
  unid: 'un',
  unit: 'un',
  units: 'un',
  unidad: 'un',
  unidades: 'un',
  pieza: 'un',
  piezas: 'un',
  'porción': 'porción',
  'porciónes': 'porción',
  porcion: 'porción',
  porciones: 'porción',
  serving: 'porción',
  servings: 'porción',
}

/** Minusculas + sin tildes, sin usar `String.prototype.normalize` (Hermes). */
function foldUnit(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[áà]/g, 'a')
    .replace(/[éè]/g, 'e')
    .replace(/[íì]/g, 'i')
    .replace(/[óò]/g, 'o')
    .replace(/[úùü]/g, 'u')
    .replace(/\./g, '')
}

/**
 * Codigo canonico de una unidad escrita libremente, o `null` si no es una unidad soportada.
 * Es la UNICA puerta: contrato Zod, UI y conversiones la usan para no driftar.
 */
export function normalizeIntakeUnit(raw: string | null | undefined): NutritionIntakeUnit | null {
  if (raw === null || raw === undefined) return null
  const folded = foldUnit(String(raw))
  if (folded.length === 0) return null
  return UNIT_SYNONYMS[folded] ?? null
}

/** Etiqueta que ve el alumno para un codigo canonico ("un" se muestra como "unidad"). */
export function intakeUnitLabel(unit: NutritionIntakeUnit): string {
  if (unit === 'un') return 'unidad'
  return unit
}

/** True si la unidad escala proporcionalmente a la base per-100 (g y ml son intercambiables ahi). */
export function isMassIntakeUnit(unit: NutritionIntakeUnit): boolean {
  return unit === 'g' || unit === 'ml'
}

/**
 * Unidades ofrecidas para un alimento del catalogo: su propia magnitud (g o ml segun el
 * `servingUnit` del alimento) + la unidad contable. Espeja `swapOptionAllowedUnits` del motor
 * canonico (packages/nutrition-engine/macros.ts:63-65) — registrar un solido en ml (o un liquido
 * en g) no significa nada y era una de las formas de llegar al x100 de NUT-017.
 */
export function catalogUnitOptions(
  servingUnit: string | null | undefined,
): readonly NutritionCatalogUnit[] {
  return normalizeIntakeUnit(servingUnit) === 'ml' ? (['ml', 'un'] as const) : (['g', 'un'] as const)
}

/** Unidad inicial de un alimento del catalogo: la suya si es ofrecible, si no la de su magnitud. */
export function defaultCatalogUnit(servingUnit: string | null | undefined): NutritionCatalogUnit {
  const options = catalogUnitOptions(servingUnit)
  const normalized = normalizeIntakeUnit(servingUnit)
  if (normalized && (options as readonly string[]).includes(normalized)) {
    return normalized as NutritionCatalogUnit
  }
  return options[0]
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Convierte la cantidad al cambiar de unidad, para que el alumno no persista "100 unidades"
 * donde queria decir "100 g" (NUT-017). `serving_size` esta en g/ml, asi que:
 *
 *   g|ml → un : `quantity / servingSize`   (100 g con porcion 60 g ⇒ 1,7 un)
 *   un → g|ml : `quantity * servingSize`   (1 un con porcion 60 g ⇒ 60 g)
 *   g ↔ ml    : el mismo numero (misma base per-100; el alimento es solido O liquido)
 *
 * Devuelve `null` cuando la conversion NO es representable (sin `servingSize` positivo, o
 * involucrando `porción`): el llamador debe entonces pedir la cantidad de nuevo en vez de
 * arrastrar un numero que ya no significa lo mismo.
 */
export function convertIntakeQuantity(input: {
  quantity: number
  from: NutritionIntakeUnit
  to: NutritionIntakeUnit
  servingSize: number | null | undefined
}): number | null {
  const { quantity, from, to } = input
  if (!Number.isFinite(quantity) || quantity <= 0) return null
  if (from === to) return quantity
  if (isMassIntakeUnit(from) && isMassIntakeUnit(to)) return quantity

  const servingSize = input.servingSize
  const usableServing =
    typeof servingSize === 'number' && Number.isFinite(servingSize) && servingSize > 0
      ? servingSize
      : null
  if (usableServing === null) return null

  if (isMassIntakeUnit(from) && to === 'un') return round1(quantity / usableServing)
  if (from === 'un' && isMassIntakeUnit(to)) return round1(quantity * usableServing)
  // 'porción' no tiene equivalencia en g/ml/un: sus macros son las ref congeladas del grupo.
  return null
}
