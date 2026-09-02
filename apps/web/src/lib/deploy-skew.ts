// ── Deploy skew: detección y guard de la recarga ────────────────────────────────────────────────
//
// Cuando sale un deploy, las pestañas abiertas siguen corriendo el bundle viejo. El primer Server
// Action que disparen viaja con ids que el deploy nuevo ya no conoce y Next tira
// `Error: An unexpected response was received from the server` (next_error_code E394) o
// `Failed to find Server Action ...`. Es el issue Sentry EVA-NEXTJS-3 / -19: llega como
// `onunhandledrejection`, sin catch en el call site, y para el usuario la acción simplemente no pasó.
// El plan de Vercel no tiene Skew Protection, así que la cura del lado del cliente es recargar.
//
// Este módulo es la lógica pura (sin `window`, sin Sentry) para poder testearla; el montaje vive en
// `apps/web/instrumentation-client.ts` (listeners globales + `beforeSend` de Sentry).

/** Ventana en la que una recarga previa cuenta como «ya intentamos»: evita el bucle. */
export const DEPLOY_SKEW_RELOAD_WINDOW_MS = 120_000

/** Clave del guard en `sessionStorage` (por pestaña: el skew es de la pestaña, no del usuario). */
export const DEPLOY_SKEW_RELOAD_KEY = 'eva:deploy-skew:last-reload'

// Los tres textos con los que Next reporta el mismo desfase. El primero es el de E394 (el que domina
// el issue); el segundo aparece cuando el deploy nuevo sí responde pero no encuentra el id de acción.
const DEPLOY_SKEW_PATTERNS = [
  /unexpected response was received from the server/i,
  /Failed to find Server Action/i,
  /\bE394\b/,
]

/** Mínimo denominador común de `sessionStorage` para poder inyectar un doble en los tests. */
export type DeploySkewStorage = Pick<Storage, 'getItem' | 'setItem'>

function messageOf(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message
  if (value && typeof value === 'object') {
    const message = (value as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return null
}

/**
 * ¿Este error es el desfase de deploy? Acepta el valor crudo del evento (string, Error o el objeto
 * de `PromiseRejectionEvent.reason`) porque el handler global recibe cualquiera de los tres.
 */
export function isDeploySkewError(value: unknown): boolean {
  // Next marca sus errores internos con `__NEXT_ERROR_CODE`: es la señal más limpia cuando existe,
  // porque no depende del texto (que cambia entre versiones y viene traducido en algunos runtimes).
  if (value && typeof value === 'object') {
    const code = (value as { __NEXT_ERROR_CODE?: unknown }).__NEXT_ERROR_CODE
    if (code === 'E394') return true
  }
  const message = messageOf(value)
  if (!message) return false
  return DEPLOY_SKEW_PATTERNS.some((pattern) => pattern.test(message))
}

/**
 * ¿Corresponde recargar ahora? Devuelve `true` UNA sola vez por ventana y **deja marcada** la
 * recarga en el mismo paso: los dos listeners (`error` y `unhandledrejection`) pueden ver el mismo
 * fallo, y sin la marca atómica se recargaría dos veces.
 *
 * Sin storage (Safari privado, cookies de terceros bloqueadas) devuelve `false`: sin guard no hay
 * forma de cortar el bucle, y una acción perdida es reparable — un bucle de recargas no.
 */
export function shouldReload(now: number, storage: DeploySkewStorage | null): boolean {
  if (!storage) return false
  try {
    const previous = Number.parseInt(storage.getItem(DEPLOY_SKEW_RELOAD_KEY) ?? '', 10)
    // `now - previous` negativo = marca en el futuro (reloj movido): se trata como reciente, que es
    // el lado conservador (no recargar) en vez de arriesgar el bucle.
    if (Number.isFinite(previous) && now - previous < DEPLOY_SKEW_RELOAD_WINDOW_MS) return false
    storage.setItem(DEPLOY_SKEW_RELOAD_KEY, String(now))
    return true
  } catch {
    return false
  }
}

/**
 * ¿Este evento de Sentry hay que TIRARLO? Sí cuando la recarga por skew ya quedó agendada en esta
 * pestaña y el evento es justamente ese desfase: el error no es del producto y lo cuenta el mensaje
 * `deploy_skew_reload`.
 *
 * Existe como función aparte porque el orden de los handlers lo vuelve indispensable: los listeners
 * de `window` (`error` / `unhandledrejection`) corren ANTES que el handler de Sentry y `shouldReload`
 * CONSUME el guard de `sessionStorage` al agendar. Cuando el mismo fallo llega a `beforeSend`,
 * `shouldReload` ya devuelve `false` ⇒ sin este flag el E394 se reportaba igual y el ruido se
 * DUPLICABA (error + mensaje) en vez de limpiarse.
 */
export function shouldDropEvent(reloadScheduled: boolean, value: unknown): boolean {
  return reloadScheduled && isDeploySkewError(value)
}

// ── E394: QUÉ respondió el servidor (instrumentación, inventario 02-09) ─────────────────────────
//
// El guard de arriba convierte el E394 en una recarga y lo cuenta con `deploy_skew_reload`. Lo que
// NO dice es POR QUÉ: el 02-09 aparecieron 2 eventos sobre el release VIVO (no había deploy nuevo,
// así que no era skew) y la sospecha del inventario es una respuesta 200 de ~2 bytes del Server
// Action. Sin status / bytes / content-type no hay causa raíz posible.
//
// La instrumentación es un ring buffer chiquito con las últimas respuestas de los requests de Next
// (`Next-Action` o `RSC`), que se adjunta al evento de Sentry SOLO cuando el evento es el desfase.
// SIN PII: nunca el body, nunca el query string, nunca el origen — método, path, status,
// content-type, tamaño y duración.
//
// Esto es lógica PURA (formato del registro y filtros); el wrap de `window.fetch` vive en
// `apps/web/instrumentation-client.ts`.

/** Mensaje propio con el que se CUENTAN las recargas por skew (fingerprint fijo en el wiring). */
export const DEPLOY_SKEW_RELOAD_MESSAGE = 'deploy_skew_reload'

/** Cuántas respuestas se recuerdan. Ring chico a propósito: es contexto de UN error, no una traza. */
export const SERVER_RESPONSE_BUFFER_SIZE = 5

/**
 * Headers (en minúscula) que marcan un request de Next capaz de terminar en E394: `Next-Action` es
 * la invocación de un Server Action y `RSC` el fetch del payload de una navegación. Cualquier otro
 * fetch de la app (Supabase, imágenes, analytics) NO se instrumenta.
 */
export const SERVER_ACTION_HEADERS = ['next-action', 'rsc'] as const

/** Content-types que Next STREAMEA: llegan sin `content-length` y pueden ser enormes. */
const STREAMED_PAYLOAD_TYPES = ['text/x-component', 'text/event-stream']

/** Una respuesta ya registrada. Todos los campos son metadatos: ningún dato de usuario. */
export interface ServerResponseRecord {
  method: string
  /** Path SIN query string ni origen (`/coach/clients/123` → sí; `?token=…` → nunca). */
  path: string
  status: number
  contentType: string | null
  /** Tamaño en bytes, o `null` si medirlo habría costado caro (ver `shouldMeasureBody`). */
  bytes: number | null
  /** De dónde salió `bytes`: del header (gratis) o de leer un clon del body. */
  bytesFrom: 'header' | 'body' | null
  durationMs: number
}

/**
 * Lee un header de un `HeadersInit` sin construir un `Headers` (esto corre en el camino caliente de
 * CADA fetch de la app). `name` tiene que venir en minúsculas. Duck-typing en vez de `instanceof`
 * para no depender de que el global exista en el runtime de los tests.
 */
export function readHeaderInit(source: HeadersInit | null | undefined, name: string): string | null {
  if (!source) return null
  const maybeHeaders = source as unknown as { get?: (n: string) => string | null }
  if (typeof maybeHeaders.get === 'function') return maybeHeaders.get(name) ?? null
  if (Array.isArray(source)) {
    for (const entry of source) {
      if (entry?.[0]?.toLowerCase() === name) return entry[1] ?? null
    }
    return null
  }
  for (const key of Object.keys(source)) {
    if (key.toLowerCase() === name) return (source as Record<string, string>)[key] ?? null
  }
  return null
}

/**
 * ¿Este request es uno de los que puede caer en E394? Recibe un lookup en vez de los headers para
 * no atarse a una forma concreta (`Request`, `Headers`, array de pares u objeto plano).
 */
export function isServerActionRequest(lookup: (name: string) => string | null): boolean {
  return SERVER_ACTION_HEADERS.some((header) => lookup(header) != null)
}

/**
 * Path limpio para el registro: sin query string (puede llevar tokens/emails), sin fragmento y sin
 * origen. Implementación a mano —no `new URL`— porque tiene que aceptar relativas y no puede tirar.
 */
export function sanitizeRequestPath(url: string): string {
  const raw = (url ?? '').split('#')[0]?.split('?')[0] ?? ''
  if (!raw) return '/'
  const schemeEnd = raw.indexOf('://')
  if (schemeEnd === -1) return raw
  const afterScheme = raw.slice(schemeEnd + 3)
  const firstSlash = afterScheme.indexOf('/')
  return firstSlash === -1 ? '/' : afterScheme.slice(firstSlash)
}

/** `content-length` como número, o `null` si no vino o vino basura. */
export function parseContentLength(raw: string | null | undefined): number | null {
  if (raw == null) return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

/**
 * CRITERIO BARATO para medir el tamaño (documentado a propósito — es la decisión de rendimiento):
 *
 *  1. Con `content-length` NO se toca el body: el dato ya está y clonar sería gratis-negativo.
 *  2. Sin `content-length` y con status ≠ 200 sí se mide: un error/redirect trae un body corto y es
 *     justamente la pista que falta.
 *  3. Sin `content-length` y con status 200, se mide SOLO si el tipo no es un payload STREAMEADO
 *     (`text/x-component`, `text/event-stream`). Clonar un stream de RSC lo bufferea entero: ese es
 *     el caso caliente y normal de la app, y ahí el costo no se justifica.
 *
 * Punto ciego consciente: un 200 `text/x-component` sin `content-length` queda con `bytes: null`.
 * Se acepta porque una respuesta de ~2 bytes (la sospecha del inventario) viaja prácticamente
 * siempre con `content-length` — no se transfiere en chunks —, así que cae en el caso 1.
 */
export function shouldMeasureBody(
  status: number,
  contentType: string | null,
  contentLength: number | null,
): boolean {
  if (contentLength != null) return false
  if (status !== 200) return true
  const mime = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  return !STREAMED_PAYLOAD_TYPES.includes(mime)
}

/** Arma el registro con lo que se sabe sin tocar el body (el tamaño puede llegar después). */
export function buildServerResponseRecord(input: {
  method: string
  url: string
  status: number
  contentType: string | null
  contentLength: number | null
  durationMs: number
}): ServerResponseRecord {
  return {
    method: (input.method || 'GET').toUpperCase(),
    path: sanitizeRequestPath(input.url),
    status: input.status,
    contentType: input.contentType,
    bytes: input.contentLength,
    bytesFrom: input.contentLength != null ? 'header' : null,
    durationMs: Math.round(input.durationMs),
  }
}

/**
 * Completa el tamaño medido leyendo el clon. MUTA el registro a propósito: la lectura del body es
 * asíncrona y el registro ya está adentro del ring — devolver una copia dejaría el ring con el
 * `bytes: null` viejo.
 */
export function applyMeasuredBytes(record: ServerResponseRecord, bytes: number): ServerResponseRecord {
  record.bytes = bytes
  record.bytesFrom = 'body'
  return record
}

/** Empuja al ring y devuelve las últimas `SERVER_RESPONSE_BUFFER_SIZE` (nuevo array, sin mutar). */
export function pushServerResponse(
  buffer: readonly ServerResponseRecord[],
  record: ServerResponseRecord,
): ServerResponseRecord[] {
  return [...buffer, record].slice(-SERVER_RESPONSE_BUFFER_SIZE)
}

/**
 * ¿Este evento de Sentry merece el buffer adjunto? Solo los dos que hablan del desfase: el mensaje
 * que cuenta la recarga (`deploy_skew_reload`) y un E394 que NO se pudo recuperar (deploy roto de
 * verdad o storage bloqueado). Al resto no se le agrega nada: el buffer es diagnóstico, no telemetría.
 */
export function shouldAttachServerResponses(raw: unknown, eventMessage?: string | null): boolean {
  if (eventMessage === DEPLOY_SKEW_RELOAD_MESSAGE) return true
  return isDeploySkewError(raw)
}
