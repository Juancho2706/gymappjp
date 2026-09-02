import type { CoachLead, CoachLeadStatus, CoachLeadUpdatableStatus } from '@eva/schemas'
import { apiFetch } from './api'

/**
 * Inbox «Solicitudes» del coach en RN (coach-leads W3.2).
 *
 * Quien deja una solicitud en `/join/<código>` NO se da de alta: el coach la recibe y decide. La
 * web ya tiene esa bandeja en `/coach/clients?solicitudes=1`; acá vive el lado app.
 *
 * El contrato (DTO + estados) es el MISMO objeto que emite la web, tipado en
 * `packages/schemas/coach-leads.ts`. Este módulo no conoce la tabla ni sus columnas.
 *
 * Todo lo que NO es red es PURO (formato de fecha, etiquetas, conteo del badge) para que viva en
 * `tests/mobile/coach-leads.test.ts` sin montar un solo componente.
 */

export type { CoachLead, CoachLeadStatus, CoachLeadUpdatableStatus }

// ── Red ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Bandeja del coach autenticado. Sin `status` devuelve las ABIERTAS (`new` + `contacted`), que es
 * lo que pinta la pantalla; el servidor decide ese default (no la app).
 */
export async function getCoachLeads(status?: CoachLeadStatus): Promise<CoachLead[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  const res = await apiFetch<{ leads: CoachLead[] }>(`/api/mobile/coach/leads${query}`, {
    authenticated: true,
  })
  return res.leads ?? []
}

/**
 * Mueve una solicitud de estado. La pertenencia la valida el SERVIDOR (RLS + `where` por
 * `coach_id`): esta llamada no autoriza nada, solo pide. Devuelve el item ya releído para que la
 * lista no tenga que inventar el estado nuevo ni recargar entera.
 *
 * `clientId` solo viaja con `converted`: es el alumno que el alta acaba de crear (lo devuelve
 * `POST /api/mobile/coach/clients`). Con él, el servidor cierra el loop de la tarjeta compartida
 * —copia la atribución a `clients` y emite `coach_client_referred`—, el mismo cierre que hace el
 * panel web. Sin él la solicitud igual se cierra: el campo es opcional en el contrato para no
 * romper una app vieja, así que tampoco se manda la clave cuando no hay alumno.
 */
export async function setCoachLeadStatus(
  leadId: string,
  status: CoachLeadUpdatableStatus,
  clientId?: string | null,
): Promise<CoachLead> {
  const res = await apiFetch<{ ok: true; lead: CoachLead }>(
    `/api/mobile/coach/leads/${encodeURIComponent(leadId)}`,
    {
      method: 'PATCH',
      authenticated: true,
      body: clientId ? { status, clientId } : { status },
    },
  )
  return res.lead
}

// ── Puro ───────────────────────────────────────────────────────────────────────────────────────

/** Badge del chip «Solicitudes»: solo las que el coach todavía no tocó. */
export function countNewLeads(leads: readonly CoachLead[]): number {
  return leads.filter((lead) => lead.status === 'new').length
}

/**
 * Tabla FIJA de meses. `toLocaleDateString(..., { month: 'short' })` está PROHIBIDO en la app: en
 * Android el ICU recortado devuelve otra abreviatura (o el número) según el dispositivo, así que
 * la misma fecha se veía distinta en dos teléfonos. Acá el resultado depende solo de la fecha.
 */
const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const

const DAY_MS = 24 * 60 * 60 * 1000

/** Medianoche LOCAL del día de `date` — la comparación es por día de calendario, no por 24 h. */
function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * «Cuándo llegó», con tabla fija y sin locale:
 *  - hoy / ayer,
 *  - hasta 6 días: «Hace N días»,
 *  - más viejo: «12 ago» (y con el año cuando no es el año en curso).
 *
 * Una fecha ilegible devuelve cadena vacía: la tarjeta se pinta igual, sin un «Invalid Date».
 */
export function formatLeadDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const days = Math.round((startOfLocalDay(now) - startOfLocalDay(date)) / DAY_MS)
  if (days === 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  if (days > 1 && days < 7) return `Hace ${days} días`

  const label = `${date.getDate()} ${MONTHS_ES[date.getMonth()]}`
  return date.getFullYear() === now.getFullYear() ? label : `${label} ${date.getFullYear()}`
}

/** Origen de la solicitud, en el idioma del coach. `null` ⇒ no se muestra chip. */
export function leadSourceLabel(lead: Pick<CoachLead, 'referrerName' | 'referralSource'>): string | null {
  if (lead.referrerName) return `Por la tarjeta de ${lead.referrerName}`
  if (lead.referralSource === 'share_card') return 'Por una tarjeta compartida'
  return null
}

/** Primer nombre — para títulos y confirmaciones, donde el nombre completo no entra. */
export function leadFirstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName.trim()
}

/**
 * WhatsApp del coach hacia el solicitante — ESPEJO 1:1 de `toWhatsAppDigits`/`waMeUrl`
 * (`apps/web/src/lib/contact/whatsapp.ts`), que es lo que usan el correo al coach y el panel web.
 * Si los dos lados normalizaran distinto, el mismo lead abriría dos chats distintos.
 *
 * Regla (conservadora, solo el caso chileno inequívoco):
 *  1. se descarta todo lo que no sea dígito;
 *  2. se quitan los ceros iniciales (prefijo de salida nacional: «09…» → «9…»);
 *  3. exactamente 9 dígitos que empiezan con 9 (móvil chileno sin país) ⇒ se antepone 56.
 * Cualquier otro largo queda intacto: un número extranjero ya trae su país.
 *
 * `null` ⇒ el botón de WhatsApp no se pinta (nunca un `wa.me` vacío).
 */
export function leadWhatsAppDigits(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '').replace(/^0+/, '')
  if (!digits) return null
  if (digits.length === 9 && digits.startsWith('9')) return `56${digits}`
  return digits
}

export function leadWhatsAppUrl(phone: string | null | undefined): string | null {
  const digits = leadWhatsAppDigits(phone)
  return digits ? `https://wa.me/${digits}` : null
}

// ── Handoff «Convertir» → alta de alumno ───────────────────────────────────────────────────────

/**
 * La pantalla de solicitudes no da de alta: ese flujo (con su muro de cupo, su clave temporal y su
 * mensaje al alumno) vive en el tab «Alumnos». Para convertir, la solicitud queda ACÁ y la pantalla
 * de alumnos la consume al enfocarse.
 *
 * Por qué un módulo y no params de ruta: el nombre, el teléfono y el correo del solicitante son
 * datos de un tercero — no tienen por qué viajar en una URL que queda en el historial del router.
 * Vive en memoria del proceso y se consume UNA vez.
 */
export type PendingLeadConversion = {
  leadId: string
  fullName: string
  email: string | null
  phone: string | null
}

let pendingConversion: PendingLeadConversion | null = null

export function setPendingLeadConversion(lead: PendingLeadConversion | null): void {
  pendingConversion = lead
}

/** Devuelve y BORRA la solicitud pendiente: volver al tab no puede reabrir el alta sola. */
export function consumePendingLeadConversion(): PendingLeadConversion | null {
  const pending = pendingConversion
  pendingConversion = null
  return pending
}

export function peekPendingLeadConversion(): PendingLeadConversion | null {
  return pendingConversion
}
