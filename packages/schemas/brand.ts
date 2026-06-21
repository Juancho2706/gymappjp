/**
 * Claves canónicas de marca (white-label v2) — fuente ÚNICA compartida (web + mobile).
 *
 * Solo las KEYS + tuples para z.enum. La metadata de presentación (familia CSS, --font-brand-<key>,
 * componentes de loader) vive en apps/web (web-only): brand-fonts.ts / brand-loaders.ts importan
 * estos tuples y agregan lo suyo. Así el schema (paquete compartido, sin acceso a apps/web) y la UI
 * coinciden sin drift.
 */

/** Fuentes curadas del white-label v2 (12, sans-serif, sin upload). Orden = orden del dropdown. */
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

/** Variantes de loader. 'eva' = default actual de EVA (no se reemplaza); el resto = las 6 del CEO. */
export const LOADER_VARIANT_TUPLE = [
    'eva',
    'progreso',
    'anillo',
    'radar',
    'cometa',
    'ritmo',
    'orbitas',
] as const

export type LoaderVariant = (typeof LOADER_VARIANT_TUPLE)[number]
