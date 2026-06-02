import { supabase } from './supabase'
import { getCoachProfile, type CoachProfile } from './coach'
import { getCoachOrgContext } from './org'

export interface CoachSubscriptionOverview {
  profile: CoachProfile
  orgManaged: boolean
  orgName: string | null
  clientCount: number
}

export const TIER_LABELS: Record<CoachProfile['subscriptionTier'], string> = {
  free: 'Gratis',
  starter: 'Starter',
  pro: 'Pro',
  elite: 'Elite',
  growth: 'Growth',
  scale: 'Scale',
}

export const STATUS_LABELS: Record<string, string> = {
  active: 'Activa',
  trialing: 'En prueba',
  canceled: 'Cancelada',
  expired: 'Vencida',
  past_due: 'Pago pendiente',
  paused: 'Pausada',
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
