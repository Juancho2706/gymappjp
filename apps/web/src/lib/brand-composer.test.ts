import { describe, it, expect } from 'vitest'
import {
    isLoginLayoutKey,
    resolveLoginLayout,
    parseLoaderConfig,
    serializeLoaderConfig,
    LOADER_TEXT_MAX,
    DEFAULT_LOADER_COMPOSITE,
} from './brand-composer'

describe('login layout guards', () => {
    it('accepts the 4 canonical keys', () => {
        for (const k of ['clasico', 'hero', 'energia', 'minimal']) {
            expect(isLoginLayoutKey(k)).toBe(true)
        }
    })
    it('rejects unknown / null', () => {
        expect(isLoginLayoutKey('fancy')).toBe(false)
        expect(isLoginLayoutKey(null)).toBe(false)
        expect(isLoginLayoutKey(undefined)).toBe(false)
        expect(isLoginLayoutKey('')).toBe(false)
    })
    it('resolveLoginLayout falls back to clasico', () => {
        expect(resolveLoginLayout('hero')).toBe('hero')
        expect(resolveLoginLayout('nope')).toBe('clasico')
        expect(resolveLoginLayout(null)).toBe('clasico')
    })
})

describe('parseLoaderConfig (fail-closed)', () => {
    it('parses a valid object', () => {
        expect(parseLoaderConfig({ symbol: 'flame', animation: 'orbita' })).toEqual({
            symbol: 'flame',
            animation: 'orbita',
        })
    })
    it('parses a valid JSON string with text', () => {
        expect(parseLoaderConfig('{"symbol":"logo","animation":"pulso","text":"vamos"}')).toEqual({
            symbol: 'logo',
            animation: 'pulso',
            text: 'vamos',
        })
    })
    it('trims + clamps text to the max length', () => {
        const long = 'A'.repeat(LOADER_TEXT_MAX + 5)
        const parsed = parseLoaderConfig({ symbol: 'initial', animation: 'barra', text: `  ${long}  ` })
        expect(parsed?.text).toHaveLength(LOADER_TEXT_MAX)
    })
    it('drops empty / blank text', () => {
        expect(parseLoaderConfig({ symbol: 'star', animation: 'respiracion', text: '   ' })).toEqual({
            symbol: 'star',
            animation: 'respiracion',
        })
    })
    it('returns null for invalid symbol or animation', () => {
        expect(parseLoaderConfig({ symbol: 'nope', animation: 'orbita' })).toBeNull()
        expect(parseLoaderConfig({ symbol: 'flame', animation: 'zoom' })).toBeNull()
    })
    it('returns null for malformed / empty / non-object input', () => {
        expect(parseLoaderConfig(null)).toBeNull()
        expect(parseLoaderConfig('')).toBeNull()
        expect(parseLoaderConfig('not json')).toBeNull()
        expect(parseLoaderConfig('[]')).toBeNull()
        expect(parseLoaderConfig(42)).toBeNull()
        expect(parseLoaderConfig(['symbol'])).toBeNull()
    })
})

describe('DEFAULT_LOADER_COMPOSITE', () => {
    it('is a valid, parseable composite (survives the fail-closed guard)', () => {
        expect(parseLoaderConfig(DEFAULT_LOADER_COMPOSITE)).toEqual(DEFAULT_LOADER_COMPOSITE)
    })
    it('starts on the marca initial + pulso (neutral arranque)', () => {
        expect(DEFAULT_LOADER_COMPOSITE).toEqual({ symbol: 'initial', animation: 'pulso' })
    })
    it('has no preset text so the render falls back to the brand name', () => {
        expect(DEFAULT_LOADER_COMPOSITE.text).toBeUndefined()
    })
})

describe('serializeLoaderConfig', () => {
    it('round-trips through parse', () => {
        const cfg = { symbol: 'bolt', animation: 'pulso', text: 'GO' } as const
        expect(parseLoaderConfig(serializeLoaderConfig(cfg))).toEqual(cfg)
    })
    it('serializes null to empty string', () => {
        expect(serializeLoaderConfig(null)).toBe('')
    })
    it('omits blank text', () => {
        expect(serializeLoaderConfig({ symbol: 'heart', animation: 'barra', text: '  ' })).toBe(
            '{"symbol":"heart","animation":"barra"}'
        )
    })
})
