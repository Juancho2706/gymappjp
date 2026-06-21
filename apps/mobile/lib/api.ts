import { supabase } from './supabase'

const DEFAULT_API_BASE_URL = 'https://eva-app.cl'

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
    if (!token) {
      // Sesión no hidratada todavía / access_token vencido al momento de la llamada:
      // intentar refrescar/hidratar ANTES de pegar sin token. Sin esto, una llamada
      // autenticada justo al entrar salía SIN header Authorization → el server respondía
      // MISSING_TOKEN (401) → rebote al login apenas cargaba el panel. Si no hay refresh
      // token (sesión realmente muerta), queda null y el server decide.
      const refreshed = await supabase.auth.refreshSession()
      token = refreshed.data.session?.access_token ?? null
      if (!token) {
        // Visible en `adb logcat` (release) para diagnosticar sesión vacía en device.
        console.warn('[eva-auth] apiFetch sin token: getSession y refreshSession vacios →', path)
      }
    }
  }

  let res = await exec(token)

  // Manejo central de 401. Refrescar una vez y reintentar. CLAVE: solo cerramos
  // sesión si el REFRESH falla (sesión irrecuperable). Si el refresh anda pero el
  // endpoint SIGUE 401, es un problema del ENDPOINT (authz/verificación server,
  // ej. verifyMobileBearer rechazando un token que GoTrue/PostgREST sí aceptan),
  // NO una sesión muerta → lanzamos ApiError y el caller decide (degradar/mostrar
  // error). Antes hacíamos signOut acá → un 401 de UN endpoint te deslogueaba y el
  // guard raíz te pateaba al login aunque la sesión estuviera viva.
  if (res.status === 401 && options.authenticated) {
    const { data, error } = await supabase.auth.refreshSession()
    const newToken = data.session?.access_token ?? null
    if (!error && newToken) {
      res = await exec(newToken)
    } else {
      await supabase.auth.signOut().catch(() => {})
    }
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
