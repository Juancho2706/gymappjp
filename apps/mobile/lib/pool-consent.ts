import { apiFetch } from './api'

/**
 * Consentimiento de pool (Ley 21.719) — espejo RN del gate del proxy web
 * (`proxy.ts:681` /t y `proxy.ts:1041-1051` /c). La app no pasa por el proxy, así que
 * el estado/grant/revoke viven en `/api/mobile/auth/pool-consent` (identidad del bearer).
 */

export type PoolConsentStatus =
  | { pool: false }
  | { pool: true; granted: boolean; teamSlug: string; teamName: string }

type StatusResponse =
  | { ok: true; pool: false }
  | { ok: true; pool: true; granted: boolean; teamSlug: string; teamName: string }

/**
 * Estado del consentimiento del alumno autenticado. Devuelve `null` en error de red/servicio:
 * el gate del layout es fail-open ante contexto ausente (espejo exacto del proxy web, que solo
 * redirige `if (poolCtx && poolCtx.has_pool_consent !== true)`); el registro server-side del
 * grant sigue siendo la autoridad.
 */
export async function getPoolConsentStatus(): Promise<PoolConsentStatus | null> {
  try {
    const res = await apiFetch<StatusResponse>('/api/mobile/auth/pool-consent', {
      authenticated: true,
    })
    if (!res?.ok) return null
    return res.pool
      ? { pool: true, granted: res.granted, teamSlug: res.teamSlug, teamName: res.teamName }
      : { pool: false }
  } catch {
    return null
  }
}

/** Otorga el consentimiento (idempotente). Lanza en fallo — el caller muestra el error. */
export async function grantPoolConsent(teamSlug: string): Promise<void> {
  await apiFetch<{ ok: true }>('/api/mobile/auth/pool-consent', {
    method: 'POST',
    authenticated: true,
    body: { teamSlug, accepted: true },
  })
}

/** Revoca el consentimiento (derecho del titular). Lanza en fallo. */
export async function revokePoolConsent(teamSlug: string): Promise<void> {
  await apiFetch<{ ok: true }>('/api/mobile/auth/pool-consent', {
    method: 'DELETE',
    authenticated: true,
    body: { teamSlug },
  })
}
