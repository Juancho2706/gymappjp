/**
 * Helpers PUROS para resolver imagenes de alimentos (nutrition-v2).
 *
 * Tres resoluciones, sin React ni Supabase client:
 *  - `foodImageUrl(path)`      -> URL publica del objeto en el bucket `food-media`.
 *  - `foodCategoryIconUrl(cat)`-> icono estatico por categoria (build de Vercel).
 *  - `foodLightboxUrl(path)`   -> variante grande (512px) para el lightbox.
 *
 * Los iconos por categoria son assets ESTATICOS servidos desde
 * `apps/web/public/food-icons/<categoria>.webp` (parte del build, NO tocan
 * Supabase ni consumen Image Transformations). Se generaron a 96px WebP desde
 * Fluent Emoji.
 *
 * Atribucion de iconos: Fluent Emoji (c) Microsoft Corporation, licencia MIT.
 * https://github.com/microsoft/fluentui-emoji
 */

/**
 * Las 10 categorias de alimentos del catalogo (espejo de `VALID_FOOD_CATEGORIES`
 * en `@eva/schemas`). Cada una tiene un icono estatico homonimo.
 */
export const FOOD_ICON_CATEGORIES = [
  'proteina',
  'carbohidrato',
  'grasa',
  'lacteo',
  'fruta',
  'verdura',
  'legumbre',
  'bebida',
  'snack',
  'otro',
] as const

export type FoodIconCategory = (typeof FOOD_ICON_CATEGORIES)[number]

const FOOD_ICON_SET: ReadonlySet<string> = new Set(FOOD_ICON_CATEGORIES)

/** Base publica del bucket `food-media`, o null si falta la env. */
function foodMediaBase(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  const base = raw?.replace(/\/+$/, '')
  return base ? `${base}/storage/v1/object/public/food-media` : null
}

/** Codifica un object path segmento a segmento (preserva los `/`). */
function encodePath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')
}

/**
 * URL publica de una imagen almacenada en el bucket `food-media`.
 * Recibe el `object path` relativo (ej. `off/3/012/345/front.jpg`).
 * Devuelve null si no hay path o falta `NEXT_PUBLIC_SUPABASE_URL`.
 */
export function foodImageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  const trimmed = path.trim().replace(/^\/+/, '')
  if (!trimmed) return null
  const base = foodMediaBase()
  if (!base) return null
  return `${base}/${encodePath(trimmed)}`
}

/**
 * Ruta del icono estatico por categoria. Siempre devuelve una ruta valida:
 * cae a `otro` si la categoria es desconocida, null o vacia.
 */
export function foodCategoryIconUrl(
  category: string | null | undefined,
): string {
  const key =
    category && FOOD_ICON_SET.has(category) ? (category as FoodIconCategory) : 'otro'
  return `/food-icons/${key}.webp`
}

/**
 * URL de la variante grande (512px) para el lightbox de la ficha del alimento.
 *
 * Convencion del bucket: las fotos de Open Food Facts viven bajo `off/...`; la
 * variante de 512px se guarda en `off/512/<archivo>`. Para un path `off/*` se
 * reescribe al archivo bajo `off/512/`; para cualquier otro path se usa la
 * imagen tal cual (`foodImageUrl`). Devuelve null si no hay path/base.
 */
export function foodLightboxUrl(path: string | null | undefined): string | null {
  if (!path) return null
  const trimmed = path.trim().replace(/^\/+/, '')
  if (!trimmed) return null
  if (trimmed.startsWith('off/')) {
    const file = trimmed.split('/').filter(Boolean).pop()
    if (!file) return null
    return foodImageUrl(`off/512/${file}`)
  }
  return foodImageUrl(trimmed)
}
