import { describe, expect, it } from 'vitest'
import { isDangerousCell, sanitizeCell } from './csv-injection'

describe('csv-injection — sanitizeCell', () => {
  it('passes through safe text', () => {
    expect(sanitizeCell('Juan Pérez')).toEqual({ value: 'Juan Pérez', sanitized: false })
  })

  it('passes through phone with +56 unchanged when not at start of cell-meaning context', () => {
    // The "+" at start is a formula trigger; sanitize prefixes it.
    expect(sanitizeCell('+56912345678')).toEqual({ value: "'+56912345678", sanitized: true })
  })

  it('escapes formula starting with =', () => {
    expect(sanitizeCell('=cmd|"/c calc"!A1')).toEqual({
      value: '\'=cmd|"/c calc"!A1',
      sanitized: true,
    })
  })

  it('escapes formula starting with -', () => {
    expect(sanitizeCell('-2+3')).toEqual({ value: "'-2+3", sanitized: true })
  })

  it('escapes cell starting with @', () => {
    expect(sanitizeCell('@SUM(A1:A2)')).toEqual({ value: "'@SUM(A1:A2)", sanitized: true })
  })

  it('escapes tab prefix', () => {
    expect(sanitizeCell('\thidden')).toEqual({ value: "'\thidden", sanitized: true })
  })

  it('escapes carriage return prefix', () => {
    expect(sanitizeCell('\rhidden')).toEqual({ value: "'\rhidden", sanitized: true })
  })

  it('returns empty string for null', () => {
    expect(sanitizeCell(null)).toEqual({ value: '', sanitized: false })
  })

  it('returns empty string for undefined', () => {
    expect(sanitizeCell(undefined)).toEqual({ value: '', sanitized: false })
  })

  it('coerces non-string input', () => {
    expect(sanitizeCell(123)).toEqual({ value: '123', sanitized: false })
  })

  it('does not prefix safe characters mid-string', () => {
    expect(sanitizeCell('Calle 1234 = mi casa')).toEqual({
      value: 'Calle 1234 = mi casa',
      sanitized: false,
    })
  })
})

describe('csv-injection — isDangerousCell', () => {
  it('detects formula prefix', () => {
    expect(isDangerousCell('=A1')).toBe(true)
  })

  it('detects plus prefix', () => {
    expect(isDangerousCell('+1')).toBe(true)
  })

  it('rejects safe text', () => {
    expect(isDangerousCell('Juan')).toBe(false)
  })

  it('rejects empty / non-string', () => {
    expect(isDangerousCell('')).toBe(false)
    expect(isDangerousCell(null)).toBe(false)
  })
})
