import * as Sentry from '@sentry/react-native'

/**
 * Validación de uuid compartida (extraída de `coach-client-detail.ts`, hallazgo 2026-07-21).
 *
 * El origen del ruido: `router.push(`/ruta/${id}`)` con `id` nulo produce la URL literal
 * `/ruta/null`, y `useLocalSearchParams` devuelve el STRING `'null'` — que es TRUTHY y pasa
 * limpio cualquier guard `if (!clientId)`. Ese `'null'` viaja a un filtro uuid de PostgREST y
 * Postgres responde `invalid input syntax for type uuid: "null"`.
 */
export const NIL_UUID = '00000000-0000-0000-0000-000000000000'
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Type guard: `true` solo para un uuid canónico. `'null'`, `''`, `undefined` y basura ⇒ `false`. */
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

/**
 * Degrada un id inválido (undefined / 'null' / '' / basura) al UUID nil — un uuid VÁLIDO que no
 * matchea ninguna fila. Evita mandar 'null'/'' a un filtro uuid de PostgREST, que responde
 * `invalid input syntax for type uuid` (ruido de logs prod, hallazgo 2026-07-21) sin degradar el
 * happy path: un id real pasa tal cual; un id roto no consulta datos ajenos (nil no matchea).
 */
export function safeUuid(v: string | null | undefined): string {
  return v && UUID_RE.test(v) ? v : NIL_UUID
}

/**
 * Reporta a Sentry una pantalla montada con un param de ruta que NO es uuid (típicamente el string
 * `'null'`). Se corta la consulta y se redirige, así que sin esta señal el bug quedaría invisible:
 * el objetivo es matar el error de Postgres SIN perder observabilidad del emisor que rompió.
 */
export function reportInvalidRouteUuid(screen: string, received: unknown): void {
  try {
    Sentry.captureMessage('nav: param de ruta no es uuid', {
      // fingerprint fijo: sin él Sentry agrupa por el nombre de la función del stack (EVA-MOBILE-9/C).
      fingerprint: ['nav-uuid-guard', 'param-no-uuid'],
      level: 'warning',
      tags: { area: 'nav-uuid-guard', platform: 'rn', screen },
      extra: { screen, received: typeof received === 'string' ? received : String(received) },
    })
  } catch {
    // Sentry no inicializado (sin DSN) / versión sin API → no-op silencioso.
  }
}
