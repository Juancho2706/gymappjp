/**
 * nutrition-v2-food-media — helpers PUROS (sin react-native / supabase) de presentacion del catalogo
 * de alimentos en RN: URL publica del thumbnail, emoji de categoria como placeholder local y la
 * atribucion de licencia ODbL de Open Food Facts.
 *
 * Fotos: los read models del catalogo traen `media` (bucket + objectPath + version). La URL publica
 * se arma igual que en la web (`resolveFoodMediaUrl` / `foodImageUrl`) pero leyendo la env de RN
 * (`EXPO_PUBLIC_SUPABASE_URL`). No consume Image Transformations: apunta al bucket publico directo.
 *
 * Placeholder por categoria: en RN NO se descargan los iconos remotos por categoria (los .webp del
 * build de Vercel). Se usa un emoji local por categoria como fallback simple cuando no hay foto; si
 * ademas el emoji no aplica, el kit (`FoodThumbnail`) cae a un icono lucide local. Cero red, cero
 * assets nuevos en el bundle.
 *
 * ATRIBUCION ODbL (obligacion de licencia): cuando la procedencia de un alimento es Open Food Facts
 * (`source === 'open_food_facts'`) se DEBE mostrar la atribucion. El read model del catalogo SI
 * expone `source` por item, asi que la atribucion se aplica PER-ITEM donde el alimento es OFF; para
 * el pie de una lista mixta, `catalogHasOpenFoodFactsSource` decide si mostrar la linea generica.
 */

/** Forma minima del objeto `media` de un item del catalogo. */
export interface FoodMediaLike {
  bucket: string
  objectPath: string
  version: number
}

/** Base publica del bucket `food-media` desde la env de RN, o null si falta. */
export function foodMediaBaseUrl(
  supabaseUrl: string | null | undefined = process.env.EXPO_PUBLIC_SUPABASE_URL,
): string | null {
  const base = supabaseUrl?.replace(/\/+$/, '')
  return base ? base : null
}

/**
 * URL publica del thumbnail de un `media` del catalogo. Codifica el path segmento a segmento y
 * agrega `?v=version` para cache-busting (mismo contrato que el scanner web/RN). null si no hay
 * media o falta la base.
 */
export function foodMediaThumbnailUrl(
  media: FoodMediaLike | null | undefined,
  supabaseUrl: string | null | undefined = process.env.EXPO_PUBLIC_SUPABASE_URL,
): string | null {
  if (!media) return null
  const base = foodMediaBaseUrl(supabaseUrl)
  if (!base) return null
  const encodedPath = media.objectPath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  if (!encodedPath) return null
  return `${base}/storage/v1/object/public/${encodeURIComponent(media.bucket)}/${encodedPath}?v=${media.version}`
}

/** Emoji local por categoria del catalogo (espejo de `FOOD_ICON_CATEGORIES` de web). */
const FOOD_CATEGORY_EMOJI: Record<string, string> = {
  proteina: '🍗',
  carbohidrato: '🍚',
  grasa: '🥑',
  lacteo: '🥛',
  fruta: '🍎',
  verdura: '🥦',
  legumbre: '🫘',
  bebida: '🥤',
  snack: '🍪',
  otro: '🍽️',
}

/** Emoji placeholder por categoria; cae a "otro" (🍽️) para categoria desconocida/null. */
export function foodCategoryEmoji(category: string | null | undefined): string {
  if (category && category in FOOD_CATEGORY_EMOJI) return FOOD_CATEGORY_EMOJI[category]
  return FOOD_CATEGORY_EMOJI.otro
}

/** Linea de atribucion OFF (ODbL) para el resultado del scanner y la ficha del alimento. */
export const OPEN_FOOD_FACTS_ODBL_LINE = 'Datos: Open Food Facts (ODbL)'

/** Linea generica de catalogo para el pie de una lista con al menos un item OFF. */
export const CATALOG_ODBL_GENERIC_LINE =
  'Parte de los datos proviene de Open Food Facts (ODbL).'

/**
 * PURA: linea de atribucion ODbL a mostrar para un item segun su `source`, o null si la fuente no
 * exige atribucion. Solo Open Food Facts la requiere.
 */
export function foodOdblAttributionLine(source: string | null | undefined): string | null {
  return source === 'open_food_facts' ? OPEN_FOOD_FACTS_ODBL_LINE : null
}

/** PURA: ¿alguna fila de la lista proviene de Open Food Facts? Decide el pie generico ODbL. */
export function catalogHasOpenFoodFactsSource(
  items: ReadonlyArray<{ source?: string | null }>,
): boolean {
  return items.some((item) => item.source === 'open_food_facts')
}
