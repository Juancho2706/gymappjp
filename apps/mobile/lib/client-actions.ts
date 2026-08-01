import { Linking, Share } from 'react-native'
import { apiFetch, getApiBaseUrl } from './api'

export type ClientActionWorkspace = {
  kind: 'standalone' | 'team_owner' | 'team_member' | 'enterprise'
  teamId: string | null
  orgId: string | null
}

export type ClientUnarchiveCapacity = {
  /** null = Team pool without a persisted client quota (not an unknown entitlement). */
  limit: number | null
  used: number | null
  label: string
  available: boolean
}

// Acciones rápidas por alumno desde el listado del coach.
// WhatsApp/login/share son 100% cliente; delete/reset/status usan los endpoints mobile.

export function clientLoginUrl(slug: string): string {
  return `${getApiBaseUrl()}/c/${slug}/login`
}

export function teamClientLoginUrl(slug: string): string {
  return `${getApiBaseUrl()}/t/${slug}/login`
}

export function whatsappUrl(phone: string, name: string, loginUrl: string): string {
  const digits = phone.replace(/\D/g, '')
  const text = encodeURIComponent(`Hola ${name}, aquí tienes tu acceso a la app de EVA: ${loginUrl}`)
  return `https://wa.me/${digits}?text=${text}`
}

export async function openWhatsApp(phone: string, name: string, loginUrl: string): Promise<void> {
  await Linking.openURL(whatsappUrl(phone, name, loginUrl))
}

export async function shareLogin(name: string, loginUrl: string): Promise<void> {
  await Share.share({ message: `Hola ${name}, tu acceso a la app de EVA: ${loginUrl}` })
}

export async function deleteClient(clientId: string, workspace?: ClientActionWorkspace): Promise<void> {
  await apiFetch(`/api/mobile/coach/clients/${clientId}`, { method: 'DELETE', authenticated: true, body: workspace ? { workspace } : undefined })
}

export async function resetClientPassword(clientId: string, workspace?: ClientActionWorkspace): Promise<string> {
  const res = await apiFetch<{ ok: boolean; tempPassword: string }>(`/api/mobile/coach/clients/${clientId}/reset-password`, { method: 'POST', authenticated: true, body: workspace ? { workspace } : undefined })
  return res.tempPassword
}

/** Archive transitions have server-side entitlement, assignment and Auth side effects. */
export async function archiveClient(clientId: string, workspace?: ClientActionWorkspace): Promise<void> {
  await apiFetch(`/api/mobile/coach/clients/${clientId}/archive`, {
    method: 'POST',
    authenticated: true,
    body: workspace ? { workspace } : {},
  })
}

export async function unarchiveClient(clientId: string, workspace?: ClientActionWorkspace): Promise<void> {
  await apiFetch(`/api/mobile/coach/clients/${clientId}/unarchive`, {
    method: 'POST',
    authenticated: true,
    body: workspace ? { workspace } : {},
  })
}

/** Server-derived capacity snapshot used only to disable impossible UI actions. */
export async function getClientUnarchiveCapacity(workspace?: ClientActionWorkspace): Promise<ClientUnarchiveCapacity> {
  return apiFetch<ClientUnarchiveCapacity>('/api/mobile/coach/clients/unarchive-capacity', {
    method: 'POST',
    authenticated: true,
    body: workspace ? { workspace } : {},
  })
}

export async function archiveClientsBulk(clientIds: string[], workspace?: ClientActionWorkspace): Promise<{ archived: number; authFailures: number }> {
  return apiFetch('/api/mobile/coach/clients/archive-bulk', {
    method: 'POST',
    authenticated: true,
    body: { clientIds, ...(workspace ? { workspace } : {}) },
  })
}

/** Explicit pause/resume; generic profile PATCH is intentionally unable to change access. */
export async function setClientAccessStatus(clientId: string, isActive: boolean, workspace?: ClientActionWorkspace): Promise<void> {
  await apiFetch(`/api/mobile/coach/clients/${clientId}/access`, {
    method: 'POST',
    authenticated: true,
    body: { isActive, ...(workspace ? { workspace } : {}) },
  })
}
