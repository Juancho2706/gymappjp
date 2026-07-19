import {
  BRAND_OG_ALT,
  BRAND_OG_CONTENT_TYPE,
  BRAND_OG_SIZE,
  renderBrandOgImage,
} from '@/lib/og/brand-og-card'

/**
 * og:image global (convención de Next) — 1200×630 con marca EVA (SEO R1).
 * Aplica a todas las rutas públicas que no definen imagen propia; twitter:image
 * la hereda vía el post-proceso de metadata de Next. `/c/[coach_slug]` NO se ve
 * afectada: su generateMetadata define `openGraph.images` white-label propio,
 * que gana por ser el segmento más profundo.
 */

// Sin APIs dinámicas → se genera en build (cwd = apps/web, assets en disco).
export const dynamic = 'force-static'

export const alt = BRAND_OG_ALT
export const size = BRAND_OG_SIZE
export const contentType = BRAND_OG_CONTENT_TYPE

export default async function OpengraphImage() {
  return renderBrandOgImage()
}
