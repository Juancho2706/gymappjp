/**
 * Ficha de alimento — modelo compartido + helpers PUROS de fuente / verificación.
 *
 * Sin React, sin Supabase: solo mapea `catalog_source` y `verification_status`
 * (columnas de `public.foods`) a texto/link para la UI. Reutilizable por el hub
 * de alimentos V1 del coach y por las superficies V2 del alumno.
 *
 * OBLIGACIÓN DE LICENCIA (ODbL): cuando la procedencia es Open Food Facts se DEBE
 * mostrar la atribución con enlace. `getFoodSourceAttribution` centraliza ese texto
 * para que ninguna superficie lo omita.
 */

import {
  foodCategoryIconUrl,
  foodImageUrl,
  foodLightboxUrl,
} from '@/lib/food-image'

/** Forma neutral que consume `FoodDetailSheet` (camelCase, agnóstica de la capa de datos). */
export interface FoodDetailData {
  id: string
  name: string
  brand: string | null
  category: string | null
  /** Macros por 100 g/ml (o por porción base `servingSize`). */
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
  fiberG: number | null
  sodiumMg: number | null
  sugarG: number | null
  saturatedFatG: number | null
  isLiquid: boolean
  servingSize: number
  servingUnit: string | null
  /** Porción casera: cuántos gramos pesa 1 `householdLabel` (ej. 1 taza ≈ 240 g). */
  householdGrams: number | null
  householdLabel: string | null
  /** Envase declarado del producto (ej. 500 ml, 1 kg). */
  packageQuantity: number | null
  packageUnit: string | null
  /** GTIN/EAN/UPC normalizado (solo dígitos) o null. */
  barcode: string | null
  countryCode: string | null
  /** `foods.catalog_source`: eva | coach | team | import | open_food_facts | usda | other. */
  source: string
  /** `foods.verification_status`: unverified | community | coach_verified | eva_verified | rejected. */
  verificationStatus: string
  /**
   * Path del objeto de la foto de producto en el bucket `food-media`
   * (ej. `off/3/012/345/front.jpg`) o null. Se resuelve a URL con `foodImageUrl`.
   */
  imagePath: string | null
  /**
   * URL externa de la foto (`food_media.source_url`) para el enlace "Ver original"
   * del lightbox, o null si la fila no la trae.
   */
  imageSourceUrl: string | null
}

export const OPEN_FOOD_FACTS_URL = 'https://world.openfoodfacts.org'
export const USDA_FDC_URL = 'https://fdc.nal.usda.gov'

/**
 * Línea genérica de atribución OFF para el footer/about del hub de alimentos.
 * Discreta, una sola frase — cumple ODbL a nivel de catálogo aunque una ficha
 * puntual no se abra.
 */
export const OPEN_FOOD_FACTS_GENERIC_ATTRIBUTION =
  'Parte de los datos de productos proviene de Open Food Facts, disponible bajo licencia ODbL.'

export interface FoodSourceAttribution {
  /** Etiqueta corta para el campo "Fuente" de la ficha (ej. "Open Food Facts"). */
  label: string
  /** Frase completa de atribución que la ficha debe renderizar (obligatoria si `requiresAttribution`). */
  attributionLine: string
  /** URL externa de la fuente (o null si no aplica). */
  href: string | null
  /** true = hay obligación de licencia que exige mostrar la atribución + link (ODbL). */
  requiresAttribution: boolean
}

/**
 * Mapea `foods.catalog_source` → texto/link de atribución.
 * Fuente desconocida cae en "Otra fuente" (nunca lanza).
 */
export function getFoodSourceAttribution(source: string | null | undefined): FoodSourceAttribution {
  switch (source) {
    case 'open_food_facts':
      return {
        label: 'Open Food Facts',
        attributionLine: 'Datos de productos: Open Food Facts (ODbL)',
        href: OPEN_FOOD_FACTS_URL,
        requiresAttribution: true,
      }
    case 'usda':
      return {
        label: 'USDA FoodData Central',
        attributionLine: 'Fuente: USDA FoodData Central',
        href: USDA_FDC_URL,
        requiresAttribution: false,
      }
    case 'eva':
      return {
        label: 'Catálogo EVA',
        attributionLine: 'Fuente: catálogo EVA',
        href: null,
        requiresAttribution: false,
      }
    case 'coach':
      return {
        label: 'Alimento del coach',
        attributionLine: 'Fuente: creado por tu coach',
        href: null,
        requiresAttribution: false,
      }
    case 'team':
      return {
        label: 'Alimento del equipo',
        attributionLine: 'Fuente: catálogo del equipo',
        href: null,
        requiresAttribution: false,
      }
    case 'import':
      return {
        label: 'Importado',
        attributionLine: 'Fuente: importación de catálogo',
        href: null,
        requiresAttribution: false,
      }
    default:
      return {
        label: 'Otra fuente',
        attributionLine: 'Fuente: otra',
        href: null,
        requiresAttribution: false,
      }
  }
}

export type FoodVerificationTone = 'verified' | 'community' | 'neutral' | 'danger'

export interface FoodVerificationLabel {
  label: string
  tone: FoodVerificationTone
}

/**
 * Mapea `foods.verification_status` → etiqueta + tono para el badge de la ficha.
 * Estado desconocido cae en "Sin verificar".
 */
export function getFoodVerificationLabel(status: string | null | undefined): FoodVerificationLabel {
  switch (status) {
    case 'eva_verified':
      return { label: 'Verificado por EVA', tone: 'verified' }
    case 'coach_verified':
      return { label: 'Verificado por tu coach', tone: 'verified' }
    case 'community':
      return { label: 'Verificado por la comunidad', tone: 'community' }
    case 'rejected':
      return { label: 'Rechazado', tone: 'danger' }
    case 'unverified':
    default:
      return { label: 'Sin verificar', tone: 'neutral' }
  }
}

/** Formatea un código de barras para lectura (agrupa dígitos; null → guion). */
export function formatBarcode(barcode: string | null | undefined): string {
  if (!barcode) return '—'
  const digits = barcode.replace(/\D/g, '')
  if (digits.length === 0) return '—'
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}


/**
 * Imagen resuelta de la ficha del alimento (presentación PURA).
 *
 * Combina la foto de producto (si existe) con el icono estático de categoría
 * como fallback. No consume Image Transformations: las URLs apuntan al bucket
 * público `food-media` (fotos) o a `/food-icons/*.webp` (iconos del build).
 */
export interface FoodDetailImage {
  /** true = hay foto de producto real (renderizar `<img>`); false = usar icono. */
  hasPhoto: boolean
  /** URL de la foto tamaño base para el header de la ficha, o null. */
  headerUrl: string | null
  /** URL de la variante grande (512px) para el lightbox, o null. */
  lightboxUrl: string | null
  /** URL de respaldo (tamaño base) si la variante grande falla al cargar. */
  fallbackUrl: string | null
  /** Icono estático de categoría (siempre presente; cae a `otro`). */
  iconUrl: string
  /** URL externa "Ver original" (o null si no aplica). */
  sourceUrl: string | null
}

/**
 * Resuelve las URLs de imagen de una ficha. Puro y testeable: delega en los
 * helpers de `food-image` (que leen `NEXT_PUBLIC_SUPABASE_URL`). Si no hay
 * `imagePath` o falta la base pública, `hasPhoto` es false y la UI muestra el
 * icono de categoría.
 */
export function resolveFoodDetailImage(
  detail: Pick<FoodDetailData, 'imagePath' | 'category' | 'imageSourceUrl'>,
): FoodDetailImage {
  const headerUrl = foodImageUrl(detail.imagePath)
  const lightboxUrl = foodLightboxUrl(detail.imagePath)
  return {
    hasPhoto: headerUrl != null,
    headerUrl,
    lightboxUrl,
    fallbackUrl: headerUrl,
    iconUrl: foodCategoryIconUrl(detail.category),
    sourceUrl: detail.imageSourceUrl ?? null,
  }
}
