/**
 * Codigo sugerido al DUPLICAR un grupo del sistema (F1). El schema solo acepta 1-3 letras
 * (`/^[A-Z]{1,3}$/`), asi que el sufijo numerico clasico ("C2") no sirve y hay que derivar
 * letras. La unicidad real la impone el servicio; esto evita el viaje que iba a fallar.
 */

import { describe, expect, it } from 'vitest'
import { suggestExchangeGroupCode, suggestFreeExchangeGroupCode } from './PortionsGroupForm'

const CODIGO_VALIDO = /^[A-Z]{1,3}$/

describe('suggestFreeExchangeGroupCode', () => {
  it('deriva del codigo original sin chocar con los ocupados', () => {
    const code = suggestFreeExchangeGroupCode('C', ['C', 'P', 'F'])
    expect(code).toBe('CA')
    expect(CODIGO_VALIDO.test(code)).toBe(true)
  })

  it('salta los derivados ya tomados', () => {
    expect(suggestFreeExchangeGroupCode('C', ['C', 'CA', 'CB'])).toBe('CC')
  })

  it('respeta el maximo de 3 letras partiendo de un codigo largo', () => {
    const code = suggestFreeExchangeGroupCode('LAC', ['LAC'])
    expect(code).toBe('LAA')
    expect(CODIGO_VALIDO.test(code)).toBe(true)
  })

  it('es insensible a mayusculas y a basura en el codigo de origen', () => {
    expect(suggestFreeExchangeGroupCode(' c ', ['ca'])).toBe('CB')
    expect(CODIGO_VALIDO.test(suggestFreeExchangeGroupCode('123', []))).toBe(true)
  })

  it('la sugerencia por nombre sigue intacta (no se toco el alta normal)', () => {
    expect(suggestExchangeGroupCode('Colación Fran')).toBe('COL')
  })
})
