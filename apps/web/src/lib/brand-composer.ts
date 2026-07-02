/**
 * White-label W1b — datos puros del compositor de LOGIN + LOADER (sin deps externas).
 *
 * Solo DATA + guards (fail-closed): las keys de layout de login y el shape del compositor de
 * loader. NO importa @eva/brand-kit ni React → testeable aislado y consumible por server
 * (proxy/layout/login/actions) y client (Mi Marca) sin arrastrar el motor de color.
 *
 * Contrato de columnas nuevas de `coaches` (aditivas, NULL = comportamiento actual):
 * - `login_layout_key text`  → una de LOGIN_LAYOUT_KEYS. NULL = 'clasico' (idéntico a hoy).
 * - `loader_config jsonb`     → { symbol, animation, text? }. NULL = usar `loader_variant` (7 variantes).
 */

// ── Layouts de login (variantes de shell/motion; todas heredan tema/fuente/logo) ──
export const LOGIN_LAYOUT_KEYS = ['clasico', 'hero', 'energia', 'minimal'] as const
export type LoginLayoutKey = (typeof LOGIN_LAYOUT_KEYS)[number]

export const DEFAULT_LOGIN_LAYOUT: LoginLayoutKey = 'clasico'

export type LoginLayoutMeta = { label: string; note: string }
export const LOGIN_LAYOUTS: Record<LoginLayoutKey, LoginLayoutMeta> = {
    clasico: { label: 'Clásico', note: 'Hero con tu color + hoja superpuesta (actual)' },
    hero: { label: 'Hero grande', note: 'Logo protagonista centrado con fundido' },
    energia: { label: 'Energía', note: 'Entrada animada con el loader de tu marca' },
    minimal: { label: 'Minimal', note: 'Tipografía pura sobre fondo sólido' },
}

/** Type guard: ¿el string (ej. valor de DB) es una key de layout válida? Fail-closed → 'clasico'. */
export function isLoginLayoutKey(value: string | null | undefined): value is LoginLayoutKey {
    return value != null && (LOGIN_LAYOUT_KEYS as readonly string[]).includes(value)
}

/** Normaliza un valor crudo a un layout válido (default 'clasico' si inválido/null). */
export function resolveLoginLayout(value: string | null | undefined): LoginLayoutKey {
    return isLoginLayoutKey(value) ? value : DEFAULT_LOGIN_LAYOUT
}

// ── Compositor de loader "Crear el tuyo" (símbolo × animación × texto opcional) ──
// symbol: 'logo' (logo del coach) | 'initial' (inicial de la marca) | ícono del set curado.
export const LOADER_SYMBOL_KEYS = [
    'logo',
    'initial',
    'dumbbell',
    'flame',
    'bolt',
    'heart',
    'activity',
    'star',
] as const
export type LoaderSymbol = (typeof LOADER_SYMBOL_KEYS)[number]

export const LOADER_ANIMATION_KEYS = ['pulso', 'orbita', 'barra', 'respiracion'] as const
export type LoaderAnimation = (typeof LOADER_ANIMATION_KEYS)[number]

/** Máximo de caracteres del texto del loader compuesto (espejo del loader legacy). */
export const LOADER_TEXT_MAX = 10

export type LoaderComposite = {
    symbol: LoaderSymbol
    animation: LoaderAnimation
    /** Texto opcional (wordmark); si se omite, el render usa el brand_name. */
    text?: string
}

export function isLoaderSymbol(v: unknown): v is LoaderSymbol {
    return typeof v === 'string' && (LOADER_SYMBOL_KEYS as readonly string[]).includes(v)
}
export function isLoaderAnimation(v: unknown): v is LoaderAnimation {
    return typeof v === 'string' && (LOADER_ANIMATION_KEYS as readonly string[]).includes(v)
}

/**
 * Parsea/valida un `loader_config` crudo (jsonb de DB, objeto JS, o string JSON) a un
 * LoaderComposite legible. Fail-closed: devuelve null si el shape no es estricto → el caller
 * cae a `loader_variant`. Nunca lanza.
 */
export function parseLoaderConfig(raw: unknown): LoaderComposite | null {
    let obj: unknown = raw
    if (typeof raw === 'string') {
        const trimmed = raw.trim()
        if (!trimmed) return null
        try {
            obj = JSON.parse(trimmed)
        } catch {
            return null
        }
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
    const rec = obj as Record<string, unknown>
    if (!isLoaderSymbol(rec.symbol) || !isLoaderAnimation(rec.animation)) return null

    const out: LoaderComposite = { symbol: rec.symbol, animation: rec.animation }
    if (typeof rec.text === 'string') {
        const text = rec.text.trim().slice(0, LOADER_TEXT_MAX)
        if (text) out.text = text
    }
    return out
}

/** Serializa un LoaderComposite a string JSON estable para persistir en el jsonb. */
export function serializeLoaderConfig(config: LoaderComposite | null): string {
    if (!config) return ''
    const clean: LoaderComposite = { symbol: config.symbol, animation: config.animation }
    if (config.text) {
        const t = config.text.trim().slice(0, LOADER_TEXT_MAX)
        if (t) clean.text = t
    }
    return JSON.stringify(clean)
}
