import { describe, expect, it } from 'vitest'
// Import por el barrel `@eva/brand-kit` — la MISMA ruta que usan web (alias Next)
// y RN (workspace de Metro): este test cubre la salida que ven ambas apps.
import {
    consolidateStandaloneBranding,
    deriveSealSecondary,
    resolvePresetBranding,
    getThemePreset,
    sealPair,
} from '@eva/brand-kit'

// ────────────────────────────────────────────────────────────────────────────
// W-brand B2 (SPEC whitelabel-color-consolidation, dueño 2026-08-17):
//  - legacy custom (sin preset): el secundario ALMACENADO no cuenta — gana el
//    DERIVADO del primario vía sealPair; los accent_* almacenados mueren.
//  - coach con preset: passthrough INTACTO (cero cambio, el catálogo ya pisaba).
// ────────────────────────────────────────────────────────────────────────────

describe('consolidateStandaloneBranding — golden legacy (secundario almacenado ≠ derivado ⇒ gana el derivado)', () => {
    it('legacy #E11D48 con secundario almacenado #00FF00 → sale el derivado #df9866', () => {
        const resolved = resolvePresetBranding({
            theme_preset_key: null,
            primary_color: '#E11D48',
            brand_secondary_color: '#00FF00', // hex suelto viejo: NO debe salir jamás
            accent_light: '#111111',
            accent_dark: '#EEEEEE',
            neutral_tint: true,
            brand_font_key: 'sora',
            loader_variant: 'radar',
        })
        // Sanidad: sin consolidar, el passthrough legacy aún trae el hex suelto.
        expect(resolved.brand_secondary_color).toBe('#00FF00')

        const out = consolidateStandaloneBranding(resolved)
        // Golden: derivado de la fórmula D3.2 (mismo valor que el test del sello).
        expect(out.brand_secondary_color).toBe('#df9866')
        expect(out.brand_secondary_color).toBe(deriveSealSecondary('#E11D48'))
        expect(out.brand_secondary_color).not.toBe('#00FF00')
        // B2: los accent_* almacenados dejan de aplicar.
        expect(out.accent_light).toBeNull()
        expect(out.accent_dark).toBeNull()
        // El primario del coach se conserva TAL CUAL (grandfather del primario).
        expect(out.primary_color).toBe('#E11D48')
        // Lo no-color pasa intacto (fuente/tinte/loader siguen siendo del coach).
        expect(out.neutral_tint).toBe(true)
        expect(out.brand_font_key).toBe('sora')
        expect(out.loader_variant).toBe('radar')
    })

    it('deriva del primario EFECTIVO cuando la fila no trae primario (fallback de marca)', () => {
        const resolved = resolvePresetBranding({
            theme_preset_key: null,
            primary_color: null,
            brand_secondary_color: '#ABCDEF',
        })
        const out = consolidateStandaloneBranding(resolved, '#4ADE80')
        // Mismo golden que el sello para #4ADE80 (techo L 68%).
        expect(out.brand_secondary_color).toBe('#7ddddd')
        expect(out.brand_secondary_color).toBe(sealPair({ brandColor: '#4ADE80', themePresetKey: null }).secondary)
    })

    it('sin primario NI efectivo ⇒ secundario null (el motor cae a accent2 = accent, como hoy)', () => {
        const resolved = resolvePresetBranding({ theme_preset_key: null, primary_color: null })
        const out = consolidateStandaloneBranding(resolved)
        expect(out.brand_secondary_color).toBeNull()
        expect(out.accent_light).toBeNull()
        expect(out.accent_dark).toBeNull()
    })
})

describe('consolidateStandaloneBranding — coach con preset: SIN cambio alguno (snapshot)', () => {
    it('preset sport-blue: la salida es EXACTAMENTE la de resolvePresetBranding', () => {
        const row = {
            theme_preset_key: 'sport-blue',
            primary_color: '#FF00FF', // basura legacy: el preset la pisa igual que hoy
            brand_secondary_color: '#00FF00',
            accent_light: '#111111',
            accent_dark: '#EEEEEE',
            neutral_tint: null,
            brand_font_key: null,
            loader_variant: null,
        }
        const resolved = resolvePresetBranding(row)
        const out = consolidateStandaloneBranding(resolved, resolved.primary_color)
        // Passthrough intacto: misma referencia (early-return) y mismo contenido.
        expect(out).toBe(resolved)
        expect(out).toEqual(resolved)
        // El par curado del catálogo sigue mandando.
        const preset = getThemePreset('sport-blue')
        expect(out.primary_color).toBe(preset!.brandColor)
        expect(out.brand_secondary_color).toBe(preset!.secondaryColor)
    })

    it('snapshot del branding resuelto de los 14 presets: consolidar es un no-op en todos', () => {
        for (const key of ['ember', 'sport-blue', 'aqua', 'violet', 'forest', 'coral', 'amber-gold', 'mono-ink', 'rose-pink', 'midnight', 'crimson', 'emerald', 'tangerine', 'indigo-tech']) {
            const resolved = resolvePresetBranding({ theme_preset_key: key })
            expect(consolidateStandaloneBranding(resolved, resolved.primary_color)).toEqual(resolved)
        }
    })
})
