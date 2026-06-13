/**
 * Rutas públicas de marca bajo `public/LOGOS/`.
 * Para previews en WhatsApp/X: URL absoluta vía `metadataBase`; en producción definir `NEXT_PUBLIC_SITE_URL`.
 */
export const BRAND_LOGO_WEB = '/LOGOS/eva-wordmark-outline.png'

/** Marca figurativa (negro + borde blanco) para landing en tema claro */
export const LANDING_LOGO_LIGHT_MARK = '/LOGOS/LOGO NEGRO SIN LETRAS SIN BG BORDE BLANCO.png'

export const BRAND_APP_ICON = '/LOGOS/eva-icon.png'
/** Ícono PWA EVA cuadrado 512×512 (purpose:any) — fallback cuando el coach/team no tiene logo. */
export const BRAND_APP_ICON_512 = '/LOGOS/icon-512.png'
/** Ícono PWA EVA maskable 512×512 con safe-zone 80% (purpose:maskable) — no se recorta en Android. */
export const BRAND_APP_ICON_MASKABLE = '/LOGOS/icon-512-maskable.png'
export const BRAND_PRIMARY_COLOR = '#10B981'
/** Color primario del sistema EVA cuando el coach no usa colores personalizados */
export const SYSTEM_PRIMARY_COLOR = '#007AFF'

/**
 * Correo de ventas/contacto comercial. Fuente unica para el mailto del embudo
 * Teams y Empresas (antes era string literal repetido en 4+ sitios).
 */
export const SALES_EMAIL = 'contacto@eva-app.cl'

/**
 * Arma el `mailto:` del CTA Teams con subject prefijado para triage del inbox
 * de ventas (distinguir lead Teams de soporte). Regla de seguridad (D4):
 * SIN body y SIN parametros con contexto del usuario — un mailto no debe filtrar
 * datos del visitante. El argumento `src` es solo trazabilidad opcional para el
 * call site; NO se inyecta en la URL del mailto.
 */
export function teamsContactMailto(_src?: string): string {
  const subject = encodeURIComponent('EVA Teams - quiero conversar')
  return `mailto:${SALES_EMAIL}?subject=${subject}`
}

/** Debe coincidir con las dimensiones reales del PNG (scrapers son sensibles a width/height erróneos). */
export const BRAND_OG_IMAGE = '/LOGOS/eva-og.png'
export const BRAND_OG_IMAGE_WIDTH = 1920
export const BRAND_OG_IMAGE_HEIGHT = 1080
