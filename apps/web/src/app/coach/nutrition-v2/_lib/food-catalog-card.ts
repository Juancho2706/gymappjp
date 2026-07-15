/**
 * Helpers PUROS del listado de alimentos del hub coach V2.
 *
 * Sin React, sin Supabase: mapean una fila del read model `FoodCatalogItem`
 * (salida de `search_food_catalog_v2`, validada por Zod v4) a:
 *  - un `FoodCatalogCardModel` compacto para las cards del listado, y
 *  - un `FoodDetailData` completo para abrir `FoodDetailSheet` SIN un segundo
 *    round-trip a la base (perf: instancia Supabase Micro).
 *
 * La URL del thumbnail se resuelve desde el objeto `media` (bucket + objectPath)
 * con el mismo esquema publico que usa el scanner de alimentos.
 */

import type { FoodCatalogItem } from '@eva/nutrition-v2'
import {
  getFoodSourceAttribution,
  getFoodVerificationLabel,
  type FoodDetailData,
  type FoodVerificationTone,
} from '@/lib/food-detail'

export interface FoodCatalogCardModel {
  id: string
  name: string
  brand: string | null
  /** Envase declarado (ej. "500 ml", "1 kg") o null. */
  packageLabel: string | null
  /** Etiqueta corta de la fuente del catalogo (ej. "Open Food Facts"). */
  sourceLabel: string
  /** Etiqueta + tono del estado de verificacion para el badge. */
  verificationLabel: string
  verificationTone: FoodVerificationTone
  /** URL publica del thumbnail (product photo / ilustracion) o null. */
  thumbnailUrl: string | null
  /** Base de las macros mostradas ("por 100 g" / "por 100 ml"). */
  basisLabel: string
  /** Macros compactas ya formateadas para la card. */
  calories: string
  proteinG: string
  carbsG: string
  fatsG: string
}

/** Formatea un macro: entero sin decimales, resto con 1 decimal. */
function fmt(value: number, digits = 1): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits)
}

function isLiquidUnit(servingUnit: string | null | undefined): boolean {
  return servingUnit === 'ml'
}

/**
 * Resuelve la URL publica de una imagen del catalogo desde su objeto `media`.
 * Puro: recibe la base (`NEXT_PUBLIC_SUPABASE_URL`) como argumento. Devuelve null
 * si no hay media o falta la base. Codifica el path segmento a segmento y agrega
 * `?v=version` para cache-busting (mismo contrato que el scanner).
 */
export function resolveFoodMediaUrl(
  media: FoodCatalogItem['media'],
  supabaseBaseUrl: string | null | undefined,
): string | null {
  if (!media) return null
  const base = supabaseBaseUrl?.replace(/\/$/, '')
  if (!base) return null
  const path = media.objectPath.split('/').map(encodeURIComponent).join('/')
  return `${base}/storage/v1/object/public/${encodeURIComponent(media.bucket)}/${path}?v=${media.version}`
}

/**
 * Mapea una fila del catalogo (`FoodCatalogItem`) al modelo de card del listado.
 * Puro y testeable: la base de Supabase entra como argumento.
 */
export function foodCatalogItemToCardModel(
  item: FoodCatalogItem,
  supabaseBaseUrl: string | null | undefined,
): FoodCatalogCardModel {
  const source = getFoodSourceAttribution(item.source)
  const verification = getFoodVerificationLabel(item.verificationStatus)
  const basisLabel = isLiquidUnit(item.servingUnit) ? 'por 100 ml' : 'por 100 g'
  const packageLabel =
    item.packageQuantity != null && item.packageUnit
      ? `${fmt(item.packageQuantity, 0)} ${item.packageUnit}`
      : null

  return {
    id: item.id,
    name: item.name,
    brand: item.brand,
    packageLabel,
    sourceLabel: source.label,
    verificationLabel: verification.label,
    verificationTone: verification.tone,
    thumbnailUrl: resolveFoodMediaUrl(item.media, supabaseBaseUrl),
    basisLabel,
    calories: fmt(item.calories, 0),
    proteinG: fmt(item.proteinG),
    carbsG: fmt(item.carbsG),
    fatsG: fmt(item.fatsG),
  }
}

/**
 * Construye el `FoodDetailData` que consume `FoodDetailSheet` a partir del item
 * ya cargado por la busqueda. Evita un segundo fetch al tocar la card. La ficha
 * expone la atribucion de fuente/verificacion via los helpers de `food-detail`.
 *
 * `householdGrams`/`householdLabel` no viajan en el read model del catalogo, asi
 * que quedan en null (la ficha los oculta). `isLiquid` se deriva de la unidad.
 */
export function foodCatalogItemToDetail(item: FoodCatalogItem): FoodDetailData {
  return {
    id: item.id,
    name: item.name,
    brand: item.brand,
    category: item.category,
    calories: item.calories,
    proteinG: item.proteinG,
    carbsG: item.carbsG,
    fatsG: item.fatsG,
    fiberG: item.fiberG,
    sodiumMg: item.sodiumMg,
    sugarG: item.sugarG,
    saturatedFatG: item.saturatedFatG,
    isLiquid: isLiquidUnit(item.servingUnit),
    servingSize: item.servingSize,
    servingUnit: item.servingUnit,
    householdGrams: null,
    householdLabel: null,
    packageQuantity: item.packageQuantity,
    packageUnit: item.packageUnit,
    barcode: item.gtin,
    countryCode: item.countryCode,
    source: item.source,
    verificationStatus: item.verificationStatus,
    imagePath: item.media?.objectPath ?? null,
    imageSourceUrl: item.media?.sourceUrl ?? null,
  }
}
