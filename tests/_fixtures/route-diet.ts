/**
 * «Dieta» de red del modo suave — helper PURO (sin Playwright, sin red).
 *
 * Decide qué request aborta el navegador durante una tanda de QA contra producción. El objetivo
 * es bajar el peso de cada página SIN tocar nada que pueda cambiar el resultado del test:
 *
 *  - se abortan imágenes/fuentes/medios servidos por Supabase Storage, por el optimizador de
 *    imágenes de Next (`/_next/image`, que proxea justamente Storage y consume la cuota de
 *    Image Transformations) y por terceros;
 *  - se aborta TODO lo de los terceros de telemetría (PostHog, Sentry, Cloudflare Insights,
 *    Google/Meta), que no aportan nada a un smoke y sí agregan latencia y ruido en consola;
 *  - JAMÁS se aborta `/rest/`, `/auth/` ni `/api/` (los datos del propio sitio y de Supabase:
 *    abortarlos convertiría el smoke en un test de la dieta, no de la app), ni los chunks
 *    JS/CSS de Vercel (sin ellos la página no hidrata y todo falla por la razón equivocada).
 */

/** Hosts de terceros que se abortan COMPLETOS (no solo sus imágenes). */
export const THIRD_PARTY_HOST_FRAGMENTS = [
    'posthog.com',
    'i.posthog.com',
    'cloudflareinsights.com',
    'sentry.io',
    'ingest.sentry.io',
    'gstatic.com',
    'googleapis.com',
    'google-analytics.com',
    'googletagmanager.com',
    'doubleclick.net',
    'facebook.com',
    'facebook.net',
    'vercel-scripts.com',
    'vitals.vercel-insights.com',
] as const

/** Tipos de recurso "pesados" que no cambian ninguna aserción de un smoke de solo lectura. */
export const HEAVY_RESOURCE_TYPES = new Set(['image', 'font', 'media', 'imageset'])

/** Rutas intocables: datos del sitio y de Supabase. */
const NEVER_ABORT_PATH_FRAGMENTS = ['/rest/', '/auth/', '/api/'] as const

export type DietRequest = {
    url: string
    /** `request.resourceType()` de Playwright. */
    resourceType: string
}

function hostMatchesThirdParty(hostname: string): boolean {
    const host = hostname.toLowerCase()
    return THIRD_PARTY_HOST_FRAGMENTS.some(
        (fragment) => host === fragment || host.endsWith(`.${fragment}`) || host.includes(fragment),
    )
}

function isSupabaseStorage(hostname: string, pathname: string): boolean {
    const host = hostname.toLowerCase()
    const supabaseHost = host.endsWith('.supabase.co') || host.endsWith('.supabase.in')
    return (supabaseHost && pathname.includes('/storage/')) || pathname.includes('/storage/v1/')
}

function isBuildAsset(pathname: string): boolean {
    if (pathname.startsWith('/_next/static/')) return true
    return /\.(?:js|mjs|cjs|css|map)$/i.test(pathname)
}

/**
 * `true` = abortar el request. Ante cualquier duda (URL impareseable, recurso desconocido)
 * devuelve `false`: la dieta nunca debe ser la causa de un test rojo.
 */
export function shouldAbort({ url, resourceType }: DietRequest): boolean {
    let parsed: URL
    try {
        parsed = new URL(url)
    } catch {
        return false
    }

    // `data:` / `blob:` ya están en memoria: abortarlos no ahorra nada y puede romper la página.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false

    const { hostname, pathname } = parsed

    // 1. Terceros: fuera COMPLETOS y antes que nada. Las dos reglas que siguen protegen recursos
    //    del propio sitio, y aplicadas a un tercero lo blindarían por accidente: el beacon de
    //    Cloudflare y el pixel de Meta son `.js` (regla 3) y el envelope de Sentry vive bajo
    //    `/api/` (regla 2). El orden es la regla, no un detalle.
    if (hostMatchesThirdParty(hostname)) return true

    // 2. Intocables del sitio y de Supabase: datos. Va antes de cualquier regla por tipo porque
    //    `*.supabase.co/rest/...` también es "host de Supabase" y una imagen bajo `/api/` sigue
    //    siendo una respuesta del backend propio.
    if (NEVER_ABORT_PATH_FRAGMENTS.some((fragment) => pathname.includes(fragment))) return false

    // 3. Sin JS/CSS no hay app que testear.
    if (isBuildAsset(pathname)) return false

    // 4. Pesos muertos: solo si vienen de Storage o del optimizador (que proxea Storage).
    if (!HEAVY_RESOURCE_TYPES.has(resourceType)) return false
    if (pathname === '/_next/image') return true
    return isSupabaseStorage(hostname, pathname)
}
