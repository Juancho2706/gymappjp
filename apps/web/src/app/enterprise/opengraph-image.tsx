import {
  BRAND_OG_ALT,
  BRAND_OG_CONTENT_TYPE,
  BRAND_OG_SIZE,
  renderBrandOgImage,
} from '@/lib/og/brand-og-card'

/**
 * og:image de /enterprise — misma tarjeta de marca que el root. El segmento
 * define `openGraph` propio (layout y page, sin images) y el merge de Next
 * reemplaza el objeto completo, así que sin este archivo la página quedaría
 * sin og:image. Es noindex, pero la preview importa al compartir por
 * WhatsApp/correo con leads.
 */

export const dynamic = 'force-static'

export const alt = BRAND_OG_ALT
export const size = BRAND_OG_SIZE
export const contentType = BRAND_OG_CONTENT_TYPE

export default async function OpengraphImage() {
  return renderBrandOgImage()
}
