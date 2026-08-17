/**
 * @eva/brand-kit — `sealPair`: el par de marca del Sello EVA v2 (fondo «Horizonte B»).
 *
 * SPEC: docs/specs/eva-seal-background/SPEC.md (D3). Pure TypeScript, DOM-free —
 * el MISMO helper lo consumen web (Next) y RN (Expo) para que los dos blobs del
 * sello rendericen idéntico en todas las plataformas.
 *
 * Regla D3 (dueño 2026-08-17: «cada tema debe tener su par»):
 *   1. Tema con PRESET del catálogo curado ⇒ el par es `brandColor` + `secondaryColor`
 *      del preset (los 14 presets ya curan su par). CERO paletas nuevas.
 *   2. Brand SIN preset (custom/legacy) ⇒ el secundario se DERIVA del primario con
 *      `hsl(H+38° wrap 360, S×0.85, min(L+14%, 68%))`. Regla W-brand B2: el
 *      `brand_secondary_color` almacenado de un legacy NO se considera — el par
 *      curado viene de preset o se deriva, nunca del hex suelto viejo.
 *
 * La entrada es el tema de marca RESUELTO (espejo de `resolveEffectiveCoachBrandTheme`
 * en RN / los layouts web que emiten `--theme-*`): si el resolutor aplicó
 * `accentLight`/`accentDark` por modo al primario, ese hex ya llega resuelto acá —
 * `sealPair` no re-aplica nada por modo (hoy esos overrides solo llegan del acordeón
 * manual; ningún preset los trae).
 */
import { converter, formatHex } from 'culori'
import { getThemePreset, type ResolvedPresetBranding } from './presets'

const toHsl = converter('hsl')

/** Rotación de hue de la fórmula derivada (D3.2). */
const SEAL_HUE_SHIFT = 38
/** Factor de saturación de la fórmula derivada (D3.2). */
const SEAL_SATURATION_FACTOR = 0.85
/** Empuje de lightness de la fórmula derivada (D3.2), en escala 0–1 (= +14%). */
const SEAL_LIGHTNESS_SHIFT = 0.14
/** Techo de lightness de la fórmula derivada (D3.2), en escala 0–1 (= 68%). */
const SEAL_LIGHTNESS_CEIL = 0.68

/**
 * Tema de marca RESUELTO (subconjunto estructural de `EffectiveCoachBrandTheme` RN /
 * del branding resuelto de los layouts web). Los objetos con props extra encajan
 * por tipado estructural.
 */
export type SealPairInput = {
    /** Primario del tema resuelto (hex). */
    brandColor: string
    /**
     * Secundario del tema resuelto (hex). SOLO se respeta cuando viene del par
     * curado de un preset — ver `themePresetKey` para el enforcement en el helper.
     * Si el caller omite `themePresetKey`, se confía en que YA aplicó la regla B2
     * (es decir: solo pasa `secondaryColor` cuando hubo preset aplicado).
     */
    secondaryColor?: string | null
    /**
     * Key del preset del tema (si el caller la tiene a mano, pasarla SIEMPRE):
     * - key que resuelve en el catálogo ⇒ el par curado sale del catálogo mismo
     *   (fuente de verdad; un retoque del CEO al preset llega solo).
     * - `null` o key desconocida ⇒ brand legacy/custom ⇒ se IGNORA `secondaryColor`
     *   (regla B2: el hex suelto viejo no cuenta) y se deriva del primario.
     * - Campo ausente (`undefined`) ⇒ modo confiado: se usa `secondaryColor` si es
     *   un hex válido, si no se deriva.
     */
    themePresetKey?: string | null
}

/** Par de marca del sello, en hex normalizado (`#rrggbb` minúsculas). */
export type SealPair = {
    primary: string
    secondary: string
}

/** Normaliza a `#rrggbb` minúsculas vía culori; `null` si no parsea (fail-safe, sin throw). */
function normalizeHex(color: string | null | undefined): string | null {
    if (!color) return null
    const parsed = toHsl(color)
    if (!parsed) return null
    return formatHex(parsed) ?? null
}

/**
 * Fórmula derivada D3.2: `hsl(H+38° wrap 360, S×0.85, min(L+14%, 68%))` del primario.
 * Nota: el `min` es literal — un primario MUY claro (L>68%) baja al techo 68%.
 * (El L+8% que usa el artifact en modo claro es lightness de PINTADO del blob 2,
 * no de este par — la fórmula del PAR no cambia por tema.)
 */
export function deriveSealSecondary(brandHex: string): string {
    const c = toHsl(brandHex)
    // Espejo del patrón del engine (hueOf/chromaOf): componentes faltantes ⇒ 0, jamás throw.
    const h = c && typeof c.h === 'number' ? c.h : 0
    const s = c && typeof c.s === 'number' ? c.s : 0
    const l = c && typeof c.l === 'number' ? c.l : 0
    const derived = {
        mode: 'hsl' as const,
        h: (h + SEAL_HUE_SHIFT) % 360,
        s: Math.min(s * SEAL_SATURATION_FACTOR, 1),
        l: Math.min(l + SEAL_LIGHTNESS_SHIFT, SEAL_LIGHTNESS_CEIL),
    }
    return formatHex(derived) ?? '#000000'
}

/** Caída de lightness del PINTADO claro del blob 2 (artifact: L+8 en claro vs L+14 del par). */
const SEAL_LIGHT_PAINT_DROP = 0.06

/**
 * Hex de PINTADO del blob 2 en tema CLARO (S1.2, valores normativos del artifact):
 * en claro el artifact pinta el secundario con `L+8%` en vez del `L+14%` del PAR
 * (mismo H y S). La fórmula del PAR no cambia (D3) — esto es solo el color con que
 * se pinta la capa clara del blob 2. Implementación: secundario del par − 6 puntos
 * de lightness (clamp ≥ 0), que reproduce `L+8` cuando el par vino de la fórmula
 * derivada (bajo el techo 68%) y aplica la MISMA calibración de claro a un par
 * curado de preset (en claro debe notarse — D5, sin quedar lavado).
 * Dark pinta el secundario del par tal cual.
 */
export function sealSecondaryLightPaint(secondaryHex: string): string {
    const c = toHsl(secondaryHex)
    // Mismo patrón fail-safe de deriveSealSecondary: componente faltante ⇒ 0, jamás throw.
    const h = c && typeof c.h === 'number' ? c.h : 0
    const s = c && typeof c.s === 'number' ? c.s : 0
    const l = c && typeof c.l === 'number' ? c.l : 0
    return formatHex({ mode: 'hsl', h, s, l: Math.max(l - SEAL_LIGHT_PAINT_DROP, 0) }) ?? '#000000'
}

/** Secundario curado según la regla D3/B2, o `null` si corresponde derivar. */
function resolveCuratedSecondary(input: SealPairInput): string | null {
    if (input.themePresetKey !== undefined) {
        // Modo estricto: el caller declaró la key ⇒ el catálogo decide.
        const preset = getThemePreset(input.themePresetKey)
        if (!preset) return null // B2: sin preset, el hex suelto legacy NO cuenta.
        return normalizeHex(preset.secondaryColor)
    }
    // Modo confiado: el caller ya filtró B2 aguas arriba.
    return normalizeHex(input.secondaryColor)
}

/**
 * Par de marca del Sello EVA v2 a partir del tema RESUELTO.
 * Determinístico y sin throw: misma salida en web y RN para el mismo input.
 */
export function sealPair(input: SealPairInput): SealPair {
    const primary = normalizeHex(input.brandColor) ?? input.brandColor
    const secondary = resolveCuratedSecondary(input) ?? deriveSealSecondary(input.brandColor)
    return { primary, secondary }
}

// ────────────────────────────────────────────────────────────────────────────
// W-brand B2 — consolidación de color del coach STANDALONE
// (SPEC docs/specs/whitelabel-color-consolidation, decisión del dueño 2026-08-17)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Aplica la regla B2 sobre un branding YA hidratado por `resolvePresetBranding`:
 *
 * - CON preset aplicado ⇒ passthrough INTACTO (el catálogo ya cura su par y sus
 *   acentos; cero cambio para el coach con tema elegido).
 * - SIN preset (legacy custom) ⇒ el coach conserva SU primario tal cual, pero el
 *   secundario resuelto pasa a ser `sealPair(primario).secondary` (fórmula derivada
 *   D3.2) y los `brand_secondary_color`/`accent_light`/`accent_dark` ALMACENADOS
 *   dejan de aplicar (las columnas quedan en DB, inertes por contrato).
 *
 * `effectivePrimary` es el primario RESUELTO del punto de lectura (con los fallbacks
 * de marca ya aplicados): el par debe derivar del MISMO hex que se pinta. Si se
 * omite, se usa el `primary_color` de la fila; sin ninguno, el secundario queda
 * `null` (el motor cae a su default accent2 = accent, como hoy).
 *
 * SOLO para superficies STANDALONE (marca personal del coach): las marcas managed
 * (org/team) conservan su camino actual hasta la wave W3.
 */
export function consolidateStandaloneBranding(
    resolved: ResolvedPresetBranding,
    effectivePrimary?: string | null,
): ResolvedPresetBranding {
    if (resolved.appliedPreset) return resolved
    const primary = effectivePrimary ?? resolved.primary_color
    return {
        ...resolved,
        brand_secondary_color: primary
            ? sealPair({ brandColor: primary, themePresetKey: null }).secondary
            : null,
        accent_light: null,
        accent_dark: null,
    }
}
