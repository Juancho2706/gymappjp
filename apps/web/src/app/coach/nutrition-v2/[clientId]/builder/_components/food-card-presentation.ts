/**
 * Helpers PUROS de presentacion para las cards de alimento del builder V2.
 *
 * Sin React / Supabase: resuelven (1) la URL publica de la foto del producto desde
 * el objeto `media` del read model, y (2) el icono de categoria de respaldo (asset
 * estatico WebP servido por `@/lib/food-image`), de modo que una card NUNCA quede
 * con un hueco vacio: siempre hay foto o icono de categoria.
 *
 * Usa el modulo canonico `@/lib/food-image` para los iconos por categoria
 * (`foodCategoryIconUrl` -> `/food-icons/<categoria>.webp`, parte del build, cero
 * Image Transformations). La resolucion de la FOTO se hace aca porque el read model
 * expone un objeto `media` con `bucket` + `version` (cache-busting) que el helper
 * generico por-path no cubre.
 */

import type { FoodCatalogItem } from '@eva/nutrition-v2'
import { foodCategoryIconUrl, type FoodIconCategory } from '@/lib/food-image'

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Heuristica nombre -> categoria canonica (las 10 de `VALID_FOOD_CATEGORIES`). Se usa
// para los items dentro de una franja, que solo cargan el nombre del alimento (sin la
// columna `category` del catalogo). Orden: lo mas especifico primero (ej. "leche de
// almendras" cae en lacteo por "leche" antes que en grasa por "almendra").
const NAME_CATEGORY_KEYWORDS: ReadonlyArray<readonly [FoodIconCategory, readonly string[]]> = [
  ['lacteo', ['lacte', 'leche', 'milk', 'yogur', 'yoghur', 'queso', 'cheese', 'crema', 'mantequilla', 'butter']],
  ['grasa', ['aceite', 'oil', 'grasa', 'palta', 'aguacate', 'avocado', 'margarina', 'manteca', 'fruto seco', 'frutos secos', 'almendra', 'nuez', 'mani', 'peanut', 'semilla', 'pistacho', 'nut']],
  ['proteina', ['carne', 'meat', 'beef', 'vacuno', 'res', 'pollo', 'chicken', 'pavo', 'cerdo', 'pork', 'pescado', 'fish', 'atun', 'salmon', 'marisc', 'seafood', 'huevo', 'egg', 'protein', 'whey', 'suplemento', 'creatin']],
  ['legumbre', ['legumbre', 'legume', 'poroto', 'frijol', 'bean', 'lenteja', 'lentil', 'garbanzo', 'chickpea', 'soja', 'soya', 'tofu']],
  ['carbohidrato', ['cereal', 'grano', 'grain', 'arroz', 'rice', 'pan', 'bread', 'pasta', 'fideo', 'avena', 'oat', 'trigo', 'wheat', 'harina', 'flour', 'tortilla', 'quinoa', 'maiz', 'corn', 'papa', 'patata']],
  ['fruta', ['fruta', 'fruit', 'manzana', 'apple', 'platano', 'banana', 'berry', 'baya', 'citr', 'naranja', 'frutilla', 'uva']],
  ['verdura', ['verdura', 'vegetal', 'vegetable', 'hortaliza', 'ensalada', 'salad', 'tomate', 'lechuga', 'espinaca', 'zanahoria', 'brocoli']],
  ['bebida', ['bebida', 'beverage', 'jugo', 'juice', 'drink', 'agua', 'water', 'gaseosa', 'soda', 'refresco', 'cafe', 'coffee', 'infusion', 'tea']],
  ['snack', ['snack', 'galleta', 'cookie', 'dulce', 'candy', 'chocolate', 'postre', 'dessert', 'chips', 'golosina', 'helado']],
]

/**
 * Mapea el nombre de un alimento (texto libre, es/en, con o sin tildes) a una de las
 * 10 categorias canonicas para elegir el icono de respaldo. Sin match -> `'otro'`.
 * Nunca lanza.
 */
export function foodCategoryFromName(name: string | null | undefined): FoodIconCategory {
  if (!name) return 'otro'
  const normalized = stripAccents(name).toLowerCase().trim()
  if (normalized === '') return 'otro'
  for (const [category, keywords] of NAME_CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => normalized.includes(kw))) return category
  }
  return 'otro'
}

/** URL del icono estatico de categoria a partir del NOMBRE de un alimento. */
export function foodCategoryIconUrlFromName(name: string | null | undefined): string {
  return foodCategoryIconUrl(foodCategoryFromName(name))
}

/**
 * Resuelve la URL publica de la foto del producto desde el objeto `media` del read
 * model. Puro: recibe la base (`NEXT_PUBLIC_SUPABASE_URL`) como argumento. Devuelve
 * `null` si no hay media o falta la base. Codifica el path segmento a segmento y
 * agrega `?v=version` para cache-busting (mismo contrato que el scanner/hub).
 */
export function resolveFoodImageUrl(
  media: FoodCatalogItem['media'],
  supabaseBaseUrl: string | null | undefined,
): string | null {
  if (!media) return null
  const base = supabaseBaseUrl?.replace(/\/$/, '')
  if (!base) return null
  const path = media.objectPath.split('/').map(encodeURIComponent).join('/')
  return `${base}/storage/v1/object/public/${encodeURIComponent(media.bucket)}/${path}?v=${media.version}`
}

/** Vista de imagen de una card: foto del producto (si existe) + icono de respaldo. */
export interface FoodCardImage {
  /** URL de la foto del producto, o `null` si hay que mostrar el icono de categoria. */
  imageUrl: string | null
  /** URL del icono estatico de categoria (respaldo garantizado, nunca vacio). */
  iconUrl: string
  /** Texto alternativo (nombre del alimento) para accesibilidad. */
  alt: string
}

/**
 * Construye la vista de imagen de una card a partir de un item del catalogo. El icono
 * de respaldo sale de la columna `category` (una de las 10 canonicas); si es nula o
 * desconocida, `foodCategoryIconUrl` cae a `otro`.
 */
export function foodCardImage(
  item: Pick<FoodCatalogItem, 'name' | 'category' | 'media'>,
  supabaseBaseUrl: string | null | undefined,
): FoodCardImage {
  return {
    imageUrl: resolveFoodImageUrl(item.media, supabaseBaseUrl),
    iconUrl: foodCategoryIconUrl(item.category),
    alt: item.name,
  }
}
