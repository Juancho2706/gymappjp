import { supabase } from './supabase'
import { getCoachProfile, type CoachProfile } from './coach'
import { getCoachOrgContext } from './org'
import { apiFetch } from './api'
// F6 (plan 04): TIER_LABELS vive en @eva/tiers (fuente única web+mobile). Re-export, no espejo a mano.
import { TIER_LABELS } from '@eva/tiers'
import type { ModuleKey } from '@eva/module-catalog'

export interface CoachSubscriptionOverview {
  profile: CoachProfile
  orgManaged: boolean
  orgName: string | null
  clientCount: number
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

  // Active (non-archived) client count — RLS scopes to the coach's own clients.
  const { count } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .or('is_archived.is.null,is_archived.eq.false')

  return {
    profile,
    orgManaged: ctx.isOrgManaged,
    orgName: ctx.orgName,
    clientCount: count ?? 0,
  }
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
