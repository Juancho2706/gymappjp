// Contrato del form de identificador de coach (RN). Desde el morph en la misma pantalla
// (frame 4 del concepto C) el MISMO form vive en dos superficies: el sheet del selector
// (`components/entry/CoachCodeSheet.tsx`) y la ruta `/alumno/codigo` de los deep links.
// Este test blinda la parte que no depende de React Native: el copy que ve el alumno y la
// regla de habilitacion del CTA. Si alguien vuelve a duplicar el form, estas cadenas son
// el canario.
//
// GOTCHA de CI (feedback_ci_root_test_mobile_dep_gotcha): un test de la raiz que importa
// una dependencia solo-mobile pasa local por hoisteo y falla en CI. Por eso el modulo bajo
// test no importa NADA de RN — se importa directo, sin mocks ni resolucion manual.
import { describe, expect, it } from 'vitest'
import {
  COACH_IDENTIFIER_HELPER,
  canSubmitCoachIdentifier,
  coachIdentifierErrorCopy,
} from '../apps/mobile/lib/coach-identifier-form'

describe('coachIdentifierErrorCopy', () => {
  it('sin error no hay mensaje: manda el helper en reposo', () => {
    expect(coachIdentifierErrorCopy(null)).toBeNull()
    expect(COACH_IDENTIFIER_HELPER).toBe('Letras y números, sin espacios.')
  })

  it('distingue los 3 fallos con copy accionable', () => {
    expect(coachIdentifierErrorCopy('format')).toContain('5 caracteres')
    expect(coachIdentifierErrorCopy('not-found')).toContain('No encontramos ese coach')
    expect(coachIdentifierErrorCopy('network')).toContain('No pudimos conectarnos')
  })

  it('ningun mensaje se repite: el alumno tiene que poder distinguir la causa', () => {
    const copies = (['format', 'not-found', 'network'] as const).map(coachIdentifierErrorCopy)
    expect(new Set(copies).size).toBe(3)
  })
})

describe('canSubmitCoachIdentifier', () => {
  it('habilita el CTA con algo escrito y sin resolucion en curso', () => {
    expect(canSubmitCoachIdentifier('JOSEFIT', false)).toBe(true)
  })

  it('un campo vacio o de solo espacios NO habilita (el shake seria gratis)', () => {
    expect(canSubmitCoachIdentifier('', false)).toBe(false)
    expect(canSubmitCoachIdentifier('   ', false)).toBe(false)
  })

  it('mientras resuelve el CTA queda bloqueado (anti doble submit)', () => {
    expect(canSubmitCoachIdentifier('JOSEFIT', true)).toBe(false)
  })
})
