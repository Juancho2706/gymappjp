import { describe, expect, it } from 'vitest'
import {
  describeItemSubstitutions,
  resolveItemDisplayNote,
  type PlanItemSubstitutionLike,
} from './plan-substitutions'

function sub(overrides: Partial<PlanItemSubstitutionLike> = {}): PlanItemSubstitutionLike {
  return { name: 'Pollo', quantity: null, unit: null, ...overrides }
}

describe('describeItemSubstitutions', () => {
  it('sin capa de reemplazos deja el item identico a hoy', () => {
    expect(describeItemSubstitutions({})).toBeNull()
    expect(describeItemSubstitutions({ substitutions: null })).toBeNull()
    expect(describeItemSubstitutions({ substitutions: [] })).toBeNull()
  })

  it('lista el nombre solo cuando el coach no fijo cantidad (el 100% de LIVE)', () => {
    expect(describeItemSubstitutions({ substitutions: [sub()] })).toBe('o Pollo')
  })

  it('usa la cantidad del coach cuando existe', () => {
    expect(
      describeItemSubstitutions({ substitutions: [sub({ quantity: 120, unit: 'g' })] }),
    ).toBe('o 120 g de Pollo')
  })

  it('encadena varias opciones con el separador del plan', () => {
    expect(
      describeItemSubstitutions({
        substitutions: [
          sub({ quantity: 120, unit: 'g' }),
          sub({ name: 'Huevo', quantity: 2, unit: 'un' }),
          sub({ name: 'Atun' }),
        ],
      }),
    ).toBe('o 120 g de Pollo · o 2 un de Huevo · o Atun')
  })

  it('media unidad contada NO se redondea a 1', () => {
    expect(
      describeItemSubstitutions({ substitutions: [sub({ name: 'Palta', quantity: 0.5, unit: 'un' })] }),
    ).toBe('o 0,5 un de Palta')
  })

  it('cantidad invalida o unidad vacia degradan al nombre, nunca a un 0', () => {
    expect(describeItemSubstitutions({ substitutions: [sub({ quantity: 0, unit: 'g' })] })).toBe('o Pollo')
    expect(describeItemSubstitutions({ substitutions: [sub({ quantity: -5, unit: 'g' })] })).toBe('o Pollo')
    expect(describeItemSubstitutions({ substitutions: [sub({ quantity: Number.NaN, unit: 'g' })] })).toBe('o Pollo')
    expect(describeItemSubstitutions({ substitutions: [sub({ quantity: 120, unit: '  ' })] })).toBe('o Pollo')
  })

  it('descarta reemplazos sin nombre en vez de pintar una opcion vacia', () => {
    expect(describeItemSubstitutions({ substitutions: [sub({ name: '   ' })] })).toBeNull()
    expect(
      describeItemSubstitutions({ substitutions: [sub({ name: '  ' }), sub({ name: 'Atun' })] }),
    ).toBe('o Atun')
  })
})

describe('resolveItemDisplayNote', () => {
  it('con reemplazos estructurados calla el texto legado "Alternativas: ..."', () => {
    expect(resolveItemDisplayNote('Alternativas: Pavo, Atun', true)).toBeNull()
  })

  it('sin reemplazos estructurados conserva el texto legado completo', () => {
    expect(resolveItemDisplayNote('Alternativas: Pavo, Atun', false)).toBe('Alternativas: Pavo, Atun')
  })

  it('cualquier otra nota del coach se conserva aunque haya reemplazos', () => {
    expect(resolveItemDisplayNote('Cocinar a la plancha', true)).toBe('Cocinar a la plancha')
  })

  it('nota vacia, nula o solo espacios no pinta nada', () => {
    expect(resolveItemDisplayNote(null, true)).toBeNull()
    expect(resolveItemDisplayNote(undefined, false)).toBeNull()
    expect(resolveItemDisplayNote('   ', false)).toBeNull()
  })
})
