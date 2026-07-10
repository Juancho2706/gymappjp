import * as Sentry from '@sentry/react-native'
import { supabase } from './supabase'

// P0 (expulsion alumno): DEBE ser el host CANONICO. El apex `eva-app.cl` responde 307 -> `www.eva-app.cl`
// (redirect CROSS-ORIGIN); `fetch` sigue el redirect pero DESCARTA el header `Authorization` al cambiar
// de origen, asi que la request aterriza en www SIN auth => 401 con una sesion perfectamente valida.
// Apuntar directo a www evita el redirect y conserva el bearer. Override por env para local/staging.
const DEFAULT_API_BASE_URL = 'https://www.eva-app.cl'

/**
 * ¿El error de `refreshSession()` indica una sesion DEFINITIVAMENTE muerta (refresh token invalido)?
 * Un 4xx del endpoint de refresh = el token ya no vale => cierre real. Un error de red (status
 * ausente/0, AuthRetryableFetchError) es TRANSITORIO => jamas debe desloguear una sesion valida.
 */
function isSessionDefinitivelyInvalid(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const status = (error as { status?: number }).status
  return typeof status === 'number' && status >= 400 && status < 500
}

export class ApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

type ApiOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
  authenticated?: boolean
}

export function getApiBaseUrl(): string {
  return (process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '')
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const exec = (token: string | null) => {
    const headers = new Headers(options.headers)
    headers.set('Content-Type', 'application/json')
    if (options.authenticated && token) headers.set('Authorization', `Bearer ${token}`)
    return fetch(`${getApiBaseUrl()}${path}`, {
      ...options,
      headers,
      body: options.body == null ? undefined : JSON.stringify(options.body),
    })
  }

  let token: string | null = null
  if (options.authenticated) {
    const { data } = await supabase.auth.getSession()
    token = data.session?.access_token ?? null
  }

  let res = await exec(token)

  // Manejo central de 401. Un 401 tiene DOS causas y solo UNA justifica cerrar sesion:
  //   (a) la SESION expiro/es invalida  -> refreshSession() falla con 4xx -> cierre real (SIGNED_OUT).
  //   (b) el ENDPOINT devuelve 401 por causas AJENAS a la sesion (redirect apex->www que descarta el
  //       Authorization, WAF, prod desincronizado, endpoint no desplegado) -> refreshSession() EXITOSO
  //       (la sesion es valida) -> NUNCA desloguear; se propaga el ApiError y la pantalla degrada.
  // Bug P0 previo: si el refresh salia bien pero el endpoint seguia en 401, igual se hacia signOut
  // => una sesion valida expulsada al login apenas cargaba el dashboard (revalidacion de entitlements).
  if (res.status === 401 && options.authenticated) {
    const { data, error } = await supabase.auth.refreshSession()
    const newToken = data.session?.access_token ?? null
    if (newToken) {
      // Refresh OK => sesion VALIDA. Reintentar una vez; si el endpoint sigue en 401 es su culpa,
      // no de la sesion => caer al throw de abajo SIN desloguear.
      res = await exec(newToken)
    } else if (isSessionDefinitivelyInvalid(error)) {
      // Refresh token invalido => sesion realmente muerta => cierre real (root layout redirige a login).
      Sentry.addBreadcrumb({
        category: 'auth',
        level: 'warning',
        message: 'apiFetch: signOut por sesion irrecuperable (refresh token invalido)',
        data: { path, status: (error as { status?: number }).status },
      })
      await supabase.auth.signOut().catch(() => {})
    }
    // else: refresh fallo por RED/transitorio => se conserva la sesion (no expulsar por un error de red).
  }

  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(
      payload?.error || 'No se pudo completar la solicitud.',
      res.status,
      payload?.code
    )
  }

  return payload as T
}

export interface RegisterCoachFreePayload {
  fullName: string
  brandName: string
  email: string
  password: string
  acceptLegal: true
  acceptHealthData: true
  acceptMarketing?: boolean
}

export interface RegisterCoachFreeResponse {
  ok: true
  email: string
  slug: string
  message: string
}

export function registerCoachFree(payload: RegisterCoachFreePayload) {
  return apiFetch<RegisterCoachFreeResponse>('/api/mobile/auth/register-coach-free', {
    method: 'POST',
    body: payload,
  })
}

// E5-23: completa el intake OAuth del coach (Google) que ya está autenticado pero sin fila `coaches`.
// Espejo mobile de la rama FREE de `coach/onboarding/complete` (web). Authenticated: el server crea el
// perfil con service-role sobre `auth.uid()` del bearer. Free-tier — planes pagos se activan en la web.
export interface CompleteCoachOnboardingPayload {
  fullName: string
  brandName: string
  acceptLegal: true
  acceptHealthData: true
  acceptMarketing?: boolean
}

export interface CompleteCoachOnboardingResponse {
  ok: true
  slug: string
  alreadyOnboarded?: boolean
}

export function completeCoachOnboarding(payload: CompleteCoachOnboardingPayload) {
  return apiFetch<CompleteCoachOnboardingResponse>('/api/mobile/auth/complete-coach-onboarding', {
    method: 'POST',
    authenticated: true,
    body: payload,
  })
}

// P2: firmar (signed URLs) las fotos de check-in de un alumno. El bucket `checkins` es
// privado y el coach no tiene policy de storage → la firma se hace server-side. `refs` acepta
// tanto paths nuevos como URLs públicas legacy (el route normaliza con toCheckinPath).
export interface SignCheckinPhotosResponse {
  urls: Record<string, string | null>
}

export function signCheckinPhotos(clientId: string, refs: string[]) {
  return apiFetch<SignCheckinPhotosResponse>('/api/mobile/coach/checkin-photos', {
    method: 'POST',
    authenticated: true,
    body: { clientId, refs },
  })
}

/**
 * E1-18: limpieza AUTORITATIVA (service-role) del flag force_password_change del alumno tras
 * cambiar la contraseña. Reemplaza el UPDATE best-effort por PostgREST directo (que una policy
 * puede bloquear → loop del gate). Ver apps/web/.../api/mobile/auth/clear-force-password.
 */
export function clearForcePasswordChange() {
  return apiFetch<{ ok: true }>('/api/mobile/auth/clear-force-password', {
    method: 'POST',
    authenticated: true,
  })
}
