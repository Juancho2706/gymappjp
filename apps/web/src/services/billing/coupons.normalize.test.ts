import { describe, expect, it } from 'vitest'
import { normalizeCouponCode, normalizeEmailForFirstTime, randomCouponCode } from './coupons.normalize'

describe('normalizeCouponCode', () => {
    it('UPPER + elimina espacios y guiones', () => {
        expect(normalizeCouponCode('partner-50')).toBe('PARTNER50')
        expect(normalizeCouponCode('  eva 2026 ')).toBe('EVA2026')
        expect(normalizeCouponCode('a-b-c')).toBe('ABC')
    })
    it('idempotente', () => {
        const once = normalizeCouponCode('Promo-Verano 25')
        expect(normalizeCouponCode(once)).toBe(once)
    })
})

describe('normalizeEmailForFirstTime', () => {
    it('lowercase + trim', () => {
        expect(normalizeEmailForFirstTime('  Coach@Test.CL ')).toBe('coach@test.cl')
    })
    it('gmail: elimina dots y +alias (misma cuenta)', () => {
        expect(normalizeEmailForFirstTime('john.doe+promo@gmail.com')).toBe('johndoe@gmail.com')
        expect(normalizeEmailForFirstTime('j.o.h.n@googlemail.com')).toBe('john@googlemail.com')
    })
    it('no-gmail: trunca +alias pero conserva dots', () => {
        expect(normalizeEmailForFirstTime('john.doe+x@outlook.com')).toBe('john.doe@outlook.com')
    })
    it('sin @ válido → devuelve tal cual (lowercased)', () => {
        expect(normalizeEmailForFirstTime('NotAnEmail')).toBe('notanemail')
    })
})

describe('randomCouponCode', () => {
    it('largo por defecto 10, alfabeto sin ambigüedad (sin 0/O/1/I/L)', () => {
        const code = randomCouponCode()
        expect(code).toHaveLength(10)
        expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/)
    })
    it('largo configurable', () => {
        expect(randomCouponCode(8)).toHaveLength(8)
    })
    it('ya normalizado (normalizeCouponCode no lo cambia)', () => {
        const code = randomCouponCode()
        expect(normalizeCouponCode(code)).toBe(code)
    })
})
