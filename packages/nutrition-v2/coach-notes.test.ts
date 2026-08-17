import { describe, expect, it } from 'vitest'
import { coachNoteDisplayText } from './coach-notes'

describe('coachNoteDisplayText', () => {
  it('devuelve null para null/undefined (sin nota => cero render)', () => {
    expect(coachNoteDisplayText(null)).toBeNull()
    expect(coachNoteDisplayText(undefined)).toBeNull()
  })

  it('devuelve null para string vacio o solo whitespace', () => {
    expect(coachNoteDisplayText('')).toBeNull()
    expect(coachNoteDisplayText('   ')).toBeNull()
    expect(coachNoteDisplayText('\n\t  \n')).toBeNull()
  })

  it('recorta el whitespace de los bordes y conserva el texto', () => {
    expect(coachNoteDisplayText('  Sin sal agregada  ')).toBe('Sin sal agregada')
  })

  it('conserva los saltos de linea INTERNOS (texto plano multilinea)', () => {
    expect(coachNoteDisplayText('Linea 1\nLinea 2\n')).toBe('Linea 1\nLinea 2')
  })
})
