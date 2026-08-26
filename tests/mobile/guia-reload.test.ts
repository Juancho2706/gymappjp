/**
 * Recarga de la guía al volver a la app (`apps/mobile/lib/guia-reload.ts`, SPEC «Vive tu app»
 * directo §2, V1.23).
 *
 * Lo que se pinnea es el borde: el paso 2 solo se tilda cuando el coach VOLVIÓ del navegador, así
 * que la guía tiene que recargar en la entrada a `active` y en ninguna otra transición. Recargar de
 * más no es gratis: cada `inactive` (selector de apps en iOS, centro de notificaciones en Android)
 * dispararía un `GET` del dashboard con la app tapada.
 *
 * El módulo es puro (no importa react-native), así que se importa por ruta relativa y corre con el
 * runner del repo: sin `vi.doMock` por path absoluto, que es el baile que necesitan los tests que
 * arrastran el árbol nativo.
 */
import { describe, expect, it } from 'vitest'
import { shouldReloadOnAppState, type AppLifecycleState } from '../../apps/mobile/lib/guia-reload'

const NOT_ACTIVE: AppLifecycleState[] = ['background', 'inactive', 'unknown', 'extension']

describe('shouldReloadOnAppState', () => {
  it('volver del navegador recarga: background → active', () => {
    expect(shouldReloadOnAppState('background', 'active')).toBe(true)
  })

  it('cualquier estado que no sea `active` cuenta como «estábamos afuera»', () => {
    for (const prev of NOT_ACTIVE) {
      expect(shouldReloadOnAppState(prev, 'active')).toBe(true)
    }
  })

  it('irse NO recarga: la app se está tapando, no volviendo', () => {
    for (const next of NOT_ACTIVE) {
      expect(shouldReloadOnAppState('active', next)).toBe(false)
    }
  })

  it('un evento repetido no es una vuelta: active → active no recarga', () => {
    expect(shouldReloadOnAppState('active', 'active')).toBe(false)
  })

  it('transiciones entre estados de fondo tampoco: nadie volvió todavía', () => {
    expect(shouldReloadOnAppState('inactive', 'background')).toBe(false)
    expect(shouldReloadOnAppState('background', 'inactive')).toBe(false)
    expect(shouldReloadOnAppState('unknown', 'background')).toBe(false)
  })
})
