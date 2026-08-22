import { supabase } from './supabase'
import { getCoachProfile, type CoachProfile } from './coach'
import { getCoachOrgContext } from './org'
import { apiFetch } from './api'
import { selectWithFallback } from './db-compat'
// F6 (plan 04): TIER_LABELS vive en @eva/tiers (fuente única web+mobile). Re-export, no espejo a mano.
import { TIER_LABELS, tierMaxClientsFor } from '@eva/tiers'
import type { ModuleKey } from '@eva/module-catalog'

/** Alumno activo listable en el panel de archivado de /coach/reactivate. */
export interface ReactivateArchiveClient {
  id: string
  fullName: string
}

export interface CoachSubscriptionOverview {
  profile: CoachProfile
  orgManaged: boolean
  orgName: string | null
  /** Alumnos que OCUPAN CUPO (`is_archived = false AND is_demo = false`), no el KPI de activos. */
  clientCount: number
  /** Los mismos que cuenta `clientCount`, para el panel de archivado (vacio si no aplica). */
  activeClients: ReactivateArchiveClient[]
}

/**
 * Cupo del plan gratuito PROYECTADO por fecha de alta. Escalera de 3 peldanos (@eva/tiers,
 * `tierMaxClientsFor`): creado antes del corte v2 ⇒ 3 · entre v2 y v3 ⇒ 2 · desde v3 (2026-08-21)
 * ⇒ 1. Fuente unica — jamas hardcodear el numero en la UI. Fecha desconocida ⇒ fail-safe generoso
 * (limites viejos); el server revalida igual.
 *
 * OJO: la COLUMNA GANA. En Pricing v3 el grandfather vive en `coaches.max_clients` (backfill por
 * USO del dia D: bajaron a 1 solo los free con 0/1 alumnos, los de 2+ conservaron su fila), asi que
 * esta escalera NO describe lo que el coach tiene hoy — solo lo que el write-path escribira al
 * cambiar de tier. Todo consumidor debe leer `profile.maxClients` primero y caer aca solo si es
 * null Y el coach YA esta en free (si viene de un plan pago, su columna es la del plan pago).
 */
export function freeClientLimitFor(coachCreatedAt: string | Date | null | undefined): number {
  return tierMaxClientsFor('free', coachCreatedAt)
}

export { TIER_LABELS }

export const STATUS_LABELS: Record<string, string> = {
  active: 'Activa',
  trialing: 'En prueba',
  canceled: 'Cancelada',
  expired: 'Vencida',
  past_due: 'Pago pendiente',
  pending_payment: 'Pago pendiente',
  paused: 'Pausada',
  org_managed: 'Gestionada por tu organización',
  team_managed: 'Gestionada por tu equipo',
}

export async function getCoachSubscriptionOverview(): Promise<CoachSubscriptionOverview | null> {
  const [profile, ctx] = await Promise.all([getCoachProfile(), getCoachOrgContext()])
  if (!profile) return null

  // Alumnos que OCUPAN CUPO — RLS scopes to the coach's own clients. Se traen id+nombre (no
  // solo el count) porque el panel de archivado de la pantalla de reactivacion los lista; el conteo
  // sale de la misma lectura en vez de una segunda query.
  //
  // `coach_id` + `org_id IS NULL` + `team_id IS NULL`: el panel solo puede tocar alumnos
  // STANDALONE propios — mismo scope que
  // `archiveClientsForFreeAction` en web. En managed (org/team) el muro ni siquiera se muestra.
  //
  // `is_demo IS NOT TRUE` (onboarding v2): el alumno de EJEMPLO no ocupa cupo — el gate del server
  // lo excluye (`countActiveStandaloneClients`, `services/billing/capacity.service.ts`). Contarlo
  // aca le decia al coach que estaba sobre el limite Free por un alumno que no cuenta, y encima le
  // ofrecia archivarlo para bajar de plan: una accion que no libera nada y que el server rechaza
  // igual al revalidar. `not.is.true` cubre tambien las filas con la columna en NULL.
  //
  // Fallback de compatibilidad: en una DB anterior a la columna la lectura degrada al
  // comportamiento viejo (todos cuentan) en vez de dejar la pantalla sin alumnos.
  const activeClientsQuery = (excludeDemo: boolean) => () => {
    const q = supabase
      .from('clients')
      .select('id, full_name')
      .eq('coach_id', profile.id)
      .or('is_archived.is.null,is_archived.eq.false')
      .is('org_id', null)
      .is('team_id', null)
    return (excludeDemo ? q.not('is_demo', 'is', true) : q).order('full_name')
  }
  const { data } = await selectWithFallback<any>(activeClientsQuery(true), activeClientsQuery(false))

  const activeClients: ReactivateArchiveClient[] = (data ?? []).map((c: { id: string; full_name: string | null }) => ({
    id: c.id,
    fullName: c.full_name ?? 'Alumno',
  }))

  return {
    profile,
    orgManaged: ctx.isOrgManaged,
    orgName: ctx.orgName,
    clientCount: activeClients.length,
    activeClients,
  }
}

/**
 * Baja al plan gratuito desde la app (salida del deadlock de cupo, SIN pagar).
 *
 * No es una operacion de cobro: el bridge cancela la suscripcion en el gateway y deja al coach en
 * `free`. El servidor revalida estado bloqueado + cupo <= limite free del coach (grandfather P2,
 * mismo helper tierMaxClientsFor); esta llamada NO autoriza nada por si misma.
 */
export function activateFreePlan(): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>('/api/mobile/coach/activate-free', { method: 'POST', authenticated: true })
}

// ── Estado de suscripción RICO (E7-03) ────────────────────────────────────────────────
// Espejo del payload de /api/mobile/coach/subscription-status (bridge bearer del subscription-status
// web). La UI NUNCA calcula precios: todo monto (base/módulos/cupón/total) llega del server.

/** Add-on vivo del coach para el DISPLAY (estados = espejo de CoachAddonView web). */
export interface CoachAddonView {
  moduleKey: ModuleKey
  status: 'active' | 'cancel_pending' | 'cancelled'
  source: 'self_service' | 'admin_grant'
  firstChargedAt: string | null
  expiresAt: string | null
}

/** Evento de historial de pagos (monto ya extraído server-side del jsonb de MP). */
export interface CoachBillingEvent {
  id: string
  providerStatus: string | null
  provider: string
  createdAt: string
  providerCheckoutId: string | null
  amountClp: number | null
}

/** Desglose compuesto del server (base + módulos − cupón). */
export interface CoachBillingBreakdown {
  baseClp: number
  addonsClp: number
  totalClp: number
  baseBeforeDiscountClp: number
  discountClp: number
}

export interface CoachBillingCoach {
  id: string
  subscriptionTier: string
  subscriptionStatus: string
  maxClients: number | null
  billingCycle: 'monthly' | 'quarterly' | 'annual'
  currentPeriodEnd: string | null
  subscriptionProvider: string | null
  cardLast4: string | null
  cardBrand: string | null
}

/** Suscripción de un coach GESTIONADO (org/team): sin billing self-service. */
export interface CoachBillingManaged {
  managed: true
  managedBy: 'org' | 'team'
  subscriptionStatus: string
}

/** Suscripción de un coach STANDALONE: display rico completo. */
export interface CoachBillingStandalone {
  managed: false
  coach: CoachBillingCoach
  addons: CoachAddonView[]
  events: CoachBillingEvent[]
  billing: CoachBillingBreakdown
  activeCoupon: { code: string | null; discountClp: number } | null
  activeClientCount: number
  changeCardEnabled: boolean
}

export type CoachBillingStatus = CoachBillingManaged | CoachBillingStandalone

/**
 * Trae el estado de suscripción rico del bridge bearer. Read-only: TODAS las acciones de cobro
 * (upgrade/cancel/tarjeta/add-ons) las gestiona la web por seguridad (link-out navegador externo).
 */
export function getCoachBillingStatus(): Promise<CoachBillingStatus> {
  return apiFetch<CoachBillingStatus>('/api/mobile/coach/subscription-status', { authenticated: true })
}
