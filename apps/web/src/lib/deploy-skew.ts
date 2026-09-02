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
