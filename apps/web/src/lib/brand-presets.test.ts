import { describe, expect, it } from 'vitest'
import { sealPair, THEME_PRESETS } from '@eva/brand-kit'
import { matchThemePresetByPair, THEME_PRESET_LIST } from './brand-presets'

// ────────────────────────────────────────────────────────────────────────────
// W-brand B3 (SPEC whitelabel-color-consolidation): Team/Org no guardan
// `theme_preset_key` (cero DDL) — el preset elegido se detecta por VALOR y el
// «rellenador» escribe primario + par en las columnas actuales. Estos tests
// fijan el contrato del match y del par que rellenan los studios.
// ────────────────────────────────────────────────────────────────────────────

describe('matchThemePresetByPair — detección por valor (Team/Org sin theme_preset_key)', () => {
    it('cada preset del catálogo se detecta por su par exacto (round-trip del rellenador)', () => {
        for (const p of THEME_PRESET_LIST) {
            expect(matchThemePresetByPair(p.brandColor, p.secondaryColor)?.key).toBe(p.key)
        }
    })

    it('es case-insensitive (el hex guardado puede venir en minúsculas)', () => {
        expect(matchThemePresetByPair('#2563eb', '#06b6d4')?.key).toBe('sport-blue')
    })

    it('primario del preset + secundario ausente/null sigue contando como el preset', () => {
        // Una fila que solo guardó el primario (p.ej. team viejo sin par) matchea igual.
        expect(matchThemePresetByPair('#2563EB', null)?.key).toBe('sport-blue')
        expect(matchThemePresetByPair('#2563EB')?.key).toBe('sport-blue')
    })

    it('primario del preset + secundario DISTINTO = custom (escape hatch), no preset', () => {
        expect(matchThemePresetByPair('#2563EB', '#FF0000')).toBeNull()
    })

    it('hex fuera del catálogo (grandfather / manual de marca) = null', () => {
        expect(matchThemePresetByPair('#123456', null)).toBeNull()
        expect(matchThemePresetByPair(null)).toBeNull()
        expect(matchThemePresetByPair('')).toBeNull()
    })
})

describe('contrato del rellenador — el par que escriben los studios Team/Org', () => {
    it('camino preset: el par es EXACTAMENTE el curado del catálogo (cero derivación)', () => {
        const sport = THEME_PRESETS.find((p) => p.key === 'sport-blue')!
        expect(sport.brandColor).toBe('#2563EB')
        expect(sport.secondaryColor).toBe('#06B6D4')
    })

    it('camino hex exacto: el par sale de sealPair (fórmula D3.2), nunca del hex crudo', () => {
        // Mismo golden que el sello: el secundario derivado de #E11D48 es #df9866.
        const pair = sealPair({ brandColor: '#E11D48', themePresetKey: null })
        expect(pair.primary).toBe('#e11d48') // el primario exacto se respeta (normalizado)
        expect(pair.secondary).toBe('#df9866')
        // Y un hex que YA es primario de preset con secundario derivado ≠ curado NO matchea
        // como preset: el escape hatch produce un tema custom aunque el hex coincida.
        const derived = sealPair({ brandColor: '#2563EB', themePresetKey: null }).secondary
        expect(derived.toLowerCase()).not.toBe('#06b6d4')
        expect(matchThemePresetByPair('#2563EB', derived)).toBeNull()
    })
})
