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

import { foodCategoryFromName } from '@eva/nutrition-v2'

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

/** Bucket UNICO de las fotos del catalogo. Es constante por CHECK en la tabla (20260714220000:9-10). */
export const FOOD_MEDIA_BUCKET = 'food-media'

/** Lo que el sheet de equivalencias recibe del RPC: el path y la version, sin el bucket. */
export interface FoodMediaPathLike {
  objectPath: string | null | undefined
  version: number | null | undefined
}

/**
 * URL publica del thumbnail a partir del PATH suelto, para el sheet «1 porcion equivale a» del
 * alumno (W5.6). `get_nutrition_today_v2` emite `imagePath` + `imageVersion` y NO el objeto
 * `media` —mandarlo entero sube el payload +136 % y el cache offline de RN descarta toda entrada
 * > 750 kB (nutrition-v2-cache.ts:6)—, asi que `foodMediaThumbnailUrl` no se puede reutilizar tal
 * cual: exige un `bucket` que no viaja. Este helper lo FIJA en `food-media` y encodea el path
 * igual, segmento a segmento, para que las dos URLs sean identicas byte a byte para el mismo media.
 *
 * null si falta la base (env sin cargar) o el path (alimento sin foto). Si llega un path CON
 * `version` nula —el RPC las resuelve en el mismo `left join lateral`, asi que no deberia pasar—
 * se usa `?v=0`: la URL sigue siendo valida y el cache-busting queda estable, en vez de emitir
 * `?v=undefined`.
 */
export function foodMediaThumbnailUrlFromPath(
  media: FoodMediaPathLike | null | undefined,
  supabaseUrl: string | null | undefined = process.env.EXPO_PUBLIC_SUPABASE_URL,
): string | null {
  if (!media?.objectPath) return null
  return foodMediaThumbnailUrl(
    { bucket: FOOD_MEDIA_BUCKET, objectPath: media.objectPath, version: media.version ?? 0 },
    supabaseUrl,
  )
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

/**
 * Emoji placeholder derivado del NOMBRE del alimento. Se usa en las filas del alumno
 * (prescripcion / consumo del tab Hoy y del tab Plan), cuyo read model solo trae el
 * nombre (sin la columna `category`): deriva la categoria con la heuristica compartida
 * web/RN (`foodCategoryFromName`) y devuelve su emoji. Siempre valido (cae a "otro").
 */
export function foodCategoryEmojiFromName(name: string | null | undefined): string {
  return foodCategoryEmoji(foodCategoryFromName(name))
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
