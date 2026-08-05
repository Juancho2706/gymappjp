import { describe, expect, it } from 'vitest'
import { decodeBrandHeaderValue, encodeBrandHeaderValue } from './brand-header-codec'

// Regresión incidente 2026-08-05: loader_text "⚔️🐺🔱" (chars > U+00FF) hacía throw en
// headers.set() del middleware → 500 en TODO /c/<slug> del coach desde el 24-jul.
describe('brand-header-codec', () => {
    it('round-trip de emojis (el caso que tumbó /c en prod)', () => {
        const value = '⚔️🐺🔱'
        const encoded = encodeBrandHeaderValue(value)
        // El valor encodeado debe ser ByteString-safe (todo char <= U+00FF).
        expect([...encoded].every(ch => ch.charCodeAt(0) <= 255)).toBe(true)
        expect(decodeBrandHeaderValue(encoded)).toBe(value)
    })

    it('round-trip de texto plano con espacios y acentos', () => {
        for (const value of ['Olympus Wolf', 'Entrenación ñoña', 'E2E Pool Vortex', '']) {
            expect(decodeBrandHeaderValue(encodeBrandHeaderValue(value))).toBe(value)
        }
    })

    it('round-trip de un JSON de loader_config con emoji', () => {
        const json = JSON.stringify({ symbol: '🐺', animation: 'orbitas' })
        expect(decodeBrandHeaderValue(encodeBrandHeaderValue(json))).toBe(json)
    })

    it('round-trip preserva un % literal (brand "100% Fit")', () => {
        const value = '100% Fit'
        expect(decodeBrandHeaderValue(encodeBrandHeaderValue(value))).toBe(value)
    })

    it('decode tolera valores NO encodeados (constantes crudas del proxy)', () => {
        expect(decodeBrandHeaderValue('EVA')).toBe('EVA')
        expect(decodeBrandHeaderValue('Mi Coach')).toBe('Mi Coach')
        // Un % suelto haría throw a decodeURIComponent: debe devolver el valor tal cual.
        expect(decodeBrandHeaderValue('100% Fit')).toBe('100% Fit')
    })

    it('decode propaga null (header ausente)', () => {
        expect(decodeBrandHeaderValue(null)).toBeNull()
    })
})
