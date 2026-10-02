import { describe, expect, it } from 'vitest'
import { expiryCountdownLabel, expiryToneClass, formatExpiryStamp } from './expiry-format'

describe('formatExpiryStamp — día y hora de Chile', () => {
    it('cobro Flow del 02-10 00:00 de Chile (03:00Z)', () => {
        expect(formatExpiryStamp('2026-10-02T03:00:00.000Z')).toBe('02/10 00:00')
        expect(formatExpiryStamp('2026-10-02T03:00:00.000Z', true)).toBe('02/10/26 00:00')
    })

    it('instante MP con hora real', () => {
        expect(formatExpiryStamp('2026-09-26T15:14:07.000Z')).toBe('26/09 12:14')
    })

    it('inválido ⇒ vacío', () => {
        expect(formatExpiryStamp('nope')).toBe('')
    })
})

describe('expiryCountdownLabel', () => {
    const now = Date.parse('2026-09-30T21:00:00Z')
    const h = (n: number) => now + n * 3_600_000

    it('bajo 48 h cuenta en horas; desde 48 h en días', () => {
        expect(expiryCountdownLabel(h(0.5), now)).toBe('en <1 h')
        expect(expiryCountdownLabel(h(30), now)).toBe('en 30 h')
        expect(expiryCountdownLabel(h(47.9), now)).toBe('en 47 h')
        expect(expiryCountdownLabel(h(24 * 5 + 3), now)).toBe('en 5 d')
    })

    it('vencido', () => {
        expect(expiryCountdownLabel(h(-3), now)).toBe('venció hace 3 h')
        expect(expiryCountdownLabel(h(-24 * 4), now)).toBe('venció hace 4 d')
    })
})

describe('expiryToneClass', () => {
    it('mismos umbrales que la columna vieja', () => {
        expect(expiryToneClass(null)).toBe('text-muted')
        expect(expiryToneClass(-1)).toBe('text-muted')
        expect(expiryToneClass(1)).toBe('text-[var(--danger-500)]')
        expect(expiryToneClass(10)).toBe('text-[var(--warning-500)]')
        expect(expiryToneClass(20)).toBe('text-body')
    })
})
