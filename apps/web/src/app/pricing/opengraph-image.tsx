import {
  BRAND_OG_ALT,
  BRAND_OG_CONTENT_TYPE,
  BRAND_OG_SIZE,
  renderBrandOgImage,
} from '@/lib/og/brand-og-card'

/**
 * og:image de /pricing — misma tarjeta de marca que el root. Necesario porque
 * este segmento define `openGraph` propio en config y el merge de Next
 * reemplaza el objeto completo (la imagen file-based del root NO se hereda).
 * El title/description propios de /pricing se conservan: el merge estático
 * solo inyecta `images`.
 */

export const dynamic = 'force-static'

export const alt = BRAND_OG_ALT
export const size = BRAND_OG_SIZE
export const contentType = BRAND_OG_CONTENT_TYPE

export default async function OpengraphImage() {
  return renderBrandOgImage()
}
