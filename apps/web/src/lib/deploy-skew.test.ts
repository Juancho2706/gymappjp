import { describe, it, expect } from 'vitest'
import {
  DEPLOY_SKEW_RELOAD_KEY,
  DEPLOY_SKEW_RELOAD_MESSAGE,
  DEPLOY_SKEW_RELOAD_WINDOW_MS,
  SERVER_RESPONSE_BUFFER_SIZE,
  applyMeasuredBytes,
  buildServerResponseRecord,
  isDeploySkewError,
  isServerActionRequest,
  parseContentLength,
  pushServerResponse,
  readHeaderInit,
  sanitizeRequestPath,
  shouldAttachServerResponses,
  shouldDropEvent,
  shouldMeasureBody,
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

// ── E394: instrumentación de la respuesta del servidor ──────────────────────────────────────────

describe('readHeaderInit', () => {
  it('lee de un objeto plano sin importar el case del nombre', () => {
    expect(readHeaderInit({ 'Next-Action': '7f3a' }, 'next-action')).toBe('7f3a')
    expect(readHeaderInit({ RSC: '1' }, 'rsc')).toBe('1')
  })

  it('lee de un array de pares y de cualquier cosa con .get()', () => {
    expect(readHeaderInit([['Next-Action', '7f3a']], 'next-action')).toBe('7f3a')
    const headersLike = { get: (n: string) => (n === 'rsc' ? '1' : null) } as unknown as HeadersInit
    expect(readHeaderInit(headersLike, 'rsc')).toBe('1')
  })

  it('devuelve null sin fuente o sin la key', () => {
    expect(readHeaderInit(undefined, 'rsc')).toBeNull()
    expect(readHeaderInit({ 'content-type': 'application/json' }, 'rsc')).toBeNull()
    expect(readHeaderInit([], 'rsc')).toBeNull()
  })
})

describe('isServerActionRequest', () => {
  it('reconoce el Server Action y la navegación RSC', () => {
    expect(isServerActionRequest((n) => (n === 'next-action' ? '7f3a' : null))).toBe(true)
    expect(isServerActionRequest((n) => (n === 'rsc' ? '1' : null))).toBe(true)
  })

  it('deja pasar el resto de los fetch de la app sin instrumentar', () => {
    expect(isServerActionRequest(() => null)).toBe(false)
  })
})

describe('sanitizeRequestPath', () => {
  it('tira el query string (puede llevar tokens) y el fragmento', () => {
    expect(sanitizeRequestPath('/coach/clients?token=secreto#x')).toBe('/coach/clients')
  })

  it('tira el origen de una URL absoluta', () => {
    expect(sanitizeRequestPath('https://app.example.com/coach/movement/abc?a=1')).toBe('/coach/movement/abc')
    expect(sanitizeRequestPath('https://app.example.com')).toBe('/')
  })

  it('no tira con basura', () => {
    expect(sanitizeRequestPath('')).toBe('/')
    expect(sanitizeRequestPath('?solo=query')).toBe('/')
  })
})

describe('parseContentLength', () => {
  it('parsea el header y rechaza lo que no sirve', () => {
    expect(parseContentLength('2')).toBe(2)
    expect(parseContentLength('0')).toBe(0)
    expect(parseContentLength(null)).toBeNull()
    expect(parseContentLength('chunked')).toBeNull()
    expect(parseContentLength('-5')).toBeNull()
  })
})

describe('shouldMeasureBody', () => {
  it('con content-length NUNCA toca el body', () => {
    expect(shouldMeasureBody(200, 'text/x-component', 2)).toBe(false)
    expect(shouldMeasureBody(500, 'text/html', 1200)).toBe(false)
  })

  it('sin content-length y con status != 200 sí mide (body corto, es LA pista)', () => {
    expect(shouldMeasureBody(500, 'text/html', null)).toBe(true)
    expect(shouldMeasureBody(302, null, null)).toBe(true)
  })

  it('un 200 STREAMEADO sin content-length NO se clona (caso caliente y normal)', () => {
    expect(shouldMeasureBody(200, 'text/x-component;charset=utf-8', null)).toBe(false)
    expect(shouldMeasureBody(200, 'text/event-stream', null)).toBe(false)
  })

  it('un 200 no streameado sin content-length sí se mide', () => {
    expect(shouldMeasureBody(200, 'application/json', null)).toBe(true)
    expect(shouldMeasureBody(200, null, null)).toBe(true)
  })
})

describe('buildServerResponseRecord', () => {
  it('arma el registro sin PII y con el tamaño del header', () => {
    expect(
      buildServerResponseRecord({
        method: 'post',
        url: 'https://app.example.com/register?ref=ig',
        status: 200,
        contentType: 'text/x-component',
        contentLength: 2,
        durationMs: 12.7,
      }),
    ).toEqual({
      method: 'POST',
      path: '/register',
      status: 200,
      contentType: 'text/x-component',
      bytes: 2,
      bytesFrom: 'header',
      durationMs: 13,
    })
  })

  it('sin content-length deja el tamaño pendiente', () => {
    const record = buildServerResponseRecord({
      method: 'GET',
      url: '/coach/dashboard',
      status: 200,
      contentType: null,
      contentLength: null,
      durationMs: 0,
    })
    expect(record.bytes).toBeNull()
    expect(record.bytesFrom).toBeNull()
  })
})

describe('applyMeasuredBytes / pushServerResponse', () => {
  function record(path: string) {
    return buildServerResponseRecord({
      method: 'POST',
      url: path,
      status: 200,
      contentType: null,
      contentLength: null,
      durationMs: 1,
    })
  }

  it('completa el tamaño MUTANDO el registro (ya vive adentro del ring)', () => {
    const ring = pushServerResponse([], record('/a'))
    applyMeasuredBytes(ring[0], 2)
    expect(ring[0]).toMatchObject({ bytes: 2, bytesFrom: 'body' })
  })

  it('guarda solo las ultimas 5, en orden', () => {
    let ring: ReturnType<typeof pushServerResponse> = []
    for (const p of ['/1', '/2', '/3', '/4', '/5', '/6']) ring = pushServerResponse(ring, record(p))
    expect(ring).toHaveLength(SERVER_RESPONSE_BUFFER_SIZE)
    expect(ring.map((r) => r.path)).toEqual(['/2', '/3', '/4', '/5', '/6'])
  })

  it('no muta el buffer que recibe', () => {
    const original = pushServerResponse([], record('/a'))
    pushServerResponse(original, record('/b'))
    expect(original).toHaveLength(1)
  })
})

describe('shouldAttachServerResponses', () => {
  it('adjunta al mensaje que CUENTA la recarga (el caso dominante: el error se descarta)', () => {
    expect(shouldAttachServerResponses('deploy_skew_reload', DEPLOY_SKEW_RELOAD_MESSAGE)).toBe(true)
  })

  it('adjunta al E394 que NO se pudo recuperar (deploy roto de verdad / storage bloqueado)', () => {
    expect(
      shouldAttachServerResponses(new Error('An unexpected response was received from the server')),
    ).toBe(true)
  })

  it('no le agrega el buffer a ningun otro evento', () => {
    expect(shouldAttachServerResponses(new Error('Failed to fetch'), 'otro mensaje')).toBe(false)
    expect(shouldAttachServerResponses(null)).toBe(false)
  })
})
