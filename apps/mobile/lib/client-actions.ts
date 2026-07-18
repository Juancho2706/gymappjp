import { Linking, Share } from 'react-native'
import { apiFetch, getApiBaseUrl } from './api'

export type ClientActionWorkspace = {
  kind: 'standalone' | 'team_owner' | 'team_member' | 'enterprise'
  teamId: string | null
  orgId: string | null
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

export async function setClientStatus(clientId: string, body: { is_active?: boolean; is_archived?: boolean }, workspace?: ClientActionWorkspace): Promise<void> {
  await apiFetch(`/api/mobile/coach/clients/${clientId}`, { method: 'PATCH', authenticated: true, body: { ...body, ...(workspace ? { workspace } : {}) } })
}
