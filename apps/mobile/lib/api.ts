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
  }

  let res = await exec(token)

  // Ola 0: manejo central de 401/sesión expirada. Refrescar una vez y reintentar;
  // si sigue 401, cerrar sesión (el root layout redirige a login → sin "sesión zombi").
  if (res.status === 401 && options.authenticated) {
    const { data, error } = await supabase.auth.refreshSession()
    const newToken = data.session?.access_token ?? null
    if (!error && newToken) res = await exec(newToken)
    if (res.status === 401) await supabase.auth.signOut().catch(() => {})
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
