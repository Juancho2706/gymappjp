import { supabase } from './supabase'
// F6 (plan 04): el union de tiers vive en @eva/tiers (fuente única web+mobile). NO redeclarar acá.
import type { SubscriptionTier } from '@eva/tiers'

export interface CoachProfile {
  id: string
  fullName: string
  brandName: string
  slug: string
  inviteCode: string | null
  primaryColor: string
  subscriptionStatus: string
  // LEGACY: 'growth'/'scale' fuera de venta (plan 04) pero SE MANTIENEN en el union (@eva/tiers) —
  // parsean el valor crudo de DB de cuentas grandfathered + placeholders team/org_managed. NO borrar.
  subscriptionTier: SubscriptionTier
  currentPeriodEnd: string | null
  trialEndsAt: string | null
  maxClients: number
  hasCoachLogo?: boolean
  logoUrl?: string | null
}

function normalizeSubscriptionTier(raw: string | null | undefined): CoachProfile['subscriptionTier'] {
  const v = String(raw ?? 'starter').toLowerCase()
  // LEGACY: reconoce los 6 valores del CHECK de DB (incluye growth/scale) para no degradar
  // cuentas grandfathered a 'starter'. Fuera de venta, pero vivas en runtime (plan 04).
  if (v === 'free' || v === 'starter' || v === 'pro' || v === 'elite' || v === 'growth' || v === 'scale') return v
  return 'starter'
}

export async function getCoachProfile(): Promise<CoachProfile | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('coaches')
    .select('id, full_name, brand_name, slug, invite_code, primary_color, logo_url, subscription_status, subscription_tier, current_period_end, trial_ends_at, max_clients')
    .eq('id', user.id)
    .maybeSingle()

  if (!data) return null
  return {
    id: data.id,
    fullName: data.full_name,
    brandName: data.brand_name,
    slug: data.slug,
    inviteCode: (data as { invite_code?: string | null }).invite_code ?? null,
    primaryColor: data.primary_color,
    subscriptionStatus: data.subscription_status,
    subscriptionTier: normalizeSubscriptionTier(data.subscription_tier),
    currentPeriodEnd: data.current_period_end,
    trialEndsAt: data.trial_ends_at,
    maxClients: data.max_clients,
    hasCoachLogo: Boolean(data.logo_url?.trim()),
    logoUrl: data.logo_url ?? null,
  }
}
