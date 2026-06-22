import { apiFetch } from './api'

/**
 * Config operacional del cliente mobile — flags SERVER-ONLY que RN no puede leer directo
 * (el mobile habla PostgREST + lee `coaches.enabled_modules` sin ver las env/Edge Config del server).
 *
 * Espejo del endpoint `GET /api/mobile/config` (apps/web/.../api/mobile/config/route.ts):
 *   - `disabledModules`: MODULE_KEYS apagados por el kill-switch de operador (`EVA_DISABLED_MODULES`).
 *     `lib/entitlements.ts#hasModule` los resta del entitlement → un modulo killeado devuelve false
 *     aunque `coaches.enabled_modules` lo tenga true (espejo de `applyOperatorKillSwitch` en web).
 *   - `featurePrefsEnabled`: flag Edge Config `FEATURE_PREFS_ENABLED`. Gobierna el gating de la
 *     Zona C de nutricion (NutricionTab). fail-OPEN: ausente/false => se IGNORAN las prefs = mostrar
 *     todo lo entitled (grandfathering transicional, espejo de feature-prefs.service.ts en web).
 *
 * ── Fail-OPEN en TODO ─────────────────────────────────────────────────────────────
 * Si el endpoint falla (red, 401, parse), devolvemos `{ disabledModules: [], featurePrefsEnabled: false }`
 * = comportamiento de HOY: NO killeamos ningun modulo y NO ocultamos la Zona C. Nunca rompe ni
 * sobre-restringe por una falla de config.
 *
 * ── Cache ─────────────────────────────────────────────────────────────────────────
 * Cache modulo-level con TTL corto: `hasModule` se llama muchas veces por pantalla (perfil, ficha
 * de alumno, hubs de modulo), no podemos fetchear en cada llamada. Una sola llamada en vuelo se
 * comparte (dedupe de la promise). Errores NO se cachean: el proximo intento reintenta.
 */

export interface AppConfig {
  disabledModules: string[]
  featurePrefsEnabled: boolean
}

const FALLBACK: AppConfig = { disabledModules: [], featurePrefsEnabled: false }

/** TTL del cache (ms). Corto: refleja un flip de operador (kill-switch / FEATURE_PREFS_ENABLED) sin reinstalar. */
const TTL_MS = 60_000

let cached: { value: AppConfig; at: number } | null = null
let inFlight: Promise<AppConfig> | null = null

/**
 * Config operacional del mobile (cacheada). Fail-OPEN: ante cualquier error devuelve
 * `{ disabledModules: [], featurePrefsEnabled: false }` (comportamiento de hoy). No lanza.
 *
 * @param force ignora el cache fresco y fuerza un re-fetch (uso opcional, ej. pull-to-refresh).
 */
export async function getAppConfig(force = false): Promise<AppConfig> {
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.value

  // Dedupe: una sola request en vuelo se comparte entre llamadas concurrentes.
  if (inFlight) return inFlight

  inFlight = (async (): Promise<AppConfig> => {
    try {
      const res = await apiFetch<Partial<AppConfig>>('/api/mobile/config', {
        method: 'GET',
        authenticated: true,
      })
      const value: AppConfig = {
        disabledModules: Array.isArray(res?.disabledModules)
          ? res.disabledModules.filter((m): m is string => typeof m === 'string')
          : [],
        featurePrefsEnabled: res?.featurePrefsEnabled === true,
      }
      cached = { value, at: Date.now() }
      return value
    } catch {
      // fail-OPEN: NO cacheamos el fallback (el proximo intento reintenta), pero tampoco rompemos.
      return FALLBACK
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/** Limpia el cache (ej. al cambiar de sesion). El proximo `getAppConfig` vuelve a fetchear. */
export function clearAppConfigCache(): void {
  cached = null
  inFlight = null
}
