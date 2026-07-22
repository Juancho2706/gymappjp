// Logica de resolucion de flags (E0-G4). El modulo bajo test es puro (sin
// react-native/expo), asi que corre con el runner del repo aunque viva en
// apps/mobile. Vitest lo colecta por el glob `tests/**`.
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
    expect(isEnabled('executorV2')).toBe(FLAGS.executorV2)
  })

  it('con override remoto true, manda el remoto por sobre el default false', () => {
    setRemoteFlags({ executorV2: true })
    expect(isEnabled('executorV2')).toBe(true)
  })

  it('con override remoto false, manda el remoto (aunque coincida con el default)', () => {
    setRemoteFlags({ executorV2: false })
    expect(isEnabled('executorV2')).toBe(false)
  })

  it('payload sin la key (undefined) cae al default local (fail-safe)', () => {
    setRemoteFlags({})
    expect(isEnabled('executorV2')).toBe(FLAGS.executorV2)
  })

  it('setRemoteFlags(null) — sin red / fetch fallido — cae al default local', () => {
    setRemoteFlags(null)
    expect(isEnabled('executorV2')).toBe(FLAGS.executorV2)
  })

  it('setRemoteFlags(undefined) tambien cae al default local', () => {
    setRemoteFlags(undefined)
    expect(isEnabled('executorV2')).toBe(FLAGS.executorV2)
  })

  it('clearRemoteFlags borra un override previo y vuelve al default', () => {
    setRemoteFlags({ executorV2: true })
    expect(isEnabled('executorV2')).toBe(true)

    clearRemoteFlags()
    expect(isEnabled('executorV2')).toBe(FLAGS.executorV2)
  })

  it('valores no-booleanos en el payload (drift de tipos en runtime) se ignoran y caen al default', () => {
    setRemoteFlags({ executorV2: 'true' as unknown as boolean })
    expect(isEnabled('executorV2')).toBe(FLAGS.executorV2)
  })

  it('FLAGS es la unica fuente de verdad de las keys conocidas', () => {
    expect(Object.keys(FLAGS)).toEqual(['executorV2', 'executorV3', 'nutritionV2Student', 'nutritionV2Coach'])
  })
})
