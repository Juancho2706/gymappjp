import { sealPair, sealSecondaryLightPaint } from '@eva/brand-kit'
import { hexToRgb } from './color-utils'

/**
 * Sello EVA v2 (SPEC `docs/specs/eva-seal-background/`, D3) — publicación web del par.
 *
 * Los layouts logueados (shell del coach y shell del alumno) publican las CSS vars
 * `--seal-p-rgb` / `--seal-s-rgb` desde el MISMO `<style>` que ya emite
 * `--theme-primary` (:root = claro, `.dark` = oscuro); `AppSeal` las consume vía
 * `rgba(var(--seal-*-rgb), var(--seal-blob*-alpha))`. Este helper concentra la regla
 * para que coach, alumno y el harness publiquen EXACTAMENTE el mismo par:
 *
 * - Par por modo con `sealPair` en modo ESTRICTO (la key del preset viaja siempre):
 *   preset del catálogo ⇒ par curado; key null/desconocida ⇒ se deriva del primario
 *   resuelto de ese modo (regla B2: el `brand_secondary_color` suelto de un legacy
 *   NO cuenta para el sello).
 * - PINTADO claro del blob 2 con `sealSecondaryLightPaint` (artifact: L+8 en claro
 *   vs L+14 del par); dark pinta el secundario del par tal cual.
 *
 * Triplete `"r, g, b"` (mismo formato que `--theme-primary-rgb` de los layouts).
 */
export type SealCssVars = {
    /** Scope `:root` (tema claro): primario + secundario ya en pintado claro. */
    light: { primaryRgb: string; secondaryRgb: string }
    /** Scope `.dark`: primario + secundario del par tal cual. */
    dark: { primaryRgb: string; secondaryRgb: string }
}

export function buildSealCssVars(input: {
    /** Primario RESUELTO del tema claro (p. ej. `brandTheme.light.accent`). */
    lightBrandColor: string
    /** Primario RESUELTO del tema oscuro (p. ej. `brandTheme.dark.accent`). */
    darkBrandColor: string
    /**
     * Key del preset del tema (modo estricto de `sealPair`): pasar SIEMPRE —
     * `null` cuando no hay preset aplicable (managed/free/legacy) ⇒ se deriva.
     */
    themePresetKey: string | null
}): SealCssVars {
    const lightPair = sealPair({ brandColor: input.lightBrandColor, themePresetKey: input.themePresetKey })
    const darkPair = sealPair({ brandColor: input.darkBrandColor, themePresetKey: input.themePresetKey })
    return {
        light: {
            primaryRgb: hexToRgb(lightPair.primary),
            secondaryRgb: hexToRgb(sealSecondaryLightPaint(lightPair.secondary)),
        },
        dark: {
            primaryRgb: hexToRgb(darkPair.primary),
            secondaryRgb: hexToRgb(darkPair.secondary),
        },
    }
}
