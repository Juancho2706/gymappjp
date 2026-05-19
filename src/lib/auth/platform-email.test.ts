import { describe, expect, it } from 'vitest'
import { normalizePlatformEmail, sanitizePlatformEmail } from './platform-email'

describe('sanitizePlatformEmail', () => {
    it('preserves dots in the local part (Gmail addresses are stored verbatim)', () => {
        expect(sanitizePlatformEmail('jvillegas.dev@gmail.com')).toBe('jvillegas.dev@gmail.com')
        expect(sanitizePlatformEmail('first.middle.last@gmail.com')).toBe('first.middle.last@gmail.com')
    })

    it('preserves +aliases', () => {
        expect(sanitizePlatformEmail('user+tag@gmail.com')).toBe('user+tag@gmail.com')
        expect(sanitizePlatformEmail('user+work@outlook.com')).toBe('user+work@outlook.com')
    })

    it('lowercases and trims surrounding whitespace', () => {
        expect(sanitizePlatformEmail('  Coach@Example.COM  ')).toBe('coach@example.com')
    })
})

describe('normalizePlatformEmail', () => {
    it('strips dots for Gmail (dedup only — never use for storage)', () => {
        expect(normalizePlatformEmail('jvillegas.dev@gmail.com')).toBe('jvillegasdev@gmail.com')
    })

    it('treats googlemail.com as gmail.com', () => {
        expect(normalizePlatformEmail('user@googlemail.com')).toBe('user@gmail.com')
    })

    it('strips +aliases for providers that ignore them', () => {
        expect(normalizePlatformEmail('user+tag@gmail.com')).toBe('user@gmail.com')
        expect(normalizePlatformEmail('user+work@outlook.com')).toBe('user@outlook.com')
    })

    it('keeps dots for non-Gmail providers', () => {
        expect(normalizePlatformEmail('first.last@outlook.com')).toBe('first.last@outlook.com')
    })
})
