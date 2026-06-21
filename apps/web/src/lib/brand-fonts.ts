/**
 * Registro ÚNICO de fuentes curadas del white-label v2 (web-only).
 *
 * Solo DATA: las claves, el nombre de familia (igual al de next/font/google) y la CSS var
 * `--font-brand-<key>`. La carga real con `next/font/google` vive en `app/layout.tsx` (W2) —
 * acá NO se importa next/font (este módulo es puro, lo consumen schema + proxy + UI).
 *
 * Reglas (plan white-label v2, decisión CEO 2026-06-21):
 * - Lista CERRADA de 12 fuentes (sin upload, sin string libre) — única defensa contra CSS-injection.
 * - Todas sans-serif (legibilidad de app), subset latin, pesos 400/500/600/700.
 * - Inter SIEMPRE en el fallback de la var: una fuente que no carga degrada a legible, nunca a serif.
 * - Decisión #4: la fuente custom aplica solo a títulos/display; el body queda en Inter.
 *
 * brand-kit (compartido web+mobile) NO conoce fuentes (es DOM-free): mobile carga fuentes via Expo.
 */

/** Claves válidas de fuente (tuple para z.enum del schema). Orden = orden del dropdown. */
export const FONT_KEY_TUPLE = [
    'inter',
    'montserrat',
    'plus-jakarta',
    'hanken',
    'manrope',
    'poppins',
    'sora',
    'space-grotesk',
    'outfit',
    'figtree',
    'dm-sans',
    'lexend',
] as const

export type FontKey = (typeof FONT_KEY_TUPLE)[number]

export type CuratedFont = {
    /** Nombre visible en el selector. */
    label: string
    /** Nombre de familia CSS — coincide con el import de next/font/google en app/layout.tsx. */
    family: string
    /** CSS var que expone next/font para esta fuente. */
    cssVar: string
    /** Nota corta de personalidad (UI). */
    note: string
}

export const DEFAULT_FONT_KEY: FontKey = 'inter'

export const CURATED_FONTS: Record<FontKey, CuratedFont> = {
    'inter':         { label: 'Inter',             family: 'Inter',             cssVar: '--font-brand-inter',         note: 'Default EVA · workhorse de cuerpo' },
    'montserrat':    { label: 'Montserrat',        family: 'Montserrat',        cssVar: '--font-brand-montserrat',    note: 'Display clásico' },
    'plus-jakarta':  { label: 'Plus Jakarta Sans', family: 'Plus Jakarta Sans', cssVar: '--font-brand-plus-jakarta',  note: 'Moderna, variable' },
    'hanken':        { label: 'Hanken Grotesk',    family: 'Hanken Grotesk',    cssVar: '--font-brand-hanken',        note: 'Cuerpo fuerte 2026' },
    'manrope':       { label: 'Manrope',           family: 'Manrope',           cssVar: '--font-brand-manrope',       note: 'Geométrica limpia' },
    'poppins':       { label: 'Poppins',           family: 'Poppins',           cssVar: '--font-brand-poppins',       note: 'Geométrica, amistosa' },
    'sora':          { label: 'Sora',              family: 'Sora',              cssVar: '--font-brand-sora',          note: 'Techy, variable' },
    'space-grotesk': { label: 'Space Grotesk',     family: 'Space Grotesk',     cssVar: '--font-brand-space-grotesk', note: 'Creativa, variable' },
    'outfit':        { label: 'Outfit',            family: 'Outfit',            cssVar: '--font-brand-outfit',        note: 'Geométrica clean' },
    'figtree':       { label: 'Figtree',           family: 'Figtree',           cssVar: '--font-brand-figtree',       note: 'Cálida, variable' },
    'dm-sans':       { label: 'DM Sans',           family: 'DM Sans',           cssVar: '--font-brand-dm-sans',       note: 'Compacta, legible en small' },
    'lexend':        { label: 'Lexend',            family: 'Lexend',            cssVar: '--font-brand-lexend',        note: 'Pick de accesibilidad' },
}

/** Type guard: ¿el string (ej. valor de DB) es una key de fuente válida? Fail-closed. */
export function isFontKey(value: string | null | undefined): value is FontKey {
    return value != null && (FONT_KEY_TUPLE as readonly string[]).includes(value)
}

/**
 * Resuelve la CSS var `--brand-font` para un coach. Si la key es inválida/null → Inter.
 * La cadena resultante SIEMPRE termina en `var(--font-brand-inter), sans-serif` (degradación legible).
 * Se inyecta server-side; el cliente nunca recibe el string crudo del coach.
 */
export function resolveBrandFontStack(fontKey: string | null | undefined): string {
    if (!isFontKey(fontKey) || fontKey === 'inter') {
        return 'var(--font-brand-inter), sans-serif'
    }
    return `var(${CURATED_FONTS[fontKey].cssVar}), var(--font-brand-inter), sans-serif`
}
