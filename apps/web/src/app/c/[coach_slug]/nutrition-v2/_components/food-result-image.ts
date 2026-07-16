import type { FoodCatalogItem } from '@eva/nutrition-v2'
import { foodCategoryIconUrl } from '@/lib/food-image'

/**
 * Presentacion PURA (sin React / sin Supabase) de la imagen de un resultado de
 * busqueda del catalogo para el dialogo "Registrar alimento" del ALUMNO. Da paridad
 * con la card del coach: foto real del producto (cuando el read model trae `media`)
 * con respaldo GARANTIZADO al icono estatico de la categoria (`/food-icons/<cat>.webp`,
 * parte del build -> cero Image Transformations). Una fila NUNCA queda sin imagen.
 *
 * El read model de busqueda del alumno YA expone `media` y `category`
 * (`FoodCatalogItemSchema`); esta capa solo las resuelve a URLs.
 */

export interface FoodResultImage {
  /** URL publica de la foto del producto, o `null` si hay que mostrar el icono. */
  imageUrl: string | null
  /** URL del icono estatico de categoria (respaldo garantizado, nunca vacio). */
  iconUrl: string
  /** Texto alternativo (nombre del alimento) para accesibilidad. */
  alt: string
}

/**
 * Resuelve la URL publica de la foto desde el objeto `media` del read model. Puro:
 * recibe la base (`NEXT_PUBLIC_SUPABASE_URL`) como argumento. Devuelve `null` si no
 * hay media o falta la base. Codifica el path segmento a segmento y agrega
 * `?v=version` para cache-busting (mismo contrato que la card del coach/scanner).
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

/** Vista de imagen de un resultado de busqueda: foto del producto + icono de respaldo. */
export function foodResultImage(
  item: Pick<FoodCatalogItem, 'name' | 'category' | 'media'>,
  supabaseBaseUrl: string | null | undefined,
): FoodResultImage {
  return {
    imageUrl: resolveFoodImageUrl(item.media, supabaseBaseUrl),
    iconUrl: foodCategoryIconUrl(item.category),
    alt: item.name,
  }
}
