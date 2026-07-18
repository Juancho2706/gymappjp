import { describe, expect, it } from 'vitest'
import {
  calculateGtinCheckDigit,
  isValidGtin,
  normalizeFoodSearchText,
  normalizeGtin,
  parseGtin,
} from './catalog'

describe('nutrition catalog GTIN helpers', () => {
  it('normalizes scanner and human input without padding', () => {
    expect(normalizeGtin(' 4006-3813 3393-1 ')).toBe('4006381333931')
    expect(normalizeGtin(96385074)).toBe('96385074')
    expect(normalizeGtin(null)).toBe('')
  })

  it.each([
    '96385074',
    '036000291452',
    '4006381333931',
    '10012345000017',
  ])('accepts a valid supported GTIN: %s', (value) => {
    expect(isValidGtin(value)).toBe(true)
    expect(parseGtin(value)).toBe(value)
  })

  it.each([
    '96385075',
    '036000291453',
    '4006381333932',
    '10012345000018',
    '1234567',
    '123456789',
    '',
  ])('rejects invalid or unsupported codes: %s', (value) => {
    expect(isValidGtin(value)).toBe(false)
    expect(parseGtin(value)).toBeNull()
  })

  it('calculates GS1 check digits', () => {
    expect(calculateGtinCheckDigit('400638133393')).toBe(1)
    expect(calculateGtinCheckDigit('03600029145')).toBe(2)
    expect(calculateGtinCheckDigit('')).toBeNull()
  })
})

describe('normalizeFoodSearchText', () => {
  it('normalizes Chilean names, brands and aliases for local search', () => {
    expect(
      normalizeFoodSearchText('Pan Marraqueta', 'Panadería Ñuñoa', 'pan batido; hallulla'),
    ).toBe('pan marraqueta panaderia nunoa pan batido hallulla')
  })

  it('drops empty parts and collapses punctuation/whitespace', () => {
    expect(normalizeFoodSearchText('  Yogur  ', null, 'sin azúcar / frutilla')).toBe(
      'yogur sin azucar frutilla',
    )
  })
})
