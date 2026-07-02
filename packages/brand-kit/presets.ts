/**
 * @eva/brand-kit — Catálogo de TEMAS PRESET curados (white-label v2.1).
 *
 * Pure TypeScript, DOM-free (igual que `index.ts`) → el MISMO catálogo lo consumen web (Next)
 * y el futuro RN (Expo). Un preset es una TUPLA de inputs que el motor ya sabe consumir
 * (`resolveBrandTheme` + `deriveSportTokens`): NO agrega nada nuevo al engine, solo lo alimenta.
 *
 * Decisión CEO 2026-07-02 (informe white-label §3, Opción A): se MATA la rueda de color libre
 * a favor de un catálogo curado. Cada preset pasa por el MISMO clamp WCAG que un color libre, así
 * que un tema curado NUNCA puede ser ilegible en claro NI en oscuro (lo garantiza `presets.test.ts`,
 * que corre `contrastReport`/`deriveSportTokens` sobre TODO el catálogo como gate de CI).
 *
 * Modelo de datos (Opción A): el coach guarda `coaches.theme_preset_key` (una key estable). En los
 * puntos de lectura (proxy/layouts/login) `resolvePresetBranding` hidrata color/color2/accent/tinte/
 * fuente/loader DESDE este catálogo (código, no filas) antes de derivar tokens. Ventaja: el CEO
 * retoca un preset acá y todos los coaches que lo usan mejoran solos, sin migrar filas.
 *
 * Grandfather sin dolor: `theme_preset_key = NULL` (o key desconocida) ⇒ passthrough intacto — el
 * coach sigue con su color libre legacy. El preset SOLO overridea cuando está set y existe.
 *
 * Las keys de `fontKey`/`loaderVariant` viven en `@eva/schemas` (tuple compartido web+mobile). Acá
 * se importan SOLO como TIPO (`import type`) → cero acoplamiento en runtime/bundle: el catálogo es
 * data pura y el compilador valida que cada preset use una fuente/loader existente.
 */
import type { FontKey, LoaderVariant } from '@eva/schemas'

/** Tono/UI del preset (metadato de presentación — no afecta la derivación de color). */
export type PresetFeel = 'bold' | 'calm' | 'techy' | 'warm'

/**
 * Un tema preset curado. `brandColor`/`secondaryColor` son las semillas que alimentan
 * `resolveBrandTheme`/`deriveSportTokens`; `accentLight`/`accentDark` son overrides por-modo
 * OPCIONALES (si se omiten, el motor deriva el acento del `brandColor`).
 */
export type BrandPreset = {
    /** Key estable (va a `coaches.theme_preset_key`). Nunca renombrar una key publicada. */
    key: string
    /** Nombre visible en el selector de Mi Marca. */
    label: string
    /** Color primario (semilla del `deriveSportTokens` + `--sport-500` verbatim). */
    brandColor: string
    /** Color secundario independiente (color2 → `--theme-secondary`/`accent2`). */
    secondaryColor: string
    /** Override opcional del acento en modo claro (default = `brandColor`). */
    accentLight?: string
    /** Override opcional del acento en modo oscuro (default = `brandColor`). */
    accentDark?: string
    /** Fuente de display (una de las 12 curadas). */
    fontKey: FontKey
    /** Variante de loader sugerida (una de las 7). */
    loaderVariant: LoaderVariant
    /** Tiñe neutrales (bg/surface/border) con el hue de marca para un feel premium. */
    neutralTint: boolean
    /** Tono/UI del preset (metadato). */
    feel: PresetFeel
}

/**
 * Catálogo curado (14 temas). Cobertura de hue: rojo-brasa, azul deporte, teal/aqua, violeta,
 * verde bosque, coral, ámbar/dorado, tinta/mono, rosa, azul-noche, carmesí, esmeralda, mandarina,
 * índigo. Fuentes y loaders repartidos entre las 12/7 existentes; los cuatro `feel` distribuidos.
 * INVARIANTE (test): cada preset pasa el clamp WCAG en claro Y oscuro.
 */
export const THEME_PRESETS: readonly BrandPreset[] = [
    {
        key: 'ember',
        label: 'Ember / Brasa',
        brandColor: '#E03A2F',
        secondaryColor: '#F59E0B',
        fontKey: 'sora',
        loaderVariant: 'cometa',
        neutralTint: true,
        feel: 'bold',
    },
    {
        key: 'sport-blue',
        label: 'Sport / Azul',
        brandColor: '#2563EB',
        secondaryColor: '#06B6D4',
        fontKey: 'hanken',
        loaderVariant: 'progreso',
        neutralTint: false,
        feel: 'bold',
    },
    {
        key: 'aqua',
        label: 'Aqua / Teal',
        brandColor: '#0D9488',
        secondaryColor: '#22D3EE',
        fontKey: 'manrope',
        loaderVariant: 'anillo',
        neutralTint: true,
        feel: 'calm',
    },
    {
        key: 'violet',
        label: 'Violeta',
        brandColor: '#7C3AED',
        secondaryColor: '#EC4899',
        fontKey: 'plus-jakarta',
        loaderVariant: 'orbitas',
        neutralTint: true,
        feel: 'techy',
    },
    {
        key: 'forest',
        label: 'Verde bosque',
        brandColor: '#15803D',
        secondaryColor: '#84CC16',
        fontKey: 'lexend',
        loaderVariant: 'ritmo',
        neutralTint: true,
        feel: 'calm',
    },
    {
        key: 'coral',
        label: 'Coral',
        brandColor: '#F43F5E',
        secondaryColor: '#FB923C',
        fontKey: 'poppins',
        loaderVariant: 'radar',
        neutralTint: false,
        feel: 'warm',
    },
    {
        key: 'amber-gold',
        label: 'Dorado / Ámbar',
        brandColor: '#D97706',
        secondaryColor: '#EAB308',
        fontKey: 'outfit',
        loaderVariant: 'progreso',
        neutralTint: true,
        feel: 'warm',
    },
    {
        key: 'mono-ink',
        label: 'Tinta / Mono',
        brandColor: '#334155',
        secondaryColor: '#64748B',
        fontKey: 'space-grotesk',
        loaderVariant: 'anillo',
        neutralTint: false,
        feel: 'techy',
    },
    {
        key: 'rose-pink',
        label: 'Rosa',
        brandColor: '#DB2777',
        secondaryColor: '#A855F7',
        fontKey: 'figtree',
        loaderVariant: 'orbitas',
        neutralTint: true,
        feel: 'warm',
    },
    {
        key: 'midnight',
        label: 'Azul noche',
        brandColor: '#1E3A8A',
        secondaryColor: '#3B82F6',
        fontKey: 'sora',
        loaderVariant: 'radar',
        neutralTint: true,
        feel: 'bold',
    },
    {
        key: 'crimson',
        label: 'Carmesí',
        brandColor: '#BE123C',
        secondaryColor: '#F43F5E',
        fontKey: 'montserrat',
        loaderVariant: 'progreso',
        neutralTint: false,
        feel: 'bold',
    },
    {
        key: 'emerald',
        label: 'Esmeralda',
        brandColor: '#059669',
        secondaryColor: '#10B981',
        fontKey: 'dm-sans',
        loaderVariant: 'anillo',
        neutralTint: false,
        feel: 'calm',
    },
    {
        key: 'tangerine',
        label: 'Mandarina',
        brandColor: '#EA580C',
        secondaryColor: '#F59E0B',
        fontKey: 'poppins',
        loaderVariant: 'cometa',
        neutralTint: false,
        feel: 'warm',
    },
    {
        key: 'indigo-tech',
        label: 'Índigo',
        brandColor: '#4F46E5',
        secondaryColor: '#06B6D4',
        fontKey: 'space-grotesk',
        loaderVariant: 'orbitas',
        neutralTint: true,
        feel: 'techy',
    },
]

/** Lookup O(1) por key (construido una vez). */
const PRESET_BY_KEY: Record<string, BrandPreset> = Object.fromEntries(
    THEME_PRESETS.map((p) => [p.key, p] as const),
)

/** Resuelve un preset por key. Fail-closed: key nula/vacía/desconocida ⇒ `null` (grandfather). */
export function getThemePreset(key: string | null | undefined): BrandPreset | null {
    if (!key) return null
    return PRESET_BY_KEY[key] ?? null
}

/**
 * Fila de branding (subconjunto de `coaches`) que `resolvePresetBranding` sabe leer/overridear.
 * Todos opcionales/nullable → acepta filas parciales (headers del proxy, Pick del login, etc.).
 */
export type PresetResolvableBranding = {
    theme_preset_key?: string | null
    primary_color?: string | null
    brand_secondary_color?: string | null
    accent_light?: string | null
    accent_dark?: string | null
    neutral_tint?: boolean | null
    brand_font_key?: string | null
    loader_variant?: string | null
}

/** Branding resuelto tras aplicar (o no) el preset. Contrato estable para los puntos de lectura. */
export type ResolvedPresetBranding = {
    primary_color: string | null
    brand_secondary_color: string | null
    accent_light: string | null
    accent_dark: string | null
    neutral_tint: boolean | null
    brand_font_key: string | null
    loader_variant: string | null
    /** El preset aplicado, o `null` si no hubo (grandfather / color libre legacy). */
    appliedPreset: BrandPreset | null
}

/**
 * Hidrata el branding de un coach DESDE el catálogo de presets.
 *
 * - `theme_preset_key` set y existente ⇒ override de color/color2/accent(±modo)/tinte/fuente/loader
 *   con los valores del preset (código), ANTES de `deriveSportTokens`/`resolveBrandTheme`.
 * - `NULL` o key desconocida ⇒ passthrough INTACTO de los valores propios de la fila (grandfather).
 *
 * NO toca logo ni nombre de marca (identidad del coach, ajena al tema). Pura y determinística
 * (web/RN idénticos).
 */
export function resolvePresetBranding(row: PresetResolvableBranding): ResolvedPresetBranding {
    const preset = getThemePreset(row.theme_preset_key)
    if (!preset) {
        return {
            primary_color: row.primary_color ?? null,
            brand_secondary_color: row.brand_secondary_color ?? null,
            accent_light: row.accent_light ?? null,
            accent_dark: row.accent_dark ?? null,
            neutral_tint: row.neutral_tint ?? null,
            brand_font_key: row.brand_font_key ?? null,
            loader_variant: row.loader_variant ?? null,
            appliedPreset: null,
        }
    }
    return {
        primary_color: preset.brandColor,
        brand_secondary_color: preset.secondaryColor,
        accent_light: preset.accentLight ?? null,
        accent_dark: preset.accentDark ?? null,
        neutral_tint: preset.neutralTint,
        brand_font_key: preset.fontKey,
        loader_variant: preset.loaderVariant,
        appliedPreset: preset,
    }
}
