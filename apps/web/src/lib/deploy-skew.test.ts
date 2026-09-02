import { describe, it, expect } from 'vitest'
import {
  DEPLOY_SKEW_RELOAD_KEY,
  DEPLOY_SKEW_RELOAD_WINDOW_MS,
  isDeploySkewError,
  shouldDropEvent,
  shouldReload,
  type DeploySkewStorage,
} from './deploy-skew'

function fakeStorage(initial?: string): DeploySkewStorage & { value: string | null } {
  return {
    value: initial ?? null,
    getItem(key: string) {
      return key === DEPLOY_SKEW_RELOAD_KEY ? this.value : null
    },
    setItem(key: string, value: string) {
      if (key === DEPLOY_SKEW_RELOAD_KEY) this.value = value
    },
  }
}

describe('isDeploySkewError', () => {
  it('reconoce el texto de E394 tal como llega de Next', () => {
    expect(isDeploySkewError(new Error('An unexpected response was received from the server.'))).toBe(true)
  })

  it('reconoce el id de accion perdido y el codigo suelto', () => {
    expect(isDeploySkewError('Failed to find Server Action "7f3a". This request might be from an older deployment.')).toBe(true)
    expect(isDeploySkewError('next_error_code E394')).toBe(true)
  })

  it('reconoce el marcador interno de Next aunque el mensaje no diga nada', () => {
    const error = Object.assign(new Error('algo raro'), { __NEXT_ERROR_CODE: 'E394' })
    expect(isDeploySkewError(error)).toBe(true)
  })

  it('acepta el reason crudo de una promesa rechazada', () => {
    expect(isDeploySkewError({ message: 'An unexpected response was received from the server' })).toBe(true)
  })

  it('no se lleva por delante otros errores', () => {
    expect(isDeploySkewError(new Error('Failed to fetch'))).toBe(false)
    expect(isDeploySkewError('Load failed')).toBe(false)
    // E715 es otro codigo de Next: no debe matchear el patron de E394.
    expect(isDeploySkewError(Object.assign(new Error('boom'), { __NEXT_ERROR_CODE: 'E715' }))).toBe(false)
    expect(isDeploySkewError(null)).toBe(false)
    expect(isDeploySkewError(undefined)).toBe(false)
    expect(isDeploySkewError({})).toBe(false)
  })
})

describe('shouldReload', () => {
  it('recarga la primera vez y deja la marca', () => {
    const storage = fakeStorage()
    expect(shouldReload(1_000_000, storage)).toBe(true)
    expect(storage.value).toBe('1000000')
  })

  it('no recarga dos veces por el mismo fallo (error + unhandledrejection)', () => {
    const storage = fakeStorage()
    expect(shouldReload(1_000_000, storage)).toBe(true)
    expect(shouldReload(1_000_010, storage)).toBe(false)
  })

  it('sigue bloqueado justo antes de que expire la ventana', () => {
    const storage = fakeStorage('1000000')
    expect(shouldReload(1_000_000 + DEPLOY_SKEW_RELOAD_WINDOW_MS - 1, storage)).toBe(false)
  })

  it('vuelve a permitir la recarga pasada la ventana', () => {
    const storage = fakeStorage('1000000')
    const now = 1_000_000 + DEPLOY_SKEW_RELOAD_WINDOW_MS
    expect(shouldReload(now, storage)).toBe(true)
    expect(storage.value).toBe(String(now))
  })

  it('trata una marca en el futuro (reloj movido) como reciente', () => {
    const storage = fakeStorage('2000000')
    expect(shouldReload(1_000_000, storage)).toBe(false)
  })

  it('ignora una marca corrupta', () => {
    const storage = fakeStorage('no-es-un-numero')
    expect(shouldReload(1_000_000, storage)).toBe(true)
  })

  it('no recarga si no hay storage o si tira al leer', () => {
    expect(shouldReload(1_000_000, null)).toBe(false)
    const bloqueado: DeploySkewStorage = {
      getItem() {
        throw new Error('SecurityError')
      },
      setItem() {},
    }
    expect(shouldReload(1_000_000, bloqueado)).toBe(false)
  })
})

describe('shouldDropEvent', () => {
  // Regresion del hallazgo J-1: los listeners de `window` corren ANTES que `beforeSend` y
  // `shouldReload` consume el guard al agendar, asi que el evento que llega despues al hook ya no
  // puede preguntarle al storage. La senal correcta es el flag de la recarga agendada.
  it('tira el error de skew cuando la recarga YA se agendo', () => {
    expect(shouldDropEvent(true, new Error('An unexpected response was received from the server'))).toBe(true)
    expect(shouldDropEvent(true, Object.assign(new Error('algo raro'), { __NEXT_ERROR_CODE: 'E394' }))).toBe(true)
  })

  it('sin recarga agendada el error se reporta como siempre (deploy roto de verdad, storage bloqueado)', () => {
    expect(shouldDropEvent(false, new Error('An unexpected response was received from the server'))).toBe(false)
  })

  it('nunca tira otros errores, ni con la recarga agendada', () => {
    expect(shouldDropEvent(true, new Error('Failed to fetch'))).toBe(false)
    // El mensaje propio que CUENTA las recargas tiene que sobrevivir: es el unico registro que queda.
    expect(shouldDropEvent(true, 'deploy_skew_reload')).toBe(false)
  })

  it('reproduce el orden real: listener agenda (guard consumido) y el hook igual descarta', () => {
    const storage = fakeStorage()
    const error = new Error('An unexpected response was received from the server')
    // 1) listener de `window`: agenda y consume el guard.
    expect(shouldReload(1_000_000, storage)).toBe(true)
    // 2) el MISMO error llega a `beforeSend`: el guard ya dice que no.
    expect(shouldReload(1_000_010, storage)).toBe(false)
    // 3) ...y aun asi el evento se descarta, que es lo que pide AC-J4.
    expect(shouldDropEvent(true, error)).toBe(true)
  })
})
