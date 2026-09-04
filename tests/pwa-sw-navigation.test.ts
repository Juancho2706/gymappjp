// Handler de navegación del service worker del alumno (`apps/web/public/sw.js`).
//
// Este archivo existe por el bug que expulsaba al alumno del entreno cuando se le caía la señal:
//   1. FIX A — el put a NAV_CACHE se hacía con `res.ok` a secas. Con la sesión vencida la
//      navegación sigue el redirect al login y devuelve 200, así que quedaba LA PÁGINA DE LOGIN
//      guardada bajo la URL del workout y la recarga offline servía eso en vez del entreno.
//   2. FIX B — era network-first SIN timeout. Con "lie-fi" (conectado pero sin throughput real)
//      el fetch no rechaza nunca, el `.catch()` no corre y el NAV_CACHE, que sólo se alcanzaba
//      por ahí, quedaba inalcanzable: pantalla colgada con la copia del entreno a un centímetro.
//   3. FIX C — bump de NAV_CACHE para que el 'activate' borre las entradas ya envenenadas por (1)
//      en los teléfonos reales.
//
// El sw.js NO es un módulo: se lee del disco tal cual y se evalúa con `new Function` sobre un
// scope simulado (self/caches/fetch/clients). Pegar una copia del código acá no protegería nada:
// el punto es que el test rompa cuando alguien toque el archivo que se despacha a producción.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// El archivo arranca con BOM (así vive en el repo): U+FEFF es espacio en blanco para el parser,
// pero se saca igual para que el harness evalue exactamente lo mismo que el navegador.
const SW_SOURCE = readFileSync(
  fileURLToPath(new URL('../apps/web/public/sw.js', import.meta.url)),
  'utf8'
).replace(/^\uFEFF/, '')

const ORIGIN = 'https://www.eva-app.cl'
const WORKOUT_URL = `${ORIGIN}/c/juancho/workout/plan-123`
const OFFLINE_URL = '/offline.html'
const SHELL_CACHE = 'eva-shell-v5'

// Se lee del propio sw.js para que el test no invente su propio techo de espera.
const NAV_TIMEOUT_MS = Number(/const NAV_TIMEOUT_MS = (\d+)/.exec(SW_SOURCE)?.[1])
// Igual que el timeout: el nombre del cache se deriva del source. Con el literal hardcodeado, el
// próximo bump legítimo (v5 → v6) dejaba media docena de casos en rojo con mensajes que no hablan
// del cambio que los rompió. Ahora el bump rompe UN test, el de abajo, que se lee solo.
const NAV_CACHE = /const NAV_CACHE = '([^']+)'/.exec(SW_SOURCE)?.[1] ?? ''

// --- dobles ---------------------------------------------------------------------------------

type FakeResponse = {
  label: string
  ok: boolean
  redirected: boolean
  clone: () => FakeResponse
}

// Response falso en vez del global: el SW sólo mira `ok`, `redirected` y `clone()`, y así se
// puede fabricar `redirected: true` (en el Response real es de sólo lectura) y comparar por
// `label` sin consumir bodies.
function fakeResponse(label: string, opts: { ok?: boolean; redirected?: boolean } = {}): FakeResponse {
  const ok = opts.ok ?? true
  const redirected = opts.redirected ?? false
  return { label, ok, redirected, clone: () => fakeResponse(label, { ok, redirected }) }
}

const keyOf = (request: unknown): string =>
  typeof request === 'string' ? request : String((request as { url: string }).url)

const stripSearch = (url: string): string => url.split('#')[0].split('?')[0]

function createCachesMock() {
  const stores = new Map<string, Map<string, FakeResponse>>()
  const storeFor = (name: string) => {
    const existing = stores.get(name)
    if (existing) return existing
    const created = new Map<string, FakeResponse>()
    stores.set(name, created)
    return created
  }

  const api = {
    open: async (name: string) => {
      const store = storeFor(name)
      return {
        match: async (request: unknown) => store.get(keyOf(request)),
        put: async (request: unknown, response: FakeResponse) => {
          store.set(keyOf(request), response)
        },
        addAll: async () => undefined,
      }
    },
    match: async (
      request: unknown,
      options: { cacheName?: string; ignoreSearch?: boolean } = {}
    ) => {
      const key = keyOf(request)
      const names = options.cacheName ? [options.cacheName] : [...stores.keys()]
      for (const name of names) {
        const store = stores.get(name)
        if (!store) continue
        const hit = store.get(key)
        if (hit) return hit
        if (options.ignoreSearch) {
          for (const [storedKey, storedValue] of store) {
            if (stripSearch(storedKey) === stripSearch(key)) return storedValue
          }
        }
      }
      return undefined
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  }

  return { api, stores, storeFor }
}

function loadServiceWorker() {
  const listeners = new Map<string, (event: unknown) => void>()
  const { api: cachesMock, stores, storeFor } = createCachesMock()
  const fetchCalls: unknown[] = []
  let fetchImpl: (request: unknown) => Promise<FakeResponse> = async () => {
    throw new Error('el test no configuró setFetch')
  }

  const clients = { claim: async () => undefined, openWindow: async () => undefined }
  const swSelf = {
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      listeners.set(type, handler)
    },
    location: { origin: ORIGIN },
    skipWaiting: async () => undefined,
    clients,
    registration: { showNotification: async () => undefined },
  }

  const fetchMock = (request: unknown) => {
    fetchCalls.push(request)
    return fetchImpl(request)
  }

  const factory = new Function('self', 'caches', 'fetch', 'clients', SW_SOURCE) as (
    self: unknown,
    caches: unknown,
    fetch: unknown,
    clients: unknown
  ) => void
  factory(swSelf, cachesMock, fetchMock, clients)

  return {
    stores,
    fetchCalls,
    setFetch(impl: (request: unknown) => Promise<FakeResponse>) {
      fetchImpl = impl
    },
    seed(cacheName: string, url: string, response: FakeResponse) {
      storeFor(cacheName).set(url, response)
    },
    entry(cacheName: string, url: string) {
      return stores.get(cacheName)?.get(url)
    },
    cacheNames() {
      return [...stores.keys()]
    },
    dispatch<T>(type: string, event: T): T {
      const handler = listeners.get(type)
      if (!handler) throw new Error(`el sw.js no registró un listener de '${type}'`)
      handler(event)
      return event
    },
  }
}

type NavEvent = {
  request: { url: string; method: string; mode: string; destination: string }
  respondWith: (value: Promise<FakeResponse>) => void
  waitUntil: (value: Promise<unknown>) => void
  waits: Promise<unknown>[]
  responded: Promise<FakeResponse>
}

function navigationEvent(url: string = WORKOUT_URL): NavEvent {
  const event = {
    request: { url, method: 'GET', mode: 'navigate', destination: 'document' },
    waits: [] as Promise<unknown>[],
    responded: undefined as unknown as Promise<FakeResponse>,
    respondWith: (value: Promise<FakeResponse>) => {
      event.responded = Promise.resolve(value)
    },
    waitUntil: (value: Promise<unknown>) => {
      event.waits.push(Promise.resolve(value))
    },
  }
  return event
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  // El rechazo se consume siempre en el SW; este noop evita el unhandled rejection del runner
  // cuando el caso rechaza antes de que el handler enganche su .catch().
  promise.catch(() => undefined)
  return { promise, resolve, reject }
}

// El put a NAV_CACHE cuelga de un `.then()` que el SW no awaitea (a propósito: no debe demorar la
// respuesta), así que aterriza unos ticks después del waitUntil.
async function flushMicrotasks() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve()
}

async function settleWaits(event: NavEvent) {
  await Promise.all(event.waits)
  await flushMicrotasks()
}

// --- casos ----------------------------------------------------------------------------------

describe('sw.js — carrera del handler de navegación (/c/ y /t/)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('el techo de espera es la constante nombrada NAV_TIMEOUT_MS = 2500', () => {
    expect(NAV_TIMEOUT_MS).toBe(2500)
  })

  // Único caso atado a la versión del cache: si esto se pone rojo, alguien bumpeó NAV_CACHE (lo
  // cual es legítimo — ver FIX C) y sólo hay que actualizar este literal. El resto de los casos
  // deriva el nombre del source y sobrevive el bump.
  it('el cache de navegación vigente es eva-nav-v5', () => {
    expect(NAV_CACHE).toBe('eva-nav-v5')
  })

  it('con copia cacheada y red colgada ("lie-fi") sirve la copia al vencer el timeout, sin esperar al fetch', async () => {
    const sw = loadServiceWorker()
    sw.seed(NAV_CACHE, WORKOUT_URL, fakeResponse('workout-cacheado'))

    const red = deferred<FakeResponse>()
    let redResuelta = false
    red.promise.then(() => {
      redResuelta = true
    })
    sw.setFetch(() => red.promise)

    const event = sw.dispatch('fetch', navigationEvent())
    let servida: FakeResponse | null = null
    event.responded.then((res) => {
      servida = res
    })

    await vi.advanceTimersByTimeAsync(NAV_TIMEOUT_MS)

    expect(servida).toMatchObject({ label: 'workout-cacheado' })
    // La clave del fix: se respondió con el fetch todavía en vuelo, no cancelado.
    expect(redResuelta).toBe(false)
    expect(sw.fetchCalls).toHaveLength(1)
  })

  it('con copia cacheada y red rápida sirve lo de red, no la copia', async () => {
    const sw = loadServiceWorker()
    sw.seed(NAV_CACHE, WORKOUT_URL, fakeResponse('workout-cacheado'))
    sw.setFetch(async () => fakeResponse('workout-fresco'))

    const event = sw.dispatch('fetch', navigationEvent())

    await expect(event.responded).resolves.toMatchObject({ label: 'workout-fresco' })
    await settleWaits(event)
    expect(sw.entry(NAV_CACHE, WORKOUT_URL)).toMatchObject({ label: 'workout-fresco' })
  })

  it('el put a NAV_CACHE ocurre igual cuando ya servimos la copia por timeout', async () => {
    const sw = loadServiceWorker()
    sw.seed(NAV_CACHE, WORKOUT_URL, fakeResponse('workout-cacheado'))

    const red = deferred<FakeResponse>()
    sw.setFetch(() => red.promise)

    const event = sw.dispatch('fetch', navigationEvent())
    await vi.advanceTimersByTimeAsync(NAV_TIMEOUT_MS)
    await expect(event.responded).resolves.toMatchObject({ label: 'workout-cacheado' })

    // La red llega tarde: el fetch nunca se canceló, así que refresca la copia para la próxima.
    red.resolve(fakeResponse('workout-fresco'))
    await settleWaits(event)
    expect(sw.entry(NAV_CACHE, WORKOUT_URL)).toMatchObject({ label: 'workout-fresco' })
  })

  it('sin copia cacheada NO adelanta nada por timeout: espera a la red', async () => {
    const sw = loadServiceWorker()
    sw.seed(SHELL_CACHE, OFFLINE_URL, fakeResponse('offline-html'))

    const red = deferred<FakeResponse>()
    sw.setFetch(() => red.promise)

    const event = sw.dispatch('fetch', navigationEvent())
    let respondida = false
    event.responded.then(() => {
      respondida = true
    })

    await vi.advanceTimersByTimeAsync(NAV_TIMEOUT_MS * 4)
    // Adelantar offline.html acá sería peor que hoy: mataríamos una navegación lenta pero viva.
    expect(respondida).toBe(false)

    red.resolve(fakeResponse('workout-fresco'))
    await expect(event.responded).resolves.toMatchObject({ label: 'workout-fresco' })
  })

  it('una respuesta con redirected:true (sesión vencida → login) NO se guarda bajo la URL del workout', async () => {
    const sw = loadServiceWorker()
    sw.setFetch(async () => fakeResponse('pagina-de-login', { ok: true, redirected: true }))

    const event = sw.dispatch('fetch', navigationEvent())

    // Se sirve al alumno (tiene que poder loguearse), pero no envenena el NAV_CACHE.
    await expect(event.responded).resolves.toMatchObject({ label: 'pagina-de-login' })
    await settleWaits(event)
    expect(sw.entry(NAV_CACHE, WORKOUT_URL)).toBeUndefined()
  })

  it('con la red caída y copia cacheada sirve la copia', async () => {
    const sw = loadServiceWorker()
    sw.seed(NAV_CACHE, WORKOUT_URL, fakeResponse('workout-cacheado'))
    sw.seed(SHELL_CACHE, OFFLINE_URL, fakeResponse('offline-html'))
    sw.setFetch(async () => {
      throw new TypeError('Failed to fetch')
    })

    const event = sw.dispatch('fetch', navigationEvent())

    await expect(event.responded).resolves.toMatchObject({ label: 'workout-cacheado' })
  })

  it('con la red caída y sin copia cae a offline.html', async () => {
    const sw = loadServiceWorker()
    sw.seed(SHELL_CACHE, OFFLINE_URL, fakeResponse('offline-html'))
    sw.setFetch(async () => {
      throw new TypeError('Failed to fetch')
    })

    const event = sw.dispatch('fetch', navigationEvent())

    await expect(event.responded).resolves.toMatchObject({ label: 'offline-html' })
  })

  // El cinturón de ignoreSearch NO puede estar en el camino feliz. La ruta del ejecutor lee 'fecha'
  // de los searchParams y el precache guarda la URL COMPLETA, así que NAV_CACHE junta varias
  // entradas del mismo path. Si la carrera del timeout aceptara un match laxo, el alumno con la red
  // apenas lenta recibiría a los 2,5 s el entreno de OTRO día: con un 'fecha' pasada el ejecutor
  // queda en modo solo-UPDATE, las series nuevas mueren con past_set_not_found y la cola offline
  // las descarta PARA SIEMPRE. Perder series es peor que esperar.
  it('con copia de OTRA query y red colgada NO adelanta esa copia: el entreno de otro día no se sirve', async () => {
    const sw = loadServiceWorker()
    sw.seed(NAV_CACHE, `${WORKOUT_URL}?fecha=2026-08-28`, fakeResponse('workout-de-otro-dia'))
    sw.seed(SHELL_CACHE, OFFLINE_URL, fakeResponse('offline-html'))

    const red = deferred<FakeResponse>()
    sw.setFetch(() => red.promise)

    const event = sw.dispatch('fetch', navigationEvent(`${WORKOUT_URL}?fecha=2026-09-03`))
    let servida: FakeResponse | null = null
    event.responded.then((res) => {
      servida = res
    })

    await vi.advanceTimersByTimeAsync(NAV_TIMEOUT_MS * 4)

    // Sin hit EXACTO no hay carrera: se sigue esperando la red, no se responde nada.
    expect(servida).toBeNull()

    // Y cuando la red llega, lo que se sirve es el día PEDIDO.
    red.resolve(fakeResponse('workout-del-dia-pedido'))
    await expect(event.responded).resolves.toMatchObject({ label: 'workout-del-dia-pedido' })
  })

  it('mantiene el cinturón de ignoreSearch: la copia guardada con query params sigue sirviendo', async () => {
    const sw = loadServiceWorker()
    sw.seed(NAV_CACHE, `${WORKOUT_URL}?d=2026-09-03`, fakeResponse('workout-cacheado-con-query'))
    sw.seed(SHELL_CACHE, OFFLINE_URL, fakeResponse('offline-html'))
    sw.setFetch(async () => {
      throw new TypeError('Failed to fetch')
    })

    const event = sw.dispatch('fetch', navigationEvent())

    await expect(event.responded).resolves.toMatchObject({ label: 'workout-cacheado-con-query' })
  })
})

describe('sw.js — bump de NAV_CACHE (FIX C)', () => {
  it("el 'activate' borra eva-nav-v4 y conserva los caches vigentes", async () => {
    const sw = loadServiceWorker()
    sw.seed('eva-nav-v4', WORKOUT_URL, fakeResponse('login-envenenado'))
    sw.seed(NAV_CACHE, WORKOUT_URL, fakeResponse('workout-cacheado'))
    sw.seed(SHELL_CACHE, OFFLINE_URL, fakeResponse('offline-html'))

    const waits: Promise<unknown>[] = []
    sw.dispatch('activate', { waitUntil: (value: Promise<unknown>) => waits.push(value) })
    await Promise.all(waits)

    expect(sw.cacheNames()).not.toContain('eva-nav-v4')
    expect(sw.cacheNames()).toEqual(expect.arrayContaining([NAV_CACHE, SHELL_CACHE]))
  })

  it('una entrada vieja en eva-nav-v4 ya no se sirve como si fuera el entreno', async () => {
    const sw = loadServiceWorker()
    sw.seed('eva-nav-v4', WORKOUT_URL, fakeResponse('login-envenenado'))
    sw.seed(SHELL_CACHE, OFFLINE_URL, fakeResponse('offline-html'))
    sw.setFetch(async () => {
      throw new TypeError('Failed to fetch')
    })

    const event = sw.dispatch('fetch', navigationEvent())

    await expect(event.responded).resolves.toMatchObject({ label: 'offline-html' })
  })
})
