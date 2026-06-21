/**
 * Registro ÚNICO de variantes de loader del white-label v2 (web-only, data pura).
 *
 * Solo DATA: las keys (tuple para z.enum del schema) + metadata de display para la galería.
 * Los COMPONENTES React/CSS viven en components/loaders/ (W3, porteados de
 * specs/whitelabel-v2/loaders-source/). Este módulo es puro → lo consumen schema + proxy + UI.
 *
 * Decisiones CEO 2026-06-21:
 * - El DEFAULT 'eva' = el loader EVA ACTUAL (no se reemplaza). Lo ven free/starter + Pro que no eligen.
 * - Las 6 variantes (progreso/anillo/radar/cometa/ritmo/orbitas) = opciones del coach Pro+.
 * - Brand-aware: color = --theme-primary del coach; fondo theme-aware; icono = logo del coach.
 */

/** Keys válidas de loader (tuple para z.enum). 'eva' = default actual; el resto = las 6 del CEO. */
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

export const DEFAULT_LOADER_VARIANT: LoaderVariant = 'eva'

export type LoaderVariantMeta = {
    label: string
    note: string
    /** ¿Lleva el ícono central (logo del coach)? 'ritmo' no. */
    hasIcon: boolean
    /** ¿Lleva wordmark (brand_name del coach)? */
    hasWordmark: boolean
}

export const LOADER_VARIANTS: Record<LoaderVariant, LoaderVariantMeta> = {
    'eva':      { label: 'EVA (default)', note: 'El loader actual de EVA', hasIcon: true,  hasWordmark: true },
    'progreso': { label: 'Progreso',      note: 'Anillo + barra + porcentaje', hasIcon: true, hasWordmark: true },
    'anillo':   { label: 'Anillo',        note: 'Anillo punteado girando', hasIcon: true,  hasWordmark: true },
    'radar':    { label: 'Radar',         note: 'Pings tipo sonar', hasIcon: true,  hasWordmark: true },
    'cometa':   { label: 'Cometa',        note: 'Cola de gradiente cónico', hasIcon: true,  hasWordmark: true },
    'ritmo':    { label: 'Ritmo',         note: 'Barras de ecualizador', hasIcon: false, hasWordmark: true },
    'orbitas':  { label: 'Órbitas',       note: 'Dos arcos contra-rotando', hasIcon: true,  hasWordmark: true },
}

/** Type guard: ¿el string (ej. valor de DB) es una variante válida? Fail-closed → default 'eva'. */
export function isLoaderVariant(value: string | null | undefined): value is LoaderVariant {
    return value != null && (LOADER_VARIANT_TUPLE as readonly string[]).includes(value)
}

/** Normaliza un valor crudo a una variante válida (default 'eva' si inválido). */
export function resolveLoaderVariant(value: string | null | undefined): LoaderVariant {
    return isLoaderVariant(value) ? value : DEFAULT_LOADER_VARIANT
}
