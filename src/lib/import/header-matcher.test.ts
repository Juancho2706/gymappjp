import { describe, expect, it } from 'vitest'
import {
  levenshtein,
  matchHeader,
  matchHeaders,
  normalizeHeader,
} from './header-matcher'

describe('header-matcher — normalizeHeader', () => {
  it('strips accents', () => {
    expect(normalizeHeader('Teléfono')).toBe('telefono')
  })

  it('lowercases', () => {
    expect(normalizeHeader('EMAIL')).toBe('email')
  })

  it('strips non-alphanumeric', () => {
    expect(normalizeHeader('e-mail')).toBe('email')
    expect(normalizeHeader('e_mail')).toBe('email')
    expect(normalizeHeader('e mail')).toBe('email')
  })

  it('trims whitespace', () => {
    expect(normalizeHeader('  nombre  ')).toBe('nombre')
  })

  it('handles empty string', () => {
    expect(normalizeHeader('')).toBe('')
  })

  it('handles non-string defensively', () => {
    expect(normalizeHeader(null as unknown as string)).toBe('')
  })
})

describe('header-matcher — levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0)
  })

  it('returns full length when one is empty', () => {
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('abc', '')).toBe(3)
  })

  it('counts single substitution', () => {
    expect(levenshtein('cat', 'bat')).toBe(1)
  })

  it('counts single insertion', () => {
    expect(levenshtein('cat', 'cats')).toBe(1)
  })

  it('counts single deletion', () => {
    expect(levenshtein('cats', 'cat')).toBe(1)
  })

  it('handles longer strings', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
  })
})

describe('header-matcher — matchHeader exact matches', () => {
  it('matches "Nombre" → full_name', () => {
    const m = matchHeader('Nombre')
    expect(m.field).toBe('full_name')
    expect(m.confidence).toBe('exact')
  })

  it('matches "Nombre completo" → full_name', () => {
    expect(matchHeader('Nombre completo').field).toBe('full_name')
  })

  it('matches "Apellido y nombre" → full_name', () => {
    expect(matchHeader('Apellido y nombre').field).toBe('full_name')
  })

  it('matches "Email" → email', () => {
    expect(matchHeader('Email').field).toBe('email')
  })

  it('matches "Correo electrónico" → email', () => {
    expect(matchHeader('Correo electrónico').field).toBe('email')
  })

  it('matches "e-mail" → email', () => {
    expect(matchHeader('e-mail').field).toBe('email')
  })

  it('matches "Teléfono" → phone', () => {
    expect(matchHeader('Teléfono').field).toBe('phone')
  })

  it('matches "Celular" → phone', () => {
    expect(matchHeader('Celular').field).toBe('phone')
  })

  it('matches "WhatsApp" → phone', () => {
    expect(matchHeader('WhatsApp').field).toBe('phone')
  })

  it('matches "Fecha de inicio" → subscription_start_date', () => {
    expect(matchHeader('Fecha de inicio').field).toBe('subscription_start_date')
  })

  it('matches "Fecha alta" → subscription_start_date', () => {
    expect(matchHeader('Fecha alta').field).toBe('subscription_start_date')
  })
})

describe('header-matcher — matchHeader fuzzy matches', () => {
  it('matches typo "Telefon" → phone (fuzzy)', () => {
    const m = matchHeader('Telefon')
    expect(m.field).toBe('phone')
    expect(m.confidence).toBe('fuzzy')
  })

  it('matches typo "Emai" → email (fuzzy)', () => {
    const m = matchHeader('Emai')
    expect(m.field).toBe('email')
    expect(m.confidence).toBe('fuzzy')
  })

  it('matches uppercase + accent variants', () => {
    expect(matchHeader('TELÉFONO').field).toBe('phone')
    expect(matchHeader('FECHA DE ALTA').field).toBe('subscription_start_date')
  })
})

describe('header-matcher — matchHeader no match', () => {
  it('returns none for unrelated header', () => {
    const m = matchHeader('peso_kg')
    expect(m.field).toBeNull()
    expect(m.confidence).toBe('none')
  })

  it('returns none for empty', () => {
    expect(matchHeader('').field).toBeNull()
    expect(matchHeader('   ').field).toBeNull()
  })

  it('returns none for very short ambiguous', () => {
    expect(matchHeader('xyz').confidence).toBe('none')
  })
})

describe('header-matcher — matchHeaders conflict resolution', () => {
  it('resolves duplicate exact matches keeping first', () => {
    const result = matchHeaders(['Nombre', 'Nombre completo', 'Email'])
    const fullNameMatches = result.filter((r) => r.field === 'full_name')
    expect(fullNameMatches).toHaveLength(1)
    expect(result.find((r) => r.field === 'email')).toBeDefined()
  })

  it('exact wins over fuzzy when both target same field', () => {
    const result = matchHeaders(['Telefon', 'Teléfono', 'Email'])
    const phoneMatches = result.filter((r) => r.field === 'phone')
    expect(phoneMatches).toHaveLength(1)
    expect(phoneMatches[0].confidence).toBe('exact')
    // "Telefon" was demoted
    expect(result[0].field).toBeNull()
  })

  it('returns array same length as input', () => {
    const headers = ['Nombre', 'Email', 'Teléfono', 'XYZ', 'Fecha inicio']
    const result = matchHeaders(headers)
    expect(result).toHaveLength(5)
  })
})
