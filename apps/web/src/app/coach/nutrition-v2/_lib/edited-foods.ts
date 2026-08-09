/**
 * Helpers PUROS del filtro "Editados por mi" del tab Alimentos (T2.3 F1).
 *
 * Sin React y sin Supabase. Dos piezas:
 *  - `coachEditedFoodToCatalogItem`: fila de `foods` + override del coach -> `FoodCatalogItem`.
 *    Es el ESPEJO en TypeScript de `private.food_catalog_v2_item_json`, igual que el freeze:
 *    el merge de macros lo hace `resolveFoodMacros` (una sola formula para SQL y TS), y el
 *    resto de las claves se copian con el mismo nombre que emite el JSON de la RPC. Si las dos
 *    se separan, el coach ve un numero en la busqueda y otro en su lista de editados.
 *  - `isCoachEditedFood` / `filterCoachEditedFoods`: el predicado del filtro.
 *
 * `media` queda en `null` a proposito: resolver la foto exigiria un tercer round-trip a
 * `food_media` y la card ya tiene el icono de categoria como fallback garantizado.
 */

import {
  resolveFoodMacros,
  type CoachFoodOverrideValues,
  type FoodCatalogItem,
  type NutritionMacrosBasis,
} from '@eva/nutrition-v2'

/**
 * Fila de `public.foods` tal como la devuelve PostgREST para este listado. Snake_case porque
 * es la fila cruda: la traduccion a camelCase es justamente lo que hace el mapper.
 */
export interface CoachEditedFoodRow {
  id: string
  catalog_key: string | null
  barcode: string | null
  name: string
  brand: string | null
  category: string | null
  country_code: string | null
  serving_size: number
  serving_unit: string | null
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  fiber_g: number | null
  macros_basis: string | null
  household_label: string | null
  household_grams: number | null
  sodium_mg: number | null
  sugar_g: number | null
  saturated_fat_g: number | null
  package_quantity: number | null
  package_unit: string | null
  catalog_source: string
  source_ref: string | null
  verification_status: string
  coach_id: string | null
  org_id: string | null
}

/** Una base fuera del vocabulario se reporta como no declarada; nunca se inventa `per_100`. */
function toMacrosBasis(value: string | null | undefined): NutritionMacrosBasis | null {
  return value === 'per_100' || value === 'per_serving' ? value : null
}

function toNullableNumber(value: number | null | undefined): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Fila del catalogo + override del coach -> item del read model del catalogo.
 *
 * El override es OBLIGATORIO en la firma (no `| null`): esta funcion existe para el listado de
 * alimentos corregidos, y un item sin override no pertenece a el. `hasOverride`/`original` los
 * pone `resolveFoodMacros`, no este mapper.
 *
 * `verificationStatus` y `source` viajan crudos igual que en la RPC: si la base tuviera un valor
 * fuera del vocabulario, la validacion Zod del action lo delata en vez de que el mapper lo
 * disfrace de `unverified`.
 */
export function coachEditedFoodToCatalogItem(
  row: CoachEditedFoodRow,
  override: CoachFoodOverrideValues,
): FoodCatalogItem {
  const macros = resolveFoodMacros(
    {
      calories: row.calories,
      proteinG: row.protein_g,
      carbsG: row.carbs_g,
      fatsG: row.fats_g,
      fiberG: row.fiber_g,
      macrosBasis: toMacrosBasis(row.macros_basis),
      householdLabel: row.household_label,
      householdGrams: row.household_grams,
    },
    override,
  )

  return {
    id: row.id,
    catalogKey: row.catalog_key,
    gtin: row.barcode,
    name: row.name,
    brand: row.brand,
    category: row.category,
    countryCode: row.country_code,
    servingSize: Number(row.serving_size),
    // Espejo del `coalesce(f.serving_unit, 'g')` del choke point SQL.
    servingUnit: row.serving_unit ?? 'g',
    calories: macros.calories,
    proteinG: macros.proteinG,
    carbsG: macros.carbsG,
    fatsG: macros.fatsG,
    fiberG: macros.fiberG,
    sodiumMg: toNullableNumber(row.sodium_mg),
    sugarG: toNullableNumber(row.sugar_g),
    saturatedFatG: toNullableNumber(row.saturated_fat_g),
    packageQuantity: toNullableNumber(row.package_quantity),
    packageUnit: row.package_unit,
    source: row.catalog_source,
    sourceRef: row.source_ref,
    verificationStatus: row.verification_status as FoodCatalogItem['verificationStatus'],
    coachId: row.coach_id,
    orgId: row.org_id,
    macrosBasis: macros.macrosBasis,
    householdLabel: macros.householdLabel,
    householdGrams: macros.householdGrams,
    hasOverride: macros.hasOverride,
    original: macros.original,
    media: null,
  }
}

/**
 * Predicado del filtro. `hasOverride` es NULLABLE en el contrato: `undefined`/`null` significan
 * "el catalogo no aplico merge" (RPC vieja o actor sin coach), NO "este alimento no tiene
 * override". Por eso la comparacion es estricta contra `true` y nunca truthiness.
 */
export function isCoachEditedFood(item: Pick<FoodCatalogItem, 'hasOverride'>): boolean {
  return item.hasOverride === true
}

/** Deja solo los alimentos que el coach activo corrigio. */
export function filterCoachEditedFoods<T extends Pick<FoodCatalogItem, 'hasOverride'>>(
  items: readonly T[],
): T[] {
  return items.filter(isCoachEditedFood)
}

/** Minusculas sin acentos: "platano" encuentra "Plátano" y viceversa. */
function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
}

/**
 * Busqueda por nombre/marca DENTRO del universo ya cargado (modo filtro). Es en cliente a
 * proposito: son decenas de filas en memoria, y cruzarlas con `search_food_catalog_v2` obligaria
 * a intersectar dos paginaciones distintas. Consulta vacia = no filtra nada.
 */
export function matchesFoodQuery(
  item: Pick<FoodCatalogItem, 'name' | 'brand'>,
  query: string,
): boolean {
  const needle = normalizeForMatch(query)
  if (needle === '') return true
  if (normalizeForMatch(item.name).includes(needle)) return true
  return item.brand != null && normalizeForMatch(item.brand).includes(needle)
}
