import { BRAND_PRIMARY_COLOR } from '@/lib/brand-assets'

/**
 * Medidas de la imagen Open Graph por coach (`api/og/[coach_slug]`). 1200×630 es la proporción
 * 1.91:1 que WhatsApp, Meta y X muestran sin recortar; la estática de EVA (1920×1080) sigue siendo
 * el fallback del resto del sitio.
 */
export const COACH_OG_IMAGE_WIDTH = 1200
export const COACH_OG_IMAGE_HEIGHT = 630

/** Margen interior del lienzo (el mismo que aplica el route). */
export const COACH_OG_PADDING = 72

/** Ancho REAL disponible para el arte: 1200 − 2×72 = 1056 px. */
export const COACH_OG_CONTENT_WIDTH = COACH_OG_IMAGE_WIDTH - 2 * COACH_OG_PADDING

/**
 * Cache de la preview. Vercel la consume en el edge (`x-vercel-cache: HIT`) y manda
 * `public, max-age=3600` río abajo. NO subir estos valores: la invalidación real cuando el coach
 * cambia el logo la hace el `?v=` de `coachOgImageVersion`, no un TTL más corto.
 */
export const COACH_OG_CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'

/** Hex de 6 dígitos o el fallback. Los colores del coach son texto libre en DB. */
export function safeHexColor(color: string | null | undefined, fallback: string): string {
    return color && /^#[0-9A-Fa-f]{6}$/.test(color) ? color : fallback
}

function toLinearChannel(c: number): number {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** Luminancia relativa WCAG del hex (0 = negro, 1 = blanco). */
function relativeLuminance(hex: string): number {
    const clean = hex.replace('#', '')
    const r = toLinearChannel(parseInt(clean.substring(0, 2), 16) / 255)
    const g = toLinearChannel(parseInt(clean.substring(2, 4), 16) / 255)
    const b = toLinearChannel(parseInt(clean.substring(4, 6), 16) / 255)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * ¿El fondo es oscuro? Se decide por contraste WCAG: oscuro = el blanco contrasta más que el negro
 * sobre él. Es el mismo criterio con el que el producto elige la variante `logo_url_dark` (el logo
 * que el coach subió PARA fondos oscuros).
 */
export function isDarkBackground(hex: string): boolean {
    const lum = relativeLuminance(hex)
    const vsWhite = 1.05 / (lum + 0.05)
    const vsBlack = (lum + 0.05) / 0.05
    return vsWhite >= vsBlack
}

/**
 * Composición de la preview (owner 02-09): SOLO el logo del coach, centrado sobre su color de
 * marca. Sin nombre, sin tagline, sin sello EVA — la tarjeta de WhatsApp ya trae título y
 * descripción, repetirlos dentro de la imagen era ruido.
 *
 * - `logo`: el logo del coach sobre `primary_color`. Con fondo oscuro gana `logo_url_dark` (es
 *   justamente la variante que el coach subió para fondos oscuros); con fondo claro, el normal.
 *   Si solo existe una de las dos, esa se usa: un logo con contraste imperfecto se ve; ninguno, no.
 * - `brandName`: sin logo, el nombre de la marca sobre el mismo fondo.
 * - `eva`: sin logo y sin nombre, la figura EVA sobre azul EVA.
 */
export type CoachOgArtwork =
    | { kind: 'logo'; background: string; logoUrl: string }
    | { kind: 'brandName'; background: string; brandName: string; color: string }
    | { kind: 'eva'; background: string }

export interface CoachOgArtworkInput {
    /** `primary_color` del coach (texto libre en DB: se valida acá). */
    primaryColor: string | null | undefined
    logoUrl: string | null | undefined
    logoUrlDark: string | null | undefined
    brandName: string | null | undefined
    /**
     * `isBrandingAllowed(tier)`. Red de seguridad FAIL-CLOSED: solo cae en `false` un tier
     * inválido/stale (el white-label es de TODOS los planes desde Pricing v3), y en ese caso la
     * preview es la de EVA.
     */
    brandingAllowed: boolean
}

export function resolveCoachOgArtwork(input: CoachOgArtworkInput): CoachOgArtwork {
    if (!input.brandingAllowed) return { kind: 'eva', background: BRAND_PRIMARY_COLOR }

    const background = safeHexColor(input.primaryColor, BRAND_PRIMARY_COLOR)
    const light = input.logoUrl?.trim() || null
    const dark = input.logoUrlDark?.trim() || null
    const logoUrl = isDarkBackground(background) ? (dark ?? light) : (light ?? dark)
    if (logoUrl) return { kind: 'logo', background, logoUrl }

    const brandName = input.brandName?.trim() || ''
    if (!brandName) return { kind: 'eva', background: BRAND_PRIMARY_COLOR }

    // El owner lo pidió en blanco; el negro solo entra cuando el blanco directamente no se lee
    // sobre el color del coach (amarillos, pasteles) — una preview ilegible es peor que el matiz.
    const color = isDarkBackground(background) ? '#FFFFFF' : '#0B0B0C'
    return { kind: 'brandName', background, brandName, color }
}

/**
 * Degradación cuando satori no pudo dibujar el logo remoto (formato que no soporta, URL caída):
 * se cae al nombre de la marca y, sin nombre, a la figura EVA. Nunca a un 500 ni a un PNG
 * truncado — WhatsApp descarta la miniatura entera.
 */
export function coachOgFallbackArtwork(artwork: CoachOgArtwork, brandName: string | null | undefined): CoachOgArtwork {
    if (artwork.kind !== 'logo') return artwork
    return resolveCoachOgArtwork({
        primaryColor: artwork.background,
        logoUrl: null,
        logoUrlDark: null,
        brandName,
        brandingAllowed: true,
    })
}

/**
 * Ancho medio de un glifo sans-serif bold, en múltiplos del tamaño de fuente. Es una estimación
 * (satori no expone métricas antes de dibujar) deliberadamente GENEROSA: sobrestimar hace que el
 * nombre entre con aire, subestimar lo recorta.
 */
const COACH_OG_GLYPH_WIDTH_RATIO = 0.62

/** Piso del tamaño de fuente: por debajo el nombre deja de leerse en la miniatura de WhatsApp. */
export const COACH_OG_BRAND_NAME_MIN_FONT_SIZE = 40

/** Ancho estimado de un texto a un tamaño de fuente dado, en px. */
export function estimateCoachOgTextWidth(text: string, fontSize: number): number {
    return text.length * fontSize * COACH_OG_GLYPH_WIDTH_RATIO
}

/** La palabra más larga: es la que NO se puede partir en dos líneas y decide si algo desborda. */
function longestWordLength(brandName: string): number {
    return brandName.split(/\s+/).reduce((max, word) => Math.max(max, word.length), 0)
}

/**
 * Tamaño del nombre de la marca en la variante sin logo (1200×630, sans-serif).
 *
 * Dos escalones: el largo total marca el tamaño base, y después la PALABRA más larga lo baja hasta
 * que entra en el ancho útil. Sin el segundo paso, un nombre sin espacios («EntrenamientoPersonal
 * Pro» escrito de corrido) se dibujaba a 84 px ≈ 1.330 px sobre 1.056 px útiles y satori lo
 * RECORTABA — no lo achicaba solo (hallazgo B-7).
 */
export function coachOgBrandNameFontSize(brandName: string): number {
    const base = brandName.length > 22 ? 84 : brandName.length > 12 ? 116 : 150
    const longest = longestWordLength(brandName)
    if (longest === 0) return base
    const fits = Math.floor(COACH_OG_CONTENT_WIDTH / (longest * COACH_OG_GLYPH_WIDTH_RATIO))
    return Math.max(COACH_OG_BRAND_NAME_MIN_FONT_SIZE, Math.min(base, fits))
}

/** Estilo del bloque del nombre de la marca (lo consume el JSX del route). */
export interface CoachOgBrandNameStyle {
    display: 'flex'
    flexWrap: 'wrap'
    justifyContent: 'center'
    maxWidth: '100%'
    textAlign: 'center'
    wordBreak: 'break-word'
    fontSize: number
    fontWeight: number
    lineHeight: number
    color: string
}

/**
 * Estilo completo del nombre de la marca. Vive acá (y no suelto en el JSX) para que el no-desborde
 * sea testeable: `flexWrap` + `maxWidth: 100%` permiten la SEGUNDA línea, `wordBreak` parte la
 * palabra que igual no entra, y `coachOgBrandNameFontSize` garantiza que la palabra más larga quepa.
 * Antes el bloque era un flex con `overflow: hidden` y sin ninguna de las tres cosas: el nombre
 * largo se cortaba en seco.
 */
export function coachOgBrandNameStyle(brandName: string, color: string): CoachOgBrandNameStyle {
    return {
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        maxWidth: '100%',
        textAlign: 'center',
        wordBreak: 'break-word',
        fontSize: coachOgBrandNameFontSize(brandName),
        fontWeight: 700,
        lineHeight: 1.05,
        color,
    }
}

/**
 * Versión del `og:image` derivada de lo que la imagen dibuja (logo, logo dark, color, nombre, tier).
 *
 * WhatsApp cachea la preview POR URL, en el teléfono, 72 h o más, y no hay forma oficial de
 * limpiarla: sin esto, un coach que cambia su logo sigue viendo la miniatura vieja para siempre.
 * El route IGNORA el query — solo existe para que la URL cambie cuando cambia el arte.
 *
 * Hash djb2 en base36 (determinista, sin `crypto`, sirve igual en Node y en el edge). No es
 * criptográfico y no hace falta que lo sea: acá solo importa que cambie cuando cambian las partes.
 *
 * LÍMITE CONOCIDO (hallazgo B-8): el call site (`/c/[coach_slug]/layout.tsx`) arma las partes con
 * los HEADERS del proxy, mientras que el route las lee del RPC `get_coach_public_branding`. Las dos
 * fuentes casi siempre coinciden, pero no son la misma: (a) el proxy cae a `BRAND_APP_ICON` cuando
 * el coach no tiene logo y (b) en el camino de team el header trae el logo del TEAM. Si el arte
 * cambiara sin que cambie ningún header, la miniatura vieja quedaría pegada 72 h en el teléfono.
 * Cerrarlo del todo exige que el layout consulte el mismo RPC (una query extra por request en la
 * ruta más caliente del portal) — hoy no se paga; el `tier` va incluido para cubrir el único
 * cambio de arte que no toca logo/color/nombre (el fail-closed de `isBrandingAllowed`).
 */
export function coachOgImageVersion(...parts: (string | null | undefined)[]): string {
    const source = parts.map((p) => p?.trim() || '').join('|')
    let hash = 5381
    for (let i = 0; i < source.length; i++) {
        hash = (((hash << 5) + hash) ^ source.charCodeAt(i)) >>> 0
    }
    return hash.toString(36)
}

/**
 * PNG con `Content-Length` explícito.
 *
 * WhatsApp (Android) genera la preview en el TELÉFONO: baja el HTML y después la imagen, y necesita
 * saber el peso ANTES de bajarla para aplicar su límite (~300 KB). `ImageResponse` es un stream: el
 * runtime Node lo manda `Transfer-Encoding: chunked` SIN `Content-Length`, ni siquiera en HEAD, y
 * WhatsApp descarta la miniatura (título y descripción sí salen, que es exactamente el síntoma
 * reportado). El og estático de la raíz (`opengraph-image.tsx`, `force-static`) sí trae longitud y
 * ese sí se ve. Bufferizamos para poder emitirla.
 *
 * Recibe el `ArrayBuffer` ya consumido (no un `Uint8Array`): es lo que devuelve
 * `ImageResponse.arrayBuffer()`, es `BodyInit` válido tal cual y evita la vista intermedia.
 */
export function buildCoachOgPngResponse(png: ArrayBuffer): Response {
    return new Response(png, {
        status: 200,
        headers: {
            'Content-Type': 'image/png',
            'Content-Length': String(png.byteLength),
            'Cache-Control': COACH_OG_CACHE_CONTROL,
        },
    })
}

/**
 * PNG 1×1 transparente (base64) — ÚLTIMO recurso de la preview.
 *
 * Si hasta el og estático fallara, esto es lo único que garantiza una respuesta 200 con
 * `Content-Length`: WhatsApp descarta la miniatura, pero la tarjeta (título + descripción) SIGUE
 * saliendo. Un 500, en cambio, puede tumbar la tarjeta entera — que es el síntoma que esta tanda
 * arregla (hallazgo B-4).
 */
const COACH_OG_MINIMAL_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/** Bytes del PNG mínimo. Se decodifica en cada llamada: es 1×1, cuesta nada y evita estado global. */
export function coachOgMinimalPng(): ArrayBuffer {
    const binary = atob(COACH_OG_MINIMAL_PNG_BASE64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes.buffer
}
