// Logica de resolucion de flags (E0-G4). El modulo bajo test es puro (sin
// react-native/expo), asi que corre con el runner del repo aunque viva en
// apps/mobile. Vitest lo colecta por el glob `tests/**`.
//
// Nota: los flags `executorV2`/`executorV3` se eliminaron (V3 = único camino, CEO 2026-07-23), asi
// que estas pruebas de la maquinaria generica usan `nutritionV2Student` como flag de referencia.
import { describe, it, expect, afterEach } from 'vitest'
import {
  FLAGS,
  isEnabled,
  setRemoteFlags,
  clearRemoteFlags,
} from '../../apps/mobile/lib/flags'

describe('flags: resolucion local vs remota', () => {
  afterEach(() => {
    clearRemoteFlags()
  })

  it('sin override remoto, devuelve el default local declarado en FLAGS', () => {
    expect(isEnabled('nutritionV2Student')).toBe(FLAGS.nutritionV2Student)
  })

  it('con override remoto true, manda el remoto por sobre el default false', () => {
    setRemoteFlags({ nutritionV2Student: true })
    expect(isEnabled('nutritionV2Student')).toBe(true)
  })

  it('con override remoto false, manda el remoto (aunque coincida con el default)', () => {
    setRemoteFlags({ nutritionV2Student: false })
    expect(isEnabled('nutritionV2Student')).toBe(false)
  })

  it('payload sin la key (undefined) cae al default local (fail-safe)', () => {
    setRemoteFlags({})
    expect(isEnabled('nutritionV2Student')).toBe(FLAGS.nutritionV2Student)
  })

  it('setRemoteFlags(null) — sin red / fetch fallido — cae al default local', () => {
    setRemoteFlags(null)
    expect(isEnabled('nutritionV2Student')).toBe(FLAGS.nutritionV2Student)
  })

  it('setRemoteFlags(undefined) tambien cae al default local', () => {
    setRemoteFlags(undefined)
    expect(isEnabled('nutritionV2Student')).toBe(FLAGS.nutritionV2Student)
  })

  it('clearRemoteFlags borra un override previo y vuelve al default', () => {
    setRemoteFlags({ nutritionV2Student: true })
    expect(isEnabled('nutritionV2Student')).toBe(true)

    clearRemoteFlags()
    expect(isEnabled('nutritionV2Student')).toBe(FLAGS.nutritionV2Student)
  })

  it('valores no-booleanos en el payload (drift de tipos en runtime) se ignoran y caen al default', () => {
    setRemoteFlags({ nutritionV2Student: 'true' as unknown as boolean })
    expect(isEnabled('nutritionV2Student')).toBe(FLAGS.nutritionV2Student)
  })

  it('FLAGS es la unica fuente de verdad de las keys conocidas', () => {
    expect(Object.keys(FLAGS)).toEqual(['nutritionV2Student', 'nutritionV2Coach'])
  })
})
