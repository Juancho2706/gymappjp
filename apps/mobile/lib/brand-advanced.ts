/**
 * Metadata de presentación del "Branding avanzado (Pro)" white-label v2 — mobile.
 *
 * Las KEYS canónicas viven en @eva/schemas (FONT_KEY_TUPLE / LOADER_VARIANT_TUPLE), fuente única
 * compartida web+mobile → cero drift de claves. Acá solo se agregan label + note de display, espejo
 * EXACTO de los textos de apps/web/src/lib/brand-fonts.ts y brand-loaders.ts (esos módulos web NO se
 * pueden importar: cargan next/font/google y CSS vars, que no existen en RN).
 *
 * Limitación conocida (reportada): mobile solo tiene Inter + Montserrat cargadas vía Expo, así que el
 * selector de fuentes muestra label/note pero NO previsualiza la familia real de las 12 fuentes (no
 * hay fallback CSS var como en web). La elección igual se persiste y la app web/PWA del alumno la
 * aplica. Si en el futuro se cargan las 12 fuentes en Expo, mapear key → fontFamily acá.
 */
import { FONT_KEY_TUPLE, LOADER_VARIANT_TUPLE, type FontKey, type LoaderVariant } from '@eva/schemas'

export type CuratedFontMeta = { label: string; note: string }

/** Espejo de CURATED_FONTS (web). Orden = FONT_KEY_TUPLE = orden del selector. */
export const CURATED_FONTS: Record<FontKey, CuratedFontMeta> = {
  'inter':         { label: 'Inter',             note: 'Default EVA · workhorse de cuerpo' },
  'montserrat':    { label: 'Montserrat',        note: 'Display clásico' },
  'plus-jakarta':  { label: 'Plus Jakarta Sans', note: 'Moderna, variable' },
  'hanken':        { label: 'Hanken Grotesk',    note: 'Cuerpo fuerte 2026' },
  'manrope':       { label: 'Manrope',           note: 'Geométrica limpia' },
  'poppins':       { label: 'Poppins',           note: 'Geométrica, amistosa' },
  'sora':          { label: 'Sora',              note: 'Techy, variable' },
  'space-grotesk': { label: 'Space Grotesk',     note: 'Creativa, variable' },
  'outfit':        { label: 'Outfit',            note: 'Geométrica clean' },
  'figtree':       { label: 'Figtree',           note: 'Cálida, variable' },
  'dm-sans':       { label: 'DM Sans',           note: 'Compacta, legible en small' },
  'lexend':        { label: 'Lexend',            note: 'Pick de accesibilidad' },
}

export type LoaderVariantMeta = { label: string; note: string }

/** Espejo de LOADER_VARIANTS (web). Orden = LOADER_VARIANT_TUPLE. */
export const LOADER_VARIANTS: Record<LoaderVariant, LoaderVariantMeta> = {
  'eva':      { label: 'EVA (default)', note: 'El loader actual de EVA' },
  'progreso': { label: 'Progreso',      note: 'Anillo + barra + porcentaje' },
  'anillo':   { label: 'Anillo',        note: 'Anillo punteado girando' },
  'radar':    { label: 'Radar',         note: 'Pings tipo sonar' },
  'cometa':   { label: 'Cometa',        note: 'Cola de gradiente cónico' },
  'ritmo':    { label: 'Ritmo',         note: 'Barras de ecualizador' },
  'orbitas':  { label: 'Órbitas',       note: 'Dos arcos contra-rotando' },
}

export { FONT_KEY_TUPLE, LOADER_VARIANT_TUPLE }
export type { FontKey, LoaderVariant }
