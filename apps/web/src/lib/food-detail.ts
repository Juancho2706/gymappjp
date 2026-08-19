/**
 * Ficha de alimento — parte WEB-ONLY: resolución de la imagen.
 *
 * El modelo neutral (`FoodDetailData`) y los helpers puros de fuente / verificación /
 * código de barras se mudaron a `@eva/nutrition-v2` (`packages/nutrition-v2/food-detail.ts`):
 * estaban duplicados con `apps/mobile/lib/food-detail.ts` y `apps/mobile` no puede importar
 * de `apps/web`. Deuda F6.0 saldada en la auditoría 2026-08-17 §1.1. Importá esos símbolos
 * DESDE el paquete, no desde acá — este archivo no los re-exporta a propósito, para que haya
 * una sola fuente.
 *
 * Acá queda solo lo que depende del build web: `foodImageUrl`/`foodLightboxUrl`/
 * `foodCategoryIconUrl` leen `NEXT_PUBLIC_SUPABASE_URL` y los iconos estáticos de `/public`.
 * En RN la foto se resuelve con `foodMediaThumbnailUrl`.
 */

import type { FoodDetailData } from '@eva/nutrition-v2'
import {
  foodCategoryIconUrl,
  foodImageUrl,
  foodLightboxUrl,
} from '@/lib/food-image'

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
