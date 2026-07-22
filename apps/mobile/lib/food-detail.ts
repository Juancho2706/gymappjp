/**
 * Ficha de alimento (RN) — helpers PUROS de fuente / verificación / código de barras.
 *
 * Port 1:1 de `apps/web/src/lib/food-detail.ts:62-175` (solo la parte pura): mapea
 * `catalog_source` y `verification_status` (columnas de `public.foods`) a texto/link
 * para la UI, y agrupa un GTIN para lectura. Sin React, sin Supabase, sin resolución
 * de imagen web (en RN la foto se resuelve con `foodMediaThumbnailUrl`).
 *
 * OBLIGACIÓN DE LICENCIA (ODbL): cuando la procedencia es Open Food Facts se DEBE
 * mostrar la atribución con enlace. `getFoodSourceAttribution` centraliza ese texto
 * para que ninguna superficie lo omita; el pie del catálogo usa además la línea
 * genérica `OPEN_FOOD_FACTS_GENERIC_ATTRIBUTION`. Copys verbatim de la web.
 */

export const OPEN_FOOD_FACTS_URL = 'https://world.openfoodfacts.org'
export const USDA_FDC_URL = 'https://fdc.nal.usda.gov'

/**
 * Línea genérica de atribución OFF para el pie del catálogo de alimentos.
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
