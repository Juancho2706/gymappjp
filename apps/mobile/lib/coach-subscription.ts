import { supabase } from './supabase'
import { getCoachProfile, type CoachProfile } from './coach'
import { getCoachOrgContext } from './org'
// F6 (plan 04): TIER_LABELS vive en @eva/tiers (fuente única web+mobile). Re-export, no espejo a mano.
import { TIER_LABELS } from '@eva/tiers'

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
